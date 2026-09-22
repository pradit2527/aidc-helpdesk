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
