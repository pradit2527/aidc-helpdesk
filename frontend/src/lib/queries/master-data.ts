import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '@/lib/api';

/**
 * ข้อมูลหลักที่หน้าผู้ดูแลใช้
 *
 * ข้อมูลกลุ่มนี้เปลี่ยนน้อยมาก (บริษัท แผนก หมวดหมู่ นโยบาย SLA)
 * จึงตั้ง staleTime ยาวกว่าค่าเริ่มต้น เพื่อไม่ให้ยิงซ้ำทุกครั้งที่สลับหน้า
 *
 * ⚠️ ไม่ใช้กับข้อมูลที่เปลี่ยนตลอดเวลาอย่าง ticket — ค่าเก่าค้าง 5 นาที
 *    บนหน้าที่ต้องเห็นสถานะล่าสุดจะทำให้ตัดสินใจจากข้อมูลผิด
 */
const MASTER_DATA_STALE_MS = 5 * 60_000;

export const masterKeys = {
  all: ['master'] as const,
  of: (name: string) => [...masterKeys.all, name] as const,
};

function useMaster<T>(name: string, path: string): UseQueryResult<T[], Error> {
  return useQuery({
    queryKey: masterKeys.of(name),
    queryFn: () => api.get<T[]>(path),
    staleTime: MASTER_DATA_STALE_MS,
  });
}

export interface CompanyRow {
  id: number;
  code: string;
  name_th: string;
  name_en: string | null;
  contact_email: string | null;
  is_active: boolean;
}

export interface DepartmentRow {
  id: number;
  name: string;
  company_id: number;
  company_code: string;
  is_active: boolean;
}

export interface CategoryRow {
  id: number;
  code: string;
  name_th: string;
  parent_id: number | null;
  default_impact: string | null;
  default_urgency: string | null;
  sort_order: number | null;
  is_active: boolean;
}

export interface CatalogItemRow {
  id: number;
  code: string;
  name_th: string;
  category_id: number | null;
  requires_approval: boolean;
  lead_time_days: number | null;
  target_minutes: number | null;
  is_active: boolean;
}

export interface ServiceRow {
  id: number;
  code: string;
  name_th: string;
  service_group: string | null;
  service_tier: string | null;
  is_active: boolean;
}

export interface ApprovedSoftwareRow {
  id: number;
  name: string;
  version: string | null;
  license_type: string | null;
  note: string | null;
  is_active: boolean;
}

export interface SlaPolicyRow {
  id: number;
  name: string;
  company_id: number | null;
  doc_ref: string | null;
  doc_version: string | null;
  is_default: boolean;
  is_active: boolean;
  targets: {
    priority: string;
    response_minutes: number;
    resolution_minutes: number;
    clock_mode: string;
    escalation_percent: number | null;
  }[];
}

export interface BusinessHoursRow {
  id: number;
  company_id: number | null;
  company_code: string | null;
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  is_working_day: boolean;
}

export interface HolidayRow {
  id: number;
  company_id: number | null;
  date: string;
  name: string;
}

export interface EscalationRuleRow {
  id: number;
  code: string;
  company_id: number | null;
  trigger_type: string;
  priority: string | null;
  threshold_minutes: number | null;
  threshold_clock_mode: string | null;
  notify_contact_keys: unknown;
  notify_roles: unknown;
  repeat_interval_minutes: number | null;
  notify_outside_business_hours: boolean;
  is_active: boolean;
}

export interface ChecklistTemplateRow {
  id: number;
  code: string;
  name_th: string;
  doc_ref: string | null;
  version: string | null;
  is_active: boolean;
  items: {
    id: number;
    title_th: string;
    description: string | null;
    is_required: boolean;
    evidence_required: boolean;
    sort_order: number | null;
  }[];
}

export interface RoleRow {
  id: number;
  code: string;
  name_th: string;
  description: string | null;
  is_system: boolean;
  permissions: string[];
}

export interface PermissionRow {
  id: number;
  code: string;
  group_name: string | null;
  description: string | null;
}

export const useCompanies = () => useMaster<CompanyRow>('companies', '/companies');
export const useDepartments = () => useMaster<DepartmentRow>('departments', '/departments');
export const useCategories = () => useMaster<CategoryRow>('categories', '/categories');
export const useCatalogItems = () => useMaster<CatalogItemRow>('catalog-items', '/catalog-items');
export const useServices = () => useMaster<ServiceRow>('services', '/services');
export const useApprovedSoftware = () =>
  useMaster<ApprovedSoftwareRow>('approved-software', '/approved-software');
export const useSlaPolicies = () => useMaster<SlaPolicyRow>('sla-policies', '/sla-policies');
export const useBusinessHours = () => useMaster<BusinessHoursRow>('business-hours', '/business-hours');
export const useHolidays = () => useMaster<HolidayRow>('holidays', '/holidays');
export const useEscalationRules = () =>
  useMaster<EscalationRuleRow>('escalation-rules', '/escalation-rules');
export const useChecklistTemplates = () =>
  useMaster<ChecklistTemplateRow>('checklist-templates', '/checklist-templates');
export const useRoles = () => useMaster<RoleRow>('roles', '/roles');
export const usePermissions = () => useMaster<PermissionRow>('permissions', '/permissions');

export interface DashboardSummary {
  scope: { company_codes: string[] };
  open_tickets: number;
  breached: number;
  due_soon: number;
  resolved_this_month: number;
  /** null = ยังไม่มีเรื่องปิดในเดือนนี้ — ห้ามแสดงเป็น 100% */
  sla_compliance_percent: number | null;
  by_priority: { priority: string; count: number }[];
  by_status: { status: string; count: number }[];
}

export function useDashboardSummary(): UseQueryResult<DashboardSummary, Error> {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.get<DashboardSummary>('/dashboard/summary'),
  });
}

export interface SystemInfo {
  app: { version: string; environment: string; timezone: string; uptime_seconds: number };
  database: { version: string; size_mb: number; table_count: number };
  counts: { users: number; tickets: number; open_tickets: number; kb_articles: number };
  /** configured=false แปลว่ายังไม่ได้ตั้งค่าสำรองข้อมูลจริง ห้ามแสดงเวลาปลอม */
  backup: { configured: boolean; last_run_at: string | null };
}

export function useSystemInfo(): UseQueryResult<SystemInfo, Error> {
  return useQuery({
    queryKey: ['system', 'info'],
    queryFn: () => api.get<SystemInfo>('/system/info'),
  });
}
