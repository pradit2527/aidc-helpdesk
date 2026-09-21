import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import {
  CLOCK_RUNNING_STATUSES,
  PRIORITY,
  TICKET_STATUS,
  WAITING_STATUSES,
  type Priority,
  type TicketStatus,
  type TicketType,
} from '../../common/constants';
import type { AccessScope } from '../../common/scope';
import { minutesBetween } from '../../common/sla/business-time';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import {
  appUser,
  company,
  department,
  serviceCatalogItem,
  supportProject,
  ticket,
  ticketCategory,
} from '../../db/schema';
import { SlaConfigRepository } from '../../db/repositories/sla-config.repository';
import type {
  IncidentMetricsDto,
  ServiceRequestMetricsDto,
  TicketReportDto,
  TicketReportFilters,
  TicketReportItemDto,
  TicketReportProjectRowDto,
  TicketReportRollupDto,
  TopCatalogItemDto,
} from './dto/ticket-report.dto';

/**
 * เพดานจำนวนใบที่ดึงมาคำนวณเวลาเฉลี่ยแบบนาทีทำการ
 *
 * ทำไมต้องดึงแถวมาคำนวณใน JS แทนที่จะ avg() ใน SQL
 *   "นาทีทำการ" ต้องรู้ปฏิทินเวลาทำการและวันหยุดของบริษัทนั้น ซึ่งอยู่คนละตาราง
 *   และมีกติกาทับซ้อนระหว่างระดับกลุ่มกับระดับบริษัท เขียนเป็น SQL ก้อนเดียว
 *   ได้ก็จริงแต่จะกลายเป็นเครื่องคำนวณ SLA ชุดที่สอง ซึ่งวันหนึ่งจะให้คำตอบ
 *   ไม่ตรงกับชุดแรกโดยไม่มีอะไรฟ้อง — ใช้ business-time.ts ตัวเดียวทั้งระบบดีกว่า
 *
 * ดึงแค่ 5 คอลัมน์ต่อแถว ไม่ใช่ทั้งใบ เดือนหนึ่งของทั้ง 7 บริษัทอยู่ในหลักพัน
 * ถ้าเกินเพดาน ค่าเฉลี่ยจะคิดจากใบที่เสร็จล่าสุดเท่านั้น และ DTO บอกตัวหารไว้ให้เห็น
 */
const DURATION_SAMPLE_CAP = 5000;

/**
 * ตาราง app_user ถูก join สองครั้งในคิวรีรายการ (ผู้แจ้ง กับ ผู้รับผิดชอบ)
 * จึงต้องตั้งชื่อแทนคนละชื่อ — กติกาเดียวกับ TicketRepository
 */
const requester = alias(appUser, 'requester');
const assignee = alias(appUser, 'assignee');

/**
 * สถานะที่ถือว่า "ยังเปิดอยู่" — ชุดเดียวกับ KPI-5 และแดชบอร์ด
 *
 * รวมสถานะพักที่ยังรอคนอื่นอยู่ด้วย (pending_approval / pending_user) เพราะ
 * เรื่องยังไม่จบและยังต้องมีคนตามต่อ — ต่างจาก resolved / fulfilled ซึ่งงาน
 * ของทีมจบแล้ว เหลือแค่รอผู้แจ้งยืนยัน
 */
const OPEN_STATUSES: readonly TicketStatus[] = [
  ...CLOCK_RUNNING_STATUSES,
  ...WAITING_STATUSES,
];

/**
 * ยังเปิดอยู่และนาฬิกา SLA ยังเดิน — ใช้ตัดสิน "เกินกำหนดแล้วตอนนี้"
 *
 * pending_vendor อยู่ในชุดนี้ด้วย เพราะการส่งของให้ผู้ขายไม่หยุดนาฬิกา
 * (ดู PAUSED_STATUSES ใน common/constants.ts) — เรื่องที่ค้างอยู่กับผู้ขาย
 * นานเกินกำหนดต้องถูกตั้งธงเกินกำหนดจริง ๆ ไม่ใช่ซ่อนไว้
 */
const RUNNING_STATUSES: readonly TicketStatus[] = CLOCK_RUNNING_STATUSES;

/**
 * งานของทีมจบแล้ว — ตัวหารของ "% ทัน SLA"
 *
 * fulfilled อยู่คู่กับ resolved เสมอ: สองสายนี้คือ "เสร็จ" ของคนละชนิด
 * ถ้าใส่แค่ resolved คำขอบริการทุกใบจะหายไปจากตัวหาร แล้ว % ทัน SLA
 * จะกลายเป็นตัวเลขของเฉพาะเหตุขัดข้องโดยที่หัวข้อไม่ได้บอกไว้
 */
const DONE_STATUSES: readonly TicketStatus[] = ['resolved', 'fulfilled', 'closed'];

/**
 * เงื่อนไข "เกินกำหนดแก้ไข" ที่ใช้ทั้งในยอดรวม ทุกมิติ และคอลัมน์ในรายการ
 *
 * ประกาศครั้งเดียวแล้วใช้ซ้ำ — ถ้าแต่ละคิวรีเขียนนิยามของตัวเอง วันหนึ่งตัวเลข
 * ในการ์ดสรุปจะไม่เท่ากับผลรวมของตาราง แล้วไม่มีใครบอกได้ว่าอันไหนถูก
 *
 * นับเป็นเกินกำหนดเมื่อข้อใดข้อหนึ่งจริง
 *   1. ธง is_resolution_breached ที่งานกวาด SLA ตั้งไว้
 *   2. แก้ไขเสร็จหลังกำหนด (resolved_at > resolution_due_at) — ใช้ได้แม้งานกวาดไม่ทำงาน
 *   3. ยังเปิดอยู่ นาฬิกายังเดิน และเลยกำหนดแล้ว ณ ตอนที่เรียก
 * และต้องไม่มี sla_exclusion_code — เหตุยกเว้นตาม SLA ภาคผนวก ก.2 ไม่ถือว่าผิด SLA
 */
const RESOLUTION_BREACHED: SQL = sql`(
  ${ticket.slaExclusionCode} IS NULL AND (
    ${ticket.isResolutionBreached} = true
    OR (
      ${ticket.resolvedAt} IS NOT NULL
      AND ${ticket.resolutionDueAt} IS NOT NULL
      AND ${ticket.resolvedAt} > ${ticket.resolutionDueAt}
    )
    OR (
      ${ticket.resolvedAt} IS NULL
      AND ${ticket.status} IN ${RUNNING_STATUSES}
      AND ${ticket.resolutionDueAt} IS NOT NULL
      AND ${ticket.resolutionDueAt} < now()
    )
  )
)`;

const IS_OPEN: SQL = sql`${ticket.status} IN ${OPEN_STATUSES}`;
const IS_DONE: SQL = sql`${ticket.status} IN ${DONE_STATUSES}`;

