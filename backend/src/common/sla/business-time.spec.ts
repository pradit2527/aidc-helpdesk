/**
 * ชุดทดสอบ SLA engine — ตรงกับตารางใน docs/11-sla-engine.md v2.0 §5
 * ค่าคาดหวังทุกตัวยกมาจากฉบับ Python ที่ผ่าน 38/38 โดยไม่แก้เลข
 *
 * วันอ้างอิง: 2026-08-31 = จันทร์ · 2026-09-04 = ศุกร์ · 2026-09-05 = เสาร์
 *            2026-09-06 = อาทิตย์ · 2026-08-11 = อังคาร · 2026-08-28 = ศุกร์
 */

import { TZDate } from '@date-fns/tz';
import { describe, expect, it } from 'vitest';

import { computePriority, type Impact, type Urgency } from '../constants';
import {
  BUSINESS_DAY_MINUTES,
  DEFAULT_TZ,
  addBusinessMinutes,
  addMinutes,
  businessMinutesBetween,
  computeDueAt,
  dayMinutes,
  defaultCalendar,
  elapsedMinutes,
  makeWindow,
  nextStatusReportDue,
  nextWorkingInstant,
  resumeFromPending,
  slaStatus,
  type BusinessCalendar,
} from './business-time';

const CAL = defaultCalendar();

/** สร้างเวลาท้องถิ่น (UTC+7) */
function dt(y: number, m: number, d: number, hh = 0, mi = 0): Date {
  return new Date(new TZDate(y, m - 1, d, hh, mi, 0, 0, DEFAULT_TZ).getTime());
}

