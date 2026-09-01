/**
 * Business-time engine สำหรับคำนวณ SLA
 *
 * พอร์ตจากฉบับ Python ที่ผ่านเทสต์ 38 เคส — ค่าคาดหวังทุกตัวยังเหมือนเดิม
 * (docs/11-sla-engine.md v2.0 §5)
 *
 * กติกาที่ยึดตาม AIDC-IT-SLA-001 v1.1:
 * - P2–P4 นับเฉพาะ "นาทีทำการ" · P1 นับต่อเนื่อง 24×7 (มีทีม On-call)
 * - ค่าเริ่มต้น จ.–ศ. 08:30–17:30 = 540 นาที/วัน · เสาร์-อาทิตย์และวันหยุดไม่นับ
 * - เวลาใน DB เก็บเป็น UTC เสมอ ทุกฟังก์ชันรับ/คืน Date (ซึ่งเป็น UTC อยู่แล้วภายใน)
 *
 * โมดูลนี้ไม่ import NestJS หรือ Drizzle โดยเจตนา ทดสอบได้เร็วโดยไม่ต้องมี DB
 */

import { TZDate } from '@date-fns/tz';

import { BUSINESS_DAY_MINUTES, type ClockMode } from '../constants';

export { BUSINESS_DAY_MINUTES };

/**
 * ระบบใช้เขตเวลาเดียว
 *
 * Asia/Vientiane เป็น UTC+7 ไม่มี DST เหมือน Asia/Bangkok ทุกประการ
 * ค่าคาดหวังของเทสต์ทั้ง 38 เคสจึงไม่เปลี่ยนจากฉบับ Python
 */
export const DEFAULT_TZ = 'Asia/Vientiane';

/** กันลูปไม่รู้จบกรณีปฏิทินไม่มีวันทำการเลย (เช่น config ผิด) */
const MAX_DAYS_SCAN = 3650;

export class CalendarError extends Error {}

export interface WorkingWindow {
  /** นาทีนับจากเที่ยงคืน เช่น 08:30 = 510 */
  startMinute: number;
  endMinute: number;
}

