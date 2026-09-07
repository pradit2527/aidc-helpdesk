import { Inject, Injectable } from '@nestjs/common';
import { alias } from 'drizzle-orm/pg-core';
import { and, asc, count, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import { ChangeTicketStatusUseCase } from '../../application/use-cases/change-ticket-status.use-case';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { paged, type PagedResult } from '../../common/http/pagination';
import { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import { appUser, approvalRequest, company, ticket } from '../../db/schema';

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
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly changeStatus: ChangeTicketStatusUseCase,
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
   *   5. ปฏิเสธขั้นใดขั้นหนึ่ง → ticket ไป cancelled ทันที
   *
   * ⚠️ การเปลี่ยนสถานะ ticket มอบให้ ChangeTicketStatusUseCase ทำ ไม่เขียนเอง
   *    เพราะการออกจากสถานะพักต้องบวกเวลาที่หยุดนาฬิกาคืนเข้ากำหนดเวลา
   *    ถ้าเขียน UPDATE ตรงนี้เอง เวลาที่ใช้รออนุมัติจะถูกนับเป็นความล่าช้า
   *    ของทีมไอที ซึ่งขัดกับ SLA ข้อ 9
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
      permissions: ['ticket.change_status'],
      isSuperAdmin: false,
    });

    if (input.decision === 'rejected') {
      await this.changeStatus.execute(systemScope, row.ticket_id, {
        toStatus: 'cancelled',
        reason: `ຄຳຂໍຖືກປະຕິເສດຂັ້ນທີ ${row.seq}: ${comment}`,
      });
      return { id, status: 'rejected' as const, ticket_status: 'cancelled', next_seq: null };
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
      // ยังไม่ครบสาย — ticket ค้างที่ pending_user ต่อไป นาฬิกายังหยุดอยู่
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
    if (row.ticket_status === 'pending_user') {
      await this.changeStatus.execute(systemScope, row.ticket_id, {
        toStatus: 'assigned',
        reason: `ອະນຸມັດຄົບທຸກຂັ້ນແລ້ວ (${row.seq} ຂັ້ນ)`,
      });
    }

    return { id, status: 'approved' as const, ticket_status: 'assigned', next_seq: null };
  }
}
