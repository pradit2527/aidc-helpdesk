/**
 * รูปร่างข้อมูลที่ API ส่งกลับ — ตรงกับ docs/03-api-spec.md v2.0
 *
 * ตั้งใจใช้ snake_case ตามที่ API ส่งจริง ไม่แปลงเป็น camelCase ระหว่างทาง
 * การแปลงชื่อฟิลด์ทำให้ต้องเปิดสองไฟล์เทียบกันทุกครั้งที่ debug
 * และเป็นจุดที่ field หายเงียบ ๆ ได้ง่ายที่สุด
 */

import type { Priority, SlaStatus, TicketStatus } from '@/config/enums';

export type RoleCode = 'end_user' | 'agent' | 'company_admin' | 'manager_viewer' | 'super_admin';

export interface CompanyRef {
  id: number;
  code: string;
  name_th?: string;
}

export interface UserRef {
  id: number;
  full_name: string;
}

export interface SessionUser {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  company: CompanyRef;
  department: { id: number; name: string } | null;
  roles: RoleCode[];
  /** บริษัทที่มองเห็นได้ — มาจาก user_role_scope ที่ยังไม่หมดอายุ */
  scoped_companies: CompanyRef[];
  permissions: string[];
  must_change_password: boolean;
  unread_notifications: number;
}

export interface TicketSla {
  status: SlaStatus;
  remaining_minutes: number | null;
  /** P1 นับปฏิทิน · P2–P4 นับนาทีทำการ — หน่วยต่างกันจึงห้ามเอาไปบวกกัน */
  remaining_unit: 'business_minutes' | 'calendar_minutes';
  resolution_due_at: string;
  is_resolution_breached: boolean;
}

export interface TicketListItem {
  id: number;
  ticket_no: string;
  ticket_type: 'incident' | 'service_request';
  subject: string;
  status: TicketStatus;
  pending_reason: 'user' | 'vendor' | 'approval' | null;
  priority: Priority;
  support_tier: 1 | 2 | 3;
  company: CompanyRef;
  department: { id: number; name: string } | null;
  category: { id: number; name_th: string };
  requester: UserRef;
  assignee: UserRef | null;
  sla: TicketSla;
  reopen_count: number;
  comment_count: number;
  attachment_count: number;
  updated_at: string;
}

/**
 * บล็อก can ที่ backend ประเมินมาให้ครบแล้ว
 *
 * frontend ห้ามคำนวณเงื่อนไข "เฉพาะของตน" หรือ "เฉพาะบริษัทตน" เอง
 * หน้าที่มีแค่ซ่อน/แสดงตามค่าที่ได้รับ (docs/04-rbac-sla.md §2 สัญญากับ Frontend)
 */
export interface TicketCan {
  update: boolean;
  assign: boolean;
  assign_self: boolean;
  change_status: boolean;
  change_priority: boolean;
  request_priority_review: boolean;
  set_workaround: boolean;
  declare_major_incident: boolean;
  comment: boolean;
  comment_internal: boolean;
  attach: boolean;
  close_own: boolean;
  reopen: boolean;
  cancel: boolean;
  delete: boolean;
  view_history: boolean;
}

export interface TicketComment {
  id: number;
  author: UserRef;
  body: string;
  is_internal: boolean;
  created_at: string;
  attachments: { id: number; file_name: string; file_size: number }[];
}

export interface TicketHistoryEntry {
  id: number;
  actor: UserRef | null;
  field: string;
  from_value: string | null;
  to_value: string | null;
  reason: string | null;
  created_at: string;
}

export interface ApprovalStep {
  id: number;
  seq: number;
  approver: UserRef;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  comment: string | null;
  decided_at: string | null;
}

export interface ChecklistEntry {
  id: number;
  title: string;
  is_required: boolean;
  evidence_required: boolean;
  is_done: boolean;
  done_by: UserRef | null;
  done_at: string | null;
}

