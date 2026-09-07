import { Inject, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { and, asc, count, eq, gt, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { NotFoundError, ValidationError } from '../../common/errors/domain-error';
import type { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import { appUser, company, department, role, userRole, userRoleScope } from '../../db/schema';

export interface ImportRowResult {
  line: number;
  username: string;
  full_name: string;
  company: string;
  status: 'ok' | 'error' | 'skipped';
  message: string;
}

/** คอลัมน์ที่ต้องมีในไฟล์ — ชื่อหัวคอลัมน์ต้องตรงตัว ไม่สนตัวพิมพ์ */
const REQUIRED_COLUMNS = ['username', 'full_name', 'company_code'] as const;

/**
 * แยกบรรทัด CSV หนึ่งบรรทัดโดยเคารพเครื่องหมายคำพูด
 *
 * split(',') เฉย ๆ ใช้ไม่ได้ เพราะชื่อตำแหน่งงานมักมีจุลภาคอยู่ข้างใน
 * เช่น "IT Support, Tier 2" ซึ่งจะถูกตัดเป็นสองคอลัมน์แล้วทำให้ทุกคอลัมน์
 * หลังจากนั้นเลื่อนไปหมด โดยไฟล์ยังนำเข้าได้และไม่มี error ให้เห็น
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // "" ภายในเครื่องหมายคำพูด = อักขระ " หนึ่งตัว
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

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
          company_name_th: company.nameTh,
          department_id: appUser.departmentId,
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

    /*
     * ดึงบทบาทของทุกคนในหน้านี้ด้วยคิวรีเดียว ไม่ใช่คนละคิวรีต่อคน
     *
     * หน้าละ 20 คน = 21 คิวรีถ้าวนเรียก ซึ่งเป็นรูปแบบ N+1 คลาสสิก
     * ที่ไม่มีใครสังเกตตอนข้อมูลน้อย แล้วช้าลงเป็นเส้นตรงตามจำนวนผู้ใช้
     */
    const roleRows =
      rows.length === 0
        ? []
        : await this.db
            .select({ user_id: userRole.userId, code: role.code, expires_at: userRole.expiresAt })
            .from(userRole)
            .innerJoin(role, eq(role.id, userRole.roleId))
            .where(
              inArray(
                userRole.userId,
                rows.map((r) => r.id),
              ),
            );

    const now = new Date();
    const rolesByUser = new Map<number, string[]>();
    for (const r of roleRows) {
      // บทบาทที่หมดอายุแล้วไม่มีผลกับสิทธิ์จริง จึงไม่ควรแสดงว่าคนนี้ยังถืออยู่
      if (r.expires_at !== null && r.expires_at <= now) continue;
      const list = rolesByUser.get(r.user_id);
      if (list) list.push(r.code);
      else rolesByUser.set(r.user_id, [r.code]);
    }

    return {
      items: rows.map(
        ({
          company_id,
          company_code,
          company_name_th,
          department_id,
          department_name,
          ...r
        }) => ({
          ...r,
          company: { id: company_id, code: company_code, name_th: company_name_th },
          department:
            department_id === null ? null : { id: department_id, name: department_name ?? '' },
          roles: rolesByUser.get(r.id) ?? [],
          scoped_companies: [],
          last_login_at: r.last_login_at?.toISOString() ?? null,
        }),
      ),
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

  /**
   * แก้ไขข้อมูลติดต่อของตนเอง (PATCH /users/me)
   *
   * ⚠️ แก้ได้เฉพาะสามฟิลด์นี้เท่านั้น และห้ามเพิ่มฟิลด์อื่นเข้ามาโดยไม่คิด
   *    ฟิลด์ที่ตัดสินสิทธิ์ (company_id, department_id, is_active,
   *    is_admin_account) ต้องแก้ผ่านผู้ดูแลเท่านั้น — ถ้าเปิดให้แก้เองได้
   *    ผู้ใช้จะย้ายตัวเองเข้าบริษัทอื่นแล้วเห็นข้อมูลทั้งหมดของบริษัทนั้น
   *
   * ⚠️ username แก้เองไม่ได้ด้วย เพราะเป็นตัวอ้างอิงใน audit_log
   *    การเปลี่ยนชื่อผู้ใช้ทำให้ร่องรอยย้อนหลังชี้ไปคนละคน
   */
  async updateMe(
    userId: number,
    input: { full_name?: string; email?: string | null; phone?: string | null },
  ) {
    const patch: Record<string, unknown> = {};

    if (input.full_name !== undefined) {
      const name = input.full_name.trim();
      if (name.length < 2) {
        throw new ValidationError('VALIDATION_ERROR', 'ຊື່ຕ້ອງຍາວຢ່າງໜ້ອຍ 2 ຕົວອັກສອນ', [
          { field: 'full_name', message: 'ຊື່ສັ້ນເກີນໄປ' },
        ]);
      }
      patch.fullName = name;
    }

    if (input.email !== undefined) {
      const email = input.email?.trim() || null;
      /*
       * ตรวจแค่รูปแบบพื้นฐาน ไม่ใช่ regex ยาวที่อ้างว่าครอบคลุม RFC
       *
       * regex อีเมลแบบเต็มสเปกยาวหลายร้อยตัวอักษรและยังปฏิเสธที่อยู่ที่ใช้ได้จริง
       * การยืนยันจริงคือส่งเมลไปแล้วให้กดยืนยัน ซึ่งเป็นงานคนละชิ้น
       */
      if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ValidationError('VALIDATION_ERROR', 'ຮູບແບບອີເມວບໍ່ຖືກຕ້ອງ', [
          { field: 'email', message: 'ຮູບແບບອີເມວບໍ່ຖືກຕ້ອງ' },
        ]);
      }
      patch.email = email;
    }

    if (input.phone !== undefined) {
      patch.phone = input.phone?.trim() || null;
    }

    if (Object.keys(patch).length === 0) {
      return this.me(userId);
    }

    await this.db.update(appUser).set(patch).where(eq(appUser.id, userId));
    return this.me(userId);
  }

  /** ข้อมูลติดต่อของตนเอง — ใช้ยืนยันผลหลังบันทึก */
  private async me(userId: number) {
    const [row] = await this.db
      .select({
        id: appUser.id,
        username: appUser.username,
        full_name: appUser.fullName,
        email: appUser.email,
        phone: appUser.phone,
        job_title: appUser.jobTitle,
      })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);

    if (!row) throw new NotFoundError('USER_NOT_FOUND', 'ບໍ່ພົບຜູ້ໃຊ້', { id: userId });
    return row;
  }

  /**
   * นำเข้าผู้ใช้จากไฟล์ CSV (POST /users/import)
   *
   * รายงานผลรายแถว ไม่ใช่แค่ยอดรวม — ไฟล์รายชื่อพนักงานมีหลักร้อยแถว
   * ถ้าบอกแค่ "สำเร็จ 180 จาก 200" ผู้ดูแลต้องไล่หาเองว่าอีก 20 แถวคือแถวไหน
   *
   * ⚠️ กฎความปลอดภัยสามข้อที่ห้ามผ่อน
   *
   *   1. นำเข้าได้เฉพาะบริษัทที่อยู่ในขอบเขตของผู้เรียก
   *      มิฉะนั้นผู้ดูแลบริษัทหนึ่งจะสร้างบัญชีในอีกบริษัท แล้วใช้บัญชีนั้น
   *      เข้าไปดูข้อมูลของบริษัทนั้นได้ทั้งหมด
   *
   *   2. บัญชีที่สร้างต้อง must_change_password = true เสมอ
   *      รหัสตั้งต้นถูกส่งต่อกันด้วยวาจาหรืออีเมลกลุ่ม การไม่บังคับเปลี่ยน
   *      แปลว่ารหัสที่คนอื่นรู้ยังใช้เข้าได้ต่อไปโดยไม่มีกำหนด
   *
   *   3. ไม่มอบบทบาทใดจากไฟล์
   *      บัญชีที่นำเข้าได้สิทธิ์เท่าผู้ใช้ทั่วไป การให้ไฟล์ CSV กำหนดบทบาทได้
   *      เท่ากับเปิดทางยกระดับสิทธิ์ผ่านการแก้ไฟล์ ซึ่งไม่มีร่องรอยว่าใครแก้
   */
  async importUsers(
    scope: AccessScope,
    input: { csv: string; default_password?: string; dry_run?: boolean },
  ): Promise<{ dry_run: boolean; rows: ImportRowResult[]; summary: Record<string, number> }> {
    const dryRun = input.dry_run === true;

    if (!dryRun && (input.default_password?.length ?? 0) < 12) {
      throw new ValidationError(
        'VALIDATION_ERROR',
        'ລະຫັດຜ່ານຕັ້ງຕົ້ນຕ້ອງຍາວຢ່າງໜ້ອຍ 12 ຕົວອັກສອນ (ນະໂຍບາຍ 3.2)',
        [{ field: 'default_password', message: 'ສັ້ນເກີນໄປ' }],
      );
    }

    const lines = input.csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new ValidationError('VALIDATION_ERROR', 'ໄຟລ໌ຕ້ອງມີຫົວຄໍລຳ ແລະ ຢ່າງໜ້ອຍໜຶ່ງແຖວຂໍ້ມູນ');
    }

    const header = splitCsvLine(lines[0] ?? '').map((h) => h.toLowerCase());
    const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
    if (missing.length > 0) {
      throw new ValidationError('VALIDATION_ERROR', `ຂາດຄໍລຳ: ${missing.join(', ')}`, [
        { field: 'csv', message: `ຂາດຄໍລຳ ${missing.join(', ')}` },
      ]);
    }

    const idx = {
      username: header.indexOf('username'),
      full_name: header.indexOf('full_name'),
      company_code: header.indexOf('company_code'),
      email: header.indexOf('email'),
      employee_code: header.indexOf('employee_code'),
      job_title: header.indexOf('job_title'),
    };

    // อ่านบริษัทในขอบเขตครั้งเดียว แล้วใช้กับทุกแถว
    const companies = await this.db.select({ id: company.id, code: company.code }).from(company);
    const companyByCode = new Map(
      companies.filter((c) => scope.inScope(c.id)).map((c) => [c.code.toUpperCase(), c.id]),
    );

    const existing = new Set(
      (await this.db.select({ username: appUser.username }).from(appUser)).map((u) =>
        u.username.toLowerCase(),
      ),
    );

    /*
     * แฮชรหัสผ่านครั้งเดียวนอกลูป
     *
     * argon2 ตั้งใจให้ช้า (~100ms ต่อครั้ง) ซึ่งเป็นคุณสมบัติที่ต้องการ
     * ตอนตรวจรหัสผ่าน แต่การเรียกซ้ำ 200 รอบในคำขอเดียวจะใช้เวลา 20 วินาที
     * แล้วคำขอหมดเวลาไปก่อน ทุกบัญชีใช้รหัสตั้งต้นเดียวกันอยู่แล้ว
     * จึงแฮชครั้งเดียวพอ
     */
    const passwordHash = dryRun
      ? ''
      : await argon2.hash(input.default_password ?? '', { type: argon2.argon2id });

    const rows: ImportRowResult[] = [];
    // กันชื่อซ้ำกันเองภายในไฟล์เดียว ซึ่ง existing จับไม่ได้เพราะยังไม่ถูกเขียน
    const seenInFile = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i] ?? '');
      const pick = (n: number) => (n >= 0 ? (cells[n] ?? '') : '');

      const username = pick(idx.username).toLowerCase();
      const fullName = pick(idx.full_name);
      const companyCode = pick(idx.company_code).toUpperCase();
      // เลขบรรทัดในไฟล์จริง — หัวคอลัมน์คือบรรทัดที่ 1
      const line = i + 1;

      const fail = (message: string): void => {
        rows.push({
          line,
          username,
          full_name: fullName,
          company: companyCode,
          status: 'error',
          message,
        });
      };

      if (!username) {
        fail('ຊ່ອງ username ວ່າງ');
        continue;
      }
      if (!fullName) {
        fail('ຊ່ອງ full_name ວ່າງ');
        continue;
      }

      const companyId = companyByCode.get(companyCode);
      if (companyId === undefined) {
        /*
         * ข้อความเดียวกันทั้งกรณี "ไม่มีบริษัทนี้" และ "มีแต่อยู่นอกขอบเขต"
         * เพื่อไม่ให้ผู้เรียกใช้ไฟล์นำเข้าเป็นเครื่องมือไล่เดาว่ากลุ่มนี้
         * มีบริษัทอะไรอยู่บ้าง
         */
        fail(`ບໍ່ພົບລະຫັດບໍລິສັດ ${companyCode || '(ວ່າງ)'} ໃນຂອບເຂດຂອງທ່ານ`);
        continue;
      }

      if (existing.has(username) || seenInFile.has(username)) {
        rows.push({
          line,
          username,
          full_name: fullName,
          company: companyCode,
          status: 'skipped',
          message: 'ມີຊື່ຜູ້ໃຊ້ນີ້ຢູ່ແລ້ວ ຂ້າມແຖວນີ້',
        });
        continue;
      }

      seenInFile.add(username);

      if (dryRun) {
        rows.push({
          line,
          username,
          full_name: fullName,
          company: companyCode,
          status: 'ok',
          message: 'ກວດຜ່ານ ພ້ອມນຳເຂົ້າ',
        });
        continue;
      }

      try {
        await this.db.insert(appUser).values({
          companyId,
          username,
          fullName,
          email: pick(idx.email) || null,
          employeeCode: pick(idx.employee_code) || null,
          jobTitle: pick(idx.job_title) || null,
          passwordHash,
          authProvider: 'local',
          // บังคับเปลี่ยนรหัสตั้งแต่เข้าครั้งแรกเสมอ ไม่มีทางปิดจากไฟล์
          mustChangePassword: true,
          isActive: true,
        });
        rows.push({
          line,
          username,
          full_name: fullName,
          company: companyCode,
          status: 'ok',
          message: 'ສ້າງບັນຊີແລ້ວ',
        });
      } catch (err) {
        // แถวเดียวล้มไม่ควรทำให้ทั้งไฟล์ล้ม — รายงานแถวนั้นแล้วไปต่อ
        fail(err instanceof Error ? err.message : 'ບັນທຶກບໍ່ສຳເລັດ');
      }
    }

    return {
      dry_run: dryRun,
      rows,
      summary: {
        total: rows.length,
        ok: rows.filter((r) => r.status === 'ok').length,
        skipped: rows.filter((r) => r.status === 'skipped').length,
        error: rows.filter((r) => r.status === 'error').length,
      },
    };
  }
}
