import { describe, expect, it } from 'vitest';

import { DomainError } from '../../common/errors/domain-error';
import {
  actorMayTransition,
  allowedTransitionsFrom,
  isWithinReopenWindow,
  TicketEntity,
  type TicketProps,
  type TransitionActor,
} from './ticket.entity';

/**
 * กฎการทำงานกับเรื่อง — ใครเปลี่ยนสถานะอะไรได้ การมอบหมาย และเวลาหยุดนับ
 *
 * แยกจาก ticket.entity.spec.ts เพราะไฟล์นั้นเทสต์การสร้างเรื่องและระดับความสำคัญ
 * ส่วนไฟล์นี้เทสต์สิ่งที่เกิดหลังเรื่องเข้าคิวแล้ว
 */

const AT = new Date('2026-09-02T03:00:00.000Z');
const DAY = 86_400_000;

function ticket(overrides: Partial<TicketProps> = {}): TicketEntity {
  return TicketEntity.rehydrate({
    id: 1,
    companyId: 1,
    categoryId: 10,
    requesterId: 100,
    createdBy: 100,
    subject: 'ເຄື່ອງພິມບໍ່ເຮັດວຽກ',
    description: 'ພິມບໍ່ອອກຕັ້ງແຕ່ເຊົ້ານີ້',
    impact: 'individual',
    urgency: 'low',
    status: 'new',
    priority: 'P4',
    pendingDurationMinutes: 0,
    assigneeId: null,
    ...overrides,
  });
}

/** รหัสของ DomainError ที่โยนออกมา · null = ไม่โยน */
function codeOf(fn: () => unknown): string | null {
  try {
    fn();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'NOT_A_DOMAIN_ERROR';
  }
  return null;
}

const STAFF: TransitionActor = {
  isOwner: false,
  canChangeStatus: true,
  canCancel: true,
  canReopen: true,
};
// ตรงกับสิทธิ์ที่ seed ให้ end_user — มี cancel และ reopen แต่ไม่มี change_status
const REQUESTER: TransitionActor = {
  isOwner: true,
  canChangeStatus: false,
  canCancel: true,
  canReopen: true,
};
const OTHER_EMPLOYEE: TransitionActor = { ...REQUESTER, isOwner: false };

describe('actorMayTransition — ใครเปลี่ยนสถานะอะไรได้', () => {
  it('เจ้าหน้าที่ทำได้ทุกเส้นที่ตารางอนุญาต', () => {
    for (const to of allowedTransitionsFrom('in_progress')) {
      expect(actorMayTransition('in_progress', to, STAFF)).toBe(true);
    }
  });

  it('ไม่มีใครข้ามตารางได้ แม้เป็นเจ้าหน้าที่', () => {
    expect(actorMayTransition('new', 'resolved', STAFF)).toBe(false);
    expect(actorMayTransition('cancelled', 'in_progress', STAFF)).toBe(false);
  });

  it('ผู้แจ้งยืนยันปิด เปิดคืน และถอนเรื่องที่ยังไม่มีใครรับได้', () => {
    expect(actorMayTransition('resolved', 'closed', REQUESTER)).toBe(true);
    expect(actorMayTransition('resolved', 'in_progress', REQUESTER)).toBe(true);
    expect(actorMayTransition('closed', 'in_progress', REQUESTER)).toBe(true);
    expect(actorMayTransition('new', 'cancelled', REQUESTER)).toBe(true);
  });

  it('ผู้แจ้งทำงานแทนเจ้าหน้าที่ไม่ได้', () => {
    expect(actorMayTransition('new', 'assigned', REQUESTER)).toBe(false);
    expect(actorMayTransition('in_progress', 'resolved', REQUESTER)).toBe(false);
    expect(actorMayTransition('in_progress', 'pending_user', REQUESTER)).toBe(false);
    // มีคนรับไปแล้ว ถอนเองไม่ได้ — ต้องคุยกับเจ้าหน้าที่
    expect(actorMayTransition('assigned', 'cancelled', REQUESTER)).toBe(false);
  });

  it('พนักงานที่ไม่ใช่ผู้แจ้ง ปิด เปิดคืน หรือยกเลิกเรื่องของคนอื่นไม่ได้', () => {
    expect(actorMayTransition('resolved', 'closed', OTHER_EMPLOYEE)).toBe(false);
    expect(actorMayTransition('resolved', 'in_progress', OTHER_EMPLOYEE)).toBe(false);
    expect(actorMayTransition('new', 'cancelled', OTHER_EMPLOYEE)).toBe(false);
  });

  it('เจ้าหน้าที่ที่ไม่มีสิทธิ์ยกเลิก ยกเลิกไม่ได้', () => {
    expect(actorMayTransition('in_progress', 'cancelled', { ...STAFF, canCancel: false })).toBe(
      false,
    );
  });

  it('คำขอบริการที่มีคนรับแล้ว เจ้าหน้าที่ยกเลิกได้ แต่ผู้แจ้งเองยกเลิกไม่ได้', () => {
    expect(actorMayTransition('assigned', 'cancelled', STAFF, 'service_request')).toBe(true);
    expect(actorMayTransition('in_progress', 'cancelled', STAFF, 'service_request')).toBe(true);
    expect(actorMayTransition('assigned', 'cancelled', REQUESTER, 'service_request')).toBe(false);
    expect(actorMayTransition('in_progress', 'cancelled', REQUESTER, 'service_request')).toBe(
      false,
    );
  });
});

