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
}

/**
 * ค่า default_impact / default_urgency เป็นเพียงค่าตั้งต้นที่ระบบเติมให้
 * ผู้แจ้งแก้ได้ และระบบคำนวณ priority จากสองค่านี้เสมอ (SLA ข้อ 4)
 * ผู้แจ้งไม่เคยเลือก priority โดยตรง
 */
export const TICKET_CATEGORIES: readonly TicketCategorySeed[] = [
  { code: 'NETWORK', nameTh: 'ເຄືອຂ່າຍ ແລະ ອິນເຕີເນັດ', defaultImpact: 'department', defaultUrgency: 'high', sortOrder: 10 },
  { code: 'HARDWARE', nameTh: 'ອຸປະກອນຄອມພິວເຕີ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 20 },
  { code: 'SOFTWARE', nameTh: 'ຊອບແວ ແລະ ແອັບພລິເຄຊັນ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 30 },
  // ปิดใช้งานตามที่องค์กรแจ้ง — ไม่ลบเพราะยังมี ticket เก่าผูกอยู่
  { code: 'ERP', nameTh: 'ລະບົບ ERP', defaultImpact: 'department', defaultUrgency: 'high', sortOrder: 40, isActive: false },
  { code: 'EMAIL', nameTh: 'ອີເມວ ແລະ ບັນຊີຜູ້ໃຊ້', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 50 },
  { code: 'PRINTER', nameTh: 'ເຄື່ອງພິມ ແລະ ເຄື່ອງສະແກນ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 60 },
  { code: 'ACCESS', nameTh: 'ສິດເຂົ້າເຖິງລະບົບ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 70 },
  { code: 'SECURITY', nameTh: 'ຄວາມປອດໄພຂໍ້ມູນ', defaultImpact: 'org_wide', defaultUrgency: 'high', sortOrder: 80 },
  { code: 'CCTV', nameTh: 'ກ້ອງວົງຈອນປິດ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 90 },
  { code: 'MOBILE', nameTh: 'ໂທລະສັບ ແລະ ອຸປະກອນເຄື່ອນທີ່', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 100 },
  { code: 'AI_TOOLS', nameTh: 'ຂໍສິດໃຊ້ເຄື່ອງມື AI', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 110 },
  // ชื่อผลิตภัณฑ์ ไม่แปล — ทีมเรียกทับศัพท์อยู่แล้วทั้งลาวและไทย
  { code: 'SUPER_WORK', nameTh: 'Super Work', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 120 },
  // ระบบงานของกลุ่มบริษัท — ชื่อผลิตภัณฑ์ไม่แปลเช่นเดียวกับ Super Work
  // ระบบที่ไม่มีหมวดย่อยเลือกเป็นปลายทางได้เลย ส่วน Magic แยกตามโมดูล (ดู TICKET_SUBCATEGORIES)
  { code: 'ILP', nameTh: 'ILP', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 130 },
  { code: 'I_OFFICE_PLUS', nameTh: 'I Office Plus', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 140 },
  { code: 'APS', nameTh: 'APS', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 150 },
  { code: 'CMS', nameTh: 'CMS', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 160 },
  { code: 'CMS_PLUS', nameTh: 'CMS+', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 170 },
  { code: 'MAGIC', nameTh: 'Magic', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 180 },
  { code: 'OTHER', nameTh: 'ອື່ນ ໆ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 999 },
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
  // ── ເຄືອຂ່າຍ ແລະ ອິນເຕີເນັດ ──
  { parentCode: 'NETWORK', code: 'NETWORK_OUTAGE', nameTh: 'ອິນເຕີເນັດໃຊ້ບໍ່ໄດ້ທັງຫ້ອງການ', defaultImpact: 'department', defaultUrgency: 'high', sortOrder: 10 },
  { parentCode: 'NETWORK', code: 'NETWORK_WIFI', nameTh: 'Wi-Fi ເຊື່ອມຕໍ່ບໍ່ໄດ້ ຫຼື ຫຼຸດບ່ອຍ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 20 },
  { parentCode: 'NETWORK', code: 'NETWORK_SLOW', nameTh: 'ອິນເຕີເນັດຊ້າ', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 30 },
  { parentCode: 'NETWORK', code: 'NETWORK_LAN', nameTh: 'ສາຍ LAN / ປລັກເຄືອຂ່າຍ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 40 },
  { parentCode: 'NETWORK', code: 'NETWORK_VPN', nameTh: 'VPN ເຂົ້າຈາກນອກຫ້ອງການບໍ່ໄດ້', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 50 },

  // ── ອຸປະກອນຄອມພິວເຕີ ──
  { parentCode: 'HARDWARE', code: 'HARDWARE_NO_POWER', nameTh: 'ເປີດເຄື່ອງບໍ່ຕິດ / ຈໍຟ້າ', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 10 },
  { parentCode: 'HARDWARE', code: 'HARDWARE_SLOW', nameTh: 'ເຄື່ອງຊ້າ ຫຼື ຄ້າງ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 20 },
  { parentCode: 'HARDWARE', code: 'HARDWARE_MONITOR', nameTh: 'ຈໍພາບ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 30 },
  { parentCode: 'HARDWARE', code: 'HARDWARE_PERIPHERAL', nameTh: 'ເມົ້າ ຄີບອດ ແລະ ອຸປະກອນຕໍ່ພ່ວງ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 40 },
  { parentCode: 'HARDWARE', code: 'HARDWARE_REQUEST', nameTh: 'ຂໍອຸປະກອນໃໝ່ / ປ່ຽນເຄື່ອງ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 50 },

  // ── ຊອບແວ ແລະ ແອັບພລິເຄຊັນ ──
  { parentCode: 'SOFTWARE', code: 'SOFTWARE_ERROR', nameTh: 'ໂປຣແກຣມຂຶ້ນຂໍ້ຜິດພາດ ຫຼື ປິດເອງ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 10 },
  { parentCode: 'SOFTWARE', code: 'SOFTWARE_INSTALL', nameTh: 'ຕິດຕັ້ງ / ອັບເດດໂປຣແກຣມ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 20 },
  { parentCode: 'SOFTWARE', code: 'SOFTWARE_OFFICE', nameTh: 'Microsoft Office', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 30 },
  { parentCode: 'SOFTWARE', code: 'SOFTWARE_LICENSE', nameTh: 'License ໝົດອາຍຸ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 40 },

  // ── ອີເມວ ແລະ ບັນຊີຜູ້ໃຊ້ ──
  { parentCode: 'EMAIL', code: 'EMAIL_SEND_RECEIVE', nameTh: 'ສົ່ງ ຫຼື ຮັບອີເມວບໍ່ໄດ້', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 10 },
  { parentCode: 'EMAIL', code: 'EMAIL_PASSWORD', nameTh: 'ລືມລະຫັດຜ່ານ / ບັນຊີຖືກລັອກ', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 20 },
  { parentCode: 'EMAIL', code: 'EMAIL_MAILBOX_FULL', nameTh: 'ກ່ອງຈົດໝາຍເຕັມ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 30 },
  { parentCode: 'EMAIL', code: 'EMAIL_NEW_ACCOUNT', nameTh: 'ຂໍບັນຊີອີເມວໃໝ່', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 40 },

  // ── ເຄື່ອງພິມ ແລະ ເຄື່ອງສະແກນ ──
  // เครื่องพิมพ์ส่วนใหญ่ใช้ร่วมทั้งแผนก พิมพ์ไม่ออกจึงกระทบระดับแผนก
  { parentCode: 'PRINTER', code: 'PRINTER_NOT_PRINTING', nameTh: 'ພິມບໍ່ອອກ', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 10 },
  { parentCode: 'PRINTER', code: 'PRINTER_QUALITY', nameTh: 'ເຈ້ຍຕິດ ຫຼື ພິມບໍ່ຊັດ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 20 },
  { parentCode: 'PRINTER', code: 'PRINTER_TONER', nameTh: 'ໝຶກໝົດ / ປ່ຽນຕະລັບໝຶກ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 30 },
  { parentCode: 'PRINTER', code: 'PRINTER_SCAN', nameTh: 'ສະແກນບໍ່ໄດ້', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 40 },
  { parentCode: 'PRINTER', code: 'PRINTER_SETUP', nameTh: 'ຕິດຕັ້ງເຄື່ອງພິມໃສ່ຄອມພິວເຕີ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 50 },

  // ── ສິດເຂົ້າເຖິງລະບົບ ──
  { parentCode: 'ACCESS', code: 'ACCESS_NEW', nameTh: 'ຂໍສິດເຂົ້າລະບົບໃໝ່', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 10 },
  { parentCode: 'ACCESS', code: 'ACCESS_CHANGE', nameTh: 'ປ່ຽນ ຫຼື ເພີ່ມສິດ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 20 },
  // ถอนสิทธิ์คนที่ออกไปแล้วช้าเท่ากับเปิดประตูทิ้งไว้ — ความเร่งด่วนสูงกว่าการขอสิทธิ์ใหม่
  { parentCode: 'ACCESS', code: 'ACCESS_REVOKE', nameTh: 'ຍົກເລີກສິດ (ພະນັກງານລາອອກ / ຍ້າຍພະແນກ)', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 30 },
  { parentCode: 'ACCESS', code: 'ACCESS_SHARED_FOLDER', nameTh: 'ສິດໂຟນເດີແບ່ງປັນ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 40 },

  // ── ຄວາມປອດໄພຂໍ້ມູນ ──
  { parentCode: 'SECURITY', code: 'SECURITY_PHISHING', nameTh: 'ອີເມວຫຼອກລວງ (Phishing)', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 10 },
  { parentCode: 'SECURITY', code: 'SECURITY_MALWARE', nameTh: 'ໄວຣັສ / ມັລແວ / Ransomware', defaultImpact: 'org_wide', defaultUrgency: 'high', sortOrder: 20 },
  { parentCode: 'SECURITY', code: 'SECURITY_ACCOUNT', nameTh: 'ບັນຊີຖືກໃຊ້ງານຜິດປົກກະຕິ', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 30 },
  { parentCode: 'SECURITY', code: 'SECURITY_DATA_LEAK', nameTh: 'ຂໍ້ມູນຮົ່ວໄຫຼ', defaultImpact: 'org_wide', defaultUrgency: 'high', sortOrder: 40 },

  // ── ກ້ອງວົງຈອນປິດ ──
  { parentCode: 'CCTV', code: 'CCTV_NO_SIGNAL', nameTh: 'ກ້ອງບໍ່ມີພາບ / ອອບລາຍ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 10 },
  { parentCode: 'CCTV', code: 'CCTV_PLAYBACK', nameTh: 'ຂໍເບິ່ງພາບຍ້ອນຫຼັງ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 20 },
  { parentCode: 'CCTV', code: 'CCTV_INSTALL', nameTh: 'ຂໍຕິດຕັ້ງ ຫຼື ຍ້າຍກ້ອງ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 30 },

  // ── ໂທລະສັບ ແລະ ອຸປະກອນເຄື່ອນທີ່ ──
  { parentCode: 'MOBILE', code: 'MOBILE_SETUP', nameTh: 'ຕັ້ງຄ່າອີເມວ / ແອັບບໍລິສັດໃນມືຖື', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 10 },
  { parentCode: 'MOBILE', code: 'MOBILE_BROKEN', nameTh: 'ມືຖື ຫຼື ແທັບເລັດບໍລິສັດເສຍ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 20 },
  { parentCode: 'MOBILE', code: 'MOBILE_SIM', nameTh: 'ຊິມ / ແພັກເກັດອິນເຕີເນັດ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 30 },

  // ── ຂໍສິດໃຊ້ເຄື່ອງມື AI ──
  { parentCode: 'AI_TOOLS', code: 'AI_TOOLS_CHAT', nameTh: 'ຂໍບັນຊີ AI ແຊັດ (ChatGPT · Claude · Gemini)', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 10 },
  { parentCode: 'AI_TOOLS', code: 'AI_TOOLS_COPILOT', nameTh: 'Microsoft Copilot', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 20 },
  { parentCode: 'AI_TOOLS', code: 'AI_TOOLS_PROBLEM', nameTh: 'ໃຊ້ງານເຄື່ອງມື AI ບໍ່ໄດ້', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 30 },
  { parentCode: 'AI_TOOLS', code: 'AI_TOOLS_OTHER', nameTh: 'ເຄື່ອງມື AI ອື່ນ ໆ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 40 },

  // ── Super Work ──
  { parentCode: 'SUPER_WORK', code: 'SUPER_WORK_LOGIN', nameTh: 'ເຂົ້າລະບົບ Super Work ບໍ່ໄດ້', defaultImpact: 'individual', defaultUrgency: 'high', sortOrder: 10 },
  { parentCode: 'SUPER_WORK', code: 'SUPER_WORK_ERROR', nameTh: 'ລະບົບຂຶ້ນຂໍ້ຜິດພາດ', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 20 },
  { parentCode: 'SUPER_WORK', code: 'SUPER_WORK_ACCOUNT', nameTh: 'ຂໍບັນຊີ ຫຼື ປ່ຽນສິດ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 30 },
  { parentCode: 'SUPER_WORK', code: 'SUPER_WORK_HOWTO', nameTh: 'ສອບຖາມວິທີໃຊ້ງານ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 40 },

  // ── Magic — แยกตามโมดูล ทีมที่ดูแลแต่ละโมดูลเป็นคนละกลุ่ม ──
  { parentCode: 'MAGIC', code: 'MAGIC_AUDIT', nameTh: 'Magic-Audit', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 10 },
  { parentCode: 'MAGIC', code: 'MAGIC_ACCOUNT', nameTh: 'Magic-Account', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 20 },
  { parentCode: 'MAGIC', code: 'MAGIC_FINANCE', nameTh: 'Magic-Finance', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 30 },
  { parentCode: 'MAGIC', code: 'MAGIC_ASSET', nameTh: 'Magic-Asset', defaultImpact: 'department', defaultUrgency: 'medium', sortOrder: 40 },
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
      { sortOrder: 10, titleTh: 'ສ້າງບັນຊີຜູ້ໃຊ້ ແລະ ອີເມວ', isRequired: true, evidenceRequired: false, defaultRoleCode: 'agent' },
      { sortOrder: 20, titleTh: 'ມອບສິດເຂົ້າເຖິງລະບົບຕາມໜ້າທີ່', isRequired: true, evidenceRequired: true, defaultRoleCode: 'agent' },
      { sortOrder: 30, titleTh: 'ຕຽມເຄື່ອງຄອມພິວເຕີ ແລະ ຕິດຕັ້ງຊອບແວມາດຕະຖານ', isRequired: true, evidenceRequired: false, defaultRoleCode: 'agent' },
      { sortOrder: 40, titleTh: 'ຕິດຕັ້ງໂປຣແກຣມປ້ອງກັນໄວຣັສ', isRequired: true, evidenceRequired: false, defaultRoleCode: 'agent' },
      { sortOrder: 50, titleTh: 'ບັນທຶກອຸປະກອນເຂົ້າທະບຽນຊັບສິນ', isRequired: true, evidenceRequired: true, defaultRoleCode: 'agent' },
      { sortOrder: 60, titleTh: 'ຊີ້ແຈງນະໂຍບາຍຄວາມປອດໄພ ແລະ ໃຫ້ເຊັນຮັບຮູ້', isRequired: true, evidenceRequired: true, defaultRoleCode: 'agent' },
      { sortOrder: 70, titleTh: 'ບັງຄັບປ່ຽນລະຫັດຜ່ານເມື່ອເຂົ້າໃຊ້ຄັ້ງທຳອິດ', isRequired: true, evidenceRequired: false, defaultRoleCode: 'agent' },
    ],
  },
  {
    code: 'OFFBOARDING',
    nameTh: 'ພະນັກງານລາອອກ',
    docRef: 'AIDC-IT-SOP-001',
    items: [
      { sortOrder: 10, titleTh: 'ປິດການໃຊ້ງານບັນຊີຜູ້ໃຊ້ທັນທີໃນວັນສຸດທ້າຍ', isRequired: true, evidenceRequired: true, defaultRoleCode: 'agent' },
      { sortOrder: 20, titleTh: 'ຖອນສິດເຂົ້າເຖິງທຸກລະບົບ', isRequired: true, evidenceRequired: true, defaultRoleCode: 'agent' },
      { sortOrder: 30, titleTh: 'ຮັບຄືນອຸປະກອນ ແລະ ບັນທຶກສະພາບ', isRequired: true, evidenceRequired: true, defaultRoleCode: 'agent' },
      { sortOrder: 40, titleTh: 'ໂອນຂໍ້ມູນ ແລະ ໄຟລ໌ວຽກໃຫ້ຫົວໜ້າ', isRequired: true, evidenceRequired: false, defaultRoleCode: 'agent' },
      { sortOrder: 50, titleTh: 'ຕັ້ງການສົ່ງຕໍ່ອີເມວຕາມທີ່ຫົວໜ້າກຳນົດ', isRequired: false, evidenceRequired: false, defaultRoleCode: 'agent' },
      { sortOrder: 60, titleTh: 'ລຶບບັນຊີອອກຈາກກຸ່ມ ແລະ ລາຍຊື່ສົ່ງອີເມວ', isRequired: true, evidenceRequired: false, defaultRoleCode: 'agent' },
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
    categoryCode: 'ACCESS',
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
    categoryCode: 'ACCESS',
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
    categoryCode: 'ACCESS',
    defaultImpact: 'individual',
    defaultUrgency: 'medium',
    defaultPriority: 'P4',
    targetMinutes: 540,
    clockStartEvent: 'after_approval',
    requiresApproval: true,
    approvalChain: 'department_head,system_owner',
    checklistTemplateCode: null,
  },
  {
    code: 'SR-SOFTWARE-INSTALL',
    nameTh: 'ຕິດຕັ້ງຊອບແວ',
    categoryCode: 'SOFTWARE',
    defaultImpact: 'individual',
    defaultUrgency: 'medium',
    defaultPriority: 'P4',
    targetMinutes: 1080,
    clockStartEvent: 'after_approval',
    requiresApproval: true,
    approvalChain: 'department_head',
    checklistTemplateCode: null,
  },
  {
    code: 'SR-EQUIPMENT',
    nameTh: 'ຈັດຫາອຸປະກອນໄອທີ',
    categoryCode: 'HARDWARE',
    defaultImpact: 'individual',
    defaultUrgency: 'low',
    defaultPriority: 'P4',
    targetMinutes: 5400,
    // งบต้องอนุมัติก่อนสั่งซื้อ ระยะเวลาจัดหาจึงเริ่มนับหลังอนุมัติงบ
    clockStartEvent: 'after_budget_approval',
    requiresApproval: true,
    approvalChain: 'department_head,head_of_it',
    checklistTemplateCode: null,
  },
  {
    code: 'SR-ONBOARDING',
    nameTh: 'ຕຽມລະບົບໃຫ້ພະນັກງານໃໝ່',
    categoryCode: 'ACCESS',
    defaultImpact: 'individual',
    defaultUrgency: 'medium',
    defaultPriority: 'P4',
    targetMinutes: 1080,
    clockStartEvent: 'after_approval',
    requiresApproval: true,
    approvalChain: 'department_head',
    checklistTemplateCode: 'ONBOARDING',
  },
  {
    code: 'SR-OFFBOARDING',
    nameTh: 'ປິດສິດພະນັກງານລາອອກ',
    categoryCode: 'ACCESS',
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
    categoryCode: 'EMAIL',
    defaultImpact: 'individual',
    defaultUrgency: 'medium',
    defaultPriority: 'P4',
    targetMinutes: 540,
    clockStartEvent: 'after_approval',
    requiresApproval: true,
    approvalChain: 'department_head',
    checklistTemplateCode: null,
  },
  {
    code: 'SR-VPN',
    nameTh: 'ຂໍໃຊ້ງານ VPN',
    categoryCode: 'ACCESS',
    defaultImpact: 'individual',
    defaultUrgency: 'medium',
    defaultPriority: 'P4',
    targetMinutes: 540,
    clockStartEvent: 'after_approval',
    requiresApproval: true,
    approvalChain: 'department_head,head_of_it',
    checklistTemplateCode: null,
  },
  {
    code: 'SR-CONSULT',
    nameTh: 'ສອບຖາມວິທີໃຊ້ງານ',
    categoryCode: 'OTHER',
    defaultImpact: 'individual',
    defaultUrgency: 'low',
    defaultPriority: 'P4',
    targetMinutes: 540,
    clockStartEvent: 'on_create',
    requiresApproval: false,
    approvalChain: null,
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
