import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import type { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.token';
import {
  appUser,
  approvalRequest,
  auditLog,
  ticket,
  ticketCategory,
  ticketStatusHistory,
  userRole,
} from '../../db/schema';
import { percentOf, previousPeriod, reportNumber } from './iso-report-rules';
import {
  ACCESS_TARGETS,
  check,
  EVIDENCE_GAPS,
  securityStatus,
  SECURITY_REPORT_PREFIX,
  type SecurityCheck,
} from './security-report-rules';
import { countWhere, IS_OPEN, ReportsService, type ReportPeriod } from './reports.service';

/** จำนวนแถวสูงสุดของรายการแจกแจง — รายงานรายเดือน ไม่ใช่หน้าค้นหา */
const LIST_CAP = 20;

/**
 * เรื่องที่นับเป็น "เหตุการณ์ด้านความปลอดภัย"
 *
 * ⚠️ นับจาก **หมวดหมู่** เป็นหลัก ไม่ใช่ธง is_security_incident
 *    ธงนั้นมีในตารางแต่ไม่มีเส้นทางไหนในระบบตั้งค่าให้เลย (ตรวจจากโค้ดแล้ว)
 *    ถ้านับจากธงอย่างเดียว รายงานจะขึ้นศูนย์ทุกเดือนทั้งที่มีเหตุเกิดจริง
 *    ยังรวมธงไว้ด้วยเพื่อให้วันที่มีคนตั้งธงได้ ตัวเลขจะถูกต้องทันทีโดยไม่ต้องแก้ตรงนี้
 */
const IS_SECURITY: SQL = sql`(${ticket.isSecurityIncident} = true OR ${ticketCategory.code} LIKE 'SECURITY%')`;

/** คำขอที่เกี่ยวกับสิทธิ์เข้าถึง — ขอสิทธิ์ เปลี่ยนสิทธิ์ ยกเลิกสิทธิ์ รับเข้า และลาออก */
const IS_ACCESS_REQUEST: SQL = sql`(
  ${ticketCategory.code} LIKE 'ACCESS%' OR ${ticketCategory.code} LIKE 'LIFECYCLE%'
)`;

const RESPONSE_DECIDED: SQL = sql`(
  ${ticket.firstResponseAt} IS NOT NULL OR ${ticket.responseDueAt} < now()
)`;
const RESPONSE_MET: SQL = sql`(
  ${ticket.firstResponseAt} IS NOT NULL AND ${ticket.firstResponseAt} <= ${ticket.responseDueAt}
)`;

/**
 * รายงานความมั่นคงปลอดภัยสารสนเทศ ตามโครง ISO/IEC 27001:2022
 *
 *   §9.1        การเฝ้าติดตาม วัดผล วิเคราะห์ และประเมิน
 *   A.5.24–5.27 การจัดการเหตุการณ์ด้านความปลอดภัย
 *   A.5.15–5.18 การควบคุมการเข้าถึง สิทธิ์ และการทบทวนสิทธิ์
 *   A.5.28      การเก็บรวบรวมหลักฐาน · A.8.15 การบันทึกเหตุการณ์
 *
 * ⚠️ รายงานนี้เปิดได้เฉพาะผู้ที่เห็นเหตุความปลอดภัยได้อยู่แล้ว (หัวหน้าไอที · CEO · DPO · ผู้ดูแลระบบ)
 *    ด่านอยู่ที่ controller — ถ้าเปิดให้ทุกคนที่มีสิทธิ์ดูรายงาน ตัวเลขสรุปจะกลายเป็น
 *    ช่องให้รู้ว่ามีเหตุความปลอดภัยเกิดขึ้นกี่ใบ ทั้งที่ตัวใบถูกซ่อนไว้ตาม SOP-10
 *
 * ⚠️ ทุกช่องที่ระบบยังไม่ได้บันทึกข้อมูล ต้องออกมาเป็น null พร้อมมีแถวใน evidence_gaps
 *    ห้ามส่ง 0 เพราะผู้อ่านจะแปลว่า "เดือนนี้ไม่มีเหตุการณ์" ซึ่งไม่จริง
 */
@Injectable()
export class SecurityReportService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reports: ReportsService,
  ) {}

  async monthly(scope: AccessScope, period: ReportPeriod): Promise<SecurityReport> {
    const prev = previousPeriod(period.from, period.to);
    const inPeriod = and(
      gte(ticket.createdAt, period.from) as SQL,
      lt(ticket.createdAt, period.to) as SQL,
    ) as SQL;
    const scoped = this.reports.ticketScopeWhere(scope, undefined);

    const [incidents, byCategory, accessRequests, approvals, accounts, grants, audit, coverage] =
      await Promise.all([
        this.incidentTotals(scoped, inPeriod, prev),
        this.incidentsByCategory(scoped, inPeriod),
        this.accessRequestTotals(scoped, inPeriod),
        this.approvalTotals(scope, period),
        this.accountPosture(scope),
        this.grantPosture(scope),
        this.auditActivity(scope, period),
        this.auditCoverage(scope, period),
      ]);

    const checks: SecurityCheck[] = [
      check({
        code: 'SEC-1',
        control: 'A.5.25 · A.6.8',
        title: 'ตอบรับเหตุความปลอดภัยทันเวลา',
        value: incidents.responseMetPercent,
        atLeast: 100,
        detail:
          incidents.responseDecided === 0
            ? 'ไม่มีเหตุที่ถึงกำหนดตอบรับในเดือนนี้'
            : `ตอบทันเวลา ${incidents.responseMet} จาก ${incidents.responseDecided} ใบ`,
      }),
      check({
        code: 'SEC-2',
        control: 'A.5.26',
        title: 'แก้เหตุความปลอดภัยภายในกำหนด',
        value: incidents.total === 0 ? null : incidents.resolutionBreached,
        atMost: 0,
        detail:
          incidents.total === 0
            ? 'ไม่มีเหตุความปลอดภัยในเดือนนี้'
            : `เกินกำหนด ${incidents.resolutionBreached} ใบ จากทั้งหมด ${incidents.total} ใบ`,
      }),
      check({
        code: 'SEC-3',
        control: 'A.5.27',
        title: 'เหตุที่กลับมาเกิดซ้ำ',
        value: incidents.total === 0 ? null : incidents.reopened,
        atMost: 0,
        detail:
          incidents.total === 0
            ? 'ไม่มีเหตุความปลอดภัยในเดือนนี้'
            : `ถูกเปิดเรื่องคืน ${incidents.reopened} ใบ`,
      }),
      check({
        code: 'ACC-1',
        control: 'A.5.18',
        title: 'สิทธิ์ชั่วคราวที่หมดอายุแล้วยังค้างอยู่',
        value: grants.expiredStillPresent,
        atMost: ACCESS_TARGETS.expiredGrantsAllowed,
        detail: `หมดอายุแล้วยังไม่ถูกถอน ${grants.expiredStillPresent} รายการ · ให้แบบมีกำหนดสิ้นสุด ${grants.withExpiry} จาก ${grants.total} รายการ`,
      }),
      check({
        code: 'ACC-2',
        control: 'A.5.18',
        title: 'คำขอสิทธิ์ที่ค้างรออนุมัติ',
        value: approvals.pendingOverTarget,
        atMost: 0,
        detail: `ค้างเกิน ${ACCESS_TARGETS.approvalPendingDays} วัน ${approvals.pendingOverTarget} รายการ · รออนุมัติทั้งหมด ${approvals.pending} รายการ`,
      }),
      check({
        code: 'ACC-3',
        control: 'A.5.16',
        title: 'บัญชีที่ไม่ได้ใช้งาน',
        value: accounts.dormant,
        atMost: 0,
        detail: `ไม่ได้เข้าระบบเกิน ${ACCESS_TARGETS.dormantAccountDays} วัน ${accounts.dormant} บัญชี · ไม่เคยเข้าเลย ${accounts.neverLoggedIn} บัญชี`,
      }),
      check({
        code: 'AUD-1',
        control: 'A.5.28 · A.8.15',
        title: 'ความครบของร่องรอยการเปลี่ยนสถานะ',
        value: coverage.percent,
        atLeast: 100,
        detail:
          coverage.transitions === 0
            ? 'ไม่มีการเปลี่ยนสถานะในเดือนนี้'
            : `มีร่องรอย ${coverage.audited} จากการเปลี่ยนสถานะ ${coverage.transitions} ครั้ง` +
              (audit.firstEntryAt === null
                ? ''
                : ` · ทะเบียนตรวจสอบเริ่มบันทึกเมื่อ ${audit.firstEntryAt.slice(0, 10)}`),
      }),
    ];

    const verdict = securityStatus(checks);

    return {
      document: {
        report_no: reportNumber(period.from, period.to, SECURITY_REPORT_PREFIX),
        standard: 'ISO/IEC 27001:2022',
        period: { from: period.fromIso, to: period.toIso, label: period.label },
        previous_period: { from: prev.from.toISOString(), to: prev.to.toISOString() },
        generated_at: new Date().toISOString(),
      },
      summary: { status: verdict.status, failing: verdict.failing, checks },
      incidents: {
        total: incidents.total,
        previous_total: incidents.previousTotal,
        p1: incidents.p1,
        still_open: incidents.stillOpen,
        reopened: incidents.reopened,
        response_met_percent: incidents.responseMetPercent,
        resolution_breached: incidents.resolutionBreached,
        avg_minutes_to_response: incidents.avgMinutesToResponse,
        avg_minutes_to_resolve: incidents.avgMinutesToResolve,
        by_category: byCategory,
      },
      access: {
        requests_total: accessRequests.total,
        requests_by_kind: accessRequests.byKind,
        offboarding_total: accessRequests.offboarding,
        offboarding_done: accessRequests.offboardingDone,
        approvals_decided: approvals.decided,
        approvals_rejected: approvals.rejected,
        approvals_pending: approvals.pending,
        approvals_pending_over_target: approvals.pendingOverTarget,
        avg_approval_hours: approvals.avgHours,
        grants_total: grants.total,
        grants_with_expiry: grants.withExpiry,
        grants_expired_still_present: grants.expiredStillPresent,
        admin_accounts: accounts.adminAccounts,
        locked_accounts: accounts.locked,
        dormant_accounts: accounts.dormant,
        never_logged_in: accounts.neverLoggedIn,
        active_accounts: accounts.active,
      },
      audit: {
        entries: audit.total,
        by_action: audit.byAction,
        status_changes: coverage.transitions,
        status_changes_audited: coverage.audited,
        coverage_percent: coverage.percent,
        /** ยังไม่มีการบันทึกที่มาของคำขอเลย — ดู evidence_gaps */
        entries_with_origin: audit.withOrigin,
        first_entry_at: audit.firstEntryAt,
      },
      evidence_gaps: EVIDENCE_GAPS.map((g) => ({ ...g })),
      targets: {
        approval_pending_days: ACCESS_TARGETS.approvalPendingDays,
        dormant_account_days: ACCESS_TARGETS.dormantAccountDays,
      },
    };
  }

  // ── เหตุการณ์ด้านความปลอดภัย ────────────────────────────────────────

  private async incidentTotals(
    scoped: SQL,
    inPeriod: SQL,
    prev: { from: Date; to: Date },
  ): Promise<{
    total: number;
    previousTotal: number;
    p1: number;
    stillOpen: number;
    reopened: number;
    responseMet: number;
    responseDecided: number;
    responseMetPercent: number | null;
    resolutionBreached: number;
    avgMinutesToResponse: number | null;
    avgMinutesToResolve: number | null;
  }> {
    const prevWindow = and(
      gte(ticket.createdAt, prev.from) as SQL,
      lt(ticket.createdAt, prev.to) as SQL,
    ) as SQL;

    const [row] = await this.db
      .select({
        total: countWhere(inPeriod),
        previousTotal: countWhere(prevWindow),
        p1: countWhere(and(inPeriod, eq(ticket.priority, 'P1')) as SQL),
        stillOpen: countWhere(and(inPeriod, IS_OPEN) as SQL),
        reopened: countWhere(and(inPeriod, sql`${ticket.reopenCount} > 0`) as SQL),
        responseMet: countWhere(and(inPeriod, RESPONSE_MET) as SQL),
        responseDecided: countWhere(and(inPeriod, RESPONSE_DECIDED) as SQL),
        resolutionBreached: countWhere(
          and(inPeriod, eq(ticket.isResolutionBreached, true)) as SQL,
        ),
        avgMinutesToResponse: sql<
          number | null
        >`round(avg(extract(epoch from (${ticket.firstResponseAt} - ${ticket.createdAt})) / 60) FILTER (WHERE ${inPeriod} AND ${ticket.firstResponseAt} IS NOT NULL)::numeric, 1)`,
        avgMinutesToResolve: sql<
          number | null
        >`round(avg(extract(epoch from (${ticket.resolvedAt} - ${ticket.createdAt})) / 60) FILTER (WHERE ${inPeriod} AND ${ticket.resolvedAt} IS NOT NULL)::numeric, 1)`,
      })
      .from(ticket)
      .leftJoin(ticketCategory, eq(ticketCategory.id, ticket.categoryId))
      .where(and(scoped, IS_SECURITY, or(inPeriod, prevWindow)) as SQL);

    const totals = row ?? {
      total: 0,
      previousTotal: 0,
      p1: 0,
      stillOpen: 0,
      reopened: 0,
      responseMet: 0,
      responseDecided: 0,
      resolutionBreached: 0,
      avgMinutesToResponse: null,
      avgMinutesToResolve: null,
    };

    return {
      ...totals,
      responseMetPercent: percentOf(totals.responseMet, totals.responseDecided),
      avgMinutesToResponse: numberOrNull(totals.avgMinutesToResponse),
      avgMinutesToResolve: numberOrNull(totals.avgMinutesToResolve),
    };
  }

  private async incidentsByCategory(
    scoped: SQL,
    inPeriod: SQL,
  ): Promise<{ code: string; name: string; count: number }[]> {
    const rows = await this.db
      .select({
        code: ticketCategory.code,
        name: ticketCategory.nameTh,
        count: count(),
      })
      .from(ticket)
      .leftJoin(ticketCategory, eq(ticketCategory.id, ticket.categoryId))
      .where(and(scoped, IS_SECURITY, inPeriod) as SQL)
      .groupBy(ticketCategory.code, ticketCategory.nameTh)
      .orderBy(desc(count()))
      .limit(LIST_CAP);

    return rows.map((r) => ({ code: r.code ?? '-', name: r.name ?? '-', count: r.count }));
  }

  // ── การควบคุมการเข้าถึง ──────────────────────────────────────────────

  private async accessRequestTotals(
    scoped: SQL,
    inPeriod: SQL,
  ): Promise<{
    total: number;
    offboarding: number;
    offboardingDone: number;
    byKind: { code: string; name: string; count: number }[];
  }> {
    const OFFBOARD: SQL = sql`${ticketCategory.code} = 'LIFECYCLE_OFFBOARD'`;

    const [totals] = await this.db
      .select({
        total: count(),
        offboarding: countWhere(OFFBOARD),
        offboardingDone: countWhere(and(OFFBOARD, sql`${ticket.resolvedAt} IS NOT NULL`) as SQL),
      })
      .from(ticket)
      .leftJoin(ticketCategory, eq(ticketCategory.id, ticket.categoryId))
      .where(and(scoped, IS_ACCESS_REQUEST, inPeriod) as SQL);

    const rows = await this.db
      .select({ code: ticketCategory.code, name: ticketCategory.nameTh, count: count() })
      .from(ticket)
      .leftJoin(ticketCategory, eq(ticketCategory.id, ticket.categoryId))
      .where(and(scoped, IS_ACCESS_REQUEST, inPeriod) as SQL)
      .groupBy(ticketCategory.code, ticketCategory.nameTh)
      .orderBy(desc(count()))
      .limit(LIST_CAP);

    return {
      total: totals?.total ?? 0,
      offboarding: totals?.offboarding ?? 0,
      offboardingDone: totals?.offboardingDone ?? 0,
      byKind: rows.map((r) => ({ code: r.code ?? '-', name: r.name ?? '-', count: r.count })),
    };
  }

  /**
   * ขั้นอนุมัติของคำขอสิทธิ์
   *
   * นับเฉพาะขั้นที่อยู่บนเรื่องซึ่งผู้เรียกมีสิทธิ์เห็น — ใช้ subquery ของ ticket
   * ที่ผ่าน ticketScopeWhere แล้ว ไม่ใช่ตาราง approval_request ตรง ๆ
   */
  private async approvalTotals(
    scope: AccessScope,
    period: ReportPeriod,
  ): Promise<{
    decided: number;
    rejected: number;
    pending: number;
    pendingOverTarget: number;
    avgHours: number | null;
  }> {
    const visible = this.db
      .select({ id: ticket.id })
      .from(ticket)
      .leftJoin(ticketCategory, eq(ticketCategory.id, ticket.categoryId))
      .where(
        and(this.reports.ticketScopeWhere(scope, undefined), IS_ACCESS_REQUEST) as SQL,
      );

    /* ⚠️ ใช้ fromIso/toIso ไม่ใช่ Date — พารามิเตอร์ของ sql ดิบรับได้เฉพาะสตริง (ดู ReportPeriod) */
    const decidedInPeriod: SQL = sql`(
      ${approvalRequest.decidedAt} >= ${period.fromIso}::timestamptz
      AND ${approvalRequest.decidedAt} < ${period.toIso}::timestamptz
    )`;
    const overTarget: SQL = sql`(
      ${approvalRequest.status} = 'pending'
      AND ${approvalRequest.requestedAt} < now() - ${sql.raw(`interval '${ACCESS_TARGETS.approvalPendingDays} days'`)}
    )`;

    const [row] = await this.db
      .select({
        decided: countWhere(decidedInPeriod),
        rejected: countWhere(
          and(decidedInPeriod, eq(approvalRequest.status, 'rejected')) as SQL,
        ),
        pending: countWhere(eq(approvalRequest.status, 'pending')),
        pendingOverTarget: countWhere(overTarget),
        avgHours: sql<
          number | null
        >`round(avg(extract(epoch from (${approvalRequest.decidedAt} - ${approvalRequest.requestedAt})) / 3600) FILTER (WHERE ${decidedInPeriod})::numeric, 1)`,
      })
      .from(approvalRequest)
      .where(inArray(approvalRequest.ticketId, visible));

    return {
      decided: row?.decided ?? 0,
      rejected: row?.rejected ?? 0,
      pending: row?.pending ?? 0,
      pendingOverTarget: row?.pendingOverTarget ?? 0,
      avgHours: numberOrNull(row?.avgHours ?? null),
    };
  }

  /** สถานะของบัญชีผู้ใช้ในขอบเขตบริษัทของผู้เรียก */
  private async accountPosture(scope: AccessScope): Promise<{
    active: number;
    adminAccounts: number;
    locked: number;
    dormant: number;
    neverLoggedIn: number;
  }> {
    const dormantCutoff: SQL = sql`now() - ${sql.raw(`interval '${ACCESS_TARGETS.dormantAccountDays} days'`)}`;

    const [row] = await this.db
      .select({
        active: countWhere(eq(appUser.isActive, true)),
        adminAccounts: countWhere(
          and(eq(appUser.isActive, true), eq(appUser.isAdminAccount, true)) as SQL,
        ),
        locked: countWhere(eq(appUser.isLocked, true)),
        dormant: countWhere(
          and(
            eq(appUser.isActive, true),
            sql`${appUser.lastLoginAt} IS NOT NULL AND ${appUser.lastLoginAt} < ${dormantCutoff}`,
          ) as SQL,
        ),
        neverLoggedIn: countWhere(
          and(eq(appUser.isActive, true), isNull(appUser.lastLoginAt)) as SQL,
        ),
      })
      .from(appUser)
      .where(this.userScopeWhere(scope));

    return {
      active: row?.active ?? 0,
      adminAccounts: row?.adminAccounts ?? 0,
      locked: row?.locked ?? 0,
      dormant: row?.dormant ?? 0,
      neverLoggedIn: row?.neverLoggedIn ?? 0,
    };
  }

  /** สิทธิ์ที่ให้ไว้ — เน้นสิทธิ์ชั่วคราวที่ควรหมดอายุแล้วถูกถอน */
  private async grantPosture(scope: AccessScope): Promise<{
    total: number;
    withExpiry: number;
    expiredStillPresent: number;
  }> {
    const [row] = await this.db
      .select({
        total: count(),
        withExpiry: countWhere(isNotNull(userRole.expiresAt)),
        expiredStillPresent: countWhere(sql`${userRole.expiresAt} < now()`),
      })
      .from(userRole)
      .innerJoin(appUser, eq(appUser.id, userRole.userId))
      .where(this.userScopeWhere(scope));

    return {
      total: row?.total ?? 0,
      withExpiry: row?.withExpiry ?? 0,
      expiredStillPresent: row?.expiredStillPresent ?? 0,
    };
  }

  // ── ร่องรอยการตรวจสอบ ───────────────────────────────────────────────

  private async auditActivity(
    scope: AccessScope,
    period: ReportPeriod,
  ): Promise<{
    total: number;
    withOrigin: number;
    firstEntryAt: string | null;
    byAction: { action: string; count: number }[];
  }> {
    const where = and(
      gte(auditLog.createdAt, period.from) as SQL,
      lt(auditLog.createdAt, period.to) as SQL,
      this.auditScopeWhere(scope),
    ) as SQL;

    const [totals] = await this.db
      .select({
        total: count(),
        withOrigin: countWhere(isNotNull(auditLog.ipAddress)),
      })
      .from(auditLog)
      .where(where);

    /*
     * วันแรกที่ทะเบียนตรวจสอบเริ่มบันทึก — ไม่จำกัดช่วงเวลาโดยตั้งใจ
     *
     * ความครบของร่องรอย (AUD-1) ต่ำได้สองสาเหตุที่ต่างกันมาก: มีทางเขียนสถานะที่ลืมลงทะเบียน
     * กับ "ช่วงนั้นยังไม่ได้เปิดใช้ทะเบียน" ผู้อ่านต้องแยกสองอย่างนี้ออกจากกันได้เอง
     */
    const [firstRow] = await this.db
      .select({ at: sql<Date | null>`min(${auditLog.createdAt})` })
      .from(auditLog)
      .where(this.auditScopeWhere(scope));

    const rows = await this.db
      .select({ action: auditLog.action, count: count() })
      .from(auditLog)
      .where(where)
      .groupBy(auditLog.action)
      .orderBy(desc(count()))
      .limit(LIST_CAP);

    const firstAt = firstRow?.at ?? null;
    return {
      total: totals?.total ?? 0,
      withOrigin: totals?.withOrigin ?? 0,
      firstEntryAt: firstAt === null ? null : new Date(firstAt).toISOString(),
      byAction: rows,
    };
  }

  /**
   * การเปลี่ยนสถานะทุกครั้งต้องมีแถวใน audit — ข้อ A.5.28 ถามหาความครบของหลักฐาน
   *
   * เทียบจำนวนแถวในประวัติสถานะกับจำนวน audit ชนิด ticket.status_changed ในช่วงเดียวกัน
   * ตัวเลขที่ไม่เท่ากันแปลว่ามีทางเขียนสถานะที่ไม่ได้ลง audit ซึ่งต้องตามแก้
   */
  private async auditCoverage(
    scope: AccessScope,
    period: ReportPeriod,
  ): Promise<{ transitions: number; audited: number; percent: number | null }> {
    const visible = this.db
      .select({ id: ticket.id })
      .from(ticket)
      .where(this.reports.ticketScopeWhere(scope, undefined));

    const [history] = await this.db
      .select({ n: count() })
      .from(ticketStatusHistory)
      .where(
        and(
          gte(ticketStatusHistory.changedAt, period.from) as SQL,
          lt(ticketStatusHistory.changedAt, period.to) as SQL,
          inArray(ticketStatusHistory.ticketId, visible),
        ) as SQL,
      );

    const [audited] = await this.db
      .select({ n: count() })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'ticket.status_changed'),
          gte(auditLog.createdAt, period.from) as SQL,
          lt(auditLog.createdAt, period.to) as SQL,
          this.auditScopeWhere(scope),
        ) as SQL,
      );

    const transitions = history?.n ?? 0;
    const rows = audited?.n ?? 0;
    return {
      transitions,
      audited: rows,
      /* เกิน 100% เป็นไปไม่ได้ในทางปฏิบัติ แต่ถ้าเกิดขึ้นให้ตัดที่ 100 ไม่งั้นอ่านว่า "ดีเกินเป้า" */
      percent: transitions === 0 ? null : Math.min(100, percentOf(rows, transitions) ?? 0),
    };
  }

  // ── ขอบเขต ─────────────────────────────────────────────────────────

  /** ผู้ใช้ในบริษัทที่ผู้เรียกมองเห็น — super admin เห็นทุกบริษัท */
  private userScopeWhere(scope: AccessScope): SQL {
    if (scope.isSuperAdmin) return sql`true`;
    const ids = [...scope.companyIds];
    return ids.length > 0 ? (inArray(appUser.companyId, ids) as SQL) : sql`false`;
  }

  /** แถว audit ระดับกลุ่ม (company_id ว่าง) นับรวมด้วย เพราะผู้อ่านรายงานนี้เป็นระดับบริหาร */
  private auditScopeWhere(scope: AccessScope): SQL {
    if (scope.isSuperAdmin) return sql`true`;
    const ids = [...scope.companyIds];
    if (ids.length === 0) return sql`false`;
    return or(inArray(auditLog.companyId, ids), isNull(auditLog.companyId)) as SQL;
  }
}

/** ค่าที่ postgres คืนมาเป็นสตริงของ numeric — แปลงให้เป็นตัวเลขจริงหรือ null */
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface SecurityReport {
  document: {
    report_no: string;
    standard: string;
    period: { from: string; to: string; label: string };
    previous_period: { from: string; to: string };
    generated_at: string;
  };
  summary: {
    status: string;
    failing: string[];
    checks: SecurityCheck[];
  };
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
