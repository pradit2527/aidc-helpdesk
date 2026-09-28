/**
 * กติกาของรายงานความมั่นคงปลอดภัยสารสนเทศ (ISO/IEC 27001:2022) — ล้วน ๆ ไม่มี I/O
 *
 * รายงานนี้ต่างจากรายงานผลการให้บริการตรงที่ต้องตอบผู้ตรวจสอบสองคำถามพร้อมกัน
 *   1. ตัวเลขของเดือนนี้เป็นเท่าไร
 *   2. ตัวเลขนั้นมีหลักฐานรองรับหรือไม่ — ข้อไหนที่ระบบยังไม่ได้บันทึก ต้องบอกว่า "ยังไม่มีข้อมูล"
 *      ไม่ใช่รายงานเลข 0 แล้วปล่อยให้เข้าใจว่าเดือนนี้ไม่มีเหตุการณ์
 *
 * ⚠️ ข้อ 2 คือหัวใจ — ผู้ตรวจ ISO ให้น้ำหนักกับ "ทะเบียนช่องว่าง" ที่องค์กรรู้ตัว
 *    มากกว่ารายงานที่ทุกช่องเขียวแต่ไม่มีอะไรรองรับ
 */

/**
 * เกณฑ์ของการควบคุมการเข้าถึง
 *
 * ทั้งสามค่านี้ทีมตั้งเอง ไม่ได้มาจากเอกสาร SLA ที่ควบคุมอยู่ (SLA พูดถึงเวลาแก้เรื่อง ไม่ได้พูดถึงสิทธิ์)
 * แก้ที่นี่ที่เดียว ทั้ง API และหน้าจอเปลี่ยนตาม
 */
export const ACCESS_TARGETS = {
  /** คำขอสิทธิ์ที่ค้างรออนุมัตินานกว่านี้ถือว่าเกินเวลา (A.5.18 ต้องทบทวนสิทธิ์อย่างทันเวลา) */
  approvalPendingDays: 3,
  /** บัญชีที่ไม่ได้เข้าระบบนานกว่านี้ต้องทบทวนว่ายังต้องมีอยู่ไหม (A.5.16) */
  dormantAccountDays: 90,
  /** สิทธิ์ชั่วคราวที่หมดอายุแล้วแต่ยังไม่ถูกถอน — ต้องเป็นศูนย์เสมอ (A.5.18) */
  expiredGrantsAllowed: 0,
} as const;

export type CheckStatus = 'pass' | 'fail' | 'no_data';

export interface SecurityCheck {
  /** รหัสอ้างอิงในรายงาน เช่น SEC-1 */
  code: string;
  /** ข้อควบคุมของ ISO/IEC 27001:2022 ภาคผนวก A ที่ข้อนี้ตอบ */
  control: string;
  title: string;
  status: CheckStatus;
  /** ข้อความสั้นบอกตัวเลขที่ใช้ตัดสิน — หน้าจอแสดงตรง ๆ ไม่ต้องคำนวณซ้ำ */
  detail: string;
}

export type SecurityStatus = 'on_target' | 'at_risk' | 'off_target' | 'no_data';

/**
 * สถานะภาพรวมของเดือน
 *
 *   off_target  ข้อที่ถือเป็นการควบคุมหลักตก — เหตุความปลอดภัยเกินกำหนดแก้ไข
 *               หรือมีสิทธิ์ที่หมดอายุแล้วยังค้างอยู่ในระบบ
 *   at_risk     ข้ออื่นตกอย่างน้อยหนึ่งข้อ
 *   no_data     ไม่มีข้อไหนวัดได้เลย — ห้ามแสดงว่าผ่าน
 */
const CRITICAL_CHECKS = new Set(['SEC-2', 'ACC-1']);

export function securityStatus(checks: readonly SecurityCheck[]): {
  status: SecurityStatus;
  failing: string[];
} {
  const failing = checks.filter((c) => c.status === 'fail').map((c) => c.code);
  const measured = checks.some((c) => c.status !== 'no_data');

  if (failing.some((code) => CRITICAL_CHECKS.has(code))) return { status: 'off_target', failing };
  if (failing.length > 0) return { status: 'at_risk', failing };
  if (!measured) return { status: 'no_data', failing };
  return { status: 'on_target', failing };
}

/**
 * ผลของการวัดหนึ่งข้อ
 *
 * `null` = วัดไม่ได้ (ไม่มีตัวอย่างในเดือนนั้น) ต่างจาก 0 ซึ่งแปลว่าวัดได้และได้ศูนย์
 */
