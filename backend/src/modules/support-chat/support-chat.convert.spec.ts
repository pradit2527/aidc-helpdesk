import { describe, expect, it, vi } from 'vitest';

import { AccessScope } from '../../common/scope';
import type { DomainError } from '../../common/errors/domain-error';
import type {
  SupportChatMessageRow,
  SupportChatRow,
} from '../../db/repositories/support-chat.repository';
import type { SupportChatRepository } from '../../db/repositories/support-chat.repository';
import type { SupportProjectRepository } from '../../db/repositories/support-project.repository';
import type { CreateTicketDto, TicketDetailDto } from '../tickets/dto/ticket.dto';
import type { TicketsService } from '../tickets/tickets.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { ChatwootSyncService } from './chatwoot-sync.service';
import { SupportChatService } from './support-chat.service';

/*
 * เทสต์ระดับ "ประกอบของจริง" ของการยกระดับแชทเป็นเรื่องแจ้ง
 *
 * ⚠️ ไม่มีอะไรในไฟล์นี้แตะฐานข้อมูลหรือ Chatwoot ของจริง — ทุกตัวเป็นของปลอมในหน่วยความจำ
 *    เส้นทางนี้ "เขียนของจริง" ทั้งเส้น (สร้าง ticket · ผูกห้อง · ส่งข้อความออกไปหาผู้เข้าชม)
 *    การพิสูจน์ด้วยการยิงใส่ระบบที่ทีมใช้งานอยู่จึงทำไม่ได้
 */

const STAFF_PERMISSION = 'ticket.change_status';
const COMPANY = 7;

function staffScope(userId = 22): AccessScope {
  return new AccessScope({
    userId,
    homeCompanyId: COMPANY,
    companyIds: [COMPANY],
    permissions: [STAFF_PERMISSION, 'ticket.create', 'ticket.create_for_other'],
    isSuperAdmin: false,
  });
}

function endUserScope(userId = 55): AccessScope {
  return new AccessScope({
    userId,
    homeCompanyId: COMPANY,
    companyIds: [COMPANY],
    permissions: ['ticket.create'],
    isSuperAdmin: false,
  });
}

function chatRow(over: Partial<SupportChatRow> = {}): SupportChatRow {
  return {
    id: 5,
    companyId: COMPANY,
    companyCode: 'AIDC-LOG',
    requesterId: null,
    requesterName: null,
    requesterDepartment: null,
    requesterJobTitle: null,
    assigneeId: null,
    assigneeName: null,
    status: 'open',
    ticketId: null,
    lastMessageAt: new Date('2026-09-17T02:35:00.000Z'),
    lastMessageBy: null,
    requesterReadAt: null,
    staffReadAt: null,
    closedAt: null,
    closedBy: null,
    createdAt: new Date('2026-09-17T02:30:00.000Z'),
    chatwootConversationId: 41,
    chatwootContactId: 3,
    chatwootCursor: null,
    origin: 'widget',
    projectId: 1,
    projectCode: 'ILP',
    projectName: 'ILP',
    contactName: 'ນາງ ສົມໃຈ',
    contactEmail: 'somjai@example.com',
    contactPhone: '+8562055550000',
    contactIdentifier: null,
    contactVerified: false,
    ...over,
  };
}

function messageRow(over: Partial<SupportChatMessageRow> = {}): SupportChatMessageRow {
  return {
    id: 1,
    chatId: 5,
    senderId: null,
    senderName: null,
    externalSenderName: 'ນາງ ສົມໃຈ',
    chatwootMessageId: 900,
    body: 'ເຂົ້າລະບົບ ILP ບໍ່ໄດ້',
    isSystem: false,
    fromContact: true,
    createdAt: new Date('2026-09-17T02:30:00.000Z'),
    attachment: null,
    ...over,
  };
}

