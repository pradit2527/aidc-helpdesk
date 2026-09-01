/**
 * ขอบเขตการมองเห็นข้อมูลของผู้เรียก 1 request
 *
 * นี่คือหัวใจความปลอดภัยของระบบทั้งหมด — TR-01 จัด "ข้อมูลรั่วข้ามบริษัท"
 * เป็นความเสี่ยงสูงสุดที่ย้อนกลับไม่ได้
 *
 * หลักการ: ทำให้ "การเขียน query ที่ลืมใส่ scope" เป็นเรื่องที่ทำได้ยาก
 * ในเชิงโครงสร้าง ไม่ใช่เรื่องที่ต้องอาศัยวินัยของคนเขียน
 * (docs/10-backend-architecture.md §6)
 */

import { ForbiddenException } from '@nestjs/common';

import type { ContactKey } from './constants';

/** ตำแหน่งที่เห็น ticket ซึ่งตั้งธงเหตุความปลอดภัยได้ (SOP-10 ข้อ 2) */
const SECURITY_INCIDENT_VIEWERS: ReadonlySet<string> = new Set<ContactKey>([
  'head_of_it',
  'ceo',
  'dpo',
]);

export interface AccessScopeInit {
  userId: number;
  homeCompanyId: number;
  /** ผลรวมของ user_role_scope ทุก role ที่ยังไม่หมดอายุ · ว่าง = {homeCompanyId} */
  companyIds: Iterable<number>;
  permissions: Iterable<string>;
  isSuperAdmin: boolean;
  /** ตำแหน่งในองค์กรที่ผู้ใช้คนนี้ถืออยู่ */
  contactKeys?: Iterable<string>;
}

/** immutable โดยเจตนา — ไม่มีใครแก้ขอบเขตกลางทางได้ */
export class AccessScope {
  readonly userId: number;
  readonly homeCompanyId: number;
  readonly companyIds: ReadonlySet<number>;
  readonly permissions: ReadonlySet<string>;
  readonly isSuperAdmin: boolean;
  readonly contactKeys: ReadonlySet<string>;

  constructor(init: AccessScopeInit) {
    this.userId = init.userId;
    this.homeCompanyId = init.homeCompanyId;
    const ids = new Set(init.companyIds);
    this.companyIds = ids.size > 0 ? ids : new Set([init.homeCompanyId]);
    this.permissions = new Set(init.permissions);
    this.isSuperAdmin = init.isSuperAdmin;
    this.contactKeys = new Set(init.contactKeys ?? []);
    Object.freeze(this);
  }

  // ── permission ──

  has(...codes: string[]): boolean {
    return this.isSuperAdmin || codes.some((c) => this.permissions.has(c));
  }

  require(...codes: string[]): void {
    if (!this.has(...codes)) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'ຄຸນບໍ່ມີສິດດຳເນີນການນີ້',
          details: [],
        },
      });
    }
  }

  // ── ขอบเขตบริษัท ──

  inScope(companyId: number): boolean {
    return this.isSuperAdmin || this.companyIds.has(companyId);
  }

  /**
   * ตัด company_id ที่อยู่นอกขอบเขตทิ้งเงียบ ๆ
   *
   * ตอบ 200 พร้อมผลลัพธ์ว่าง ไม่ใช่ 403 — เพื่อไม่ให้ผู้เรียกเดาได้ว่า
   * บริษัทนั้นมีอยู่จริงหรือมีข้อมูลเท่าไร (US-07 AC-2)
   *
   * @returns เซตว่างสำหรับ super_admin ที่ไม่ระบุตัวกรอง = ไม่จำกัด
   */
  visibleCompanyIds(requested?: readonly number[] | null): ReadonlySet<number> {
    if (this.isSuperAdmin) {
      return new Set(requested ?? []);
    }
    if (!requested || requested.length === 0) {
      return this.companyIds;
    }
    return new Set(requested.filter((id) => this.companyIds.has(id)));
  }

  // ── เหตุความปลอดภัย: ข้อยกเว้นเดียวที่แคบกว่าขอบเขตบริษัท ──

  /** ผู้ที่ถือตำแหน่ง head_of_it / ceo / dpo เห็นได้ทุกใบในขอบเขตของตน */
  get isSecurityIncidentViewer(): boolean {
    if (this.isSuperAdmin) return true;
    for (const k of this.contactKeys) {
      if (SECURITY_INCIDENT_VIEWERS.has(k)) return true;
    }
    return false;
  }

  /**
   * SOP-10 ข้อ 2 บังคับให้จำกัดการมองเห็นเฉพาะผู้เกี่ยวข้อง
   *
   * company_admin และ agent คนอื่นในบริษัทเดียวกัน **ไม่เห็น**
   * เป็นข้อยกเว้นเดียวในระบบที่แคบกว่าขอบเขตบริษัท
   */
  canSeeSecurityIncident(t: {
    requesterId: number;
    assigneeId?: number | null;
    incidentCommanderId?: number | null;
  }): boolean {
    if (this.isSecurityIncidentViewer) return true;
    return (
      this.userId === t.requesterId ||
      this.userId === t.assigneeId ||
      this.userId === t.incidentCommanderId
    );
  }
}
