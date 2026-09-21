/**
 * ค่า enum ทั้งระบบ — แหล่งความจริงเดียวที่ทั้ง schema, DTO และ service ใช้ร่วมกัน
 * ตรงกับ docs/03-api-spec.md v2.0 §1.6
 *
 * เก็บเป็น const object + union type แทน TypeScript enum เพราะ
 * ค่าที่ได้เป็น string literal ตรง ๆ ใช้กับ Drizzle CHECK constraint และ Swagger ได้เลย
 */

export const TICKET_TYPE = ['incident', 'service_request'] as const;
export type TicketType = (typeof TICKET_TYPE)[number];

export const IMPACT = ['org_wide', 'department', 'individual'] as const;
export type Impact = (typeof IMPACT)[number];

export const URGENCY = ['high', 'medium', 'low'] as const;
export type Urgency = (typeof URGENCY)[number];

/** ระบบคำนวณจาก impact x urgency — ผู้แจ้งส่งมาโดยตรงไม่ได้ (SLA ข้อ 4) */
export const PRIORITY = ['P1', 'P2', 'P3', 'P4'] as const;
export type Priority = (typeof PRIORITY)[number];

/**
 * สถานะทั้งหมดของเรื่องหนึ่งใบ — รวมทั้งสายเหตุขัดข้องและสายคำขอบริการ
 *
 * ⚠️ นี่เป็น "ยูเนียนของสองเครื่องสถานะ" ไม่ใช่เครื่องสถานะเดียว
 *    เหตุขัดข้องใช้ได้บางค่า คำขอบริการใช้ได้บางค่า และมีค่าที่ใช้ร่วมกัน
 *    ตารางที่บอกว่าใครใช้ค่าไหนได้อยู่ที่ ALLOWED_TRANSITIONS ใน
 *    domain/ticket/ticket.entity.ts (ลอกจากแผนภาพสถานะใน docs/02-data-model.md)
 *
 * เรียงตามลำดับที่เรื่องเดินผ่านจริง ไม่เรียงตามตัวอักษร — หน้าจอที่วนค่านี้
 * เพื่อทำตัวกรองหรือแถวสรุปจะได้เรียงตามเส้นทางของงาน ไม่ใช่เรียงมั่ว
 */
export const TICKET_STATUS = [
  'new',
  // เฉพาะคำขอบริการที่รายการใน catalog ตั้ง requires_approval = true
  'pending_approval',
  // เฉพาะคำขอบริการ — ปลายทาง ต่างจาก cancelled ตรงที่ "มีคนพิจารณาแล้วไม่อนุมัติ"
  'rejected',
  'assigned',
  'in_progress',
  'pending_user',
  // แยกจาก pending_user เพราะนาฬิกา SLA ไม่หยุด (ดู PAUSED_STATUSES)
  'pending_vendor',
  // เฉพาะเหตุขัดข้อง — แก้แล้ว รอผู้แจ้งยืนยัน
  'resolved',
  // เฉพาะคำขอบริการ — ส่งมอบแล้ว รอผู้แจ้งยืนยัน (คู่ขนานกับ resolved)
  'fulfilled',
  'closed',
  'cancelled',
] as const;
export type TicketStatus = (typeof TICKET_STATUS)[number];

/**
 * สถานะที่นาฬิกา SLA หยุดเดิน
 *
 * ⚠️ pending_vendor **ไม่อยู่ในรายการนี้โดยตั้งใจ**
 *    SA ระบุชัดว่าการส่งของให้ผู้ให้บริการภายนอกไม่หยุดนาฬิกา เพราะการเลือกผู้ขาย
 *    และการเร่งงานผู้ขายเป็นความรับผิดชอบของทีมไอที ต่างจากการรอผู้แจ้งตอบ
 *    ซึ่งทีมทำอะไรไม่ได้เลย — ข้อนี้เป็นสวิตช์นโยบายที่เปลี่ยนได้ในอนาคต
 *    แต่ยังไม่ทำตอนนี้ ถ้าจะเปลี่ยนให้ย้ายค่าเข้ามาที่นี่ที่เดียว
 *
 * แยกเป็นสองกลุ่มย่อยเพราะกติกาการคืนเวลาต่างกัน — ดู WAITING_STATUSES
 */
export const WAITING_STATUSES = ['pending_approval', 'pending_user'] as const;

