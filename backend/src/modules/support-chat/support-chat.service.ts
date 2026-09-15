import fs from 'node:fs/promises';

import { Injectable } from '@nestjs/common';

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-error';
import type { AccessScope } from '../../common/scope';
import {
  SupportChatRepository,
  type ChatAttachmentKind,
  type ChatSide,
  type LastMessageRow,
  type StoredChatAttachment,
  type SupportChatMessageRow,
  type SupportChatRow,
} from '../../db/repositories/support-chat.repository';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { chatFilePath, writeChatFile } from './chat-file-store';
import { CHAT_MAX_FILE_BYTES, decodeUploadName, detectChatFile } from './chat-file-type';
import { ChatwootSyncService } from './chatwoot-sync.service';
import {
  SUPPORT_CHAT_MAX_BODY,
  type SendChatMessageDto,
  type SendChatMessageResponseDto,
  type SupportChatSummaryDto,
  type SupportChatThreadDto,
} from './support-chat.dto';
import { toMessageDto } from './support-chat.mapper';

/** ไฟล์จาก multer (memory storage) */
export interface UploadedChatFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/**
 * ทีมไอที = ผู้ที่เปลี่ยนสถานะ ticket ได้ (agent · company_admin · super_admin)
 *
 * ใช้สิทธิ์เดียวกับคิวงาน ไม่ตั้งสิทธิ์ใหม่ — คนที่รับเรื่องในคิวได้คือคนเดียวกับที่ควรตอบแชท
 * และขอบเขตบริษัทก็ตามกฎเดิมทุกประการ ผู้ดูแลบริษัท A ไม่เห็นแชทของพนักงานบริษัท B
 */
const STAFF_PERMISSION = 'ticket.change_status';
const PREVIEW_LENGTH = 140;

/** ป้ายแทนข้อความในรายการแชท เมื่อข้อความล่าสุดเป็นไฟล์อย่างเดียว */
const ATTACHMENT_LABEL: Record<ChatAttachmentKind, string> = {
  image: 'ຮູບພາບ',
  audio: 'ຂໍ້ຄວາມສຽງ',
  file: 'ໄຟລ໌ແນບ',
};

@Injectable()
export class SupportChatService {
  constructor(
    private readonly chats: SupportChatRepository,
    private readonly realtime: RealtimeGateway,
    private readonly chatwoot: ChatwootSyncService,
  ) {}

  /** ห้องแชทของผู้ใช้เอง — null ถ้ายังไม่เคยคุย */
  async mine(scope: AccessScope): Promise<SupportChatThreadDto | null> {
    const row = await this.chats.latestOf(scope.userId);
    return row ? this.thread(row, 'requester') : null;
  }

  /** ผู้ใช้ส่งข้อความหาทีมไอที — ยังไม่มีห้องหรือห้องเดิมปิดไปแล้ว ระบบเปิดห้องใหม่ให้ */
  async sendMine(scope: AccessScope, dto: SendChatMessageDto): Promise<SendChatMessageResponseDto> {
    return this.postAsRequester(scope, cleanBody(dto.body, false), null);
  }

  /** ผู้ใช้ส่งรูป เสียง หรือไฟล์หาทีมไอที พร้อมข้อความประกอบ (ไม่บังคับ) */
  async sendMineFile(
    scope: AccessScope,
    file: UploadedChatFile | undefined,
    body: string | undefined,
  ): Promise<SendChatMessageResponseDto> {
    const text = cleanBody(body ?? '', true);
    const attachment = await storeFile(scope.homeCompanyId, file);
    return this.postAsRequester(scope, text, attachment);
  }

  /** กล่องแชทของทีมไอที — เฉพาะบริษัทในขอบเขต เรียงตามข้อความล่าสุด */
  async inbox(scope: AccessScope, status: 'open' | 'closed'): Promise<SupportChatSummaryDto[]> {
    if (!scope.has(STAFF_PERMISSION)) {
      throw new ForbiddenError('FORBIDDEN', 'ມີແຕ່ທີມໄອທີທີ່ເປີດກ່ອງແຊັດໄດ້');
    }
    const rows = await this.chats.inbox(
      scope.isSuperAdmin ? null : [...scope.companyIds],
      status,
    );
    const last = await this.chats.lastMessages(rows.map((row) => row.id));
    return rows.map((row) => this.summary(row, 'staff', last.get(row.id) ?? null));
  }

