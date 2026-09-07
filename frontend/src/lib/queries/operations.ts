import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { api, type Page } from '@/lib/api';
import type {
  AdminUser,
  AuditEntry,
  KbArticle,
  NotificationItem,
  ProblemRecord,
  SlaComplianceRow,
} from '@/lib/types';

/**
 * หนึ่งแถวในคิวอนุมัติ
 *
 * ต่างจาก ApprovalStep ใน @/lib/types ตรงที่แถวนี้เป็นมุมมอง "ข้าม ticket"
 * จึงพก ticket_no / subject / priority มาด้วย ส่วน ApprovalStep เป็นขั้น
 * ที่อยู่ในหน้ารายละเอียด ticket ใบเดียวซึ่งรู้บริบทเหล่านั้นอยู่แล้ว
 */
export interface ApprovalItem {
  id: number;
  ticket_id: number;
  ticket_no: string;
  subject: string;
  priority: string;
  company_code: string;
  seq: number;
  approver_type: string;
  approver_id: number | null;
  approver_name: string | null;
  requester_name: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  comment: string | null;
  requested_at: string;
  due_at: string | null;
  decided_at: string | null;
  access_expires_at: string | null;
  /** คำนวณฝั่งเซิร์ฟเวอร์ — นาฬิกาของแต่ละเครื่องไม่ตรงกัน */
  is_overdue: boolean;
}

/**
 * ข้อมูลที่เปลี่ยนบ่อย — ไม่ตั้ง staleTime ยาวเหมือนข้อมูลหลัก
 *
 * รายการรออนุมัติและการแจ้งเตือนต้องสดเสมอ ค่าที่ค้างอยู่ห้านาที
 * ทำให้ผู้ใช้กดอนุมัติใบที่คนอื่นเพิ่งอนุมัติไปแล้ว
 */

/** ผลลัพธ์แบ่งหน้า — api.page() แกะซองให้แล้ว */
export type Paged<T> = Page<T>;

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ── ผู้ใช้ ────────────────────────────────────────────────────────────

export interface UserListParams {
  q?: string | undefined;
  company_id?: number | undefined;
  is_active?: string | undefined;
  page?: number | undefined;
}

export function useUsers(params: UserListParams = {}): UseQueryResult<Paged<AdminUser>, Error> {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () =>
      api.page<AdminUser>(`/users${query({ ...params, page: params.page ?? 1, page_size: 20 })}`),
  });
}

