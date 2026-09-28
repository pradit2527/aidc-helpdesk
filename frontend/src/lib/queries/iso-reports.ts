import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { Priority, TicketStatus } from '@/config/enums';
import { api } from '@/lib/api';
import type { KpiReport } from '@/lib/queries/operations';

/**
 * รายงานตามโครง ISO/IEC 20000-1
 *
 *   GET /reports/service-performance  รายงานผลการให้บริการประจำเดือน (§8.3.3 · §9.1)
 *   GET /reports/team-kpi             KPI รายบุคคลของทีมสนับสนุน (อิง SLA + คะแนนผู้ใช้)
 *
 * ทุกค่าเปอร์เซ็นต์เป็น null ได้เมื่อตัวหารเป็นศูนย์ — ห้ามแสดงเป็น 0 หรือ 100
 */

export type OverallStatus = 'on_target' | 'at_risk' | 'off_target' | 'no_data';

interface Ratio {
  eligible: number;
  met: number;
  percent: number | null;
}

export interface ServicePerformanceReport {
  document: {
    report_no: string;
    period: { from: string; to: string; label: string };
    previous_period: { from: string; to: string; label: string };
    generated_at: string;
    sla_policy: { doc_ref: string; doc_version: string; effective_from: string } | null;
  };
  summary: { status: OverallStatus; failing: string[]; p1_resolution_breaches: number };
  kpi: KpiReport;
  kpi_previous: { period: { from: string; to: string; label: string }; items: { code: string; value: number | null }[] };
  sla_by_priority: {
    priority: Priority;
    response_target_minutes: number | null;
    resolution_target_minutes: number | null;
    clock_mode: string | null;
    response: Ratio;
    resolution: Ratio & { done: number; excluded: number };
  }[];
  volume: {
    created: { incident: number; service_request: number };
    resolved: { incident: number; service_request: number };
    closed: number;
    backlog: { priority: Priority; open: number; overdue: number }[];
    by_company: {
      company: { id: number; code: string };
      created: number;
      done: number;
      sla_met_percent: number | null;
      csat_avg: number | null;
      csat_count: number;
    }[];
    top_categories: { name: string; count: number }[];
  };
  major_incidents: {
    id: number;
    ticket_no: string;
    subject: string;
    priority: Priority;
    status: TicketStatus;
    company_code: string;
    is_security_incident: boolean;
    created_at: string;
    resolved_at: string | null;
    breached: boolean;
    problem: { code: string; status: string | null; rca_due_at: string | null; rca_submitted_at: string | null } | null;
  }[];
  breaches: {
    response_breached: number;
    resolution_p1_p2: {
      id: number;
      ticket_no: string;
      subject: string;
      priority: Priority;
      status: TicketStatus;
      company_code: string;
      assignee_name: string | null;
      due_at: string | null;
      resolved_at: string | null;
    }[];
    resolution_p3_p4: { priority: Priority; count: number }[];
  };
  problems: { opened: number; closed: number; open_now: number; rca_overdue: number };
  availability: {
    service: { id: number; code: string; name_th: string };
    tier: string;
    is_24x7: boolean;
    outages: number;
    down_minutes: number;
    uptime_percent: number | null;
    target_percent: number | null;
    meets_target: boolean | null;
  }[];
  csat: { avg: number | null; rated: number; closed: number; response_rate_percent: number | null; target: number };
  improvement: { sip_required: boolean; failing: string[] };
}

export function useServicePerformanceReport(
  from: string,
  to: string,
): UseQueryResult<ServicePerformanceReport, Error> {
  return useQuery({
    queryKey: ['reports', 'service-performance', { from, to }],
    queryFn: () => api.get<ServicePerformanceReport>('/reports/service-performance', { from, to }),
  });
}

