import { Injectable, Logger } from '@nestjs/common';

import type { TicketStatus } from '../../common/constants';
import { SupportChatRepository } from '../../db/repositories/support-chat.repository';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ChatwootSyncService } from './chatwoot-sync.service';
import { toMessageDto } from './support-chat.mapper';
import { ticketStatusNotice, type TicketStatusNoticeDetail } from './ticket-status-notice';

/**
 * บอกห้องแชทว่าเรื่องที่ผูกไว้ขยับแล้ว
 *
 * แยกเป็น service เล็ก ๆ ของตัวเองแทนการให้ TicketsService เรียก SupportChatService ตรง ๆ
 * เพราะทางกลับกันมีอยู่แล้ว (SupportChatService ยกระดับแชทเป็นเรื่องผ่าน TicketsService)
 * ถ้าสองตัวนั้นอ้างกันไปมา Nest จะฉีด dependency ไม่ได้ทั้งคู่
 *
 * ⚠️ ทุกอย่างในนี้ "ไม่ถูกรอผล" — การเปลี่ยนสถานะของเรื่องต้องไม่ล้มเพราะห้องแชท
 *    ส่งข้อความไม่สำเร็จ และต้องไม่ช้าลงเพราะรอฐานข้อมูลอีกสองรอบ
 */
@Injectable()
export class TicketChatNotifier {
  private readonly logger = new Logger('TicketChatNotifier');

  constructor(
    private readonly chats: SupportChatRepository,
    private readonly realtime: RealtimeGateway,
    private readonly chatwoot: ChatwootSyncService,
  ) {}

  /**
   * เรื่องเปลี่ยนสถานะแล้ว — เรียกได้ทุกครั้งที่สถานะเปลี่ยน "จริง"
   *
   * ⚠️ ผู้เรียกต้องกรองเองว่า from !== to ก่อน มิฉะนั้นการมอบหมายซ้ำ
   *    จะยิงข้อความเดิมใส่ผู้ถามทุกครั้งที่มีใครกดปุ่ม
   */
  ticketStatusChanged(input: {
    ticketId: number;
    from: TicketStatus;
    to: TicketStatus;
    detail?: TicketStatusNoticeDetail;
  }): void {
    if (input.from === input.to) return;

    const body = ticketStatusNotice(input.to, input.detail ?? {});
    if (body === null) return;

    void this.post(input.ticketId, body).catch((error: unknown) => {
      this.logger.warn(
        `แจ้งความคืบหน้าเรื่อง #${input.ticketId} เข้าห้องแชทไม่สำเร็จ: ${describe(error)}`,
      );
    });
  }

  private async post(ticketId: number, body: string): Promise<void> {
    const chat = await this.chats.findByTicketId(ticketId);
    // เรื่องที่ไม่ได้มาจากแชท (ทางปกติของ /tickets/new) ไม่มีห้องให้บอก
    if (!chat) return;

    /*
     * sender_id เป็น null และ is_system เป็น true — ข้อความนี้ไม่ใช่ของใครคนหนึ่ง
     * จึงต้องไม่ไปนับเป็น "คนล่าสุดที่ตอบ" หรือทำให้ธงยังไม่ได้อ่านของฝั่งใดขยับ
     * (addMessage ไม่แตะ last_message_by ให้กับข้อความระบบอยู่แล้ว)
     */
    const message = await this.chats.addMessage({
      chatId: chat.id,
      senderId: null,
      body,
      isSystem: true,
    });

    // ห้องที่เปิดค้างอยู่บนหน้าจอต้องเห็นข้อความทันที เหมือนข้อความอื่นทุกทาง
    this.realtime.chatMessage(
      { chatId: chat.id, companyId: chat.companyId, requesterId: chat.requesterId },
      toMessageDto(chat, message),
    );

    /*
     * ผลักเข้ารอบซิงก์ทันที — ห้องจาก widget ที่ยังต่อกับ Chatwoot อยู่
     * จะส่งข้อความนี้ออกไปถึงผู้เข้าชมเป็น outgoing (ดู isPushableToVisitor)
     * ห้องที่ไม่ได้ซิงก์ kick() จะไม่ทำอะไรเลย
     */
    this.chatwoot.kick(chat.id);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
