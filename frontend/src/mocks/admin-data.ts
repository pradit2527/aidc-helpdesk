/**
 * ข้อมูลจำลองของโมดูลผู้ดูแลระบบ
 *
 * แยกจาก data.ts เพราะเป็นคนละกลุ่มผู้ใช้และคนละรอบการเปลี่ยนแปลง
 * ตารางเหล่านี้ผู้ใช้ทั่วไปไม่เคยเห็น และแก้เมื่อโครงสร้างองค์กรเปลี่ยนเท่านั้น
 *
 * ทุกฟิลด์ตรงกับ src/lib/types.ts ซึ่งตรงกับ schema จริงใน backend
 */

import { DAY, at } from '@/mocks/data';
import type {
  ApprovedSoftware,
  CatalogItem,
  ChecklistTemplate,
  EscalationContact,
  EscalationRule,
  MaintenanceWindow,
  ProblemRecord,
  ServiceOutage,
  ServiceRecord,
} from '@/lib/types';

/**
 * 🔴 ยังไม่มีผู้รับแจ้งระดับ head_of_it / ceo / dpo (Q-07 — บล็อก go-live)
 *
 * ตั้งใจไม่ใส่ชื่อสมมติไว้ก่อน เพราะจะดูเหมือนตั้งค่าครบแล้วทั้งที่ยังไม่ครบ
 * ตราบใดที่ยังขาด กฎ ES-01, ES-02, ES-03, ES-06, ES-07, ES-10, ES-11
 * จะประเมินผลได้แต่ส่งแจ้งเตือนไม่ถึงใครเลย
 */
export const ESCALATION_CONTACTS: EscalationContact[] = [
  {
    id: 1,
    company: null,
    contact_key: 'incident_manager',
    user: { id: 88, full_name: 'ພູວົງ ສີສຸກ' },
    is_primary: true,
    is_active: true,
  },
  {
    id: 2,
    company: { id: 5, code: 'AIDC-TECH' },
    contact_key: 'tier2_group',
    user: { id: 90, full_name: 'ທະນູ ວັດທະນາ' },
    is_primary: true,
    is_active: true,
  },
  {
    id: 3,
    company: null,
    contact_key: 'tier3_group',
    user: { id: 91, full_name: 'ສົມຍິງ ຈັນທະວົງ' },
    is_primary: true,
    is_active: true,
  },
];

