/**
 * ทีมสนับสนุนตั้งต้น — ทีม IT Helpdesk ของกลุ่ม AIDC
 *
 * ⚠️ ชื่อผู้ใช้และชื่อจริงในไฟล์นี้เป็น "ค่าตั้งต้นที่เจ้าของระบบจะแก้เอง"
 *    เจ้าของให้มาเป็นชื่อเล่น (กอล์ฟ อานน ปาร์ค อเล็ก บอส) ยังไม่ใช่ชื่อในทะเบียนพนักงาน
 *    เมื่อได้ชื่อจริงแล้วให้แก้ที่ไฟล์นี้แล้วรัน CLI ใหม่ หรือแก้ผ่านหน้าจัดการผู้ใช้
 *    — ห้ามเปลี่ยน username ของบัญชีที่ใช้งานไปแล้ว เพราะ audit_log อ้างถึงมันอยู่
 *
 * ⚠️ อีเมลเว้นว่างไว้โดยตั้งใจ ไม่เดาจากชื่อผู้ใช้
 *    อีเมลที่เดาไว้แล้วผิดจะทำให้การแจ้งเตือนวิ่งไปหาที่อยู่ที่ไม่มีอยู่จริงเงียบ ๆ
 *    เจ้าของกรอกเองผ่านหน้าจัดการผู้ใช้หลังสร้างบัญชีแล้ว
 */

/** บทบาทที่ CLI สร้างให้ได้ — ต้องตรงกับ code ใน data/permissions.ts */
export type SeedRoleCode = 'support_lead' | 'support_agent' | 'super_admin';

export interface SupportTeamMemberSeed {
  /** ชื่อผู้ใช้สำหรับเข้าสู่ระบบ — ตัวพิมพ์เล็ก a-z 0-9 . _ - */
  readonly username: string;
  readonly fullName: string;
  readonly jobTitle: string;
  readonly roleCode: SeedRoleCode;
  /** หัวหน้าทีม — มอบหมายงานให้สมาชิกในทีมนี้ได้ */
  readonly isLead: boolean;
}

export interface SupportTeamSeed {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  /** null = ทีมส่วนกลาง ดูแลทุกบริษัทในกลุ่ม */
  readonly companyCode: string | null;
  readonly members: readonly SupportTeamMemberSeed[];
}

/**
 * บริษัทต้นสังกัดของบัญชีที่ CLI สร้าง — ใช้บริษัทแรกถ้าไม่มีรหัสนี้
 * (ตรงกับ OWNER_COMPANY_CODE ใน data/organization.ts)
 */
export const TEAM_HOME_COMPANY_CODE = 'AIDC-TECH';

export const SUPPORT_TEAMS: readonly SupportTeamSeed[] = [
  {
    code: 'it-helpdesk',
    name: 'ທີມ IT Helpdesk',
    description: 'ທີມສ່ວນກາງ ດູແລເລື່ອງແຈ້ງຂອງທຸກບໍລິສັດໃນກຸ່ມ',
    // ส่วนกลาง เพราะทีมนี้รับเรื่องของทุกบริษัทในกลุ่ม ไม่ได้ผูกกับบริษัทเดียว
    companyCode: null,
    members: [
      {
        username: 'it.golf',
        fullName: 'ກ໋ອຟ',
        jobTitle: 'ຫົວໜ້າທີມ IT Helpdesk',
        /*
         * ⚠️ เจ้าของสั่งให้กอล์ฟมีสิทธิ์เท่าผู้ดูแลระบบ
         *
         * super_admin เห็นทุกบริษัท ทุกเรื่อง รวมถึงเหตุความปลอดภัย (SOP-10)
         * และไม่มีขอบเขตบริษัทจำกัด — กว้างกว่าที่หัวหน้าทีมต้องใช้มาก
         * ถ้าวันหนึ่งต้องการแค่ "มอบหมายงานให้ลูกทีมได้" เปลี่ยนเป็น support_lead
         * ได้เลย (ต้องเป็น is_lead ของทีมด้วย — บทบาทให้อำนาจ ส่วน is_lead บอกว่าหัวหน้าของทีมไหน)
         */
        roleCode: 'super_admin',
        isLead: true,
      },
      {
        /*
         * บัญชีหัวหน้าทีมตัวอย่างสำหรับบทบาท support_lead — ชื่อผู้ใช้เจ้าของระบบกำหนดเอง
         *
         * ต่างจากกอล์ฟที่เป็น super_admin: บัญชีนี้ได้เฉพาะสิทธิ์หัวหน้าทีม Helpdesk
         * (รับงานเอง + มอบหมายให้สมาชิกในทีมนี้) ไม่มีสิทธิ์ผู้ดูแลระบบ จึงใช้ดูว่า
         * "หัวหน้าทีมทั่วไป" เห็นและทำอะไรได้บ้างโดยไม่มีอำนาจผู้ดูแลมาปน
         * ชื่อจริงยังไม่ทราบ — แก้ผ่านหน้าจัดการผู้ใช้ได้ (อย่าเปลี่ยน username ตอนใช้งานแล้ว)
         */
        username: 'support_lead',
        fullName: 'Support Lead',
        jobTitle: 'ຫົວໜ້າທີມ Helpdesk',
        roleCode: 'support_lead',
        isLead: true,
      },
      {
        username: 'it.anon',
        fullName: 'ອານົນ',
        jobTitle: 'ເຈົ້າໜ້າທີ່ IT Support',
        roleCode: 'support_agent',
        isLead: false,
      },
      {
        username: 'it.park',
        fullName: 'ປາກ',
        jobTitle: 'ເຈົ້າໜ້າທີ່ IT Support',
        roleCode: 'support_agent',
        isLead: false,
      },
      {
        username: 'it.alex',
        fullName: 'ອາເລັກ',
        jobTitle: 'ເຈົ້າໜ້າທີ່ IT Support',
        roleCode: 'support_agent',
        isLead: false,
      },
      {
        username: 'it.boss',
        fullName: 'ບອສ',
        jobTitle: 'ເຈົ້າໜ້າທີ່ IT Support',
        roleCode: 'support_agent',
        isLead: false,
      },
    ],
  },
];

/**
 * ชื่อตัวแปรสภาพแวดล้อมที่เก็บรหัสผ่านตั้งต้นของบัญชีหนึ่ง
 *
 *   it.golf → SEED_TEAM_PASSWORD_IT_GOLF
 *
 * แยกคนละตัวแปรเพราะระบบนี้ยังไม่มีหน้าเปลี่ยนรหัสผ่านให้ผู้ใช้ทำเอง
 * รหัสผ่านร่วมกันทั้งทีมจึงเท่ากับทุกคนเข้าบัญชีของกันและกันได้ตลอดไป
 * — และบัญชีหนึ่งในนั้นเป็น super_admin
 */
export function passwordEnvName(username: string): string {
  return `SEED_TEAM_PASSWORD_${username.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}