export function check(input: {
  code: string;
  control: string;
  title: string;
  value: number | null;
  /** ผ่านเมื่อค่าที่วัดได้ไม่เกินค่านี้ (ใช้กับ "จำนวนที่ไม่ควรมี") */
  atMost?: number;
  /** ผ่านเมื่อค่าที่วัดได้ไม่น้อยกว่าค่านี้ (ใช้กับเปอร์เซ็นต์) */
  atLeast?: number;
  detail: string;
}): SecurityCheck {
  const { code, control, title, value, atMost, atLeast, detail } = input;
  let status: CheckStatus = 'no_data';
  if (value !== null) {
    if (atMost !== undefined) status = value <= atMost ? 'pass' : 'fail';
    else if (atLeast !== undefined) status = value >= atLeast ? 'pass' : 'fail';
  }
  return { code, control, title, status, detail };
}

/** หนึ่งแถวในทะเบียนช่องว่างของหลักฐาน */
export interface EvidenceGap {
  control: string;
  title: string;
  /** สิ่งที่ระบบยังไม่ได้บันทึก เขียนให้ผู้ตรวจอ่านรู้เรื่องโดยไม่ต้องเปิดโค้ด */
  missing: string;
  /** สิ่งที่ต้องทำเพื่อปิดช่องว่าง */
  action: string;
}

/**
 * ทะเบียนช่องว่างของหลักฐาน — คงที่ตามความสามารถของระบบ ณ วันนี้
 *
 * ทุกแถวตรวจจากโค้ดจริงแล้วว่าไม่มีที่ไหนเขียนข้อมูลลงไป ไม่ใช่การเดา
 * เมื่อใดที่เพิ่มการบันทึกเข้าไป ให้ลบแถวนั้นออกจากที่นี่ที่เดียว
 */
export const EVIDENCE_GAPS: readonly EvidenceGap[] = [
  {
    control: 'A.8.15 · A.8.16',
    title: 'บันทึกการเข้าสู่ระบบ',
    missing: 'ระบบไม่ได้บันทึกการเข้าสู่ระบบสำเร็จ ล้มเหลว หรือออกจากระบบ เป็นรายครั้ง',
    action: 'เพิ่มการเขียน audit เมื่อเข้าสู่ระบบและเมื่อรหัสผ่านผิด พร้อมเลข IP',
  },
  {
    control: 'A.5.16 · A.8.15',
    title: 'บันทึกการเปลี่ยนสิทธิ์',
    missing: 'การสร้างผู้ใช้ เปลี่ยนบทบาท และรีเซ็ตรหัสผ่าน ไม่ได้ลงทะเบียนตรวจสอบ',
    action: 'เขียน audit ที่เส้นทางจัดการผู้ใช้เหมือนที่ทำกับการเปลี่ยนสถานะเรื่อง',
  },
  {
    control: 'A.8.15',
    title: 'ที่มาของการกระทำ',
    missing: 'ทะเบียนตรวจสอบมีช่อง IP และอุปกรณ์ แต่ยังไม่มีการเขียนค่าเลย',
    action: 'ส่ง IP และ user agent จากชั้น HTTP เข้าไปพร้อมทุกรายการ audit',
  },
  {
    control: 'A.5.26',
    title: 'ธงเหตุความปลอดภัยของเรื่อง',
    missing: 'ช่อง is_security_incident ไม่มีเส้นทางใดตั้งค่า รายงานจึงนับจากหมวดหมู่แทน',
    action: 'ตั้งธงอัตโนมัติเมื่อเลือกหมวดกลุ่ม SECURITY และให้ผู้มีสิทธิ์ตั้งเองได้ภายหลัง',
  },
  {
    control: 'A.5.30',
    title: 'ทะเบียนเหตุขัดข้องของบริการ',
    missing: 'ตารางเหตุขัดข้องและช่วงปิดปรับปรุงยังไม่มีเส้นทางบันทึก ตัวเลขความพร้อมใช้งานจึงว่าง',
    action: 'เปิดหน้าบันทึกเหตุขัดข้องให้ทีมไอทีลงเวลาเริ่ม–สิ้นสุดของแต่ละเหตุ',
  },
  {
    control: 'A.5.17',
    title: 'การพิสูจน์ตัวตนสองชั้น',
    missing: 'ระบบยังไม่มีการยืนยันตัวตนสองชั้น และไม่มีที่เก็บสถานะการเปิดใช้',
    action: 'ตัดสินใจเชิงนโยบายก่อนว่าจะบังคับกับบัญชีผู้ดูแลหรือทุกบัญชี',
  },
  {
    control: 'A.8.7',
    title: 'การสแกนไฟล์แนบ',
    missing: 'ไฟล์แนบบันทึกสถานะการสแกนเป็น skipped เสมอ ยังไม่ได้ต่อกับตัวสแกน',
    action: 'ต่อบริการสแกนไวรัสแล้วบันทึกผลลงช่อง scan_status ที่มีอยู่แล้ว',
  },
];

/** เลขที่เอกสารของรายงานฉบับนี้ — ต่างจากรายงานบริการ (SPR) เพื่อไม่ให้ชนกันในทะเบียนเอกสาร */
export const SECURITY_REPORT_PREFIX = 'ISR';