export const ESCALATION_RULES: EscalationRule[] = [
  { id: 1, company: null, code: 'ES-01', trigger_type: 'p1_created', priority: 'P1', threshold_minutes: 0, threshold_clock_mode: 'calendar_24x7', notify_contact_keys: 'head_of_it,incident_manager,tier2_group', notify_roles: null, repeat_interval_minutes: null, notify_outside_business_hours: true, is_active: true },
  { id: 2, company: null, code: 'ES-02', trigger_type: 'p1_prolonged', priority: 'P1', threshold_minutes: 240, threshold_clock_mode: 'calendar_24x7', notify_contact_keys: 'ceo,head_of_it', notify_roles: null, repeat_interval_minutes: 60, notify_outside_business_hours: true, is_active: true },
  { id: 3, company: null, code: 'ES-03', trigger_type: 'security_incident', priority: null, threshold_minutes: 30, threshold_clock_mode: 'calendar_24x7', notify_contact_keys: 'head_of_it,ceo,dpo', notify_roles: null, repeat_interval_minutes: null, notify_outside_business_hours: true, is_active: true },
  { id: 4, company: null, code: 'ES-04', trigger_type: 'tier1_timeout', priority: null, threshold_minutes: 120, threshold_clock_mode: 'business_hours', notify_contact_keys: 'tier2_group', notify_roles: 'company_admin', repeat_interval_minutes: null, notify_outside_business_hours: false, is_active: true },
  { id: 5, company: null, code: 'ES-05', trigger_type: 'tier3_escalated', priority: null, threshold_minutes: null, threshold_clock_mode: 'business_hours', notify_contact_keys: 'tier3_group,head_of_it', notify_roles: null, repeat_interval_minutes: null, notify_outside_business_hours: false, is_active: true },
  { id: 6, company: null, code: 'ES-06', trigger_type: 'sla_breached', priority: null, threshold_minutes: null, threshold_clock_mode: 'business_hours', notify_contact_keys: 'head_of_it', notify_roles: 'company_admin', repeat_interval_minutes: 540, notify_outside_business_hours: false, is_active: true },
  { id: 7, company: null, code: 'ES-07', trigger_type: 'service_review_requested', priority: null, threshold_minutes: null, threshold_clock_mode: 'business_hours', notify_contact_keys: 'head_of_it', notify_roles: null, repeat_interval_minutes: null, notify_outside_business_hours: false, is_active: true },
  { id: 8, company: null, code: 'ES-08', trigger_type: 'priority_review_requested', priority: null, threshold_minutes: null, threshold_clock_mode: 'business_hours', notify_contact_keys: '', notify_roles: 'company_admin', repeat_interval_minutes: null, notify_outside_business_hours: false, is_active: true },
  { id: 9, company: null, code: 'ES-09', trigger_type: 'status_report_due', priority: null, threshold_minutes: null, threshold_clock_mode: 'business_hours', notify_contact_keys: 'incident_manager', notify_roles: null, repeat_interval_minutes: null, notify_outside_business_hours: true, is_active: true },
  { id: 10, company: null, code: 'ES-10', trigger_type: 'rca_overdue', priority: 'P1', threshold_minutes: 2700, threshold_clock_mode: 'business_hours', notify_contact_keys: 'head_of_it', notify_roles: null, repeat_interval_minutes: null, notify_outside_business_hours: false, is_active: true },
  { id: 11, company: null, code: 'ES-11', trigger_type: 'repeat_incident', priority: 'P1', threshold_minutes: 129600, threshold_clock_mode: 'calendar_24x7', notify_contact_keys: 'head_of_it,ceo', notify_roles: null, repeat_interval_minutes: null, notify_outside_business_hours: false, is_active: true },
  { id: 12, company: null, code: 'ES-12', trigger_type: 'sla_warning', priority: null, threshold_minutes: null, threshold_clock_mode: 'business_hours', notify_contact_keys: '', notify_roles: null, repeat_interval_minutes: null, notify_outside_business_hours: false, is_active: true },
];

export const SERVICES: ServiceRecord[] = [
  { id: 1, company: null, code: 'ERP', name_th: 'ລະບົບ ERP', service_group: 'core_business', service_tier: 'critical', owner: { id: 90, full_name: 'ທະນູ ວັດທະນາ' }, is_24x7: true, is_active: true, uptime_percent_month: 99.94, open_outage_count: 0 },
  { id: 2, company: { id: 7, code: 'AIDC-LOG' }, code: 'WMS', name_th: 'ລະບົບຄັງສິນຄ້າ (WMS)', service_group: 'core_business', service_tier: 'critical', owner: { id: 88, full_name: 'ພູວົງ ສີສຸກ' }, is_24x7: true, is_active: true, uptime_percent_month: 99.81, open_outage_count: 1 },
  { id: 3, company: null, code: 'NET-CORE', name_th: 'ເຄືອຂ່າຍຫຼັກ', service_group: 'infrastructure', service_tier: 'critical', owner: { id: 90, full_name: 'ທະນູ ວັດທະນາ' }, is_24x7: true, is_active: true, uptime_percent_month: 99.97, open_outage_count: 0 },
  { id: 4, company: null, code: 'MAIL', name_th: 'ອີເມວອົງກອນ', service_group: 'communication', service_tier: 'high', owner: { id: 90, full_name: 'ທະນູ ວັດທະນາ' }, is_24x7: false, is_active: true, uptime_percent_month: 99.62, open_outage_count: 0 },
  { id: 5, company: null, code: 'FILE', name_th: 'ບ່ອນເກັບໄຟລ໌ກາງ', service_group: 'file_storage', service_tier: 'high', owner: null, is_24x7: false, is_active: true, uptime_percent_month: 99.55, open_outage_count: 0 },
  { id: 6, company: { id: 7, code: 'AIDC-LOG' }, code: 'GPS', name_th: 'ລະບົບຕິດຕາມລົດ', service_group: 'core_business', service_tier: 'standard', owner: { id: 88, full_name: 'ພູວົງ ສີສຸກ' }, is_24x7: false, is_active: true, uptime_percent_month: 98.4, open_outage_count: 1 },
  { id: 7, company: null, code: 'ENDPOINT', name_th: 'ເຄື່ອງຄອມພິວເຕີພະນັກງານ', service_group: 'endpoint', service_tier: 'standard', owner: null, is_24x7: false, is_active: true, uptime_percent_month: null, open_outage_count: 0 },
];

