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

export const TICKET_STATUS = [
  'new',
  'assigned',
  'in_progress',
  'pending_user',
  'resolved',
  'closed',
  'cancelled',
] as const;
export type TicketStatus = (typeof TICKET_STATUS)[number];

/** แยก 3 แบบตาม SLA 5.4 — vendor ต้องแจ้งผู้รับบริการก่อนจึงหยุดนับเวลาได้ */
export const PENDING_REASON = ['user', 'vendor', 'approval'] as const;
export type PendingReason = (typeof PENDING_REASON)[number];

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
