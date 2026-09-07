import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte, isNull, sql, type SQL } from 'drizzle-orm';

import { PRIORITY, type Priority } from '../../common/constants';
import type { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import { ticket } from '../../db/schema';

export interface DashboardSummary {
  scope: { company_codes: string[] };
  open_tickets: number;
  breached: number;
  due_soon: number;
  resolved_this_month: number;
  sla_compliance_percent: number | null;
  by_priority: { priority: Priority; count: number }[];
  by_status: { status: string; count: number }[];
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

    const closedThisMonth = await this.count(and(base, gte(ticket.closedAt, monthStart)) as SQL);
    const breachedThisMonth = await this.count(
      and(base, gte(ticket.closedAt, monthStart), eq(ticket.isResolutionBreached, true)) as SQL,
    );

    return {
      scope: { company_codes: [...scope.companyIds].map(String) },
      open_tickets: open,
      breached,
      due_soon: dueSoon,
      resolved_this_month: resolvedThisMonth,
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
    };
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