/** แสดงเป็นเวลาท้องถิ่นเพื่อเทียบกับค่าคาดหวัง */
function iso(x: Date): string {
  const z = new TZDate(x, DEFAULT_TZ);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${z.getFullYear()}-${p(z.getMonth() + 1)}-${p(z.getDate())} ${p(z.getHours())}:${p(z.getMinutes())}`;
}

describe('เคสที่ยกมาจาก v1.0 (ค่าคาดหวังใหม่หลังเสาร์ไม่ใช่วันทำการ)', () => {
  it('T-01 P1 นับต่อเนื่องในวันเดียว', () => {
    expect(iso(addMinutes(dt(2026, 8, 31, 9, 0), 240, CAL, 'calendar_24x7'))).toBe(
      '2026-08-31 13:00',
    );
  });

  it('T-02 P2 ศุกร์ 16:00 + 480 นาทีทำการ → จันทร์ 15:00 (ศ. 90 + จ. 390)', () => {
    expect(iso(addBusinessMinutes(dt(2026, 9, 4, 16, 0), 480, CAL))).toBe('2026-09-07 15:00');
  });

  it('T-03 เสาร์ไม่ใช่วันทำการแล้ว → เลื่อนไปเริ่มจันทร์ 08:30', () => {
    expect(iso(addBusinessMinutes(dt(2026, 9, 5, 16, 30), 480, CAL))).toBe('2026-09-07 16:30');
  });

  it('T-04 อาทิตย์ + 1080 (P3) → อังคาร 17:30', () => {
    expect(iso(addBusinessMinutes(dt(2026, 9, 6, 10, 0), 1080, CAL))).toBe('2026-09-08 17:30');
  });

  it('T-05 จันทร์ 07:00 + 2700 (P4 = 5 วันทำการ) → ศุกร์ 17:30', () => {
    expect(iso(addBusinessMinutes(dt(2026, 8, 31, 7, 0), 2700, CAL))).toBe('2026-09-04 17:30');
  });

  it('T-06 จันทร์ 19:00 + 240 → อังคาร 12:30', () => {
    expect(iso(addBusinessMinutes(dt(2026, 8, 31, 19, 0), 240, CAL))).toBe('2026-09-01 12:30');
  });

  it('T-07 ข้ามวันหยุด 2 วันติด → ศุกร์ 14 ส.ค. 09:00', () => {
    const cal = defaultCalendar(['2026-08-12', '2026-08-13']);
    expect(iso(addBusinessMinutes(dt(2026, 8, 11, 16, 0), 120, cal))).toBe('2026-08-14 09:00');
  });

  it('T-08 นาทีลงตัวพอดี → คืนเวลาปิดของวันนั้น ไม่ใช่เช้าวันถัดไป', () => {
    expect(iso(addBusinessMinutes(dt(2026, 8, 31, 8, 30), BUSINESS_DAY_MINUTES, CAL))).toBe(
      '2026-08-31 17:30',
    );
  });

  it('T-09 บวก 0 นาทีนอกเวลาทำการ = จุดเริ่มนับจริง', () => {
    expect(iso(addBusinessMinutes(dt(2026, 9, 6, 10, 0), 0, CAL))).toBe('2026-09-07 08:30');
  });

  it('T-10 07:00 → 18:00 ในวันทำการ = 540 นาที', () => {
    expect(businessMinutesBetween(dt(2026, 8, 31, 7, 0), dt(2026, 8, 31, 18, 0), CAL)).toBe(540);
  });

  it('T-11 ศุกร์ 17:00 → จันทร์ 09:00 = 30 + 30 = 60', () => {
    expect(businessMinutesBetween(dt(2026, 9, 4, 17, 0), dt(2026, 9, 7, 9, 0), CAL)).toBe(60);
  });

  it('T-12 ช่วงย้อนหลังคืน 0 ไม่ติดลบ', () => {
    expect(businessMinutesBetween(dt(2026, 8, 31, 9, 0), dt(2026, 8, 29, 9, 0), CAL)).toBe(0);
  });

  it('T-13 add แล้ว between กลับต้องได้เท่าเดิม', () => {
    const start = dt(2026, 8, 28, 16, 45);
    const due = addBusinessMinutes(start, 1000, CAL);
    expect(iso(due)).toBe('2026-09-01 15:25');
    expect(businessMinutesBetween(start, due, CAL)).toBe(1000);
  });

  it('T-14 compute_due_at ของ P2 (30 / 480)', () => {
    const { responseDueAt, resolutionDueAt } = computeDueAt({
      clockStart: dt(2026, 8, 31, 9, 15),
      responseMinutes: 30,
      resolutionMinutes: 480,
      cal: CAL,
    });
    expect(iso(responseDueAt)).toBe('2026-08-31 09:45');
    expect(iso(resolutionDueAt)).toBe('2026-08-31 17:15');
  });

  it('T-15 pause เลื่อนเฉพาะ resolution — response ไม่ขยับ', () => {
    const { responseDueAt, resolutionDueAt } = computeDueAt({
      clockStart: dt(2026, 8, 31, 9, 0),
      responseMinutes: 120,
      resolutionMinutes: 1080,
      cal: CAL,
      pausedMinutes: 540,
    });
    expect(iso(responseDueAt)).toBe('2026-08-31 11:00');
    expect(iso(resolutionDueAt)).toBe('2026-09-03 09:00');
  });

  it('T-16 หยุด 2 รอบ รวม 1080 นาทีทำการ', () => {
    const baseDue = addBusinessMinutes(dt(2026, 8, 31, 9, 0), 1080, CAL);
    expect(iso(baseDue)).toBe('2026-09-02 09:00');

    const r1 = resumeFromPending({
      pendingStartedAt: dt(2026, 9, 1, 9, 0),
      resumedAt: dt(2026, 9, 2, 9, 0),
      currentResolutionDueAt: baseDue,
      currentPausedMinutes: 0,
      cal: CAL,
    });
    expect(r1.pausedMinutes).toBe(540);
    expect(iso(r1.resolutionDueAt)).toBe('2026-09-03 09:00');

    const r2 = resumeFromPending({
      pendingStartedAt: dt(2026, 9, 3, 9, 0),
      resumedAt: dt(2026, 9, 4, 9, 0),
      currentResolutionDueAt: r1.resolutionDueAt,
      currentPausedMinutes: r1.pausedMinutes,
      cal: CAL,
    });
    expect(r2.pausedMinutes).toBe(1080);
    expect(iso(r2.resolutionDueAt)).toBe('2026-09-04 09:00');
  });

  it('T-16e เลื่อนทีละรอบ == คำนวณใหม่ทั้งก้อน', () => {
    const start = dt(2026, 8, 31, 9, 0);
    const incremental = addBusinessMinutes(addBusinessMinutes(start, 1080, CAL), 540, CAL);
    const whole = addBusinessMinutes(start, 1080 + 540, CAL);
    expect(incremental.getTime()).toBe(whole.getTime());
  });

  it('T-17 เปลี่ยนระดับ → นับใหม่จากเวลาที่ปรับ ไม่ใช่จาก created_at (G-08)', () => {
    const { responseDueAt, resolutionDueAt } = computeDueAt({
      clockStart: dt(2026, 9, 1, 10, 0),
      responseMinutes: 30,
      resolutionMinutes: 480,
      cal: CAL,
    });
    expect(iso(responseDueAt)).toBe('2026-09-01 10:30');
    expect(iso(resolutionDueAt)).toBe('2026-09-02 09:00');
  });

  it('T-18 elapsed ดิบ 1080 หัก pause 540 เหลือ 540', () => {
    const clockStart = dt(2026, 8, 31, 9, 0);
    const now = dt(2026, 9, 2, 9, 0);
    expect(businessMinutesBetween(clockStart, now, CAL)).toBe(1080);
    expect(elapsedMinutes({ clockStart, now, cal: CAL, pausedMinutes: 540 })).toBe(540);
  });

  it('T-19 กำลัง pending อยู่ ต้องหักช่วงที่หยุดออกด้วย', () => {
    expect(
      elapsedMinutes({
        clockStart: dt(2026, 8, 31, 9, 0),
        now: dt(2026, 9, 1, 9, 0),
        cal: CAL,
        pendingStartedAt: dt(2026, 8, 31, 15, 0),
      }),
    ).toBe(360);
  });

  it('T-20 สถานะ SLA ครบ 4 ค่า', () => {
    const clockStart = dt(2026, 8, 31, 9, 0);
    const resolutionDueAt = addBusinessMinutes(clockStart, 480, CAL); // จ. 17:00
    const base = { clockStart, resolutionDueAt, cal: CAL, resolutionMinutes: 480 };

    expect(slaStatus({ ...base, status: 'in_progress', now: dt(2026, 8, 31, 10, 0) })).toBe(
      'on_track',
    );
    expect(slaStatus({ ...base, status: 'in_progress', now: dt(2026, 8, 31, 16, 30) })).toBe(
      'at_risk',
    );
    expect(slaStatus({ ...base, status: 'in_progress', now: dt(2026, 9, 1, 9, 0) })).toBe(
      'breached',
    );
    expect(slaStatus({ ...base, status: 'pending_user', now: dt(2026, 8, 31, 10, 0) })).toBe(
      'paused',
    );
  });

  it('T-21 รับ UTC แล้วคำนวณในโซนท้องถิ่นได้ถูก', () => {
    const utcIn = new Date('2026-08-31T02:00:00Z'); // = 09:00 UTC+7
    expect(iso(addMinutes(utcIn, 240, CAL, 'calendar_24x7'))).toBe('2026-08-31 13:00');
  });

  it('T-22 ปฏิทินเฉพาะบริษัท จ.–ศ. 09:00–18:00', () => {
    const win = makeWindow('09:00', '18:00');
    const cal: BusinessCalendar = {
      windows: new Map([1, 2, 3, 4, 5].map((d) => [d, win])),
      holidays: new Set(),
      tz: DEFAULT_TZ,
    };
    expect(iso(addBusinessMinutes(dt(2026, 9, 4, 17, 0), 120, cal))).toBe('2026-09-07 10:00');
  });

  it('T-23 นาทีติดลบต้องโยน error', () => {
    expect(() => addBusinessMinutes(dt(2026, 8, 31, 9, 0), -1, CAL)).toThrow();
  });
});

describe('เคสใหม่ของ v2.0', () => {
  it('T-24 P1 เสาร์ 22:00 + 240 ปฏิทิน → อาทิตย์ 02:00', () => {
    expect(iso(addMinutes(dt(2026, 9, 5, 22, 0), 240, CAL, 'calendar_24x7'))).toBe(
      '2026-09-06 02:00',
    );
  });

  it('T-25 เวลาเริ่มเดียวกันแต่คนละโหมด ได้กำหนดต่างกันมาก', () => {
    const start = dt(2026, 9, 4, 16, 0);
    expect(iso(addMinutes(start, 240, CAL, 'calendar_24x7'))).toBe('2026-09-04 20:00');
    expect(iso(addMinutes(start, 480, CAL, 'business_hours'))).toBe('2026-09-07 15:00');
  });

  it('T-26 workaround ก่อนครบกำหนด → ไม่ breach แม้เวลาผ่านไปแล้ว', () => {
    expect(
      slaStatus({
        status: 'in_progress',
        clockStart: dt(2026, 8, 31, 9, 0),
        resolutionDueAt: dt(2026, 8, 31, 13, 0),
        now: dt(2026, 8, 31, 16, 0),
        cal: CAL,
        resolutionMinutes: 240,
        workaroundAt: dt(2026, 8, 31, 12, 0),
      }),
    ).toBe('on_track');
  });

  it('T-27 workaround หลังเลยกำหนดแล้ว ยังนับเป็น breach', () => {
    expect(
      slaStatus({
        status: 'in_progress',
        clockStart: dt(2026, 8, 31, 9, 0),
        resolutionDueAt: dt(2026, 8, 31, 13, 0),
        now: dt(2026, 8, 31, 16, 0),
        cal: CAL,
        resolutionMinutes: 240,
        workaroundAt: dt(2026, 8, 31, 14, 0),
      }),
    ).toBe('breached');
  });

  it('T-28 ข้อยกเว้นตาม SLA ข้อ 9 ไม่ถูกตั้งธง breach', () => {
    expect(
      slaStatus({
        status: 'in_progress',
        clockStart: dt(2026, 8, 31, 9, 0),
        resolutionDueAt: dt(2026, 8, 31, 13, 0),
        now: dt(2026, 9, 3, 9, 0),
        cal: CAL,
        resolutionMinutes: 240,
        exclusionCode: 'vendor_delay',
      }),
    ).toBe('on_track');
  });

  it('T-29 SR-ACCESS 540 นาทีทำการ เริ่มนับหลังอนุมัติครบ พุธ 14:00', () => {
    expect(iso(addBusinessMinutes(dt(2026, 9, 2, 14, 0), 540, CAL))).toBe('2026-09-03 14:00');
  });

  it('T-30 regression ของ G-01 — เสาร์ต้องถูกข้าม', () => {
    expect(iso(addBusinessMinutes(dt(2026, 9, 5, 10, 0), 60, CAL))).toBe('2026-09-07 09:30');
    expect(dayMinutes(CAL, dt(2026, 9, 5, 12, 0))).toBe(0);
    expect(dayMinutes(CAL, dt(2026, 9, 7, 12, 0))).toBe(BUSINESS_DAY_MINUTES);
  });

  it('T-31 กลับจาก resolved ใช้สูตรเดียวกับ pause (ปิด S-03)', () => {
    const r = resumeFromPending({
      pendingStartedAt: dt(2026, 8, 31, 10, 0),
      resumedAt: dt(2026, 9, 1, 10, 0),
      currentResolutionDueAt: dt(2026, 9, 2, 9, 0),
      currentPausedMinutes: 0,
      cal: CAL,
    });
    expect(r.pausedMinutes).toBe(540);
    expect(iso(r.resolutionDueAt)).toBe('2026-09-03 09:00');
  });

  it('T-32 รอบรายงาน P1 ทุก 1 ชั่วโมง (ปฏิทิน)', () => {
    const got = nextStatusReportDue(dt(2026, 8, 31, 9, 0), 60, CAL, 'calendar_24x7');
    expect(got && iso(got)).toBe('2026-08-31 10:00');
  });

  it('T-33 รอบรายงาน P2 ทุก 4 ชม.ทำการ — จ. 15:00 เหลือ 150 แล้วข้ามไป อ. 10:00', () => {
    const got = nextStatusReportDue(dt(2026, 8, 31, 15, 0), 240, CAL);
    expect(got && iso(got)).toBe('2026-09-01 10:00');
  });

  it('T-34 P3/P4 ไม่มีรอบรายงาน', () => {
    expect(nextStatusReportDue(dt(2026, 8, 31, 15, 0), null, CAL)).toBeNull();
  });

  it('T-37 1 วันทำการ = 540 นาทีทำการ (ปิด S-02)', () => {
    expect(BUSINESS_DAY_MINUTES).toBe(540);
    expect(iso(addBusinessMinutes(dt(2026, 8, 31, 8, 30), BUSINESS_DAY_MINUTES, CAL))).toBe(
      '2026-08-31 17:30',
    );
  });

  it('T-38 เมทริกซ์ผลกระทบ × ความเร่งด่วน ครบ 9 ช่อง (SLA ข้อ 4)', () => {
    const expected: Array<[Impact, Urgency, string]> = [
      ['org_wide', 'high', 'P1'],
      ['org_wide', 'medium', 'P2'],
      ['org_wide', 'low', 'P3'],
      ['department', 'high', 'P2'],
      ['department', 'medium', 'P3'],
      ['department', 'low', 'P3'],
      ['individual', 'high', 'P3'],
      ['individual', 'medium', 'P3'],
      ['individual', 'low', 'P4'],
    ];
    for (const [impact, urgency, want] of expected) {
      expect(computePriority(impact, urgency), `${impact} × ${urgency}`).toBe(want);
    }
    expect(() => computePriority('whole_planet' as Impact, 'high')).toThrow();
  });

  it('เวลาที่อยู่ในเวลาทำการอยู่แล้วต้องคืนค่าเดิม', () => {
    const x = dt(2026, 8, 31, 10, 0);
    expect(nextWorkingInstant(x, CAL).getTime()).toBe(x.getTime());
  });
});