export function useUser(id: number): UseQueryResult<AdminUser, Error> {
  return useQuery({
    queryKey: ['users', id],
    queryFn: () => api.get<AdminUser>(`/users/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

// ── ร่องรอยการใช้งาน ─────────────────────────────────────────────────

export interface AuditListParams {
  action?: string | undefined;
  entity_type?: string | undefined;
  actor_id?: number | undefined;
  date_from?: string | undefined;
  date_to?: string | undefined;
  page?: number | undefined;
}

export function useAuditLogs(
  params: AuditListParams = {},
): UseQueryResult<Paged<AuditEntry>, Error> {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () =>
      api.page<AuditEntry>(
        `/audit-logs${query({ ...params, page: params.page ?? 1, page_size: 25 })}`,
      ),
  });
}

export function useAuditFacets(): UseQueryResult<
  { actions: string[]; entity_types: string[] },
  Error
> {
  return useQuery({
    queryKey: ['audit-logs', 'facets'],
    queryFn: () => api.get<{ actions: string[]; entity_types: string[] }>('/audit-logs/facets'),
    staleTime: 5 * 60_000,
  });
}

// ── คลังความรู้ ──────────────────────────────────────────────────────

export interface KbListParams {
  q?: string | undefined;
  category_id?: number | undefined;
  tag?: string | undefined;
  status?: string | undefined;
  page?: number | undefined;
}

/** รายการบทความไม่มี body_markdown — โหลดเนื้อหาเต็มตอนเปิดอ่านเท่านั้น */
export type KbArticleSummary = Omit<KbArticle, 'body_markdown'>;

export function useKbArticles(
  params: KbListParams = {},
): UseQueryResult<Paged<KbArticleSummary>, Error> {
  return useQuery({
    queryKey: ['kb', 'articles', params],
    queryFn: () =>
      api.page<KbArticleSummary>(
        `/kb/articles${query({ ...params, page: params.page ?? 1, page_size: 20 })}`,
      ),
  });
}

export function useKbArticle(id: number): UseQueryResult<KbArticle, Error> {
  return useQuery({
    queryKey: ['kb', 'articles', id],
    queryFn: () => api.get<KbArticle>(`/kb/articles/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useKbCategories(): UseQueryResult<
  { id: number; parent_id: number | null; name_th: string; sort_order: number }[],
  Error
> {
  return useQuery({
    queryKey: ['kb', 'categories'],
    queryFn: () =>
      api.get<{ id: number; parent_id: number | null; name_th: string; sort_order: number }[]>(
        '/kb/categories',
      ),
    staleTime: 5 * 60_000,
  });
}

// ── การแจ้งเตือน ─────────────────────────────────────────────────────

export interface NotificationsResponse extends Page<NotificationItem> {
  /** นับจากทั้งหมด ไม่ใช่จากหน้าปัจจุบัน — ใช้เป็นตัวเลขบนกระดิ่งได้ตรง ๆ */
  unread: number;
}

export function useNotifications(unreadOnly = false): UseQueryResult<NotificationsResponse, Error> {
  return useQuery({
    queryKey: ['notifications', { unreadOnly }],
    queryFn: async () => {
      const page = await api.page<NotificationItem>(
        `/notifications${query({ unread_only: unreadOnly ? 'true' : undefined, page_size: 50 })}`,
      );
      return { ...page, unread: page.unread ?? 0 };
    },
    // การแจ้งเตือนต้องสดกว่าข้อมูลอื่น — ค้างไว้ 30 วินาทีก็พอ
    staleTime: 30_000,
  });
}

export function useMarkNotificationsRead(): ReturnType<
  typeof useMutation<{ updated: number }, Error, { ids?: number[]; all?: boolean }>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids?: number[]; all?: boolean }) =>
      api.post<{ updated: number }>('/notifications/read', body),
    // ดึงใหม่ทั้งก้อนแทนการแก้แคชเอง — จำนวนที่ยังไม่อ่านคำนวณฝั่งเซิร์ฟเวอร์
    // การเดาค่าใหม่ที่ฝั่งนี้จะเพี้ยนทันทีที่มีการแจ้งเตือนใหม่เข้ามาพร้อมกัน
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export interface NotificationChannelRow {
  id: number;
  channel: string;
  destination: string | null;
  is_enabled: boolean;
  /** ตั้งจากหน้าจอไม่ได้ — ต้องผ่านการผูกบัญชีจริง (เช่น LINE) */
  is_verified: boolean;
}

export function useNotificationChannels(): UseQueryResult<NotificationChannelRow[], Error> {
  return useQuery({
    queryKey: ['notifications', 'channels'],
    queryFn: () => api.get<NotificationChannelRow[]>('/notifications/channels'),
    staleTime: 5 * 60_000,
  });
}

export function useSetNotificationChannels(): ReturnType<
  typeof useMutation<
    NotificationChannelRow[],
    Error,
    { channel: string; is_enabled: boolean; destination?: string | null }[]
  >
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channels: { channel: string; is_enabled: boolean; destination?: string | null }[]) =>
      api.put<NotificationChannelRow[]>('/notifications/channels', { channels }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications', 'channels'] }),
  });
}

export function useUpdateMe(): ReturnType<
  typeof useMutation<
    { id: number; username: string; full_name: string; email: string | null; phone: string | null },
    Error,
    { full_name?: string; email?: string | null; phone?: string | null }
  >
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { full_name?: string; email?: string | null; phone?: string | null }) =>
      api.patch<{
        id: number;
        username: string;
        full_name: string;
        email: string | null;
        phone: string | null;
      }>('/users/me', body),
    // ชื่อผู้ใช้แสดงอยู่บนแถบด้านบนด้วย จึงต้องดึง session ใหม่
    // ไม่ใช่แค่หน้าโปรไฟล์ที่เห็นค่าที่เปลี่ยน
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['session'] }),
  });
}

export interface ImportRowResult {
  line: number;
  username: string;
  full_name: string;
  company: string;
  status: 'ok' | 'error' | 'skipped';
  message: string;
}

export interface ImportResult {
  dry_run: boolean;
  rows: ImportRowResult[];
  summary: { total: number; ok: number; skipped: number; error: number };
}

