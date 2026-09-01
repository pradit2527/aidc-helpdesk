/**
 * บริษัทในกลุ่ม AIDC และแผนกตัวอย่าง
 * รายชื่อบริษัทมาจาก docs/01-srs.md §1.4
 *
 * 🟡 โครงสร้างแผนกจริงยังไม่ได้รับจาก PM (A-15 / PM-07)
 * ที่ใส่ไว้เป็นชุดตัวอย่างเพื่อให้ระบบทดสอบได้ ต้องเปลี่ยนก่อน go-live
 */

export interface CompanySeed {
  readonly code: string;
  readonly nameTh: string;
  readonly nameEn: string;
  readonly contactEmail: string;
  readonly departments: readonly string[];
}

/** แผนกชุดกลางที่ทุกบริษัทมีเหมือนกัน */
const COMMON_DEPARTMENTS = ['ບໍລິຫານ', 'ບັນຊີ ແລະ ການເງິນ', 'ບຸກຄະລາກອນ', 'ໄອທີ'];

export const COMPANIES: readonly CompanySeed[] = [
  {
    code: 'AIDC-HQ',
    nameTh: 'AIDC HQ',
    nameEn: 'AIDC HQ',
    contactEmail: 'itsupport@aidctech.com.la',
    departments: [...COMMON_DEPARTMENTS, 'ຈັດຊື້'],
  },
  {
    code: 'AIDC-CON',
    nameTh: 'AIDC Construction',
    nameEn: 'AIDC Construction',
    contactEmail: 'itsupport@aidctech.com.la',
    departments: [...COMMON_DEPARTMENTS, 'ໜ້າວຽກກໍ່ສ້າງ', 'ຄວາມປອດໄພ'],
  },
  {
    code: 'COSI',
    nameTh: 'COSI',
    nameEn: 'COSI',
    contactEmail: 'itsupport@aidctech.com.la',
    departments: [...COMMON_DEPARTMENTS, 'ອອກແບບ'],
  },
  {
    code: 'AIDC-HM',
    nameTh: 'Heavy Machine',
    nameEn: 'AIDC Heavy Machine',
    contactEmail: 'itsupport@aidctech.com.la',
    departments: [...COMMON_DEPARTMENTS, 'ສູນສ້ອມແປງ', 'ອາໄຫຼ່'],
  },
  {
    code: 'AIDC-TECH',
    nameTh: 'AIDC Tech',
    nameEn: 'AIDC Tech',
    contactEmail: 'itsupport@aidctech.com.la',
    departments: [...COMMON_DEPARTMENTS, 'ພັດທະນາລະບົບ', 'ໂຄງສ້າງພື້ນຖານ'],
  },
  {
    code: 'AIDC-TRD',
    nameTh: 'AIDC Trading',
    nameEn: 'AIDC Trading',
    contactEmail: 'itsupport@aidctech.com.la',
    departments: [...COMMON_DEPARTMENTS, 'ຂາຍ'],
  },
  {
    code: 'AIDC-LOG',
    nameTh: 'AIDC Logistic',
    nameEn: 'AIDC Logistic',
    contactEmail: 'itsupport@aidctech.com.la',
    departments: [...COMMON_DEPARTMENTS, 'ຄັງສິນຄ້າ', 'ຂົນສົ່ງ'],
  },
];

/**
 * บริษัทเจ้าของเอกสาร SLA ที่ทั้งกลุ่มยึดถือ
 * ใช้เป็นค่าตั้งต้นของบัญชี super_admin
 */
export const OWNER_COMPANY_CODE = 'AIDC-TECH';
