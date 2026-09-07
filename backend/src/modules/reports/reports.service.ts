import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';

import { PRIORITY } from '../../common/constants';
import type { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';

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
  constructor(@Inject(DB) private readonly db: Db) {}

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
          AND t.status IN ('new','assigned','in_progress','pending_user') AND ${scoped}
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
        AND t.status IN ('new','assigned','in_progress','pending_user') AND ${scoped}
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
        note: 'ตัด ticket ที่มี sla_exclusion_code ออกจากตัวหารแล้ว',
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
        note: 'ต้องอ่านคู่กับ csat.response_rate_percent เสมอ (SLA 7.1)',
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
        note: 'วัด ณ เวลาที่เรียก ไม่ใช่ในช่วงเวลาที่เลือก',
      },
      {
        code: 'KPI-6',
        name: 'Uptime ระบบ Critical',
        value: kpi6,
        unit: 'percent',
        target: 99.9,
        direction: 'higher',
        meets_target: this.verdict(kpi6, 99.9, 'higher'),
        denominator: uptimeRow?.services ?? 0,
        note:
          (uptimeRow?.services ?? 0) === 0
            ? 'ยังไม่มีระบบงานระดับ critical ในทะเบียน (Q-05)'
            : 'นับเฉพาะ downtime ที่ไม่ได้วางแผน',
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
          ? `${failing.join(', ')} ต่ำกว่าเป้าหมาย — SLA 7.3 บังคับให้จัดทำ Service Improvement Plan`
          : null,
    };
  }
}
