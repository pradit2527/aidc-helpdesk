/**
 * หมวดหมู่เรื่องแจ้ง · แค็ตตาล็อกคำขอบริการ · checklist ตาม SOP
 *
 * เป้าหมายรายรายการของคำขอบริการมาจาก SLA 5.3 ซึ่งเป็นคนละชุดกับตาราง SLA
 * มาตรฐาน — คำขอบริการไม่ใช้ resolution ของ P4 (2,700 นาที) มาวัด
 * แต่ response_due_at ยังใช้ตารางมาตรฐานเสมอ
 */

export interface TicketCategorySeed {
  readonly code: string;
  readonly nameTh: string;
  readonly defaultImpact: 'org_wide' | 'department' | 'individual';
  readonly defaultUrgency: 'high' | 'medium' | 'low';
  readonly sortOrder: number;
  /**
   * false = ยังอยู่ในฐานข้อมูลแต่ไม่ให้เลือกตอนแจ้งเรื่องใหม่
   *
   * ⚠️ หมวดที่เคยมี ticket ผูกอยู่ต้องปิดแบบนี้ ห้ามลบทิ้ง
   *    ticket เก่าอ้างถึง category_id อยู่ ถ้าลบแถวไป ประวัติจะชี้ไปที่
   *    ความว่างเปล่า และรายงานย้อนหลังจะนับหมวดนั้นไม่ได้อีกเลย
   */
  readonly isActive?: boolean;
  /**
   * หมวดนี้ใช้แจ้งเรื่องชนิดไหนได้ — ไม่ระบุ = `both`
   *
   * กติกาที่ใช้ตัดสินทุกแถวในไฟล์นี้ (จาก SA)
   *   incident        = สัญญาณว่าของที่ควรใช้ได้ กลับใช้ไม่ได้ —
   *                     พัง / ขึ้น error / ต่อไม่ติด / ช้า / ล่ม / ไวรัส / เหตุความปลอดภัย
   *   service_request = ขอให้ไอทีทำ จัดหา หรือเปลี่ยนอะไรบางอย่าง โดยไม่มีอะไรเสีย
   *   both            = กำกวมจริง ๆ — ทุกแถวที่เป็น both เพราะกำกวม
   *                     มีคอมเมนต์กำกับไว้ให้ SA ทบทวน
   */
  readonly ticketTypeScope?: 'incident' | 'service_request' | 'both';
}

/**
 * ค่า default_impact / default_urgency เป็นเพียงค่าตั้งต้นที่ระบบเติมให้
 * ผู้แจ้งแก้ได้ และระบบคำนวณ priority จากสองค่านี้เสมอ (SLA ข้อ 4)
 * ผู้แจ้งไม่เคยเลือก priority โดยตรง
 */
