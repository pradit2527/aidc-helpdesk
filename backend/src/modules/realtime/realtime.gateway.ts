import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import type { AccessScope } from '../../common/scope';
import { ScopeService } from '../../common/scope.service';
import { SupportChatRepository } from '../../db/repositories/support-chat.repository';
import { TicketRepository } from '../../db/repositories/ticket.repository';
import { AuthService, COOKIE } from '../auth/auth.service';

/**
 * ช่องเรียลไทม์ของทั้งระบบ — socket.io ที่ /api/v1/ws
 *
 * ต่อยอดจากต้นแบบแชทใน ticket (ticket-chat.gateway) แล้วรวมแชทช่วยเหลือเข้ามาใน gateway เดียว
 * socket.io หนึ่ง path มีเซิร์ฟเวอร์ได้ตัวเดียว ถ้าแยกสอง gateway บน path เดียวกัน
 * จะไม่รู้ว่า event ไปลงตัวไหน
 *
 * ห้อง (room)
 *   ticket:{id}                คอมเมนต์สาธารณะของ ticket ที่เปิดดูอยู่
 *   user:{id}                  แชทของผู้ใช้คนนั้นเอง
 *   chat-inbox:company:{id}    ทีมไอทีที่ดูแลบริษัทนั้น
 *   chat-inbox:all             super_admin
 *
 * ⚠️ ทุกห้องตัดสินสิทธิ์ด้วยกฎเดียวกับ REST — ข้อความแชทคือข้อมูลส่วนตัวของพนักงาน
 *    ส่งเข้าห้องที่กว้างกว่าที่ REST ยอมให้เห็นไม่ได้
 */

/** สิทธิ์ของทีมไอที — ต้องตรงกับ SupportChatService */
const STAFF_PERMISSION = 'ticket.change_status';

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

export interface ChatMessageTarget {
  chatId: number;
  companyId: number;
  requesterId: number;
}

export type TicketUpdateKind = 'status' | 'assign' | 'priority' | 'comment';

export interface TicketUpdateTarget {
  ticketId: number;
  ticketNo: string;
  status: string;
  companyId: number;
  requesterId: number;
  assigneeId: number | null;
  /**
   * ผู้รับผิดชอบคนก่อน กรณีเพิ่งเปลี่ยนมือ
   *
   * ต้องส่งสัญญาณถึงเขาด้วย มิฉะนั้นคิวงานของคนที่เพิ่งถูกดึงเรื่องออกจากมือ
   * จะยังแสดงเรื่องนั้นค้างอยู่จนกว่าจะถึงรอบ refetch ถัดไป
   */
  previousAssigneeId?: number | null;
  isSecurityIncident: boolean;
  actorId: number;
  kind: TicketUpdateKind;
}