export interface TicketDetail extends TicketListItem {
  description: string;
  channel: 'portal' | 'email' | 'phone' | 'walk_in';
  impact: 'org_wide' | 'department' | 'individual';
  urgency: 'high' | 'medium' | 'low';
  created_at: string;
  first_response_at: string | null;
  response_due_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  workaround_at: string | null;
  workaround_note: string | null;
  vendor_ref: string | null;
  is_major_incident: boolean;
  is_security_incident: boolean;
  satisfaction_score: number | null;
  can: TicketCan;
  comments: TicketComment[];
  history: TicketHistoryEntry[];
  approvals: ApprovalStep[];
  checklist: ChecklistEntry[];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface KbArticle {
  id: number;
  title: string;
  summary: string | null;
  body_markdown: string;
  category: { id: number; name_th: string };
  visibility: 'public' | 'internal' | 'agent_only';
  status: 'draft' | 'published' | 'archived';
  tags: string[];
  author: UserRef;
  view_count: number;
  helpful_count: number;
  not_helpful_count: number;
  published_at: string | null;
  updated_at: string;
}

export interface NotificationItem {
  id: number;
  event_type: string;
  title: string;
  body: string;
  ticket: { id: number; ticket_no: string } | null;
  channel: 'in_app' | 'email' | 'line';
  read_at: string | null;
  created_at: string;
}

export interface AdminUser {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  employee_code: string | null;
  phone: string | null;
  job_title: string | null;
  company: CompanyRef;
  department: { id: number; name: string } | null;
  roles: RoleCode[];
  scoped_companies: CompanyRef[];
  is_active: boolean;
  is_locked: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
}

export interface Department {
  id: number;
  company: CompanyRef;
  name: string;
  user_count: number;
  is_active: boolean;
}

export interface TicketCategory {
  id: number;
  code: string;
  name_th: string;
  parent_id: number | null;
  company: CompanyRef | null;
  default_impact: 'org_wide' | 'department' | 'individual';
  default_urgency: 'high' | 'medium' | 'low';
  default_assignee: UserRef | null;
  sort_order: number;
  is_active: boolean;
}

export interface SlaTarget {
  priority: Priority;
  response_minutes: number;
  resolution_minutes: number;
  clock_mode: 'business_hours' | 'calendar_24x7';
  status_report_interval_minutes: number | null;
  escalation_percent: number;
}

export interface SlaPolicy {
  id: number;
  name: string;
  doc_ref: string;
  doc_version: string;
  effective_from: string;
  effective_to: string | null;
  is_default: boolean;
  targets: SlaTarget[];
}

export interface BusinessHoursRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_working_day: boolean;
}

export interface Holiday {
  id: number;
  holiday_date: string;
  name: string;
}

export interface Company extends CompanyRef {
  name_en: string | null;
  contact_email: string | null;
  is_active: boolean;
  user_count: number;
  open_ticket_count: number;
}

export interface RoleWithPermissions {
  id: number;
  code: RoleCode;
  name_th: string;
  description: string;
  is_system: boolean;
  permissions: string[];
  user_count: number;
}

export interface PermissionInfo {
  code: string;
  group_name: string;
  description: string;
}

export interface AuditEntry {
  id: number;
  actor: UserRef | null;
  company: CompanyRef | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  ip_address: string | null;
  created_at: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
}

export interface SystemInfo {
  version: string;
  environment: string;
  database: { version: string; size_mb: number };
  counts: { users: number; tickets: number; open_tickets: number; kb_articles: number };
  last_backup_at: string | null;
  backup_destination: string | null;
  uptime_seconds: number;
}

export interface DashboardSummary {
  open_tickets: number;
  breached: number;
  at_risk: number;
  resolved_this_month: number;
  sla_compliance_percent: number;
  avg_first_response_minutes: number;
  by_priority: { priority: Priority; count: number }[];
  by_status: { status: TicketStatus; count: number }[];
  trend: { date: string; created: number; resolved: number }[];
  top_categories: { name: string; count: number }[];
}

export interface SlaComplianceRow {
  company: CompanyRef;
  priority: Priority;
  total: number;
  met: number;
  excluded: number;
  compliance_percent: number;
}

