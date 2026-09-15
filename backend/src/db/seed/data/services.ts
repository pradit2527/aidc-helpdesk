/**
 * ทะเบียนบริการ (Service Catalogue ตาม ISO/IEC 20000-1 ข้อ 8.2.4)
 *
 * ผู้แจ้งเลือกระบบที่เกี่ยวข้องตอนเปิด Ticket และเป็นตัวตั้งของ KPI-6 Uptime
 * ชื่อเป็นชื่อผลิตภัณฑ์ ไม่แปล — ตรงกับหมวดหมู่ระบบงานใน TICKET_CATEGORIES
 *
 * ⚠️ ระดับบริการตั้งเป็น standard ไว้ก่อนทุกระบบ — เป้าหมาย Uptime และลำดับงาน
 *    ขึ้นกับระดับนี้ ผู้ดูแลต้องทบทวนและปรับเป็น high / critical เองในหน้า ຕັ້ງຄ່າ › ບໍລິການ
 *    seed จึงเพิ่มเฉพาะที่ยังไม่มี ไม่เขียนทับค่าที่ผู้ดูแลแก้ไว้แล้ว
 */

export interface ServiceSeed {
  readonly code: string;
  readonly nameTh: string;
  readonly serviceGroup: 'core_business' | 'infrastructure' | 'communication' | 'file_storage' | 'endpoint' | 'service_request';
  readonly serviceTier: 'critical' | 'high' | 'standard';
  readonly is24x7?: boolean;
}

export const SERVICES: readonly ServiceSeed[] = [
  { code: 'ILP', nameTh: 'ILP', serviceGroup: 'core_business', serviceTier: 'standard' },
  { code: 'I_OFFICE_PLUS', nameTh: 'I Office Plus', serviceGroup: 'core_business', serviceTier: 'standard' },
  { code: 'APS', nameTh: 'APS', serviceGroup: 'core_business', serviceTier: 'standard' },
  { code: 'CMS', nameTh: 'CMS', serviceGroup: 'core_business', serviceTier: 'standard' },
  { code: 'CMS_PLUS', nameTh: 'CMS+', serviceGroup: 'core_business', serviceTier: 'standard' },
  { code: 'MAGIC', nameTh: 'Magic', serviceGroup: 'core_business', serviceTier: 'standard' },
  { code: 'SUPER_WORK', nameTh: 'Super Work', serviceGroup: 'core_business', serviceTier: 'standard' },
];
