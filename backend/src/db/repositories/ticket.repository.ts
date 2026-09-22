import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { AccessScope } from '../../common/scope';
import type { Db } from '../client';
import { DB } from '../db.token';
import type {
  AssignmentRecord,
  ITicketRepository,
  PublicCommentRecord,
  StatusChangeRecord,
} from '../../application/ports/ticket-repository.port';
import { TicketEntity } from '../../domain/ticket/ticket.entity';
import type {
  Impact,
  Priority,
  TicketStatus,
  TicketType,
  Urgency,
} from '../../common/constants';
import { NotFoundError } from '../../common/errors/domain-error';
import {
  appUser,
  approvalRequest,
  auditLog,
  company,
  department,
  permission,
  role,
  rolePermission,
  ticket,
  ticketCategory,
  ticketComment,
  ticketSequence,
  ticketStatusHistory,
  userRole,
  userRoleScope,
} from '../schema';
import type { PlannedApprovalStep } from './service-catalog.repository';

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
  catalogItemId: ticket.catalogItemId,
  relatedTicketId: ticket.relatedTicketId,
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
  closedAt: ticket.closedAt,
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

/** คอลัมน์ reason ของประวัติยาวได้ 500 — ตัดก่อนเขียน แทนการปล่อยให้ทั้งทรานแซกชันล้ม */
const HISTORY_REASON_MAX = 500;

/**
 * สถานะที่ถือว่า "ยังอยู่ในมือเจ้าหน้าที่"
 *
 * resolved ไม่นับ เพราะงานของเจ้าหน้าที่จบแล้ว เหลือรอผู้แจ้งยืนยัน
 * ส่วน pending_user นับ เพราะเรื่องยังเป็นความรับผิดชอบของเขา แม้นาฬิกาจะหยุดเดิน
 */