export const TICKET_CATEGORIES: readonly TicketCategorySeed[] = [
  /*
   * ── หมวดของเหตุขัดข้อง (incident) — จัดตามกลุ่มบริการของ SLA ข้อ 6.2 ──
   *   infrastructure → communication → file_storage → endpoint (อุปกรณ์ + ซอฟต์แวร์) → ความปลอดภัย
   *   ระบบงานหลักของกลุ่ม (core_business) อยู่ท้ายรายการ เพราะแจ้งแยกตามชื่อระบบ
   *
   * ── หมวดของคำขอบริการ (service_request) — จัดตามแค็ตตาล็อก SLA ข้อ 5.3 และ SOP-03 ถึง SOP-07 ──
   *
   * แหล่งอ้างอิง: AIDC-IT-SLA-001 · AIDC-IT-SOP-001 · SOP-6-2025 (Security Incident Management)
   *
   * ⚠️ ห้ามลบหรือเปลี่ยน code ของแถวที่มี ticket ผูกอยู่ — ย้ายหมวดย่อยข้ามหมวดหลัก (เปลี่ยน parentCode)
   *    ได้ เพราะ ticket ผูกกับ id ของหมวดย่อย ไม่ใช่กับหมวดหลัก
   */
  // SLA 6.2 กลุ่ม infrastructure (tier critical · 24×7)
  { code: 'NETWORK', nameTh: 'ໂຄງສ້າງພື້ນຖານ (ເຄືອຂ່າຍ · ອິນເຕີເນັດ · ການຢືນຢັນຕົວຕົນ)', defaultImpact: 'department', defaultUrgency: 'high', sortOrder: 10, ticketTypeScope: 'incident' },
  // SLA 6.2 กลุ่ม communication (tier high)
  { code: 'COMMUNICATION', nameTh: 'ລະບົບສື່ສານອົງກອນ (ອີເມວ · ປະຊຸມອອນລາຍ · Wi-Fi · VPN)', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 20, ticketTypeScope: 'incident' },
  // SLA 6.2 กลุ่ม file_storage (tier high)
  { code: 'FILE_STORAGE', nameTh: 'ພື້ນທີ່ເກັບໄຟລ໌ສ່ວນກາງ (File Server · Cloud Storage)', defaultImpact: 'department', defaultUrgency: 'high', sortOrder: 30, ticketTypeScope: 'incident' },
  // SLA 6.2 กลุ่ม endpoint (tier standard)
  { code: 'HARDWARE', nameTh: 'ອຸປະກອນຜູ້ໃຊ້ (ຄອມພິວເຕີ · ເຄື່ອງພິມ · ອຸປະກອນຕໍ່ພ່ວງ)', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 40, ticketTypeScope: 'incident' },
  // SLA 6.2 กลุ่ม endpoint — โปรแกรมสำนักงานผิดพลาดเป็นตัวอย่าง P3 ของ SLA 5.2
  { code: 'SOFTWARE', nameTh: 'ຊອບແວ ແລະ ແອັບພລິເຄຊັນ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 50, ticketTypeScope: 'incident' },
  // SOP-6-2025 (SOP-09/2025-ATECH) และ AIDC-IT-SOP-001 SOP-10
  { code: 'SECURITY', nameTh: 'ເຫດການຄວາມປອດໄພຂໍ້ມູນ (Security Incident)', defaultImpact: 'org_wide', defaultUrgency: 'high', sortOrder: 60, ticketTypeScope: 'incident' },
  // SOP-03 ขอสิทธิ์ · นโยบาย 3.2 รหัสผ่าน · 3.3 การควบคุมการเข้าถึง
  { code: 'ACCESS', nameTh: 'ບັນຊີ ແລະ ສິດເຂົ້າເຖິງ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 70, ticketTypeScope: 'service_request' },
  // SOP-04 พนักงานใหม่ · SOP-05 พนักงานพ้นสภาพ
  { code: 'LIFECYCLE', nameTh: 'ພະນັກງານເຂົ້າ – ອອກ (Onboarding / Offboarding)', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 80, ticketTypeScope: 'service_request' },
  // SOP-06 ติดตั้งซอฟต์แวร์ · นโยบาย 3.5 และ 3.1 (เครื่องมือ AI ต้องได้รับอนุมัติ)
  { code: 'SR_SOFTWARE', nameTh: 'ຊອບແວ ແລະ ເຄື່ອງມື AI', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 85, ticketTypeScope: 'service_request' },
  // SLA 5.3 จัดหาอุปกรณ์ · นโยบาย 3.9 ทรัพย์สินไอที
  { code: 'SR_EQUIPMENT', nameTh: 'ອຸປະກອນ ແລະ ການຕິດຕັ້ງ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 90, ticketTypeScope: 'service_request' },
  // SOP-07 กู้คืนข้อมูล · นโยบาย 3.10 ขอยกเว้นนโยบาย
  { code: 'SR_DATA', nameTh: 'ຂໍ້ມູນ ແລະ ນະໂຍບາຍ (Backup · Policy Exception)', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 95, ticketTypeScope: 'service_request' },
  // SLA 2.1 / 4 (P4) — ขอคำปรึกษา สอบถามการใช้งาน
  { code: 'SR_ADVISORY', nameTh: 'ຄຳປຶກສາ / ສອບຖາມການໃຊ້ງານ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 100, ticketTypeScope: 'service_request' },

  // ปิดใช้งานตามที่องค์กรแจ้ง — ไม่ลบเพราะยังมี ticket เก่าผูกอยู่
  // both เพราะปิดไปแล้ว ไม่มีใครเลือกได้ การไปตัดสินขอบเขตให้มันไม่มีผลกับอะไรเลย
  { code: 'ERP', nameTh: 'ລະບົບ ERP', defaultImpact: 'department', defaultUrgency: 'high', sortOrder: 40, isActive: false, ticketTypeScope: 'both' },

  /*
   * หมวดหลักเดิมที่เลิกใช้ — หมวดย่อยทั้งหมดถูกย้ายไปอยู่ใต้หมวดหลักที่ตรงกับ SLA แล้ว
   * (EMAIL → COMMUNICATION / ACCESS · PRINTER → HARDWARE / SR_EQUIPMENT · CCTV และ MOBILE → HARDWARE /
   *  SR_EQUIPMENT · AI_TOOLS → SOFTWARE / SR_SOFTWARE) เหลือไว้เพื่อประวัติ ticket เก่าเท่านั้น
   */
  { code: 'EMAIL', nameTh: 'ອີເມວ ແລະ ບັນຊີຜູ້ໃຊ້', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 50, isActive: false, ticketTypeScope: 'both' },
  { code: 'PRINTER', nameTh: 'ເຄື່ອງພິມ ແລະ ເຄື່ອງສະແກນ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 60, isActive: false, ticketTypeScope: 'both' },
  { code: 'CCTV', nameTh: 'ກ້ອງວົງຈອນປິດ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 90, isActive: false, ticketTypeScope: 'both' },
  { code: 'MOBILE', nameTh: 'ໂທລະສັບ ແລະ ອຸປະກອນເຄື່ອນທີ່', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 100, isActive: false, ticketTypeScope: 'both' },
  { code: 'AI_TOOLS', nameTh: 'ຂໍສິດໃຊ້ເຄື່ອງມື AI', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 110, isActive: false, ticketTypeScope: 'both' },

  // ── ระบบงานของกลุ่มบริษัท (SLA 6.2 กลุ่ม core_business) — ไม่แตะ ──
  // ชื่อผลิตภัณฑ์ ไม่แปล — ทีมเรียกทับศัพท์อยู่แล้วทั้งลาวและไทย
  { code: 'SUPER_WORK', nameTh: 'Super Work', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 120, ticketTypeScope: 'both' },

  /*
   * ระบบงานของกลุ่มบริษัท — ห้าหมวดนี้ "ไม่มีหมวดย่อยเลย" เลือกเป็นปลายทางได้เลย
   * ชื่อหมวดเป็นชื่อระบบเปล่า ๆ เรื่องที่แจ้งเข้ามาจึงเป็นได้ทั้งสองชนิด → both ทุกตัว
   */
  { code: 'ILP', nameTh: 'ILP', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 130, ticketTypeScope: 'both' },
  { code: 'I_OFFICE_PLUS', nameTh: 'I Office Plus', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 140, ticketTypeScope: 'both' },
  { code: 'APS', nameTh: 'APS', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 150, ticketTypeScope: 'both' },
  { code: 'CMS', nameTh: 'CMS', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 160, ticketTypeScope: 'both' },
  { code: 'CMS_PLUS', nameTh: 'CMS+', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 170, ticketTypeScope: 'both' },

  { code: 'MAGIC', nameTh: 'Magic', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 180, ticketTypeScope: 'both' },
  // ปลายทางของ "อื่น ๆ (ລະບຸເອງ)" ทั้งสองสาย — ต้องเป็น both เสมอ
  { code: 'OTHER', nameTh: 'ອື່ນ ໆ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 999, ticketTypeScope: 'both' },
];

export interface TicketSubcategorySeed extends TicketCategorySeed {
  /** code ของหมวดหลักใน TICKET_CATEGORIES — ต้นไม้มีสองชั้นเท่านั้น */
  readonly parentCode: string;
}

/**
 * หมวดย่อย — ผู้แจ้งเลือกหมวดหลักก่อน แล้วรายการนี้เปลี่ยนตามหมวดที่เลือก
 *
 * ค่าตั้งต้นผลกระทบ/ความเร่งด่วนตั้งรายหมวดย่อยโดยตั้งใจ — หมวดหลักเดียวกันมีเรื่องที่หนักเบา
 * ต่างกันมาก เช่น "อินเทอร์เน็ตล่มทั้งสำนักงาน" กับ "สาย LAN เครื่องเดียว" ถ้าใช้ค่าของหมวดหลัก
 * ระดับความสำคัญที่ระบบคำนวณจะผิดตั้งแต่ก่อนผู้แจ้งแก้
 *
 * ⚠️ หมวดหลักที่มีหมวดย่อยที่เปิดใช้ ใช้แจ้งเรื่องใหม่ตรง ๆ ไม่ได้ (backend ตอบ 422)
 *    หมวดที่ไม่มีหมวดย่อย (เช่น OTHER) ยังเลือกเป็นปลายทางได้ตามเดิม
 *    ticket เก่าที่ผูกหมวดหลักไว้ไม่ถูกย้าย — ประวัติต้องคงเดิม
 */
export const TICKET_SUBCATEGORIES: readonly TicketSubcategorySeed[] = [
  // SLA 5.2 ตัวอย่าง P1: "เครือข่ายทั้งสำนักงานใช้ไม่ได้" → ทั้งองค์กร × เร่งด่วนมาก = P1
  { parentCode: 'NETWORK', code: 'NETWORK_OUTAGE', nameTh: 'ເຄືອຂ່າຍ ຫຼື ອິນເຕີເນັດໃຊ້ບໍ່ໄດ້ທັງຫ້ອງການ', defaultImpact: 'org_wide', defaultUrgency: 'high', sortOrder: 10, ticketTypeScope: 'incident' },
  // SLA 6.1 ระบบยืนยันตัวตนอยู่ tier critical เดียวกับเครือข่ายหลัก
  { parentCode: 'NETWORK', code: 'NETWORK_AUTH', nameTh: 'ລະບົບຢືນຢັນຕົວຕົນກາງ (AD / SSO) ໃຊ້ບໍ່ໄດ້', defaultImpact: 'org_wide', defaultUrgency: 'high', sortOrder: 15, ticketTypeScope: 'incident' },
  { parentCode: 'NETWORK', code: 'NETWORK_SLOW', nameTh: 'ອິນເຕີເນັດຊ້າ', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 20, ticketTypeScope: 'incident' },
  { parentCode: 'NETWORK', code: 'NETWORK_LAN', nameTh: 'ສາຍ LAN / ປລັກເຄືອຂ່າຍ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 30, ticketTypeScope: 'incident' },
  // SLA 5.2 ตัวอย่าง P2: "อีเมลทั้งแผนกใช้ไม่ได้" → ทั้งแผนก × เร่งด่วนมาก = P2
  { parentCode: 'COMMUNICATION', code: 'EMAIL_DEPT_DOWN', nameTh: 'ອີເມວທັງພະແນກ ຫຼື ທັງອົງກອນໃຊ້ບໍ່ໄດ້', defaultImpact: 'department', defaultUrgency: 'high', sortOrder: 10, ticketTypeScope: 'incident' },
  // SLA 5.2 ตัวอย่าง P3: "อีเมลรายบุคคล"
  { parentCode: 'COMMUNICATION', code: 'EMAIL_SEND_RECEIVE', nameTh: 'ສົ່ງ ຫຼື ຮັບອີເມວບໍ່ໄດ້', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 20, ticketTypeScope: 'incident' },
  { parentCode: 'COMMUNICATION', code: 'EMAIL_MAILBOX_FULL', nameTh: 'ກ່ອງຈົດໝາຍເຕັມ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 30, ticketTypeScope: 'incident' },
  // ล็อกเพราะระบบผิดพลาด = incident · ลืมรหัสผ่าน/ขอปลดล็อกเอง = คำขอ (ACCESS)
  { parentCode: 'COMMUNICATION', code: 'EMAIL_ACCOUNT_LOCKED', nameTh: 'ບັນຊີຖືກລັອກຍ້ອນລະບົບຜິດພາດ', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 40, ticketTypeScope: 'incident' },
  // SLA 6.2 communication: ระบบประชุมออนไลน์ · แชทองค์กร
  { parentCode: 'COMMUNICATION', code: 'MEETING_CHAT', nameTh: 'ປະຊຸມອອນລາຍ / ແຊັດອົງກອນໃຊ້ບໍ່ໄດ້', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 50, ticketTypeScope: 'incident' },
  // SLA 6.2 จัด Wi-Fi ไว้กลุ่ม communication (tier high) ไม่ใช่ infrastructure
  { parentCode: 'COMMUNICATION', code: 'NETWORK_WIFI', nameTh: 'Wi-Fi ເຊື່ອມຕໍ່ບໍ່ໄດ້ ຫຼື ຫຼຸດບ່ອຍ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 60, ticketTypeScope: 'incident' },
  // SLA 6.2 จัด VPN ไว้กลุ่ม communication · "VPN ใช้ไม่ได้" = incident ส่วน "ขอใช้ VPN" = คำขอ (ACCESS_VPN)
  { parentCode: 'COMMUNICATION', code: 'NETWORK_VPN', nameTh: 'VPN ເຂົ້າຈາກນອກຫ້ອງການບໍ່ໄດ້', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 70, ticketTypeScope: 'incident' },
  // SLA 6.2 file_storage (tier high) · ทั้งแผนก × เร่งด่วนมาก = P2
  { parentCode: 'FILE_STORAGE', code: 'FILE_SERVER_DOWN', nameTh: 'ເຂົ້າ File Server / Cloud Storage ບໍ່ໄດ້ທັງພະແນກ', defaultImpact: 'department', defaultUrgency: 'high', sortOrder: 10, ticketTypeScope: 'incident' },
  { parentCode: 'FILE_STORAGE', code: 'FILE_OPEN_FAIL', nameTh: 'ເປີດ ຫຼື ບັນທຶກໄຟລ໌ໃນ File Server ບໍ່ໄດ້ (ສະເພາະຂ້ອຍ)', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 20, ticketTypeScope: 'incident' },
  { parentCode: 'HARDWARE', code: 'HARDWARE_NO_POWER', nameTh: 'ເປີດເຄື່ອງບໍ່ຕິດ / ຈໍຟ້າ', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 10, ticketTypeScope: 'incident' },
  { parentCode: 'HARDWARE', code: 'HARDWARE_SLOW', nameTh: 'ເຄື່ອງຊ້າ ຫຼື ຄ້າງ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 20, ticketTypeScope: 'incident' },
  { parentCode: 'HARDWARE', code: 'HARDWARE_MONITOR', nameTh: 'ຈໍພາບ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 30, ticketTypeScope: 'incident' },
  { parentCode: 'HARDWARE', code: 'HARDWARE_PERIPHERAL', nameTh: 'ເມົ້າ ຄີບອດ ແລະ ອຸປະກອນຕໍ່ພ່ວງ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 40, ticketTypeScope: 'incident' },
  // SLA 5.2 ตัวอย่าง P3: เครื่องพิมพ์ · เครื่องพิมพ์ส่วนใหญ่ใช้ร่วมทั้งแผนก
  { parentCode: 'HARDWARE', code: 'PRINTER_NOT_PRINTING', nameTh: 'ພິມບໍ່ອອກ', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 50, ticketTypeScope: 'incident' },
  { parentCode: 'HARDWARE', code: 'PRINTER_QUALITY', nameTh: 'ເຈ້ຍຕິດ ຫຼື ພິມບໍ່ຊັດ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 60, ticketTypeScope: 'incident' },
  { parentCode: 'HARDWARE', code: 'PRINTER_SCAN', nameTh: 'ສະແກນບໍ່ໄດ້', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 70, ticketTypeScope: 'incident' },
  { parentCode: 'HARDWARE', code: 'MOBILE_BROKEN', nameTh: 'ມືຖື ຫຼື ແທັບເລັດບໍລິສັດເສຍ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 80, ticketTypeScope: 'incident' },
  { parentCode: 'HARDWARE', code: 'CCTV_NO_SIGNAL', nameTh: 'ກ້ອງວົງຈອນປິດບໍ່ມີພາບ / ອອບລາຍ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 90, ticketTypeScope: 'incident' },
  { parentCode: 'SOFTWARE', code: 'SOFTWARE_ERROR', nameTh: 'ໂປຣແກຣມຂຶ້ນຂໍ້ຜິດພາດ ຫຼື ປິດເອງ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 10, ticketTypeScope: 'incident' },
  // ยืนยันโดย SA 2026-09-18 — "ขอติดตั้ง Office" อยู่ที่ SOFTWARE_INSTALL
  { parentCode: 'SOFTWARE', code: 'SOFTWARE_OFFICE', nameTh: 'Microsoft Office', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 30, ticketTypeScope: 'incident' },
  // ยืนยันโดย SA 2026-09-18 — ผู้แจ้งเห็นแค่ "ใช้ต่อไม่ได้" · การจัดซื้อต่ออายุเป็นงานภายในของไอที
  { parentCode: 'SOFTWARE', code: 'SOFTWARE_LICENSE', nameTh: 'License ໝົດອາຍຸ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 40, ticketTypeScope: 'incident' },
  { parentCode: 'SOFTWARE', code: 'AI_TOOLS_PROBLEM', nameTh: 'ໃຊ້ງານເຄື່ອງມື AI ບໍ່ໄດ້', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 50, ticketTypeScope: 'incident' },
  // นโยบาย 3.6 ให้รายงานอีเมลต้องสงสัยผ่าน Service Desk ทันที
  { parentCode: 'SECURITY', code: 'SECURITY_PHISHING', nameTh: 'ອີເມວຫຼອກລວງ (Phishing)', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 10, ticketTypeScope: 'incident' },
  // SOP-6 ตัวอย่างที่ 1-2: ไวรัสในเครื่องหรือระบบ · ถูกโจมตีด้วยโปรแกรมอันตราย
  { parentCode: 'SECURITY', code: 'SECURITY_MALWARE', nameTh: 'ໄວຣັສ / ມັລແວ / Ransomware', defaultImpact: 'org_wide', defaultUrgency: 'high', sortOrder: 20, ticketTypeScope: 'incident' },
  // SOP-6 "Denial of services" · SLA 5.2 P1: ถูกโจมตีทางไซเบอร์
  { parentCode: 'SECURITY', code: 'SECURITY_ATTACK', nameTh: 'ຖືກໂຈມຕີທາງໄຊເບີ / ປະຕິເສດການບໍລິການ (DoS)', defaultImpact: 'org_wide', defaultUrgency: 'high', sortOrder: 25, ticketTypeScope: 'incident' },
  // SOP-6 "การสืบสวนที่ไม่ได้รับอนุญาตหรือสแกนระบบข้อมูล"
  { parentCode: 'SECURITY', code: 'SECURITY_PROBE', nameTh: 'ພົບການສະແກນ ຫຼື ສືບຫາຊ່ອງໂຫວ່ຂອງລະບົບໂດຍບໍ່ໄດ້ຮັບອະນຸຍາດ', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 30, ticketTypeScope: 'incident' },
  // SOP-6 "ความพยายามที่ไม่ได้รับอนุญาตในการเข้าถึงระบบ"
  { parentCode: 'SECURITY', code: 'SECURITY_ACCOUNT', nameTh: 'ບັນຊີຖືກໃຊ້ງານຜິດປົກກະຕິ ຫຼື ມີຄົນພະຍາຍາມເຂົ້າໂດຍບໍ່ໄດ້ຮັບອະນຸຍາດ', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 35, ticketTypeScope: 'incident' },
  // SOP-6 การเข้าถึง แก้ไข ดักจับ ส่งออก หรือทำลายข้อมูล · นโยบาย 3.8 ข้อมูลส่วนบุคคลต้องแจ้ง DPO ทันที
  { parentCode: 'SECURITY', code: 'SECURITY_DATA_LEAK', nameTh: 'ຂໍ້ມູນຮົ່ວໄຫຼ ຫຼື ຖືກແກ້ໄຂ / ທຳລາຍໂດຍບໍ່ໄດ້ຮັບອະນຸຍາດ', defaultImpact: 'org_wide', defaultUrgency: 'high', sortOrder: 40, ticketTypeScope: 'incident' },
  // SOP-6 Physical Incident: การเข้าพื้นที่โดยไม่ได้รับอนุญาต
  { parentCode: 'SECURITY', code: 'SECURITY_PHYSICAL', nameTh: 'ມີຄົນເຂົ້າພື້ນທີ່ / ຫ້ອງເຊີເວີໂດຍບໍ່ໄດ້ຮັບອະນຸຍາດ', defaultImpact: 'department', defaultUrgency: 'high', sortOrder: 50, ticketTypeScope: 'incident' },
  // SOP-6 การลักทรัพย์สิน · นโยบาย 3.7 อุปกรณ์สูญหายต้องแจ้งภายใน 24 ชั่วโมง
  { parentCode: 'SECURITY', code: 'SECURITY_DEVICE_LOST', nameTh: 'ອຸປະກອນ ຫຼື ຊັບສິນໄອທີສູນຫາຍ / ຖືກລັກ (ແຈ້ງພາຍໃນ 24 ຊົ່ວໂມງ)', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 60, ticketTypeScope: 'incident' },
  // SOP-6 Procedural Incident · นโยบาย 3.10 ผู้พบเห็นมีหน้าที่รายงาน
  { parentCode: 'SECURITY', code: 'SECURITY_POLICY_BREACH', nameTh: 'ລະເມີດ ຫຼື ບໍ່ປະຕິບັດຕາມນະໂຍບາຍຄວາມປອດໄພ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 70, ticketTypeScope: 'incident' },
  // SR-PASSWORD-RESET · SLA 5.3 30 นาทีทำการ นับหลังยืนยันตัวตน (คงรหัสเดิมไว้ ประวัติ ticket เก่าไม่เปลี่ยนความหมาย)
  { parentCode: 'ACCESS', code: 'EMAIL_PASSWORD', nameTh: 'ລືມລະຫັດຜ່ານ / ຂໍຣີເຊັດລະຫັດຜ່ານ', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 10, ticketTypeScope: 'service_request' },
  // SR-UNLOCK-ACCOUNT · นโยบาย 3.2 ล็อกอัตโนมัติเมื่อผิดเกิน 5 ครั้ง ปลดล็อกต้องยืนยันตัวตนกับ Service Desk
  { parentCode: 'ACCESS', code: 'ACCESS_UNLOCK', nameTh: 'ຂໍປົດລັອກບັນຊີ (ໃສ່ລະຫັດຜິດເກີນກຳນົດ)', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 20, ticketTypeScope: 'service_request' },
  // SR-ACCESS
  { parentCode: 'ACCESS', code: 'ACCESS_NEW', nameTh: 'ຂໍສິດເຂົ້າລະບົບໃໝ່', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 30, ticketTypeScope: 'service_request' },
  { parentCode: 'ACCESS', code: 'ACCESS_CHANGE', nameTh: 'ປ່ຽນ ຫຼື ເພີ່ມສິດ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 40, ticketTypeScope: 'service_request' },
  { parentCode: 'ACCESS', code: 'ACCESS_SHARED_FOLDER', nameTh: 'ສິດໂຟນເດີແບ່ງປັນ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 50, ticketTypeScope: 'service_request' },
  // นโยบาย 3.3 ปรับสิทธิ์ทันทีเมื่อโยกย้ายตำแหน่ง · พนักงานลาออกอยู่ที่ LIFECYCLE_OFFBOARD
  { parentCode: 'ACCESS', code: 'ACCESS_REVOKE', nameTh: 'ຍົກເລີກສິດ (ຍ້າຍພະແນກ / ປ່ຽນໜ້າທີ່)', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 60, ticketTypeScope: 'service_request' },
  // SR-EMAIL-ACCOUNT
  { parentCode: 'ACCESS', code: 'EMAIL_NEW_ACCOUNT', nameTh: 'ຂໍບັນຊີອີເມວໃໝ່', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 70, ticketTypeScope: 'service_request' },
  // SR-VPN · นโยบาย 3.7 ทำงานระยะไกลต้องผ่าน VPN + MFA
  { parentCode: 'ACCESS', code: 'ACCESS_VPN', nameTh: 'ຂໍໃຊ້ງານ VPN', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 80, ticketTypeScope: 'service_request' },
  // SR-ONBOARDING · SOP-04 แจ้งล่วงหน้า ≥ 7 วันปฏิทิน
  { parentCode: 'LIFECYCLE', code: 'LIFECYCLE_ONBOARD', nameTh: 'ຕຽມລະບົບໃຫ້ພະນັກງານໃໝ່', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 10, ticketTypeScope: 'service_request' },
  // SR-OFFBOARDING · SOP-05 แจ้งล่วงหน้า ≥ 3 วันทำการ ระงับสิทธิ์ภายในสิ้นวันสุดท้าย
  { parentCode: 'LIFECYCLE', code: 'LIFECYCLE_OFFBOARD', nameTh: 'ປິດສິດພະນັກງານລາອອກ', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 20, ticketTypeScope: 'service_request' },
  // SR-SOFTWARE-INSTALL · SOP-06 อยู่ในบัญชีมาตรฐาน ติดตั้งภายใน 2 วันทำการ
  { parentCode: 'SR_SOFTWARE', code: 'SOFTWARE_INSTALL', nameTh: 'ຕິດຕັ້ງຊອບແວໃນບັນຊີມາດຕະຖານ (Approved Software List)', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 10, ticketTypeScope: 'service_request' },
  // SR-SW-NONSTD · SOP-06 Tier 2 ประเมิน แล้ว Head of IT อนุมัติ
  { parentCode: 'SR_SOFTWARE', code: 'SOFTWARE_NONSTD', nameTh: 'ຂໍຊອບແວນອກບັນຊີມາດຕະຖານ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 20, ticketTypeScope: 'service_request' },
  // นโยบาย 3.1 ห้ามใช้เครื่องมือ AI สาธารณะที่ไม่ได้รับอนุมัติจากไอที
  { parentCode: 'SR_SOFTWARE', code: 'AI_TOOLS_CHAT', nameTh: 'ຂໍບັນຊີ AI ແຊັດ (ChatGPT · Claude · Gemini)', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 30, ticketTypeScope: 'service_request' },
  { parentCode: 'SR_SOFTWARE', code: 'AI_TOOLS_COPILOT', nameTh: 'Microsoft Copilot', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 40, ticketTypeScope: 'service_request' },
  { parentCode: 'SR_SOFTWARE', code: 'AI_TOOLS_OTHER', nameTh: 'ເຄື່ອງມື AI ອື່ນ ໆ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 50, ticketTypeScope: 'service_request' },
  // SR-EQUIPMENT · SLA 5.3 10 วันทำการ นับหลังอนุมัติงบประมาณ
  { parentCode: 'SR_EQUIPMENT', code: 'HARDWARE_REQUEST', nameTh: 'ຂໍອຸປະກອນໃໝ່ / ປ່ຽນເຄື່ອງ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 10, ticketTypeScope: 'service_request' },
  { parentCode: 'SR_EQUIPMENT', code: 'PRINTER_SETUP', nameTh: 'ຕິດຕັ້ງເຄື່ອງພິມໃສ່ຄອມພິວເຕີ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 20, ticketTypeScope: 'service_request' },
  // ของสิ้นเปลืองที่ถึงรอบเติม ไม่ใช่เครื่องเสีย — เป็นงานจัดหา
  { parentCode: 'SR_EQUIPMENT', code: 'PRINTER_TONER', nameTh: 'ໝຶກໝົດ / ປ່ຽນຕະລັບໝຶກ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 30, ticketTypeScope: 'service_request' },
  { parentCode: 'SR_EQUIPMENT', code: 'MOBILE_SETUP', nameTh: 'ຕັ້ງຄ່າອີເມວ / ແອັບບໍລິສັດໃນມືຖື', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 40, ticketTypeScope: 'service_request' },
  { parentCode: 'SR_EQUIPMENT', code: 'MOBILE_SIM', nameTh: 'ຊິມ / ແພັກເກັດອິນເຕີເນັດ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 50, ticketTypeScope: 'service_request' },
  { parentCode: 'SR_EQUIPMENT', code: 'CCTV_PLAYBACK', nameTh: 'ຂໍເບິ່ງພາບກ້ອງວົງຈອນປິດຍ້ອນຫຼັງ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 60, ticketTypeScope: 'service_request' },
  { parentCode: 'SR_EQUIPMENT', code: 'CCTV_INSTALL', nameTh: 'ຂໍຕິດຕັ້ງ ຫຼື ຍ້າຍກ້ອງ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 70, ticketTypeScope: 'service_request' },
  // SR-RESTORE · SOP-07 หัวหน้าหน่วยงานอนุมัติกรณีข้อมูลส่วนกลาง
  { parentCode: 'SR_DATA', code: 'DATA_RESTORE', nameTh: 'ຂໍກູ້ຄືນຂໍ້ມູນຈາກ Backup', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 10, ticketTypeScope: 'service_request' },
  // SR-POLICY-EXC · นโยบาย 3.10 Head of IT อนุมัติ ทบทวนทุก 6 เดือน
  { parentCode: 'SR_DATA', code: 'POLICY_EXCEPTION', nameTh: 'ຂໍຍົກເວັ້ນນະໂຍບາຍໄອທີ (Policy Exception)', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 20, ticketTypeScope: 'service_request' },
  // SR-CONSULT
  { parentCode: 'SR_ADVISORY', code: 'ADVISORY_HOWTO', nameTh: 'ສອບຖາມວິທີໃຊ້ງານ / ຂໍຄຳປຶກສາ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 10, ticketTypeScope: 'service_request' },

  // ── Super Work — ทรงมาตรฐานของระบบผู้ขาย: LOGIN/ERROR เป็นเหตุ · ACCOUNT/HOWTO เป็นคำขอ ──
  { parentCode: 'SUPER_WORK', code: 'SUPER_WORK_LOGIN', nameTh: 'ເຂົ້າລະບົບ Super Work ບໍ່ໄດ້', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 10, ticketTypeScope: 'incident' },
  { parentCode: 'SUPER_WORK', code: 'SUPER_WORK_ERROR', nameTh: 'ລະບົບຂຶ້ນຂໍ້ຜິດພາດ', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 20, ticketTypeScope: 'incident' },
  { parentCode: 'SUPER_WORK', code: 'SUPER_WORK_ACCOUNT', nameTh: 'ຂໍບັນຊີ ຫຼື ປ່ຽນສິດ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 30, ticketTypeScope: 'service_request' },
  { parentCode: 'SUPER_WORK', code: 'SUPER_WORK_HOWTO', nameTh: 'ສອບຖາມວິທີໃຊ້ງານ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 40, ticketTypeScope: 'service_request' },

  /*
   * ── Magic — แยกตามโมดูล ทีมที่ดูแลแต่ละโมดูลเป็นคนละกลุ่ม ──
   *
   * ✅ ยืนยันโดย SA (2026-09-18) — คงเป็น both ทั้งสี่แถวตามที่ตั้งใจไว้ ไม่ใช่ค่าเริ่มต้น
   *    ที่รอแก้ ต่างจาก Super Work: ชื่อหมวดย่อยที่นี่คือ "ชื่อโมดูล" ไม่ใช่ "อาการ"
   *    จึงไม่มีอะไรในชื่อบอกได้เลยว่าเป็นของเสียหรือคำขอ ทั้งสองอย่างแจ้ง
   *    เข้าช่องเดียวกันหมด ถ้าอยากกรองจริงต้องแตกชั้นที่สามใต้แต่ละโมดูล
   *    (เช่น MAGIC_AUDIT_LOGIN / MAGIC_AUDIT_ACCOUNT) ซึ่งทำให้ต้นไม้ลึก 3 ชั้น
   *    — ขัดกับที่ schema บังคับไว้ว่ามีสองชั้นเท่านั้น จึงเป็นงานคนละก้อน
   */
  { parentCode: 'MAGIC', code: 'MAGIC_AUDIT', nameTh: 'Magic-Audit', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 10, ticketTypeScope: 'both' },
  { parentCode: 'MAGIC', code: 'MAGIC_ACCOUNT', nameTh: 'Magic-Account', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 20, ticketTypeScope: 'both' },
  { parentCode: 'MAGIC', code: 'MAGIC_FINANCE', nameTh: 'Magic-Finance', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 30, ticketTypeScope: 'both' },
  { parentCode: 'MAGIC', code: 'MAGIC_ASSET', nameTh: 'Magic-Asset', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 40, ticketTypeScope: 'both' },
];

export interface ChecklistItemSeed {
  readonly sortOrder: number;
  readonly titleTh: string;
  readonly isRequired: boolean;
  readonly evidenceRequired: boolean;
  readonly defaultRoleCode: string | null;
}

export interface ChecklistTemplateSeed {
  readonly code: string;
  readonly nameTh: string;
  readonly docRef: string;
  readonly items: readonly ChecklistItemSeed[];
}

/**
 * evidence_required = true เฉพาะขั้นที่ต้องพิสูจน์ย้อนหลังได้
 * เช่นการปิดสิทธิ์ตอนพนักงานลาออก ซึ่งเป็นจุดที่ตรวจสอบภายในถามหาหลักฐาน
 */
export const CHECKLIST_TEMPLATES: readonly ChecklistTemplateSeed[] = [
  {
    code: 'ONBOARDING',
    nameTh: 'ຮັບພະນັກງານໃໝ່',
    docRef: 'AIDC-IT-SOP-001',
    items: [
      { sortOrder: 10, titleTh: 'ສ້າງບັນຊີຜູ້ໃຊ້ ແລະ ອີເມວ', isRequired: true, evidenceRequired: false, defaultRoleCode: 'support_agent' },
      { sortOrder: 20, titleTh: 'ມອບສິດເຂົ້າເຖິງລະບົບຕາມໜ້າທີ່', isRequired: true, evidenceRequired: true, defaultRoleCode: 'support_agent' },
      { sortOrder: 30, titleTh: 'ຕຽມເຄື່ອງຄອມພິວເຕີ ແລະ ຕິດຕັ້ງຊອບແວມາດຕະຖານ', isRequired: true, evidenceRequired: false, defaultRoleCode: 'support_agent' },
      { sortOrder: 40, titleTh: 'ຕິດຕັ້ງໂປຣແກຣມປ້ອງກັນໄວຣັສ', isRequired: true, evidenceRequired: false, defaultRoleCode: 'support_agent' },
      { sortOrder: 50, titleTh: 'ບັນທຶກອຸປະກອນເຂົ້າທະບຽນຊັບສິນ', isRequired: true, evidenceRequired: true, defaultRoleCode: 'support_agent' },
      { sortOrder: 60, titleTh: 'ຊີ້ແຈງນະໂຍບາຍຄວາມປອດໄພ ແລະ ໃຫ້ເຊັນຮັບຮູ້', isRequired: true, evidenceRequired: true, defaultRoleCode: 'support_agent' },
      { sortOrder: 70, titleTh: 'ບັງຄັບປ່ຽນລະຫັດຜ່ານເມື່ອເຂົ້າໃຊ້ຄັ້ງທຳອິດ', isRequired: true, evidenceRequired: false, defaultRoleCode: 'support_agent' },
    ],
  },
  {
    code: 'OFFBOARDING',
    nameTh: 'ພະນັກງານລາອອກ',
    docRef: 'AIDC-IT-SOP-001',
    items: [
      { sortOrder: 10, titleTh: 'ປິດການໃຊ້ງານບັນຊີຜູ້ໃຊ້ທັນທີໃນວັນສຸດທ້າຍ', isRequired: true, evidenceRequired: true, defaultRoleCode: 'support_agent' },
      { sortOrder: 20, titleTh: 'ຖອນສິດເຂົ້າເຖິງທຸກລະບົບ', isRequired: true, evidenceRequired: true, defaultRoleCode: 'support_agent' },
      { sortOrder: 30, titleTh: 'ຮັບຄືນອຸປະກອນ ແລະ ບັນທຶກສະພາບ', isRequired: true, evidenceRequired: true, defaultRoleCode: 'support_agent' },
      { sortOrder: 40, titleTh: 'ໂອນຂໍ້ມູນ ແລະ ໄຟລ໌ວຽກໃຫ້ຫົວໜ້າ', isRequired: true, evidenceRequired: false, defaultRoleCode: 'support_agent' },
      { sortOrder: 50, titleTh: 'ຕັ້ງການສົ່ງຕໍ່ອີເມວຕາມທີ່ຫົວໜ້າກຳນົດ', isRequired: false, evidenceRequired: false, defaultRoleCode: 'support_agent' },
      { sortOrder: 60, titleTh: 'ລຶບບັນຊີອອກຈາກກຸ່ມ ແລະ ລາຍຊື່ສົ່ງອີເມວ', isRequired: true, evidenceRequired: false, defaultRoleCode: 'support_agent' },
      { sortOrder: 70, titleTh: 'ບັນທຶກຜົນເຂົ້າ audit log', isRequired: true, evidenceRequired: true, defaultRoleCode: 'company_admin' },
    ],
  },
];

export interface CatalogItemSeed {
  readonly code: string;
  readonly nameTh: string;
  readonly categoryCode: string;
  readonly defaultImpact: 'org_wide' | 'department' | 'individual';
  readonly defaultUrgency: 'high' | 'medium' | 'low';
  readonly defaultPriority: 'P1' | 'P2' | 'P3' | 'P4';
  readonly targetMinutes: number;
  readonly clockStartEvent: 'on_create' | 'after_identity_verified' | 'after_approval' | 'after_budget_approval';
  readonly requiresApproval: boolean;
  /** รหัส role หรือตำแหน่งผู้อนุมัติเรียงตามลำดับขั้น คั่นด้วยจุลภาค */
  readonly approvalChain: string | null;
  readonly checklistTemplateCode: string | null;
}

/**
 * เป้าหมายรายรายการตาม SLA 5.3 — หน่วยเป็นนาทีทำการทั้งหมด
 *   1 วันทำการ = 540 นาที
 *
 * clock_start_event สำคัญพอ ๆ กับตัวเลขเป้าหมาย
 * รายการที่ต้องอนุมัติเริ่มนับ "หลังอนุมัติครบ" เวลารออนุมัติจึงไม่นับเป็นของ IT
 * ถ้าตั้งเป็น on_create ทุกรายการ คำขอที่หัวหน้าดองไว้ 3 วันจะกลายเป็น IT ผิด SLA
 */
export const CATALOG_ITEMS: readonly CatalogItemSeed[] = [
  {
    code: 'SR-PASSWORD-RESET',
    nameTh: 'ຣີເຊັດລະຫັດຜ່ານ',
    categoryCode: 'EMAIL_PASSWORD',
    defaultImpact: 'individual',
    defaultUrgency: 'high',
    defaultPriority: 'P4',
    targetMinutes: 30,
    // นโยบาย 3.2 บังคับยืนยันตัวตนกับ Service Desk ก่อน นาฬิกาจึงเริ่มหลังยืนยันตัวตน
    clockStartEvent: 'after_identity_verified',
    requiresApproval: false,
    approvalChain: null,
    checklistTemplateCode: null,
  },
  {
    code: 'SR-UNLOCK-ACCOUNT',
    nameTh: 'ປົດລັອກບັນຊີຜູ້ໃຊ້',
    categoryCode: 'ACCESS_UNLOCK',
    defaultImpact: 'individual',
    defaultUrgency: 'high',
    defaultPriority: 'P4',
    targetMinutes: 30,
    clockStartEvent: 'after_identity_verified',
    requiresApproval: false,
    approvalChain: null,
    checklistTemplateCode: null,
  },
  {
    code: 'SR-ACCESS',
    nameTh: 'ຂໍສິດເຂົ້າເຖິງລະບົບ',
    categoryCode: 'ACCESS_NEW',
    defaultImpact: 'individual',
    defaultUrgency: 'medium',
    defaultPriority: 'P4',
    targetMinutes: 540,
    clockStartEvent: 'after_approval',
    requiresApproval: true,
    approvalChain: 'line_manager,system_owner',
    checklistTemplateCode: null,
  },
  {
    code: 'SR-SOFTWARE-INSTALL',
    nameTh: 'ຕິດຕັ້ງຊອບແວ',
    categoryCode: 'SOFTWARE_INSTALL',
    defaultImpact: 'individual',
    defaultUrgency: 'medium',
    defaultPriority: 'P4',
    // SLA 5.3 / SOP-06: ซอฟต์แวร์ในบัญชีมาตรฐาน (Approved Software List) = 2 วันทำการ
    // นับตั้งแต่รับคำขอ ไม่ต้องอนุมัติ — นอกบัญชีใช้ SR-SW-NONSTD
    targetMinutes: 1080,
    clockStartEvent: 'on_create',
    requiresApproval: false,
    approvalChain: null,
    checklistTemplateCode: null,
  },
  {
    code: 'SR-EQUIPMENT',
    nameTh: 'ຈັດຫາອຸປະກອນໄອທີ',
    categoryCode: 'HARDWARE_REQUEST',
    defaultImpact: 'individual',
    defaultUrgency: 'low',
    defaultPriority: 'P4',
    targetMinutes: 5400,
    // งบต้องอนุมัติก่อนสั่งซื้อ ระยะเวลาจัดหาจึงเริ่มนับหลังอนุมัติงบ
    clockStartEvent: 'after_budget_approval',
    requiresApproval: true,
    approvalChain: 'line_manager,head_of_it',
    checklistTemplateCode: null,
  },
  {
    code: 'SR-ONBOARDING',
    nameTh: 'ຕຽມລະບົບໃຫ້ພະນັກງານໃໝ່',
    categoryCode: 'LIFECYCLE_ONBOARD',
    defaultImpact: 'individual',
    defaultUrgency: 'medium',
    defaultPriority: 'P4',
    targetMinutes: 1080,
    clockStartEvent: 'after_approval',
    requiresApproval: true,
    approvalChain: 'line_manager',
    checklistTemplateCode: 'ONBOARDING',
  },
  {
    code: 'SR-OFFBOARDING',
    nameTh: 'ປິດສິດພະນັກງານລາອອກ',
    categoryCode: 'LIFECYCLE_OFFBOARD',
    defaultImpact: 'individual',
    // ต้องปิดสิทธิ์ในวันสุดท้าย ช้ากว่านั้นคือช่องโหว่ ไม่ใช่แค่ความไม่สะดวก
    defaultUrgency: 'high',
    defaultPriority: 'P4',
    targetMinutes: 540,
    clockStartEvent: 'on_create',
    requiresApproval: false,
    approvalChain: null,
    checklistTemplateCode: 'OFFBOARDING',
  },
  {
    code: 'SR-EMAIL-ACCOUNT',
    nameTh: 'ຂໍບັນຊີອີເມວ',
    categoryCode: 'EMAIL_NEW_ACCOUNT',
    defaultImpact: 'individual',
    defaultUrgency: 'medium',
    defaultPriority: 'P4',
    targetMinutes: 540,
    clockStartEvent: 'after_approval',
    requiresApproval: true,
    approvalChain: 'line_manager',
    checklistTemplateCode: null,
  },
  {
    code: 'SR-VPN',
    nameTh: 'ຂໍໃຊ້ງານ VPN',
    categoryCode: 'ACCESS_VPN',
    defaultImpact: 'individual',
    defaultUrgency: 'medium',
    defaultPriority: 'P4',
    targetMinutes: 540,
    clockStartEvent: 'after_approval',
    requiresApproval: true,
    approvalChain: 'line_manager,head_of_it',
    checklistTemplateCode: null,
  },
  {
    code: 'SR-CONSULT',
    nameTh: 'ສອບຖາມວິທີໃຊ້ງານ',
    categoryCode: 'ADVISORY_HOWTO',
    defaultImpact: 'individual',
    defaultUrgency: 'low',
    defaultPriority: 'P4',
    // SLA 2.1 / 4: ขอคำปรึกษาใช้เป้า P4 = 5 วันทำการ (2,700 นาที)
    targetMinutes: 2700,
    clockStartEvent: 'on_create',
    requiresApproval: false,
    approvalChain: null,
    checklistTemplateCode: null,
  },
  {
    // SOP-06: นอกบัญชีซอฟต์แวร์มาตรฐาน — Tier 2 ประเมินความปลอดภัย/ลิขสิทธิ์/ค่าใช้จ่าย แล้ว Head of IT อนุมัติ
    // เอกสารไม่ระบุเป้าหมายเวลา ใช้ P4 (2,700 นาที) ตามกติกา fallback ของ 05 §7.2 [ต้องยืนยันกับ PM]
    code: 'SR-SW-NONSTD',
    nameTh: 'ຂໍຊອບແວນອກບັນຊີມາດຕະຖານ',
    categoryCode: 'SOFTWARE_NONSTD',
    defaultImpact: 'individual',
    defaultUrgency: 'low',
    defaultPriority: 'P4',
    targetMinutes: 2700,
    clockStartEvent: 'after_approval',
    requiresApproval: true,
    approvalChain: 'tier2_review,head_of_it',
    checklistTemplateCode: null,
  },
  {
    // SOP-07: กู้คืนข้อมูลจาก Backup — หัวหน้าหน่วยงานอนุมัติกรณีข้อมูลส่วนกลาง
    // เอกสารไม่ระบุเป้าหมายเวลา ใช้ P4 (2,700 นาที) [ต้องยืนยันกับ PM]
    code: 'SR-RESTORE',
    nameTh: 'ຂໍກູ້ຄືນຂໍ້ມູນຈາກ Backup',
    categoryCode: 'DATA_RESTORE',
    defaultImpact: 'individual',
    defaultUrgency: 'low',
    defaultPriority: 'P4',
    targetMinutes: 2700,
    clockStartEvent: 'after_approval',
    requiresApproval: true,
    approvalChain: 'line_manager',
    checklistTemplateCode: null,
  },
  {
    // นโยบาย 3.10: ขอยกเว้นนโยบาย — Head of IT อนุมัติ ทบทวนทุก 6 เดือน
    // เอกสารไม่ระบุเป้าหมายเวลา ใช้ P4 (2,700 นาที) [ต้องยืนยันกับ PM]
    code: 'SR-POLICY-EXC',
    nameTh: 'ຂໍຍົກເວັ້ນນະໂຍບາຍໄອທີ',
    categoryCode: 'POLICY_EXCEPTION',
    defaultImpact: 'individual',
    defaultUrgency: 'low',
    defaultPriority: 'P4',
    targetMinutes: 2700,
    clockStartEvent: 'after_approval',
    requiresApproval: true,
    approvalChain: 'head_of_it',
    checklistTemplateCode: null,
  },
  {
    /**
     * "อื่น ๆ (ระบุเอง)" — ปลายทางของคำขอที่ไม่มีรายการรองรับ
     *
     * ทำไมต้องมี และทำไมต้องบังคับอนุมัติเสมอ
     *   ck_ticket_service_request_needs_catalog บังคับว่าคำขอบริการทุกใบ
     *   ต้องผูกกับรายการใน catalog (G-14) แต่ผู้ใช้ขอของที่ไม่มีในรายการได้เสมอ
     *   ถ้าไม่มีช่องนี้ เขาจะถูกบังคับให้เลือกรายการที่ใกล้เคียงแต่ผิด
     *   แล้วเป้าหมายเวลาและสายอนุมัติที่ติดมากับรายการนั้นจะผิดตามไปด้วย
     *
     *   บังคับอนุมัติเพราะ "ไม่รู้ว่าคืออะไร" = ยังไม่มีใครประเมินว่าทำได้ไหม
     *   คุ้มไหม และใครควรทำ — หัวหน้าไอทีต้องอ่านก่อนเสมอ ต่างจากรายการ
     *   มาตรฐานที่ผ่านการตัดสินใจนั้นไปแล้วตอนตั้งรายการ
     *
     * head_of_it คือค่า APPROVER_TYPE ที่หมายถึงหัวหน้าไอที (ดู constants.ts)
     * company_id เป็น null ตอน seed = รายการส่วนกลาง ใช้ได้ทุกบริษัทในเครือ
     * จึงไม่ต้องสร้างซ้ำ 7 แถว และเพิ่มบริษัทใหม่ก็ได้ช่องนี้ทันที
     */
    code: 'SR-OTHER',
    nameTh: 'ອື່ນ ໆ (ລະບຸເອງ)',
    categoryCode: 'OTHER',
    defaultImpact: 'individual',
    defaultUrgency: 'low',
    defaultPriority: 'P4',
    // 3 วันทำการ — กว้างกว่ารายการมาตรฐานเพราะยังไม่รู้ว่าต้องทำอะไร
    targetMinutes: 1620,
    clockStartEvent: 'after_approval',
    requiresApproval: true,
    approvalChain: 'head_of_it',
    checklistTemplateCode: null,
  },
];

export interface KbCategorySeed {
  readonly nameTh: string;
  readonly sortOrder: number;
}

export const KB_CATEGORIES: readonly KbCategorySeed[] = [
  { nameTh: 'ແກ້ບັນຫາເບື້ອງຕົ້ນ', sortOrder: 10 },
  { nameTh: 'ເຄືອຂ່າຍ ແລະ ອິນເຕີເນັດ', sortOrder: 20 },
  { nameTh: 'ອີເມວ ແລະ ບັນຊີຜູ້ໃຊ້', sortOrder: 30 },
  { nameTh: 'ຊອບແວສຳນັກງານ', sortOrder: 40 },
  { nameTh: 'ລະບົບ ERP', sortOrder: 50 },
  { nameTh: 'ຄວາມປອດໄພຂໍ້ມູນ', sortOrder: 60 },
  { nameTh: 'ຄູ່ມືການໃຊ້ງານລະບົບ Helpdesk', sortOrder: 70 },
];
