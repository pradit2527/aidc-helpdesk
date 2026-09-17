/**
 * โครงการสนับสนุนตั้งต้นของ AIDC Support Hub
 *
 * หนึ่งเว็บแอปของกลุ่ม = หนึ่ง inbox ชนิด Website ใน Chatwoot = หนึ่งแถวที่นี่
 *
 * ⚠️ ทุกระบบที่กลุ่มมีถูกลงทะเบียนไว้ล่วงหน้าทั้งหมด แต่ **ปิดไว้ทุกตัว** ยกเว้น DEMO
 *    เจ้าของระบบยืนยันว่า ILP เป็นเว็บนำร่อง แต่ยังไม่ให้เปิดใช้
 *    — เปิดจากหน้าผู้ดูแลเมื่อพร้อม ไม่ต้องแก้โค้ดและไม่ต้องรัน CLI ซ้ำ
 *
 * ⚠️ CLI ที่อ่านไฟล์นี้จะไม่แตะ is_active และการผูก inbox ของแถวที่มีอยู่แล้วเด็ดขาด
 *    ผู้ดูแลที่เปิดหรือผูก inbox ผ่านหน้าจอไปแล้ว ต้องไม่ถูกสคริปต์ย้อนกลับให้
 */

export interface SupportProjectSeed {
  /** ตัวพิมพ์ใหญ่ ตัวเลข และ _ — สคริปต์ฝังในหน้าเว็บใช้ค่านี้เรียกหาตัวเอง */
  readonly code: string;
  readonly name: string;
  /** null = โครงการส่วนกลาง ใช้ร่วมทั้งกลุ่ม */
  readonly companyCode: string | null;
  /** รหัสหมวดหมู่ ticket ที่จะเป็นค่าตั้งต้น — null = ยังไม่มีหมวดหมู่ที่ตรงกัน */
  readonly defaultCategoryCode: string | null;
  readonly teamCode: string | null;
  readonly locale: 'lo' | 'th' | 'en';
  /**
   * false = ลงทะเบียนไว้เฉย ๆ ยังไม่เปิดใช้
   *
   * โครงการที่ปิดอยู่จะไม่ถูกไล่ในรอบค้นหาบทสนทนา และ
   * GET /public/support-projects/{code} ตอบ 404 เหมือนไม่มีรหัสนั้นอยู่
   */
  readonly isActive: boolean;
}

export const SUPPORT_PROJECTS: readonly SupportProjectSeed[] = [
  /*
   * ตัวเดียวที่เปิดใช้งาน — ใช้ทดสอบเส้นทางทั้งหมดจริงโดยไม่แตะเว็บที่ลูกค้าใช้อยู่
   * ไม่มีหมวดหมู่ตั้งต้น เพราะเรื่องที่เข้ามาทางนี้เป็นการทดสอบ ไม่ใช่งานจริง
   */
  {
    code: 'DEMO',
    name: 'ເວັບສາທິດ (ທົດສອບ)',
    companyCode: null,
    defaultCategoryCode: null,
    teamCode: 'it-helpdesk',
    locale: 'lo',
    isActive: true,
  },

  // ── ระบบจริงของกลุ่ม — ลงทะเบียนไว้ก่อน เปิดทีหลังจากหน้าผู้ดูแล ──
  {
    code: 'ILP',
    name: 'ILP',
    companyCode: null,
    defaultCategoryCode: 'ILP',
    teamCode: 'it-helpdesk',
    locale: 'lo',
    isActive: false,
  },
  {
    code: 'I_OFFICE_PLUS',
    name: 'I Office Plus',
    companyCode: null,
    defaultCategoryCode: 'I_OFFICE_PLUS',
    teamCode: 'it-helpdesk',
    locale: 'lo',
    isActive: false,
  },
  {
    code: 'APS',
    name: 'APS',
    companyCode: null,
    defaultCategoryCode: 'APS',
    teamCode: 'it-helpdesk',
    locale: 'lo',
    isActive: false,
  },
  {
    code: 'CMS',
    name: 'CMS',
    companyCode: null,
    defaultCategoryCode: 'CMS',
    teamCode: 'it-helpdesk',
    locale: 'lo',
    isActive: false,
  },
  {
    code: 'CMS_PLUS',
    name: 'CMS+',
    companyCode: null,
    defaultCategoryCode: 'CMS_PLUS',
    teamCode: 'it-helpdesk',
    locale: 'lo',
    isActive: false,
  },

  /*
   * ตระกูล Magic — data/catalog.ts มีหมวดหมู่รวมชื่อ MAGIC เพียงหมวดเดียว
   * ยังไม่มีหมวดหมู่แยกรายผลิตภัณฑ์ จึงเว้น default_category_id ไว้เป็น null
   * ไม่ชี้ไปที่ MAGIC รวม เพราะจะทำให้เรื่องของสี่ระบบกองรวมกันจนแยกรายงานไม่ออก
   * เมื่อเพิ่มหมวดหมู่ MAGIC_* ใน catalog.ts แล้ว ให้เติมรหัสที่นี่แล้วรัน CLI ซ้ำ
   * (CLI เติมหมวดหมู่ให้เฉพาะแถวที่ยังเป็น null จึงไม่ทับของที่ผู้ดูแลตั้งเอง)
   */
  {
    code: 'MAGIC_AUDIT',
    name: 'Magic-Audit',
    companyCode: null,
    defaultCategoryCode: null,
    teamCode: 'it-helpdesk',
    locale: 'lo',
    isActive: false,
  },
  {
    code: 'MAGIC_ACCOUNT',
    name: 'Magic-Account',
    companyCode: null,
    defaultCategoryCode: null,
    teamCode: 'it-helpdesk',
    locale: 'lo',
    isActive: false,
  },
  {
    code: 'MAGIC_FINANCE',
    name: 'Magic-Finance',
    companyCode: null,
    defaultCategoryCode: null,
    teamCode: 'it-helpdesk',
    locale: 'lo',
    isActive: false,
  },
  {
    code: 'MAGIC_ASSET',
    name: 'Magic-Asset',
    companyCode: null,
    defaultCategoryCode: null,
    teamCode: 'it-helpdesk',
    locale: 'lo',
    isActive: false,
  },
];