// ── โมดูลผู้ดูแลระบบ ─────────────────────────────────────────────────
// ส่วนที่เอกสาร UI ยังไม่มีหน้าจอกำกับ แต่มีตารางในฐานข้อมูลแล้ว

export interface EscalationContact {
  id: number;
  /** null = ระดับกลุ่ม ใช้กับทุกบริษัท */
  company: CompanyRef | null;
  contact_key: string;
  user: UserRef;
  is_primary: boolean;
  is_active: boolean;
}

export interface EscalationRule {
  id: number;
  company: CompanyRef | null;
  code: string;
  trigger_type: string;
  priority: Priority | null;
  threshold_minutes: number | null;
  threshold_clock_mode: 'business_hours' | 'calendar_24x7';
  /** รายชื่อ contact_key คั่นด้วยจุลภาค — ว่างได้ แปลว่าแจ้งเฉพาะผู้รับผิดชอบ */
  notify_contact_keys: string;
  notify_roles: string | null;
  repeat_interval_minutes: number | null;
  notify_outside_business_hours: boolean;
  is_active: boolean;
}

export interface ServiceRecord {
  id: number;
  company: CompanyRef | null;
  code: string;
  name_th: string;
  service_group: string;
  service_tier: string;
  owner: UserRef | null;
  is_24x7: boolean;
  is_active: boolean;
  /** คำนวณตอนอ่าน ไม่ได้เก็บในตาราง */
  uptime_percent_month: number | null;
  open_outage_count: number;
}

export interface ServiceOutage {
  id: number;
  service: { id: number; name_th: string };
  ticket: { id: number; ticket_no: string } | null;
  started_at: string;
  ended_at: string | null;
  is_planned: boolean;
  cause: string | null;
  recorded_by: UserRef | null;
}

export interface MaintenanceWindow {
  id: number;
  company: CompanyRef | null;
  service: { id: number; name_th: string } | null;
  planned_start: string;
  planned_end: string;
  notified_at: string | null;
  notice_lead_business_days: number;
  description: string;
  created_by: UserRef | null;
}

export interface ProblemRecord {
  id: number;
  company: CompanyRef | null;
  code: string;
  title: string;
  service: { id: number; name_th: string } | null;
  root_cause_code: string | null;
  root_cause_note: string | null;
  status: 'open' | 'rca_pending' | 'fixed' | 'closed';
  opened_at: string;
  rca_due_at: string | null;
  rca_submitted_at: string | null;
  owner: UserRef | null;
  closed_at: string | null;
  /** จำนวน incident ที่ผูกกับ problem นี้ — ใช้กับ KPI-7 */
  linked_incident_count: number;
}

export interface CatalogItem {
  id: number;
  company: CompanyRef | null;
  code: string;
  name_th: string;
  category: { id: number; name_th: string } | null;
  default_priority: Priority;
  target_minutes: number | null;
  clock_start_event: string;
  requires_approval: boolean;
  approval_chain: string | null;
  checklist_template: { id: number; name_th: string } | null;
  is_active: boolean;
}

export interface ChecklistTemplateItem {
  id: number;
  sort_order: number;
  title_th: string;
  is_required: boolean;
  evidence_required: boolean;
  default_role_code: string | null;
}

export interface ChecklistTemplate {
  id: number;
  company: CompanyRef | null;
  code: string;
  name_th: string;
  doc_ref: string | null;
  version: number;
  is_active: boolean;
  items: ChecklistTemplateItem[];
}

export interface ApprovedSoftware {
  id: number;
  company: CompanyRef | null;
  name: string;
  version: string | null;
  license_type: string | null;
  note: string | null;
  is_active: boolean;
}

/** รายการตรวจความพร้อมก่อนเปิดใช้งานจริง แสดงบนหน้าแรกของโมดูลผู้ดูแล */
export interface ReadinessCheck {
  key: string;
  label: string;
  detail: string;
  status: 'ok' | 'warning' | 'blocking';
  href: string;
  /** รหัสคำถามที่ค้างกับฝ่ายจัดการ เช่น Q-03 */
  ref: string | null;
}
