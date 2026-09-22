import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import { PRIORITY, type Priority, type TicketStatus, type TicketType } from '../../common/constants';
import type { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.token';
import {
  appUser,
  company,
  problem,
  slaPolicy,
  slaTarget,
  supportTeam,
  supportTeamMember,
  ticket,
  ticketCategory,
} from '../../db/schema';
import {
  canSeeWholeTeam,
  overallStatus,
  percentOf,
  previousPeriod,
  reportNumber,
  TEAM_KPI,
  teamKpiScore,
  teamKpiVerdicts,
} from './iso-report-rules';
import {
  countWhere,
  IS_DONE,
  IS_OPEN,
  RESOLUTION_BREACHED,
  ReportsService,
  type ReportPeriod,
} from './reports.service';

/** จำนวนแถวสูงสุดในรายการเหตุร้ายแรงและรายการเกินกำหนด — รายงานรายเดือนไม่ใช่หน้าค้นหา */
const LIST_CAP = 100;

/**
 * ตอบรับทันเวลา: ตอบก่อนกำหนด
 * ตัวหาร: เรื่องที่ตอบแล้ว หรือเลยกำหนดตอบไปแล้วโดยยังไม่ได้ตอบ — เรื่องที่ยังอยู่ในเวลาไม่นับ
 * เพราะยังไม่รู้ผล ถ้านับเป็น "ไม่ทัน" ตัวเลขช่วงต้นเดือนจะต่ำเกินจริงทุกเดือน
 */
const RESPONSE_DECIDED: SQL = sql`(
  ${ticket.firstResponseAt} IS NOT NULL OR ${ticket.responseDueAt} < now()
)`;
const RESPONSE_MET: SQL = sql`(
  ${ticket.firstResponseAt} IS NOT NULL AND ${ticket.firstResponseAt} <= ${ticket.responseDueAt}
)`;
const NOT_EXCLUDED: SQL = sql`${ticket.slaExclusionCode} IS NULL`;

/**
 * รายงานตามโครงของ ISO/IEC 20000-1:2018
 *
 *   §8.3.3 · §9.1  รายงานผลการให้บริการประจำเดือน (Service Performance Report)
 *   §7.2           KPI รายบุคคลของทีมสนับสนุน (ตัวชี้วัดความสามารถ อิง SLA + คะแนนผู้ใช้)
 *
 * ⚠️ ทุกคิวรีของ ticket ใช้ ReportsService.ticketScopeWhere ตัวเดียวกับรายงานอื่น
 *    รวมข้อจำกัดเหตุความปลอดภัย (SOP-10) — รายงานที่เห็นมากกว่าหน้ารายการคือการรั่วข้อมูล
 *
 * ⚠️ ตัวหารเป็นศูนย์คืน null เสมอ (percentOf) — "100%" จากเดือนที่ไม่มีงานคือรายงานโกหก
 */
@Injectable()
export class IsoReportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reports: ReportsService,
  ) {}

  // ── รายงานผลการให้บริการประจำเดือน ────────────────────────────────────

  async servicePerformance(scope: AccessScope, period: ReportPeriod) {
    const prev = previousPeriod(period.from, period.to);
    const prevPeriod = this.reports.resolvePeriod(prev.from.toISOString(), prev.to.toISOString());

    const base = this.reports.ticketScopeWhere(scope, undefined);
    const createdIn = and(base, gte(ticket.createdAt, period.from), lt(ticket.createdAt, period.to)) as SQL;
    const resolvedIn = and(
      base,
      IS_DONE,
      gte(ticket.resolvedAt, period.from),
      lt(ticket.resolvedAt, period.to),
    ) as SQL;
    const closedIn = and(base, gte(ticket.closedAt, period.from), lt(ticket.closedAt, period.to)) as SQL;
    /*
     * เกินกำหนดแก้ไขที่ "เกี่ยวกับเดือนนี้": แก้เสร็จในเดือนนี้แต่ช้า หรือยังเปิดค้างและเลยกำหนดแล้ว
     * เรื่องที่ค้างข้ามเดือนจึงโผล่ในรายงานทุกเดือนจนกว่าจะปิด — ตั้งใจ เพราะยังเป็นปัญหาอยู่
     */
    const breachedRelevant = and(
      base,
      RESOLUTION_BREACHED,
      or(
        and(gte(ticket.resolvedAt, period.from), lt(ticket.resolvedAt, period.to)),
        and(isNull(ticket.resolvedAt), IS_OPEN),
      ),
    ) as SQL;

    const [
      kpiNow,
      kpiPrev,
      responseByPriority,
      resolutionByPriority,
      targets,
      createdByType,
      resolvedByType,
      [closedAgg],
      backlogByPriority,
      byCompany,
      topCategories,
      majorIncidents,
      breachListP12,
      breachCountP34,
      [responseBreach],
      [problemAgg],
      availability,
    ] = await Promise.all([
      this.reports.kpi(scope, period),
      this.reports.kpi(scope, prevPeriod),

      this.db
        .select({
          priority: ticket.priority,
          eligible: countWhere(RESPONSE_DECIDED),
          met: countWhere(RESPONSE_MET),
        })
        .from(ticket)
        .where(and(createdIn, NOT_EXCLUDED, sql`${ticket.responseDueAt} IS NOT NULL`) as SQL)
        .groupBy(ticket.priority),

      this.db
        .select({
          priority: ticket.priority,
          done: sql<number>`count(*)::int`,
          eligible: countWhere(NOT_EXCLUDED),
          met: countWhere(sql`${NOT_EXCLUDED} AND NOT ${RESOLUTION_BREACHED}`),
          excluded: countWhere(sql`${ticket.slaExclusionCode} IS NOT NULL`),
        })
        .from(ticket)
        .where(resolvedIn)
        .groupBy(ticket.priority),

      // เป้าหมายตามนโยบายกลางที่ตั้งเป็นค่าเริ่มต้น — หัวเอกสารต้องบอกว่าวัดตามเอกสารฉบับไหน
      this.db
        .select({
          priority: slaTarget.priority,
          responseMinutes: slaTarget.responseMinutes,
          resolutionMinutes: slaTarget.resolutionMinutes,
          clockMode: slaTarget.clockMode,
          docRef: slaPolicy.docRef,
          docVersion: slaPolicy.docVersion,
          effectiveFrom: slaPolicy.effectiveFrom,
        })
        .from(slaTarget)
        .innerJoin(slaPolicy, eq(slaPolicy.id, slaTarget.slaPolicyId))
        .where(and(eq(slaPolicy.isDefault, true), eq(slaPolicy.isActive, true), isNull(slaPolicy.companyId))),

      this.db
        .select({ type: ticket.ticketType, n: sql<number>`count(*)::int` })
        .from(ticket)
        .where(createdIn)
        .groupBy(ticket.ticketType),

      this.db
        .select({ type: ticket.ticketType, n: sql<number>`count(*)::int` })
        .from(ticket)
        .where(resolvedIn)
        .groupBy(ticket.ticketType),

      this.db
        .select({
          closed: sql<number>`count(*)::int`,
          rated: sql<number>`count(${ticket.satisfactionScore})::int`,
          avgScore: sql<string | null>`avg(${ticket.satisfactionScore})`,
        })
        .from(ticket)
        .where(closedIn),

      // ค้างอยู่ ณ ตอนออกรายงาน — ไม่ขึ้นกับช่วงเวลา
      this.db
        .select({
          priority: ticket.priority,
          open: sql<number>`count(*)::int`,
          overdue: countWhere(RESOLUTION_BREACHED),
        })
        .from(ticket)
        .where(and(base, IS_OPEN) as SQL)
        .groupBy(ticket.priority),

      this.db
        .select({
          id: company.id,
          code: company.code,
          created: sql<number>`count(*)::int`,
          done: countWhere(IS_DONE),
          eligible: countWhere(sql`${IS_DONE} AND ${NOT_EXCLUDED}`),
          met: countWhere(sql`${IS_DONE} AND ${NOT_EXCLUDED} AND NOT ${RESOLUTION_BREACHED}`),
          rated: sql<number>`count(${ticket.satisfactionScore})::int`,
          avgScore: sql<string | null>`avg(${ticket.satisfactionScore})`,
        })
        .from(ticket)
        .innerJoin(company, eq(company.id, ticket.companyId))
        .where(createdIn)
        .groupBy(company.id, company.code)
        .orderBy(asc(company.code)),

      this.db
        .select({ name: ticketCategory.nameTh, n: sql<number>`count(*)::int` })
        .from(ticket)
        .innerJoin(ticketCategory, eq(ticketCategory.id, ticket.categoryId))
        .where(createdIn)
        .groupBy(ticketCategory.nameTh)
        .orderBy(desc(sql`count(*)`), asc(ticketCategory.nameTh))
        .limit(5),

      this.db
        .select({
          id: ticket.id,
          ticketNo: ticket.ticketNo,
          subject: ticket.subject,
          priority: ticket.priority,
          status: ticket.status,
          companyCode: company.code,
          createdAt: ticket.createdAt,
          resolvedAt: ticket.resolvedAt,
          breached: sql<boolean>`${RESOLUTION_BREACHED}`,
          isSecurity: ticket.isSecurityIncident,
          problemCode: problem.code,
          problemStatus: problem.status,
          rcaDueAt: problem.rcaDueAt,
          rcaSubmittedAt: problem.rcaSubmittedAt,
        })
        .from(ticket)
        .innerJoin(company, eq(company.id, ticket.companyId))
        .leftJoin(problem, eq(problem.id, ticket.problemId))
        .where(
          and(createdIn, or(eq(ticket.isMajorIncident, true), eq(ticket.isSecurityIncident, true))) as SQL,
        )
        .orderBy(asc(ticket.createdAt))
        .limit(LIST_CAP),

      this.db
        .select({
          id: ticket.id,
          ticketNo: ticket.ticketNo,
          subject: ticket.subject,
          priority: ticket.priority,
          status: ticket.status,
          companyCode: company.code,
          assigneeName: appUser.fullName,
          dueAt: ticket.resolutionDueAt,
          resolvedAt: ticket.resolvedAt,
        })
        .from(ticket)
        .innerJoin(company, eq(company.id, ticket.companyId))
        .leftJoin(appUser, eq(appUser.id, ticket.assigneeId))
        .where(and(breachedRelevant, inArray(ticket.priority, ['P1', 'P2'])) as SQL)
        .orderBy(asc(ticket.priority), asc(ticket.resolutionDueAt))
        .limit(LIST_CAP),

      this.db
        .select({ priority: ticket.priority, n: sql<number>`count(*)::int` })
        .from(ticket)
        .where(and(breachedRelevant, inArray(ticket.priority, ['P3', 'P4'])) as SQL)
        .groupBy(ticket.priority),

      this.db
        .select({ n: countWhere(sql`${RESPONSE_DECIDED} AND NOT ${RESPONSE_MET}`) })
        .from(ticket)
        .where(and(createdIn, NOT_EXCLUDED, sql`${ticket.responseDueAt} IS NOT NULL`) as SQL),

      this.db
        .select({
          opened: countWhere(sql`${problem.openedAt} >= ${period.fromIso}::timestamptz AND ${problem.openedAt} < ${period.toIso}::timestamptz`),
          closed: countWhere(sql`${problem.closedAt} >= ${period.fromIso}::timestamptz AND ${problem.closedAt} < ${period.toIso}::timestamptz`),
          open: countWhere(sql`${problem.status} <> 'closed'`),
          rcaOverdue: countWhere(
            sql`${problem.status} <> 'closed' AND ${problem.rcaSubmittedAt} IS NULL AND ${problem.rcaDueAt} < now()`,
          ),
        })
        .from(problem)
        .where(this.problemScope(scope)),

      this.availability(scope, period),
    ]);

    const byPriority = <T extends { priority: string }>(rows: readonly T[], p: Priority): T | undefined =>
      rows.find((r) => r.priority === p);

    const slaByPriority = PRIORITY.map((p) => {
      const target = byPriority(targets, p);
      const resp = byPriority(responseByPriority, p);
      const res = byPriority(resolutionByPriority, p);
      return {
        priority: p,
        response_target_minutes: target?.responseMinutes ?? null,
        resolution_target_minutes: target?.resolutionMinutes ?? null,
        clock_mode: target?.clockMode ?? null,
        response: {
          eligible: resp?.eligible ?? 0,
          met: resp?.met ?? 0,
          percent: percentOf(resp?.met ?? 0, resp?.eligible ?? 0),
        },
        resolution: {
          done: res?.done ?? 0,
          eligible: res?.eligible ?? 0,
          met: res?.met ?? 0,
          excluded: res?.excluded ?? 0,
          percent: percentOf(res?.met ?? 0, res?.eligible ?? 0),
        },
      };
    });

    const p1Breaches = breachListP12.filter((r) => r.priority === 'P1').length;
    const summary = overallStatus(kpiNow.items, p1Breaches);
    const policy = targets[0] ?? null;
    const typeCount = (rows: readonly { type: string; n: number }[], type: TicketType): number =>
      rows.find((r) => r.type === type)?.n ?? 0;

    return {
      document: {
        report_no: reportNumber(period.from, period.to),
        period: { from: period.from.toISOString(), to: period.to.toISOString(), label: period.label },
        previous_period: {
          from: prevPeriod.from.toISOString(),
          to: prevPeriod.to.toISOString(),
          label: prevPeriod.label,
        },
        generated_at: new Date().toISOString(),
        sla_policy: policy
          ? { doc_ref: policy.docRef, doc_version: policy.docVersion, effective_from: policy.effectiveFrom }
          : null,
      },
      summary: {
        status: summary.status,
        failing: summary.failing,
        p1_resolution_breaches: p1Breaches,
      },
      kpi: kpiNow,
      kpi_previous: {
        period: kpiPrev.period,
        items: kpiPrev.items.map((k) => ({ code: k.code, value: k.value })),
      },
      sla_by_priority: slaByPriority,
      volume: {
        created: {
          incident: typeCount(createdByType, 'incident'),
          service_request: typeCount(createdByType, 'service_request'),
        },
        resolved: {
          incident: typeCount(resolvedByType, 'incident'),
          service_request: typeCount(resolvedByType, 'service_request'),
        },
        closed: closedAgg?.closed ?? 0,
        backlog: PRIORITY.map((p) => ({
          priority: p,
          open: byPriority(backlogByPriority, p)?.open ?? 0,
          overdue: byPriority(backlogByPriority, p)?.overdue ?? 0,
        })),
        by_company: byCompany.map((r) => ({
          company: { id: r.id, code: r.code },
          created: r.created,
          done: r.done,
          sla_met_percent: percentOf(r.met, r.eligible),
          csat_avg: round2(r.avgScore),
          csat_count: r.rated,
        })),
        top_categories: topCategories.map((r) => ({ name: r.name, count: r.n })),
      },
      major_incidents: majorIncidents.map((r) => ({
        id: r.id,
        ticket_no: r.ticketNo,
        subject: r.subject,
        priority: r.priority as Priority,
        status: r.status as TicketStatus,
        company_code: r.companyCode,
        is_security_incident: r.isSecurity,
        created_at: r.createdAt.toISOString(),
        resolved_at: r.resolvedAt?.toISOString() ?? null,
        breached: r.breached,
        problem: r.problemCode
          ? {
              code: r.problemCode,
              status: r.problemStatus,
              rca_due_at: r.rcaDueAt?.toISOString() ?? null,
              rca_submitted_at: r.rcaSubmittedAt?.toISOString() ?? null,
            }
          : null,
      })),
      breaches: {
        response_breached: responseBreach?.n ?? 0,
        resolution_p1_p2: breachListP12.map((r) => ({
          id: r.id,
          ticket_no: r.ticketNo,
          subject: r.subject,
          priority: r.priority as Priority,
          status: r.status as TicketStatus,
          company_code: r.companyCode,
          assignee_name: r.assigneeName,
          due_at: r.dueAt?.toISOString() ?? null,
          resolved_at: r.resolvedAt?.toISOString() ?? null,
        })),
        resolution_p3_p4: (['P3', 'P4'] as const).map((p) => ({
          priority: p,
          count: breachCountP34.find((r) => r.priority === p)?.n ?? 0,
        })),
      },
      problems: {
        opened: problemAgg?.opened ?? 0,
        closed: problemAgg?.closed ?? 0,
        open_now: problemAgg?.open ?? 0,
        rca_overdue: problemAgg?.rcaOverdue ?? 0,
      },
      availability,
      csat: {
        avg: round2(closedAgg?.avgScore ?? null),
        rated: closedAgg?.rated ?? 0,
        closed: closedAgg?.closed ?? 0,
        response_rate_percent: kpiNow.csat.response_rate_percent,
        target: 4.2,
      },
      improvement: {
        sip_required: kpiNow.sip_required,
        failing: summary.failing,
      },
    };
  }

  /**
   * ความพร้อมใช้งานรายระบบ (ISO/IEC 20000-1 §8.7.1) เทียบเป้าตามระดับบริการ
   *
   * ตัวหารคือเวลาที่ผ่านไปจริงในช่วงนั้น (ถึงตอนนี้ ถ้าช่วงยังไม่จบ) — ใช้ช่วงเต็มเดือน
   * กับเดือนที่ยังไม่จบจะได้ % ที่ดีเกินจริง · นับเฉพาะ downtime ที่ไม่ได้วางแผน เหมือน KPI-6
   */
  private async availability(scope: AccessScope, period: ReportPeriod) {
    const serviceScope = scope.isSuperAdmin
      ? sql`true`
      : scope.companyIds.size > 0
        ? sql`(s.company_id IS NULL OR s.company_id IN ${[...scope.companyIds]})`
        : sql`s.company_id IS NULL`;

    const rows = (await this.db.execute(sql`
      WITH win AS (
        SELECT greatest(0, extract(epoch FROM (
          least(${period.toIso}::timestamptz, now()) - ${period.fromIso}::timestamptz
        )) / 60) AS total
      ),
      down AS (
        SELECT o.service_id,
               count(*)::int AS outages,
               sum(greatest(0, extract(epoch FROM (
                 least(coalesce(o.ended_at, now()), ${period.toIso}::timestamptz)
                 - greatest(o.started_at, ${period.fromIso}::timestamptz)
               )) / 60)) AS minutes
        FROM service_outage o
        WHERE o.is_planned = false
          AND o.started_at < ${period.toIso}::timestamptz
          AND coalesce(o.ended_at, now()) > ${period.fromIso}::timestamptz
        GROUP BY o.service_id
      )
      SELECT s.id, s.code, s.name_th, s.service_tier, s.is_24x7,
             coalesce(d.outages, 0) AS outages,
             round(coalesce(d.minutes, 0)::numeric, 0)::int AS down_minutes,
             CASE WHEN w.total = 0 THEN NULL
                  ELSE round((greatest(0, w.total - coalesce(d.minutes, 0)) / w.total * 100)::numeric, 3)
             END AS uptime_percent,
             tt.uptime_percent AS target_percent
      FROM service s
      CROSS JOIN win w
      LEFT JOIN down d ON d.service_id = s.id
      LEFT JOIN service_tier_target tt ON tt.tier_code = s.service_tier
      WHERE s.is_active = true AND ${serviceScope}
      ORDER BY coalesce(d.minutes, 0) DESC, s.service_tier, s.code
    `)) as unknown as {
      id: number;
      code: string;
      name_th: string;
      service_tier: string;
      is_24x7: boolean;
      outages: number;
      down_minutes: number;
      uptime_percent: string | null;
      target_percent: string | null;
    }[];

    return rows.map((r) => {
      const uptime = r.uptime_percent === null ? null : Number(r.uptime_percent);
      const target = r.target_percent === null ? null : Number(r.target_percent);
      return {
        service: { id: Number(r.id), code: r.code, name_th: r.name_th },
        tier: r.service_tier,
        is_24x7: r.is_24x7,
        outages: Number(r.outages),
        down_minutes: Number(r.down_minutes),
        uptime_percent: uptime,
        target_percent: target,
        meets_target: uptime === null || target === null ? null : uptime >= target,
      };
    });
  }

  private problemScope(scope: AccessScope): SQL {
    if (scope.isSuperAdmin) return sql`true`;
    const ids = [...scope.companyIds];
    return ids.length > 0 ? (inArray(problem.companyId, ids) as SQL) : sql`false`;
  }

  // ── KPI ของทีมสนับสนุน ────────────────────────────────────────────────

  /**
   * KPI รายบุคคล — อิง SLA (ตอบรับ · แก้ไข) และคะแนนความพึงพอใจที่ผู้ใช้ให้
   *
   * ⚠️ นับตามผู้รับผิดชอบปัจจุบันของเรื่อง (assignee_id) — เรื่องที่ถูกโอนมือ
   *    เครดิตทั้งหมดตกกับคนสุดท้าย ระบบยังไม่ได้เก็บว่าใครเป็นคนตอบรับครั้งแรก
   *
   *   ตอบรับทันเวลา  เรื่องที่แจ้งเข้ามาในช่วงนี้ (ตัดเรื่องที่ยังอยู่ในเวลาออก)
   *   แก้ไขทันเวลา   เรื่องที่แก้เสร็จในช่วงนี้ ตัดเหตุยกเว้น SLA ออกจากตัวหาร
   *   CSAT            เรื่องที่ปิดในช่วงนี้และผู้ใช้ให้คะแนน — ชุดเดียวกับ KPI-4
   *   งานค้าง         ณ ตอนนี้ ไม่ขึ้นกับช่วงเวลา
   */
  async teamKpi(scope: AccessScope, period: ReportPeriod, teamId: number | undefined) {
    const wholeTeam = canSeeWholeTeam(scope);

    const teamScope = scope.isSuperAdmin
      ? sql`true`
      : scope.companyIds.size > 0
        ? (or(isNull(supportTeam.companyId), inArray(supportTeam.companyId, [...scope.companyIds])) as SQL)
        : (isNull(supportTeam.companyId) as SQL);

    const memberships = await this.db
      .select({
        teamId: supportTeam.id,
        teamName: supportTeam.name,
        userId: supportTeamMember.userId,
        isLead: supportTeamMember.isLead,
        fullName: appUser.fullName,
      })
      .from(supportTeamMember)
      .innerJoin(supportTeam, eq(supportTeam.id, supportTeamMember.teamId))
      .innerJoin(appUser, eq(appUser.id, supportTeamMember.userId))
      .where(and(eq(supportTeam.isActive, true), teamScope) as SQL)
      .orderBy(asc(supportTeam.name), asc(appUser.fullName));

    const teams = [...new Map(memberships.map((m) => [m.teamId, { id: m.teamId, name: m.teamName }])).values()];
    const selectedTeam = teamId !== undefined ? teams.find((t) => t.id === teamId) : undefined;

    /*
     * ใครอยู่ในรายงาน
     *   ทีม support ทั่วไป  → ตัวเองคนเดียว
     *   เลือกทีม            → สมาชิกของทีมนั้น
     *   ไม่เลือกทีม         → ทุกคนที่มีงานในช่วงนี้ + สมาชิกทุกทีมที่มองเห็น (คนที่ไม่มีงานก็ต้องเห็นว่าว่าง)
     */
    let people: number[] | null;
    if (!wholeTeam) people = [scope.userId];
    else if (teamId !== undefined) {
      people = selectedTeam ? memberships.filter((m) => m.teamId === teamId).map((m) => m.userId) : [];
    } else people = null;

    const base = this.reports.ticketScopeWhere(scope, undefined);
    const whoFilter: SQL =
      people === null
        ? (sql`${ticket.assigneeId} IS NOT NULL` as SQL)
        : people.length > 0
          ? (inArray(ticket.assigneeId, people) as SQL)
          : sql`false`;

    const createdIn = and(base, whoFilter, gte(ticket.createdAt, period.from), lt(ticket.createdAt, period.to)) as SQL;
    const resolvedIn = and(
      base,
      whoFilter,
      IS_DONE,
      gte(ticket.resolvedAt, period.from),
      lt(ticket.resolvedAt, period.to),
    ) as SQL;
    const closedIn = and(base, whoFilter, gte(ticket.closedAt, period.from), lt(ticket.closedAt, period.to)) as SQL;

    const [responseRows, resolutionRows, csatRows, backlogRows] = await Promise.all([
      this.db
        .select({
          userId: ticket.assigneeId,
          fullName: appUser.fullName,
          eligible: countWhere(RESPONSE_DECIDED),
          met: countWhere(RESPONSE_MET),
        })
        .from(ticket)
        .leftJoin(appUser, eq(appUser.id, ticket.assigneeId))
        .where(and(createdIn, NOT_EXCLUDED, sql`${ticket.responseDueAt} IS NOT NULL`) as SQL)
        .groupBy(ticket.assigneeId, appUser.fullName),

      this.db
        .select({
          userId: ticket.assigneeId,
          fullName: appUser.fullName,
          done: sql<number>`count(*)::int`,
          eligible: countWhere(NOT_EXCLUDED),
          met: countWhere(sql`${NOT_EXCLUDED} AND NOT ${RESOLUTION_BREACHED}`),
          reopened: countWhere(sql`${ticket.reopenCount} > 0`),
        })
        .from(ticket)
        .leftJoin(appUser, eq(appUser.id, ticket.assigneeId))
        .where(resolvedIn)
        .groupBy(ticket.assigneeId, appUser.fullName),

      this.db
        .select({
          userId: ticket.assigneeId,
          fullName: appUser.fullName,
          rated: sql<number>`count(${ticket.satisfactionScore})::int`,
          sum: sql<number>`coalesce(sum(${ticket.satisfactionScore}), 0)::int`,
          low: countWhere(sql`${ticket.satisfactionScore} <= 2`),
        })
        .from(ticket)
        .leftJoin(appUser, eq(appUser.id, ticket.assigneeId))
        .where(and(closedIn, sql`${ticket.satisfactionScore} IS NOT NULL`) as SQL)
        .groupBy(ticket.assigneeId, appUser.fullName),

      this.db
        .select({
          userId: ticket.assigneeId,
          fullName: appUser.fullName,
          open: sql<number>`count(*)::int`,
          overdue: countWhere(RESOLUTION_BREACHED),
        })
        .from(ticket)
        .leftJoin(appUser, eq(appUser.id, ticket.assigneeId))
        .where(and(base, whoFilter, IS_OPEN) as SQL)
        .groupBy(ticket.assigneeId, appUser.fullName),
    ]);

    // รวมทุกแหล่งเป็นหนึ่งแถวต่อคน
    interface Acc {
      userId: number;
      fullName: string;
      respEligible: number;
      respMet: number;
      done: number;
      resEligible: number;
      resMet: number;
      reopened: number;
      rated: number;
      scoreSum: number;
      low: number;
      open: number;
      overdue: number;
    }
    const acc = new Map<number, Acc>();
    const row = (userId: number | null, fullName: string | null): Acc | null => {
      if (userId === null) return null;
      let a = acc.get(userId);
      if (!a) {
        a = {
          userId,
          fullName: fullName ?? '',
          respEligible: 0,
          respMet: 0,
          done: 0,
          resEligible: 0,
          resMet: 0,
          reopened: 0,
          rated: 0,
          scoreSum: 0,
          low: 0,
          open: 0,
          overdue: 0,
        };
        acc.set(userId, a);
      }
      if (!a.fullName && fullName) a.fullName = fullName;
      return a;
    };

    const everyoneVisible = people === null;
    const allowed = new Set(people ?? []);
    const include = (userId: number | null): boolean =>
      userId !== null && (everyoneVisible || allowed.has(userId));

    for (const m of memberships) if (include(m.userId)) row(m.userId, m.fullName);
    if (!wholeTeam) row(scope.userId, null);
    for (const r of responseRows) {
      const a = include(r.userId) ? row(r.userId, r.fullName) : null;
      if (a) {
        a.respEligible += r.eligible;
        a.respMet += r.met;
      }
    }
    for (const r of resolutionRows) {
      const a = include(r.userId) ? row(r.userId, r.fullName) : null;
      if (a) {
        a.done += r.done;
        a.resEligible += r.eligible;
        a.resMet += r.met;
        a.reopened += r.reopened;
      }
    }
    for (const r of csatRows) {
      const a = include(r.userId) ? row(r.userId, r.fullName) : null;
      if (a) {
        a.rated += r.rated;
        a.scoreSum += r.sum;
        a.low += r.low;
      }
    }
    for (const r of backlogRows) {
      const a = include(r.userId) ? row(r.userId, r.fullName) : null;
      if (a) {
        a.open += r.open;
        a.overdue += r.overdue;
      }
    }

    // ชื่อของคนที่ไม่มีงานและไม่ได้อยู่ในทีม (กรณีเห็นแค่ตัวเอง)
    const nameless = [...acc.values()].filter((a) => !a.fullName).map((a) => a.userId);
    if (nameless.length > 0) {
      const names = await this.db
        .select({ id: appUser.id, fullName: appUser.fullName })
        .from(appUser)
        .where(inArray(appUser.id, nameless));
      for (const n of names) {
        const a = acc.get(n.id);
        if (a) a.fullName = n.fullName;
      }
    }

    const teamsOf = (userId: number) =>
      memberships
        .filter((m) => m.userId === userId)
        .map((m) => ({ id: m.teamId, name: m.teamName, is_lead: m.isLead }));

    const toMetrics = (a: Omit<Acc, 'userId' | 'fullName'>) => {
      const responseMetPercent = percentOf(a.respMet, a.respEligible);
      const resolutionMetPercent = percentOf(a.resMet, a.resEligible);
      const csatAvg = a.rated === 0 ? null : Math.round((a.scoreSum / a.rated) * 100) / 100;
      const input = { responseMetPercent, resolutionMetPercent, csatAvg };
      return {
        resolved: a.done,
        response: { eligible: a.respEligible, met: a.respMet, percent: responseMetPercent },
        resolution: { eligible: a.resEligible, met: a.resMet, percent: resolutionMetPercent },
        csat: { count: a.rated, avg: csatAvg, low: a.low },
        reopen_percent: percentOf(a.reopened, a.done),
        open_now: a.open,
        overdue_now: a.overdue,
        score: teamKpiScore(input),
        meets: teamKpiVerdicts(input),
        enough_data: a.done >= TEAM_KPI.minSample,
      };
    };

    const rows = [...acc.values()]
      .map((a) => ({ user: { id: a.userId, full_name: a.fullName }, teams: teamsOf(a.userId), ...toMetrics(a) }))
      .sort((x, y) => {
        // คนที่ข้อมูลพอขึ้นก่อน แล้วเรียงตามคะแนน — คนที่ปิดสองใบไม่ควรนำตาราง
        if (x.enough_data !== y.enough_data) return x.enough_data ? -1 : 1;
        const sx = x.score ?? -1;
        const sy = y.score ?? -1;
        if (sx !== sy) return sy - sx;
        return x.user.full_name.localeCompare(y.user.full_name);
      });

    const sum = [...acc.values()].reduce(
      (t, a) => ({
        respEligible: t.respEligible + a.respEligible,
        respMet: t.respMet + a.respMet,
        done: t.done + a.done,
        resEligible: t.resEligible + a.resEligible,
        resMet: t.resMet + a.resMet,
        reopened: t.reopened + a.reopened,
        rated: t.rated + a.rated,
        scoreSum: t.scoreSum + a.scoreSum,
        low: t.low + a.low,
        open: t.open + a.open,
        overdue: t.overdue + a.overdue,
      }),
      {
        respEligible: 0,
        respMet: 0,
        done: 0,
        resEligible: 0,
        resMet: 0,
        reopened: 0,
        rated: 0,
        scoreSum: 0,
        low: 0,
        open: 0,
        overdue: 0,
      },
    );

    return {
      period: { from: period.from.toISOString(), to: period.to.toISOString(), label: period.label },
      visibility: wholeTeam ? ('team' as const) : ('self' as const),
      teams,
      selected_team_id: selectedTeam?.id ?? null,
      rules: {
        targets: {
          response_met_percent: TEAM_KPI.targets.responseMetPercent,
          resolution_met_percent: TEAM_KPI.targets.resolutionMetPercent,
          csat_avg: TEAM_KPI.targets.csatAvg,
        },
        weights: TEAM_KPI.weights,
        min_sample: TEAM_KPI.minSample,
      },
      totals: toMetrics(sum),
      rows,
    };
  }
}

/** ทศนิยม 2 ตำแหน่ง · null ผ่านทะลุ (avg ของ smallint มาเป็นสตริงจาก postgres.js) */
function round2(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
