/**
 * ป้ายกำกับภาษาลาวของทุก enum ที่ใช้เฉพาะในโมดูลผู้ดูแลระบบ
 *
 * แยกจาก config/enums.ts เพราะชุดนี้ผู้ใช้ทั่วไปไม่เคยเห็น
 * และรวมไว้ที่เดียวเพื่อไม่ให้แต่ละหน้าแปลคำเดียวกันไม่ตรงกัน
 */

/** ผู้รับแจ้งของกฎ escalation — ตรงกับ CHECK ของ escalation_contact.contact_key */
export const CONTACT_KEY = {
  head_of_it: 'ຫົວໜ້າໄອທີ',
  ceo: 'ຜູ້ບໍລິຫານສູງສຸດ',
  dpo: 'ເຈົ້າໜ້າທີ່ຄຸ້ມຄອງຂໍ້ມູນ (DPO)',
  incident_manager: 'ຜູ້ຈັດການເຫດການ',
  tier2_group: 'ທີມ Tier 2',
  tier3_group: 'ທີມ Tier 3 / ຜູ້ໃຫ້ບໍລິການ',
} as const;

export type ContactKey = keyof typeof CONTACT_KEY;

/**
 * ผู้รับแจ้งสามรายนี้บล็อก go-live ถ้ายังไม่รู้ว่าใครเป็นใคร (Q-07)
 * กฎ ES-01, ES-02, ES-03, ES-06, ES-07, ES-10, ES-11 ส่งแจ้งเตือนไม่ได้เลย
 */
export const BLOCKING_CONTACT_KEYS: ContactKey[] = ['head_of_it', 'ceo', 'dpo'];

/** ทริกเกอร์ของกฎ escalation ES-01…ES-12 (docs/04-rbac-sla.md §4.3) */
export const TRIGGER_TYPE: Record<string, string> = {
  p1_created: 'ເກີດເຫດ P1',
  p1_prolonged: 'P1 ຍືດເຍື້ອເກີນ 4 ຊົ່ວໂມງ',
  security_incident: 'ເຫດຄວາມປອດໄພ',
  tier1_timeout: 'Tier 1 ເກີນ 2 ຊົ່ວໂມງເຮັດວຽກ',
  tier3_escalated: 'ຍົກລະດັບສູ່ Tier 3',
  sla_breached: 'ເກີນກຳນົດ SLA',
  service_review_requested: 'ຜູ້ຮັບບໍລິການຂໍທົບທວນການຈັດການ',
  priority_review_requested: 'ຜູ້ແຈ້ງຂໍທົບທວນລະດັບຄວາມສຳຄັນ',
  status_report_due: 'ຮອບລາຍງານສະຖານະ',
  rca_overdue: 'RCA ຄ້າງເກີນກຳນົດ',
  repeat_incident: 'P1 ຊ້ຳສາເຫດເດີມພາຍໃນ 90 ມື້',
  sla_warning: 'ເຕືອນລ່ວງໜ້າທີ່ 75%',
};

/** กลุ่มระบบงานในทะเบียน — ตรงกับ CHECK ของ service.service_group */
export const SERVICE_GROUP = {
  core_business: 'ລະບົບທຸລະກິດຫຼັກ',
  infrastructure: 'ໂຄງສ້າງພື້ນຖານ',
  communication: 'ການສື່ສານ',
  file_storage: 'ບ່ອນເກັບໄຟລ໌',
  endpoint: 'ອຸປະກອນປາຍທາງ',
  service_request: 'ງານບໍລິການ',
} as const;

export type ServiceGroup = keyof typeof SERVICE_GROUP;

/**
 * ระดับบริการ + เป้าหมายความพร้อมใช้งาน (SLA 5.2)
 * เดือนอ้างอิง 30 วัน = 43,200 นาที
 */
export const SERVICE_TIER = {
  critical: { label: 'Critical', uptime: '99.9%', maxDowntime: '43 ນາທີ/ເດືອນ' },
  high: { label: 'High', uptime: '99.5%', maxDowntime: '216 ນາທີ/ເດືອນ' },
  standard: { label: 'Standard', uptime: '99.0%', maxDowntime: '432 ນາທີ/ເດືອນ' },
} as const;

export type ServiceTier = keyof typeof SERVICE_TIER;

export const PROBLEM_STATUS = {
  open: { label: 'ເປີດຢູ່', className: 'bg-st-new-bg text-st-new-fg' },
  rca_pending: { label: 'ລໍຖ້າ RCA', className: 'bg-st-pending-bg text-st-pending-fg' },
  fixed: { label: 'ແກ້ຖາວອນແລ້ວ', className: 'bg-sla-ok-bg text-sla-ok' },
  closed: { label: 'ປິດແລ້ວ', className: 'bg-st-closed-bg text-st-closed-fg' },
} as const;

export type ProblemStatus = keyof typeof PROBLEM_STATUS;

/** จุดเริ่มนับเวลาของรายการในแค็ตตาล็อก (SLA 5.3) */
export const CLOCK_START_EVENT: Record<string, string> = {
  on_create: 'ເມື່ອສ້າງເລື່ອງ',
  after_identity_verified: 'ຫຼັງຢືນຢັນຕົວຕົນ',
  after_approval: 'ຫຼັງອະນຸມັດຄົບ',
  after_budget_approval: 'ຫຼັງອະນຸມັດງົບ',
};