export const SERVICE_OUTAGES: ServiceOutage[] = [
  { id: 1, service: { id: 2, name_th: 'ລະບົບຄັງສິນຄ້າ (WMS)' }, ticket: { id: 1038, ticket_no: 'AIDC-LOG-202608-0038' }, started_at: at(-4 * 60), ended_at: null, is_planned: false, cause: 'service ຢຸດເອງຕອນ 06:12 ກຳລັງກວດ log', recorded_by: { id: 88, full_name: 'ພູວົງ ສີສຸກ' } },
  { id: 2, service: { id: 6, name_th: 'ລະບົບຕິດຕາມລົດ' }, ticket: { id: 1027, ticket_no: 'AIDC-LOG-202608-0027' }, started_at: at(-3 * DAY), ended_at: null, is_planned: false, cause: 'ອຸປະກອນ GPS ເສຍ ລໍຖ້າອາໄຫຼ່ຈາກຜູ້ໃຫ້ບໍລິການ', recorded_by: { id: 88, full_name: 'ພູວົງ ສີສຸກ' } },
  { id: 3, service: { id: 4, name_th: 'ອີເມວອົງກອນ' }, ticket: null, started_at: at(-12 * DAY), ended_at: at(-12 * DAY + 95), is_planned: false, cause: 'ຄິວສົ່ງອີເມວຄ້າງຫຼັງອັບເດດ', recorded_by: { id: 90, full_name: 'ທະນູ ວັດທະນາ' } },
  { id: 4, service: { id: 1, name_th: 'ລະບົບ ERP' }, ticket: null, started_at: at(-20 * DAY), ended_at: at(-20 * DAY + 180), is_planned: true, cause: 'ບຳລຸງຮັກສາຕາມແຜນ — ບໍ່ນັບເປັນ Downtime', recorded_by: { id: 90, full_name: 'ທະນູ ວັດທະນາ' } },
];

/**
 * ปิดปรับปรุงตามแผน — ต้องแจ้งล่วงหน้าอย่างน้อย 3 วันทำการ (SLA 3.1, ข้อ 9)
 * แถวที่ยังไม่แจ้งหรือแจ้งไม่ทันจะถูกทำเครื่องหมายในหน้าจอ
 */
export const MAINTENANCE_WINDOWS: MaintenanceWindow[] = [
  { id: 1, company: null, service: { id: 1, name_th: 'ລະບົບ ERP' }, planned_start: at(7 * DAY), planned_end: at(7 * DAY + 240), notified_at: at(-2 * DAY), notice_lead_business_days: 3, description: 'ອັບເດດ patch ປະຈຳໄຕມາດ', created_by: { id: 90, full_name: 'ທະນູ ວັດທະນາ' } },
  { id: 2, company: { id: 7, code: 'AIDC-LOG' }, service: { id: 2, name_th: 'ລະບົບຄັງສິນຄ້າ (WMS)' }, planned_start: at(2 * DAY), planned_end: at(2 * DAY + 180), notified_at: null, notice_lead_business_days: 3, description: 'ຍ້າຍຖານຂໍ້ມູນໄປເຊີບເວີໃໝ່', created_by: { id: 88, full_name: 'ພູວົງ ສີສຸກ' } },
];