const OPEN_WORKLOAD_STATUSES = ['new', 'assigned', 'in_progress', 'pending_user'] as const;

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
      /**
       * เฉพาะเรื่องของโครงการใน Support Hub นี้
       *
       * ⚠️ ทำให้แคบลงเท่านั้น ไม่เคยทำให้กว้างขึ้น — baseWhere ยังบังคับขอบเขต
       *    บริษัทอยู่ก่อนเสมอ ผู้เรียกที่ใส่ id ของโครงการนอกขอบเขตจึงได้รายการว่าง
       */
      projectId?: number | undefined;
      unassigned?: boolean;
      q?: string | undefined;
      sort?: 'updated' | 'created' | 'assigned' | undefined;
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
    if (filters.projectId) parts.push(eq(ticket.supportProjectId, filters.projectId) as SQL);
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

    /*
     * ลำดับ — ใหม่สุดอยู่บนเสมอ ต่างกันที่ "ใหม่" วัดจากอะไร
     *
     * assigned: เวลาที่เรื่องถูกมอบให้ผู้รับผิดชอบ "คนปัจจุบัน" ครั้งล่าสุด อ่านจากประวัติ
     *   ไม่ใช้ updated_at เพราะคอมเมนต์ของผู้แจ้งในเรื่องเก่าก็ดัน updated_at ขึ้นมาได้
     *   เจ้าหน้าที่จะเห็นเรื่องเก่าลอยขึ้นมาทับงานที่หัวหน้าเพิ่งมอบให้
     *   ไม่เพิ่มคอลัมน์ assigned_at เพราะประวัติมีข้อมูลนี้ครบอยู่แล้ว และ subquery
     *   วิ่งบนดัชนี ix_ticket_history_ticket (ticket_id, changed_at) ต่อแถวของหน้าเดียว
     *   เรื่องที่ไม่มีประวัติมอบหมาย (ข้อมูลนำเข้า) ตกไปท้าย แล้วเรียงตามวันที่แจ้ง
     */
    const assignedAt = sql`(
      select max(h.changed_at) from ticket_status_history h
      where h.ticket_id = ${ticket.id} and h.to_assignee_id = ${ticket.assigneeId}
    )`;
    const order =
      filters.sort === 'assigned'
        ? [sql`${assignedAt} desc nulls last`, desc(ticket.createdAt)]
        : filters.sort === 'created'
          ? [desc(ticket.createdAt)]
          : [desc(ticket.updatedAt)];

    /*
     * แถวของหน้ากับจำนวนทั้งหมดไม่พึ่งผลของกันเลย จึงยิงพร้อมกัน
     * บนฐานข้อมูลที่อยู่ไกล การยิงทีละตัวเสียรอบเครือข่ายเพิ่มหนึ่งรอบทุกครั้งที่เปิดรายการ
     */
    const [rows, [counted]] = await Promise.all([
      selectTicketsQuery(this.db)
        .where(where)
        .orderBy(...order)
        .limit(filters.pageSize)
        .offset((filters.page - 1) * filters.pageSize),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(ticket)
        .where(where),
    ]);

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
   * ผู้ที่รับเรื่องของบริษัทนี้ได้
   *
   * เงื่อนไขสองข้อพร้อมกัน
   *   1. ถือบทบาทที่ยังไม่หมดอายุซึ่งให้สิทธิ์ ticket.change_status (หรือเป็น super_admin)
   *      — อ่านจาก role_permission ไม่ผูกกับชื่อบทบาท เพราะหน้าจัดการสิทธิ์แก้ได้
   *   2. บริษัทนี้อยู่ในขอบเขตของเขา — กติกาเดียวกับ AccessScope:
   *      มีแถว user_role_scope ใช้ตามนั้น ไม่มีเลยใช้บริษัทต้นสังกัด
   *
   * ⚠️ ถ้ามอบเรื่องให้คนที่ไม่ผ่านข้อ 2 เขาจะได้รับมอบหมายแต่เปิดเรื่องนั้นไม่ได้
   *    (findById ตอบ 404) เรื่องจะค้างอยู่ในมือคนที่มองไม่เห็นมัน
   */
  async assignableUsers(companyId: number): Promise<{ id: number; fullName: string }[]> {
    const users = await this.ticketWorkers();

    return users
      .filter((u) => u.superAdmin || u.scopedCompanyIds.has(companyId))
      .map(({ id, fullName }) => ({ id, fullName }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  /**
   * ผู้ที่รับเรื่องได้ ในบริษัทที่ผู้เรียกดูแล — ตัวเลือกตอนตั้งทีม
   *
   * ใช้กฎ "ใครทำงานกับเรื่องได้" ชุดเดียวกับ assignableUsers (ticketWorkers)
   * ถ้าเขียนกฎซ้ำอีกชุด วันหนึ่งหน้าตั้งทีมจะเสนอคนที่มอบหมายจริงไม่ได้
   */
  async ticketWorkerCandidates(
    scope: AccessScope,
  ): Promise<{ id: number; fullName: string; username: string; companyId: number; companyCode: string }[]> {
    const users = await this.ticketWorkers();
    const visible = scope.companyIds;

    return users
      .filter((u) => {
        if (scope.isSuperAdmin) return true;
        // super_admin คนอื่นรับเรื่องได้ทุกบริษัทอยู่แล้ว จึงเป็นตัวเลือกเสมอ
        if (u.superAdmin) return true;
        for (const id of u.scopedCompanyIds) if (visible.has(id)) return true;
        return false;
      })
      .map(({ id, fullName, username, homeCompanyId, homeCompanyCode }) => ({
        id,
        fullName,
        username,
        companyId: homeCompanyId,
        companyCode: homeCompanyCode,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  /**
   * จำนวนเรื่องที่ยังค้างอยู่ในมือของแต่ละคน
   *
   * ⚠️ คิวรีเดียวสำหรับทุกคนในรายการ ไม่ใช่คนละคิวรี — รายชื่อผู้รับมอบหมาย
   *    มีได้หลายสิบคน และฐานข้อมูลพัฒนาอยู่อีกทวีป (~250 ms ต่อรอบ)
   *
   * นับข้ามบริษัทโดยตั้งใจ ตัวเลขนี้ตอบคำถาม "ตอนนี้เขางานล้นไหม"
   * ซึ่งเป็นภาระจริงของคนคนนั้น ไม่ใช่ภาระเฉพาะบริษัทที่กำลังเปิดดูอยู่
   */
  async openTicketCounts(userIds: readonly number[]): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    if (userIds.length === 0) return counts;

    const rows = await this.db
      .select({ assigneeId: ticket.assigneeId, total: sql<number>`count(*)::int` })
      .from(ticket)
      .where(
        and(
          inArray(ticket.assigneeId, [...userIds]),
          inArray(ticket.status, [...OPEN_WORKLOAD_STATUSES]),
          isNull(ticket.deletedAt),
        ),
      )
      .groupBy(ticket.assigneeId);

    for (const row of rows) {
      if (row.assigneeId !== null) counts.set(row.assigneeId, row.total);
    }
    return counts;
  }

  /**
   * ผู้ที่ถือสิทธิ์ทำงานกับเรื่อง พร้อมขอบเขตบริษัทของแต่ละคน
   *
   * เงื่อนไขสองข้อพร้อมกัน
   *   1. ถือบทบาทที่ยังไม่หมดอายุซึ่งให้สิทธิ์ ticket.change_status (หรือเป็น super_admin)
   *      — อ่านจาก role_permission ไม่ผูกกับชื่อบทบาท เพราะหน้าจัดการสิทธิ์แก้ได้
   *   2. ขอบเขตบริษัท — กติกาเดียวกับ AccessScope: มีแถว user_role_scope ใช้ตามนั้น
   *      ไม่มีเลยใช้บริษัทต้นสังกัด
   */
  private async ticketWorkers(): Promise<
    {
      id: number;
      fullName: string;
      username: string;
      homeCompanyId: number;
      homeCompanyCode: string;
      superAdmin: boolean;
      scopedCompanyIds: Set<number>;
    }[]
  > {
    const now = new Date();
    const activeRole = or(isNull(userRole.expiresAt), gt(userRole.expiresAt, now));

    const workingRoleIds = this.db
      .select({ roleId: rolePermission.roleId })
      .from(rolePermission)
      .innerJoin(permission, eq(permission.id, rolePermission.permissionId))
      .where(eq(permission.code, 'ticket.change_status'));

    const candidates = await this.db
      .select({
        id: appUser.id,
        fullName: appUser.fullName,
        username: appUser.username,
        homeCompanyId: appUser.companyId,
        homeCompanyCode: company.code,
        roleCode: role.code,
      })
      .from(appUser)
      .innerJoin(company, eq(company.id, appUser.companyId))
      .innerJoin(userRole, eq(userRole.userId, appUser.id))
      .innerJoin(role, eq(role.id, userRole.roleId))
      .where(
        and(
          eq(appUser.isActive, true),
          isNull(appUser.deletedAt),
          activeRole,
          or(inArray(role.id, workingRoleIds), eq(role.code, 'super_admin')),
        ),
      );

    if (candidates.length === 0) return [];

    const ids = [...new Set(candidates.map((c) => c.id))];
    // ขอบเขตมาจากทุกบทบาทที่ยังมีผล ไม่ใช่เฉพาะบทบาทที่ทำงานกับเรื่องได้ — ตรงกับ ScopeService
    const scopeRows = await this.db
      .select({ userId: userRole.userId, companyId: userRoleScope.companyId })
      .from(userRoleScope)
      .innerJoin(userRole, eq(userRole.id, userRoleScope.userRoleId))
      .where(and(inArray(userRole.userId, ids), activeRole));

    const scopedCompanies = new Map<number, Set<number>>();
    for (const r of scopeRows) {
      const set = scopedCompanies.get(r.userId);
      if (set) set.add(r.companyId);
      else scopedCompanies.set(r.userId, new Set([r.companyId]));
    }

    const users = new Map<number, Awaited<ReturnType<TicketRepository['ticketWorkers']>>[number]>();
    for (const c of candidates) {
      const isSuper = c.roleCode === 'super_admin';
      const existing = users.get(c.id);
      if (existing) {
        existing.superAdmin ||= isSuper;
        continue;
      }
      users.set(c.id, {
        id: c.id,
        fullName: c.fullName,
        username: c.username,
        homeCompanyId: c.homeCompanyId,
        homeCompanyCode: c.homeCompanyCode,
        superAdmin: isSuper,
        scopedCompanyIds: scopedCompanies.get(c.id) ?? new Set([c.homeCompanyId]),
      });
    }

    return [...users.values()];
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
      /** null = ยังไม่เริ่มจับเวลา (คำขอที่รออนุมัติอยู่) */
      clockStartedAt: Date | null;
      responseDueAt: Date | null;
      resolutionDueAt: Date | null;
    },
    actorId: number,
    extras: {
      /** ขั้นอนุมัติที่ต้องเกิดพร้อมเรื่อง — ต้องอยู่ทรานแซกชันเดียวกัน */
      approvals?: readonly PlannedApprovalStep[];
      /** สถานะตั้งต้นก่อนถูกดันเข้าขั้นอนุมัติ — ใช้เขียนประวัติให้ครบเส้น */
      initialStatus?: string;
    } = {},
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

    const approvals = extras.approvals ?? [];
    const initialStatus = extras.initialStatus ?? props.status;
    // เลขที่เรื่องอิงเดือนที่แจ้ง — คำขอที่รออนุมัติไม่มีเวลาเริ่มนาฬิกา ใช้เวลาจริง
    const numberedAt = sla.clockStartedAt ?? new Date();

    return this.db.transaction(async (tx) => {
      const ticketNo = await this.nextTicketNo(tx, props.companyId, companyRow.code, numberedAt);

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
          supportProjectId: props.supportProjectId ?? null,
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
          // เรื่องที่เกิดมาในสถานะพักแล้ว ต้องมีจุดตั้งต้นของการพักตั้งแต่แรก
          pendingStartedAt: props.pendingStartedAt ?? null,
          slaPolicyId: sla.policyId,
          slaClockStartedAt: sla.clockStartedAt,
          responseDueAt: sla.responseDueAt,
          resolutionDueAt: sla.resolutionDueAt,
        })
        .returning({ id: ticket.id });

      const ticketId = row!.id;

      /*
       * ประวัติต้องเริ่มที่ "ใครแจ้ง" เสมอ ไม่ใช่เริ่มกลางเรื่อง
       *
       * คำขอที่ต้องอนุมัติเกิดมาพร้อมสถานะ pending_approval แล้ว ถ้าเขียนแถวเดียว
       * ไทม์ไลน์จะขึ้นต้นด้วย "รออนุมัติ" เฉย ๆ โดยไม่มีบรรทัดที่บอกว่าเรื่องถูกเปิดเมื่อไร
       * — เขียนสองแถวแทน ให้เห็นทั้งการเปิดเรื่องและการเข้าคิวอนุมัติ
       */
      await tx.insert(ticketStatusHistory).values({
        ticketId,
        fromStatus: null,
        toStatus: initialStatus,
        changedBy: actorId,
      });

      if (props.status !== initialStatus) {
        await tx.insert(ticketStatusHistory).values({
          ticketId,
          fromStatus: initialStatus,
          toStatus: props.status,
          changedBy: actorId,
          reason: `ລໍຖ້າອະນຸມັດ ${approvals.length} ຂັ້ນ`,
        });
      }

      if (approvals.length > 0) {
        await tx.insert(approvalRequest).values(
          approvals.map((step) => ({
            ticketId,
            seq: step.seq,
            approverType: step.approverType,
            approverId: step.approverId,
            status: 'pending' as const,
          })),
        );
      }

      return ticketId;
    });
  }

  /**
   * บันทึกการเปลี่ยนสถานะ ในทรานแซกชันเดียวกับประวัติ ข้อความถึงผู้แจ้ง และ audit
   *
   * ⚠️ audit_log เขียนที่นี่ ไม่ใช่ที่ service — ถ้าแยกไปเขียนหลัง commit
   *    การเปลี่ยนสถานะที่สำเร็จแต่เขียน audit ล้มจะไม่มีร่องรอยเลย
   *    ซึ่งเป็นสิ่งที่การตรวจ ISO 20000 ข้อ 7.5 ถามหาเป็นอย่างแรก
   */
  async saveStatusChange(entity: TicketEntity, change: StatusChangeRecord): Promise<void> {
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
          updatedAt: change.at,
          ...(change.resolutionDueAt ? { resolutionDueAt: change.resolutionDueAt } : {}),
          ...(change.resolutionNote !== undefined ? { resolutionNote: change.resolutionNote } : {}),
          ...(change.satisfactionScore !== undefined
            ? { satisfactionScore: change.satisfactionScore, csatRespondedAt: change.at }
            : {}),
          /*
           * เวลาที่ผู้แจ้งได้รับคำถามความพึงพอใจครั้งแรก = เรื่องแก้เสร็จ/ปิด (ครั้งแรกเท่านั้น)
           * ตัวหารของ Response Rate ใน KPI-4 — ก่อนหน้านี้ไม่มีใครเขียนค่านี้เลย รายงานจึงว่างตลอด
           */
          ...(['resolved', 'fulfilled', 'closed'].includes(change.to)
            ? { csatSentAt: sql`coalesce(${ticket.csatSentAt}, ${change.at.toISOString()}::timestamptz)` }
            : {}),
          // บวกในฐานข้อมูล ไม่ใช่อ่านมาบวกแล้วเขียนกลับ — สองคนเปิดคืนพร้อมกันต้องได้ +2
          ...(change.reopened ? { reopenCount: sql`${ticket.reopenCount} + 1` } : {}),
          ...(change.selfAssigned ? { assigneeId: change.actorId } : {}),
        })
        .where(eq(ticket.id, id));

      await tx.insert(ticketStatusHistory).values({
        ticketId: id,
        fromStatus: change.from,
        toStatus: change.to,
        changedBy: change.actorId,
        changedAt: change.at,
        // คอลัมน์ชื่อ reason ไม่ใช่ note — บังคับกรอกกรณีพัก ยกเลิก และเปิดใหม่
        ...(change.reason ? { reason: change.reason.slice(0, HISTORY_REASON_MAX) } : {}),
        ...(change.selfAssigned ? { fromAssigneeId: null, toAssigneeId: change.actorId } : {}),
      });

      if (change.publicComment) {
        await TicketRepository.insertPublicComment(tx, id, change.actorId, change.publicComment, change.at);
      }

      await tx.insert(auditLog).values({
        actorId: change.actorId,
        companyId: props.companyId,
        action: 'ticket.status_changed',
        entityType: 'ticket',
        entityId: id,
        oldValue: { status: change.from },
        newValue: { status: change.to, ...(change.auditDetail ?? {}) },
      });
    });
  }

  /**
   * บันทึกการมอบหมาย ในทรานแซกชันเดียวกับประวัติ ข้อความถึงผู้แจ้ง และ audit
   *
   * assignee_change_count นับเฉพาะการเปลี่ยนมือ ไม่นับการรับครั้งแรก
   * เพราะเป็นตัวตั้งของ KPI-3 (FCR) — เรื่องที่มีคนรับครั้งเดียวแล้วแก้จบ
   * ต้องนับเป็นแก้ได้ในครั้งแรก ไม่ใช่ถูกหักเพราะมีการมอบหมายหนึ่งครั้ง
   */
  async saveAssignment(change: AssignmentRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(ticket)
        .set({
          assigneeId: change.toAssigneeId,
          status: change.toStatus,
          updatedAt: change.at,
          ...(change.fromAssigneeId !== null
            ? { assigneeChangeCount: sql`${ticket.assigneeChangeCount} + 1` }
            : {}),
        })
        .where(eq(ticket.id, change.ticketId));

      await tx.insert(ticketStatusHistory).values({
        ticketId: change.ticketId,
        fromStatus: change.fromStatus,
        toStatus: change.toStatus,
        fromAssigneeId: change.fromAssigneeId,
        toAssigneeId: change.toAssigneeId,
        changedBy: change.actorId,
        changedAt: change.at,
        ...(change.reason ? { reason: change.reason.slice(0, HISTORY_REASON_MAX) } : {}),
      });

      if (change.publicComment) {
        await TicketRepository.insertPublicComment(
          tx,
          change.ticketId,
          change.actorId,
          change.publicComment,
          change.at,
        );
      }

      await tx.insert(auditLog).values({
        actorId: change.actorId,
        companyId: change.companyId,
        action: 'ticket.assigned',
        entityType: 'ticket',
        entityId: change.ticketId,
        oldValue: { assignee_id: change.fromAssigneeId, status: change.fromStatus },
        newValue: {
          assignee_id: change.toAssigneeId,
          status: change.toStatus,
          ...(change.reason ? { reason: change.reason } : {}),
        },
      });
    });
  }

  /**
   * เริ่มจับเวลา fulfillment ให้คำขอที่เพิ่งอนุมัติครบ
   *
   * ข้อกำหนดจาก SA: "SLA fulfillment เริ่มนับหลังอนุมัติ ไม่ใช่ตอนเปิดเรื่อง —
   * ป้องกันไอทีโดนนับเวลาทั้งที่ยังรอหัวหน้าอนุมัติ"
   *
   * ⚠️ ต้องเขียน pending_duration_minutes = 0 ทับด้วย
   *    ช่วงที่ค้างรออนุมัติถูกสะสมไว้ในคอลัมน์นั้นตอนออกจาก pending_approval
   *    แต่พอเราตั้งจุดเริ่มนาฬิกาใหม่เป็น "ตอนนี้" เวลาที่หยุดไปก่อนหน้านั้น
   *    ถูกตัดออกจากสมการไปแล้วโดยปริยาย ถ้าไม่ล้าง กำหนดแก้เสร็จจะถูกเลื่อนออก
   *    สองเท่าของเวลาที่รออนุมัติจริง แล้วคำขอทุกใบจะดู "ทัน SLA" เกินจริง
   *
   * ⚠️ WHERE มีเงื่อนไข sla_clock_started_at IS NULL กันการเริ่มนาฬิกาซ้ำ
   *    ถ้าผู้อนุมัติสองคนกดพร้อมกัน คนที่สองต้องไม่เลื่อนกำหนดออกไปอีกรอบ
   */
  async startFulfillmentClock(input: {
    ticketId: number;
    clockStartedAt: Date;
    responseDueAt: Date | null;
    resolutionDueAt: Date | null;
  }): Promise<boolean> {
    const rows = await this.db
      .update(ticket)
      .set({
        slaClockStartedAt: input.clockStartedAt,
        resolutionDueAt: input.resolutionDueAt,
        pendingDurationMinutes: 0,
        ...(input.responseDueAt ? { responseDueAt: input.responseDueAt } : {}),
        updatedAt: input.clockStartedAt,
      })
      .where(and(eq(ticket.id, input.ticketId), isNull(ticket.slaClockStartedAt)))
      .returning({ id: ticket.id });

    return rows.length > 0;
  }

  /**
   * ผูกเรื่องสองใบเข้าด้วยกัน (POST /tickets/{id}/link)
   *
   * ⚠️ ผูกสองทางโดยตั้งใจ
   *    ถ้าเขียนทางเดียว หน้าของเรื่องปลายทางจะไม่รู้เลยว่ามีใครอ้างถึงมันอยู่
   *    แล้วเจ้าหน้าที่ที่เปิดใบนั้นจะมองไม่เห็นบริบทครึ่งหนึ่งของเรื่อง
   *    ซึ่งเป็นเหตุผลทั้งหมดที่ต้องมีการผูก
   *
   * เฟส 1 ผูกได้ใบเดียวต่อเรื่อง การผูกใหม่จึงทับของเดิมเงียบ ๆ
   * (ผู้เรียกเป็นผู้เตือนผู้ใช้ว่าจะทับ — repository ไม่ตัดสินเรื่อง UX)
   */
  async linkTickets(input: {
    ticketId: number;
    relatedTicketId: number;
    actorId: number;
    companyId: number;
    at: Date;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(ticket)
        .set({ relatedTicketId: input.relatedTicketId, updatedAt: input.at })
        .where(eq(ticket.id, input.ticketId));

      await tx
        .update(ticket)
        .set({ relatedTicketId: input.ticketId, updatedAt: input.at })
        .where(eq(ticket.id, input.relatedTicketId));

      await tx.insert(auditLog).values({
        actorId: input.actorId,
        companyId: input.companyId,
        action: 'ticket.linked',
        entityType: 'ticket',
        entityId: input.ticketId,
        oldValue: {},
        newValue: { related_ticket_id: input.relatedTicketId },
      });
    });
  }

  /**
   * ปิดเรื่องอัตโนมัติเมื่อผู้แจ้งไม่ยืนยันครบกำหนด (งานกวาด SLA เป็นผู้เรียก)
   *
   * ⚠️ ต้องผ่าน TicketEntity ไม่ใช่ UPDATE ตรง
   *    docstring ของ entity ยกกรณีนี้มาเป็นตัวอย่างตั้งแต่บรรทัดแรก — กฎอย่าง
   *    "ปิดเรื่องที่ยังไม่ได้แก้ไม่ได้" ต้องเป็นจริงไม่ว่าคำสั่งจะมาจาก REST
   *    หรือจากงานเบื้องหลัง ถ้าเขียน UPDATE เอง งานกลางคืนจะเป็นทางเดียว
   *    ในระบบที่ข้ามตารางสถานะไปได้เงียบ ๆ
   *
   * ⚠️ ไม่มี AccessScope และไม่ต้องมี
   *    นี่ไม่ใช่การกระทำของผู้ใช้คนใดคนหนึ่ง จึงไม่มีขอบเขตสิทธิ์ให้ตรวจ —
   *    ผู้เรียกคือ scheduler ที่เลือกแถวมาเองจากเงื่อนไขเวลา ไม่ได้รับ id
   *    มาจากเบราว์เซอร์ จึงไม่มีทางถูกหลอกให้แตะเรื่องนอกขอบเขต
   *
   * @returns false เมื่อเรื่องขยับไปแล้วระหว่างที่งานกวาดกำลังทำงาน
   *          (ผู้แจ้งเพิ่งกดยืนยันเอง หรือเพิ่งเปิดคืน) — ไม่ใช่ข้อผิดพลาด
   */
  async autoClose(input: { ticketId: number; at: Date; reason: string }): Promise<boolean> {
    const [row] = await this.db
      .select({
        id: ticket.id,
        companyId: ticket.companyId,
        categoryId: ticket.categoryId,
        requesterId: ticket.requesterId,
        subject: ticket.subject,
        ticketType: ticket.ticketType,
        impact: ticket.impact,
        urgency: ticket.urgency,
        status: ticket.status,
        priority: ticket.priority,
        resolvedAt: ticket.resolvedAt,
        closedAt: ticket.closedAt,
        pendingReason: ticket.pendingReason,
        pendingStartedAt: ticket.pendingStartedAt,
        pendingDurationMinutes: ticket.pendingDurationMinutes,
        assigneeId: ticket.assigneeId,
      })
      .from(ticket)
      .where(and(eq(ticket.id, input.ticketId), isNull(ticket.deletedAt)))
      .limit(1);

    if (!row) return false;

    const entity = TicketEntity.rehydrate({
      id: row.id,
      companyId: row.companyId,
      categoryId: row.categoryId,
      requesterId: row.requesterId,
      createdBy: row.requesterId,
      subject: row.subject,
      description: '',
      impact: row.impact as Impact,
      urgency: row.urgency as Urgency,
      // ต้องส่งเข้าไป มิฉะนั้น entity จะใช้ตารางสถานะของ incident กับคำขอบริการด้วย
      // แล้ว fulfilled → closed จะถูกปฏิเสธทั้งที่เป็นเส้นที่ถูกต้อง
      ticketType: row.ticketType as TicketType,
      status: row.status as TicketStatus,
      priority: row.priority as Priority,
      resolvedAt: row.resolvedAt,
      closedAt: row.closedAt,
      pendingReason: row.pendingReason,
      pendingStartedAt: row.pendingStartedAt,
      pendingDurationMinutes: row.pendingDurationMinutes,
      assigneeId: row.assigneeId,
    });

    try {
      // ไม่ส่ง actorId — closed_by ต้องเป็น NULL เพื่อให้รายงานแยกออกว่า
      // ใบไหนผู้แจ้งยืนยันเอง และใบไหนหมดเวลาไปเฉย ๆ (ดู schema ของ closed_by)
      entity.changeStatus('closed', input.at, {});
    } catch {
      // สถานะขยับไปแล้วระหว่างรอบกวาด — ไม่ใช่ข้อผิดพลาด ข้ามไปใบถัดไป
      return false;
    }

    await this.saveStatusChange(entity, {
      from: row.status,
      to: 'closed',
      // ระบบเป็นผู้กระทำ — ทั้งประวัติและ audit รับ null ได้ทั้งคู่
      actorId: null,
      at: input.at,
      reason: input.reason,
      auditDetail: { auto_closed: true, reason: input.reason },
    });

    return true;
  }

  /**
   * เก็บคะแนนให้เรื่องที่ปิดไปแล้ว (ปิดอัตโนมัติ หรือเจ้าหน้าที่ปิด) — ไม่เปลี่ยนสถานะ
   *
   * เงื่อนไขอยู่ใน WHERE ไม่ใช่อ่านมาเช็คก่อน — กดสองแท็บพร้อมกันต้องได้คะแนนเดียว
   * @returns false เมื่อมีคะแนนอยู่แล้ว หรือเรื่องไม่ได้อยู่ในสถานะปิด
   */
  async recordSatisfaction(input: {
    ticketId: number;
    companyId: number;
    actorId: number;
    score: number;
    at: Date;
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(ticket)
        .set({
          satisfactionScore: input.score,
          csatRespondedAt: input.at,
          csatSentAt: sql`coalesce(${ticket.csatSentAt}, ${ticket.closedAt})`,
          updatedAt: input.at,
        })
        .where(
          and(
            eq(ticket.id, input.ticketId),
            eq(ticket.status, 'closed'),
            isNull(ticket.satisfactionScore),
            isNull(ticket.deletedAt),
          ),
        )
        .returning({ id: ticket.id });
      if (updated.length === 0) return false;

      await tx.insert(auditLog).values({
        actorId: input.actorId,
        companyId: input.companyId,
        action: 'ticket.rated',
        entityType: 'ticket',
        entityId: input.ticketId,
        oldValue: { satisfaction_score: null },
        newValue: { satisfaction_score: input.score, via: 'chat' },
      });
      return true;
    });
  }

  /** ข้อมูลย่อของเรื่องที่ผูกไว้ — พอสำหรับชิปบนหน้าจอ ไม่ต้องอ่านทั้งใบ */
  async relatedSummary(
    id: number,
  ): Promise<{
    id: number;
    ticketNo: string;
    subject: string;
    status: string;
    ticketType: string;
  } | null> {
    const [row] = await this.db
      .select({
        id: ticket.id,
        ticketNo: ticket.ticketNo,
        subject: ticket.subject,
        status: ticket.status,
        ticketType: ticket.ticketType,
      })
      .from(ticket)
      .where(and(eq(ticket.id, id), isNull(ticket.deletedAt)))
      .limit(1);

    return row ?? null;
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

  /**
   * เขียนข้อความสาธารณะถึงผู้แจ้งภายในทรานแซกชันของคำสั่ง
   *
   * เวลาตอบรับครั้งแรกเขียนด้วยเงื่อนไข IS NULL ใน WHERE ของ UPDATE เอง
   * กติกาเดียวกับ TicketWriteRepository.addComment — เจ้าหน้าที่สองคนตอบพร้อมกัน
   * ต้องได้เวลาของคนแรก ไม่ใช่คนที่เขียนทีหลังทับ
   */
  private static async insertPublicComment(
    tx: DbTransaction,
    ticketId: number,
    /** null = ระบบเป็นผู้เขียน — คอมเมนต์จะถูกตั้งธง is_system ให้เอง */
    authorId: number | null,
    comment: PublicCommentRecord,
    at: Date,
  ): Promise<void> {
    await tx.insert(ticketComment).values({
      ticketId,
      authorId,
      body: comment.body,
      isInternal: false,
      // ไม่มีผู้เขียน = ข้อความของระบบ ต้องตั้งธงให้ตรงกัน มิฉะนั้นหน้าจอจะ
      // แสดงเป็นคอมเมนต์ของคนที่ไม่มีชื่อ ซึ่งอ่านแล้วเหมือนข้อมูลเสีย
      isSystem: authorId === null,
    });

    if (comment.countsAsFirstResponse) {
      await tx
        .update(ticket)
        .set({ firstResponseAt: at })
        .where(and(eq(ticket.id, ticketId), isNull(ticket.firstResponseAt)));
    }
  }
}
