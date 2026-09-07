import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';

import { PRIORITY, type Priority } from '../../common/constants';
import type { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import { company, ticket, ticketCategory } from '../../db/schema';

export interface DashboardSummary {
  /** บริษัทที่ตัวเลขชุดนี้ครอบคลุม — หน้าจอใช้บอกผู้ใช้ว่ากำลังดูขอบเขตไหน */
  scope: { company_codes: string[] };
  open_tickets: number;
  breached: number;
  /** ยังไม่เกินกำหนด แต่เหลือเวลาไม่ถึง 4 ชั่วโมงตามนาฬิกาจริง */
  at_risk: number;
  resolved_this_month: number;
  /** null = ยังไม่มีเรื่องปิดในเดือนนี้ ไม่ใช่ทำได้ครบ 100% */
  sla_compliance_percent: number | null;
  /** null = ยังไม่มีเรื่องไหนได้รับการตอบรับในเดือนนี้ */
  avg_first_response_minutes: number | null;
  by_priority: { priority: Priority; count: number }[];
  by_status: { status: string; count: number }[];
  trend: { date: string; created: number; resolved: number }[];
  top_categories: { name: string; count: number }[];
}

const OPEN_STATUSES = ['new', 'assigned', 'in_progress', 'pending_user'] as const;

/**
 * ตัวเลขสรุปหน้าแดชบอร์ด
 *
 * ⚠️ ทุกคิวรีต้องผ่านเงื่อนไขขอบเขตเดียวกับหน้ารายการ
 *    ตัวเลขสรุปที่ไม่กรองขอบเขตคือการรั่วข้อมูลข้ามบริษัทแบบหนึ่ง —
 *    ถึงไม่เห็นรายละเอียดของเรื่อง แต่ก็บอกได้ว่าบริษัทอื่นมีงานค้างเท่าไร
 *    ซึ่งเป็นข้อมูลทางธุรกิจที่ไม่ควรข้ามบริษัท
 */
@Injectable()
export class DashboardService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async summary(scope: AccessScope): Promise<DashboardSummary> {
    const base = this.scopeWhere(scope);
    const openOnly = and(base, sql`${ticket.status} in ${OPEN_STATUSES}`) as SQL;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [open, breached, resolvedThisMonth, byPriority, byStatus, dueSoon] = await Promise.all([
      this.count(openOnly),
      this.count(and(openOnly, eq(ticket.isResolutionBreached, true)) as SQL),
      this.count(and(base, gte(ticket.resolvedAt, monthStart)) as SQL),
      this.db
        .select({ priority: ticket.priority, n: count() })
        .from(ticket)
        .where(openOnly)
        .groupBy(ticket.priority),
      this.db
        .select({ status: ticket.status, n: count() })
        .from(ticket)
        .where(and(base, sql`${ticket.status} in ${OPEN_STATUSES}`) as SQL)
        .groupBy(ticket.status),
      /*
       * "ใกล้ครบกำหนด" = ยังไม่เกิน แต่เหลือน้อยกว่า 4 ชั่วโมงตามนาฬิกาจริง
       *
       * ใช้เวลาจริงไม่ใช่นาทีทำการ เพราะตัวเลขนี้มีไว้ให้หัวหน้าทีมเห็นว่า
       * "ต้องรีบจัดคนวันนี้" ซึ่งเป็นการตัดสินใจตามเวลานาฬิกา
       * ส่วนการตัดสินว่าเกินกำหนดหรือยังยังใช้นาทีทำการตามเอกสาร SLA
       */
      this.count(
        and(
          openOnly,
          eq(ticket.isResolutionBreached, false),
          sql`${ticket.resolutionDueAt} between now() and now() + interval '4 hours'`,
        ) as SQL,
      ),
    ]);

    const [avgResponse, trend, topCategories] = await Promise.all([
      this.avgFirstResponseMinutes(scope, monthStart),
      this.trend(scope),
      this.topCategories(scope),
    ]);

    const companyCodes = await this.companyCodes(scope);
    const closedThisMonth = await this.count(and(base, gte(ticket.closedAt, monthStart)) as SQL);
    const breachedThisMonth = await this.count(
      and(base, gte(ticket.closedAt, monthStart), eq(ticket.isResolutionBreached, true)) as SQL,
    );

    return {
      /*
       * รหัสบริษัทจริง ไม่ใช่ id แปลงเป็นสตริง
       *
       * ฟิลด์ชื่อ company_codes ที่บรรจุ id เป็นสัญญาที่โกหก — หน้าจอจะแสดง
       * "ພາບລວມຂອງ 1 · 3" แทนที่จะเป็น "AIDC-HQ · COSI" แล้วไม่มีใครรู้ว่าผิด
       * เพราะมันก็ยังเป็นสตริงที่แสดงได้อยู่
       */
      scope: { company_codes: companyCodes },
      open_tickets: open,
      breached,
      at_risk: dueSoon,
      resolved_this_month: resolvedThisMonth,
      avg_first_response_minutes: avgResponse,
      /*
       * คืน null เมื่อยังไม่มีเรื่องปิดในเดือนนี้ ไม่ใช่ 100
       *
       * 100% ที่มาจากตัวหารศูนย์ทำให้ผู้บริหารเข้าใจว่าทีมทำได้ครบทุกเรื่อง
       * ทั้งที่ความจริงคือยังไม่มีข้อมูลให้วัด — หน้าจอต้องแสดงว่า "ยังไม่มีข้อมูล"
       */
      sla_compliance_percent:
        closedThisMonth === 0
          ? null
          : Math.round(((closedThisMonth - breachedThisMonth) / closedThisMonth) * 1000) / 10,
      by_priority: PRIORITY.map((p) => ({
        priority: p,
        count: byPriority.find((r) => r.priority === p)?.n ?? 0,
      })),
      by_status: byStatus.map((r) => ({ status: r.status, count: r.n })),
      trend,
      top_categories: topCategories,
    };
  }

  /**
   * เวลาตอบรับครั้งแรกโดยเฉลี่ย (นาทีปฏิทิน)
   *
   * ⚠️ ตัวเลขนี้รวมทุก priority เข้าด้วยกัน จึงใช้ดูแนวโน้มคร่าว ๆ ได้เท่านั้น
   *    ห้ามเอาไปเทียบเป้า KPI-2 โดยตรง — P1 นับนาทีปฏิทิน ส่วน P2–P4
   *    นับนาทีทำการ การเฉลี่ยรวมกันคือการบวกหน่วยคนละหน่วย
   *    ตัวเลขที่เทียบเป้าได้จริงอยู่ที่ GET /reports/kpi ซึ่งแยกราย priority
   */
  private async avgFirstResponseMinutes(
    scope: AccessScope,
    since: Date,
  ): Promise<number | null> {
    const [row] = await this.db
      .select({
        avg: sql<string | null>`avg(extract(epoch FROM (${ticket.firstResponseAt} - ${ticket.createdAt})) / 60)`,
      })
      .from(ticket)
      .where(
        and(
          this.scopeWhere(scope),
          isNotNull(ticket.firstResponseAt),
          gte(ticket.createdAt, since),
        ) as SQL,
      );

    // ตัวหารเป็นศูนย์คืน null ไม่ใช่ 0 — "ตอบรับเฉลี่ย 0 นาที" อ่านแล้ว
    // เข้าใจว่าทีมตอบทันที ทั้งที่ความจริงคือยังไม่มีใครตอบเลย
    const avg = row?.avg;
    if (avg === null || avg === undefined) return null;
    const n = Number(avg);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  /**
   * แจ้งเข้าเทียบแก้ไขแล้ว ย้อนหลัง 7 วัน
   *
   * สร้างช่วงวันจาก generate_series แล้ว left join ไม่ใช่จัดกลุ่มจาก ticket
   * ตรง ๆ — วันที่ไม่มีเรื่องเข้าเลยต้องปรากฏเป็นศูนย์ ไม่ใช่หายไปจากกราฟ
   * กราฟที่ข้ามวันทำให้เส้นแนวโน้มชันกว่าความจริง
   *
   * ตัดวันตามเวลาเวียงจันทน์ ไม่ใช่ UTC มิฉะนั้นงานของเช้าวันนี้
   * (00:00–07:00 ตามเวลาท้องถิ่น) จะไปนับรวมกับเมื่อวาน
   */
  private async trend(
    scope: AccessScope,
  ): Promise<{ date: string; created: number; resolved: number }[]> {
    const scoped = scope.isSuperAdmin
      ? sql`true`
      : (() => {
          const ids = [...scope.companyIds];
          return ids.length === 0 ? sql`false` : sql`t.company_id in ${ids}`;
        })();

    const rows = (await this.db.execute(sql`
      WITH days AS (
        SELECT generate_series(
          (now() AT TIME ZONE 'Asia/Vientiane')::date - interval '6 days',
          (now() AT TIME ZONE 'Asia/Vientiane')::date,
          interval '1 day'
        )::date AS d
      )
      SELECT
        to_char(days.d, 'DD/MM') AS date,
        (SELECT count(*)::int FROM ticket t
          WHERE t.deleted_at IS NULL AND ${scoped}
            AND (t.created_at AT TIME ZONE 'Asia/Vientiane')::date = days.d) AS created,
        (SELECT count(*)::int FROM ticket t
          WHERE t.deleted_at IS NULL AND ${scoped}
            AND (t.resolved_at AT TIME ZONE 'Asia/Vientiane')::date = days.d) AS resolved
      FROM days
      ORDER BY days.d
    `)) as unknown as { date: string; created: number; resolved: number }[];

    return rows;
  }

  /** หมวดหมู่ที่มีเรื่องแจ้งมากที่สุด 5 อันดับในเดือนนี้ */
  private async topCategories(scope: AccessScope): Promise<{ name: string; count: number }[]> {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const rows = await this.db
      .select({ name: ticketCategory.nameTh, n: count() })
      .from(ticket)
      .innerJoin(ticketCategory, eq(ticketCategory.id, ticket.categoryId))
      .where(and(this.scopeWhere(scope), gte(ticket.createdAt, monthStart)) as SQL)
      .groupBy(ticketCategory.nameTh)
      .orderBy(desc(count()))
      .limit(5);

    return rows.map((r) => ({ name: r.name, count: r.n }));
  }

  /** รหัสบริษัทในขอบเขต · super_admin ที่ไม่จำกัดขอบเขตได้รายการว่าง = ทุกบริษัท */
  private async companyCodes(scope: AccessScope): Promise<string[]> {
    const ids = [...scope.companyIds];
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ code: company.code })
      .from(company)
      .where(inArray(company.id, ids))
      .orderBy(company.code);
    return rows.map((r) => r.code);
  }

  private async count(where: SQL): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(ticket).where(where);
    return row?.n ?? 0;
  }

  /**
   * เงื่อนไขขอบเขตของแดชบอร์ด
   *
   * super_admin เห็นทุกบริษัท ที่เหลือเห็นเฉพาะบริษัทที่ได้รับสิทธิ์
   * ตรงกับกฎเดียวกับ TicketRepository.scopeWhere
   */
  private scopeWhere(scope: AccessScope): SQL {
    const notDeleted = isNull(ticket.deletedAt) as SQL;
    if (scope.isSuperAdmin) return notDeleted;

    const ids = [...scope.companyIds];
    if (ids.length === 0) {
      // ไม่มีบริษัทในขอบเขต = ไม่ควรเห็นอะไรเลย ไม่ใช่เห็นทั้งหมด
      return and(notDeleted, sql`false`) as SQL;
    }
    return and(notDeleted, sql`${ticket.companyId} in ${ids}`) as SQL;
  }
}
