import { Inject, Injectable, Logger } from '@nestjs/common';
import { alias } from 'drizzle-orm/pg-core';
import { and, asc, count, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import { ChangeTicketStatusUseCase } from '../../application/use-cases/change-ticket-status.use-case';
import type { Priority, TicketStatus } from '../../common/constants';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { paged, type PagedResult } from '../../common/http/pagination';
import { AccessScope } from '../../common/scope';
import { computeDueAt, nextWorkingInstant } from '../../common/sla/business-time';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import { ServiceCatalogRepository } from '../../db/repositories/service-catalog.repository';
import { SlaConfigRepository } from '../../db/repositories/sla-config.repository';
import { TicketRepository } from '../../db/repositories/ticket.repository';
import { appUser, approvalRequest, company, ticket } from '../../db/schema';
import { TicketsService } from '../tickets/tickets.service';

export interface ApprovalListParams {
  /** 'me' = เฉพาะที่ฉันเป็นผู้อนุมัติ · ไม่ระบุ = ทุกใบในขอบเขต (ต้องมี approval.read) */
  assignee?: string | undefined;
  status?: string | undefined;
  page: number;
  page_size: number;
}

/**
 * คำขออนุมัติ (SOP-03, SOP-06)
 *
 * ⚠️ สิทธิ์ "อนุมัติได้" ไม่ได้มาจากบทบาท แต่มาจากการเป็น approver ของใบนั้น
 *    จึงไม่มี permission ชื่อ approval.decide ผูกกับบทบาทใดเลยโดยตั้งใจ
 *    (ดูหมายเหตุที่ MasterDataController.roles)
 *    การเปลี่ยนไปเช็คด้วยบทบาทจะทำให้ทุกคนในบทบาทนั้นอนุมัติคำขอของใครก็ได้
 *
 * ⚠️ ขั้นที่ n+1 ยังไม่ควรปรากฏในคิวของใครจนกว่าขั้น n จะอนุมัติผ่าน
 *    ไม่งั้นผู้อนุมัติขั้นสูงจะเห็นและกดอนุมัติข้ามขั้นได้
 */
@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger('Approvals');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly changeStatus: ChangeTicketStatusUseCase,
    private readonly tickets: TicketRepository,
    private readonly slaConfig: SlaConfigRepository,
    private readonly catalog: ServiceCatalogRepository,
    /*
     * ใช้ TicketsService ยิงสัญญาณด้วยเส้นทางเดียวกับ POST /tickets/{id}/status
     *
     * ไม่เกิดวงจรการฉีด เพราะ TicketsService ไม่ได้อ้างกลับมาที่นี่ —
     * ข้อมูลการอนุมัติที่หน้ารายละเอียดแสดง อ่านผ่าน TicketDetailRepository
     * ไม่ได้อ่านผ่าน service ตัวนี้
     */
    private readonly ticketsService: TicketsService,
  ) {}

  private scopeWhere(scope: AccessScope): SQL | undefined {
    if (scope.isSuperAdmin) return undefined;
    const ids = [...scope.companyIds];
    if (ids.length === 0) return sql`false` as SQL;
    return inArray(ticket.companyId, ids) as SQL;
  }

  async list(scope: AccessScope, params: ApprovalListParams): Promise<PagedResult<unknown>> {
    const requester = alias(appUser, 'requester');
    const approver = alias(appUser, 'approver');

    const parts: SQL[] = [isNull(ticket.deletedAt) as SQL];
    const scoped = this.scopeWhere(scope);
    if (scoped) parts.push(scoped);

    if (params.assignee === 'me') {
      parts.push(eq(approvalRequest.approverId, scope.userId) as SQL);

      /*
       * ในคิวของฉันต้องเห็นเฉพาะขั้นที่ถึงคิวจริง
       * ขั้นก่อนหน้าทุกขั้นต้องเป็น approved แล้ว มิฉะนั้นการกดอนุมัติ
       * จะเป็นการข้ามขั้น ซึ่ง SOP-03 ห้ามไว้
       */
      parts.push(
        sql`NOT EXISTS (
          SELECT 1 FROM approval_request prev
          WHERE prev.ticket_id = ${approvalRequest.ticketId}
            AND prev.seq < ${approvalRequest.seq}
            AND prev.status <> 'approved'
        )` as SQL,
      );
    }

    if (params.status) {
      parts.push(eq(approvalRequest.status, params.status) as SQL);
    }

    const where = and(...parts) as SQL;
    const offset = (params.page - 1) * params.page_size;

    const baseQuery = () =>
      this.db
        .select({
          id: approvalRequest.id,
          ticket_id: approvalRequest.ticketId,
          ticket_no: ticket.ticketNo,
          subject: ticket.subject,
          priority: ticket.priority,
          company_code: company.code,
          seq: approvalRequest.seq,
          approver_type: approvalRequest.approverType,
          approver_id: approvalRequest.approverId,
          approver_name: approver.fullName,
          requester_name: requester.fullName,
          status: approvalRequest.status,
          comment: approvalRequest.comment,
          requested_at: approvalRequest.requestedAt,
          due_at: approvalRequest.dueAt,
          decided_at: approvalRequest.decidedAt,
          access_expires_at: approvalRequest.accessExpiresAt,
        })
        .from(approvalRequest)
        .innerJoin(ticket, eq(ticket.id, approvalRequest.ticketId))
        .innerJoin(company, eq(company.id, ticket.companyId))
        .innerJoin(requester, eq(requester.id, ticket.requesterId))
        // approver_id เป็น NULL ได้ตอนที่ระบบยังหาผู้อนุมัติไม่ได้ จึงต้อง leftJoin
        .leftJoin(approver, eq(approver.id, approvalRequest.approverId));

    const [rows, totalRow] = await Promise.all([
      baseQuery()
        // ค้างนานสุดอยู่บนสุด — คิวอนุมัติเป็นคอขวดที่ทำให้นาฬิกา SLA หยุดเดิน
        // ใบที่ค้างนานคือใบที่ทำให้ผู้แจ้งรอโดยไม่มีใครรับผิดชอบ
        .where(where)
        .orderBy(asc(approvalRequest.requestedAt))
        .limit(params.page_size)
        .offset(offset),
      this.db
        .select({ n: count() })
        .from(approvalRequest)
        .innerJoin(ticket, eq(ticket.id, approvalRequest.ticketId))
        .where(where),
    ]);

    const now = Date.now();
    return paged(
      rows.map((r) => ({
        ...r,
        requested_at: r.requested_at.toISOString(),
        due_at: r.due_at?.toISOString() ?? null,
        decided_at: r.decided_at?.toISOString() ?? null,
        access_expires_at: r.access_expires_at?.toISOString() ?? null,
        // คำนวณที่นี่ไม่ใช่ให้หน้าจอทำ — หน้าจอต่างเครื่องกันมีนาฬิกาไม่ตรงกัน
        is_overdue:
          r.status === 'pending' && r.due_at !== null && r.due_at.getTime() < now,
      })),
      params.page,
      params.page_size,
      totalRow[0]?.n ?? 0,
    );
  }

  /**
   * บันทึกผลการพิจารณาหนึ่งขั้น (POST /approvals/{id}/decide)
   *
   * กฎที่บังคับตาม docs/03-api-spec.md §2.7 และ SOP-03
   *   1. เฉพาะผู้ที่ถูกระบุเป็น approver ของแถวนั้นเท่านั้น
   *      ไม่ใช่ทุกคนที่มีสิทธิ์ approval.* — สิทธิ์อนุมัติมาจากการถูกมอบหมาย
   *      ให้พิจารณาใบนั้นโดยตรง จึงไม่มี permission ตัวไหนให้ข้ามข้อนี้ได้
   *   2. ห้ามอนุมัติคำขอของตนเอง แม้จะถูกตั้งเป็น approver ก็ตาม (422)
   *   3. ปฏิเสธต้องมีเหตุผล — บังคับที่ฐานข้อมูลด้วย
   *   4. ขั้นก่อนหน้าต้องอนุมัติครบก่อน มิฉะนั้นเป็นการอนุมัติข้ามขั้น
   *   5. ปฏิเสธขั้นใดขั้นหนึ่ง → ticket ไป **rejected** ทันที (ไม่ใช่ cancelled)
   *   6. อนุมัติครบทุกขั้น → ticket ไป assigned **และนาฬิกา fulfillment เริ่มนับที่นี่**
   *
   * ⚠️ การเปลี่ยนสถานะ ticket มอบให้ ChangeTicketStatusUseCase ทำ ไม่เขียนเอง
   *    เพราะการออกจากสถานะพักต้องบวกเวลาที่หยุดนาฬิกาคืนเข้ากำหนดเวลา
   *    ถ้าเขียน UPDATE ตรงนี้เอง เวลาที่ใช้รออนุมัติจะถูกนับเป็นความล่าช้า
   *    ของทีมไอที ซึ่งขัดกับ SLA ข้อ 9
   *
   * ⚠️ และต้องยิงสัญญาณผ่าน TicketsService.afterStatusChange ทุกครั้งที่สถานะขยับ
   *    การเขียนฐานข้อมูลสำเร็จโดยไม่บอกใครเลย คือบั๊กที่ไม่มีเทสต์ไหนจับได้
   *    เพราะข้อมูลถูกต้องครบทุกตาราง — สิ่งที่หายไปคือคนที่ควรได้รู้
   */
  async decide(
    scope: AccessScope,
    id: number,
    input: { decision: 'approved' | 'rejected'; comment?: string; access_expires_at?: string },
  ) {
    const [row] = await this.db
      .select({
        id: approvalRequest.id,
        ticket_id: approvalRequest.ticketId,
        seq: approvalRequest.seq,
        approver_id: approvalRequest.approverId,
        status: approvalRequest.status,
        requester_id: ticket.requesterId,
        ticket_status: ticket.status,
        company_id: ticket.companyId,
      })
      .from(approvalRequest)
      .innerJoin(ticket, eq(ticket.id, approvalRequest.ticketId))
      .where(and(eq(approvalRequest.id, id), isNull(ticket.deletedAt)))
      .limit(1);

    // 404 ไม่ใช่ 403 สำหรับใบที่ไม่ใช่ของผู้เรียก — กฎเดียวกับ ticket
    if (!row || row.approver_id !== scope.userId) {
      throw new NotFoundError('APPROVAL_NOT_FOUND', 'ບໍ່ພົບຄຳຂໍອະນຸມັດທີ່ລະບຸ', { id });
    }

    if (row.status !== 'pending') {
      throw new ConflictError(
        'APPROVAL_ALREADY_DECIDED',
        'ຄຳຂໍນີ້ຖືກພິຈາລະນາໄປແລ້ວ',
        { status: row.status },
      );
    }

    /*
     * ห้ามอนุมัติคำขอของตนเอง
     *
     * เกิดได้จริงเมื่อหัวหน้าสายงานยื่นคำขอเอง แล้วระบบหาผู้อนุมัติ
     * ตามสายงานได้เป็นตัวเขาเอง — ต้องบล็อกที่นี่ ไม่ใช่หวังว่า
     * การตั้งค่าผู้อนุมัติจะไม่มีวันชี้กลับมาที่ผู้ขอ
     */
    if (row.requester_id === scope.userId) {
      throw new ValidationError(
        'SELF_APPROVAL_FORBIDDEN',
        'ບໍ່ສາມາດອະນຸມັດຄຳຂໍຂອງຕົນເອງໄດ້ ກະລຸນາໃຫ້ຜູ້ດູແລບໍລິສັດມອບໝາຍຜູ້ອະນຸມັດຄົນອື່ນ',
      );
    }

    const comment = input.comment?.trim() || null;
    if (input.decision === 'rejected' && !comment) {
      throw new ValidationError('COMMENT_REQUIRED', 'ການປະຕິເສດຕ້ອງລະບຸເຫດຜົນ', [
        { field: 'comment', message: 'ຕ້ອງລະບຸເຫດຜົນເມື່ອປະຕິເສດ' },
      ]);
    }

    // ขั้นก่อนหน้าต้องอนุมัติครบก่อน
    const [blocking] = await this.db
      .select({ seq: approvalRequest.seq })
      .from(approvalRequest)
      .where(
        and(
          eq(approvalRequest.ticketId, row.ticket_id),
          sql`${approvalRequest.seq} < ${row.seq}`,
          sql`${approvalRequest.status} <> 'approved'`,
        ) as SQL,
      )
      .limit(1);

    if (blocking) {
      throw new ConflictError(
        'APPROVAL_OUT_OF_ORDER',
        'ຍັງພິຈາລະນາຂັ້ນກ່ອນໜ້າບໍ່ແລ້ວ',
        { blocking_seq: blocking.seq },
      );
    }

    const now = new Date();
    const expires = input.access_expires_at ? new Date(input.access_expires_at) : null;

    await this.db
      .update(approvalRequest)
      .set({
        status: input.decision,
        decidedBy: scope.userId,
        decidedAt: now,
        comment,
        ...(expires && !Number.isNaN(expires.getTime()) ? { accessExpiresAt: expires } : {}),
      })
      .where(eq(approvalRequest.id, id));

    /*
     * ผลต่อ ticket
     *
     * ใช้ขอบเขตของระบบ ไม่ใช่ของผู้อนุมัติ — ผู้อนุมัติส่วนใหญ่เป็นหัวหน้า
     * สายงานที่ไม่มีสิทธิ์ ticket.change_status และไม่ควรมีด้วย
     * การเปลี่ยนสถานะรอบนี้เป็นผลของ "การอนุมัติ" ไม่ใช่การกระทำของคนคนนั้น
     */
    const systemScope = new AccessScope({
      userId: scope.userId,
      homeCompanyId: row.company_id,
      companyIds: [row.company_id],
      // ticket.cancel ด้วย เพราะการปฏิเสธยกเลิกเรื่อง — กฎยกเลิกของเจ้าหน้าที่ต้องมีทั้งสองสิทธิ์
      permissions: ['ticket.change_status', 'ticket.cancel'],
      isSuperAdmin: false,
    });

    if (input.decision === 'rejected') {
      /*
       * ปฏิเสธ → สถานะ rejected ไม่ใช่ cancelled อีกต่อไป
       *
       * สองคำนี้ต่างกันที่ "ใครเป็นคนหยุดเรื่อง" ซึ่งเป็นคำถามแรกที่ผู้ตรวจถาม
       *   cancelled = ผู้แจ้งถอนเอง หรือเจ้าหน้าที่ยกเลิกเพราะไม่ใช่เรื่อง
       *   rejected  = มีผู้มีอำนาจพิจารณาแล้วไม่อนุมัติ พร้อมเหตุผลเป็นลายลักษณ์อักษร
       * เดิมทั้งสองกรณีลงเอยเป็น cancelled เหมือนกัน รายงาน "คำขอที่ไม่ผ่าน
       * การอนุมัติ" จึงแยกออกจาก "คำขอที่ผู้แจ้งถอนเอง" ไม่ได้เลย
       */
      const transition = await this.changeStatus.execute(systemScope, row.ticket_id, {
        toStatus: 'rejected',
        reason: `ຄຳຂໍຖືກປະຕິເສດຂັ້ນທີ ${row.seq}: ${comment}`,
      });
      await this.announce(scope, row.ticket_id, transition, comment);
      return { id, status: 'rejected' as const, ticket_status: 'rejected', next_seq: null };
    }

    // ยังมีขั้นถัดไปที่รอพิจารณาหรือไม่
    const [next] = await this.db
      .select({ seq: approvalRequest.seq })
      .from(approvalRequest)
      .where(
        and(
          eq(approvalRequest.ticketId, row.ticket_id),
          sql`${approvalRequest.seq} > ${row.seq}`,
          eq(approvalRequest.status, 'pending'),
        ) as SQL,
      )
      .orderBy(asc(approvalRequest.seq))
      .limit(1);

    if (next) {
      // ยังไม่ครบสาย — ticket ค้างที่ pending_approval ต่อไป นาฬิกายังหยุดอยู่
      return {
        id,
        status: 'approved' as const,
        ticket_status: row.ticket_status,
        next_seq: next.seq,
      };
    }

    /*
     * อนุมัติครบทุกขั้นแล้ว — ปลดเรื่องออกจากสถานะพัก
     *
     * กลับไปที่ assigned เสมอ ไม่ใช่ in_progress เพราะการอนุมัติผ่าน
     * ไม่ได้แปลว่ามีคนเริ่มลงมือทำแล้ว การตั้งเป็น in_progress เองจะทำให้
     * ตัวเลข "เรื่องที่กำลังดำเนินการ" สูงกว่าความจริง
     */
    if (row.ticket_status !== 'pending_approval') {
      // เรื่องไม่ได้อยู่ในคิวอนุมัติแล้ว (ถูกยกเลิกไปก่อน หรือข้อมูลเก่าจากรุ่นก่อนหน้า)
      // — บันทึกผลการพิจารณาไว้ แต่ไม่ไปดันสถานะที่ตารางไม่อนุญาต
      return { id, status: 'approved' as const, ticket_status: row.ticket_status, next_seq: null };
    }

    const transition = await this.changeStatus.execute(systemScope, row.ticket_id, {
      toStatus: 'assigned',
      reason: `ອະນຸມັດຄົບທຸກຂັ້ນແລ້ວ (${row.seq} ຂັ້ນ)`,
    });

    await this.startFulfillmentClock(row.ticket_id, row.company_id, now);
    await this.announce(scope, row.ticket_id, transition);

    return { id, status: 'approved' as const, ticket_status: 'assigned', next_seq: null };
  }

  /**
   * เริ่มจับเวลา fulfillment ตั้งแต่วินาทีที่อนุมัติครบ
   *
   * ข้อกำหนดจาก SA: *"SLA fulfillment เริ่มนับหลังอนุมัติ ไม่ใช่ตอนเปิดเรื่อง —
   * ป้องกันไอทีโดนนับเวลาทั้งที่ยังรอหัวหน้าอนุมัติ"*
   *
   * เป้าหมายเวลาเอามาจากรายการใน catalog ก่อน (SLA 5.3 — "รีเซ็ตรหัสผ่าน 30 นาที"
   * ไม่ใช่ 2,700 นาทีของ P4) ถ้ารายการไม่ได้กำหนดไว้จึงถอยไปใช้ตารางมาตรฐาน
   *
   * ⚠️ ล้มเหลวแล้วไม่โยนต่อ
   *    การอนุมัติถูกบันทึกและสถานะถูกเปลี่ยนไปแล้วก่อนถึงบรรทัดนี้ ถ้าปล่อยให้
   *    error ทะลุออกไป ผู้อนุมัติจะเห็นว่า "กดไม่สำเร็จ" แล้วกดซ้ำ ซึ่งจะได้
   *    APPROVAL_ALREADY_DECIDED ทั้งที่ทุกอย่างสำเร็จไปแล้ว — เขียน log ไว้
   *    ให้ผู้ดูแลตามแก้กำหนดเวลาแทน ซึ่งแก้ย้อนหลังได้ ต่างจากความสับสนของผู้ใช้
   */
  private async startFulfillmentClock(
    ticketId: number,
    companyId: number,
    at: Date,
  ): Promise<void> {
    try {
      const [detail] = await this.db
        .select({
          priority: ticket.priority,
          catalogItemId: ticket.catalogItemId,
          clockStartedAt: ticket.slaClockStartedAt,
        })
        .from(ticket)
        .where(eq(ticket.id, ticketId))
        .limit(1);

      // นาฬิกาเริ่มไปแล้ว = รายการนี้ตั้ง clock_start_event = on_create ไว้
      // เจ้าของนโยบายตั้งใจให้จับเวลาตั้งแต่ยื่น ไม่ใช่หน้าที่เราไปเลื่อนให้
      if (!detail || detail.clockStartedAt !== null) return;

      const [target, cal, item] = await Promise.all([
        this.slaConfig.targetFor(companyId, detail.priority as Priority),
        this.slaConfig.calendarFor(companyId),
        detail.catalogItemId !== null
          ? this.catalog.byId(detail.catalogItemId)
          : Promise.resolve(null),
      ]);

      const resolutionMinutes =
        item?.targetMode === 'duration' && item.targetMinutes !== null
          ? item.targetMinutes
          : target.resolutionMinutes;

      // นอกเวลาทำการต้องเลื่อนไปเริ่มที่เวลาเปิดถัดไป — กติกาเดียวกับตอนสร้างเรื่อง
      const clockStartedAt =
        target.clockMode === 'calendar_24x7' ? at : nextWorkingInstant(at, cal);

      const { responseDueAt, resolutionDueAt } = computeDueAt({
        clockStart: clockStartedAt,
        responseMinutes: target.responseMinutes,
        resolutionMinutes,
        cal,
        mode: target.clockMode,
      });

      await this.tickets.startFulfillmentClock({
        ticketId,
        clockStartedAt,
        responseDueAt,
        resolutionDueAt,
      });
    } catch (error) {
      this.logger.error(
        `เริ่มนาฬิกา fulfillment ของเรื่อง #${ticketId} ไม่สำเร็จ: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * ยิงสัญญาณเดียวกับที่ POST /tickets/{id}/status ยิง
   *
   * ⚠️ นี่คือช่องว่างที่เคยมีอยู่จริง: decide() เขียนฐานข้อมูลครบทุกตาราง
   *    แต่ไม่เคยบอกใครเลย หน้าที่เปิดเรื่องนั้นค้างอยู่ไม่รีเฟรช และห้องแชท
   *    ของผู้เข้าชมเงียบสนิททั้งที่เรื่องของเขาเพิ่งถูกอนุมัติหรือถูกปฏิเสธ
   *
   * เรียก TicketsService.afterStatusChange ตัวเดียวกับที่ทางปกติเรียก
   * ไม่ได้คัดลอกสองบรรทัดนั้นมาวางไว้ที่นี่ — ผลข้างเคียงที่ถูกคัดลอกคือ
   * ผลข้างเคียงที่วันหนึ่งจะตกหล่นไปข้างหนึ่ง
   *
   * ล้มเหลวแล้วกลืน ด้วยเหตุผลเดียวกับ startFulfillmentClock
   */
  private async announce(
    scope: AccessScope,
    ticketId: number,
    transition: { from: TicketStatus; to: TicketStatus },
    reason?: string | null,
  ): Promise<void> {
    try {
      const detail = await this.ticketsService.detail(scope, ticketId);
      this.ticketsService.afterStatusChange(detail, scope.userId, transition, {
        ...(reason ? { reason } : {}),
      });
    } catch (error) {
      this.logger.warn(
        `แจ้งผลการพิจารณาของเรื่อง #${ticketId} ไม่สำเร็จ: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