export const PROBLEMS: ProblemRecord[] = [
  { id: 1, company: { id: 7, code: 'AIDC-LOG' }, code: 'PRB-2569-0004', title: 'WMS ຢຸດໃຫ້ບໍລິການເປັນຊ່ວງໃນຊົ່ວໂມງເລັ່ງດ່ວນ', service: { id: 2, name_th: 'ລະບົບຄັງສິນຄ້າ (WMS)' }, root_cause_code: null, root_cause_note: null, status: 'rca_pending', opened_at: at(-4 * 60), rca_due_at: at(5 * DAY), rca_submitted_at: null, owner: { id: 90, full_name: 'ທະນູ ວັດທະນາ' }, closed_at: null, linked_incident_count: 3 },
  { id: 2, company: { id: 7, code: 'AIDC-LOG' }, code: 'PRB-2569-0003', title: 'GPS ບາງຄັນບໍ່ສົ່ງພິກັດຫຼັງອຸປະກອນຮ້ອນ', service: { id: 6, name_th: 'ລະບົບຕິດຕາມລົດ' }, root_cause_code: 'hardware', root_cause_note: 'ອຸປະກອນລຸ້ນເກົ່າທົນອຸນຫະພູມໃນລົດບໍ່ໄຫວ ຕ້ອງປ່ຽນລຸ້ນ', status: 'fixed', opened_at: at(-30 * DAY), rca_due_at: at(-25 * DAY), rca_submitted_at: at(-26 * DAY), owner: { id: 88, full_name: 'ພູວົງ ສີສຸກ' }, closed_at: null, linked_incident_count: 7 },
  { id: 3, company: null, code: 'PRB-2569-0001', title: 'ອີເມວຂາອອກຄ້າງຄິວຫຼັງອັບເດດ', service: { id: 4, name_th: 'ອີເມວອົງກອນ' }, root_cause_code: 'change', root_cause_note: 'patch ປ່ຽນຄ່າ queue worker ໂດຍບໍ່ໄດ້ແຈ້ງລ່ວງໜ້າ', status: 'closed', opened_at: at(-60 * DAY), rca_due_at: at(-55 * DAY), rca_submitted_at: at(-57 * DAY), owner: { id: 90, full_name: 'ທະນູ ວັດທະນາ' }, closed_at: at(-50 * DAY), linked_incident_count: 2 },
];

