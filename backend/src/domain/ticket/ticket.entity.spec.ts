import { describe, expect, it } from 'vitest';

import { DomainError } from '../../common/errors/domain-error';
import { TicketEntity, type NewTicketProps } from './ticket.entity';

/**
 * เทสต์กฎธุรกิจล้วน ๆ ไม่มีฐานข้อมูล ไม่มี HTTP ไม่ต้องบูต NestJS
 *
 * นี่คือเหตุผลที่กฎถูกย้ายมาอยู่ใน entity — ทั้งไฟล์นี้รันจบในไม่กี่มิลลิวินาที
 * และครอบคลุมกรณีที่เทสต์ระดับ endpoint เขียนยากมาก เช่น "ปิดไปแล้ว 8 วัน"
 * ซึ่งถ้าต้องทำผ่าน API จริงต้องแก้เวลาในฐานข้อมูลหรือรอแปดวัน
 */

const BASE: NewTicketProps = {
  companyId: 1,
  categoryId: 10,
  requesterId: 100,
  createdBy: 100,
  subject: 'ເຄື່ອງພິມບໍ່ເຮັດວຽກ',
  description: 'ພິມບໍ່ອອກຕັ້ງແຕ່ເຊົ້ານີ້',
  impact: 'individual',
  urgency: 'low',
};

const AT = new Date('2026-09-02T03:00:00.000Z');

/** ตรวจว่าโยน DomainError ที่มีรหัสตามที่คาด */
function assertDomainError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`คาดว่าจะโยน ${code} แต่ไม่โยนอะไรเลย`);
}

describe('TicketEntity — ระดับความสำคัญ', () => {
  it('คำนวณจาก impact × urgency ไม่ใช่รับค่าเข้ามา', () => {
    expect(TicketEntity.create(BASE).priority).toBe('P4');
    expect(TicketEntity.create({ ...BASE, impact: 'org_wide', urgency: 'high' }).priority).toBe(
      'P1',
    );
    expect(
      TicketEntity.create({ ...BASE, impact: 'department', urgency: 'medium' }).priority,
    ).toBe('P3');
  });

  it('P1 ถูกตั้งเป็นเหตุร้ายแรงตั้งแต่สร้าง โดยไม่ต้องรอใครกด', () => {
    const p1 = TicketEntity.create({ ...BASE, impact: 'org_wide', urgency: 'high' });
    expect(p1.isMajorIncident).toBe(true);
    expect(TicketEntity.create(BASE).isMajorIncident).toBe(false);
  });

  it('P1 ใช้นาฬิกาปฏิทิน ระดับอื่นใช้นาฬิกาเวลาทำการ', () => {
    expect(
      TicketEntity.create({ ...BASE, impact: 'org_wide', urgency: 'high' }).usesCalendarClock,
    ).toBe(true);
    expect(TicketEntity.create(BASE).usesCalendarClock).toBe(false);
  });

  it('ยกระดับเป็น P1 ตั้งธงเหตุร้ายแรง แต่ลดระดับลงมาไม่ปลดธง', () => {
    const t = TicketEntity.create(BASE);
    expect(t.isMajorIncident).toBe(false);

    t.reassess('org_wide', 'high', AT);
    expect(t.priority).toBe('P1');
    expect(t.isMajorIncident).toBe(true);

    // ลดกลับลงมา — ธงต้องยังอยู่ เพราะกระบวนการรับมือเกิดขึ้นไปแล้วจริง
    t.reassess('individual', 'low', AT);
    expect(t.priority).toBe('P4');
    expect(t.isMajorIncident).toBe(true);
  });

  it('ทบทวนระดับความสำคัญของเรื่องที่ปิดแล้วไม่ได้', () => {
    const t = TicketEntity.create(BASE);
    t.changeStatus('cancelled', AT);
    assertDomainError(() => t.reassess('org_wide', 'high', AT), 'TICKET_ALREADY_CLOSED');
  });
});

describe('TicketEntity — การเปลี่ยนสถานะ', () => {
  it('ยอมรับเส้นทางที่แผนภาพสถานะกำหนด', () => {
    const t = TicketEntity.create(BASE);
    t.changeStatus('assigned', AT);
    t.changeStatus('in_progress', AT);
    t.changeStatus('resolved', AT);
    t.changeStatus('closed', AT);
    expect(t.status).toBe('closed');
  });

  it('คำขอที่ต้องอนุมัติไปรออนุมัติได้ตั้งแต่ยังไม่มอบหมาย', () => {
    const t = TicketEntity.create(BASE);
    t.changeStatus('pending_user', AT, { pendingReason: 'approval' });
    expect(t.status).toBe('pending_user');
  });

  it('ข้ามขั้นไปสถานะที่ไม่อนุญาตไม่ได้', () => {
    const t = TicketEntity.create(BASE);
    // new → resolved ไม่มีในแผนภาพ ต้องผ่าน in_progress ก่อน
    assertDomainError(() => t.changeStatus('resolved', AT), 'TICKET_INVALID_TRANSITION');
  });

  it('เปลี่ยนเป็นสถานะเดิมซ้ำไม่ได้', () => {
    const t = TicketEntity.create(BASE);
    assertDomainError(() => t.changeStatus('new', AT), 'TICKET_STATUS_UNCHANGED');
  });

  it('เรื่องที่ยกเลิกแล้วเปลี่ยนสถานะต่อไม่ได้', () => {
    const t = TicketEntity.create(BASE);
    t.changeStatus('cancelled', AT);
    assertDomainError(() => t.changeStatus('in_progress', AT), 'TICKET_INVALID_TRANSITION');
  });

  it('บันทึกเวลาแก้เสร็จและเวลาปิด พร้อมผู้ปิด', () => {
    const t = TicketEntity.create(BASE);
    t.changeStatus('assigned', AT);
    t.changeStatus('in_progress', AT);

    const resolvedAt = new Date('2026-09-02T05:00:00.000Z');
    t.changeStatus('resolved', resolvedAt);
    expect(t.toPersistence().resolvedAt).toEqual(resolvedAt);

    const closedAt = new Date('2026-09-03T05:00:00.000Z');
    t.changeStatus('closed', closedAt, { actorId: 55 });
    expect(t.toPersistence().closedAt).toEqual(closedAt);
    expect(t.toPersistence().closedBy).toBe(55);
  });

  it('เปิดใหม่แล้วล้างเวลาแก้เสร็จและผู้ปิดออก', () => {
    const t = TicketEntity.create(BASE);
    t.changeStatus('assigned', AT);
    t.changeStatus('in_progress', AT);
    t.changeStatus('resolved', AT);

    // ผู้แจ้งบอกว่ายังไม่หาย
    t.changeStatus('in_progress', AT);
    expect(t.toPersistence().resolvedAt).toBe(null);
    expect(t.toPersistence().closedBy).toBe(null);
  });
});