  async detail(scope: AccessScope, id: number): Promise<SupportChatThreadDto> {
    const { row, side } = await this.access(scope, id);
    return this.thread(row, side);
  }

  async send(
    scope: AccessScope,
    id: number,
    dto: SendChatMessageDto,
  ): Promise<SendChatMessageResponseDto> {
    const { row, side } = await this.access(scope, id);
    assertOpen(row);
    return this.postToChat(scope, row, side, cleanBody(dto.body, false), null);
  }

  async sendFile(
    scope: AccessScope,
    id: number,
    file: UploadedChatFile | undefined,
    body: string | undefined,
  ): Promise<SendChatMessageResponseDto> {
    const { row, side } = await this.access(scope, id);
    assertOpen(row);
    const text = cleanBody(body ?? '', true);
    const attachment = await storeFile(row.companyId, file);
    return this.postToChat(scope, row, side, text, attachment);
  }

  /**
   * เปิดไฟล์ในแชท — ตรวจสิทธิ์ห้องทุกครั้ง
   *
   * ⚠️ ห้ามให้ไฟล์แชทออกทาง /attachments/{id}/download — ทางนั้นไม่ได้ตรวจว่าผู้ขอเป็นใคร
   */
  async readFile(
    scope: AccessScope,
    chatId: number,
    messageId: number,
  ): Promise<StoredChatAttachment & { buffer: Buffer }> {
    await this.access(scope, chatId);
    const file = await this.chats.findMessageFile(chatId, messageId);
    if (!file) throw new NotFoundError('NOT_FOUND', 'ບໍ່ພົບໄຟລ໌');

    const buffer = await fs.readFile(chatFilePath(file.key)).catch(() => null);
    if (!buffer) {
      throw new NotFoundError('ATTACHMENT_FILE_MISSING', 'ຂໍ້ມູນໄຟລ໌ມີແຕ່ຫາໄຟລ໌ຈິງບໍ່ພົບ');
    }
    return { ...file, buffer };
  }

  async markRead(scope: AccessScope, id: number): Promise<void> {
    const { row, side } = await this.access(scope, id);
    await this.chats.markRead(row.id, side);
  }

  async close(scope: AccessScope, id: number): Promise<SupportChatSummaryDto> {
    const { row, side } = await this.access(scope, id);
    if (side !== 'staff') {
      throw new ForbiddenError('FORBIDDEN', 'ມີແຕ່ທີມໄອທີທີ່ປິດແຊັດໄດ້');
    }

    if (await this.chats.close(row.id, scope.userId)) {
      const message = await this.chats.addMessage({
        chatId: row.id,
        senderId: null,
        body: 'ທີມໄອທີປິດແຊັດນີ້ແລ້ວ — ຖ້າມີບັນຫາໃໝ່ ພິມຂໍ້ຄວາມມາໄດ້ເລີຍ',
        isSystem: true,
        readSide: 'staff',
      });
      // ตัวซิงก์เห็นว่าห้องปิดแล้ว จะปิด (resolve) การสนทนาฝั่ง Chatwoot ตาม
      return this.publish(await this.mustFind(row.id), message, 'staff').chat;
    }

    const current = await this.mustFind(row.id);
    return this.summary(current, 'staff', null);
  }

  private async postAsRequester(
    scope: AccessScope,
    body: string,
    attachment: StoredChatAttachment | null,
  ): Promise<SendChatMessageResponseDto> {
    const chatId = await this.chats.ensureOpen(scope.homeCompanyId, scope.userId);
    const message = await this.saveMessage(
      { chatId, senderId: scope.userId, body, readSide: 'requester' },
      attachment,
    );
    return this.publish(await this.mustFind(chatId), message, 'requester');
  }

  private async postToChat(
    scope: AccessScope,
    row: SupportChatRow,
    side: ChatSide,
    body: string,
    attachment: StoredChatAttachment | null,
  ): Promise<SendChatMessageResponseDto> {
    // เจ้าหน้าที่คนแรกที่ตอบเป็นผู้รับผิดชอบห้อง — คนอื่นยังตอบได้ แต่กล่องแชทบอกว่าใครดูอยู่
    if (side === 'staff' && row.assigneeId === null) {
      await this.chats.assignIfEmpty(row.id, scope.userId);
    }
    const message = await this.saveMessage(
      { chatId: row.id, senderId: scope.userId, body, readSide: side },
      attachment,
    );
    return this.publish(await this.mustFind(row.id), message, side);
  }