export function useImportUsers(): ReturnType<
  typeof useMutation<
    ImportResult,
    Error,
    { csv: string; default_password?: string; dry_run?: boolean }
  >
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { csv: string; default_password?: string; dry_run?: boolean }) =>
      api.post<ImportResult>('/users/import', body),
    onSuccess: (r) => {
      // ดึงรายชื่อใหม่เฉพาะตอนที่เขียนจริง — dry run ไม่เปลี่ยนอะไร
      if (!r.dry_run) void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

// ── คำขออนุมัติ ──────────────────────────────────────────────────────

export function useApprovals(
  assignee: 'me' | undefined,
  status?: string,
): UseQueryResult<Paged<ApprovalItem>, Error> {
  return useQuery({
    queryKey: ['approvals', { assignee, status }],
    queryFn: () =>
      api.page<ApprovalItem>(`/approvals${query({ assignee, status, page_size: 50 })}`),
    staleTime: 30_000,
  });
}

export interface DecideInput {
  id: number;
  decision: 'approved' | 'rejected';
  comment?: string | undefined;
}

export function useDecideApproval(): ReturnType<
  typeof useMutation<
    { id: number; status: string; ticket_status: string; next_seq: number | null },
    Error,
    DecideInput
  >
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: DecideInput) =>
      api.post<{ id: number; status: string; ticket_status: string; next_seq: number | null }>(
        `/approvals/${id}/decide`,
        body,
      ),
    onSuccess: () => {
      // ทั้งคิวอนุมัติและรายการ ticket เปลี่ยนพร้อมกัน — ticket ที่อนุมัติครบแล้ว
      // ออกจากสถานะพัก ส่วนที่ถูกปฏิเสธกลายเป็นยกเลิก
      void qc.invalidateQueries({ queryKey: ['approvals'] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

// ── ปัญหา ────────────────────────────────────────────────────────────

export function useProblems(status?: string): UseQueryResult<Paged<ProblemRecord>, Error> {
  return useQuery({
    queryKey: ['problems', { status }],
    queryFn: () => api.page<ProblemRecord>(`/problems${query({ status, page_size: 50 })}`),
  });
}

// ── รายงาน ───────────────────────────────────────────────────────────

export interface KpiItem {
  code: string;
  name: string;
  /** null = ตัวหารเป็นศูนย์ ยังไม่มีข้อมูลพอวัด — ห้ามแสดงเป็น 0 หรือ 100 */
  value: number | null;
  unit: 'percent' | 'minutes' | 'score';
  target: number;
  direction: 'higher' | 'lower';
  meets_target: boolean | null;
  denominator: number;
  note?: string;
}

export interface KpiReport {
  period: { from: string; to: string; label: string };
  items: KpiItem[];
  /** KPI-2 แยกราย priority เสมอ — P1 นับปฏิทิน P2–P4 นับเวลาทำการ */
  kpi2_first_response: {
    code: string;
    name: string;
    target_minutes: number;
    by_priority: {
      priority: string;
      responded: number;
      avg_minutes: number | null;
      clock: string;
    }[];
  };
  csat: { sent: number; responded: number; response_rate_percent: number | null };
  sip_required: boolean;
  sip_reason: string | null;
}

export function useKpiReport(from?: string, to?: string): UseQueryResult<KpiReport, Error> {
  return useQuery({
    queryKey: ['reports', 'kpi', { from, to }],
    queryFn: () => api.get<KpiReport>(`/reports/kpi${query({ from, to })}`),
  });
}

export interface SlaComplianceReport {
  period: { from: string; to: string; label: string };
  target_percent: number;
  overall: { total: number; met: number; excluded: number; compliance_percent: number | null };
  by_company: (Omit<SlaComplianceRow, 'priority' | 'compliance_percent'> & {
    compliance_percent: number | null;
  })[];
  by_priority: (Omit<SlaComplianceRow, 'company' | 'compliance_percent'> & {
    compliance_percent: number | null;
  })[];
  /** หนึ่งแถวต่อคู่ (บริษัท × ระดับความสำคัญ) */
  matrix: (Omit<SlaComplianceRow, 'compliance_percent'> & {
    compliance_percent: number | null;
  })[];
}

export function useSlaComplianceReport(
  from?: string,
  to?: string,
): UseQueryResult<SlaComplianceReport, Error> {
  return useQuery({
    queryKey: ['reports', 'sla-compliance', { from, to }],
    queryFn: () => api.get<SlaComplianceReport>(`/reports/sla-compliance${query({ from, to })}`),
  });
}
