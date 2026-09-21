import { describe, expect, it, vi } from 'vitest';

import type { ChangeTicketStatusUseCase } from '../../application/use-cases/change-ticket-status.use-case';
import { AccessScope } from '../../common/scope';
import type { ServiceCatalogRepository } from '../../db/repositories/service-catalog.repository';
import type { SlaConfigRepository } from '../../db/repositories/sla-config.repository';
import type { TicketRepository } from '../../db/repositories/ticket.repository';
import { businessMinutesBetween, defaultCalendar } from '../../common/sla/business-time';
import type { TicketsService } from '../tickets/tickets.service';
import { ApprovalsService } from './approvals.service';

/*
 * การพิจารณาอนุมัติหนึ่งครั้ง — ประกอบของปลอมทั้งหมด ไม่แตะฐานข้อมูลจริง
 *
 * สามข้อที่ไฟล์นี้คุ้มครอง และทั้งสามเคยพังหรือไม่เคยมีมาก่อน
 *   1. อนุมัติครบ → นาฬิกา fulfillment **เริ่มนับที่วินาทีนั้น** ไม่ใช่ตอนเปิดเรื่อง
 *   2. ปฏิเสธ → สถานะ rejected ไม่ใช่ cancelled
 *   3. ทั้งสองทาง → ยิงสัญญาณผ่านเส้นทางเดียวกับ POST /tickets/{id}/status
 */

const COMPANY = 7;
const APPROVER = 22;
const TICKET_ID = 1042;

function approverScope(): AccessScope {
  return new AccessScope({
    userId: APPROVER,
    homeCompanyId: COMPANY,
    companyIds: [COMPANY],
    // ⚠️ ผู้อนุมัติส่วนใหญ่เป็นหัวหน้าสายงานที่ไม่มีสิทธิ์ ticket.change_status
    //    และไม่ควรมี — การเปลี่ยนสถานะรอบนี้เป็นผลของ "การอนุมัติ"
    permissions: [],
    isSuperAdmin: false,
  });
}

/**
 * ฐานข้อมูลปลอมที่ตอบเฉพาะคิวรีที่ decide() ยิง ตามลำดับที่มันยิงจริง
 *
 * ยึดตามลำดับแทนการแกะ SQL เพราะการแกะ SQL ทำให้เทสต์ผูกกับรูปคิวรี
 * แล้วการจัดเรียงโค้ดใหม่ที่ไม่เปลี่ยนพฤติกรรมเลยจะทำให้เทสต์แดง
 */
function fakeDb(rows: {
  approval: Record<string, unknown>;
  blocking?: Record<string, unknown> | undefined;
  next?: Record<string, unknown> | undefined;
  ticket: Record<string, unknown>;
}) {
  const selects = [
    [rows.approval],
    rows.blocking ? [rows.blocking] : [],
    rows.next ? [rows.next] : [],
    [rows.ticket],
  ];
  let selectCall = 0;

  const chain = (result: unknown[]): Record<string, unknown> => {
    const self: Record<string, unknown> = {};
    for (const key of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'set']) {
      self[key] = () => self;
    }
    self.limit = () => result;
    // คิวรีที่ไม่เรียก .limit() (เช่น UPDATE) ต้อง await ได้เหมือนกัน
    self.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return self;
  };

  return {
    select: () => chain(selects[selectCall++] ?? []),
    update: () => chain([]),
  } as never;
}

