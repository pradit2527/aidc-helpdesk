/**
 * ค่า SLA เวลาทำการ และกฎ escalation
 *
 * ตัวเลขทุกตัวมาจากเอกสารควบคุม AIDC-IT-SLA-001 v1.1 (บังคับใช้ 1 ส.ค. 2569)
 * ไม่ใช่สมมติฐานของทีม — ถ้าจะแก้ต้องแก้เอกสารก่อน (SLA ข้อ 10)
 * อ้างอิง docs/04-rbac-sla.md v2.0 §3 และ §4.3
 */

/** วันในสัปดาห์ตามแบบของ JavaScript — 0 = อาทิตย์ */
export interface BusinessHoursSeed {
  readonly dayOfWeek: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly isWorkingDay: boolean;
}

/**
 * จ.–ศ. 08:30–17:30 · เสาร์ไม่ใช่วันทำการ (SLA 1.4, 3.1)
 *
 * ข้อนี้เคยเข้าใจผิดว่ารวมเสาร์ตอนต้นโครงการ ถ้าเผลอเปิดเสาร์เป็นวันทำการ
 * ค่า due ของ P2–P4 ทุกใบจะเลื่อนผิดทันที เพราะ 1 วันทำการ = 540 นาที
 * ผูกกับจำนวนวันทำการต่อสัปดาห์โดยตรง
 */
export const BUSINESS_HOURS: readonly BusinessHoursSeed[] = [
  { dayOfWeek: 0, startTime: '08:30:00', endTime: '17:30:00', isWorkingDay: false }, // อาทิตย์
  { dayOfWeek: 1, startTime: '08:30:00', endTime: '17:30:00', isWorkingDay: true },
  { dayOfWeek: 2, startTime: '08:30:00', endTime: '17:30:00', isWorkingDay: true },
  { dayOfWeek: 3, startTime: '08:30:00', endTime: '17:30:00', isWorkingDay: true },
  { dayOfWeek: 4, startTime: '08:30:00', endTime: '17:30:00', isWorkingDay: true },
  { dayOfWeek: 5, startTime: '08:30:00', endTime: '17:30:00', isWorkingDay: true },
  { dayOfWeek: 6, startTime: '08:30:00', endTime: '17:30:00', isWorkingDay: false }, // เสาร์
];

export interface SlaTargetSeed {
  readonly priority: 'P1' | 'P2' | 'P3' | 'P4';
  readonly responseMinutes: number;
  readonly resolutionMinutes: number;
  readonly clockMode: 'business_hours' | 'calendar_24x7';
  readonly statusReportIntervalMinutes: number | null;
}

/**
 * ตาราง SLA มาตรฐาน (SLA 5.1 · 5.4)
 *
 * P1 นับปฏิทิน 24×7 เพราะมีทีม On-call — P2–P4 นับเฉพาะนาทีทำการ
 * ค่าที่เป็น "วันทำการ" แปลงด้วย 1 วันทำการ = 540 นาที
 *   P3 = 2 วันทำการ = 1,080 · P4 = 5 วันทำการ = 2,700
 */
export const SLA_TARGETS: readonly SlaTargetSeed[] = [
  {
    priority: 'P1',
    responseMinutes: 15,
    resolutionMinutes: 240,
    clockMode: 'calendar_24x7',
    statusReportIntervalMinutes: 60,
  },
  {
    priority: 'P2',
    responseMinutes: 30,
    resolutionMinutes: 480,
    clockMode: 'business_hours',
    statusReportIntervalMinutes: 240,
  },
  {
    priority: 'P3',
    responseMinutes: 120,
    resolutionMinutes: 1080,
    clockMode: 'business_hours',
    // เอกสารระบุ "เมื่อสถานะเปลี่ยน" ไม่ใช่รอบเวลา จึงไม่ตั้งค่า
    statusReportIntervalMinutes: null,
  },
  {
    priority: 'P4',
    responseMinutes: 240,
    resolutionMinutes: 2700,
    clockMode: 'business_hours',
    statusReportIntervalMinutes: null,
  },
];

