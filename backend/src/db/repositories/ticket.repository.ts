import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { AccessScope } from '../../common/scope';
import type { Db } from '../client';
import { DB } from '../db.module';
import type { ITicketRepository } from '../../application/ports/ticket-repository.port';
import type { TicketEntity } from '../../domain/ticket/ticket.entity';
import { NotFoundError } from '../../common/errors/domain-error';
import {
  appUser,
  company,
  department,
  ticket,
  ticketCategory,
  ticketSequence,
  ticketStatusHistory,
} from '../schema';

/**
 * ตาราง app_user ถูก join สองครั้งในคิวรีเดียว (ผู้แจ้ง กับ ผู้รับผิดชอบ)
 * จึงต้องตั้งชื่อแทนคนละชื่อ มิฉะนั้น Postgres ไม่รู้ว่า full_name เป็นของใคร
 */
const requester = alias(appUser, 'requester');
const assignee = alias(appUser, 'assignee');

/**
 * คอลัมน์ที่ทุกคิวรีของ ticket คืนกลับ
 *
 * ประกาศครั้งเดียวแล้วใช้ซ้ำ เพราะถ้าคัดลอกไว้หลายที่ การเพิ่มคอลัมน์ใหม่
 * จะไปโผล่แค่บางเส้นทาง แล้วกลายเป็นฟิลด์ที่ "หายไปเฉพาะตอนเปิดหน้ารายละเอียด"
 */
const TICKET_COLUMNS = {
  id: ticket.id,
  ticketNo: ticket.ticketNo,
  ticketType: ticket.ticketType,
  subject: ticket.subject,
  description: ticket.description,
  status: ticket.status,
  pendingReason: ticket.pendingReason,
  pendingStartedAt: ticket.pendingStartedAt,
  pendingDurationMinutes: ticket.pendingDurationMinutes,
  priority: ticket.priority,
  impact: ticket.impact,
  urgency: ticket.urgency,
  channel: ticket.channel,
  supportTier: ticket.supportTier,
  vendorRef: ticket.vendorRef,
  companyId: ticket.companyId,
  companyCode: company.code,
  departmentId: ticket.departmentId,
  departmentName: department.name,
  categoryId: ticket.categoryId,
  categoryName: ticketCategory.nameTh,
  requesterId: ticket.requesterId,
  requesterName: requester.fullName,
  assigneeId: ticket.assigneeId,
  assigneeName: assignee.fullName,
  slaPolicyId: ticket.slaPolicyId,
  slaClockStartedAt: ticket.slaClockStartedAt,
  responseDueAt: ticket.responseDueAt,
  resolutionDueAt: ticket.resolutionDueAt,
  firstResponseAt: ticket.firstResponseAt,
  workaroundAt: ticket.workaroundAt,
  workaroundNote: ticket.workaroundNote,
  resolvedAt: ticket.resolvedAt,
  resolutionNote: ticket.resolutionNote,
  isResponseBreached: ticket.isResponseBreached,
  isResolutionBreached: ticket.isResolutionBreached,
  slaExclusionCode: ticket.slaExclusionCode,
  reopenCount: ticket.reopenCount,
  satisfactionScore: ticket.satisfactionScore,
  isSecurityIncident: ticket.isSecurityIncident,
  isMajorIncident: ticket.isMajorIncident,
  incidentCommanderId: ticket.incidentCommanderId,
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
} as const;

/**
 * คิวรีตั้งต้นพร้อม join ทั้งหมด — ประกาศนอกคลาสเพื่อให้อนุมานชนิดแถวออกมาได้
 *
 * เคยเขียน TicketRow เป็น mapped type จาก TICKET_COLUMNS แต่วิธีนั้นทำ
 * ความเป็น null ของคอลัมน์หายไปหมด ทุกฟิลด์กลายเป็น non-null ทั้งที่ครึ่งหนึ่ง
 * เป็น null ได้จริง ปล่อยให้ Drizzle อนุมานเองแม่นกว่าและไม่มีวันหลุด sync
 */
function selectTicketsQuery(db: Db) {
  return db
    .select(TICKET_COLUMNS)
    .from(ticket)
    .innerJoin(company, eq(company.id, ticket.companyId))
    .innerJoin(ticketCategory, eq(ticketCategory.id, ticket.categoryId))
    .innerJoin(requester, eq(requester.id, ticket.requesterId))
    .leftJoin(department, eq(department.id, ticket.departmentId))
    .leftJoin(assignee, eq(assignee.id, ticket.assigneeId));
}

export type TicketRow = Awaited<ReturnType<typeof selectTicketsQuery>>[number];

