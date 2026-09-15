import fs from 'node:fs/promises';

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import {
  SupportChatRepository,
  type StoredChatAttachment,
  type SupportChatMessageRow,
  type SupportChatRow,
} from '../../db/repositories/support-chat.repository';
import { readChatwootSyncConfig } from '../../integrations/chatwoot/chatwoot-sync.config';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { chatFilePath, writeChatFile } from './chat-file-store';
import { CHAT_MAX_FILE_BYTES, detectChatFile } from './chat-file-type';
import { toMessageDto } from './support-chat.mapper';

/** ข้อความจาก Chatwoot Application API — เก็บเฉพาะฟิลด์ที่ใช้ */
interface ChatwootMessage {
  id: number;
  content: string | null;
  /** API ส่งเป็นตัวเลข (0 incoming · 1 outgoing · 2 activity · 3 template) */
  message_type: number | string;
  content_type?: string | null;
  private?: boolean | null;
  sender?: { name?: string | null } | null;
  attachments?: { data_url?: string | null }[] | null;
}

interface ChatwootContactRef {
  id: number;
  identifier?: string | null;
  email?: string | null;
}

const OUTGOING = new Set<number | string>([1, 'outgoing']);

/**
 * ซิงก์แชทสองทาง Helpdesk ↔ Chatwoot
 *
 * - ขาออก: ข้อความของคนใน Helpdesk ถูกส่งเข้าการสนทนาใน Chatwoot (inbox ชนิด API)
 *   ข้อความผู้ใช้เป็น incoming · ข้อความเจ้าหน้าที่ใน Helpdesk เป็น outgoing ขึ้นต้นด้วยชื่อคนตอบ
 * - ขาเข้า: ดึงข้อความ outgoing ใหม่จาก Chatwoot ทุกไม่กี่วินาที แล้วใส่เป็นคำตอบของทีมไอทีใน Helpdesk
 *
 * ⚠️ กันวนซ้ำ — ข้อความที่ส่งออกไปเก็บ chatwoot_message_id ไว้ ตอนดึงกลับจึงข้ามได้
 *    และทุกงานของห้องเดียวกันวิ่งต่อคิว (ส่งเสร็จก่อนค่อยดึง) ไม่งั้นข้อความที่เพิ่งส่ง
 *    อาจถูกดึงกลับเข้ามาเป็นข้อความซ้ำก่อนระบบจะบันทึก id คู่กันทัน
 *
 * ⚠️ Chatwoot ช้าหรือล่มต้องไม่ทำให้แชทใน Helpdesk ใช้ไม่ได้ — ทุกอย่างในนี้ไม่ถูกรอผล
 *    ข้อความที่ส่งไม่สำเร็จค้างไว้แล้วลองใหม่ทุกรอบ (ภายใน 24 ชั่วโมง)
 */
