import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq, gt, isNull, or } from 'drizzle-orm';

import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import {
  appUser,
  escalationContact,
  permission,
  role,
  rolePermission,
  userRole,
  userRoleScope,
} from '../db/schema';
import { AccessScope } from './scope';

/**
 * ประกอบ AccessScope ของผู้ใช้หนึ่งคนจากฐานข้อมูล
 *
 * รวมสี่อย่างเข้าด้วยกัน
 *   1. permission — ผลรวมของทุก role ที่ยังไม่หมดอายุ
 *   2. ขอบเขตบริษัท — จาก user_role_scope ถ้าไม่กำหนดใช้บริษัทต้นสังกัด
 *   3. ธง super_admin — ทับทุกกฎ
 *   4. contact_key — ใช้ตัดสินว่าเห็นเหตุความปลอดภัยได้ไหม
 *
 * ⚠️ role ที่หมดอายุแล้วต้องไม่นับ (expires_at) — สิทธิ์ชั่วคราวที่ไม่หมดอายุจริง
 *    คือช่องโหว่ที่ตรวจสอบภายในจับได้แน่นอน และเป็นเหตุผลที่มีรายงาน Access Expiry
 */
@Injectable()
export class ScopeService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async forUser(userId: number): Promise<AccessScope> {
    const [user] = await this.db
      .select({
        id: appUser.id,
        companyId: appUser.companyId,
        isActive: appUser.isActive,
        isLocked: appUser.isLocked,
        deletedAt: appUser.deletedAt,
      })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'ບັນຊີນີ້ໃຊ້ງານບໍ່ໄດ້' },
      });
    }

    const now = new Date();
    // role ที่ยังมีผล = ไม่มีวันหมดอายุ หรือหมดอายุในอนาคต
    const activeRole = or(isNull(userRole.expiresAt), gt(userRole.expiresAt, now));

    const rows = await this.db
      .select({
        roleCode: role.code,
        permissionCode: permission.code,
      })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.roleId))
      .leftJoin(rolePermission, eq(rolePermission.roleId, role.id))
      .leftJoin(permission, eq(permission.id, rolePermission.permissionId))
      .where(and(eq(userRole.userId, userId), activeRole));

    const permissions = new Set<string>();
    const roleCodes = new Set<string>();
    let isSuperAdmin = false;
    for (const row of rows) {
      roleCodes.add(row.roleCode);
      if (row.roleCode === 'super_admin') isSuperAdmin = true;
      if (row.permissionCode) permissions.add(row.permissionCode);
    }

    const scopeRows = await this.db
      .select({ companyId: userRoleScope.companyId })
      .from(userRoleScope)
      .innerJoin(userRole, eq(userRole.id, userRoleScope.userRoleId))
      .where(and(eq(userRole.userId, userId), activeRole));

    const contactRows = await this.db
      .select({ key: escalationContact.contactKey })
      .from(escalationContact)
      .where(and(eq(escalationContact.userId, userId), eq(escalationContact.isActive, true)));

    return new AccessScope({
      userId: user.id,
      homeCompanyId: user.companyId,
      companyIds: scopeRows.map((r) => r.companyId),
      permissions,
      isSuperAdmin,
      contactKeys: contactRows.map((r) => r.key),
      roleCodes,
    });
  }
}
