/**
 * กฎล้วน ๆ ของรายงานตาม ISO/IEC 20000-1 — ไม่มี I/O ไม่มี Nest ไม่มีฐานข้อมูล
 *
 * แยกออกมาเพื่อให้เทสต์ได้ตรง ๆ เพราะทุกข้อในไฟล์นี้ผิดแล้วรายงานยังดูสมเหตุสมผล:
 * เดือนเทียบผิดเดือน · คะแนนทีมที่ได้จากตัวอย่างสองใบ · สถานะภาพรวม "ผ่าน" ทั้งที่ P1 เกินกำหนด
 */

/** เวียงจันทน์ UTC+7 ไม่มีเวลาออมแสง — ขอบเดือนของรายงานใช้เวลาท้องถิ่นเสมอ ไม่ใช่ UTC */
const LOCAL_OFFSET_MS = 7 * 60 * 60 * 1000;

function local(date: Date): { year: number; month: number; day: number; msOfDay: number } {
  const shifted = new Date(date.getTime() + LOCAL_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    msOfDay:
      ((shifted.getUTCHours() * 60 + shifted.getUTCMinutes()) * 60 + shifted.getUTCSeconds()) * 1000 +
      shifted.getUTCMilliseconds(),
  };
}

/** 00:00 ของวันที่ 1 ในเดือนนั้นตามเวลาเวียงจันทน์ · month เริ่มที่ 0 และเลยช่วงได้ (Date.UTC จัดการให้) */
export function localMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1) - LOCAL_OFFSET_MS);
}

/**
 * ช่วงนี้เป็น "เดือนเต็ม" ตามเวลาท้องถิ่นหรือไม่ — from = วันที่ 1 เวลา 00:00 และ to = วันที่ 1 ของเดือนถัดไป
 * คืนปีและเดือน (เริ่มที่ 0) ของเดือนนั้น หรือ null ถ้าไม่ใช่
 */
export function wholeLocalMonth(from: Date, to: Date): { year: number; month: number } | null {
  const f = local(from);
  if (f.day !== 1 || f.msOfDay !== 0) return null;
  const next = localMonthStart(f.year, f.month + 1);
  return next.getTime() === to.getTime() ? { year: f.year, month: f.month } : null;
}

/**
 * ช่วงก่อนหน้าที่ใช้เทียบแนวโน้ม (ISO/IEC 20000-1 §9.1 "trends")
 *
 * เดือนเต็ม → เดือนก่อนหน้าทั้งเดือน ไม่ใช่ "ถอยไปเท่าจำนวนวัน" — มีนาคมเทียบกับกุมภาพันธ์ทั้งเดือน
 * ไม่ใช่ 31 วันก่อนหน้าที่กินเข้าไปถึงปลายมกราคม · ช่วงอื่นใช้ความยาวเท่ากันที่ติดกันด้านหน้า
 */
export function previousPeriod(from: Date, to: Date): { from: Date; to: Date } {
  const month = wholeLocalMonth(from, to);
  if (month) {
    return { from: localMonthStart(month.year, month.month - 1), to: from };
  }
  const length = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - length), to: from };
}

/**
 * เลขที่รายงาน — ข้อกำหนดเอกสารสารสนเทศ ISO/IEC 20000-1 §7.5.2 ต้องระบุตัวตนของเอกสารได้
 *
 *   เดือนเต็ม  SPR-202609
 *   ช่วงอื่น    SPR-20260901-20260915 (วันสุดท้าย = วันก่อน to เพราะ to เป็นขอบเปิด)
 */
export function reportNumber(from: Date, to: Date): string {
  const month = wholeLocalMonth(from, to);
  if (month) return `SPR-${month.year}${String(month.month + 1).padStart(2, '0')}`;

  const ymd = (d: Date): string => {
    const p = local(d);
    return `${p.year}${String(p.month + 1).padStart(2, '0')}${String(p.day).padStart(2, '0')}`;
  };
  return `SPR-${ymd(from)}-${ymd(new Date(to.getTime() - 1))}`;
}

// ── สถานะภาพรวมของรายงาน ──────────────────────────────────────────────

export type OverallStatus = 'on_target' | 'at_risk' | 'off_target' | 'no_data';

/**
 * สถานะภาพรวมบนหน้าแรกของรายงาน (บทสรุปผู้บริหาร)
 *
 *   off_target  KPI-1 (SLA Compliance) ตกเป้า หรือมีเหตุ P1 เกินกำหนดแก้ไข — เป้า P1 คือ 100%
 *   at_risk     KPI อื่นตกเป้าอย่างน้อยหนึ่งตัว
 *   on_target   ทุกตัวที่วัดได้ผ่านเป้า
 *   no_data     ไม่มี KPI ตัวไหนวัดได้เลย — ห้ามแสดงเป็น "ผ่าน"
 */
export function overallStatus(
  items: readonly { code: string; meets_target: boolean | null }[],
  p1ResolutionBreaches: number,
): { status: OverallStatus; failing: string[] } {
  const failing = items.filter((k) => k.meets_target === false).map((k) => k.code);
  const measured = items.some((k) => k.meets_target !== null);

  if (failing.includes('KPI-1') || p1ResolutionBreaches > 0) return { status: 'off_target', failing };
  if (failing.length > 0) return { status: 'at_risk', failing };
  if (!measured) return { status: 'no_data', failing };
  return { status: 'on_target', failing };
}