function buildService(over: {
  ticketStatus: string;
  next?: Record<string, unknown> | undefined;
  clockStartedAt?: Date | null;
  catalogTargetMinutes?: number | null;
}) {
  const changeStatus = {
    execute: vi.fn().mockImplementation((_s, _id, input: { toStatus: string }) =>
      Promise.resolve({ from: over.ticketStatus, to: input.toStatus }),
    ),
  } as unknown as ChangeTicketStatusUseCase;

  const startFulfillmentClock = vi.fn().mockResolvedValue(true);
  const tickets = { startFulfillmentClock } as unknown as TicketRepository;

  const slaConfig = {
    targetFor: vi.fn().mockResolvedValue({
      policyId: 1,
      docRef: null,
      docVersion: null,
      responseMinutes: 30,
      // เป้าของ P4 ในตารางมาตรฐาน — ต้องถูกแทนที่ด้วยค่าของ catalog เมื่อมี
      resolutionMinutes: 2700,
      clockMode: 'business_hours',
      statusReportIntervalMinutes: null,
      escalationPercent: 80,
    }),
    calendarFor: vi.fn().mockResolvedValue(defaultCalendar()),
  } as unknown as SlaConfigRepository;

  const catalog = {
    byId: vi.fn().mockResolvedValue(
      over.catalogTargetMinutes === undefined
        ? null
        : { targetMode: 'duration', targetMinutes: over.catalogTargetMinutes },
    ),
  } as unknown as ServiceCatalogRepository;

  const afterStatusChange = vi.fn();
  const ticketsService = {
    detail: vi.fn().mockResolvedValue({ id: TICKET_ID }),
    afterStatusChange,
  } as unknown as TicketsService;

  const db = fakeDb({
    approval: {
      id: 301,
      ticket_id: TICKET_ID,
      seq: 1,
      approver_id: APPROVER,
      status: 'pending',
      requester_id: 55,
      ticket_status: over.ticketStatus,
      company_id: COMPANY,
    },
    next: over.next,
    ticket: {
      priority: 'P4',
      catalogItemId: over.catalogTargetMinutes === undefined ? null : 88,
      clockStartedAt: over.clockStartedAt ?? null,
    },
  });

  const service = new ApprovalsService(
    db,
    changeStatus,
    tickets,
    slaConfig,
    catalog,
    ticketsService,
  );

  return { service, changeStatus, startFulfillmentClock, afterStatusChange };
}

