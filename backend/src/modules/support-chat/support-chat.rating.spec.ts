import { describe, expect, it, vi } from 'vitest';

import { AccessScope } from '../../common/scope';
import type { DomainError } from '../../common/errors/domain-error';
import type {
  SupportChatMessageRow,
  SupportChatRepository,
  SupportChatRow,
} from '../../db/repositories/support-chat.repository';
import type { SupportProjectRepository } from '../../db/repositories/support-project.repository';
import type { TicketRow } from '../../db/repositories/ticket.repository';
import type { TicketDetailDto } from '../tickets/dto/ticket.dto';
import { TicketsService } from '../tickets/tickets.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { ChatwootSyncService } from './chatwoot-sync.service';
import { SupportChatService } from './support-chat.service';

/*
 * ให้คะแนนจากห้องแชท — ประกอบ service จริงกับของปลอมในหน่วยความจำ
 *
 * ⚠️ ไม่แตะฐานข้อมูลจริง: การให้คะแนน "ปิดเรื่องจริง" และให้ซ้ำไม่ได้
 *    ยิงทดสอบใส่บัญชีสาธิตที่ทีมใช้อยู่จะปิดเรื่องของเขาไปถาวร
 */

const COMPANY = 7;
const REQUESTER = 20;

function scopeOf(userId: number, permissions: string[] = ['ticket.create']): AccessScope {
  return new AccessScope({
    userId,
    homeCompanyId: COMPANY,
    companyIds: [COMPANY],
    permissions,
    isSuperAdmin: false,
  });
}

function chatRow(over: Partial<SupportChatRow> = {}): SupportChatRow {
  return {
    id: 7,
    companyId: COMPANY,
    companyCode: 'AIDC-TECH',
    requesterId: REQUESTER,
    requesterName: 'demo',
    requesterDepartment: null,
    requesterJobTitle: null,
    assigneeId: 22,
    assigneeName: 'Anon',
    status: 'open',
    ticketId: 32,
    lastMessageAt: new Date('2026-09-22T02:00:00.000Z'),
    lastMessageBy: 22,
    requesterReadAt: null,
    staffReadAt: null,
    closedAt: null,
    closedBy: null,
    createdAt: new Date('2026-09-22T01:00:00.000Z'),
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
    ...over,
  };
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return (error as DomainError).code;
  }
  throw new Error('คาดว่าจะโยน error แต่ไม่โยน');
}