function ticketDetail(over: Partial<TicketDetailDto> = {}): TicketDetailDto {
  return {
    id: 1042,
    ticket_no: 'AIDC-LOG-202609-0042',
    ticket_type: 'incident',
    subject: 'ເຂົ້າລະບົບ ILP ບໍ່ໄດ້',
    status: 'new',
    pending_reason: null,
    priority: 'P3',
    support_tier: 1,
    company: { id: COMPANY, code: 'AIDC-LOG' },
    department: null,
    category: { id: 79, name_th: 'ບັນຊີຜູ້ໃຊ້' },
    requester: { id: 22, full_name: 'ສົມສັກ ວົງສາ' },
    assignee: null,
    sla: {
      clock_mode: 'business_hours',
      status: 'on_track',
      remaining_unit: 'business_minutes',
      is_response_breached: false,
      is_resolution_breached: false,
      pending_duration_minutes: 0,
    },
    reopen_count: 0,
    comment_count: 0,
    attachment_count: 0,
    closed_at: null,
    satisfaction_score: null,
    related_ticket: null,
    catalog_item: null,
    requester_tickets: [],
    created_at: '2026-09-17T02:40:00.000Z',
    updated_at: '2026-09-17T02:40:00.000Z',
    description: '',
    impact: 'individual',
    urgency: 'medium',
    channel: 'portal',
    resolved_at: null,
    resolution_note: null,
    workaround_note: null,
    vendor_ref: null,
    is_major_incident: false,
    is_security_incident: false,
    can: {} as TicketDetailDto['can'],
    available_transitions: [],
    comments: [],
    history: [],
    checklist: [],
    approvals: [],
    ...over,
  };
}

/** ประกอบ service จริงกับของปลอมทั้งชุด — คืนตัวปลอมมาให้ตรวจด้วย */
function build(options: {
  chat?: SupportChatRow;
  messages?: SupportChatMessageRow[];
  projectDefaultCategoryId?: number | null;
  linkTicket?: boolean;
} = {}) {
  const chat = options.chat ?? chatRow();

  const chats = {
    findById: vi.fn(async () => chat),
    messages: vi.fn(async () => options.messages ?? [messageRow()]),
    linkTicket: vi.fn(async () => options.linkTicket ?? true),
  };
  const projects = {
    byId: vi.fn(async () => ({
      id: 1,
      code: 'ILP',
      name: 'ILP',
      defaultCategoryId:
        options.projectDefaultCategoryId === undefined ? 79 : options.projectDefaultCategoryId,
      companyId: COMPANY,
    })),
  };
  /** ประกาศพารามิเตอร์ไว้ด้วย เพื่อให้ตรวจ dto ที่ถูกส่งเข้ามาได้แบบมีชนิด */
  const tickets = {
    create: vi.fn(async (_scope: AccessScope, _dto: CreateTicketDto) => ticketDetail()),
  };
  const realtime = {};
  const chatwoot = {};

  const service = new SupportChatService(
    chats as unknown as SupportChatRepository,
    realtime as unknown as RealtimeGateway,
    chatwoot as unknown as ChatwootSyncService,
    projects as unknown as SupportProjectRepository,
    tickets as unknown as TicketsService,
  );

  return { service, chats, projects, tickets };
}

/** อ่านรหัสของ DomainError ที่ถูกโยนออกมา */
async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return (error as DomainError).code;
  }
  throw new Error('คาดว่าจะโยน error แต่ไม่โยน');
}