export interface TeamKpiMetrics {
  resolved: number;
  response: Ratio;
  resolution: Ratio;
  csat: { count: number; avg: number | null; low: number };
  reopen_percent: number | null;
  open_now: number;
  overdue_now: number;
  score: number | null;
  meets: { response: boolean | null; resolution: boolean | null; csat: boolean | null };
  enough_data: boolean;
}

export interface TeamKpiRow extends TeamKpiMetrics {
  user: { id: number; full_name: string };
  teams: { id: number; name: string; is_lead: boolean }[];
}

export interface TeamKpiReport {
  period: { from: string; to: string; label: string };
  /** team = เห็นทุกคนในขอบเขต · self = ทีม support เห็นเฉพาะของตัวเอง */
  visibility: 'team' | 'self';
  teams: { id: number; name: string }[];
  selected_team_id: number | null;
  rules: {
    targets: { response_met_percent: number; resolution_met_percent: number; csat_avg: number };
    weights: { resolution: number; response: number; csat: number };
    min_sample: number;
  };
  totals: TeamKpiMetrics;
  rows: TeamKpiRow[];
}

export function useTeamKpiReport(
  from: string,
  to: string,
  teamId: string,
): UseQueryResult<TeamKpiReport, Error> {
  return useQuery({
    queryKey: ['reports', 'team-kpi', { from, to, teamId }],
    queryFn: () =>
      api.get<TeamKpiReport>('/reports/team-kpi', { from, to, ...(teamId ? { team_id: teamId } : {}) }),
  });
}

/**
 * รายงานความมั่นคงปลอดภัยสารสนเทศ ตามโครง ISO/IEC 27001:2022
 *
 *   GET /reports/security  — เปิดได้เฉพาะหัวหน้าไอที · CEO · DPO · ผู้ดูแลระบบ (คนอื่นได้ 403)
 *
 * ค่าที่เป็น null แปลว่า "ระบบยังไม่มีข้อมูลให้วัด" ไม่ใช่ศูนย์ — หน้าจอต้องแยกสองอย่างนี้
 */
export type CheckStatus = 'pass' | 'fail' | 'no_data';

export interface SecurityCheck {
  code: string;
  control: string;
  title: string;
  status: CheckStatus;
  detail: string;
}

export interface SecurityReport {
  document: {
    report_no: string;
    standard: string;
    period: { from: string; to: string; label: string };
    previous_period: { from: string; to: string };
    generated_at: string;
  };
  summary: { status: OverallStatus; failing: string[]; checks: SecurityCheck[] };
  incidents: {
    total: number;
    previous_total: number;
    p1: number;
    still_open: number;
    reopened: number;
    response_met_percent: number | null;
    resolution_breached: number;
    avg_minutes_to_response: number | null;
    avg_minutes_to_resolve: number | null;
    by_category: { code: string; name: string; count: number }[];
  };
  access: {
    requests_total: number;
    requests_by_kind: { code: string; name: string; count: number }[];
    offboarding_total: number;
    offboarding_done: number;
    approvals_decided: number;
    approvals_rejected: number;
    approvals_pending: number;
    approvals_pending_over_target: number;
    avg_approval_hours: number | null;
    grants_total: number;
    grants_with_expiry: number;
    grants_expired_still_present: number;
    admin_accounts: number;
    locked_accounts: number;
    dormant_accounts: number;
    never_logged_in: number;
    active_accounts: number;
  };
  audit: {
    entries: number;
    by_action: { action: string; count: number }[];
    status_changes: number;
    status_changes_audited: number;
    coverage_percent: number | null;
    entries_with_origin: number;
    first_entry_at: string | null;
  };
  evidence_gaps: { control: string; title: string; missing: string; action: string }[];
  targets: { approval_pending_days: number; dormant_account_days: number };
}

export function useSecurityReport(
  from: string,
  to: string,
  enabled = true,
): UseQueryResult<SecurityReport, Error> {
  return useQuery({
    queryKey: ['reports', 'security', { from, to }],
    queryFn: () => api.get<SecurityReport>('/reports/security', { from, to }),
    enabled,
  });
}
