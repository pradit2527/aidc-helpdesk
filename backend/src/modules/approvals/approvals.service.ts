import { Inject, Injectable } from '@nestjs/common';
import { alias } from 'drizzle-orm/pg-core';
import { and, asc, count, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import { paged, type PagedResult } from '../../common/http/pagination';
import type { AccessScope } from '../../common/scope';
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
  constructor(@Inject(DB) private readonly db: Db) {}

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
}