/**
 * ตัวจัดการทรานแซกชันที่ db.transaction() ส่งเข้ามา
 *
 * ไม่ใช่ชนิดเดียวกับ Db — ไม่มี $client เพราะสั่งปิดการเชื่อมต่อจากในทรานแซกชันไม่ได้
 * จึงรับเป็นชนิดนี้ตรง ๆ แทนการ cast ซึ่งจะกลบความต่างนั้นไป
 */
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * ชั้นเดียวในระบบที่แปลง "สิทธิ์ของผู้ใช้" เป็น "เงื่อนไข WHERE"
 *
 * ⚠️ ห้ามเขียนคิวรีที่อ่านตาราง ticket ไว้นอกไฟล์นี้
 *    ข้อมูลที่หลุดขอบเขตออกมาหน้าตาถูกต้องทุกฟิลด์ ต่างแค่เป็นของบริษัทอื่น
 *    ซึ่งเป็นความผิดพลาดที่มองด้วยตาไม่เห็นและเทสต์ระดับ endpoint ไม่จับ
 */
@Injectable()
export class TicketRepository implements Partial<ITicketRepository> {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * เงื่อนไขขอบเขตที่ต้องมีในทุกคิวรีของตาราง ticket
   *
   *   1. ตัดแถวที่ถูกลบแบบ soft delete
   *   2. จำกัดบริษัทตาม user_role_scope
   *   3. ผู้ที่ไม่มีสิทธิ์อ่านระดับบริษัท เห็นเฉพาะเรื่องที่ตนแจ้งหรือตนสร้าง
   */
  private scopeWhere(scope: AccessScope, requestedCompanyIds?: readonly number[] | null): SQL {
    const parts: SQL[] = [isNull(ticket.deletedAt) as SQL];

    const visible = scope.visibleCompanyIds(requestedCompanyIds);
    if (!scope.isSuperAdmin) {
      // visibleCompanyIds ตัดบริษัทนอกขอบเขตทิ้งเงียบ ๆ ไปแล้ว (US-07 AC-2)
      // จึงไม่ตอบ 403 — ผู้ใช้แค่ไม่เห็นแถวเหล่านั้น และไม่รู้ว่ามีอยู่
      parts.push(visible.size > 0 ? (inArray(ticket.companyId, [...visible]) as SQL) : sql`false`);
    } else if (visible.size > 0) {
      parts.push(inArray(ticket.companyId, [...visible]) as SQL);
    }

    if (!scope.isSuperAdmin && !scope.has('ticket.read')) {
      parts.push(
        or(eq(ticket.requesterId, scope.userId), eq(ticket.createdBy, scope.userId)) as SQL,
      );
    }

    return and(...parts) as SQL;
  }

  /**
   * ซ่อนเหตุความปลอดภัยจากคนที่ไม่เกี่ยวข้อง
   *
   * เป็นข้อยกเว้นเดียวในระบบที่ขอบเขตแคบกว่าบริษัท — company_admin และ agent
   * คนอื่นในบริษัทเดียวกันก็ไม่เห็น (docs/04-rbac-sla.md §2.7)
   */
  private securityWhere(scope: AccessScope): SQL | undefined {
    if (scope.isSecurityIncidentViewer) return undefined;
    return or(
      eq(ticket.isSecurityIncident, false),
      eq(ticket.requesterId, scope.userId),
      eq(ticket.assigneeId, scope.userId),
      eq(ticket.incidentCommanderId, scope.userId),
    ) as SQL;
  }

  private baseWhere(scope: AccessScope, requestedCompanyIds?: readonly number[] | null): SQL {
    const scoped = this.scopeWhere(scope, requestedCompanyIds);
    const security = this.securityWhere(scope);
    return security ? (and(scoped, security) as SQL) : scoped;
  }