describe('SupportChatService.convertToTicket', () => {
  it('สร้างเรื่องจากบทสนทนา แล้วผูกห้องกับเรื่องนั้นสองทาง', async () => {
    const { service, tickets, chats } = build();

    const result = await service.convertToTicket(staffScope(), 5, {
      subject: 'ເຂົ້າລະບົບ ILP ບໍ່ໄດ້',
    });

    expect(tickets.create).toHaveBeenCalledTimes(1);
    const input = tickets.create.mock.calls[0]![1];
    expect(input.company_id).toBe(COMPANY);
    // โครงการของห้องติดไปกับเรื่อง — ตัวกรอง project_id ของรายงานอ่านจากค่านี้
    expect(input.project_id).toBe(1);
    expect(input.category_id).toBe(79);
    expect(input.impact).toBe('individual');
    expect(input.urgency).toBe('medium');

    expect(chats.linkTicket).toHaveBeenCalledWith(5, 1042);
    expect(result.ticket.id).toBe(1042);
    expect(result.ticket.ticket_no).toBe('AIDC-LOG-202609-0042');
  });

  it('ห้องจาก widget ที่ยังไม่รู้ว่าเป็นใคร — เจ้าหน้าที่ที่กดเป็นผู้แจ้ง ไม่ยืมบัญชีใคร', async () => {
    const { service, tickets } = build();

    const result = await service.convertToTicket(staffScope(22), 5, { subject: 'ຫົວຂໍ້ທົດສອບ' });

    expect(tickets.create.mock.calls[0]![1].requester_id).toBe(22);
    // ตัวตนของคนที่ถามจริง ๆ อยู่ในคำตอบ ไม่ได้ถูกเขียนลงแถวของ ticket
    expect(result.contact_snapshot).toEqual({
      name: 'ນາງ ສົມໃຈ',
      email: 'somjai@example.com',
      phone: '+8562055550000',
    });
  });

  it('ห้องที่จับคู่กับบัญชีจริงแล้ว ใช้บัญชีนั้นเป็นผู้แจ้ง', async () => {
    const { service, tickets } = build({ chat: chatRow({ requesterId: 55 }) });

    await service.convertToTicket(staffScope(22), 5, { subject: 'ຫົວຂໍ້ທົດສອບ' });

    expect(tickets.create.mock.calls[0]![1].requester_id).toBe(55);
  });

  it('ผู้เข้าชมที่ไม่ได้ฝากอะไรไว้เลย ได้ null ไม่ใช่ก้อนที่ว่างทั้งสามช่อง', async () => {
    // หน้าจอตัดสินด้วยเงื่อนไขเดียวว่ามีตัวตนให้แสดงไหม ไม่ต้องไล่เช็คทีละช่อง
    const { service } = build({
      chat: chatRow({ contactName: null, contactEmail: null, contactPhone: null }),
    });

    const result = await service.convertToTicket(staffScope(), 5, { subject: 'ຫົວຂໍ້ທົດສອບ' });

    expect(result.contact_snapshot).toBeNull();
  });

  it('ฝากไว้บางช่อง ยังได้ก้อนนั้นมาครบ', async () => {
    const { service } = build({
      chat: chatRow({ contactName: null, contactEmail: 'somjai@example.com', contactPhone: null }),
    });

    const result = await service.convertToTicket(staffScope(), 5, { subject: 'ຫົວຂໍ້ທົດສອບ' });

    expect(result.contact_snapshot).toEqual({
      name: null,
      email: 'somjai@example.com',
      phone: null,
    });
  });

  it('ห้องของพนักงาน ไม่มี contact_snapshot', async () => {
    const { service } = build({
      chat: chatRow({ origin: 'helpdesk', requesterId: 55, projectId: null }),
    });

    // ห้องที่ไม่มีโครงการก็ไม่มีหมวดหมู่ตั้งต้น — เจ้าหน้าที่ต้องเลือกเอง
    const result = await service.convertToTicket(staffScope(), 5, {
      subject: 'ຫົວຂໍ້ທົດສອບ',
      category_id: 79,
    });

    expect(result.contact_snapshot).toBeNull();
  });

  it('ไม่ส่งรายละเอียดมา ระบบถอดบทสนทนาให้ พร้อมเวลาและป้ายผู้พูด', async () => {
    const { service, tickets } = build();

    await service.convertToTicket(staffScope(), 5, { subject: 'ຫົວຂໍ້ທົດສອບ' });

    const description = String(tickets.create.mock.calls[0]![1].description);
    expect(description).toContain('ຜູ້ເຂົ້າຊົມ');
    expect(description).toContain('ເຂົ້າລະບົບ ILP ບໍ່ໄດ້');
    expect(description).toContain('17/09/2026');
  });

  it('ส่งรายละเอียดมาเอง ระบบไม่ไปอ่านบทสนทนาเลย', async () => {
    const { service, tickets, chats } = build();

    await service.convertToTicket(staffScope(), 5, {
      subject: 'ຫົວຂໍ້ທົດສອບ',
      description: 'ຜູ້ໃຊ້ລືມລະຫັດຜ່ານ',
    });

    expect(chats.messages).not.toHaveBeenCalled();
    expect(tickets.create.mock.calls[0]![1].description).toBe(
      'ຜູ້ໃຊ້ລືມລະຫັດຜ່ານ',
    );
  });

  it('หมวดหมู่ที่ส่งมาชนะค่าตั้งต้นของโครงการ', async () => {
    const { service, tickets } = build({ projectDefaultCategoryId: 79 });

    await service.convertToTicket(staffScope(), 5, { subject: 'ຫົວຂໍ້ທົດສອບ', category_id: 12 });

    expect(tickets.create.mock.calls[0]![1].category_id).toBe(12);
  });

  it('ไม่มีหมวดหมู่ทั้งสองทาง ตอบ 422 และไม่สร้างเรื่องทิ้งไว้', async () => {
    const { service, tickets } = build({ projectDefaultCategoryId: null });

    expect(
      await codeOf(() => service.convertToTicket(staffScope(), 5, { subject: 'ຫົວຂໍ້ທົດສອບ' })),
    ).toBe('VALIDATION_ERROR');
    expect(tickets.create).not.toHaveBeenCalled();
  });

  it('ห้องที่ผูกกับเรื่องแล้ว ตอบ 409 โดยไม่สร้างเรื่องซ้ำ', async () => {
    const { service, tickets } = build({ chat: chatRow({ ticketId: 999 }) });

    expect(
      await codeOf(() => service.convertToTicket(staffScope(), 5, { subject: 'ຫົວຂໍ້ທົດສອບ' })),
    ).toBe('CHAT_ALREADY_LINKED');
    expect(tickets.create).not.toHaveBeenCalled();
  });

  it('สองแท็บกดพร้อมกัน คนที่ผูกไม่ทันได้ 409 ไม่ใช่เขียนทับเรื่องแรก', async () => {
    const { service, chats } = build({ linkTicket: false });

    expect(
      await codeOf(() => service.convertToTicket(staffScope(), 5, { subject: 'ຫົວຂໍ້ທົດສອບ' })),
    ).toBe('CHAT_ALREADY_LINKED');
    expect(chats.linkTicket).toHaveBeenCalledTimes(1);
  });

  it('ผู้ที่ไม่ใช่ทีมไอที เข้าไม่ถึงห้องเลย จึงได้ 404 ไม่ใช่ 403', async () => {
    // ห้องจาก widget ไม่มีฝั่ง "ผู้ถาม" ใน Helpdesk — ผู้ใช้ทั่วไปจึงไม่เห็นห้องนี้
    const { service, tickets } = build();

    expect(
      await codeOf(() => service.convertToTicket(endUserScope(), 5, { subject: 'ຫົວຂໍ້ທົດສອບ' })),
    ).toBe('NOT_FOUND');
    expect(tickets.create).not.toHaveBeenCalled();
  });

  it('เจ้าของห้องที่ไม่ใช่ทีมไอที ยกระดับเองไม่ได้', async () => {
    // ห้องของพนักงานคนนี้เอง — เข้าถึงได้ในฐานะผู้ถาม แต่สร้างเรื่องจากมันไม่ได้
    const { service, tickets } = build({
      chat: chatRow({ origin: 'helpdesk', requesterId: 55, projectId: null }),
    });

    expect(
      await codeOf(() => service.convertToTicket(endUserScope(55), 5, { subject: 'ຫົວຂໍ້ທົດສອບ' })),
    ).toBe('FORBIDDEN');
    expect(tickets.create).not.toHaveBeenCalled();
  });

  it('ห้องของบริษัทนอกขอบเขต ได้ 404 ไม่ใช่ 403', async () => {
    const { service } = build({ chat: chatRow({ companyId: 99 }) });

    expect(
      await codeOf(() => service.convertToTicket(staffScope(), 5, { subject: 'ຫົວຂໍ້ທົດສອບ' })),
    ).toBe('NOT_FOUND');
  });

  it('ห้องที่ไม่มีโครงการ ไม่ส่ง project_id ไปกับเรื่อง', async () => {
    const { service, tickets } = build({
      chat: chatRow({ origin: 'helpdesk', requesterId: 55, projectId: null }),
    });

    await service.convertToTicket(staffScope(), 5, {
      subject: 'ຫົວຂໍ້ທົດສອບ',
      category_id: 79,
    });

    expect(tickets.create.mock.calls[0]![1].project_id).toBeUndefined();
  });

  it('คำตอบมีเฉพาะฟิลด์ของแถวในรายการเรื่อง ไม่มีคอมเมนต์หรือบล็อก can ติดไปด้วย', async () => {
    const { service } = build();

    const result = await service.convertToTicket(staffScope(), 5, { subject: 'ຫົວຂໍ້ທົດສອບ' });

    expect(result.ticket).not.toHaveProperty('comments');
    expect(result.ticket).not.toHaveProperty('can');
    expect(result.ticket).not.toHaveProperty('available_transitions');
    expect(result.ticket).not.toHaveProperty('description');
  });
});