describe('TicketEntity — หน้าต่างเปิดซ้ำ 7 วัน', () => {
  function closedTicket(closedAt: Date): TicketEntity {
    const t = TicketEntity.create(BASE);
    t.changeStatus('assigned', closedAt);
    t.changeStatus('in_progress', closedAt);
    t.changeStatus('resolved', closedAt);
    t.changeStatus('closed', closedAt, { actorId: 1 });
    return t;
  }

  it('เปิดซ้ำภายใน 7 วันได้', () => {
    const closedAt = new Date('2026-09-01T03:00:00.000Z');
    const t = closedTicket(closedAt);

    t.changeStatus('in_progress', new Date('2026-09-06T03:00:00.000Z'));
    expect(t.status).toBe('in_progress');
  });

  it('เกิน 7 วันแล้วเปิดซ้ำไม่ได้ ต้องแจ้งเรื่องใหม่', () => {
    const closedAt = new Date('2026-09-01T03:00:00.000Z');
    const t = closedTicket(closedAt);

    assertDomainError(
      () => t.changeStatus('in_progress', new Date('2026-09-10T03:00:00.000Z')),
      'TICKET_REOPEN_WINDOW_EXPIRED',
    );
  });
});

describe('TicketEntity — การหยุดนาฬิการะหว่างรอผู้แจ้ง', () => {
  it('บอกได้ว่าการเปลี่ยนสถานะรอบนี้ทำให้เลิกพักหรือไม่', () => {
    const t = TicketEntity.create(BASE);
    expect(t.willResumeFromPending('in_progress')).toBe(false);

    t.changeStatus('pending_user', AT, { pendingReason: 'user' });
    expect(t.willResumeFromPending('in_progress')).toBe(true);
    expect(t.willResumeFromPending('pending_user')).toBe(false);
  });

  it('สะสมนาทีที่หยุดนาฬิกาเมื่อกลับมาทำต่อ', () => {
    const t = TicketEntity.create(BASE);
    t.changeStatus('pending_user', AT, { pendingReason: 'user' });
    expect(t.pendingDurationMinutes).toBe(0);

    t.changeStatus('in_progress', AT, { pausedMinutesToAdd: 480 });
    expect(t.pendingDurationMinutes).toBe(480);

    // พักรอบที่สอง ต้องบวกทบของเดิม ไม่ใช่ทับ
    t.changeStatus('pending_user', AT, { pendingReason: 'vendor' });
    t.changeStatus('in_progress', AT, { pausedMinutesToAdd: 120 });
    expect(t.pendingDurationMinutes).toBe(600);
  });

  it('ล้างเหตุผลและเวลาเริ่มพักเมื่อออกจากสถานะรอ', () => {
    const t = TicketEntity.create(BASE);
    t.changeStatus('pending_user', AT, { pendingReason: 'user' });
    expect(t.toPersistence().pendingReason).toBe('user');
    expect(t.pendingStartedAt).toEqual(AT);

    t.changeStatus('in_progress', AT);
    expect(t.toPersistence().pendingReason).toBe(null);
    expect(t.pendingStartedAt).toBe(null);
  });
});

describe('TicketEntity — การตรวจข้อมูลนำเข้า', () => {
  it('ปฏิเสธหัวข้อที่สั้นเกินไป', () => {
    assertDomainError(
      () => TicketEntity.create({ ...BASE, subject: 'ສັ້ນ' }),
      'TICKET_SUBJECT_TOO_SHORT',
    );
  });

  it('ปฏิเสธหัวข้อที่ยาวเกิน 200 ตัวอักษร', () => {
    assertDomainError(
      () => TicketEntity.create({ ...BASE, subject: 'ກ'.repeat(201) }),
      'TICKET_SUBJECT_TOO_LONG',
    );
  });

  it('ปฏิเสธคำอธิบายที่มีแต่ช่องว่าง', () => {
    assertDomainError(
      () => TicketEntity.create({ ...BASE, description: '   \n  ' }),
      'TICKET_DESCRIPTION_REQUIRED',
    );
  });

  it('นับความยาวหลังตัดช่องว่างหัวท้าย', () => {
    assertDomainError(
      () => TicketEntity.create({ ...BASE, subject: '   ສັ້ນ   ' }),
      'TICKET_SUBJECT_TOO_SHORT',
    );
  });
});
