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
 * อายุของ scope ที่จำไว้ในหน่วยความจำ
 *
 * ⚠️ นี่คือเวลาสูงสุดที่การถอนสิทธิ์ "จากอินสแตนซ์อื่น" จะยังไม่มีผล
 *    ในโปรเซสเดียวกันมีผลทันที เพราะทุกจุดที่แก้สิทธิ์เรียก invalidate()
 *    ตั้งสั้นไว้ที่ 30 วินาที — ยาวกว่านี้คนที่ถูกปิดบัญชีจะยังใช้งานต่อได้นานเกินรับได้
 */
const SCOPE_TTL_MS = Number(process.env.SCOPE_CACHE_TTL_SECONDS ?? 30) * 1000;

interface ScopeEntry {
  scope: AccessScope;
  tokenVersion: number;
  expiresAt: number;
}

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
 *
 * จำผลไว้สั้น ๆ ต่อผู้ใช้ เพราะทุกคำขอที่ต้องล็อกอินต้องใช้ scope — เดิมทุกคำขอ
 * ยิงฐานข้อมูลสองรอบก่อนเริ่มงานจริง (ตรวจ token_version หนึ่งรอบ ประกอบสิทธิ์อีกรอบ)
 * หน้าเว็บหนึ่งหน้ายิงราว 6 คำขอพร้อมกัน จึงกลายเป็น 30 คิวรีแย่งกันใช้ connection
 * ทั้งที่ผลของทุกคำขอเหมือนกันหมด
 */
@Injectable()
export class ScopeService {
  private readonly cache = new Map<number, ScopeEntry>();
  /** คำขอที่มาพร้อมกันของคนเดียวกันรอผลก้อนเดียว ไม่ต่างคนต่างยิง */
  private readonly inflight = new Map<number, Promise<ScopeEntry>>();
  /**
   * เลขรุ่นต่อผู้ใช้ — เพิ่มทุกครั้งที่ invalidate
   *
   * กันกรณีที่กำลังโหลดอยู่แล้วมีคนแก้สิทธิ์กลางทาง ผลที่อ่านมาก่อนการแก้
   * ต้องไม่ถูกเก็บลงแคชทับค่าที่เพิ่งล้างไป
   */
  private readonly generations = new Map<number, number>();

  constructor(@Inject(DB) private readonly db: Db) {}

  async forUser(userId: number): Promise<AccessScope> {
    return (await this.entry(userId)).scope;
  }

  /**
   * scope ของเจ้าของ access token พร้อมตรวจว่า token ยังไม่ถูกเพิกถอน
   *
   * ค่าในแคชอาจเก่ากว่า token ได้ (เช่นเพิ่งเปลี่ยนรหัสผ่านบนอินสแตนซ์อื่น)
   * จึงอ่านสดอีกครั้งก่อนตัดสินว่า token ใช้ไม่ได้ — ห้ามเตะผู้ใช้ออกเพราะแคชเก่า
   */
  async forToken(userId: number, tokenVersion: number): Promise<AccessScope> {
    let entry = await this.entry(userId);
    if (entry.tokenVersion !== tokenVersion) {
      this.invalidate(userId);
      entry = await this.entry(userId);
      if (entry.tokenVersion !== tokenVersion) {
        throw new UnauthorizedException({
          error: { code: 'UNAUTHENTICATED', message: 'ເຊດຊັນໝົດອາຍຸແລ້ວ' },
        });
      }
    }
    return entry.scope;
  }

  /** ล้างสิทธิ์ที่จำไว้ — ต้องเรียกทุกครั้งที่แก้บทบาท บริษัท สถานะบัญชี หรือ token_version */
  invalidate(userId: number): void {
    this.cache.delete(userId);
    this.inflight.delete(userId);
    this.generations.set(userId, (this.generations.get(userId) ?? 0) + 1);
  }

  private entry(userId: number): Promise<ScopeEntry> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached);

    const pending = this.inflight.get(userId);
    if (pending) return pending;

    const generation = this.generations.get(userId) ?? 0;
    const loading = this.load(userId)
      .then((entry) => {
        if ((this.generations.get(userId) ?? 0) === generation) this.cache.set(userId, entry);
        return entry;
      })
      .finally(() => {
        if (this.inflight.get(userId) === loading) this.inflight.delete(userId);
      });
    this.inflight.set(userId, loading);
    return loading;
  }

  private async load(userId: number): Promise<ScopeEntry> {
    const now = new Date();
    // role ที่ยังมีผล = ไม่มีวันหมดอายุ หรือหมดอายุในอนาคต
    const activeRole = or(isNull(userRole.expiresAt), gt(userRole.expiresAt, now));

    /*
     * ยิงทั้งสี่คิวรีพร้อมกัน ไม่ใช่ทีละตัว
     *
     * ทั้งสี่ตัวไม่ได้พึ่งผลของกันเลย บนฐานข้อมูลที่อยู่ไกล (~250 ms ต่อรอบ)
     * สี่รอบเรียงกันคือราว 1 วินาที ส่วนยิงพร้อมกันเหลือราวรอบเดียว
     *
     * ⚠️ ยังตรวจบัญชีที่ใช้งานไม่ได้ก่อนคืนค่าเหมือนเดิม ถ้าบัญชีถูกปิด ผลของ
     *    อีกสามคิวรีถูกทิ้งไปโดยไม่เคยถูกใช้ และไม่ถูกเก็บลงแคช
     */
    const [[user], rows, scopeRows, contactRows] = await Promise.all([
      this.db
        .select({
          id: appUser.id,
          companyId: appUser.companyId,
          isActive: appUser.isActive,
          deletedAt: appUser.deletedAt,
          tokenVersion: appUser.tokenVersion,
        })
        .from(appUser)
        .where(eq(appUser.id, userId))
        .limit(1),
      this.db
        .select({
          roleCode: role.code,
          permissionCode: permission.code,
        })
        .from(userRole)
        .innerJoin(role, eq(role.id, userRole.roleId))
        .leftJoin(rolePermission, eq(rolePermission.roleId, role.id))
        .leftJoin(permission, eq(permission.id, rolePermission.permissionId))
        .where(and(eq(userRole.userId, userId), activeRole)),
      this.db
        .select({ companyId: userRoleScope.companyId })
        .from(userRoleScope)
        .innerJoin(userRole, eq(userRole.id, userRoleScope.userRoleId))
        .where(and(eq(userRole.userId, userId), activeRole)),
      this.db
        .select({ key: escalationContact.contactKey })
        .from(escalationContact)
        .where(and(eq(escalationContact.userId, userId), eq(escalationContact.isActive, true))),
    ]);

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'ບັນຊີນີ້ໃຊ້ງານບໍ່ໄດ້' },
      });
    }

    const permissions = new Set<string>();
    const roleCodes = new Set<string>();
    let isSuperAdmin = false;
    for (const row of rows) {
      roleCodes.add(row.roleCode);
      if (row.roleCode === 'super_admin') isSuperAdmin = true;
      if (row.permissionCode) permissions.add(row.permissionCode);
    }

    return {
      scope: new AccessScope({
        userId: user.id,
        homeCompanyId: user.companyId,
        companyIds: scopeRows.map((r) => r.companyId),
        permissions,
        isSuperAdmin,
        contactKeys: contactRows.map((r) => r.key),
        roleCodes,
      }),
      tokenVersion: user.tokenVersion,
      expiresAt: Date.now() + SCOPE_TTL_MS,
    };
  }
}