describe('SupportChatService.rate', () => {
  function build(chat: SupportChatRow = chatRow()) {
    let status = 'resolved';
    let score: number | null = null;
    const posted: SupportChatMessageRow[] = [];

    const chats = {
      findById: vi.fn(async () => chat),
      messages: vi.fn(async () => posted),
      ticketBrief: vi.fn(async () => ({
        id: 32,
        ticketNo: 'AIDC-TECH-202609-0012',
        status,
        requesterId: REQUESTER,
        satisfactionScore: score,
        closedAt: status === 'closed' ? new Date() : null,
      })),
      addMessage: vi.fn(async (input: { chatId: number; body: string; isSystem?: boolean }) => {
        const row: SupportChatMessageRow = {
          id: 100 + posted.length,
          chatId: input.chatId,
          senderId: null,
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
    const tickets = {
      rateFromChat: vi.fn(async (_scope: AccessScope, _id: number, value: number) => {
        status = 'closed';
        score = value;
      }),
    };
    const realtime = { chatMessage: vi.fn() };
    const chatwoot = { kick: vi.fn() };

    const service = new SupportChatService(
      chats as unknown as SupportChatRepository,
      realtime as unknown as RealtimeGateway,
      chatwoot as unknown as ChatwootSyncService,
      {} as SupportProjectRepository,
      tickets as unknown as TicketsService,
    );
    return { service, chats, tickets, realtime };
  }

  it('ผู้ถามให้คะแนน → ลงที่เรื่อง ลงข้อความในห้อง แล้วการ์ดหายไป', async () => {
    const { service, tickets, chats, realtime } = build();

    const thread = await service.rate(scopeOf(REQUESTER), 7, { score: 4 });

    expect(tickets.rateFromChat).toHaveBeenCalledWith(expect.anything(), 32, 4);
    expect(chats.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 7, senderId: null, isSystem: true }),
    );
    expect(thread.messages.at(-1)?.body).toContain('★★★★☆ (4 / 5)');
    expect(realtime.chatMessage).toHaveBeenCalledTimes(1);
    expect(thread.ticket).toMatchObject({ status: 'closed', satisfaction_score: 4, can_rate: false });
  });

  it('ห้องที่ยังไม่ได้ยกระดับเป็นเรื่อง → ให้คะแนนไม่ได้', async () => {
    const { service, tickets } = build(chatRow({ ticketId: null }));
    expect(await codeOf(() => service.rate(scopeOf(REQUESTER), 7, { score: 5 }))).toBe('RATING_UNAVAILABLE');
    expect(tickets.rateFromChat).not.toHaveBeenCalled();
  });

  it('เจ้าหน้าที่ในห้องเดียวกัน → ให้แทนผู้ถามไม่ได้', async () => {
    const { service, tickets } = build();
    expect(
      await codeOf(() => service.rate(scopeOf(22, ['ticket.change_status']), 7, { score: 5 })),
    ).toBe('FORBIDDEN');
    expect(tickets.rateFromChat).not.toHaveBeenCalled();
  });

  it('คนนอกห้อง → 404 เหมือนห้องที่ไม่มีอยู่', async () => {
    const { service } = build();
    expect(await codeOf(() => service.rate(scopeOf(99), 7, { score: 5 }))).toBe('NOT_FOUND');
  });

  it('ให้คะแนนที่เรื่องไม่สำเร็จ → ไม่ลงข้อความ "ขอบคุณ" ในห้อง', async () => {
    const { service, tickets, chats } = build();
    tickets.rateFromChat.mockRejectedValueOnce(new Error('boom'));
    await expect(service.rate(scopeOf(REQUESTER), 7, { score: 5 })).rejects.toThrow('boom');
    expect(chats.addMessage).not.toHaveBeenCalled();
  });

  it('การ์ดขึ้นเฉพาะฝั่งผู้ถาม เมื่อเรื่องแก้เสร็จแล้ว', async () => {
    const { service } = build();
    const mine = await service.detail(scopeOf(REQUESTER), 7);
    const staff = await service.detail(scopeOf(22, ['ticket.change_status']), 7);
    expect(mine.ticket?.can_rate).toBe(true);
    expect(staff.ticket?.can_rate).toBe(false);
  });
});

describe('TicketsService.rateFromChat', () => {
  function build(row: Partial<TicketRow>) {
    const repo = {
      findById: vi.fn(async () => ({
        id: 32,
        companyId: COMPANY,
        requesterId: REQUESTER,
        status: 'resolved',
        satisfactionScore: null,
        closedAt: null,
        ...row,
      })),
      recordSatisfaction: vi.fn(async () => true),
    };
    const realtime = { ticketUpdated: vi.fn() };
    const deps: unknown[] = Array.from({ length: 16 }, () => ({}));
    deps[0] = repo;
    deps[10] = realtime;
    const service = new (TicketsService as unknown as new (...args: unknown[]) => TicketsService)(...deps);

    const changeStatus = vi.spyOn(service, 'changeStatus').mockResolvedValue({} as TicketDetailDto);
    vi.spyOn(service, 'detail').mockResolvedValue({
      id: 32,
      ticket_no: 'AIDC-TECH-202609-0012',
      status: 'closed',
      company: { id: COMPANY, code: 'AIDC-TECH' },
      requester: { id: REQUESTER, full_name: 'demo' },
      assignee: null,
      is_security_incident: false,
    } as TicketDetailDto);
    return { service, repo, changeStatus, realtime };
  }

  it('เรื่องรอยืนยัน → ปิดผ่านเส้นยืนยันปิดปกติ พร้อมคะแนน', async () => {
    const { service, changeStatus, repo } = build({ status: 'resolved' });
    await service.rateFromChat(scopeOf(REQUESTER), 32, 5);
    expect(changeStatus).toHaveBeenCalledWith(expect.anything(), 32, { to_status: 'closed', satisfaction_score: 5 });
    expect(repo.recordSatisfaction).not.toHaveBeenCalled();
  });

  it('เรื่องที่ปิดไปแล้ว → เก็บแค่คะแนน ไม่เปลี่ยนสถานะ', async () => {
    const { service, changeStatus, repo, realtime } = build({ status: 'closed', closedAt: new Date() });
    await service.rateFromChat(scopeOf(REQUESTER), 32, 3);
    expect(changeStatus).not.toHaveBeenCalled();
    expect(repo.recordSatisfaction).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 32, score: 3, actorId: REQUESTER }),
    );
    expect(realtime.ticketUpdated).toHaveBeenCalledTimes(1);
  });

  it('กดสองแท็บพร้อมกัน — แท็บที่สองได้ ALREADY_RATED', async () => {
    const { service, repo } = build({ status: 'closed', closedAt: new Date() });
    repo.recordSatisfaction.mockResolvedValueOnce(false);
    expect(await codeOf(() => service.rateFromChat(scopeOf(REQUESTER), 32, 3))).toBe('ALREADY_RATED');
  });

  it('ไม่ใช่ผู้แจ้ง → FORBIDDEN', async () => {
    const { service, changeStatus } = build({ status: 'resolved' });
    expect(await codeOf(() => service.rateFromChat(scopeOf(99), 32, 5))).toBe('FORBIDDEN');
    expect(changeStatus).not.toHaveBeenCalled();
  });

  it('ให้คะแนนแล้ว → ALREADY_RATED', async () => {
    const { service } = build({ status: 'closed', satisfactionScore: 4, closedAt: new Date() });
    expect(await codeOf(() => service.rateFromChat(scopeOf(REQUESTER), 32, 5))).toBe('ALREADY_RATED');
  });
});