// ── KPI ของทีมสนับสนุน ────────────────────────────────────────────────

/**
 * เป้าหมายและน้ำหนักของคะแนนรายบุคคล
 *
 * เป้าหมายมาจากเอกสาร SLA ที่ระบบใช้อยู่ (docs/04-rbac-sla.md §5.1): ทัน SLA ≥ 95% · CSAT ≥ 4.2
 * เป้าเวลาตอบรับใช้ 95% เท่ากับเวลาแก้ไข เพราะเอกสารไม่ได้แยกไว้
 *
 * ⚠️ น้ำหนัก 40/30/30 และเกณฑ์ตัวอย่างขั้นต่ำ 5 ใบเป็นค่าที่ทีมตั้งเอง ไม่ได้มาจากเอกสารควบคุม
 *    แก้ที่นี่ที่เดียว หน้าจอแสดงค่าจาก API จึงเปลี่ยนตามเอง
 */
export const TEAM_KPI = {
  targets: { responseMetPercent: 95, resolutionMetPercent: 95, csatAvg: 4.2 },
  weights: { resolution: 40, response: 30, csat: 30 },
  /** ต่ำกว่านี้ไม่จัดอันดับ — ปิดสองใบแล้วทันทั้งคู่ไม่ใช่ "100% ดีที่สุดในทีม" */
  minSample: 5,
} as const;

/** CSAT 1–5 → 0–100 แบบเส้นตรง (1 = 0, 5 = 100) — ถ้าใช้ avg/5 คนที่ได้ 1 ดาวยังได้ 20 คะแนน */
export function csatPoints(avg: number): number {
  return Math.min(100, Math.max(0, ((avg - 1) / 4) * 100));
}

/**
 * คะแนนรวม 0–100 จาก SLA และคะแนนที่ผู้ใช้ให้
 *
 * ส่วนที่ยังวัดไม่ได้ (ตัวหารเป็นศูนย์) ถูกตัดออก แล้วกระจายน้ำหนักให้ส่วนที่เหลือ
 * — ไม่นับเป็น 0 เพราะ "ยังไม่มีใครให้คะแนน" ไม่ใช่ "ได้คะแนนต่ำ"
 * ไม่มีส่วนไหนวัดได้เลย → null
 */
export function teamKpiScore(input: {
  responseMetPercent: number | null;
  resolutionMetPercent: number | null;
  csatAvg: number | null;
}): number | null {
  const parts: { points: number; weight: number }[] = [];
  if (input.resolutionMetPercent !== null) {
    parts.push({ points: input.resolutionMetPercent, weight: TEAM_KPI.weights.resolution });
  }
  if (input.responseMetPercent !== null) {
    parts.push({ points: input.responseMetPercent, weight: TEAM_KPI.weights.response });
  }
  if (input.csatAvg !== null) {
    parts.push({ points: csatPoints(input.csatAvg), weight: TEAM_KPI.weights.csat });
  }
  if (parts.length === 0) return null;

  const weight = parts.reduce((s, p) => s + p.weight, 0);
  const score = parts.reduce((s, p) => s + p.points * p.weight, 0) / weight;
  return Math.round(score * 10) / 10;
}

/** ผ่านเป้าไหมรายตัวชี้วัด · null = ยังไม่มีข้อมูลพอตัดสิน */
export function teamKpiVerdicts(input: {
  responseMetPercent: number | null;
  resolutionMetPercent: number | null;
  csatAvg: number | null;
}): { response: boolean | null; resolution: boolean | null; csat: boolean | null } {
  const t = TEAM_KPI.targets;
  return {
    response: input.responseMetPercent === null ? null : input.responseMetPercent >= t.responseMetPercent,
    resolution:
      input.resolutionMetPercent === null ? null : input.resolutionMetPercent >= t.resolutionMetPercent,
    csat: input.csatAvg === null ? null : input.csatAvg >= t.csatAvg,
  };
}

/**
 * ใครเห็นตัวเลขของทั้งทีม
 *
 * ตัวเลขรายบุคคลเป็นข้อมูลผลงาน — หัวหน้าทีม ผู้ดูแล และผู้บริหาร (อ่านอย่างเดียว) เห็นทุกคน
 * ทีม support เห็นเฉพาะของตัวเอง เพื่อไม่ให้รายงานกลายเป็นกระดานจัดอันดับเพื่อนร่วมงาน
 *
 *   ticket.assign        support_lead · company_admin · super_admin
 *   ไม่มี change_status  manager_viewer (ถือ report.view แต่ไม่ได้ทำงานกับเรื่อง)
 */
export function canSeeWholeTeam(scope: { isSuperAdmin: boolean; has(...codes: string[]): boolean }): boolean {
  if (scope.isSuperAdmin) return true;
  if (scope.has('ticket.assign')) return true;
  return !scope.has('ticket.change_status');
}

/** ทศนิยม 1 ตำแหน่ง · ตัวหารเป็นศูนย์คืน null ไม่ใช่ 0 หรือ 100 */
export function percentOf(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}
