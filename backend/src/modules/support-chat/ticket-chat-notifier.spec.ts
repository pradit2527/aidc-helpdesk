import { describe, expect, it, vi } from 'vitest';

import type {
  SupportChatMessageRow,
  SupportChatRepository,
  SupportChatRow,
} from '../../db/repositories/support-chat.repository';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { ChatwootSyncService } from './chatwoot-sync.service';
import { TicketChatNotifier } from './ticket-chat-notifier.service';

/*
 * ⚠️ ของปลอมทั้งหมด — เส้นทางนี้เขียนข้อความลงห้องแชทจริงและผลักออกไปหาผู้เข้าชม
 *    ผ่าน Chatwoot ที่ทีมใช้งานอยู่ การพิสูจน์ด้วยการยิงของจริงจึงทำไม่ได้
 */

const CHAT: SupportChatRow = {
  id: 5,
  companyId: 7,
  companyCode: 'AIDC-LOG',
  requesterId: null,
  requesterName: null,
  requesterDepartment: null,
  requesterJobTitle: null,
  assigneeId: null,
  assigneeName: null,
  status: 'open',
  ticketId: 1042,
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
  contactEmail: null,
  contactPhone: null,
  contactIdentifier: null,
  contactVerified: false,
};

function build(chat: SupportChatRow | null = CHAT) {
  const added: Parameters<SupportChatRepository['addMessage']>[0][] = [];

  const chats = {
    findByTicketId: vi.fn(async () => chat),
    addMessage: vi.fn(async (input: Parameters<SupportChatRepository['addMessage']>[0]) => {
      added.push(input);
      return {
        id: 77,
        chatId: input.chatId,
        senderId: input.senderId,
        senderName: null,
        externalSenderName: null,
        chatwootMessageId: null,
        body: input.body,
        isSystem: input.isSystem ?? false,
        fromContact: false,
        createdAt: new Date('2026-09-17T03:00:00.000Z'),
        attachment: null,
      } satisfies SupportChatMessageRow;
    }),
  };
  const realtime = { chatMessage: vi.fn() };
  const chatwoot = { kick: vi.fn() };

  const notifier = new TicketChatNotifier(
    chats as unknown as SupportChatRepository,
    realtime as unknown as RealtimeGateway,
    chatwoot as unknown as ChatwootSyncService,
  );

  return { notifier, chats, realtime, chatwoot, added };
}

/** ให้ .catch() ที่ต่อท้ายใน notifier ได้รอบทำงานก่อนตรวจผล */
const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('TicketChatNotifier.ticketStatusChanged', () => {
  it('เขียนข้อความของระบบลงห้อง แล้วผลักเข้ารอบซิงก์', async () => {
    const { notifier, added, realtime, chatwoot } = build();

    notifier.ticketStatusChanged({ ticketId: 1042, from: 'new', to: 'assigned' });
    await settled();

    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      chatId: 5,
      // ไม่ใช่ข้อความของใครคนหนึ่ง — ห้ามไปนับเป็น "คนล่าสุดที่ตอบ"
      senderId: null,
      isSystem: true,
      body: 'ທີມງານຮັບເລື່ອງແລ້ວ',
    });
    // ห้องที่เปิดค้างบนหน้าจอต้องเห็นทันที และผู้เข้าชมได้รับผ่าน Chatwoot
    expect(realtime.chatMessage).toHaveBeenCalledTimes(1);
    expect(chatwoot.kick).toHaveBeenCalledWith(5);
  });

  it('สถานะไม่ได้เปลี่ยนจริง ไม่ยิงข้อความซ้ำใส่ผู้ถาม', async () => {
    // การมอบหมายซ้ำระหว่างทาง: ผู้รับผิดชอบเปลี่ยนมือ แต่สถานะยังเป็น in_progress
    const { notifier, chats } = build();

    notifier.ticketStatusChanged({ ticketId: 1042, from: 'in_progress', to: 'in_progress' });
    await settled();

    expect(chats.findByTicketId).not.toHaveBeenCalled();
  });

  it('เรื่องที่ไม่ได้มาจากแชท ไม่มีห้องให้เขียน', async () => {
    const { notifier, chats, chatwoot } = build(null);

    notifier.ticketStatusChanged({ ticketId: 1042, from: 'new', to: 'assigned' });
    await settled();

    expect(chats.addMessage).not.toHaveBeenCalled();
    expect(chatwoot.kick).not.toHaveBeenCalled();
  });

  it('พักเรื่อง — เหตุผลที่กรอกไว้ติดไปกับข้อความ', async () => {
    const { notifier, added } = build();

    notifier.ticketStatusChanged({
      ticketId: 1042,
      from: 'in_progress',
      to: 'pending_user',
      detail: { reason: 'ລໍຖ້າອາໄຫຼ່ຈາກຜູ້ຈຳໜ່າຍ' },
    });
    await settled();

    expect(added[0]!.body).toBe('ພັກເລື່ອງໄວ້ກ່ອນ: ລໍຖ້າອາໄຫຼ່ຈາກຜູ້ຈຳໜ່າຍ');
  });

  it('แก้ไขเสร็จ — ใช้บันทึกวิธีแก้เป็นเนื้อความ', async () => {
    const { notifier, added } = build();

    notifier.ticketStatusChanged({
      ticketId: 1042,
      from: 'in_progress',
      to: 'resolved',
      detail: { resolutionNote: 'ຕັ້ງລະຫັດຜ່ານໃໝ່ໃຫ້ແລ້ວ' },
    });
    await settled();

    expect(added[0]!.body).toBe('ແກ້ໄຂສຳເລັດແລ້ວ: ຕັ້ງລະຫັດຜ່ານໃໝ່ໃຫ້ແລ້ວ');
  });

  it('ห้องแชทล่ม ไม่ทำให้การเปลี่ยนสถานะของเรื่องล้มตาม', async () => {
    const { notifier, chats } = build();
    chats.findByTicketId.mockRejectedValueOnce(new Error('ฐานข้อมูลล่ม'));

    // เรียกแบบไม่รอผล — ต้องไม่โยนออกมาใส่ผู้เรียกและไม่เป็น unhandled rejection
    expect(() =>
      notifier.ticketStatusChanged({ ticketId: 1042, from: 'new', to: 'assigned' }),
    ).not.toThrow();
    await settled();
  });

  it('สถานะที่ไม่ต้องบอกผู้ถาม ไม่แตะฐานข้อมูลเลย', async () => {
    const { notifier, chats } = build();

    notifier.ticketStatusChanged({ ticketId: 1042, from: 'closed', to: 'new' });
    await settled();

    expect(chats.findByTicketId).not.toHaveBeenCalled();
  });
});