export const SLA_POLICY = {
  name: 'AIDC ມາດຕະຖານກຸ່ມ',
  docRef: 'AIDC-IT-SLA-001',
  docVersion: '1.1',
  effectiveFrom: '2026-08-01',
} as const;

/** เป้าหมายความพร้อมใช้งานตาม Service Tier (SLA 5.2) */
export interface ServiceTierTargetSeed {
  readonly tierCode: string;
  readonly uptimePercent: string;
  readonly maxDowntimeMinutesMonth: number;
}

/**
 * เดือนอ้างอิง 30 วัน = 43,200 นาที
 *   critical 99.9% → 43.2 นาที · high 99.5% → 216 · standard 99.0% → 432
 */
export const SERVICE_TIER_TARGETS: readonly ServiceTierTargetSeed[] = [
  { tierCode: 'critical', uptimePercent: '99.900', maxDowntimeMinutesMonth: 43 },
  { tierCode: 'high', uptimePercent: '99.500', maxDowntimeMinutesMonth: 216 },
  { tierCode: 'standard', uptimePercent: '99.000', maxDowntimeMinutesMonth: 432 },
];

export interface EscalationRuleSeed {
  readonly code: string;
  readonly triggerType: string;
  readonly priority: string | null;
  readonly thresholdMinutes: number | null;
  readonly thresholdClockMode: 'business_hours' | 'calendar_24x7';
  readonly notifyContactKeys: string;
  readonly notifyRoles: string | null;
  readonly repeatIntervalMinutes: number | null;
  readonly notifyOutsideBusinessHours: boolean;
}

/**
 * กฎ ES-01…ES-12 (docs/04-rbac-sla.md §4.3)
 *
 * เก็บในตารางแทนที่จะฝังในโค้ด เพื่อให้แก้กฎได้โดยไม่ต้อง deploy ใหม่
 *
 * notify_outside_business_hours เป็น true เฉพาะ P1 และเหตุความปลอดภัย
 * เพราะ SLA 3.1 ระบุว่า On-call ครอบคลุมเฉพาะ P1 การส่งกฎอื่นนอกเวลา
 * คือการรบกวนคนที่ไม่ได้อยู่เวร
 *
 * notify_contact_keys ว่างไม่ได้แปลว่าไม่แจ้งใคร — "ผู้รับผิดชอบของ ticket"
 * ถูกแจ้งเสมอโดยตัวงาน จึงไม่ต้องระบุในกฎ ตารางนี้เก็บเฉพาะ "คนนอกที่ต้องแจ้งเพิ่ม"
 *
 * 🔴 กฎที่อ้าง head_of_it / ceo / dpo ส่งแจ้งเตือนไม่ได้จนกว่าจะรู้ว่าใครเป็นใคร
 *    แล้ว seed ตาราง escalation_contact (Q-07 — บล็อก go-live)
 */