  /** บันทึกข้อความ — ถ้าบันทึกไม่สำเร็จ ลบไฟล์ที่เพิ่งเขียนลงดิสก์ทิ้ง ไม่ปล่อยเป็นไฟล์กำพร้า */
  private async saveMessage(
    input: { chatId: number; senderId: number; body: string; readSide: ChatSide },
    attachment: StoredChatAttachment | null,
  ): Promise<SupportChatMessageRow> {
    try {
      return await this.chats.addMessage({ ...input, ...(attachment ? { attachment } : {}) });
    } catch (error) {
      if (attachment) await fs.unlink(chatFilePath(attachment.key)).catch(() => undefined);
      throw error;
    }
  }

  /**
   * ผู้ใช้เข้าห้องนี้ได้ในฐานะอะไร
   *
   * ⚠️ ห้องที่เข้าไม่ได้ตอบ 404 ไม่ใช่ 403 — เหมือนกฎของ ticket (US-07 AC-2)
   *    การตอบ 403 ยืนยันว่ามีห้องหมายเลขนั้นอยู่จริง ซึ่งไล่เดาได้
   */
  private async access(
    scope: AccessScope,
    id: number,
  ): Promise<{ row: SupportChatRow; side: ChatSide }> {
    const row = await this.chats.findById(id);
    if (row && row.requesterId === scope.userId) return { row, side: 'requester' };
    if (row && scope.has(STAFF_PERMISSION) && scope.inScope(row.companyId)) {
      return { row, side: 'staff' };
    }
    throw new NotFoundError('NOT_FOUND', 'ບໍ່ພົບແຊັດນີ້');
  }

  private async mustFind(id: number): Promise<SupportChatRow> {
    const row = await this.chats.findById(id);
    if (!row) throw new NotFoundError('NOT_FOUND', 'ບໍ່ພົບແຊັດນີ້');
    return row;
  }

  /** ส่งข้อความใหม่ออกไปทุกคนที่เกี่ยวข้องแบบเรียลไทม์ ส่งต่อให้ Chatwoot แล้วคืนผลให้ผู้ส่ง */
  private publish(
    row: SupportChatRow,
    message: SupportChatMessageRow,
    side: ChatSide,
  ): SendChatMessageResponseDto {
    const messageDto = toMessageDto(row, message);
    this.realtime.chatMessage(
      { chatId: row.id, companyId: row.companyId, requesterId: row.requesterId },
      messageDto,
    );
    // ไม่รอผล — Chatwoot ช้าหรือล่มต้องไม่ทำให้แชทใน Helpdesk ช้าตาม ข้อความที่ค้างส่งถูกลองใหม่ทุกรอบ
    this.chatwoot.kick(row.id);
    return {
      chat: this.summary(row, side, toLastMessage(row.id, message)),
      message: messageDto,
    };
  }

  private async thread(row: SupportChatRow, side: ChatSide): Promise<SupportChatThreadDto> {
    const messages = await this.chats.messages(row.id);
    const last = messages.at(-1);
    return {
      ...this.summary(row, side, last ? toLastMessage(row.id, last) : null),
      messages: messages.map((message) => toMessageDto(row, message)),
    };
  }