export const CATALOG_ITEMS: CatalogItem[] = [
  { id: 1, company: null, code: 'SR-PASSWORD-RESET', name_th: 'ຣີເຊັດລະຫັດຜ່ານ', category: { id: 7, name_th: 'ສິດເຂົ້າເຖິງລະບົບ' }, default_priority: 'P4', target_minutes: 30, clock_start_event: 'after_identity_verified', requires_approval: false, approval_chain: null, checklist_template: null, is_active: true },
  { id: 2, company: null, code: 'SR-UNLOCK-ACCOUNT', name_th: 'ປົດລັອກບັນຊີຜູ້ໃຊ້', category: { id: 7, name_th: 'ສິດເຂົ້າເຖິງລະບົບ' }, default_priority: 'P4', target_minutes: 30, clock_start_event: 'after_identity_verified', requires_approval: false, approval_chain: null, checklist_template: null, is_active: true },
  { id: 3, company: null, code: 'SR-ACCESS', name_th: 'ຂໍສິດເຂົ້າເຖິງລະບົບ', category: { id: 7, name_th: 'ສິດເຂົ້າເຖິງລະບົບ' }, default_priority: 'P4', target_minutes: 540, clock_start_event: 'after_approval', requires_approval: true, approval_chain: 'department_head,system_owner', checklist_template: null, is_active: true },
  { id: 4, company: null, code: 'SR-SOFTWARE-INSTALL', name_th: 'ຕິດຕັ້ງຊອບແວ', category: { id: 3, name_th: 'ຊອບແວ ແລະ ແອັບພລິເຄຊັນ' }, default_priority: 'P4', target_minutes: 1080, clock_start_event: 'after_approval', requires_approval: true, approval_chain: 'department_head', checklist_template: null, is_active: true },
  { id: 5, company: null, code: 'SR-EQUIPMENT', name_th: 'ຈັດຫາອຸປະກອນໄອທີ', category: { id: 2, name_th: 'ອຸປະກອນຄອມພິວເຕີ' }, default_priority: 'P4', target_minutes: 5400, clock_start_event: 'after_budget_approval', requires_approval: true, approval_chain: 'department_head,head_of_it', checklist_template: null, is_active: true },
  { id: 6, company: null, code: 'SR-ONBOARDING', name_th: 'ຕຽມລະບົບໃຫ້ພະນັກງານໃໝ່', category: { id: 7, name_th: 'ສິດເຂົ້າເຖິງລະບົບ' }, default_priority: 'P4', target_minutes: 1080, clock_start_event: 'after_approval', requires_approval: true, approval_chain: 'department_head', checklist_template: { id: 1, name_th: 'ຮັບພະນັກງານໃໝ່' }, is_active: true },
  { id: 7, company: null, code: 'SR-OFFBOARDING', name_th: 'ປິດສິດພະນັກງານລາອອກ', category: { id: 7, name_th: 'ສິດເຂົ້າເຖິງລະບົບ' }, default_priority: 'P4', target_minutes: 540, clock_start_event: 'on_create', requires_approval: false, approval_chain: null, checklist_template: { id: 2, name_th: 'ພະນັກງານລາອອກ' }, is_active: true },
  { id: 8, company: null, code: 'SR-EMAIL-ACCOUNT', name_th: 'ຂໍບັນຊີອີເມວ', category: { id: 5, name_th: 'ອີເມວ ແລະ ບັນຊີຜູ້ໃຊ້' }, default_priority: 'P4', target_minutes: 540, clock_start_event: 'after_approval', requires_approval: true, approval_chain: 'department_head', checklist_template: null, is_active: true },
  { id: 9, company: null, code: 'SR-VPN', name_th: 'ຂໍໃຊ້ງານ VPN', category: { id: 7, name_th: 'ສິດເຂົ້າເຖິງລະບົບ' }, default_priority: 'P4', target_minutes: 540, clock_start_event: 'after_approval', requires_approval: true, approval_chain: 'department_head,head_of_it', checklist_template: null, is_active: true },
  { id: 10, company: null, code: 'SR-CONSULT', name_th: 'ສອບຖາມວິທີໃຊ້ງານ', category: { id: 11, name_th: 'ອື່ນ ໆ' }, default_priority: 'P4', target_minutes: 540, clock_start_event: 'on_create', requires_approval: false, approval_chain: null, checklist_template: null, is_active: true },
];