@Injectable()
export class ChatwootSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ChatwootSync');
  private readonly config = readChatwootSyncConfig();
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private readonly queues = new Map<number, Promise<void>>();

  constructor(
    private readonly chats: SupportChatRepository,
    private readonly realtime: RealtimeGateway,
  ) {}

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log('ซิงก์แชทกับ Chatwoot: ปิดอยู่ (ตั้ง CHATWOOT_SYNC_ENABLED และค่าที่จำเป็นใน .env เพื่อเปิด)');
      return;
    }
    this.logger.log(
      `ซิงก์แชทกับ Chatwoot: เปิด → ${this.config.baseUrl} บัญชี ${this.config.accountId} inbox ${this.config.inboxId} · ดึงทุก ${this.config.pollMs} ms`,
    );
    this.timer = setInterval(() => void this.pollAll(), this.config.pollMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** มีข้อความใหม่ในห้องนี้ — ซิงก์ทันทีไม่รอรอบถัดไป */
  kick(chatId: number): void {
    if (this.config.enabled) void this.enqueue(chatId);
  }

  /** งานของห้องเดียวกันต่อคิวกัน ห้องต่างกันทำพร้อมกันได้ */
  private enqueue(chatId: number): Promise<void> {
    const previous = this.queues.get(chatId) ?? Promise.resolve();
    const next: Promise<void> = previous
      .then(() => this.syncChat(chatId))
      .catch((error: unknown) => {
        this.logger.warn(`ซิงก์แชท #${chatId} ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        if (this.queues.get(chatId) === next) this.queues.delete(chatId);
      });
    this.queues.set(chatId, next);
    return next;
  }

  private async pollAll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const ids = await this.chats.syncTargets();
      // ทีละห้อง — ไม่ยิง Chatwoot พร้อมกันหลายร้อยคำขอในรอบเดียว
      for (const id of ids) await this.enqueue(id);
    } catch (error) {
      this.logger.warn(`รอบซิงก์ล้มเหลว: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.polling = false;
    }
  }

  private async syncChat(chatId: number): Promise<void> {
    let row = await this.chats.findById(chatId);
    if (!row) return;

    const pending = await this.chats.pendingOutbound(chatId);
    if (row.chatwootConversationId === null) {
      if (pending.length === 0) return;
      await this.linkConversation(row);
      row = await this.chats.findById(chatId);
      if (!row || row.chatwootConversationId === null) return;
    }
    const conversationId = row.chatwootConversationId;

    for (const message of pending) {
      const chatwootId = await this.push(conversationId, row, message);
      await this.chats.markPushed(message.id, chatwootId);
      await this.chats.advanceCursor(row.id, chatwootId);
    }

    if (row.status === 'closed') {
      await this.request('POST', `/conversations/${conversationId}/toggle_status`, { status: 'resolved' });
      return;
    }

    await this.pull(chatId);
  }

  /** สร้าง (หรือหา) contact ของผู้ใช้ แล้วเปิดการสนทนาใหม่ใน inbox ซิงก์ */
  private async linkConversation(row: SupportChatRow): Promise<void> {
    const who = await this.chats.requesterIdentity(row.requesterId);
    if (!who) return;
    const inboxId = this.config.inboxId;

    let contactId = await this.findContact(who.username, who.email);
    let sourceId: string | null = null;

    if (contactId === null) {
      const created = await this.request<{
        payload?: { contact?: { id?: number }; contact_inbox?: { source_id?: string } };
      }>('POST', '/contacts', {
        name: who.fullName,
        identifier: who.username,
        ...(who.email ? { email: who.email } : {}),
        inbox_id: inboxId,
        custom_attributes: { company: row.companyCode },
      });
      contactId = Number(created.payload?.contact?.id);
      sourceId = created.payload?.contact_inbox?.source_id ?? null;
      if (!Number.isInteger(contactId) || contactId <= 0) throw new Error('สร้าง contact ใน Chatwoot ไม่สำเร็จ');
    }

    if (!sourceId) sourceId = await this.contactSource(contactId, inboxId);

    const conversation = await this.request<{ id?: number }>('POST', '/conversations', {
      source_id: sourceId,
      inbox_id: inboxId,
      contact_id: contactId,
      additional_attributes: { helpdesk_chat_id: row.id, company: row.companyCode },
    });
    if (!conversation.id) throw new Error('สร้างการสนทนาใน Chatwoot ไม่สำเร็จ');

    await this.chats.linkChatwoot(row.id, conversation.id, contactId);
    this.logger.log(`ผูกแชท #${row.id} กับการสนทนา Chatwoot #${conversation.id}`);
  }

  /** contact เดิมที่ widget เคยสร้างไว้ใช้ identifier = ชื่อผู้ใช้ — หาด้วยค่านั้นก่อน แล้วค่อยอีเมล */
  private async findContact(username: string, email: string | null): Promise<number | null> {
    const byIdentifier = await this.request<{ payload?: ChatwootContactRef[] }>(
      'GET',
      `/contacts/search?q=${encodeURIComponent(username)}`,
    );
    const match = byIdentifier.payload?.find((c) => c.identifier === username);
    if (match) return match.id;

    if (email) {
      const byEmail = await this.request<{ payload?: ChatwootContactRef[] }>(
        'GET',
        `/contacts/search?q=${encodeURIComponent(email)}`,
      );
      const found = byEmail.payload?.find((c) => c.email?.toLowerCase() === email.toLowerCase());
      if (found) return found.id;
    }
    return null;
  }

  private async contactSource(contactId: number, inboxId: number): Promise<string> {
    try {
      const created = await this.request<{ source_id?: string; payload?: { source_id?: string } }>(
        'POST',
        `/contacts/${contactId}/contact_inboxes`,
        { inbox_id: inboxId },
      );
      const sourceId = created.source_id ?? created.payload?.source_id;
      if (sourceId) return sourceId;
    } catch {
      // contact นี้ผูกกับ inbox นี้อยู่แล้ว — หา source_id เดิม
    }
    const inboxes = await this.request<{ payload?: { source_id?: string; inbox?: { id?: number } }[] }>(
      'GET',
      `/contacts/${contactId}/contactable_inboxes`,
    );
    const existing = inboxes.payload?.find((item) => item.inbox?.id === inboxId);
    if (!existing?.source_id) throw new Error('หา source_id ของ contact ใน inbox ซิงก์ไม่เจอ');
    return existing.source_id;
  }

  /** ส่งข้อความหนึ่งข้อความไป Chatwoot · คืน id ข้อความฝั่ง Chatwoot */
  private async push(
    conversationId: number,
    row: SupportChatRow,
    message: SupportChatMessageRow,
  ): Promise<number> {
    const fromRequester = message.senderId === row.requesterId;
    const messageType = fromRequester ? 'incoming' : 'outgoing';
    // ข้อความเจ้าหน้าที่ขึ้นในชื่อเจ้าของ token ของ Chatwoot — ใส่ชื่อคนตอบจริงไว้หน้าข้อความ
    const content =
      fromRequester || !message.body ? message.body : `${message.senderName ?? 'IT'} (Helpdesk): ${message.body}`;
    const path = `/conversations/${conversationId}/messages`;

    if (message.attachment) {
      const buffer = await fs.readFile(chatFilePath(message.attachment.key));
      const form = new FormData();
      if (content) form.append('content', content);
      form.append('message_type', messageType);
      form.append('private', 'false');
      form.append(
        'attachments[]',
        new Blob([new Uint8Array(buffer)], { type: message.attachment.mime }),
        message.attachment.name,
      );
      const res = await this.request<{ id?: number }>('POST', path, form);
      if (!res.id) throw new Error('Chatwoot ไม่คืน id ข้อความ');
      return res.id;
    }

    const res = await this.request<{ id?: number }>('POST', path, {
      content,
      message_type: messageType,
      private: false,
    });
    if (!res.id) throw new Error('Chatwoot ไม่คืน id ข้อความ');
    return res.id;
  }

  /** ดึงคำตอบใหม่ของเจ้าหน้าที่ (และบอท) จาก Chatwoot เข้ามาในห้อง */
  private async pull(chatId: number): Promise<void> {
    const row = await this.chats.findById(chatId);
    if (!row || row.chatwootConversationId === null) return;

    const after = row.chatwootCursor;
    const response = await this.request<{ payload?: ChatwootMessage[] }>(
      'GET',
      `/conversations/${row.chatwootConversationId}/messages${after ? `?after=${after}` : ''}`,
    );
    const incoming = [...(response.payload ?? [])].sort((a, b) => a.id - b.id);

    let cursor = after ?? 0;
    for (const cw of incoming) {
      cursor = Math.max(cursor, cw.id);
      // เอาเฉพาะคำตอบที่ผู้ใช้ควรเห็น: outgoing ไม่ใช่โน้ตส่วนตัว และเป็นข้อความธรรมดา (ไม่ใช่ CSAT/ฟอร์ม)
      if (!OUTGOING.has(cw.message_type) || cw.private) continue;
      if (cw.content_type && cw.content_type !== 'text') continue;
      if (await this.chats.hasChatwootMessage(cw.id)) continue;

      const attachment = await this.importAttachment(row.companyId, cw);
      const body = (cw.content ?? '').trim().slice(0, 4000);
      if (!body && !attachment) continue;

      const message = await this.chats.addMessage({
        chatId: row.id,
        senderId: null,
        body,
        externalSenderName: (cw.sender?.name ?? 'Chatwoot').slice(0, 150),
        chatwootMessageId: cw.id,
        ...(attachment ? { attachment } : {}),
      });
      this.realtime.chatMessage(
        { chatId: row.id, companyId: row.companyId, requesterId: row.requesterId },
        toMessageDto(row, message),
      );
    }

    if (cursor > (after ?? 0)) await this.chats.advanceCursor(row.id, cursor);
  }

  /**
   * ดาวน์โหลดไฟล์แนบของข้อความ Chatwoot มาเก็บในที่เก็บของแชท (ไฟล์แรกของข้อความ)
   *
   * ⚠️ ดาวน์โหลดเฉพาะจาก host ของ Chatwoot ที่ตั้งไว้ — URL มาจากข้อมูลภายนอก
   *    ถ้าเชื่อทุก URL backend จะถูกใช้เป็นทางยิงเข้าเครือข่ายภายในได้ (SSRF)
   */
  private async importAttachment(companyId: number, cw: ChatwootMessage): Promise<StoredChatAttachment | null> {
    const first = cw.attachments?.find((item) => item.data_url);
    if (!first?.data_url) return null;

    try {
      const url = new URL(first.data_url, this.config.baseUrl);
      if (!this.config.fileHosts.includes(url.host)) {
        this.logger.warn(`ข้ามไฟล์แนบจาก host ที่ไม่ได้อนุญาต: ${url.host} (เพิ่มใน CHATWOOT_FILE_HOSTS)`);
        return null;
      }
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`ดาวน์โหลดได้ ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0 || buffer.length > CHAT_MAX_FILE_BYTES) return null;

      const name = decodeURIComponent(url.pathname.split('/').pop() ?? 'file');
      const detected = detectChatFile(buffer.subarray(0, 32), name);
      if (!detected) return null;
      return await writeChatFile(companyId, detected, name, buffer);
    } catch (error) {
      this.logger.warn(`นำเข้าไฟล์แนบจาก Chatwoot ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async request<T = Record<string, unknown>>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const isForm = body instanceof FormData;
    const init: RequestInit = {
      method,
      headers: {
        /*
         * ⚠️ token อยู่ใน header เท่านั้น ห้ามพิมพ์ลง log
         * ต้องสะกดด้วยขีดกลาง — nginx หน้า Chatwoot ทิ้ง header ที่มีขีดล่างเงียบ ๆ (underscores_in_headers off)
         * แล้ว Chatwoot ตอบ 401 ทั้งที่ token ถูก · Rails อ่าน api-access-token เป็นคีย์เดียวกันอยู่แล้ว
         */
        'api-access-token': this.config.token,
        Accept: 'application/json',
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    };
    if (body !== undefined) init.body = isForm ? (body as FormData) : JSON.stringify(body);

    const res = await fetch(`${this.config.baseUrl}/api/v1/accounts/${this.config.accountId}${path}`, init);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Chatwoot ${method} ${path.split('?')[0]} → ${res.status} ${text.slice(0, 160)}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }
}
