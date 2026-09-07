import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import { NotFoundError } from '../../common/errors/domain-error';
import { paged, type PagedResult } from '../../common/http/pagination';
import type { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import { appUser, company, problem, service, ticket } from '../../db/schema';

export interface ProblemListParams {
  status?: string | undefined;
  service_id?: string | undefined;
  company_id?: string | undefined;
  page: number;
  page_size: number;
}

/**
 * ปัญหาที่เป็นต้นเหตุร่วม (Problem Management, SLA 7.2–7.3)
 *
 * ต่างจาก ticket ตรงที่ ticket คือ "อาการที่ผู้ใช้เจอ" ส่วน problem คือ
 * "สาเหตุที่ทำให้เกิดอาการนั้นซ้ำ ๆ" — ticket หลายใบผูกกับ problem เดียวได้
 *
 * ⚠️ rca_due_at ที่เลยแล้วแต่ยังไม่ส่ง RCA คือของค้างที่ต้องเห็นชัด
 *    เหตุ P1 ต้องส่ง RCA ภายใน 5 วันทำการ (SLA 7.2) การปล่อยให้เลยกำหนด
 *    เงียบ ๆ ทำให้เหตุเดิมเกิดซ้ำโดยไม่มีใครแก้ที่ต้นเหตุ
 */
@Injectable()
export class ProblemsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  private scopeWhere(scope: AccessScope, requested?: number): SQL | undefined {
    const parts: SQL[] = [];
    if (!scope.isSuperAdmin) {
      const ids = [...scope.companyIds];
      // problem.company_id เป็น NOT NULL — ไม่มีแนวคิด problem ระดับกลุ่ม
      parts.push(ids.length === 0 ? (sql`false` as SQL) : (inArray(problem.companyId, ids) as SQL));
    }
    if (requested !== undefined && scope.inScope(requested)) {
      parts.push(eq(problem.companyId, requested) as SQL);
    }
    return parts.length === 0 ? undefined : (and(...parts) as SQL);
  }

  async list(scope: AccessScope, params: ProblemListParams): Promise<PagedResult<unknown>> {
    const parts: SQL[] = [];
    const scoped = this.scopeWhere(
      scope,
      params.company_id ? Number(params.company_id) : undefined,
    );
    if (scoped) parts.push(scoped);
    if (params.status) parts.push(eq(problem.status, params.status) as SQL);
    if (params.service_id) parts.push(eq(problem.serviceId, Number(params.service_id)) as SQL);

    const where = parts.length ? (and(...parts) as SQL) : undefined;
    const offset = (params.page - 1) * params.page_size;

    const [rows, totalRow] = await Promise.all([
      this.db
        .select({
          id: problem.id,
          code: problem.code,
          title: problem.title,
          company_id: problem.companyId,
          company_code: company.code,
          service_id: problem.serviceId,
          service_name: service.nameTh,
          root_cause_code: problem.rootCauseCode,
          status: problem.status,
          owner_id: problem.ownerId,
          owner_name: appUser.fullName,
          opened_at: problem.openedAt,
          rca_due_at: problem.rcaDueAt,
          rca_submitted_at: problem.rcaSubmittedAt,
          closed_at: problem.closedAt,
          // นับ ticket ที่ผูกอยู่ด้วยคิวรีย่อย ไม่ใช่ join + groupBy
          // เพราะ join จะทำให้ต้องจัดกลุ่มทุกคอลัมน์ด้านบนโดยไม่จำเป็น
          linked_ticket_count: sql<number>`(
            SELECT count(*)::int FROM ${ticket}
            WHERE ${ticket.problemId} = ${problem.id} AND ${ticket.deletedAt} IS NULL
          )`,
        })
        .from(problem)
        .innerJoin(company, eq(company.id, problem.companyId))
        .leftJoin(service, eq(service.id, problem.serviceId))
        .leftJoin(appUser, eq(appUser.id, problem.ownerId))
        .where(where)
        .orderBy(desc(problem.openedAt))
        .limit(params.page_size)
        .offset(offset),
      this.db.select({ n: count() }).from(problem).where(where),
    ]);

    const now = Date.now();
    return paged(
      rows.map(({ company_id, company_code, service_id, service_name, owner_id, owner_name, ...r }) => ({
        ...r,
        company: company_id === null ? null : { id: company_id, code: company_code },
        service: service_id === null ? null : { id: service_id, name_th: service_name ?? '' },
        owner: owner_id === null ? null : { id: owner_id, full_name: owner_name ?? '' },
        opened_at: r.opened_at.toISOString(),
        rca_due_at: r.rca_due_at?.toISOString() ?? null,
        rca_submitted_at: r.rca_submitted_at?.toISOString() ?? null,
        closed_at: r.closed_at?.toISOString() ?? null,
        is_rca_overdue:
          r.rca_submitted_at === null && r.rca_due_at !== null && r.rca_due_at.getTime() < now,
      })),
      params.page,
      params.page_size,
      totalRow[0]?.n ?? 0,
    );
  }

  async detail(scope: AccessScope, id: number) {
    const [row] = await this.db
      .select({
        id: problem.id,
        code: problem.code,
        title: problem.title,
        company_id: problem.companyId,
        company_code: company.code,
        service_id: problem.serviceId,
        service_name: service.nameTh,
        root_cause_code: problem.rootCauseCode,
        root_cause_note: problem.rootCauseNote,
        status: problem.status,
        owner_id: problem.ownerId,
        owner_name: appUser.fullName,
        opened_at: problem.openedAt,
        rca_due_at: problem.rcaDueAt,
        rca_submitted_at: problem.rcaSubmittedAt,
        closed_at: problem.closedAt,
      })
      .from(problem)
      .innerJoin(company, eq(company.id, problem.companyId))
      .leftJoin(service, eq(service.id, problem.serviceId))
      .leftJoin(appUser, eq(appUser.id, problem.ownerId))
      .where(and(this.scopeWhere(scope) ?? sql`true`, eq(problem.id, id)))
      .limit(1);

    if (!row) {
      throw new NotFoundError('PROBLEM_NOT_FOUND', 'ບໍ່ພົບບັນຫາທີ່ລະບຸ', { id });
    }

    const linked = await this.db
      .select({
        id: ticket.id,
        ticket_no: ticket.ticketNo,
        subject: ticket.subject,
        priority: ticket.priority,
        status: ticket.status,
        created_at: ticket.createdAt,
      })
      .from(ticket)
      .where(and(eq(ticket.problemId, id), isNull(ticket.deletedAt)))
      .orderBy(desc(ticket.createdAt))
      // จำกัดไว้ — problem ที่กระทบวงกว้างอาจผูก ticket หลายร้อยใบ
      // หน้ารายละเอียดต้องการตัวอย่างล่าสุด ไม่ใช่ทั้งหมด
      .limit(50);

    const now = Date.now();
    const { company_id, company_code, service_id, service_name, owner_id, owner_name, ...rest } = row;
    return {
      ...rest,
      company: company_id === null ? null : { id: company_id, code: company_code },
      service: service_id === null ? null : { id: service_id, name_th: service_name ?? '' },
      owner: owner_id === null ? null : { id: owner_id, full_name: owner_name ?? '' },
      opened_at: row.opened_at.toISOString(),
      rca_due_at: row.rca_due_at?.toISOString() ?? null,
      rca_submitted_at: row.rca_submitted_at?.toISOString() ?? null,
      closed_at: row.closed_at?.toISOString() ?? null,
      is_rca_overdue:
        row.rca_submitted_at === null &&
        row.rca_due_at !== null &&
        row.rca_due_at.getTime() < now,
      linked_tickets: linked.map((t) => ({ ...t, created_at: t.created_at.toISOString() })),
    };
  }
}