export const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  {
    id: 1,
    company: null,
    code: 'ONBOARDING',
    name_th: 'ຮັບພະນັກງານໃໝ່',
    doc_ref: 'AIDC-IT-SOP-001',
    version: 1,
    is_active: true,
    items: [
      { id: 1, sort_order: 10, title_th: 'ສ້າງບັນຊີຜູ້ໃຊ້ ແລະ ອີເມວ', is_required: true, evidence_required: false, default_role_code: 'agent' },
      { id: 2, sort_order: 20, title_th: 'ມອບສິດເຂົ້າເຖິງລະບົບຕາມໜ້າທີ່', is_required: true, evidence_required: true, default_role_code: 'agent' },
      { id: 3, sort_order: 30, title_th: 'ຕຽມເຄື່ອງຄອມພິວເຕີ ແລະ ຕິດຕັ້ງຊອບແວມາດຕະຖານ', is_required: true, evidence_required: false, default_role_code: 'agent' },
      { id: 4, sort_order: 40, title_th: 'ຕິດຕັ້ງໂປຣແກຣມປ້ອງກັນໄວຣັສ', is_required: true, evidence_required: false, default_role_code: 'agent' },
      { id: 5, sort_order: 50, title_th: 'ບັນທຶກອຸປະກອນເຂົ້າທະບຽນຊັບສິນ', is_required: true, evidence_required: true, default_role_code: 'agent' },
      { id: 6, sort_order: 60, title_th: 'ຊີ້ແຈງນະໂຍບາຍຄວາມປອດໄພ ແລະ ໃຫ້ເຊັນຮັບຮູ້', is_required: true, evidence_required: true, default_role_code: 'agent' },
      { id: 7, sort_order: 70, title_th: 'ບັງຄັບປ່ຽນລະຫັດຜ່ານເມື່ອເຂົ້າໃຊ້ຄັ້ງທຳອິດ', is_required: true, evidence_required: false, default_role_code: 'agent' },
    ],
  },
  {
    id: 2,
    company: null,
    code: 'OFFBOARDING',
    name_th: 'ພະນັກງານລາອອກ',
    doc_ref: 'AIDC-IT-SOP-001',
    version: 1,
    is_active: true,
    items: [
      { id: 8, sort_order: 10, title_th: 'ປິດການໃຊ້ງານບັນຊີຜູ້ໃຊ້ທັນທີໃນວັນສຸດທ້າຍ', is_required: true, evidence_required: true, default_role_code: 'agent' },
      { id: 9, sort_order: 20, title_th: 'ຖອນສິດເຂົ້າເຖິງທຸກລະບົບ', is_required: true, evidence_required: true, default_role_code: 'agent' },
      { id: 10, sort_order: 30, title_th: 'ຮັບຄືນອຸປະກອນ ແລະ ບັນທຶກສະພາບ', is_required: true, evidence_required: true, default_role_code: 'agent' },
      { id: 11, sort_order: 40, title_th: 'ໂອນຂໍ້ມູນ ແລະ ໄຟລ໌ວຽກໃຫ້ຫົວໜ້າ', is_required: true, evidence_required: false, default_role_code: 'agent' },
      { id: 12, sort_order: 50, title_th: 'ຕັ້ງການສົ່ງຕໍ່ອີເມວຕາມທີ່ຫົວໜ້າກຳນົດ', is_required: false, evidence_required: false, default_role_code: 'agent' },
      { id: 13, sort_order: 60, title_th: 'ລຶບບັນຊີອອກຈາກກຸ່ມ ແລະ ລາຍຊື່ສົ່ງອີເມວ', is_required: true, evidence_required: false, default_role_code: 'agent' },
      { id: 14, sort_order: 70, title_th: 'ບັນທຶກຜົນເຂົ້າ audit log', is_required: true, evidence_required: true, default_role_code: 'company_admin' },
    ],
  },
];

export const APPROVED_SOFTWARE: ApprovedSoftware[] = [
  { id: 1, company: null, name: 'Microsoft 365 Apps', version: '2024 LTSC', license_type: 'Volume', note: 'ຕິດຕັ້ງໄດ້ທຸກເຄື່ອງພະນັກງານ', is_active: true },
  { id: 2, company: null, name: 'Google Chrome', version: 'ລ່າສຸດ', license_type: 'Freeware', note: null, is_active: true },
  { id: 3, company: null, name: '7-Zip', version: '23.x', license_type: 'Open source', note: null, is_active: true },
  { id: 4, company: { id: 2, code: 'AIDC-CON' }, name: 'AutoCAD', version: '2025', license_type: 'Named user', note: 'ຈຳນວນ license ຈຳກັດ ຕ້ອງຂໍຜ່ານແຄັດຕາລັອກ', is_active: true },
  { id: 5, company: { id: 3, code: 'COSI' }, name: 'Adobe Creative Cloud', version: '2025', license_type: 'Named user', note: 'ສະເພາະທີມອອກແບບ', is_active: true },
  { id: 6, company: null, name: 'AnyDesk', version: null, license_type: null, note: 'ຫ້າມຕິດຕັ້ງ — ໃຊ້ເຄື່ອງມືຄວບຄຸມໄລຍະໄກຂອງອົງກອນແທນ', is_active: false },
];