/**
 * พักเพราะ "งานของเจ้าหน้าที่จบแล้ว รอผู้แจ้งยืนยัน"
 *
 * ต่างจาก WAITING_STATUSES ตรงการคืนเวลา: ช่วงที่ค้างอยู่ตรงนี้จะถูกคืนเข้า
 * กำหนดแก้เสร็จ **เฉพาะเมื่อเรื่องถูกเปิดคืน** เท่านั้น ถ้าเรื่องปิดไปตามปกติ
 * เวลาช่วงนี้ไม่เคยมีความหมาย เพราะตัววัดคือ resolved_at ไม่ใช่ closed_at
 */
export const AWAITING_CONFIRMATION_STATUSES = ['resolved', 'fulfilled'] as const;

export const PAUSED_STATUSES = [
  ...WAITING_STATUSES,
  ...AWAITING_CONFIRMATION_STATUSES,
] as const;

/** สถานะที่ถือว่าจบแล้ว ไปต่อไม่ได้ (ยกเว้นการเปิดคืนจาก closed ภายใน 7 วัน) */
export const TERMINAL_STATUSES = ['rejected', 'closed', 'cancelled'] as const;

/** นาฬิกายังเดินอยู่และเรื่องยังไม่จบ — ส่วนที่เหลือจากสองรายการข้างบน */
export const CLOCK_RUNNING_STATUSES = [
  'new',
  'assigned',
  'in_progress',
  'pending_vendor',
] as const;

export function isPausedStatus(status: TicketStatus): boolean {
  return (PAUSED_STATUSES as readonly string[]).includes(status);
}

export function isTerminalStatus(status: TicketStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** นาฬิกาเดินอยู่ = ยังไม่จบ และไม่ได้พัก */
export function isClockRunningStatus(status: TicketStatus): boolean {
  return !isPausedStatus(status) && !isTerminalStatus(status);
}

/**
 * ขอบเขตการใช้หมวดหมู่ — หมวดนี้ใช้แจ้งเรื่องชนิดไหนได้บ้าง
 *
 * `both` คือค่าตั้งต้น ทำให้การเพิ่มคอลัมน์นี้ไม่กระทบหมวดเดิมแม้แต่แถวเดียว
 * หมวดหลักที่มีลูกทั้งสองชนิดอยู่ที่ `both` เสมอ — หน้าจอกรองที่ "ลูก" ไม่ใช่ซ่อนพ่อ
 */
export const TICKET_TYPE_SCOPE = ['incident', 'service_request', 'both'] as const;
export type TicketTypeScope = (typeof TICKET_TYPE_SCOPE)[number];

/** หมวดนี้ใช้กับเรื่องชนิดนี้ได้ไหม */
export function categoryAllowsTicketType(
  scope: TicketTypeScope | string,
  ticketType: TicketType,
): boolean {
  return scope === 'both' || scope === ticketType;
}

/** 4 ช่องทางตาม SLA 3.2 / SOP 2.3 — ไม่มี LINE (LINE ใช้แจ้งเตือนขาออกเท่านั้น) */
export const CHANNEL = ['portal', 'email', 'phone', 'walk_in'] as const;
export type Channel = (typeof CHANNEL)[number];

export const SOURCE_DEVICE = ['web', 'mobile_web'] as const;
export type SourceDevice = (typeof SOURCE_DEVICE)[number];

/** คำนวณตอนอ่าน ไม่เก็บในฐานข้อมูล */
export const SLA_STATUS = ['on_track', 'at_risk', 'breached', 'paused'] as const;
export type SlaStatus = (typeof SLA_STATUS)[number];

export const CLOCK_MODE = ['business_hours', 'calendar_24x7'] as const;
export type ClockMode = (typeof CLOCK_MODE)[number];

/** ข้อยกเว้นตาม SLA ข้อ 9 — ตัดออกจากตัวหารของ KPI และไม่ตั้งธง breach */
export const SLA_EXCLUSION_CODE = [
  'planned_maintenance',
  'force_majeure',
  'vendor_delay',
  'user_installed',
  'waiting_requester',
  'agreed_special_terms',
] as const;
export type SlaExclusionCode = (typeof SLA_EXCLUSION_CODE)[number];

export const SERVICE_TIER = ['critical', 'high', 'standard'] as const;
export type ServiceTier = (typeof SERVICE_TIER)[number];

export const SERVICE_GROUP = [
  'core_business',
  'infrastructure',
  'communication',
  'file_storage',
  'endpoint',
  'service_request',
] as const;
export type ServiceGroup = (typeof SERVICE_GROUP)[number];

export const APPROVAL_STATUS = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'skipped',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUS)[number];