export const ESCALATION_RULES: readonly EscalationRuleSeed[] = [
  {
    code: 'ES-01',
    triggerType: 'p1_created',
    priority: 'P1',
    thresholdMinutes: 0,
    thresholdClockMode: 'calendar_24x7',
    notifyContactKeys: 'head_of_it,incident_manager,tier2_group',
    notifyRoles: null,
    repeatIntervalMinutes: null,
    notifyOutsideBusinessHours: true,
  },
  {
    code: 'ES-02',
    triggerType: 'p1_prolonged',
    priority: 'P1',
    thresholdMinutes: 240,
    thresholdClockMode: 'calendar_24x7',
    notifyContactKeys: 'ceo,head_of_it',
    notifyRoles: null,
    repeatIntervalMinutes: 60,
    notifyOutsideBusinessHours: true,
  },
  {
    code: 'ES-03',
    triggerType: 'security_incident',
    priority: null,
    thresholdMinutes: 30,
    thresholdClockMode: 'calendar_24x7',
    notifyContactKeys: 'head_of_it,ceo,dpo',
    notifyRoles: null,
    repeatIntervalMinutes: null,
    notifyOutsideBusinessHours: true,
  },
  {
    code: 'ES-04',
    triggerType: 'tier1_timeout',
    priority: null,
    // 2 ชั่วโมงทำการ — ระบบตั้งธงและแจ้งเตือน แต่ไม่เปลี่ยน tier ให้เอง
    // agent ต้องยืนยันพร้อมสรุปสิ่งที่ตรวจแล้วตาม SOP-01 ข้อ 5
    thresholdMinutes: 120,
    thresholdClockMode: 'business_hours',
    notifyContactKeys: 'tier2_group',
    notifyRoles: 'company_admin',
    repeatIntervalMinutes: null,
    notifyOutsideBusinessHours: false,
  },
  {
    code: 'ES-05',
    triggerType: 'tier3_escalated',
    priority: null,
    thresholdMinutes: null,
    thresholdClockMode: 'business_hours',
    notifyContactKeys: 'tier3_group,head_of_it',
    notifyRoles: null,
    repeatIntervalMinutes: null,
    notifyOutsideBusinessHours: false,
  },
  {
    code: 'ES-06',
    triggerType: 'sla_breached',
    priority: null,
    thresholdMinutes: null,
    thresholdClockMode: 'business_hours',
    notifyContactKeys: 'head_of_it',
    notifyRoles: 'company_admin',
    // แจ้งซ้ำได้วันละครั้ง = 1 วันทำการ
    repeatIntervalMinutes: 540,
    notifyOutsideBusinessHours: false,
  },
  {
    code: 'ES-07',
    triggerType: 'service_review_requested',
    priority: null,
    thresholdMinutes: null,
    thresholdClockMode: 'business_hours',
    notifyContactKeys: 'head_of_it',
    notifyRoles: null,
    repeatIntervalMinutes: null,
    notifyOutsideBusinessHours: false,
  },
  {
    code: 'ES-08',
    triggerType: 'priority_review_requested',
    priority: null,
    thresholdMinutes: null,
    thresholdClockMode: 'business_hours',
    notifyContactKeys: '',
    notifyRoles: 'company_admin',
    repeatIntervalMinutes: null,
    notifyOutsideBusinessHours: false,
  },
  {
    code: 'ES-09',
    triggerType: 'status_report_due',
    priority: null,
    thresholdMinutes: null,
    thresholdClockMode: 'business_hours',
    notifyContactKeys: 'incident_manager',
    notifyRoles: null,
    // รอบจริงมาจาก sla_target.status_report_interval_minutes รายระดับ
    repeatIntervalMinutes: null,
    // ✔ เฉพาะ P1 — ตัวงานเป็นคนกรอง ไม่ใช่ค่าคงที่ในกฎ
    notifyOutsideBusinessHours: true,
  },
  {
    code: 'ES-10',
    triggerType: 'rca_overdue',
    priority: 'P1',
    // 5 วันทำการ = 2,700 นาทีทำการ
    thresholdMinutes: 2700,
    thresholdClockMode: 'business_hours',
    notifyContactKeys: 'head_of_it',
    notifyRoles: null,
    repeatIntervalMinutes: null,
    notifyOutsideBusinessHours: false,
  },
  {
    code: 'ES-11',
    triggerType: 'repeat_incident',
    priority: 'P1',
    // 90 วันปฏิทิน = 129,600 นาที
    thresholdMinutes: 129600,
    thresholdClockMode: 'calendar_24x7',
    notifyContactKeys: 'head_of_it,ceo',
    notifyRoles: null,
    repeatIntervalMinutes: null,
    notifyOutsideBusinessHours: false,
  },
  {
    code: 'ES-12',
    triggerType: 'sla_warning',
    priority: null,
    // ใช้เวลาไป 75% ของ resolution target — ค่าจริงอยู่ที่ sla_target.escalation_percent
    thresholdMinutes: null,
    thresholdClockMode: 'business_hours',
    notifyContactKeys: '',
    notifyRoles: null,
    repeatIntervalMinutes: null,
    notifyOutsideBusinessHours: false,
  },
];
