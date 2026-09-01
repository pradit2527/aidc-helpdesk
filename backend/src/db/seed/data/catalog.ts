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
  { code: 'ERP', nameTh: 'ລະບົບ ERP', defaultImpact: 'department', defaultUrgency: 'high', sortOrder: 40 },
  { code: 'EMAIL', nameTh: 'ອີເມວ ແລະ ບັນຊີຜູ້ໃຊ້', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 50 },
  { code: 'PRINTER', nameTh: 'ເຄື່ອງພິມ ແລະ ເຄື່ອງສະແກນ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 60 },
  { code: 'ACCESS', nameTh: 'ສິດເຂົ້າເຖິງລະບົບ', defaultImpact: 'individual', defaultUrgency: 'medium', sortOrder: 70 },
  { code: 'SECURITY', nameTh: 'ຄວາມປອດໄພຂໍ້ມູນ', defaultImpact: 'org_wide', defaultUrgency: 'high', sortOrder: 80 },
  { code: 'CCTV', nameTh: 'ກ້ອງວົງຈອນປິດ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 90 },
  { code: 'MOBILE', nameTh: 'ໂທລະສັບ ແລະ ອຸປະກອນເຄື່ອນທີ່', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 100 },
  { code: 'OTHER', nameTh: 'ອື່ນ ໆ', defaultImpact: 'individual', defaultUrgency: 'low', sortOrder: 999 },
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
