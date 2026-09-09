import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '@/lib/api';
import type {
  ApprovedSoftware,
  CatalogItem,
  ChecklistTemplate,
  Company,
  DashboardSummary,
  Department,
  EscalationContact,
  EscalationRule,
  Holiday,
  MaintenanceWindow,
  PermissionInfo,
  ReadinessCheck,
  RoleWithPermissions,
  ServiceOutage,
  ServiceRecord,
  SlaPolicy,
  TicketCategory,
} from '@/lib/types';

/**
 * ข้อมูลหลักที่หน้าผู้ดูแลใช้
 *
 * ชนิดข้อมูลมาจาก @/lib/types ตัวเดียวกับที่หน้าจอใช้อยู่แล้ว
 * ไม่ประกาศชนิดซ้ำที่นี่ — ชนิดที่ประกาศสองที่จะเพี้ยนออกจากกันเสมอ
 * แล้วความเพี้ยนจะโผล่ตอนรันจริง ไม่ใช่ตอนคอมไพล์
 *
 * ข้อมูลกลุ่มนี้เปลี่ยนน้อยมาก (บริษัท แผนก หมวดหมู่ นโยบาย SLA)
 * จึงตั้ง staleTime ยาวกว่าค่าเริ่มต้น เพื่อไม่ให้ยิงซ้ำทุกครั้งที่สลับหน้า
 *
 * ⚠️ ห้ามใช้กับข้อมูลที่เปลี่ยนตลอดเวลาอย่าง ticket — ค่าเก่าค้าง 5 นาที
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

export const useCompanies = () => useMaster<Company>('companies', '/companies');
export const useDepartments = () => useMaster<Department>('departments', '/departments');
/**
 * หมวดหมู่ทั้งหมด รวมที่ปิดใช้งานแล้ว — สำหรับหน้าผู้ดูแล
 *
 * หน้าผู้ดูแลต้องเห็นหมวดที่ปิดไปแล้วเพื่อเปิดกลับหรือแก้ชื่อ
 * ถ้ากรองออกตั้งแต่ตรงนี้ หมวดที่ปิดจะดูเหมือนหายไปจากระบบ
 */
export const useCategories = () => useMaster<TicketCategory>('categories', '/categories');

/**
 * เฉพาะหมวดที่ยังเปิดใช้ — สำหรับฟอร์มแจ้งเรื่องใหม่
 *
 * แยกคีย์แคชจากตัวข้างบน มิฉะนั้นสองหน้าจะใช้ผลลัพธ์ร่วมกัน
 * แล้วหน้าไหนโหลดก่อนจะเป็นตัวกำหนดว่าอีกหน้าเห็นอะไร
 */
export const useActiveCategories = () =>
  useMaster<TicketCategory>('categories-active', '/categories?active_only=true');
export const useCatalogItems = () => useMaster<CatalogItem>('catalog-items', '/catalog-items');
export const useServices = () => useMaster<ServiceRecord>('services', '/services');
export const useApprovedSoftware = () =>
  useMaster<ApprovedSoftware>('approved-software', '/approved-software');
export const useSlaPolicies = () => useMaster<SlaPolicy>('sla-policies', '/sla-policies');
export const useHolidays = () => useMaster<Holiday>('holidays', '/holidays');
export const useEscalationRules = () =>
  useMaster<EscalationRule>('escalation-rules', '/escalation-rules');
export const useEscalationContacts = () =>
  useMaster<EscalationContact>('escalation-contacts', '/escalation-contacts');
export const useServiceOutages = () =>
  useMaster<ServiceOutage>('service-outages', '/service-outages');
export const useMaintenanceWindows = () =>
  useMaster<MaintenanceWindow>('maintenance-windows', '/maintenance-windows');
export const useChecklistTemplates = () =>
  useMaster<ChecklistTemplate>('checklist-templates', '/checklist-templates');
export const useRoles = () => useMaster<RoleWithPermissions>('roles', '/roles');
export const usePermissions = () => useMaster<PermissionInfo>('permissions', '/permissions');

/**
 * เวลาทำการ
 *
 * `company` เป็น null สำหรับแถวระดับกลุ่ม ซึ่งเป็นค่าเริ่มต้นที่ทุกบริษัท
 * ใช้ร่วมกันเมื่อไม่ได้กำหนดของตัวเอง — ห้ามกรองทิ้ง
 */
export interface BusinessHoursRow {
  id: number;
  company_id: number | null;
  company_code: string | null;
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  is_working_day: boolean;
}

export const useBusinessHours = () =>
  useMaster<BusinessHoursRow>('business-hours', '/business-hours');

export function useDashboardSummary(): UseQueryResult<DashboardSummary, Error> {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.get<DashboardSummary>('/dashboard/summary'),
  });
}

export interface SystemInfoResponse {
  app: { version: string; environment: string; timezone: string; uptime_seconds: number };
  database: { version: string; size_mb: number; table_count: number };
  counts: { users: number; tickets: number; open_tickets: number; kb_articles: number };
  /** configured=false แปลว่ายังไม่ได้ตั้งค่าสำรองข้อมูลจริง ห้ามแสดงเวลาปลอม */
  backup: { configured: boolean; last_run_at: string | null };
}

export function useSystemInfo(): UseQueryResult<SystemInfoResponse, Error> {
  return useQuery({
    queryKey: ['system', 'info'],
    queryFn: () => api.get<SystemInfoResponse>('/system/info'),
  });
}

export interface ReadinessResponse {
  ready: boolean;
  blocking_count: number;
  checks: ReadinessCheck[];
}

export function useReadiness(): UseQueryResult<ReadinessResponse, Error> {
  return useQuery({
    queryKey: ['admin', 'readiness'],
    queryFn: () => api.get<ReadinessResponse>('/admin/readiness'),
  });
}
