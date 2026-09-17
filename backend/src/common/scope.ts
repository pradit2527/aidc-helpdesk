import { ForbiddenError } from './errors/domain-error';
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
  /**
   * รหัสบทบาทที่ถืออยู่
   *
   * แยกจาก permissions เพราะใช้คนละงาน — permissions ตอบว่า "ทำอะไรได้"
   * ส่วน roles ตอบว่า "เป็นใคร" ซึ่ง frontend ใช้เลือกเมนูและหน้าแรก
   */
  roleCodes?: Iterable<string>;

  /**
   * ทีมสนับสนุนที่ผู้ใช้คนนี้สังกัด — เฉพาะทีมที่ยังเปิดใช้งาน
   *
   * อ่านมาพร้อมกับสิทธิ์ในคิวรีชุดเดียวกัน แล้วจำไว้ใน ScopeService
   * ตัวตัดสิน "มอบหมายให้คนอื่นได้ไหม" จึงไม่ต้องยิงฐานข้อมูลเพิ่มต่อคำขอ
   */
  teams?: Iterable<TeamMembership>;
}

/** ทีมหนึ่งทีมที่ผู้ใช้สังกัด พร้อมว่าเป็นหัวหน้าหรือไม่ */
export interface TeamMembership {
  id: number;
  name: string;
  isLead: boolean;
}

/** immutable โดยเจตนา — ไม่มีใครแก้ขอบเขตกลางทางได้ */
export class AccessScope {
  readonly userId: number;
  readonly homeCompanyId: number;
  readonly companyIds: ReadonlySet<number>;
  readonly permissions: ReadonlySet<string>;
  readonly isSuperAdmin: boolean;
  readonly contactKeys: ReadonlySet<string>;
  readonly roleCodes: ReadonlySet<string>;
  /** ทีมที่สังกัด (รวมทีมที่เป็นหัวหน้า) — เฉพาะทีมที่ยังเปิดใช้งาน */
  readonly teams: readonly TeamMembership[];
  readonly teamIds: ReadonlySet<number>;
  /** ทีมที่เป็น "หัวหน้า" — ตัวตั้งของอำนาจมอบหมายงานให้คนอื่น */
  readonly ledTeamIds: ReadonlySet<number>;

  constructor(init: AccessScopeInit) {
    this.userId = init.userId;
    this.homeCompanyId = init.homeCompanyId;
    const ids = new Set(init.companyIds);
    this.companyIds = ids.size > 0 ? ids : new Set([init.homeCompanyId]);
    this.permissions = new Set(init.permissions);
    this.isSuperAdmin = init.isSuperAdmin;
    this.contactKeys = new Set(init.contactKeys ?? []);
    this.roleCodes = new Set(init.roleCodes ?? []);
    const teams = [...(init.teams ?? [])];
    this.teams = Object.freeze(teams);
    this.teamIds = new Set(teams.map((t) => t.id));
    this.ledTeamIds = new Set(teams.filter((t) => t.isLead).map((t) => t.id));
    Object.freeze(this);
  }

  // ── ทีมสนับสนุน ──

  /** ทีมที่เป็นหัวหน้า เรียงตามชื่อ — ใช้ตอบ GET /auth/me */
  get ledTeams(): readonly TeamMembership[] {
    return this.teams.filter((t) => t.isLead);
  }

  /**
   * เป็น "ระดับผู้ดูแล" หรือไม่ — มอบหมายให้ใครก็ได้ที่รับเรื่องนั้นได้
   *
   * ใช้ user.assign_role เป็นเกณฑ์ ไม่ใช่ชื่อบทบาท เพราะหน้าจัดการสิทธิ์
   * แก้ได้ว่าบทบาทไหนถืออะไร — ผูกกับชื่อ company_admin ตรง ๆ แล้ววันหนึ่ง
   * จะมีบทบาทใหม่ที่มอบบทบาทได้แต่มอบหมายงานให้คนนอกทีมไม่ได้
   */
  get isAdminLevel(): boolean {
    return this.has('user.assign_role');
  }

  /** เป็นหัวหน้าอย่างน้อยหนึ่งทีมที่ยังเปิดใช้งาน */
  get isTeamLead(): boolean {
    return this.ledTeamIds.size > 0;
  }

  // ── permission ──

  has(...codes: string[]): boolean {
    return this.isSuperAdmin || codes.some((c) => this.permissions.has(c));
  }

  require(...codes: string[]): void {
    if (!this.has(...codes)) {
      /*
       * โยน ForbiddenError ไม่ใช่ ForbiddenException ของ NestJS
       *
       * AccessScope ถูกใช้ทั้งจาก controller และจากงาน background
       * ถ้าโยน exception ของ HTTP ออกมา ชั้นที่ไม่เกี่ยวกับ HTTP จะต้องรู้จัก
       * @nestjs/common ไปด้วย และการเทสต์กฎสิทธิ์ข้อเดียวจะต้องบูต Nest ขึ้นมาทั้งตัว
       * AllExceptionsFilter แปลงเป็น 403 ให้เองอยู่แล้ว
       */
      throw new ForbiddenError('FORBIDDEN', 'ທ່ານບໍ່ມີສິດດຳເນີນການນີ້', {
        required: codes,
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