  async list(
    scope: AccessScope,
    filters: {
      companyIds?: readonly number[] | null;
      status?: readonly string[];
      priority?: readonly string[];
      ticketType?: string | undefined;
      assigneeId?: number | undefined;
      requesterId?: number | undefined;
      unassigned?: boolean;
      q?: string | undefined;
      page: number;
      pageSize: number;
    },
  ): Promise<{ rows: TicketRow[]; total: number }> {
    const parts: SQL[] = [this.baseWhere(scope, filters.companyIds)];

    if (filters.status?.length) parts.push(inArray(ticket.status, [...filters.status]) as SQL);
    if (filters.priority?.length) parts.push(inArray(ticket.priority, [...filters.priority]) as SQL);
    if (filters.ticketType) parts.push(eq(ticket.ticketType, filters.ticketType) as SQL);
    if (filters.assigneeId) parts.push(eq(ticket.assigneeId, filters.assigneeId) as SQL);
    if (filters.requesterId) parts.push(eq(ticket.requesterId, filters.requesterId) as SQL);
    if (filters.unassigned) parts.push(isNull(ticket.assigneeId) as SQL);
    if (filters.q) {
      // ILIKE '%…%' ใช้ดัชนี trigram ที่สร้างไว้ใน migration 0001
      // ภาษาลาวเขียนติดกันไม่มีช่องว่างคั่นคำ จึงใช้ full-text search ไม่ได้
      const pattern = `%${filters.q}%`;
      parts.push(
        or(
          sql`${ticket.subject} ILIKE ${pattern}`,
          sql`${ticket.description} ILIKE ${pattern}`,
          sql`${ticket.ticketNo} ILIKE ${pattern}`,
        ) as SQL,
      );
    }

    const where = and(...parts) as SQL;

    const rows = await selectTicketsQuery(this.db)
      .where(where)
      .orderBy(desc(ticket.updatedAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize);

    const [counted] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(ticket)
      .where(where);

    return { rows, total: counted?.total ?? 0 };
  }

  async findById(scope: AccessScope, id: number): Promise<TicketRow> {
    const [row] = await selectTicketsQuery(this.db)
      .where(and(this.baseWhere(scope), eq(ticket.id, id)) as SQL)
      .limit(1);

    if (!row) {
      // ตอบ 404 เหมือนกันทั้งกรณี "ไม่มีจริง" และ "มีแต่ไม่มีสิทธิ์เห็น"
      // ถ้าแยกเป็น 403 จะเป็นการบอกใบ้ว่าเลขที่นี้มีอยู่จริงในบริษัทอื่น
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: 'ບໍ່ພົບເລື່ອງທີ່ຕ້ອງການ' },
      });
    }
    return row;
  }

  /**
   * ออกเลขที่เรื่องแบบไม่ชนกัน (B-03)
   *
   * UPDATE … RETURNING ล็อกแถวลำดับของบริษัท+เดือนนั้นภายในทรานแซกชันเดียวกัน
   * request ที่สองจะรอจนกว่าตัวแรกจะ commit แล้วจึงได้เลขถัดไป
   *
   * ห้ามใช้ COUNT(*)+1 เด็ดขาด — สอง request พร้อมกันจะอ่านค่าเดียวกัน
   * แล้วไปตกที่ unique constraint ของ ticket_no ทีหลัง ซึ่งผู้ใช้เห็นเป็น 500
   */
  async nextTicketNo(
    tx: DbTransaction,
    companyId: number,
    companyCode: string,
    at: Date,
  ): Promise<string> {
    const period = `${at.getUTCFullYear()}${String(at.getUTCMonth() + 1).padStart(2, '0')}`;

    await tx
      .insert(ticketSequence)
      .values({ companyId, period, lastNo: 0 })
      .onConflictDoNothing();

    const [row] = await tx
      .update(ticketSequence)
      .set({ lastNo: sql`${ticketSequence.lastNo} + 1` })
      .where(and(eq(ticketSequence.companyId, companyId), eq(ticketSequence.period, period)))
      .returning({ lastNo: ticketSequence.lastNo });

    return `${companyCode}-${period}-${String(row?.lastNo ?? 1).padStart(4, '0')}`;
  }

  // ── การเขียนข้อมูล ────────────────────────────────────────────────────
  //
  // ย้ายมาจาก TicketsService ที่เดิมเรียก this.db เขียนตาราง ticket ตรง ๆ
  // ซึ่งข้ามชั้น repository ที่บังคับขอบเขตสิทธิ์อยู่ — เท่ากับมีทางเขียน
  // ที่ไม่ผ่านด่านความปลอดภัยเลย ทั้งที่ทางอ่านผ่านครบทุกทาง

  /**
   * บันทึกเรื่องใหม่ ออกเลขที่ และเขียนประวัติแถวแรก ในทรานแซกชันเดียว
   *
   * ทั้งสามอย่างต้องสำเร็จหรือล้มเหลวพร้อมกัน — ถ้าออกเลขที่แล้วบันทึกไม่สำเร็จ
   * เลขนั้นจะหายไปจากลำดับถาวร และการตรวจสอบภายในจะเจอช่องว่างที่อธิบายไม่ได้
   */
  async create(
    entity: TicketEntity,
    sla: {
      policyId: number | null;
      clockStartedAt: Date;
      responseDueAt: Date | null;
      resolutionDueAt: Date | null;
    },
    actorId: number,
  ): Promise<number> {
    const props = entity.toPersistence();

    const [companyRow] = await this.db
      .select({ code: company.code })
      .from(company)
      .where(eq(company.id, props.companyId))
      .limit(1);

    if (!companyRow) {
      throw new NotFoundError('COMPANY_NOT_FOUND', 'ບໍ່ພົບບໍລິສັດທີ່ລະບຸ', {
        companyId: props.companyId,
      });
    }

    return this.db.transaction(async (tx) => {
      const ticketNo = await this.nextTicketNo(
        tx,
        props.companyId,
        companyRow.code,
        sla.clockStartedAt,
      );

      const [row] = await tx
        .insert(ticket)
        .values({
          ticketNo,
          ticketType: props.ticketType ?? 'incident',
          companyId: props.companyId,
          departmentId: props.departmentId ?? null,
          categoryId: props.categoryId,
          catalogItemId: props.catalogItemId ?? null,
          serviceId: props.serviceId ?? null,
          requesterId: props.requesterId,
          createdBy: props.createdBy,
          subject: props.subject,
          description: props.description,
          channel: props.channel ?? 'portal',
          sourceDevice: props.sourceDevice ?? null,
          assetTag: props.assetTag ?? null,
          impact: props.impact,
          urgency: props.urgency,
          priority: props.priority,
          isMajorIncident: props.isMajorIncident ?? false,
          status: props.status,
          slaPolicyId: sla.policyId,
          slaClockStartedAt: sla.clockStartedAt,
          responseDueAt: sla.responseDueAt,
          resolutionDueAt: sla.resolutionDueAt,
        })
        .returning({ id: ticket.id });

      const ticketId = row!.id;

      // แถวแรกของประวัติ ทำให้ไทม์ไลน์เริ่มที่ "ใครแจ้ง" เสมอ ไม่ใช่เริ่มกลางเรื่อง
      await tx.insert(ticketStatusHistory).values({
        ticketId,
        fromStatus: null,
        toStatus: props.status,
        changedBy: actorId,
      });

      return ticketId;
    });
  }

  /** บันทึกการเปลี่ยนสถานะพร้อมประวัติ ในทรานแซกชันเดียว */
  async saveStatusChange(
    entity: TicketEntity,
    change: { from: string; to: string; actorId: number; reason?: string },
  ): Promise<void> {
    const props = entity.toPersistence();
    const id = props.id;
    if (id === undefined) {
      throw new Error('บันทึกการเปลี่ยนสถานะของเรื่องที่ยังไม่มี id ไม่ได้');
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(ticket)
        .set({
          status: props.status,
          resolvedAt: props.resolvedAt ?? null,
          closedAt: props.closedAt ?? null,
          closedBy: props.closedBy ?? null,
          pendingReason: props.pendingReason ?? null,
          pendingStartedAt: props.pendingStartedAt ?? null,
          pendingDurationMinutes: props.pendingDurationMinutes,
        })
        .where(eq(ticket.id, id));

      await tx.insert(ticketStatusHistory).values({
        ticketId: id,
        fromStatus: change.from,
        toStatus: change.to,
        changedBy: change.actorId,
        // คอลัมน์ชื่อ reason ไม่ใช่ note — บังคับกรอกกรณียกเลิกและเปิดใหม่
        ...(change.reason ? { reason: change.reason } : {}),
      });
    });
  }

  /** บันทึกการทบทวนระดับความสำคัญพร้อมประวัติและกำหนดเวลาใหม่ ในทรานแซกชันเดียว */
  async savePriorityChange(
    entity: TicketEntity,
    change: {
      fromPriority: string;
      toPriority: string;
      actorId: number;
      reason: string;
      sla: {
        policyId: number | null;
        responseDueAt: Date | null;
        resolutionDueAt: Date | null;
      };
    },
  ): Promise<void> {
    const props = entity.toPersistence();
    const id = props.id;
    if (id === undefined) {
      throw new Error('บันทึกการทบทวนระดับความสำคัญของเรื่องที่ยังไม่มี id ไม่ได้');
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(ticket)
        .set({
          impact: props.impact,
          urgency: props.urgency,
          priority: props.priority,
          priorityChangedAt: props.priorityChangedAt ?? null,
          isMajorIncident: props.isMajorIncident ?? false,
          slaPolicyId: change.sla.policyId,
          responseDueAt: change.sla.responseDueAt,
          resolutionDueAt: change.sla.resolutionDueAt,
        })
        .where(eq(ticket.id, id));

      await tx.insert(ticketStatusHistory).values({
        ticketId: id,
        fromStatus: props.status,
        toStatus: props.status,
        fromPriority: change.fromPriority,
        toPriority: change.toPriority,
        changedBy: change.actorId,
        reason: change.reason,
      });
    });
  }
}