  private summary(
    row: SupportChatRow,
    viewer: ChatSide,
    last: LastMessageRow | null,
  ): SupportChatSummaryDto {
    const lastAt = row.lastMessageAt.getTime();
    const unseenSince = (readAt: Date | null): boolean => readAt === null || readAt.getTime() < lastAt;

    let preview = '';
    if (last) {
      preview = last.body.length > PREVIEW_LENGTH ? `${last.body.slice(0, PREVIEW_LENGTH)}…` : last.body;
      if (!preview && last.attachmentKind) preview = ATTACHMENT_LABEL[last.attachmentKind];
    }

    return {
      id: row.id,
      status: row.status === 'closed' ? 'closed' : 'open',
      company: { id: row.companyId, code: row.companyCode },
      requester: {
        id: row.requesterId,
        full_name: row.requesterName,
        department: row.requesterDepartment,
        job_title: row.requesterJobTitle,
      },
      assignee:
        row.assigneeId !== null ? { id: row.assigneeId, full_name: row.assigneeName ?? '' } : null,
      ticket_id: row.ticketId,
      last_message_at: row.lastMessageAt.toISOString(),
      last_message: last
        ? {
            body: preview,
            from_staff: !last.isSystem && (last.external || last.senderId !== row.requesterId),
            is_system: last.isSystem,
            attachment_kind: last.attachmentKind,
          }
        : null,
      /*
       * ฝั่งผู้ใช้: ใครก็ตามที่ไม่ใช่ตัวเขาเองส่งล่าสุด = ยังไม่ได้อ่าน
       * last_message_by เป็น null เมื่อคนตอบล่าสุดมาจาก Chatwoot (ไม่มีบัญชีใน Helpdesk)
       * ห้องที่มีแต่ข้อความระบบไม่มีจริง — ห้องถูกสร้างพร้อมข้อความแรกของผู้ใช้เสมอ
       */
      unread:
        viewer === 'staff'
          ? row.lastMessageBy === row.requesterId && unseenSince(row.staffReadAt)
          : row.lastMessageBy !== row.requesterId && unseenSince(row.requesterReadAt),
      created_at: row.createdAt.toISOString(),
      closed_at: row.closedAt?.toISOString() ?? null,
    };
  }
}

function toLastMessage(chatId: number, message: SupportChatMessageRow): LastMessageRow {
  return {
    chatId,
    body: message.body,
    senderId: message.senderId,
    isSystem: message.isSystem,
    attachmentKind: message.attachment?.kind ?? null,
    external: message.externalSenderName !== null,
  };
}

function assertOpen(row: SupportChatRow): void {
  if (row.status !== 'open') {
    throw new ConflictError('CHAT_CLOSED', 'ແຊັດນີ້ປິດແລ້ວ');
  }
}

/**
 * ตรวจและเขียนไฟล์ที่ผู้ใช้อัปโหลด
 *
 * ⚠️ ชนิดไฟล์ตรวจจาก magic bytes ไม่ใช่ Content-Type หรือนามสกุลที่ส่งมา
 */
async function storeFile(
  companyId: number,
  file: UploadedChatFile | undefined,
): Promise<StoredChatAttachment> {
  if (!file || file.size === 0) {
    throw new ValidationError('VALIDATION_ERROR', 'ກະລຸນາເລືອກໄຟລ໌', [
      { field: 'file', message: 'ບໍ່ມີໄຟລ໌ໃນຄຳຂໍ' },
    ]);
  }
  if (file.size > CHAT_MAX_FILE_BYTES) {
    throw new ValidationError('FILE_TOO_LARGE', 'ໄຟລ໌ໃຫຍ່ເກີນ 20 MB', [
      { field: 'file', message: 'ຂະໜາດເກີນກຳນົດ' },
    ]);
  }

  const name = decodeUploadName(file.originalname).slice(0, 255);
  const detected = detectChatFile(file.buffer.subarray(0, 32), name);
  if (!detected) {
    throw new ValidationError('UNSUPPORTED_FILE_TYPE', `ໄຟລ໌ "${name}" ເປັນຊະນິດທີ່ບໍ່ຮອງຮັບ`, [
      { field: 'file', message: 'ຮອງຮັບ ຮູບພາບ · ສຽງ · PDF · zip · ຂໍ້ຄວາມ' },
    ]);
  }
  return writeChatFile(companyId, detected, name, file.buffer);
}

/**
 * ตัดช่องว่างหัวท้าย — ข้อความที่มีแต่ช่องว่างผ่าน @MinLength(1) ได้ แต่ไม่ใช่ข้อความจริง
 * @param allowEmpty true เมื่อมีไฟล์มาด้วย — ส่งรูปหรือเสียงอย่างเดียวได้
 */
function cleanBody(raw: string, allowEmpty: boolean): string {
  const body = raw.trim();
  if ((!allowEmpty && body.length === 0) || body.length > SUPPORT_CHAT_MAX_BODY) {
    throw new ValidationError('VALIDATION_ERROR', 'ກະລຸນາພິມຂໍ້ຄວາມ', [
      { field: 'body', message: `ພິມໄດ້ 1–${SUPPORT_CHAT_MAX_BODY} ຕົວອັກສອນ` },
    ]);
  }
  return body;
}
