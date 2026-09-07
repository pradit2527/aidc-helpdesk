import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { NotFoundError } from '../../common/errors/domain-error';
import type { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import { appUser, company, department, role, userRole, userRoleScope } from '../../db/schema';

export interface UserListParams {
  q?: string | undefined;
  company_id?: string | undefined;
  is_active?: string | undefined;
  page: number;
  page_size: number;
}

/**
 * จัดการผู้ใช้ — อ่านอย่างเดียวในรอบนี้
 *
 * ⚠️ password_hash ต้องไม่หลุดออกจากชั้นนี้เด็ดขาด
 *    ไม่มี select ตัวไหนในไฟล์นี้ที่ดึงคอลัมน์นั้น และห้ามเพิ่มด้วย —
 *    แฮชที่หลุดออกไปทำให้ผู้โจมตีเอาไปไล่เดารหัสแบบออฟไลน์ได้
 *    โดยที่ระบบไม่มีทางรู้เลยว่ากำลังถูกโจมตี
 *
 * ⚠️ ผู้ใช้ที่ถูกลบแบบ soft delete ต้องไม่โผล่ในรายการ
 *    แต่ยังต้องคงอยู่ในฐานข้อมูล เพราะ ticket เก่าอ้างถึงคนเหล่านั้นอยู่
 */
@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * เงื่อนไขขอบเขต — ผู้ดูแลบริษัทหนึ่งไม่ควรเห็นรายชื่อพนักงานของอีกบริษัท
   *
   * ต่างจากตารางข้อมูลหลักตรงที่ app_user.company_id เป็น NOT NULL
   * จึงไม่มีแนวคิด "ผู้ใช้ระดับกลุ่ม" — ทุกคนสังกัดบริษัทใดบริษัทหนึ่งเสมอ
   */
  private scopeWhere(scope: AccessScope, requestedCompanyId?: number): SQL {
    const parts: SQL[] = [isNull(appUser.deletedAt) as SQL];

    if (!scope.isSuperAdmin) {
      const ids = [...scope.companyIds];
      // ไม่มีบริษัทในขอบเขต = ไม่เห็นใครเลย ไม่ใช่เห็นทุกคน
      parts.push(ids.length === 0 ? (sql`false` as SQL) : (inArray(appUser.companyId, ids) as SQL));
    }

    /*
     * company_id ที่ขอมานอกขอบเขตถูกตัดทิ้งเงียบ ๆ ไม่ตอบ error
     * เหมือนกฎเดียวกับหน้ารายการ ticket (US-07 AC-2) — การตอบ 403
     * ยืนยันว่าบริษัทนั้นมีอยู่จริง ซึ่งเป็นข้อมูลที่ไม่ควรบอก
     */
    if (requestedCompanyId !== undefined && scope.inScope(requestedCompanyId)) {
      parts.push(eq(appUser.companyId, requestedCompanyId) as SQL);
    }

    return and(...parts) as SQL;
  }

  async list(scope: AccessScope, params: UserListParams) {
    const requested = params.company_id ? Number(params.company_id) : undefined;
    const parts: SQL[] = [this.scopeWhere(scope, requested)];

    if (params.q) {
      const needle = `%${params.q}%`;
      parts.push(
        or(
          ilike(appUser.fullName, needle),
          ilike(appUser.username, needle),
          ilike(appUser.employeeCode, needle),
        ) as SQL,
      );
    }
    if (params.is_active === 'true' || params.is_active === 'false') {
      parts.push(eq(appUser.isActive, params.is_active === 'true') as SQL);
    }

    const where = and(...parts) as SQL;
    const offset = (params.page - 1) * params.page_size;

    const [rows, totalRow] = await Promise.all([
      this.db
        .select({
          id: appUser.id,
          username: appUser.username,
          full_name: appUser.fullName,
          email: appUser.email,
          employee_code: appUser.employeeCode,
          job_title: appUser.jobTitle,
          company_id: appUser.companyId,
          company_code: company.code,
          department_name: department.name,
          is_active: appUser.isActive,
          is_locked: appUser.isLocked,
          must_change_password: appUser.mustChangePassword,
          last_login_at: appUser.lastLoginAt,
        })
        .from(appUser)
        .innerJoin(company, eq(company.id, appUser.companyId))
        .leftJoin(department, eq(department.id, appUser.departmentId))
        .where(where)
        .orderBy(asc(appUser.fullName))
        .limit(params.page_size)
        .offset(offset),
      this.db.select({ n: count() }).from(appUser).where(where),
    ]);

    const total = totalRow[0]?.n ?? 0;
    return {
      items: rows.map((r) => ({
        ...r,
        last_login_at: r.last_login_at?.toISOString() ?? null,
      })),
      page: params.page,
      page_size: params.page_size,
      total,
      total_pages: Math.max(1, Math.ceil(total / params.page_size)),
    };
  }

  async detail(scope: AccessScope, id: number) {
    const [row] = await this.db
      .select({
        id: appUser.id,
        username: appUser.username,
        full_name: appUser.fullName,
        email: appUser.email,
        phone: appUser.phone,
        employee_code: appUser.employeeCode,
        job_title: appUser.jobTitle,
        company_id: appUser.companyId,
        company_code: company.code,
        company_name: company.nameTh,
        department_id: appUser.departmentId,
        department_name: department.name,
        auth_provider: appUser.authProvider,
        is_active: appUser.isActive,
        is_locked: appUser.isLocked,
        is_admin_account: appUser.isAdminAccount,
        must_change_password: appUser.mustChangePassword,
        failed_login_count: appUser.failedLoginCount,
        password_changed_at: appUser.passwordChangedAt,
        last_login_at: appUser.lastLoginAt,
      })
      .from(appUser)
      .innerJoin(company, eq(company.id, appUser.companyId))
      .leftJoin(department, eq(department.id, appUser.departmentId))
      .where(and(this.scopeWhere(scope), eq(appUser.id, id)))
      .limit(1);

    if (!row) {
      /*
       * 404 ไม่ใช่ 403 สำหรับผู้ใช้ที่อยู่นอกขอบเขต
       * กฎเดียวกับ ticket — ถ้าตอบ 403 ผู้เรียกจะรู้ว่าเลขนี้มีคนอยู่จริง
       * แล้วไล่เดาเลขเพื่อนับจำนวนพนักงานของบริษัทอื่นได้
       */
      throw new NotFoundError('USER_NOT_FOUND', 'ບໍ່ພົບຜູ້ໃຊ້ທີ່ລະບຸ', { id });
    }

    const now = new Date();
    const scopeCompany = alias(company, 'scope_company');

    const roles = await this.db
      .select({
        user_role_id: userRole.id,
        role_code: role.code,
        role_name_th: role.nameTh,
        granted_at: userRole.grantedAt,
        expires_at: userRole.expiresAt,
        scope_company_code: scopeCompany.code,
      })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.roleId))
      .leftJoin(userRoleScope, eq(userRoleScope.userRoleId, userRole.id))
      .leftJoin(scopeCompany, eq(scopeCompany.id, userRoleScope.companyId))
      .where(eq(userRole.userId, id))
      .orderBy(asc(role.id));

    /*
     * รวมขอบเขตหลายบริษัทของบทบาทเดียวกันเข้าเป็นแถวเดียว
     * เพราะ join กับ user_role_scope ทำให้บทบาทที่มีสามบริษัทกลายเป็นสามแถว
     * ซึ่งหน้าจอจะแสดงเป็นบทบาทซ้ำสามครั้ง
     */
    const grouped = new Map<number, {
      role_code: string;
      role_name_th: string;
      granted_at: string | null;
      expires_at: string | null;
      is_expired: boolean;
      scope_company_codes: string[];
    }>();

    for (const r of roles) {
      const existing = grouped.get(r.user_role_id);
      if (existing) {
        if (r.scope_company_code) existing.scope_company_codes.push(r.scope_company_code);
        continue;
      }
      grouped.set(r.user_role_id, {
        role_code: r.role_code,
        role_name_th: r.role_name_th,
        granted_at: r.granted_at?.toISOString() ?? null,
        expires_at: r.expires_at?.toISOString() ?? null,
        // บทบาทที่หมดอายุแล้วยังอยู่ในฐานข้อมูล แต่ไม่มีผลกับสิทธิ์จริง
        // หน้าจอต้องแยกให้เห็น ไม่งั้นผู้ดูแลจะคิดว่าคนนี้ยังมีสิทธิ์อยู่
        is_expired: r.expires_at !== null && r.expires_at <= now,
        scope_company_codes: r.scope_company_code ? [r.scope_company_code] : [],
      });
    }

    return {
      ...row,
      password_changed_at: row.password_changed_at?.toISOString() ?? null,
      last_login_at: row.last_login_at?.toISOString() ?? null,
      roles: [...grouped.values()],
    };
  }

  /** จำนวนผู้ใช้ที่ยังมีบทบาทไม่หมดอายุ — ใช้ในรายงาน Access Expiry */
  async activeRoleCount(userId: number): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(userRole)
      .where(
        and(
          eq(userRole.userId, userId),
          or(isNull(userRole.expiresAt), gt(userRole.expiresAt, new Date())),
        ),
      );
    return row?.n ?? 0;
  }
}
