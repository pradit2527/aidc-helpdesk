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
  /** โครงการที่รับซัพพอร์ต (AIDC Support Hub) — ว่าง = ทุกโครงการ รวมเรื่องที่ไม่ได้มาจากโครงการใด */
  project_id?: number | undefined;
  /** 'incident' | 'service_request' · ว่าง = ทั้งสองประเภท */
  ticket_type?: string | undefined;
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
  /**
   * เหตุผลย่อยของการพัก — ข้อความอิสระ ไม่ใช่ enum อีกต่อไป
   *
   * เดิมเป็น 'user' | 'vendor' | 'approval' เพราะสถานะเดียวต้องแบกความหมายทั้งสาม
   * ตอนนี้สถานะบอกเองแล้ว backend จึงถอด CHECK ออกและปล่อยเป็นข้อความอิสระ
   */
  pending_reason: string | null;
  priority: Priority;
  company: CompanyRef;
  department: { id: number; name: string } | null;
  category: { id: number; name_th: string };
  requester: UserRef;
  assignee: UserRef | null;
  /**
   * โครงการที่เรื่องนี้ถูกยกมาจากแชท — null = แจ้งผ่านช่องทางปกติ ไม่ได้มาจากโครงการใด
   *
   * optional บนสายเพราะเพิ่มมาพร้อม Support Hub — API รุ่นที่ยังไม่ส่งช่องนี้
   * ต้องได้รายงานหน้าตาเดิม ไม่ใช่คอลัมน์ที่ว่างทั้งแถว
   */
  support_project?: { id: number; code: string; name: string } | null;
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

/**
 * ตัวชี้วัดเฉพาะของเหตุขัดข้อง — บล็อก `incident_metrics` ของ GET /reports/tickets
 *
 * ⚠️ คำนวณจากใบที่ ticket_type = incident เสมอ ไม่ว่าจะส่งตัวกรอง ticket_type มาหรือไม่
 *    ตัวเลขชุดนี้จึงไม่เคยปนกับคำขอบริการ แม้ผู้ใช้จะไม่ได้กรองประเภทเลยก็ตาม
 */
export interface IncidentMetrics {
  total: number;
  /** MTTR — เวลาเฉลี่ยถึง resolved หน่วยนาทีทำการ (หักเวลาที่หยุดนับแล้ว) · null = ยังไม่มีใบที่แก้เสร็จ */
  mttr_business_minutes: number | null;
  /** ตัวหารของ MTTR */
  resolved_count: number;
  /** ในกลุ่มที่จบแล้ว: ไม่เกินกำหนด ÷ จบแล้ว × 100 · null = ตัวหารเป็นศูนย์ */
  sla_met_percent: number | null;
  /** ผลรวม reopen_count ของทุกใบ — จำนวน "ครั้ง" */
  reopen_total: number;
  /** จำนวน "ใบ" ที่เคยถูกเปิดคืนอย่างน้อยหนึ่งครั้ง */
  reopened_tickets: number;
}

export interface TopCatalogItem {
  id: number;
  code: string;
  name_th: string;
  count: number;
}

/** ตัวชี้วัดเฉพาะของคำขอบริการ — บล็อก `service_request_metrics` */
export interface ServiceRequestMetrics {
  total: number;
  /**
   * เวลาเฉลี่ยถึง fulfilled หน่วยนาทีทำการ · null = ยังไม่มีใบที่ส่งมอบ
   *
   * จุดเริ่มคือเวลาที่อนุมัติครบ ไม่ใช่เวลาที่เปิดเรื่อง — เวลาที่รอหัวหน้าอนุมัติ
   * จึงไม่ถูกนับเป็นเวลาของไอที ซึ่งต้องเขียนกำกับไว้บนหน้าจอด้วย
   */
  avg_fulfillment_business_minutes: number | null;
  /** ตัวหารของเวลาเฉลี่ย */
  fulfilled_count: number;
  /** ใบที่ค้างใน pending_approval ณ ตอนนี้ — คอขวดที่ไอทีแก้เองไม่ได้ */
  pending_approval_count: number;
  rejected_count: number;
  /** สูงสุด 10 รายการ เรียงมากไปน้อย */
  top_catalog_items: TopCatalogItem[];
}

export interface TicketReport {
  period: { from: string; to: string; label: string };
  filters: {
    company_id: number | null;
    department_id: number | null;
    status: TicketStatus[];
    assignee_id: number | null;
    requester_id: number | null;
    ticket_type?: 'incident' | 'service_request' | null;
  };
  totals: TicketReportTotals;
  /**
   * ตัวชี้วัดแยกตามประเภท — backend ส่งมา**ทั้งสองบล็อกเสมอ**
   *
   * optional บนสายไว้เผื่อ API รุ่นก่อนหน้าที่ยังไม่มีบล็อกนี้เท่านั้น
   * หน้าจอจึงต้องทนทั้งกรณีที่ไม่มี และกรณีที่มีแต่ total เป็นศูนย์
   */
  incident_metrics?: IncidentMetrics | null;
  service_request_metrics?: ServiceRequestMetrics | null;
  /** ครบทุกสถานะที่ประเภทในขอบเขตใช้เสมอ */
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