describe('ApprovalsService.decide — อนุมัติครบทุกขั้น', () => {
  it('ดันเรื่องจาก pending_approval ไป assigned', async () => {
    const { service, changeStatus } = buildService({ ticketStatus: 'pending_approval' });

    const result = await service.decide(approverScope(), 301, { decision: 'approved' });

    expect(result).toMatchObject({ status: 'approved', ticket_status: 'assigned', next_seq: null });
    expect(changeStatus.execute).toHaveBeenCalledWith(
      expect.anything(),
      TICKET_ID,
      expect.objectContaining({ toStatus: 'assigned' }),
    );
  });

  /**
   * ⚠️ ข้อกำหนดหลักของงานนี้
   *    "SLA fulfillment เริ่มนับหลังอนุมัติ ไม่ใช่ตอนเปิดเรื่อง —
   *     ป้องกันไอทีโดนนับเวลาทั้งที่ยังรอหัวหน้าอนุมัติ"
   */
  it('เริ่มจับเวลา fulfillment ที่วินาทีที่อนุมัติครบ ไม่ใช่ตอนเปิดเรื่อง', async () => {
    const { service, startFulfillmentClock } = buildService({
      ticketStatus: 'pending_approval',
      clockStartedAt: null,
    });

    const before = Date.now();
    await service.decide(approverScope(), 301, { decision: 'approved' });

    expect(startFulfillmentClock).toHaveBeenCalledTimes(1);
    const arg = startFulfillmentClock.mock.calls[0]![0] as {
      ticketId: number;
      clockStartedAt: Date;
      resolutionDueAt: Date | null;
    };
    expect(arg.ticketId).toBe(TICKET_ID);
    // จุดเริ่มถูกคำนวณจาก "ตอนนี้" — เลื่อนไปเวลาเปิดทำการถัดไปได้ แต่ต้องไม่ย้อนอดีต
    expect(arg.clockStartedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(arg.resolutionDueAt).toBeInstanceOf(Date);
  });

  it('ใช้เป้าหมายเวลาของรายการใน catalog ไม่ใช่ของตาราง priority', async () => {
    // 30 นาทีทำการ (รีเซ็ตรหัสผ่าน) เทียบกับ 2,700 นาทีของ P4 — ต่างกัน 90 เท่า
    const { service, startFulfillmentClock } = buildService({
      ticketStatus: 'pending_approval',
      catalogTargetMinutes: 30,
    });

    await service.decide(approverScope(), 301, { decision: 'approved' });

    const arg = startFulfillmentClock.mock.calls[0]![0] as {
      clockStartedAt: Date;
      resolutionDueAt: Date;
    };

    /*
     * ⚠️ วัดเป็น "นาทีทำการ" ด้วยเครื่องคำนวณตัวเดียวกับที่ระบบใช้
     *
     *    วัดด้วยเวลานาฬิกา (getTime ลบกัน) ไม่ได้ เพราะเทสต์รันเวลาไหนก็ได้ —
     *    ถ้าบังเอิญรันตอน 17:20 เป้า 30 นาทีทำการจะข้ามไปเช้าวันถัดไป
     *    แล้วผลต่างเป็นหลักพันนาที ทั้งที่คำตอบถูกต้องทุกประการ
     */
    expect(businessMinutesBetween(arg.clockStartedAt, arg.resolutionDueAt, defaultCalendar())).toBe(
      30,
    );
  });

  it('ยังไม่ครบสาย — ไม่ขยับสถานะ และไม่เริ่มนาฬิกา', async () => {
    const { service, changeStatus, startFulfillmentClock } = buildService({
      ticketStatus: 'pending_approval',
      next: { seq: 2 },
    });

    const result = await service.decide(approverScope(), 301, { decision: 'approved' });

    expect(result).toMatchObject({ ticket_status: 'pending_approval', next_seq: 2 });
    expect(changeStatus.execute).not.toHaveBeenCalled();
    expect(startFulfillmentClock).not.toHaveBeenCalled();
  });

  it('ยิงสัญญาณผ่านเส้นทางเดียวกับการเปลี่ยนสถานะปกติ', async () => {
    const { service, afterStatusChange } = buildService({ ticketStatus: 'pending_approval' });

    await service.decide(approverScope(), 301, { decision: 'approved' });

    /*
     * ช่องว่างเดิม: decide() เขียนฐานข้อมูลครบทุกตารางแต่ไม่บอกใครเลย
     * หน้าที่เปิดเรื่องนั้นค้างอยู่ไม่รีเฟรช และห้องแชทของผู้เข้าชมเงียบสนิท
     */
    expect(afterStatusChange).toHaveBeenCalledTimes(1);
    expect(afterStatusChange.mock.calls[0]![2]).toEqual({
      from: 'pending_approval',
      to: 'assigned',
    });
  });
});

describe('ApprovalsService.decide — ปฏิเสธ', () => {
  it('ไปสถานะ rejected ไม่ใช่ cancelled', async () => {
    const { service, changeStatus } = buildService({ ticketStatus: 'pending_approval' });

    const result = await service.decide(approverScope(), 301, {
      decision: 'rejected',
      comment: 'ງົບປະມານປີນີ້ໝົດແລ້ວ',
    });

    /*
     * สองคำนี้ต่างกันที่ "ใครเป็นคนหยุดเรื่อง" ซึ่งเป็นคำถามแรกที่ผู้ตรวจถาม
     *   cancelled = ผู้แจ้งถอนเอง
     *   rejected  = มีผู้มีอำนาจพิจารณาแล้วไม่อนุมัติ พร้อมเหตุผล
     */
    expect(result).toMatchObject({ status: 'rejected', ticket_status: 'rejected' });
    expect(changeStatus.execute).toHaveBeenCalledWith(
      expect.anything(),
      TICKET_ID,
      expect.objectContaining({ toStatus: 'rejected' }),
    );
  });

  it('ปฏิเสธโดยไม่ระบุเหตุผลไม่ได้', async () => {
    const { service } = buildService({ ticketStatus: 'pending_approval' });

    await expect(
      service.decide(approverScope(), 301, { decision: 'rejected' }),
    ).rejects.toMatchObject({ code: 'COMMENT_REQUIRED' });
  });

  it('ยิงสัญญาณพร้อมเหตุผลที่ผู้อนุมัติกรอก', async () => {
    const { service, afterStatusChange } = buildService({ ticketStatus: 'pending_approval' });

    await service.decide(approverScope(), 301, {
      decision: 'rejected',
      comment: 'ງົບປະມານປີນີ້ໝົດແລ້ວ',
    });

    expect(afterStatusChange.mock.calls[0]![3]).toEqual({ reason: 'ງົບປະມານປີນີ້ໝົດແລ້ວ' });
  });
});