describe('isWithinReopenWindow', () => {
  it('ครบ 7 วันพอดียังเปิดคืนได้ เกินจากนั้นไม่ได้', () => {
    expect(isWithinReopenWindow(new Date(AT.getTime() - 7 * DAY), AT)).toBe(true);
    expect(isWithinReopenWindow(new Date(AT.getTime() - 7 * DAY - 60_000), AT)).toBe(false);
    expect(isWithinReopenWindow(null, AT)).toBe(true);
  });
});

describe('TicketEntity.assignTo', () => {
  it('เรื่องใหม่ขยับเป็น assigned พร้อมผู้รับผิดชอบ', () => {
    const t = ticket();
    expect(t.assignTo(7)).toEqual({ fromAssigneeId: null, fromStatus: 'new', toStatus: 'assigned' });
    expect(t.status).toBe('assigned');
    expect(t.assigneeId).toBe(7);
  });

  it('ย้ายเรื่องที่กำลังทำให้คนอื่น สถานะคงเดิม', () => {
    const t = ticket({ status: 'in_progress', assigneeId: 7 });
    expect(t.assignTo(8)).toEqual({
      fromAssigneeId: 7,
      fromStatus: 'in_progress',
      toStatus: 'in_progress',
    });
  });

  it('มอบให้คนเดิมซ้ำ หรือมอบเรื่องที่แก้แล้ว/จบแล้ว ถูกปฏิเสธ', () => {
    expect(codeOf(() => ticket({ status: 'assigned', assigneeId: 7 }).assignTo(7))).toBe(
      'TICKET_ASSIGNEE_UNCHANGED',
    );
    for (const status of ['resolved', 'closed', 'cancelled'] as const) {
      expect(codeOf(() => ticket({ status }).assignTo(7))).toBe('TICKET_NOT_ASSIGNABLE');
    }
  });
});

describe('TicketEntity.changeStatus — เวลาหยุดนับ', () => {
  it('เปิดคืนจาก resolved บวกช่วงที่ค้างอยู่เข้าเวลาหยุดนับ และล้างเวลาที่แก้เสร็จ', () => {
    const t = ticket({
      status: 'resolved',
      resolvedAt: new Date(AT.getTime() - DAY),
      pendingDurationMinutes: 30,
    });
    t.changeStatus('in_progress', AT, { pausedMinutesToAdd: 540 });
    expect(t.pendingDurationMinutes).toBe(570);
    expect(t.toPersistence().resolvedAt).toBeNull();
  });

  it('เลิกพักรอผู้แจ้ง บวกเวลาที่พักเข้าเวลาหยุดนับ', () => {
    const t = ticket({ status: 'pending_user', pendingStartedAt: new Date(AT.getTime() - DAY) });
    t.changeStatus('in_progress', AT, { pausedMinutesToAdd: 120 });
    expect(t.pendingDurationMinutes).toBe(120);
    expect(t.pendingStartedAt).toBeNull();
  });

  it('เริ่มงานตามปกติ ไม่บวกเวลาหยุดนับแม้ผู้เรียกส่งมา', () => {
    const t = ticket({ status: 'assigned' });
    t.changeStatus('in_progress', AT, { pausedMinutesToAdd: 540 });
    expect(t.pendingDurationMinutes).toBe(0);
  });

  it('เรื่องที่ปิดเกิน 7 วัน เปิดคืนไม่ได้', () => {
    const t = ticket({ status: 'closed', closedAt: new Date(AT.getTime() - 8 * DAY) });
    expect(codeOf(() => t.changeStatus('in_progress', AT))).toBe('TICKET_REOPEN_WINDOW_EXPIRED');
  });
});
