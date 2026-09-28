import { describe, expect, it, vi } from 'vitest';

import { AccessScope } from '../../common/scope';
import type {
  SupportChatMessageRow,
  SupportChatRepository,
  SupportChatRow,
} from '../../db/repositories/support-chat.repository';
import type { SupportProjectRepository } from '../../db/repositories/support-project.repository';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { TicketsService } from '../tickets/tickets.service';
import { CHAT_GREETING } from './chat-greeting';
import type { ChatwootSyncService } from './chatwoot-sync.service';
import { SupportChatService } from './support-chat.service';

/*
 * ข้อความต้อนรับอัตโนมัติ — ประกอบ service จริงกับของปลอมในหน่วยความจำ
 *
 * ⚠️ ไม่แตะฐานข้อมูลจริง: การส่งข้อความจริงจะเปิดห้องแชทค้างไว้ในบัญชีที่ทีมใช้อยู่
 */

const COMPANY = 7;
const REQUESTER = 20;

function scopeOf(userId: number): AccessScope {
  return new AccessScope({
    userId,
    homeCompanyId: COMPANY,
    companyIds: [COMPANY],
    permissions: ['ticket.create'],
    isSuperAdmin: false,
  });
}

function chatRow(): SupportChatRow {
  return {
    id: 7,
    companyId: COMPANY,
    companyCode: 'AIDC-TECH',
    requesterId: REQUESTER,
    requesterName: 'demo',
    requesterDepartment: null,
    requesterJobTitle: null,
    assigneeId: null,
    assigneeName: null,
    status: 'open',
    ticketId: null,
    lastMessageAt: new Date('2026-09-28T02:00:00.000Z'),
    lastMessageBy: REQUESTER,
    requesterReadAt: null,
    staffReadAt: null,
    closedAt: null,
    closedBy: null,
    createdAt: new Date('2026-09-28T02:00:00.000Z'),
    chatwootConversationId: null,
    chatwootContactId: null,
    chatwootCursor: null,
    origin: 'helpdesk',
    projectId: null,
    projectCode: null,
    projectName: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    contactIdentifier: null,
    contactVerified: false,
  };
}

function build(created: boolean, options: { greetingFails?: boolean } = {}) {
  const posted: SupportChatMessageRow[] = [];

  const chats = {
    ensureOpen: vi.fn(async () => ({ id: 7, created })),
    findById: vi.fn(async () => chatRow()),
    messages: vi.fn(async () => posted),
    addMessage: vi.fn(async (input: { chatId: number; body: string; isSystem?: boolean }) => {
      if (options.greetingFails === true && input.isSystem === true) throw new Error('ฐานข้อมูลล่ม');
      const row: SupportChatMessageRow = {
        id: 100 + posted.length,
        chatId: input.chatId,
        senderId: input.isSystem === true ? null : REQUESTER,
        senderName: null,
        externalSenderName: null,
        chatwootMessageId: null,
        body: input.body,
        isSystem: input.isSystem ?? false,
        fromContact: false,
        createdAt: new Date(),
        attachment: null,
      };
      posted.push(row);
      return row;
    }),
  };
  const realtime = { chatMessage: vi.fn() };
  const chatwoot = { kick: vi.fn() };

  const service = new SupportChatService(
    chats as unknown as SupportChatRepository,
    realtime as unknown as RealtimeGateway,
    chatwoot as unknown as ChatwootSyncService,
    {} as SupportProjectRepository,
    {} as TicketsService,
  );
  return { service, chats, realtime, posted };
}

describe('SupportChatService.sendMine — ข้อความต้อนรับอัตโนมัติ', () => {
  it('ห้องใหม่ → ต่อท้ายข้อความแนะนำหลังข้อความแรกของผู้ถาม', async () => {
    const { service, chats, posted } = build(true);

    await service.sendMine(scopeOf(REQUESTER), { body: 'ຄອມພິວເຕີເປີດບໍ່ຂຶ້ນ' });

    expect(chats.addMessage).toHaveBeenCalledTimes(2);
    expect(posted[0]).toMatchObject({ body: 'ຄອມພິວເຕີເປີດບໍ່ຂຶ້ນ', isSystem: false });
    expect(posted[1]).toMatchObject({ body: CHAT_GREETING, isSystem: true, senderId: null });
  });

  it('ไม่ทับ "ข้อความล่าสุด" ของห้อง — กล่องแชทของทีมไอทียังเห็นคำถามของผู้ใช้', async () => {
    const { service, chats } = build(true);

    await service.sendMine(scopeOf(REQUESTER), { body: 'ເຄື່ອງພິມບໍ່ອອກ' });

    expect(chats.addMessage).toHaveBeenLastCalledWith(expect.objectContaining({ quiet: true }));
  });

  it('ห้องเดิมที่ยังเปิดอยู่ → ไม่ทักซ้ำทุกครั้งที่พิมพ์', async () => {
    const { service, chats } = build(false);

    await service.sendMine(scopeOf(REQUESTER), { body: 'ຂອບໃຈ' });

    expect(chats.addMessage).toHaveBeenCalledTimes(1);
  });

  it('ส่งออกเรียลไทม์ทั้งสองข้อความ — ผู้ถามเห็นคำแนะนำโดยไม่ต้องรีเฟรช', async () => {
    const { service, realtime } = build(true);

    await service.sendMine(scopeOf(REQUESTER), { body: 'ສະບາຍດີ' });

    expect(realtime.chatMessage).toHaveBeenCalledTimes(2);
  });

  it('คำตอบของ POST คือข้อความของผู้ใช้เอง ไม่ใช่ข้อความต้อนรับ', async () => {
    const { service } = build(true);

    const result = await service.sendMine(scopeOf(REQUESTER), { body: 'ສະບາຍດີ' });

    expect(result.message.body).toBe('ສະບາຍດີ');
    expect(result.message.is_system).toBe(false);
  });

  it('ทักทายล้มเหลว → ข้อความของผู้ใช้ยังส่งสำเร็จ ไม่ตอบ error', async () => {
    const { service, posted } = build(true, { greetingFails: true });

    const result = await service.sendMine(scopeOf(REQUESTER), { body: 'ສະບາຍດີ' });

    expect(result.message.body).toBe('ສະບາຍດີ');
    expect(posted).toHaveLength(1);
  });
});
