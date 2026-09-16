import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { Priority, TicketStatus } from '@/config/enums';
import { api } from '@/lib/api';
import type { CompanyRef, UserRef } from '@/lib/types';

/**
 * รายงานเรื่องแจ้งแบบกรองได้ — GET /reports/tickets
 *
 * รายงาน KPI และ SLA รายเดือนยังอยู่ใน operations.ts ตามเดิม
 * ไฟล์นี้แยกออกมาเพราะรายงานตัวนี้มีทั้งตัวกรองและรูปร่างคำตอบที่ใหญ่กว่ามาก
 * การยัดรวมจะทำให้ไฟล์เดิมยาวจนหาอะไรไม่เจอ
 */

/**
 * เป็น type ไม่ใช่ interface โดยตั้งใจ — api.get รับ Record ที่มี index signature
 * ซึ่ง interface ไม่ถูกมองว่าเข้ากันได้ แต่ object type ธรรมดาเข้ากันได้เอง
 */
export type TicketReportParams = {
  company_id?: number | undefined;
  department_id?: number | undefined;
  /** คั่นด้วยจุลภาค · ว่าง = ทุกสถานะ */
  status?: string | undefined;
  assignee_id?: number | undefined;
  requester_id?: number | undefined;
  /** ISO 8601 · ค่าเริ่มต้นฝั่ง backend = ต้นเดือนปัจจุบัน */
  from?: string | undefined;
  /** ISO 8601 · ค่าเริ่มต้นฝั่ง backend = ตอนนี้ */
  to?: string | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
};

export interface TicketReportTotals {
  total: number;
  /** new + assigned + in_progress + pending_user */
  open: number;
  resolved: number;
  closed: number;
  cancelled: number;
  /** เกินกำหนดแก้ไข — ตัดใบที่มีเหตุยกเว้น SLA ออกแล้ว */
  breached: number;
  /** null = ยังไม่มีเรื่องเลย ไม่ใช่ 0% */
  breached_percent: number | null;
  /** null = ยังไม่มีใบไหนถูกประเมิน */
  avg_satisfaction: number | null;
  rated: number;
}

/** ตัวเลขชุดเดียวกันที่ใช้กับทุกมิติ */
export interface TicketReportRollup {
  total: number;
  open: number;
  /** resolved + closed */
  done: number;
  breached: number;
  /** ในกลุ่ม done · null เมื่อ done = 0 */
  met_percent: number | null;
}

export interface TicketReportAssigneeRow extends TicketReportRollup {
  /** null = เรื่องที่ยังไม่มีผู้รับผิดชอบ */
  assignee: UserRef | null;
}

export interface TicketReportCompanyRow extends TicketReportRollup {
  company: CompanyRef;
}

export interface TicketReportDepartmentRow extends TicketReportRollup {
  company: CompanyRef;
  /** null = ไม่ระบุแผนก */
  department: { id: number; name: string } | null;
}

/**
 * แถวรายการในรายงาน — รูปย่อของ TicketListItem
 *
 * ไม่มีบล็อก sla แบบเต็ม จึงใช้กับ <TicketList> ไม่ได้ — หน้ารายงานมีตารางของตัวเอง
 * ที่แสดงแค่ "ทันหรือเกิน" ซึ่งเป็นสิ่งเดียวที่รายงานต้องการ
 */
export interface TicketReportItem {
  id: number;
  ticket_no: string;
  ticket_type: 'incident' | 'service_request';
  subject: string;
  status: TicketStatus;
  pending_reason: 'user' | 'vendor' | 'approval' | null;
  priority: Priority;
  company: CompanyRef;
  department: { id: number; name: string } | null;
  category: { id: number; name_th: string };
  requester: UserRef;
  assignee: UserRef | null;
  created_at: string;
  resolution_due_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  is_resolution_breached: boolean;
  sla_exclusion_code: string | null;
  satisfaction_score: number | null;
  reopen_count: number;
  updated_at: string;
}

export interface TicketReport {
  period: { from: string; to: string; label: string };
  filters: {
    company_id: number | null;
    department_id: number | null;
    status: TicketStatus[];
    assignee_id: number | null;
    requester_id: number | null;
  };
  totals: TicketReportTotals;
  /** ครบทั้ง 7 สถานะเสมอ */
  by_status: { status: TicketStatus; count: number }[];
  /** ครบ P1–P4 เสมอ */
  by_priority: { priority: Priority; count: number }[];
  by_assignee: TicketReportAssigneeRow[];
  by_company: TicketReportCompanyRow[];
  by_department: TicketReportDepartmentRow[];
  tickets: {
    items: TicketReportItem[];
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export function useTicketReport(params: TicketReportParams): UseQueryResult<TicketReport, Error> {
  return useQuery({
    queryKey: ['reports', 'tickets', params],
    queryFn: () => api.get<TicketReport>('/reports/tickets', params),
    /*
     * คงรายงานชุดก่อนไว้ระหว่างเปลี่ยนตัวกรอง
     *
     * ไม่งั้นทั้งหน้าจะหายเป็นตัวหมุนทุกครั้งที่กดชิปสถานะหนึ่งอัน
     * แล้วความสูงของหน้ากระโดดกลับมาใหม่ ซึ่งทำให้เทียบตัวเลขก่อน–หลังไม่ได้
     */
    placeholderData: (previous) => previous,
  });
}
