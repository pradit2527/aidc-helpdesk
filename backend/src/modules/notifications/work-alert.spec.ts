import { describe, expect, it, vi } from 'vitest';

import { NOTIFICATION_EVENT, type NotificationProducer } from './notification-producer.service';
import { WorkAlertService } from './work-alert.service';

/*
 * ใครควรได้ยินอะไร — กฎทั้งหมดของการแจ้งเตือนงานประจำวัน
 *
 * ⚠️ ข้อที่สำคัญที่สุดในไฟล์นี้คือ "คอมเมนต์ภายในต้องไม่ถึงผู้แจ้ง"
 *    ข้อความแจ้งเตือนพาหัวข้อเรื่องติดไปด้วย ถ้ากฎนี้พัง ผู้แจ้งจะได้รับสัญญาณ
 *    ของบันทึกภายในทีมผ่านช่องทางที่ไม่มีใครตรวจ — เป็นการรั่วที่เงียบที่สุด
 */

const COMPANY = 7;
const REQUESTER = 20;
const ASSIGNEE = 31;
const OTHER_STAFF = 32;
const QUEUE = [ASSIGNEE, OTHER_STAFF, 33];

function build(workers: number[] = QUEUE) {
  const sent: { event: string; userIds: readonly number[]; title: string; renotify?: boolean }[] = [];
  const producer = {
    notify: vi.fn(async (draft: Parameters<NotificationProducer['notify']>[0]) => {
      sent.push({
        event: draft.eventType,
        userIds: draft.userIds,
        title: draft.title,
        ...(draft.renotifyIfRead === undefined ? {} : { renotify: draft.renotifyIfRead }),
      });
      return draft.userIds.length;
    }),
    usersWithPermission: vi.fn(async () => workers),
  };
  const service = new WorkAlertService(producer as unknown as NotificationProducer);
  return { service, producer, sent };
}

const ticket = { ticketId: 5, ticketNo: 'AIDC-TECH-202609-0042', subject: 'ເຂົ້າລະບົບ SAP ບໍ່ໄດ້' };

describe('WorkAlertService.ticketOpened — มีเรื่องใหม่เข้าคิว', () => {
  it('บอกทุกคนที่รับงานได้ ยกเว้นคนที่เพิ่งกดแจ้งเอง', async () => {
    const { service, sent } = build();

    await service.ticketOpened({ ...ticket, companyId: COMPANY, priority: 'P3', actorId: OTHER_STAFF });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.event).toBe(NOTIFICATION_EVENT.ticketCreated);
    expect(sent[0]?.userIds).toEqual([ASSIGNEE, 33]);
  });

  it('ระดับความสำคัญอยู่ในหัวข้อ — คนอ่านกระดิ่งต้องเรียงลำดับงานได้โดยไม่ต้องเปิดดู', async () => {
    const { service, sent } = build();

    await service.ticketOpened({ ...ticket, companyId: COMPANY, priority: 'P1', actorId: REQUESTER });

    expect(sent[0]?.title).toContain('[P1]');
    expect(sent[0]?.title).toContain(ticket.ticketNo);
  });

  it('ไม่มีใครในบริษัทนั้นรับงานได้ → ไม่ส่ง แต่ต้องมีร่องรอยใน log', async () => {
    const { service, producer } = build([]);

    await service.ticketOpened({ ...ticket, companyId: 99, priority: 'P3', actorId: REQUESTER });

    expect(producer.notify).not.toHaveBeenCalled();
  });
});