@WebSocketGateway({
  // ต้องอยู่ใต้ /api/v1 เท่านั้น — คุกกี้ aidc_at ตั้ง Path=/api/v1
  // handshake ไป path อื่นจะไม่มีคุกกี้แนบมาเลย เบราว์เซอร์กรองให้เองตาม Path attribute
  path: '/api/v1/ws',
  cors: {
    // dev: พอร์ต Next.js เปลี่ยนได้ตามพอร์ตว่าง · production ต้องตั้ง WS_CORS_ORIGIN เสมอ
    origin:
      process.env.WS_CORS_ORIGIN ??
      (process.env.NODE_ENV === 'production' ? false : /^http:\/\/localhost:\d+$/),
    credentials: true,
  },
})
export class RealtimeGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly scopes: ScopeService,
    private readonly tickets: TicketRepository,
    private readonly chats: SupportChatRepository,
  ) {}

  /*
   * ตรวจคุกกี้ล็อกอินใหม่ทุก event ที่ขอเข้าห้อง ไม่เก็บผลไว้ตั้งแต่ตอนเชื่อมต่อ
   *
   * - ต้นแบบเคยตรวจที่ handleConnection ซึ่งเป็น async แล้วเกิด race — client ขอเข้าห้อง
   *   ทันทีที่ connect ก่อน handleConnection ตรวจเสร็จ จึงเข้าห้องไม่ได้ทั้งที่คุกกี้ถูก
   * - บัญชีที่ถูกปิดหรือถอนบทบาทต้องขอเข้าห้องไม่ได้อีก ถ้าจำผลไว้จะเข้าได้ตลอดอายุ socket
   * scope ถูกจำไว้สั้น ๆ ใน ScopeService อยู่แล้ว การตรวจซ้ำจึงแทบไม่มีต้นทุน
   */
  private async resolveScope(client: Socket): Promise<AccessScope | undefined> {
    const token = parseCookie(client.handshake.headers.cookie, COOKIE.access);
    if (!token) return undefined;
    try {
      const userId = await this.auth.userIdFromAccessToken(token);
      return await this.scopes.forUser(userId);
    } catch {
      return undefined;
    }
  }

  // ── คอมเมนต์ใน ticket (จากต้นแบบ) ──

  @SubscribeMessage('ticket:join')
  async onTicketJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { ticketId: number },
  ): Promise<void> {
    const scope = await this.resolveScope(client);
    if (!scope) {
      client.emit('ticket:error', { message: 'ກະລຸນາເຂົ້າສູ່ລະບົບກ່ອນ' });
      return;
    }

    const ticketId = Number(payload?.ticketId);
    if (!Number.isInteger(ticketId) || ticketId <= 0) return;

    try {
      // ใช้ findById ตัวเดียวกับ REST — ผู้ใช้ที่เห็นเรื่องนี้ไม่ได้จะได้ 404 เหมือนกัน
      await this.tickets.findById(scope, ticketId);
      await client.join(`ticket:${ticketId}`);
    } catch {
      client.emit('ticket:error', { message: 'ບໍ່ພົບເລື່ອງທີ່ຕ້ອງການ ຫຼື ບໍ່ມີສິດເບິ່ງ' });
    }
  }

  @SubscribeMessage('ticket:leave')
  onTicketLeave(@ConnectedSocket() client: Socket, @MessageBody() payload: { ticketId: number }): void {
    const ticketId = Number(payload?.ticketId);
    if (Number.isInteger(ticketId) && ticketId > 0) {
      void client.leave(`ticket:${ticketId}`);
    }
  }

  /** เรียกจาก TicketsService หลังบันทึกคอมเมนต์สาธารณะสำเร็จ — ห้ามส่งคอมเมนต์ภายในมาทางนี้ */
  broadcastComment(ticketId: number, comment: unknown): void {
    this.server?.to(`ticket:${ticketId}`).emit('ticket:comment', comment);
  }

  /**
   * เรื่องเปลี่ยนแล้ว — ให้ทุกหน้าที่เกี่ยวข้องดึงข้อมูลใหม่ทันที ไม่ต้องรอรอบ refetch 60 วินาที
   *
   * ⚠️ ส่งแค่ "สัญญาณ" ไม่ส่งเนื้อหาของเรื่อง — แต่ละหน้าดึงรายละเอียดเองผ่าน REST ที่กรองสิทธิ์แล้ว
   *    สัญญาณจากคอมเมนต์ภายในที่ไปถึงห้องของผู้แจ้งจึงไม่ทำให้เนื้อหาภายในรั่ว
   *
   * ห้องส่วนตัว (ห้องของเรื่อง ผู้แจ้ง ผู้รับผิดชอบ) ได้เลขที่และสถานะไปแสดงแจ้งเตือน
   * ห้องทีมไอทีทั้งบริษัทได้แค่ id ไว้รีเฟรชรายการ
   *
   * ⚠️ เหตุความปลอดภัย (SOP-10) ไม่ส่งเข้าห้องทีมไอทีทั้งบริษัท — คนในห้องนั้นส่วนใหญ่ไม่มีสิทธิ์เห็น
   *    แม้แค่ id ก็ยืนยันว่ามีเหตุอยู่ รายการของคนที่มีสิทธิ์ยังอัปเดตตามรอบ refetch ปกติ
   */
  ticketUpdated(target: TicketUpdateTarget): void {
    if (!this.server) return;

    const previous = target.previousAssigneeId ?? null;
    const personal = [
      `ticket:${target.ticketId}`,
      `user:${target.requesterId}`,
      ...(target.assigneeId !== null ? [`user:${target.assigneeId}`] : []),
      // คนที่เพิ่งถูกดึงเรื่องออกจากมือ — ต้องได้สัญญาณเหมือนกัน (ห้องซ้ำ socket.io ตัดให้เอง)
      ...(previous !== null && previous !== target.assigneeId ? [`user:${previous}`] : []),
    ];
    this.server.to(personal).emit('ticket:updated', {
      ticket_id: target.ticketId,
      ticket_no: target.ticketNo,
      status: target.status,
      requester_id: target.requesterId,
      /*
       * ผู้รับผิดชอบคนปัจจุบัน — หน้าจอเทียบกับ id ของตัวเองแล้วขึ้นข้อความ
       * "คุณได้รับมอบหมายเรื่องนี้" ได้ทันที โดยไม่ต้องยิง REST ก่อนหนึ่งรอบ
       *
       * ⚠️ ส่งเฉพาะห้องส่วนตัว — ห้องทีมไอทีทั้งบริษัทได้แค่ id เหมือนเดิม
       */
      assignee_id: target.assigneeId,
      actor_id: target.actorId,
      kind: target.kind,
    });

    if (!target.isSecurityIncident) {
      this.server
        .to([`chat-inbox:company:${target.companyId}`, 'chat-inbox:all'])
        // คนที่อยู่ทั้งสองกลุ่มได้สัญญาณเดียว ไม่ใช่รีเฟรชซ้ำสองรอบ
        .except(personal)
        .emit('ticket:updated', { ticket_id: target.ticketId, actor_id: target.actorId, kind: target.kind });
    }
  }

  // ── แชทช่วยเหลือ ──

  /**
   * สมัครรับแชท — ผู้ใช้ทุกคนเข้าห้องของตัวเอง ทีมไอทีเข้ากล่องแชทของบริษัทในขอบเขตด้วย
   * client ส่งซ้ำทุกครั้งที่เชื่อมต่อใหม่ เพราะ socket ใหม่ไม่มีห้องติดมา
   */
  @SubscribeMessage('chat:subscribe')
  async onChatSubscribe(@ConnectedSocket() client: Socket): Promise<{ ok: boolean; staff: boolean }> {
    const scope = await this.resolveScope(client);
    if (!scope) {
      client.emit('chat:error', { message: 'ກະລຸນາເຂົ້າສູ່ລະບົບກ່ອນ' });
      return { ok: false, staff: false };
    }

    const rooms = [`user:${scope.userId}`];
    const staff = scope.has(STAFF_PERMISSION);
    if (staff) {
      if (scope.isSuperAdmin) rooms.push('chat-inbox:all');
      else for (const companyId of scope.companyIds) rooms.push(`chat-inbox:company:${companyId}`);
    }

    // ออกจากห้องกล่องแชทเดิมก่อน — ขอบเขตบริษัทอาจแคบลงตั้งแต่สมัครครั้งก่อน
    for (const room of client.rooms) {
      if (room.startsWith('chat-inbox:') && !rooms.includes(room)) void client.leave(room);
    }
    await client.join(rooms);
    return { ok: true, staff };
  }

  /** ข้อความใหม่ในห้องแชท — ส่งถึงเจ้าของห้องและทีมไอทีของบริษัทนั้น */
  chatMessage(target: ChatMessageTarget, message: unknown): void {
    this.server
      ?.to([
        `user:${target.requesterId}`,
        `chat-inbox:company:${target.companyId}`,
        'chat-inbox:all',
      ])
      .emit('chat:message', {
        chat_id: target.chatId,
        company_id: target.companyId,
        requester_id: target.requesterId,
        message,
      });
  }

  /** ใช้ตรวจสิทธิ์ห้องแชทจากชั้นอื่นที่ไม่มี service — ปัจจุบันยังไม่มีผู้เรียก */
  async canSeeChat(scope: AccessScope, chatId: number): Promise<boolean> {
    const row = await this.chats.findById(chatId);
    if (!row) return false;
    return row.requesterId === scope.userId || (scope.has(STAFF_PERMISSION) && scope.inScope(row.companyId));
  }
}