export const APPROVER_TYPE = [
  'line_manager',
  'system_owner',
  'head_of_it',
  'budget_owner',
  'tier2_review',
  'cab',
] as const;
export type ApproverType = (typeof APPROVER_TYPE)[number];

/** จุดเริ่มนับเวลาของคำขอบริการ (SLA 5.3) */
export const CLOCK_START_EVENT = [
  'on_create',
  'after_identity_verified',
  'after_approval',
  'after_budget_approval',
] as const;
export type ClockStartEvent = (typeof CLOCK_START_EVENT)[number];

/**
 * จุดเริ่มนับที่รอให้อนุมัติครบก่อน
 *
 * เหตุผลที่ต้องมีสองค่า: การอนุมัติงบ (after_budget_approval) เป็นสายอนุมัติ
 * คนละสายกับการอนุมัติสิทธิ์ (after_approval) แต่ผลต่อนาฬิกาเหมือนกันทุกประการ
 * คือ "เริ่มนับเมื่อ approval_request ทุกใบของเรื่องนี้เป็น approved"
 *
 * ⚠️ นี่คือหัวใจของข้อกำหนด "SLA fulfillment เริ่มนับหลังอนุมัติ ไม่ใช่ตอนเปิดเรื่อง"
 *    ถ้าไม่มีข้อนี้ คำขอที่หัวหน้าดองไว้ 3 วันจะกลายเป็นไอทีผิด SLA
 */
export const APPROVAL_GATED_CLOCK_STARTS = ['after_approval', 'after_budget_approval'] as const;

export function clockStartsAfterApproval(event: string | null | undefined): boolean {
  return (APPROVAL_GATED_CLOCK_STARTS as readonly string[]).includes(event ?? '');
}

export const TARGET_MODE = ['duration', 'before_date', 'by_date'] as const;
export type TargetMode = (typeof TARGET_MODE)[number];

export const PROBLEM_STATUS = ['open', 'rca_pending', 'fixed', 'closed'] as const;
export type ProblemStatus = (typeof PROBLEM_STATUS)[number];

export const KB_VISIBILITY = ['public', 'company', 'agent_only'] as const;
export const KB_STATUS = ['draft', 'published', 'archived'] as const;

export const NOTIFICATION_CHANNEL = ['in_app', 'email', 'teams', 'line', 'webpush'] as const;
export const NOTIFICATION_STATUS = ['pending', 'sent', 'failed', 'skipped'] as const;

export const ROLE_CODE = [
  'end_user',
  'agent',
  'company_admin',
  'manager_viewer',
  'super_admin',
] as const;
export type RoleCode = (typeof ROLE_CODE)[number];

/** ตำแหน่งในองค์กร — ไม่ใช่ role ของระบบ (05-… §5.1) */
export const CONTACT_KEY = [
  'head_of_it',
  'ceo',
  'dpo',
  'incident_manager',
  'tier2_group',
  'tier3_group',
] as const;
export type ContactKey = (typeof CONTACT_KEY)[number];

export const AUTH_PROVIDER = ['local', 'ldap', 'oidc'] as const;
export const SCAN_STATUS = ['pending', 'clean', 'infected', 'skipped'] as const;

/** 1 วันทำการ = 540 นาทีทำการ (ปิดประเด็น S-02 — ยืนยันโดย SLA 1.4 + 3.1) */
export const BUSINESS_DAY_MINUTES = 540;

/**
 * เมทริกซ์ผลกระทบ x ความเร่งด่วน -> ระดับความสำคัญ (SLA ข้อ 4)
 * ตรงกับ docs/04-rbac-sla.md v2.0 §6.1
 */
export const PRIORITY_MATRIX: Record<Impact, Record<Urgency, Priority>> = {
  org_wide: { high: 'P1', medium: 'P2', low: 'P3' },
  department: { high: 'P2', medium: 'P3', low: 'P3' },
  individual: { high: 'P3', medium: 'P3', low: 'P4' },
};

export function computePriority(impact: Impact, urgency: Urgency): Priority {
  const p = PRIORITY_MATRIX[impact]?.[urgency];
  if (!p) throw new Error(`ค่าไม่ถูกต้อง: impact=${impact} urgency=${urgency}`);
  return p;
}