describe('WorkAlertService.ticketAssigned — เรื่องเป็นของคุณแล้ว', () => {
  it('บอกคนที่ได้รับงาน', async () => {
    const { service, sent } = build();

    await service.ticketAssigned({ ...ticket, assigneeId: ASSIGNEE, actorId: OTHER_STAFF });

    expect(sent[0]?.event).toBe(NOTIFICATION_EVENT.ticketAssigned);
    expect(sent[0]?.userIds).toEqual([ASSIGNEE]);
  });

  it('รับเรื่องเอง → เงียบ ไม่ต้องแจ้งคนที่เพิ่งกดเอง', async () => {
    const { service, producer } = build();

    await service.ticketAssigned({ ...ticket, assigneeId: ASSIGNEE, actorId: ASSIGNEE });

    expect(producer.notify).not.toHaveBeenCalled();
  });

  it('ถอดผู้รับผิดชอบออก (ไม่มีคนใหม่) → ไม่มีใครต้องรู้', async () => {
    const { service, producer } = build();

    await service.ticketAssigned({ ...ticket, assigneeId: null, actorId: OTHER_STAFF });

    expect(producer.notify).not.toHaveBeenCalled();
  });

  it('ปลุกซ้ำได้ถ้าข่าวของวันนี้ถูกอ่านไปแล้ว — ถูกดึงไปแล้วมอบกลับมาคือข่าวใหม่', async () => {
    const { service, sent } = build();

    await service.ticketAssigned({ ...ticket, assigneeId: ASSIGNEE, actorId: OTHER_STAFF });

    expect(sent[0]?.renotify).toBe(true);
  });
});

describe('WorkAlertService.ticketReplied — มีคนตอบกลับ', () => {
  const base = { ...ticket, companyId: COMPANY, requesterId: REQUESTER };

  it('ผู้แจ้งตอบ → บอกผู้รับผิดชอบคนเดียว', async () => {
    const { service, sent } = build();

    await service.ticketReplied({ ...base, assigneeId: ASSIGNEE, authorId: REQUESTER, isInternal: false });

    expect(sent[0]?.userIds).toEqual([ASSIGNEE]);
    expect(sent[0]?.title).toContain('ຜູ້ແຈ້ງຕອບກັບມາ');
  });

  it('ผู้แจ้งตอบแต่ยังไม่มีใครรับเรื่อง → ปลุกทั้งคิว', async () => {
    const { service, sent } = build();

    await service.ticketReplied({ ...base, assigneeId: null, authorId: REQUESTER, isInternal: false });

    expect(sent[0]?.userIds).toEqual(QUEUE);
  });

  it('เจ้าหน้าที่ตอบแบบสาธารณะ → บอกผู้แจ้ง', async () => {
    const { service, sent } = build();

    await service.ticketReplied({ ...base, assigneeId: ASSIGNEE, authorId: ASSIGNEE, isInternal: false });

    expect(sent[0]?.userIds).toEqual([REQUESTER]);
    expect(sent[0]?.title).toContain('ທີມໄອທີຕອບກັບແລ້ວ');
  });

  it('⚠️ คอมเมนต์ภายใน → ผู้แจ้งต้องไม่ได้รับเด็ดขาด', async () => {
    const { service, sent } = build();

    await service.ticketReplied({ ...base, assigneeId: ASSIGNEE, authorId: OTHER_STAFF, isInternal: true });

    expect(sent[0]?.userIds).not.toContain(REQUESTER);
    expect(sent[0]?.userIds).toEqual([ASSIGNEE]);
  });

  it('คอมเมนต์ภายในที่ผู้รับผิดชอบเขียนเอง → ไม่มีใครต้องรู้', async () => {
    const { service, producer } = build();

    await service.ticketReplied({ ...base, assigneeId: ASSIGNEE, authorId: ASSIGNEE, isInternal: true });

    expect(producer.notify).not.toHaveBeenCalled();
  });

  it('ผู้แจ้งเป็นเจ้าหน้าที่เอง (แจ้งเรื่องของตัวเอง) → ไม่ส่งกลับหาตัวเอง', async () => {
    const { service, producer } = build();

    await service.ticketReplied({
      ...base,
      requesterId: ASSIGNEE,
      assigneeId: ASSIGNEE,
      authorId: ASSIGNEE,
      isInternal: false,
    });

    expect(producer.notify).not.toHaveBeenCalled();
  });

  it('การตอบกลับปลุกซ้ำได้เสมอ — วันเดียวตอบกันหลายรอบเป็นเรื่องปกติ', async () => {
    const { service, sent } = build();

    await service.ticketReplied({ ...base, assigneeId: ASSIGNEE, authorId: REQUESTER, isInternal: false });

    expect(sent[0]?.renotify).toBe(true);
  });
});