export function makeWindow(startHHMM: string, endHHMM: string): WorkingWindow {
  const toMin = (s: string): number => {
    const [h, m] = s.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const startMinute = toMin(startHHMM);
  const endMinute = toMin(endHHMM);
  if (startMinute >= endMinute) throw new Error('start_time ต้องน้อยกว่า end_time');
  return { startMinute, endMinute };
}

export interface BusinessCalendar {
  /** key = day_of_week ตามรูปแบบตาราง business_hours (0=อาทิตย์ … 6=เสาร์) */
  windows: Map<number, WorkingWindow>;
  /** วันหยุดในรูปแบบ 'YYYY-MM-DD' (เวลาท้องถิ่น) */
  holidays: Set<string>;
  tz: string;
}

/**
 * ปฏิทินเริ่มต้น จ.–ศ. 08:30–17:30
 * หมายเหตุ: v1.0 เคยมีวันเสาร์ด้วย — ถูกลบออกตาม G-01
 */
export function defaultCalendar(
  holidays: Iterable<string> = [],
  tz: string = DEFAULT_TZ,
): BusinessCalendar {
  const std = makeWindow('08:30', '17:30');
  const windows = new Map<number, WorkingWindow>();
  for (const dow of [1, 2, 3, 4, 5]) windows.set(dow, std);
  return { windows, holidays: new Set(holidays), tz };
}

// ── ตัวช่วยเรื่องเขตเวลา ────────────────────────────────────────────

interface LocalParts {
  y: number;
  m: number; // 1-12
  d: number;
  minuteOfDay: number;
  dow: number; // 0=อาทิตย์
  key: string; // YYYY-MM-DD
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

function toLocal(date: Date, tz: string): LocalParts {
  const z = new TZDate(date, tz);
  const y = z.getFullYear();
  const m = z.getMonth() + 1;
  const d = z.getDate();
  return {
    y,
    m,
    d,
    minuteOfDay: z.getHours() * 60 + z.getMinutes(),
    dow: z.getDay(),
    key: `${y}-${pad(m)}-${pad(d)}`,
  };
}

/** สร้าง Date จากวันที่ท้องถิ่น + นาทีนับจากเที่ยงคืน */
function fromLocal(y: number, m: number, d: number, minuteOfDay: number, tz: string): Date {
  const h = Math.floor(minuteOfDay / 60);
  const mi = minuteOfDay % 60;
  return new Date(new TZDate(y, m - 1, d, h, mi, 0, 0, tz).getTime());
}

/** เลื่อนไปวันถัดไปในเขตเวลาท้องถิ่น */
function nextDay(p: LocalParts, tz: string): LocalParts {
  const midnightNext = new TZDate(p.y, p.m - 1, p.d + 1, 0, 0, 0, 0, tz);
  return toLocal(new Date(midnightNext.getTime()), tz);
}

function windowOf(cal: BusinessCalendar, p: LocalParts): WorkingWindow | null {
  if (cal.holidays.has(p.key)) return null;
  return cal.windows.get(p.dow) ?? null;
}

export function dayMinutes(cal: BusinessCalendar, date: Date): number {
  const w = windowOf(cal, toLocal(date, cal.tz));
  return w ? w.endMinute - w.startMinute : 0;
}

// ── ฟังก์ชันหลัก ───────────────────────────────────────────────────

/**
 * หาช่วงเวลาทำการแรกที่ >= start
 * คืน start เดิมถ้าอยู่ในเวลาทำการอยู่แล้ว
 */
export function nextWorkingInstant(start: Date, cal: BusinessCalendar): Date {
  let p = toLocal(start, cal.tz);
  for (let i = 0; i < MAX_DAYS_SCAN; i++) {
    const w = windowOf(cal, p);
    if (w) {
      if (p.minuteOfDay < w.startMinute) return fromLocal(p.y, p.m, p.d, w.startMinute, cal.tz);
      if (p.minuteOfDay < w.endMinute) return start;
    }
    p = nextDay(p, cal.tz);
  }
  throw new CalendarError('ไม่พบวันทำการภายใน 10 ปี — ตรวจสอบ business_hours/holiday');
}

/**
 * บวก "นาทีทำการ" เข้ากับเวลาเริ่ม
 *
 * กติกา edge case ที่ยกมาจากฉบับ Python:
 * - นาทีที่เหลือพอดีกับเวลาที่เหลือของวัน → คืนเวลาปิดทำการของวันนั้น (เช่น 17:30)
 *   ไม่ใช่ 08:30 ของวันถัดไป
 * - บวก 0 นาทีนอกเวลาทำการ → คืนเวลาเปิดทำการถัดไป
 */
export function addBusinessMinutes(start: Date, minutes: number, cal: BusinessCalendar): Date {
  if (minutes < 0) throw new Error('minutes ต้องไม่ติดลบ');

  const cursor = nextWorkingInstant(start, cal);
  let remaining = Math.trunc(minutes);
  if (remaining === 0) return cursor;

  let p = toLocal(cursor, cal.tz);
  let isFirstDay = true;

  for (let i = 0; i < MAX_DAYS_SCAN; i++) {
    const w = windowOf(cal, p);
    if (w) {
      const segStart = isFirstDay ? Math.max(p.minuteOfDay, w.startMinute) : w.startMinute;
      if (segStart < w.endMinute) {
        const avail = w.endMinute - segStart;
        if (remaining <= avail) return fromLocal(p.y, p.m, p.d, segStart + remaining, cal.tz);
        remaining -= avail;
      }
    }
    p = nextDay(p, cal.tz);
    isFirstDay = false;
  }
  throw new CalendarError('คำนวณไม่จบภายใน 10 ปี — ตรวจสอบ business_hours/holiday');
}

/**
 * นับจำนวนนาทีทำการในช่วง [start, end)
 * end ไม่ถูกนับรวม ทำให้ between(a,b) + between(b,c) === between(a,c) เสมอ
 */
export function businessMinutesBetween(start: Date, end: Date, cal: BusinessCalendar): number {
  if (end.getTime() <= start.getTime()) return 0;

  const s = toLocal(start, cal.tz);
  const e = toLocal(end, cal.tz);

  let total = 0;
  let p = s;
  for (let i = 0; i < MAX_DAYS_SCAN; i++) {
    const w = windowOf(cal, p);
    if (w) {
      const lower = p.key === s.key ? Math.max(s.minuteOfDay, w.startMinute) : w.startMinute;
      const upper = p.key === e.key ? Math.min(e.minuteOfDay, w.endMinute) : w.endMinute;
      if (upper > lower) total += upper - lower;
    }
    if (p.key === e.key) return total;
    p = nextDay(p, cal.tz);
  }
  throw new CalendarError('ช่วงเวลาที่ขอกว้างเกิน 10 ปี');
}

// ── ตัวรวม 2 โหมดนาฬิกา ────────────────────────────────────────────

export function addMinutes(
  start: Date,
  minutes: number,
  cal: BusinessCalendar,
  mode: ClockMode,
): Date {
  if (mode === 'calendar_24x7') {
    return new Date(start.getTime() + Math.max(0, minutes) * 60_000);
  }
  return addBusinessMinutes(start, minutes, cal);
}

export function minutesBetween(
  start: Date,
  end: Date,
  cal: BusinessCalendar,
  mode: ClockMode,
): number {
  if (mode === 'calendar_24x7') {
    return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
  }
  return businessMinutesBetween(start, end, cal);
}

/**
 * คำนวณกำหนดตอบรับและกำหนดแก้ไขเสร็จ
 *
 * @param clockStart จุดเริ่มนับจริง — ลำดับความสำคัญคือ
 *   priority_changed_at > sla_clock_started_at > created_at
 * @param pausedMinutes บวกเข้าเฉพาะ resolution — response SLA ไม่หยุดนับ
 */
export function computeDueAt(opts: {
  clockStart: Date;
  responseMinutes: number;
  resolutionMinutes: number;
  cal: BusinessCalendar;
  mode?: ClockMode;
  pausedMinutes?: number;
}): { responseDueAt: Date; resolutionDueAt: Date } {
  const { clockStart, responseMinutes, resolutionMinutes, cal } = opts;
  const mode = opts.mode ?? 'business_hours';
  const paused = Math.max(0, opts.pausedMinutes ?? 0);
  return {
    responseDueAt: addMinutes(clockStart, responseMinutes, cal, mode),
    resolutionDueAt: addMinutes(clockStart, resolutionMinutes + paused, cal, mode),
  };
}

/**
 * เวลาที่ "เดินไปแล้ว" ของ ticket หนึ่งใบ (หักเวลาที่หยุดนับออก)
 *
 * @param workaroundAt ถ้ามี นาฬิกา resolution หยุดที่จุดนี้ถาวร (SLA 5.4)
 */
export function elapsedMinutes(opts: {
  clockStart: Date;
  now: Date;
  cal: BusinessCalendar;
  mode?: ClockMode;
  pausedMinutes?: number;
  pendingStartedAt?: Date | null;
  workaroundAt?: Date | null;
}): number {
  const { clockStart, now, cal } = opts;
  const mode = opts.mode ?? 'business_hours';
  const workaroundAt = opts.workaroundAt ?? null;

  const cutoff =
    workaroundAt && workaroundAt.getTime() < now.getTime() ? workaroundAt : now;

  const gross = minutesBetween(clockStart, cutoff, cal, mode);
  let paused = Math.max(0, opts.pausedMinutes ?? 0);
  if (opts.pendingStartedAt && !workaroundAt) {
    paused += minutesBetween(opts.pendingStartedAt, cutoff, cal, mode);
  }
  return Math.max(0, gross - paused);
}

/**
 * สถานะ SLA ที่แสดงบน UI — ไม่เก็บลงฐานข้อมูล คำนวณตอนอ่านเสมอ
 * (docs/04-rbac-sla.md v2.0 §4.2)
 */
export function slaStatus(opts: {
  status: string;
  clockStart: Date;
  resolutionDueAt: Date | null;
  now: Date;
  cal: BusinessCalendar;
  resolutionMinutes: number;
  mode?: ClockMode;
  pausedMinutes?: number;
  pendingStartedAt?: Date | null;
  workaroundAt?: Date | null;
  exclusionCode?: string | null;
}): 'on_track' | 'at_risk' | 'breached' | 'paused' {
  const { status, resolutionDueAt, now } = opts;

  if (status === 'pending_user') return 'paused';
  if (['resolved', 'closed', 'cancelled'].includes(status) || !resolutionDueAt) return 'on_track';
  // ข้อยกเว้นตาม SLA ข้อ 9 — ไม่ตั้งธง breach และไม่นับเข้า KPI
  if (opts.exclusionCode) return 'on_track';

  if (opts.workaroundAt) {
    // นาฬิกาหยุดที่ workaround แล้ว — วัดว่าทันหรือไม่ ณ จุดนั้น
    return opts.workaroundAt.getTime() > resolutionDueAt.getTime() ? 'breached' : 'on_track';
  }
  if (now.getTime() > resolutionDueAt.getTime()) return 'breached';

  const used = elapsedMinutes({
    clockStart: opts.clockStart,
    now,
    cal: opts.cal,
    mode: opts.mode ?? 'business_hours',
    pausedMinutes: opts.pausedMinutes ?? 0,
    pendingStartedAt: opts.pendingStartedAt ?? null,
  });
  const budget = opts.resolutionMinutes + Math.max(0, opts.pausedMinutes ?? 0);
  if (budget <= 0) return 'on_track';
  return 1 - used / budget <= 0.2 ? 'at_risk' : 'on_track';
}

/**
 * คำนวณค่าใหม่เมื่อ ticket ออกจากสถานะ pending_user
 * ใช้กับ resolved → in_progress ด้วย (ปิดประเด็น S-03 — สูตรเดียวทั้งระบบ)
 */
export function resumeFromPending(opts: {
  pendingStartedAt: Date;
  resumedAt: Date;
  currentResolutionDueAt: Date;
  currentPausedMinutes: number;
  cal: BusinessCalendar;
  mode?: ClockMode;
}): { pausedMinutes: number; resolutionDueAt: Date } {
  const mode = opts.mode ?? 'business_hours';
  const paused = minutesBetween(opts.pendingStartedAt, opts.resumedAt, opts.cal, mode);
  return {
    pausedMinutes: opts.currentPausedMinutes + paused,
    resolutionDueAt: addMinutes(opts.currentResolutionDueAt, paused, opts.cal, mode),
  };
}

/** รอบรายงานสถานะถัดไป (SLA 5.1) — null = รายงานเมื่อสถานะเปลี่ยนเท่านั้น */
export function nextStatusReportDue(
  lastPublicCommentAt: Date,
  intervalMinutes: number | null | undefined,
  cal: BusinessCalendar,
  mode: ClockMode = 'business_hours',
): Date | null {
  if (!intervalMinutes) return null;
  return addMinutes(lastPublicCommentAt, intervalMinutes, cal, mode);
}