/** นับเฉพาะแถวที่เข้าเงื่อนไข · ::int เพื่อให้ได้ number ไม่ใช่สตริงของ bigint */
function countWhere(condition: SQL): SQL<number> {
  return sql<number>`count(*) FILTER (WHERE ${condition})::int`;
}

/** คอลัมน์ตัวเลขชุดเดียวกันสำหรับทุกมิติ (ผู้รับผิดชอบ · บริษัท · แผนก) */
const ROLLUP_COLUMNS = {
  total: sql<number>`count(*)::int`,
  open: countWhere(IS_OPEN),
  done: countWhere(IS_DONE),
  breached: countWhere(RESOLUTION_BREACHED),
  met: countWhere(sql`${IS_DONE} AND NOT ${RESOLUTION_BREACHED}`),
};

type RollupRow = { total: number; open: number; done: number; breached: number; met: number };

export interface ReportPeriod {
  from: Date;
  to: Date;
  /**
   * ขอบเขตช่วงเวลาในรูปข้อความ ISO สำหรับใส่ในคิวรี SQL ดิบ
   *
   * ⚠️ ห้ามส่งอ็อบเจกต์ Date เข้าไปใน db.execute() โดยตรง
   *    drizzle ส่งพารามิเตอร์ของ execute() ผ่าน postgres.unsafe() ซึ่งรับ
   *    เฉพาะ string / Buffer — Date จะได้ TypeError ที่ข้อความไม่บอกเลยว่า
   *    ปัญหาอยู่ที่คิวรีไหน ("The string argument must be of type string…")
   *    คิวรีที่สร้างด้วย query builder ไม่มีปัญหานี้ เพราะไม่ผ่าน unsafe()
   */
  fromIso: string;
  toIso: string;
  label: string;
}

export interface KpiResult {
  code: string;
  name: string;
  value: number | null;
  unit: 'percent' | 'minutes' | 'score';
  target: number;
  /** 'higher' = ค่ามากดีกว่า · 'lower' = ค่าน้อยดีกว่า */
  direction: 'higher' | 'lower';
  /** null เมื่อ value เป็น null — ยังไม่มีข้อมูลพอตัดสิน */
  meets_target: boolean | null;
  denominator: number;
  note?: string;
}

