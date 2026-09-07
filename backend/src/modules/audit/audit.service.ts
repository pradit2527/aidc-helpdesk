import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';

import { paged, type PagedResult } from '../../common/http/pagination';
import type { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import { appUser, auditLog, company } from '../../db/schema';

export interface AuditListParams {
  action?: string | undefined;
  entity_type?: string | undefined;
  entity_id?: string | undefined;
  actor_id?: string | undefined;
  company_id?: string | undefined;
  date_from?: string | undefined;
  date_to?: string | undefined;
  page: number;
  page_size: number;
}

export interface AuditRow {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  /** null = การกระทำของระบบเอง ไม่ใช่ของคน (เช่น งานยกระดับอัตโนมัติ) */
  actor: { id: number; full_name: string; username: string } | null;
  /** null = เหตุการณ์ระดับกลุ่ม ไม่ผูกกับบริษัทใดบริษัทหนึ่ง */
  company: { id: number; code: string } | null;
  old_value: unknown;
  new_value: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * ร่องรอยการใช้งาน — อ่านอย่างเดียวโดยสิ้นเชิง
 *
 * ⚠️ ไฟล์นี้ต้องไม่มี insert / update / delete ตลอดไป
 *    ตาราง audit_log เป็น append-only ตาม NFR-18 การเปิดทางให้แก้ไขจากที่นี่
 *    ทำให้หลักฐานถูกลบได้โดยคนที่ก่อเหตุเอง ซึ่งทำลายเหตุผลทั้งหมดของการมีตารางนี้
 *    การเขียนลง audit_log เกิดที่ชั้นที่ทำงานจริงเท่านั้น
 *
 * ⚠️ old_value / new_value อาจมีข้อมูลส่วนบุคคล จึงต้องผ่านขอบเขตบริษัทเสมอ
 *    และต้องใช้สิทธิ์ audit.read ซึ่งไม่ได้แจกให้บทบาททั่วไป
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * เงื่อนไขขอบเขต
   *
   * company_id = NULL คือเหตุการณ์ระดับระบบ (เช่น การตั้งค่าส่วนกลาง)
   * ซึ่งเห็นได้เฉพาะ super_admin — ปล่อยให้ผู้ดูแลบริษัทเห็นด้วยไม่ได้
   * เพราะเหตุการณ์ระดับระบบมักพาดพิงถึงหลายบริษัทพร้อมกัน
   */
  private scopeWhere(scope: AccessScope, requested?: number): SQL | undefined {
    const parts: SQL[] = [];

    if (!scope.isSuperAdmin) {
      const ids = [...scope.companyIds];
      parts.push(ids.length === 0 ? (sql`false` as SQL) : (inArray(auditLog.companyId, ids) as SQL));
    }
    if (requested !== undefined && scope.inScope(requested)) {
      parts.push(eq(auditLog.companyId, requested) as SQL);
    }

    return parts.length === 0 ? undefined : (and(...parts) as SQL);
  }

  async list(scope: AccessScope, params: AuditListParams): Promise<PagedResult<AuditRow>> {
    const parts: SQL[] = [];
    const scoped = this.scopeWhere(
      scope,
      params.company_id ? Number(params.company_id) : undefined,
    );
    if (scoped) parts.push(scoped);

    if (params.action) parts.push(eq(auditLog.action, params.action) as SQL);
    if (params.entity_type) parts.push(eq(auditLog.entityType, params.entity_type) as SQL);
    if (params.entity_id) parts.push(eq(auditLog.entityId, Number(params.entity_id)) as SQL);
    if (params.actor_id) parts.push(eq(auditLog.actorId, Number(params.actor_id)) as SQL);

    /*
     * ช่วงวันที่รับเป็น ISO string แล้วแปลงเป็น Date ที่นี่
     * ค่าที่แปลงไม่ได้ (เช่น "เมื่อวาน") กลายเป็น Invalid Date ซึ่งถ้าส่งต่อ
     * ไปที่ไดรเวอร์จะได้ error ที่อ่านไม่รู้เรื่อง จึงตัดทิ้งเงียบ ๆ ดีกว่า
     */
    const from = params.date_from ? new Date(params.date_from) : null;
    const to = params.date_to ? new Date(params.date_to) : null;
    if (from && !Number.isNaN(from.getTime())) parts.push(gte(auditLog.createdAt, from) as SQL);
    if (to && !Number.isNaN(to.getTime())) parts.push(lte(auditLog.createdAt, to) as SQL);

    const where = parts.length ? (and(...parts) as SQL) : undefined;
    const offset = (params.page - 1) * params.page_size;

    const [rows, totalRow] = await Promise.all([
      this.db
        .select({
          id: auditLog.id,
          action: auditLog.action,
          entity_type: auditLog.entityType,
          entity_id: auditLog.entityId,
          actor_id: auditLog.actorId,
          actor_name: appUser.fullName,
          actor_username: appUser.username,
          company_id: auditLog.companyId,
          company_code: company.code,
          old_value: auditLog.oldValue,
          new_value: auditLog.newValue,
          ip_address: auditLog.ipAddress,
          user_agent: auditLog.userAgent,
          created_at: auditLog.createdAt,
        })
        .from(auditLog)
        // leftJoin ทั้งคู่ — actor เป็น NULL ได้เมื่อเป็นการกระทำของระบบเอง
        // และ company เป็น NULL ได้เมื่อเป็นเหตุการณ์ระดับกลุ่ม
        .leftJoin(appUser, eq(appUser.id, auditLog.actorId))
        .leftJoin(company, eq(company.id, auditLog.companyId))
        .where(where)
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(params.page_size)
        .offset(offset),
      this.db.select({ n: count() }).from(auditLog).where(where),
    ]);

    return paged(
      rows.map(
        ({ actor_id, actor_name, actor_username, company_id, company_code, ...r }) => ({
          ...r,
          actor:
            actor_id === null
              ? null
              : { id: actor_id, full_name: actor_name ?? '', username: actor_username ?? '' },
          company: company_id === null ? null : { id: company_id, code: company_code ?? '' },
          created_at: r.created_at.toISOString(),
        }),
      ),
      params.page,
      params.page_size,
      totalRow[0]?.n ?? 0,
    );
  }

  /** ค่าที่มีจริงในข้อมูล ใช้เติมตัวเลือกในฟอร์มค้นหา แทนการฝังรายการตายตัว */
  async facets(scope: AccessScope) {
    const where = this.scopeWhere(scope);
    const [actions, entityTypes] = await Promise.all([
      this.db
        .selectDistinct({ value: auditLog.action })
        .from(auditLog)
        .where(where)
        .orderBy(auditLog.action),
      this.db
        .selectDistinct({ value: auditLog.entityType })
        .from(auditLog)
        .where(where)
        .orderBy(auditLog.entityType),
    ]);
    return {
      actions: actions.map((r) => r.value),
      entity_types: entityTypes.map((r) => r.value),
    };
  }
}