/**
 * รายงาน KPI-1…KPI-7 ตาม docs/04-rbac-sla.md §7.1
 *
 * ⚠️ กฎที่ต้องไม่ละเมิดในไฟล์นี้ — ทั้งสามข้อเคยทำให้รายงานโกหกมาแล้ว
 *
 *   1. ตัวหารเป็นศูนย์ต้องคืน null ไม่ใช่ 0 หรือ 100
 *      "SLA Compliance 100%" ที่มาจากเดือนที่ไม่มีใครปิดงานเลย
 *      ทำให้ผู้บริหารเข้าใจว่าทีมทำได้ครบ ทั้งที่ยังไม่มีอะไรให้วัด
 *
 *   2. KPI-2 ต้องแยกราย priority เสมอ (SLA 7.1 หมายเหตุ)
 *      P1 นับนาทีปฏิทิน P2–P4 นับนาทีทำการ การเฉลี่ยรวมกัน
 *      คือการบวกหน่วยคนละหน่วย ตัวเลขที่ได้ไม่มีความหมายเชิงสถิติ
 *
 *   3. KPI-1 ต้องตัด ticket ที่มี sla_exclusion_code ออกจาก **ตัวหาร**
 *      (SLA ภาคผนวก ก.2) ไม่ใช่นับเป็นผ่าน — เหตุที่ยกเว้นได้คือเหตุที่
 *      ไม่ควรอยู่ในสมการเลย เช่น ผู้ใช้ไม่ตอบกลับ
 */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly slaConfig: SlaConfigRepository,
  ) {}

  /**
   * เงื่อนไขขอบเขตในรูป SQL ดิบ
   *
   * รายงานเหล่านี้ใช้ SQL ดิบเพราะเป็นการรวมยอดที่มีเงื่อนไขซ้อนกันหลายชั้น
   * ซึ่งเขียนด้วย query builder แล้วอ่านยากกว่ามาก — แต่แลกมาด้วยการที่
   * ตัวตรวจชนิดช่วยอะไรไม่ได้ จึงต้องประกอบเงื่อนไขขอบเขตไว้ที่เดียว
   * แล้วให้ทุกคิวรีในไฟล์นี้เรียกใช้ตัวเดียวกัน
   */
  private scopeSql(scope: AccessScope, alias = 't'): SQL {
    if (scope.isSuperAdmin) return sql`true`;
    const ids = [...scope.companyIds];
    if (ids.length === 0) return sql`false`;
    return sql`${sql.raw(alias)}.company_id in ${ids}`;
  }

  /**
   * แปลงพารามิเตอร์ช่วงเวลา
   *
   * ค่าเริ่มต้นคือเดือนปัจจุบันตามเวลาเวียงจันทน์ ไม่ใช่ UTC —
   * รายงานเดือนกันยายนที่ตัดขอบด้วย UTC จะดึงงานของวันที่ 1 ก.ย.
   * เวลา 00:00–07:00 ตามเวลาท้องถิ่นไปอยู่ในเดือนสิงหาคม
   */
  resolvePeriod(from?: string, to?: string): ReportPeriod {
    const parse = (s: string | undefined): Date | null => {
      if (!s) return null;
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const parsedTo = parse(to) ?? new Date();
    const parsedFrom =
      parse(from) ??
      (() => {
        const d = new Date(parsedTo);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
      })();

    return {
      from: parsedFrom,
      to: parsedTo,
      fromIso: parsedFrom.toISOString(),
      toIso: parsedTo.toISOString(),
      label: `${parsedFrom.toISOString().slice(0, 10)} → ${parsedTo.toISOString().slice(0, 10)}`,
    };
  }

  private async scalar<T = number>(query: SQL): Promise<T | null> {
    const rows = (await this.db.execute(query)) as unknown as Record<string, unknown>[];
    const first = rows[0];
    if (!first) return null;
    const value = Object.values(first)[0];
    return (value ?? null) as T | null;
  }

  /** ปัดเป็นทศนิยม 1 ตำแหน่ง · null ผ่านทะลุไปโดยไม่กลายเป็น 0 */
  private round1(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
  }

  private verdict(
    value: number | null,
    target: number,
    direction: 'higher' | 'lower',
  ): boolean | null {
    if (value === null) return null;
    return direction === 'higher' ? value >= target : value <= target;
  }

  // ── KPI-1 · SLA Compliance ──────────────────────────────────────────

  async slaCompliance(scope: AccessScope, period: ReportPeriod) {
    const rows = (await this.db.execute(sql`
      SELECT
        c.id                                       AS company_id,
        c.code                                     AS company_code,
        t.priority                                 AS priority,
        /*
         * ตัวหารนับเฉพาะใบที่ไม่มีเหตุยกเว้น ส่วน excluded นับแยกไว้แสดง
         *
         * แยกสองตัวเลขนี้ให้เห็นทั้งคู่โดยตั้งใจ — ถ้ารายงานแสดงแต่ค่า
         * ที่คำนวณได้ ผู้อ่านจะไม่มีทางรู้ว่ามีกี่ใบถูกตัดออกไป
         * แล้วเหตุยกเว้นที่ถูกใช้มากเกินควรจะซ่อนตัวอยู่ได้ตลอด
         */
        count(*) FILTER (WHERE t.sla_exclusion_code IS NULL)::int  AS closed,
        count(*) FILTER (
          WHERE t.sla_exclusion_code IS NULL
            AND t.resolved_at IS NOT NULL
            AND t.resolution_due_at IS NOT NULL
            AND t.resolved_at <= t.resolution_due_at
        )::int                                     AS met,
        count(*) FILTER (WHERE t.sla_exclusion_code IS NOT NULL)::int AS excluded
      FROM ticket t
      JOIN company c ON c.id = t.company_id
      WHERE t.deleted_at IS NULL
        AND t.closed_at >= ${period.fromIso}::timestamptz
        AND t.closed_at <= ${period.toIso}::timestamptz
        AND ${this.scopeSql(scope)}
      GROUP BY c.id, c.code, t.priority
      ORDER BY c.code, t.priority
    `)) as unknown as {
      company_id: number;
      company_code: string;
      priority: string;
      closed: number;
      met: number;
      excluded: number;
    }[];

    const byCompany = new Map<string, { id: number; closed: number; met: number; excluded: number }>();
    for (const r of rows) {
      const acc = byCompany.get(r.company_code) ?? {
        id: r.company_id,
        closed: 0,
        met: 0,
        excluded: 0,
      };
      acc.closed += r.closed;
      acc.met += r.met;
      acc.excluded += r.excluded;
      byCompany.set(r.company_code, acc);
    }

    const pct = (met: number, closed: number) =>
      closed === 0 ? null : Math.round((met / closed) * 1000) / 10;

    const totalClosed = rows.reduce((s, r) => s + r.closed, 0);
    const totalMet = rows.reduce((s, r) => s + r.met, 0);
    const totalExcluded = rows.reduce((s, r) => s + r.excluded, 0);

    return {
      period: { from: period.from.toISOString(), to: period.to.toISOString(), label: period.label },
      target_percent: 95,
      overall: {
        total: totalClosed,
        met: totalMet,
        excluded: totalExcluded,
        compliance_percent: pct(totalMet, totalClosed),
      },
      by_company: [...byCompany.entries()].map(([code, v]) => ({
        company: { id: v.id, code },
        total: v.closed,
        met: v.met,
        excluded: v.excluded,
        compliance_percent: pct(v.met, v.closed),
      })),
      by_priority: PRIORITY.map((p) => {
        const matching = rows.filter((r) => r.priority === p);
        const total = matching.reduce((s, r) => s + r.closed, 0);
        const met = matching.reduce((s, r) => s + r.met, 0);
        const excluded = matching.reduce((s, r) => s + r.excluded, 0);
        return { priority: p, total, met, excluded, compliance_percent: pct(met, total) };
      }),
      matrix: rows.map((r) => ({
        company: { id: r.company_id, code: r.company_code },
        priority: r.priority,
        total: r.closed,
        met: r.met,
        excluded: r.excluded,
        compliance_percent: pct(r.met, r.closed),
      })),
    };
  }

  // ── KPI-2 · First Response Time (แยกราย priority เสมอ) ───────────────

  private async firstResponseByPriority(scope: AccessScope, period: ReportPeriod) {
    const rows = (await this.db.execute(sql`
      SELECT
        t.priority AS priority,
        count(*)::int AS n,
        avg(extract(epoch FROM (t.first_response_at - t.created_at)) / 60) AS avg_minutes
      FROM ticket t
      WHERE t.deleted_at IS NULL
        AND t.first_response_at IS NOT NULL
        AND t.created_at >= ${period.fromIso}::timestamptz
        AND t.created_at <= ${period.toIso}::timestamptz
        AND ${this.scopeSql(scope)}
      GROUP BY t.priority
    `)) as unknown as { priority: string; n: number; avg_minutes: string | null }[];

    return PRIORITY.map((p) => {
      const row = rows.find((r) => r.priority === p);
      return {
        priority: p,
        responded: row?.n ?? 0,
        avg_minutes: this.round1(row?.avg_minutes ?? null),
        /*
         * P1 นับนาทีปฏิทิน P2–P4 นับนาทีทำการตาม SLA
         * ตัวเลขนี้เป็นนาทีปฏิทินทั้งหมด — สำหรับ P2–P4 จึงเป็น
         * ค่าที่ "แย่กว่าหรือเท่ากับ" ความจริงเสมอ ไม่เคยดูดีเกินจริง
         */
        clock: p === 'P1' ? ('calendar' as const) : ('calendar_approximation' as const),
      };
    });
  }

  // ── รวมทุก KPI ──────────────────────────────────────────────────────

  async kpi(scope: AccessScope, period: ReportPeriod) {
    const scoped = this.scopeSql(scope);

    const [
      compliance,
      frt,
      fcr,
      csat,
      backlog,
      uptime,
      repeat,
    ] = await Promise.all([
      // KPI-1
      this.scalar<string>(sql`
        SELECT CASE WHEN count(*) = 0 THEN NULL ELSE
          round(count(*) FILTER (
            WHERE t.resolved_at IS NOT NULL AND t.resolution_due_at IS NOT NULL
              AND t.resolved_at <= t.resolution_due_at
          ) * 100.0 / count(*), 1) END
        FROM ticket t
        WHERE t.deleted_at IS NULL AND t.sla_exclusion_code IS NULL
          AND t.closed_at >= ${period.fromIso}::timestamptz AND t.closed_at <= ${period.toIso}::timestamptz AND ${scoped}
      `),

      this.firstResponseByPriority(scope, period),

      // KPI-3 · First Contact Resolution
      //   pending_duration_minutes = 0 ใช้แทน "ไม่เคยเข้า pending_user"
      //   เพราะทุกครั้งที่ออกจาก pending ระบบบวกเวลาสะสมลงคอลัมน์นี้
      this.scalar<string>(sql`
        SELECT CASE WHEN count(*) = 0 THEN NULL ELSE
          round(count(*) FILTER (
            WHERE t.support_tier = 1
              AND t.assignee_change_count = 0
              AND t.pending_duration_minutes = 0
              AND t.reopen_count = 0
          ) * 100.0 / count(*), 1) END
        FROM ticket t
        WHERE t.deleted_at IS NULL AND t.ticket_type = 'incident'
          AND t.closed_at >= ${period.fromIso}::timestamptz AND t.closed_at <= ${period.toIso}::timestamptz AND ${scoped}
      `),

      // KPI-4 · CSAT + Response Rate
      this.db.execute(sql`
        SELECT
          avg(t.satisfaction_score)                              AS avg_score,
          count(*) FILTER (WHERE t.csat_sent_at IS NOT NULL)::int      AS sent,
          count(*) FILTER (WHERE t.csat_responded_at IS NOT NULL)::int AS responded
        FROM ticket t
        WHERE t.deleted_at IS NULL
          AND t.closed_at >= ${period.fromIso}::timestamptz AND t.closed_at <= ${period.toIso}::timestamptz AND ${scoped}
      `),

      // KPI-5 · Aged Backlog — วัด ณ ตอนนี้ ไม่ใช่ในช่วงเวลาที่เลือก
      this.scalar<string>(sql`
        SELECT CASE WHEN count(*) = 0 THEN NULL ELSE
          round(count(*) FILTER (
            WHERE t.resolution_due_at IS NOT NULL AND t.resolution_due_at < now()
          ) * 100.0 / count(*), 1) END
        FROM ticket t
        WHERE t.deleted_at IS NULL
          AND t.status IN ${OPEN_STATUSES} AND ${scoped}
      `),

      // KPI-6 · Uptime ระบบ Critical
      //   ตัวหาร: is_24x7 → 43,200 นาที/เดือน มิฉะนั้นใช้เวลาทำการ
      //   นับเฉพาะ downtime ที่ไม่ได้วางแผน (is_planned = false)
      this.db.execute(sql`
        WITH window_minutes AS (
          SELECT extract(epoch FROM (${period.toIso}::timestamptz - ${period.fromIso}::timestamptz)) / 60 AS total
        ),
        down AS (
          SELECT o.service_id,
                 sum(extract(epoch FROM (
                   least(coalesce(o.ended_at, now()), ${period.toIso}::timestamptz)
                   - greatest(o.started_at, ${period.fromIso}::timestamptz)
                 )) / 60) AS minutes
          FROM service_outage o
          WHERE o.is_planned = false
            AND o.started_at <= ${period.toIso}::timestamptz
            AND coalesce(o.ended_at, now()) >= ${period.fromIso}::timestamptz
          GROUP BY o.service_id
        )
        SELECT
          count(s.id)::int AS services,
          CASE WHEN count(s.id) = 0 THEN NULL ELSE
            round(avg(
              greatest(0, (w.total - coalesce(d.minutes, 0)) / nullif(w.total, 0) * 100)
            )::numeric, 2) END AS uptime_percent
        FROM service s
        CROSS JOIN window_minutes w
        LEFT JOIN down d ON d.service_id = s.id
        WHERE s.is_active = true AND s.service_tier = 'critical'
          AND (s.company_id IS NULL OR ${this.scopeSql(scope, 's')})
      `),

      // KPI-7 · Repeat Incident — problem_id เดิมซ้ำภายใน 90 วัน (ES-11)
      this.scalar<string>(sql`
        WITH closed AS (
          SELECT t.id, t.problem_id, t.created_at
          FROM ticket t
          WHERE t.deleted_at IS NULL AND t.ticket_type = 'incident'
            AND t.closed_at >= ${period.fromIso}::timestamptz AND t.closed_at <= ${period.toIso}::timestamptz AND ${scoped}
        )
        SELECT CASE WHEN count(*) = 0 THEN NULL ELSE
          round(count(*) FILTER (
            WHERE c.problem_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM ticket prev
              WHERE prev.problem_id = c.problem_id
                AND prev.id <> c.id
                AND prev.deleted_at IS NULL
                AND prev.created_at BETWEEN c.created_at - interval '90 days' AND c.created_at
            )
          ) * 100.0 / count(*), 1) END
        FROM closed c
      `),
    ]);

    const csatRow = (csat as unknown as {
      avg_score: string | null;
      sent: number;
      responded: number;
    }[])[0];
    const uptimeRow = (uptime as unknown as {
      services: number;
      uptime_percent: string | null;
    }[])[0];

    const denominator = async (q: SQL) => (await this.scalar<number>(q)) ?? 0;
    const closedCount = await denominator(sql`
      SELECT count(*)::int FROM ticket t
      WHERE t.deleted_at IS NULL AND t.sla_exclusion_code IS NULL
        AND t.closed_at >= ${period.fromIso}::timestamptz AND t.closed_at <= ${period.toIso}::timestamptz AND ${scoped}
    `);
    const openCount = await denominator(sql`
      SELECT count(*)::int FROM ticket t
      WHERE t.deleted_at IS NULL
        AND t.status IN ${OPEN_STATUSES} AND ${scoped}
    `);

    const kpi1 = this.round1(compliance);
    const kpi3 = this.round1(fcr);
    const kpi4 = this.round1(csatRow?.avg_score ?? null);
    const kpi5 = this.round1(backlog);
    const kpi6 = this.round1(uptimeRow?.uptime_percent ?? null);
    const kpi7 = this.round1(repeat);

    const items: KpiResult[] = [
      {
        code: 'KPI-1',
        name: 'SLA Compliance',
        value: kpi1,
        unit: 'percent',
        target: 95,
        direction: 'higher',
        meets_target: this.verdict(kpi1, 95, 'higher'),
        denominator: closedCount,
        note: 'ຕັດ ticket ທີ່ມີເຫດຍົກເວັ້ນອອກຈາກຕົວຫານແລ້ວ (SLA ພາກຜະໜວກ ກ.2)',
      },
      {
        code: 'KPI-3',
        name: 'First Contact Resolution',
        value: kpi3,
        unit: 'percent',
        target: 70,
        direction: 'higher',
        meets_target: this.verdict(kpi3, 70, 'higher'),
        denominator: closedCount,
      },
      {
        code: 'KPI-4',
        name: 'CSAT',
        value: kpi4,
        unit: 'score',
        target: 4.2,
        direction: 'higher',
        meets_target: this.verdict(kpi4, 4.2, 'higher'),
        denominator: csatRow?.responded ?? 0,
        note: 'ຕ້ອງອ່ານຄູ່ກັບອັດຕາການຕອບແບບສອບຖາມສະເໝີ (SLA 7.1)',
      },
      {
        code: 'KPI-5',
        name: 'Aged Backlog',
        value: kpi5,
        unit: 'percent',
        target: 5,
        direction: 'lower',
        meets_target: this.verdict(kpi5, 5, 'lower'),
        denominator: openCount,
        note: 'ວັດຄ່າ ຕອນທີ່ເອີ້ນ ບໍ່ແມ່ນຕະຫຼອດຊ່ວງເວລາທີ່ເລືອກ',
      },
      {
        code: 'KPI-6',
        name: 'Uptime ລະບົບ Critical',
        value: kpi6,
        unit: 'percent',
        target: 99.9,
        direction: 'higher',
        meets_target: this.verdict(kpi6, 99.9, 'higher'),
        denominator: uptimeRow?.services ?? 0,
        note:
          (uptimeRow?.services ?? 0) === 0
            ? 'ຍັງບໍ່ມີລະບົບງານລະດັບ critical ໃນທະບຽນ (Q-05)'
            : 'ນັບສະເພາະ downtime ທີ່ບໍ່ໄດ້ວາງແຜນ',
      },
      {
        code: 'KPI-7',
        name: 'Repeat Incident',
        value: kpi7,
        unit: 'percent',
        target: 10,
        direction: 'lower',
        meets_target: this.verdict(kpi7, 10, 'lower'),
        denominator: closedCount,
      },
    ];

    /*
     * SLA 7.3 บังคับให้จัดทำ Service Improvement Plan เมื่อ KPI ตกเป้า
     * ระบุให้ชัดว่าตัวไหนตก ไม่ใช่แค่ธง true/false — ผู้รับผิดชอบ
     * ต้องรู้ว่าต้องเขียนแผนเรื่องอะไรบ้างโดยไม่ต้องไล่อ่านตารางเอง
     */
    const failing = items.filter((k) => k.meets_target === false).map((k) => k.code);

    return {
      period: { from: period.from.toISOString(), to: period.to.toISOString(), label: period.label },
      items,
      /*
       * KPI-2 อยู่แยกจาก items เพราะเป็นค่าเดียวไม่ได้
       * การยัดเป็นค่าเฉลี่ยรวมเพื่อให้เข้ารูปตารางคือการทำให้ตัวเลขผิด
       * เพื่อความสวยของหน้าจอ ซึ่งแลกไม่คุ้ม
       */
      kpi2_first_response: {
        code: 'KPI-2',
        name: 'First Response Time',
        target_minutes: 30,
        by_priority: frt,
      },
      csat: {
        sent: csatRow?.sent ?? 0,
        responded: csatRow?.responded ?? 0,
        response_rate_percent:
          (csatRow?.sent ?? 0) === 0
            ? null
            : Math.round(((csatRow?.responded ?? 0) / (csatRow?.sent ?? 1)) * 1000) / 10,
      },
      sip_required: failing.length > 0,
      sip_reason:
        failing.length > 0
          ? `${failing.join(', ')} ຕ່ຳກວ່າເປົ້າໝາຍ — SLA 7.3 ບັງຄັບໃຫ້ຈັດທຳແຜນປັບປຸງບໍລິການ (SIP)`
          : null,
    };
  }

  // ── รายงานเรื่องแจ้งแบบกรองได้ (บริษัท / แผนก / สถานะ / รายบุคคล) ────────

  /**
   * เงื่อนไขขอบเขตของตาราง ticket — ต้องเท่ากับ TicketRepository.baseWhere ทุกข้อ
   *
   * เขียนซ้ำที่นี่ด้วย query builder เพราะ baseWhere เป็น private ของ repository
   * และรายงานนี้ต้องใช้ WHERE เดียวกันกับ GROUP BY หลายมิติซึ่ง repository ไม่มีให้
   *
   *   1. ตัดแถวที่ถูกลบแบบ soft delete
   *   2. จำกัดบริษัทตาม user_role_scope — company_id ที่ขอมานอกขอบเขตถูก
   *      visibleCompanyIds ตัดทิ้งเงียบ ๆ จนเหลือเซตว่าง → `false` → ได้รายงานเปล่า
   *      ไม่ตอบ 403 เพื่อไม่ยืนยันว่าบริษัทนั้นมีอยู่ (US-07 AC-2)
   *   3. ผู้ที่ไม่มี ticket.read เห็นเฉพาะเรื่องที่ตนแจ้งหรือตนสร้าง
   *   4. เหตุความปลอดภัยเห็นเฉพาะผู้เกี่ยวข้อง — แคบกว่าบริษัท (SOP-10 ข้อ 2)
   *
   * ⚠️ ถ้า TicketRepository.baseWhere เปลี่ยน ต้องเปลี่ยนที่นี่ด้วย
   *    รายงานที่เห็นมากกว่าหน้ารายการคือการรั่วข้อมูลข้ามบริษัทแบบหนึ่ง
   */
  private ticketScopeWhere(scope: AccessScope, requestedCompanyId: number | undefined): SQL {
    const parts: SQL[] = [isNull(ticket.deletedAt) as SQL];

    const visible = scope.visibleCompanyIds(requestedCompanyId ? [requestedCompanyId] : null);
    if (!scope.isSuperAdmin) {
      parts.push(visible.size > 0 ? (inArray(ticket.companyId, [...visible]) as SQL) : sql`false`);
    } else if (visible.size > 0) {
      parts.push(inArray(ticket.companyId, [...visible]) as SQL);
    }

    if (!scope.isSuperAdmin && !scope.has('ticket.read')) {
      parts.push(
        or(eq(ticket.requesterId, scope.userId), eq(ticket.createdBy, scope.userId)) as SQL,
      );
    }

    if (!scope.isSecurityIncidentViewer) {
      parts.push(
        or(
          eq(ticket.isSecurityIncident, false),
          eq(ticket.requesterId, scope.userId),
          eq(ticket.assigneeId, scope.userId),
          eq(ticket.incidentCommanderId, scope.userId),
        ) as SQL,
      );
    }

    return and(...parts) as SQL;
  }

  /**
   * รายงานเรื่องแจ้งตามตัวกรอง — ทุกส่วนใช้ WHERE ก้อนเดียวกัน
   *
   * ช่วงเวลาตัดจาก created_at ("เรื่องที่แจ้งเข้ามาในช่วงนี้") ไม่ใช่ closed_at
   * เพราะรายงานนี้กรองสถานะได้ทุกค่า รวมเรื่องที่ยังเปิดอยู่ซึ่งไม่มีวันปิด
   *
   * รวมยอดใน SQL ด้วย GROUP BY ทั้งหมด ไม่ดึงแถวมานับใน JS — เดือนหนึ่งของทั้ง
   * 7 บริษัทมีหลักพันแถว และฐานข้อมูล dev อยู่คนละทวีป การดึงทั้งก้อนช้ากว่า
   * การยิง 7 คิวรีพร้อมกันหลายเท่า
   */
  async ticketReport(
    scope: AccessScope,
    filters: TicketReportFilters,
    period: ReportPeriod,
  ): Promise<TicketReportDto> {
    const parts: SQL[] = [
      this.ticketScopeWhere(scope, filters.companyId),
      gte(ticket.createdAt, period.from) as SQL,
      lte(ticket.createdAt, period.to) as SQL,
    ];
    if (filters.departmentId) parts.push(eq(ticket.departmentId, filters.departmentId) as SQL);
    if (filters.status.length > 0) parts.push(inArray(ticket.status, [...filters.status]) as SQL);
    if (filters.assigneeId) parts.push(eq(ticket.assigneeId, filters.assigneeId) as SQL);
    if (filters.requesterId) parts.push(eq(ticket.requesterId, filters.requesterId) as SQL);
    /*
     * ตัวกรองโครงการทำให้แคบลงภายในขอบเขตเดิมเท่านั้น ไม่มีทางทำให้กว้างขึ้น
     * เพราะมันเป็นเงื่อนไข AND ที่ต่อท้าย ticketScopeWhere ซึ่งบังคับบริษัทไปแล้ว
     * ผู้เรียกที่ใส่ id ของโครงการนอกขอบเขตจึงได้รายงานเปล่า ไม่ใช่ข้อมูลของบริษัทอื่น
     */
    if (filters.projectId) parts.push(eq(ticket.supportProjectId, filters.projectId) as SQL);
    if (filters.ticketType) parts.push(eq(ticket.ticketType, filters.ticketType) as SQL);
    const where = and(...parts) as SQL;

    const offset = (filters.page - 1) * filters.pageSize;

    const [
      [totals],
      byStatus,
      byPriority,
      byAssignee,
      byCompany,
      byDepartment,
      byProject,
      incidentMetrics,
      serviceRequestMetrics,
      rows,
    ] = await Promise.all([
        this.db
          .select({
            total: sql<number>`count(*)::int`,
            open: countWhere(IS_OPEN),
            resolved: countWhere(sql`${ticket.status} = 'resolved'`),
            closed: countWhere(sql`${ticket.status} = 'closed'`),
            cancelled: countWhere(sql`${ticket.status} = 'cancelled'`),
            breached: countWhere(RESOLUTION_BREACHED),
            // avg ของ smallint คืน numeric ซึ่ง postgres.js ส่งมาเป็นสตริง — แปลงตอนประกอบผล
            avgSatisfaction: sql<string | null>`avg(${ticket.satisfactionScore})`,
            rated: sql<number>`count(${ticket.satisfactionScore})::int`,
          })
          .from(ticket)
          .where(where),

        this.db
          .select({ status: ticket.status, n: count() })
          .from(ticket)
          .where(where)
          .groupBy(ticket.status),

        this.db
          .select({ priority: ticket.priority, n: count() })
          .from(ticket)
          .where(where)
          .groupBy(ticket.priority),

        // แถวที่ assignee_id เป็น null คือเรื่องที่ยังไม่มีผู้รับผิดชอบ — ต้องคงไว้
        // ให้ผลรวมทุกแถวเท่ากับยอดรวม มิฉะนั้นผู้อ่านจะหาว่าที่หายไปอยู่ไหน
        this.db
          .select({ id: ticket.assigneeId, fullName: assignee.fullName, ...ROLLUP_COLUMNS })
          .from(ticket)
          .leftJoin(assignee, eq(assignee.id, ticket.assigneeId))
          .where(where)
          .groupBy(ticket.assigneeId, assignee.fullName)
          .orderBy(desc(sql`count(*)`), asc(assignee.fullName)),

        this.db
          .select({ id: company.id, code: company.code, nameTh: company.nameTh, ...ROLLUP_COLUMNS })
          .from(ticket)
          .innerJoin(company, eq(company.id, ticket.companyId))
          .where(where)
          .groupBy(company.id, company.code, company.nameTh)
          .orderBy(asc(company.code)),

        this.db
          .select({
            companyId: company.id,
            companyCode: company.code,
            departmentId: ticket.departmentId,
            departmentName: department.name,
            ...ROLLUP_COLUMNS,
          })
          .from(ticket)
          .innerJoin(company, eq(company.id, ticket.companyId))
          .leftJoin(department, eq(department.id, ticket.departmentId))
          .where(where)
          .groupBy(company.id, company.code, ticket.departmentId, department.name)
          .orderBy(asc(company.code), desc(sql`count(*)`)),

        /*
         * แถวที่ support_project_id เป็น null คือเรื่องที่แจ้งในระบบตามปกติ — ต้องคงไว้
         * ให้ผลรวมทุกแถวเท่ากับยอดรวม กติกาเดียวกับแถว "ยังไม่มีผู้รับผิดชอบ" ของ by_assignee
         */
        this.db
          .select({
            id: ticket.supportProjectId,
            code: supportProject.code,
            name: supportProject.name,
            ...ROLLUP_COLUMNS,
          })
          .from(ticket)
          .leftJoin(supportProject, eq(supportProject.id, ticket.supportProjectId))
          .where(where)
          .groupBy(ticket.supportProjectId, supportProject.code, supportProject.name)
          .orderBy(desc(sql`count(*)`), asc(supportProject.code)),

        this.incidentMetrics(where),
        this.serviceRequestMetrics(where),

        this.db
          .select({
            id: ticket.id,
            ticketNo: ticket.ticketNo,
            ticketType: ticket.ticketType,
            subject: ticket.subject,
            status: ticket.status,
            pendingReason: ticket.pendingReason,
            priority: ticket.priority,
            companyId: ticket.companyId,
            companyCode: company.code,
            departmentId: ticket.departmentId,
            departmentName: department.name,
            categoryId: ticket.categoryId,
            categoryName: ticketCategory.nameTh,
            projectId: ticket.supportProjectId,
            projectCode: supportProject.code,
            projectName: supportProject.name,
            requesterId: ticket.requesterId,
            requesterName: requester.fullName,
            assigneeId: ticket.assigneeId,
            assigneeName: assignee.fullName,
            createdAt: ticket.createdAt,
            resolutionDueAt: ticket.resolutionDueAt,
            resolvedAt: ticket.resolvedAt,
            closedAt: ticket.closedAt,
            breached: sql<boolean>`${RESOLUTION_BREACHED}`,
            slaExclusionCode: ticket.slaExclusionCode,
            satisfactionScore: ticket.satisfactionScore,
            reopenCount: ticket.reopenCount,
            updatedAt: ticket.updatedAt,
          })
          .from(ticket)
          .innerJoin(company, eq(company.id, ticket.companyId))
          .innerJoin(ticketCategory, eq(ticketCategory.id, ticket.categoryId))
          .innerJoin(requester, eq(requester.id, ticket.requesterId))
          .leftJoin(department, eq(department.id, ticket.departmentId))
          .leftJoin(assignee, eq(assignee.id, ticket.assigneeId))
          // leftJoin เสมอ — เรื่องส่วนใหญ่ไม่ได้มาจากโครงการ innerJoin จะทำให้หายทั้งรายงาน
          .leftJoin(supportProject, eq(supportProject.id, ticket.supportProjectId))
          .where(where)
          .orderBy(desc(ticket.createdAt), desc(ticket.id))
          .limit(filters.pageSize)
          .offset(offset),
      ]);

    const total = totals?.total ?? 0;
    const breached = totals?.breached ?? 0;

    const items: TicketReportItemDto[] = rows.map((r) => ({
      id: r.id,
      ticket_no: r.ticketNo,
      // คอลัมน์เหล่านี้เป็น varchar ที่มี CHECK คุมค่าอยู่แล้วในฐานข้อมูล
      // TypeScript เห็นแค่ string จึงต้องบอกชนิดที่แคบกว่าตรงนี้ — เหมือน TicketsService
      ticket_type: r.ticketType as TicketType,
      subject: r.subject,
      status: r.status as TicketStatus,
      pending_reason: r.pendingReason,
      priority: r.priority as Priority,
      company: { id: r.companyId, code: r.companyCode },
      department: r.departmentId ? { id: r.departmentId, name: r.departmentName ?? '' } : null,
      category: { id: r.categoryId, name_th: r.categoryName },
      support_project:
        r.projectId === null
          ? null
          : { id: r.projectId, code: r.projectCode ?? '', name: r.projectName ?? '' },
      requester: { id: r.requesterId, full_name: r.requesterName },
      assignee: r.assigneeId ? { id: r.assigneeId, full_name: r.assigneeName ?? '' } : null,
      created_at: r.createdAt.toISOString(),
      resolution_due_at: r.resolutionDueAt?.toISOString() ?? null,
      resolved_at: r.resolvedAt?.toISOString() ?? null,
      closed_at: r.closedAt?.toISOString() ?? null,
      is_resolution_breached: r.breached,
      sla_exclusion_code: r.slaExclusionCode,
      satisfaction_score: r.satisfactionScore,
      reopen_count: r.reopenCount,
      updated_at: r.updatedAt.toISOString(),
    }));

    return {
      period: { from: period.from.toISOString(), to: period.to.toISOString(), label: period.label },
      filters: {
        company_id: filters.companyId ?? null,
        department_id: filters.departmentId ?? null,
        status: filters.status,
        assignee_id: filters.assigneeId ?? null,
        requester_id: filters.requesterId ?? null,
        project_id: filters.projectId ?? null,
        ticket_type: filters.ticketType ?? null,
      },
      totals: {
        total,
        open: totals?.open ?? 0,
        resolved: totals?.resolved ?? 0,
        closed: totals?.closed ?? 0,
        cancelled: totals?.cancelled ?? 0,
        breached,
        breached_percent: this.percent(breached, total),
        avg_satisfaction: this.round2(totals?.avgSatisfaction ?? null),
        rated: totals?.rated ?? 0,
      },
      // ครบทุกค่าเสมอ — สถานะที่ไม่มีเรื่องเลยต้องเป็น 0 ไม่ใช่หายจากตาราง
      by_status: TICKET_STATUS.map((s) => ({
        status: s,
        count: byStatus.find((r) => r.status === s)?.n ?? 0,
      })),
      by_priority: PRIORITY.map((p) => ({
        priority: p,
        count: byPriority.find((r) => r.priority === p)?.n ?? 0,
      })),
      by_assignee: byAssignee.map((r) => ({
        assignee: r.id ? { id: r.id, full_name: r.fullName ?? '' } : null,
        ...this.rollup(r),
      })),
      by_company: byCompany.map((r) => ({
        company: { id: r.id, code: r.code, name_th: r.nameTh },
        ...this.rollup(r),
      })),
      by_department: byDepartment.map((r) => ({
        company: { id: r.companyId, code: r.companyCode },
        department: r.departmentId ? { id: r.departmentId, name: r.departmentName ?? '' } : null,
        ...this.rollup(r),
      })),
      by_project: byProject.map(
        (r): TicketReportProjectRowDto => ({
          project:
            r.id === null ? null : { id: r.id, code: r.code ?? '', name: r.name ?? '' },
          ...this.rollup(r),
        }),
      ),
      incident_metrics: incidentMetrics,
      service_request_metrics: serviceRequestMetrics,
      tickets: {
        items,
        page: filters.page,
        page_size: filters.pageSize,
        // ใช้ยอดรวมจากคิวรีสรุปแทนการ count ซ้ำ — WHERE เดียวกัน ค่าจึงเท่ากันเสมอ
        total,
        total_pages: Math.max(1, Math.ceil(total / filters.pageSize)),
      },
    };
  }

  // ── ตัวชี้วัดแยกตามชนิดของเรื่อง ────────────────────────────────────

  /**
   * เวลาเฉลี่ยแบบนาทีทำการ ระหว่างจุดเริ่มนาฬิกากับเวลาที่งานเสร็จ
   *
   * ใช้ร่วมกันทั้ง MTTR ของเหตุขัดข้อง และเวลาส่งมอบของคำขอบริการ เพราะสองอย่างนี้
   * ต่างกันแค่ "นับถึงสถานะอะไร" ส่วนวิธีนับเวลาเหมือนกันทุกข้อ
   *
   * ⚠️ หักเวลาที่หยุดนับออกด้วย (pending_duration_minutes)
   *    ไม่งั้นเรื่องที่รอผู้แจ้งตอบสองวันจะถูกนับเป็นความช้าของทีม ซึ่งเป็นสิ่งที่
   *    กฎการหยุดนาฬิกาทั้งหมดมีไว้เพื่อป้องกันตั้งแต่แรก
   *
   * ⚠️ หน่วยเวลาต่างกันตามระดับความสำคัญ — P1 นับ 24×7 ที่เหลือนับเฉพาะนาทีทำการ
   *    จึงต้องถาม targetFor() ทีละใบ (ค่าถูกแคชไว้แล้ว ไม่ยิงฐานข้อมูลซ้ำ)
   */
  private async averageWorkMinutes(
    rows: readonly {
      companyId: number;
      priority: string;
      clockStart: Date | null;
      completedAt: Date | null;
      pausedMinutes: number;
    }[],
  ): Promise<number | null> {
    const usable = rows.filter((r) => r.clockStart !== null && r.completedAt !== null);
    if (usable.length === 0) return null;

    let sum = 0;
    for (const row of usable) {
      const [cal, target] = await Promise.all([
        this.slaConfig.calendarFor(row.companyId),
        this.slaConfig.targetFor(row.companyId, row.priority as Priority),
      ]);
      /*
       * new Date(...) เสมอ ไม่ใช่แค่ cast — บาง caller (เช่น incidentMetrics)
       * ส่ง clockStart มาจากนิพจน์ sql<Date>`coalesce(...)` ซึ่ง postgres.js
       * คืนเป็นสตริง ไม่ใช่ Date เหมือนคอลัมน์ปกติ การ cast ระดับ TypeScript
       * ไม่ได้แปลงค่าจริงตอนรัน .getTime() จึงพังเฉพาะตอนมีข้อมูลจริงให้คำนวณ
       */
      const gross = minutesBetween(
        new Date(row.clockStart!),
        new Date(row.completedAt!),
        cal,
        target.clockMode,
      );
      sum += Math.max(0, gross - Math.max(0, row.pausedMinutes));
    }

    return Math.round((sum / usable.length) * 10) / 10;
  }

  /**
   * ตัวชี้วัดของเหตุขัดข้อง — MTTR · % ทัน SLA · จำนวนการเปิดคืน
   *
   * ⚠️ บังคับ ticket_type = 'incident' เสมอ ไม่ว่าผู้เรียกจะกรองชนิดมาหรือไม่
   *    ถ้าปล่อยให้ตัวกรองภายนอกเป็นตัวตัดสิน ผู้เรียกที่กรอง service_request
   *    จะได้ก้อนนี้เป็นตัวเลขของคำขอบริการ แต่ชื่อฟิลด์ยังบอกว่าเป็นของเหตุขัดข้อง
   */
  private async incidentMetrics(where: SQL): Promise<IncidentMetricsDto> {
    const scoped = and(where, eq(ticket.ticketType, 'incident')) as SQL;

    const [[agg], durationRows] = await Promise.all([
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          resolvedCount: countWhere(sql`${ticket.resolvedAt} IS NOT NULL`),
          done: countWhere(IS_DONE),
          met: countWhere(sql`${IS_DONE} AND NOT ${RESOLUTION_BREACHED}`),
          // sum() ของตารางเปล่าคืน NULL ไม่ใช่ 0 — coalesce ที่นี่ ไม่ใช่ใน JS
          reopenTotal: sql<number>`coalesce(sum(${ticket.reopenCount}), 0)::int`,
          reopenedTickets: countWhere(sql`${ticket.reopenCount} > 0`),
        })
        .from(ticket)
        .where(scoped),

      this.db
        .select({
          companyId: ticket.companyId,
          priority: ticket.priority,
          clockStart: sql<Date | null>`coalesce(${ticket.slaClockStartedAt}, ${ticket.createdAt})`,
          completedAt: ticket.resolvedAt,
          pausedMinutes: ticket.pendingDurationMinutes,
        })
        .from(ticket)
        .where(and(scoped, sql`${ticket.resolvedAt} IS NOT NULL`) as SQL)
        .orderBy(desc(ticket.resolvedAt))
        .limit(DURATION_SAMPLE_CAP),
    ]);

    return {
      total: agg?.total ?? 0,
      mttr_business_minutes: await this.averageWorkMinutes(durationRows),
      resolved_count: agg?.resolvedCount ?? 0,
      sla_met_percent: this.percent(agg?.met ?? 0, agg?.done ?? 0),
      reopen_total: agg?.reopenTotal ?? 0,
      reopened_tickets: agg?.reopenedTickets ?? 0,
    };
  }

  /**
   * ตัวชี้วัดของคำขอบริการ — เวลาส่งมอบเฉลี่ย · จำนวนที่ค้างรออนุมัติ · รายการยอดฮิต
   *
   * เวลาส่งมอบนับจาก `sla_clock_started_at` ซึ่งสำหรับคำขอที่ต้องอนุมัติคือ
   * "เวลาที่อนุมัติครบ" ไม่ใช่เวลาที่เปิดเรื่อง (ApprovalsService เป็นผู้เขียนค่านั้น)
   * จึงตอบข้อกำหนดของ SA ได้ตรง ๆ โดยไม่ต้องคำนวณย้อนจากประวัติ
   */
  private async serviceRequestMetrics(where: SQL): Promise<ServiceRequestMetricsDto> {
    const scoped = and(where, eq(ticket.ticketType, 'service_request')) as SQL;

    const [[agg], durationRows, topItems] = await Promise.all([
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          fulfilledCount: countWhere(sql`${ticket.resolvedAt} IS NOT NULL`),
          pendingApproval: countWhere(sql`${ticket.status} = 'pending_approval'`),
          rejected: countWhere(sql`${ticket.status} = 'rejected'`),
        })
        .from(ticket)
        .where(scoped),

      this.db
        .select({
          companyId: ticket.companyId,
          priority: ticket.priority,
          /*
           * ไม่ coalesce เป็น created_at ที่นี่ ต่างจากฝั่งเหตุขัดข้อง
           *
           * คำขอที่ยังไม่เริ่มนาฬิกามี sla_clock_started_at เป็น null ซึ่งแปลว่า
           * "ยังไม่เริ่มจับเวลา" การถอยไปใช้ created_at จะนับเวลารออนุมัติเข้าไปด้วย
           * ซึ่งเป็นสิ่งเดียวที่ข้อกำหนดข้อนี้สั่งห้ามไว้ชัดเจนที่สุด
           * ใบที่เป็น null จึงถูก averageWorkMinutes ตัดทิ้งไปเอง
           */
          clockStart: ticket.slaClockStartedAt,
          completedAt: ticket.resolvedAt,
          pausedMinutes: ticket.pendingDurationMinutes,
        })
        .from(ticket)
        .where(and(scoped, sql`${ticket.resolvedAt} IS NOT NULL`) as SQL)
        .orderBy(desc(ticket.resolvedAt))
        .limit(DURATION_SAMPLE_CAP),

      this.db
        .select({
          id: serviceCatalogItem.id,
          code: serviceCatalogItem.code,
          nameTh: serviceCatalogItem.nameTh,
          n: sql<number>`count(*)::int`,
        })
        .from(ticket)
        .innerJoin(serviceCatalogItem, eq(serviceCatalogItem.id, ticket.catalogItemId))
        .where(scoped)
        .groupBy(serviceCatalogItem.id, serviceCatalogItem.code, serviceCatalogItem.nameTh)
        .orderBy(desc(sql`count(*)`), asc(serviceCatalogItem.code))
        .limit(10),
    ]);

    return {
      total: agg?.total ?? 0,
      avg_fulfillment_business_minutes: await this.averageWorkMinutes(durationRows),
      fulfilled_count: agg?.fulfilledCount ?? 0,
      pending_approval_count: agg?.pendingApproval ?? 0,
      rejected_count: agg?.rejected ?? 0,
      top_catalog_items: topItems.map(
        (r): TopCatalogItemDto => ({ id: r.id, code: r.code, name_th: r.nameTh, count: r.n }),
      ),
    };
  }

  private rollup(r: RollupRow): TicketReportRollupDto {
    return {
      total: r.total,
      open: r.open,
      done: r.done,
      breached: r.breached,
      met_percent: this.percent(r.met, r.done),
    };
  }

  /** ทศนิยม 1 ตำแหน่ง · ตัวหารเป็นศูนย์คืน null — กฎข้อ 1 ของไฟล์นี้ */
  private percent(numerator: number, denominator: number): number | null {
    if (denominator === 0) return null;
    return Math.round((numerator / denominator) * 1000) / 10;
  }

  /** ปัดเป็นทศนิยม 2 ตำแหน่ง · null ผ่านทะลุไปโดยไม่กลายเป็น 0 */
  private round2(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
}
