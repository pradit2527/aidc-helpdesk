/**
 * Permission 53 รายการ และ Role 5 บทบาท
 * ถอดมาจาก docs/04-rbac-sla.md v2.0 หัวข้อ 2 และ 7 แบบตรงตัว
 *
 * เมทริกซ์ในเอกสารใช้สัญลักษณ์ ✔ / S / O / ✘
 * ที่นี่แปลงเป็น "มีสิทธิ์หรือไม่มี" เท่านั้น เพราะ S (เฉพาะบริษัทตน)
 * และ O (เฉพาะของตน) เป็นเรื่องของ "เห็นแถวไหน" ไม่ใช่ "ทำอะไรได้"
 * จึงบังคับที่ AccessScope กับชั้น query แทน ไม่ใช่ที่ตาราง role_permission
 */

export interface PermissionSeed {
  readonly code: string;
  readonly group: string;
  readonly description: string;
}

export const PERMISSIONS: readonly PermissionSeed[] = [
  // --- ticket (19) ---
  { code: 'ticket.create', group: 'ticket', description: 'ສ້າງເລື່ອງແຈ້ງຂອງຕົນເອງ' },
  { code: 'ticket.create_for_other', group: 'ticket', description: 'ສ້າງເລື່ອງແຈ້ງແທນຜູ້ອື່ນ (ໂທ/ມາດ້ວຍຕົນເອງ)' },
  { code: 'ticket.read', group: 'ticket', description: 'ເບິ່ງເລື່ອງແຈ້ງ' },
  { code: 'ticket.update', group: 'ticket', description: 'ແກ້ໄຂຫົວຂໍ້ ລາຍລະອຽດ ໝວດໝູ່ ບໍລິການ' },
  { code: 'ticket.assign', group: 'ticket', description: 'ມອບໝາຍໃຫ້ຜູ້ອື່ນ' },
  { code: 'ticket.assign_self', group: 'ticket', description: 'ຮັບວຽກເອງ' },
  { code: 'ticket.change_status', group: 'ticket', description: 'ປ່ຽນສະຖານະ' },
  { code: 'ticket.close_own', group: 'ticket', description: 'ຢືນຢັນປິດເລື່ອງຂອງຕົນ' },
  { code: 'ticket.reopen', group: 'ticket', description: 'ເປີດເລື່ອງຄືນ' },
  { code: 'ticket.cancel', group: 'ticket', description: 'ຍົກເລີກເລື່ອງ' },
  { code: 'ticket.change_priority', group: 'ticket', description: 'ປ່ຽນລະດັບຄວາມສຳຄັນ' },
  { code: 'ticket.request_priority_review', group: 'ticket', description: 'ຂໍທົບທວນລະດັບຄວາມສຳຄັນ' },
  { code: 'ticket.set_workaround', group: 'ticket', description: 'ບັນທຶກທາງແກ້ຊົ່ວຄາວ' },
  { code: 'ticket.declare_major_incident', group: 'ticket', description: 'ປະກາດເຫດຮ້າຍແຮງ / ເຫດຄວາມປອດໄພ' },
  { code: 'ticket.comment', group: 'ticket', description: 'ຄອມເມັນສາທາລະນະ' },
  { code: 'ticket.comment_internal', group: 'ticket', description: 'ຄອມເມັນພາຍໃນ' },
  { code: 'ticket.attach', group: 'ticket', description: 'ແນບໄຟລ໌' },
  { code: 'ticket.delete', group: 'ticket', description: 'ລຶບ (soft delete)' },
  { code: 'ticket.view_history', group: 'ticket', description: 'ເບິ່ງປະຫວັດສະຖານະ' },

  // --- approval (4) ---
  { code: 'approval.read', group: 'approval', description: 'ເບິ່ງຂັ້ນຕອນການອະນຸມັດ' },
  { code: 'approval.decide', group: 'approval', description: 'ອະນຸມັດ / ປະຕິເສດ (ກວດທີ່ລະດັບແຖວ ບໍ່ຜູກກັບ role)' },
  { code: 'approval.manage', group: 'approval', description: 'ປ່ຽນຜູ້ອະນຸມັດເມື່ອຫາຄົນບໍ່ໄດ້' },
  { code: 'checklist.update', group: 'approval', description: 'ຕິກລາຍການ checklist ແລະ ແນບຫຼັກຖານ' },

  // --- user (6) ---
  { code: 'user.read', group: 'user', description: 'ເບິ່ງລາຍຊື່ຜູ້ໃຊ້' },
  { code: 'user.create', group: 'user', description: 'ສ້າງຜູ້ໃຊ້' },
  { code: 'user.update', group: 'user', description: 'ແກ້ໄຂຜູ້ໃຊ້' },
  { code: 'user.delete', group: 'user', description: 'ປິດການໃຊ້ງານຜູ້ໃຊ້' },
  { code: 'user.assign_role', group: 'user', description: 'ມອບ role' },
  { code: 'user.reset_password', group: 'user', description: 'ຣີເຊັດລະຫັດຜ່ານ ແລະ ປົດລັອກບັນຊີ' },

  // --- org (3) ---
  { code: 'company.manage', group: 'org', description: 'ສ້າງ / ແກ້ໄຂບໍລິສັດ' },
  { code: 'department.manage', group: 'org', description: 'ຈັດການພະແນກ' },
  { code: 'category.manage', group: 'org', description: 'ຈັດການໝວດໝູ່ catalog ແລະ checklist template' },

  // --- sla (6) ---
  { code: 'sla.read', group: 'sla', description: 'ເບິ່ງຄ່າ SLA ເວລາເຮັດວຽກ ວັນພັກ' },
  { code: 'sla.manage', group: 'sla', description: 'ແກ້ SLA policy / target / ຂໍ້ຍົກເວັ້ນ' },
  { code: 'business_hours.manage', group: 'sla', description: 'ແກ້ເວລາເຮັດວຽກ ແລະ ວັນພັກ' },
  { code: 'escalation.manage', group: 'sla', description: 'ແກ້ກົດ escalation ແລະ ຜູ້ຮັບແຈ້ງ' },
  { code: 'service.manage', group: 'sla', description: 'ທະບຽນລະບົບງານ ເຫດຂັດຂ້ອງ ໜ້າຕ່າງບຳລຸງຮັກສາ' },
  { code: 'problem.manage', group: 'sla', description: 'ຈັດການ Problem ແລະ RCA' },

  // --- kb (7) ---
  { code: 'kb.read', group: 'kb', description: 'ອ່ານຄັງຄວາມຮູ້' },
  { code: 'kb.create', group: 'kb', description: 'ສ້າງບົດຄວາມ' },
  { code: 'kb.update', group: 'kb', description: 'ແກ້ໄຂບົດຄວາມ' },
  { code: 'kb.publish', group: 'kb', description: 'ເຜີຍແຜ່ບົດຄວາມ' },
  { code: 'kb.delete', group: 'kb', description: 'ລຶບບົດຄວາມ' },
  { code: 'kb.manage_category', group: 'kb', description: 'ຈັດການໝວດໝູ່ຄັງຄວາມຮູ້' },
  { code: 'kb.feedback', group: 'kb', description: 'ໃຫ້ຄະແນນບົດຄວາມ' },

  // --- report (3) ---
  { code: 'dashboard.view', group: 'report', description: 'ເບິ່ງແດຊບອດ' },
  { code: 'report.view', group: 'report', description: 'ເບິ່ງລາຍງານ' },
  { code: 'report.export', group: 'report', description: 'ສົ່ງອອກລາຍງານ' },

  // --- admin (4) ---
  { code: 'role.read', group: 'admin', description: 'ເບິ່ງ role / permission' },
  { code: 'role.manage', group: 'admin', description: 'ແກ້ permission ຂອງ role' },
  { code: 'audit.read', group: 'admin', description: 'ອ່ານ audit log' },
  { code: 'system.manage', group: 'admin', description: 'ຂໍ້ມູນລະບົບ ສະຖານະ backup ຊອບແວທີ່ອະນຸມັດ' },

  // --- notification (1) ---
  { code: 'notification.manage_own', group: 'notification', description: 'ຈັດການຊ່ອງທາງແຈ້ງເຕືອນຂອງຕົນ' },
];

/**
 * approval.decide อยู่ในตาราง permission แต่ไม่เคยถูกมอบผ่าน role_permission
 * สิทธิ์นี้ตรวจที่ approval_request.approver_id ของแถวนั้นโดยตรง
 * เพราะผู้อนุมัติอาจเป็นหัวหน้าหน่วยงานที่ไม่ได้เป็น agent เลย
 * (docs/04-rbac-sla.md §1.1 ข้อ 7 และ §7 หมายเหตุท้ายตาราง)
 */
export const ROW_LEVEL_ONLY_PERMISSIONS: readonly string[] = ['approval.decide'];

export interface RoleSeed {
  readonly code: string;
  readonly nameTh: string;
  readonly description: string;
  /** null = ได้ทุก permission ยกเว้นกลุ่มที่ตรวจระดับแถว */
  readonly permissions: readonly string[] | null;
}

const END_USER_PERMISSIONS = [
  'ticket.create',
  'ticket.read',
  'ticket.update',
  'ticket.close_own',
  'ticket.reopen',
  'ticket.cancel',
  'ticket.request_priority_review',
  'ticket.comment',
  'ticket.attach',
  'ticket.view_history',
  'approval.read',
  'user.read',
  'user.update',
  'sla.read',
  'kb.read',
  'kb.feedback',
  'notification.manage_own',
];

const AGENT_PERMISSIONS = [
  // ทุกอย่างของ ticket ยกเว้นการลบ
  'ticket.create',
  'ticket.create_for_other',
  'ticket.read',
  'ticket.update',
  'ticket.assign',
  'ticket.assign_self',
  'ticket.change_status',
  'ticket.close_own',
  'ticket.reopen',
  'ticket.cancel',
  'ticket.change_priority',
  'ticket.request_priority_review',
  'ticket.set_workaround',
  'ticket.declare_major_incident',
  'ticket.comment',
  'ticket.comment_internal',
  'ticket.attach',
  'ticket.view_history',
  'approval.read',
  'checklist.update',
  'user.read',
  'user.update',
  // นโยบาย 3.2 บังคับให้ปลดล็อกบัญชีผ่าน Service Desk ซึ่งคือ agent
  // และคำขอนี้มีเป้าหมาย 30 นาทีทำการ ถ้าต้องรอ company_admin จะไม่ทัน
  'user.reset_password',
  'sla.read',
  // บันทึกเหตุขัดข้องต้องทำทันทีตอนเกิดเหตุ ไม่ใช่รอผู้ดูแล
  'service.manage',
  'problem.manage',
  'kb.read',
  'kb.create',
  'kb.update',
  'kb.feedback',
  'dashboard.view',
  'report.view',
  'report.export',
  'notification.manage_own',
];

const COMPANY_ADMIN_PERMISSIONS = [
  'ticket.create',
  'ticket.create_for_other',
  'ticket.read',
  'ticket.update',
  'ticket.assign',
  'ticket.assign_self',
  'ticket.change_status',
  'ticket.close_own',
  'ticket.reopen',
  'ticket.cancel',
  'ticket.change_priority',
  'ticket.request_priority_review',
  'ticket.set_workaround',
  'ticket.declare_major_incident',
  'ticket.comment',
  'ticket.comment_internal',
  'ticket.attach',
  'ticket.delete',
  'ticket.view_history',
  'approval.read',
  'approval.manage',
  'checklist.update',
  'user.read',
  'user.create',
  'user.update',
  'user.delete',
  'user.assign_role',
  'user.reset_password',
  'department.manage',
  'category.manage',
  'sla.read',
  'service.manage',
  'problem.manage',
  'kb.read',
  'kb.create',
  'kb.update',
  'kb.publish',
  'kb.delete',
  'kb.manage_category',
  'kb.feedback',
  'dashboard.view',
  'report.view',
  'report.export',
  'role.read',
  'audit.read',
  'notification.manage_own',
];

const MANAGER_VIEWER_PERMISSIONS = [
  'ticket.create',
  'ticket.read',
  'ticket.view_history',
  'approval.read',
  'user.update',
  'sla.read',
  'kb.read',
  'kb.feedback',
  'dashboard.view',
  'report.view',
  'report.export',
  'notification.manage_own',
];

export const ROLES: readonly RoleSeed[] = [
  {
    code: 'end_user',
    nameTh: 'ຜູ້ແຈ້ງ',
    description: 'ພະນັກງານທົ່ວໄປ ເຫັນສະເພາະເລື່ອງທີ່ຕົນແຈ້ງ',
    permissions: END_USER_PERMISSIONS,
  },
  {
    code: 'agent',
    nameTh: 'ເຈົ້າໜ້າທີ່ support',
    description: 'ທີມ IT ເຫັນທຸກເລື່ອງໃນບໍລິສັດທີ່ຢູ່ໃນຂອບເຂດ',
    permissions: AGENT_PERMISSIONS,
  },
  {
    code: 'company_admin',
    nameTh: 'ຜູ້ດູແລລະດັບບໍລິສັດ',
    description: 'ຫົວໜ້າ IT ຂອງແຕ່ລະບໍລິສັດ',
    permissions: COMPANY_ADMIN_PERMISSIONS,
  },
  {
    code: 'manager_viewer',
    nameTh: 'ຜູ້ບໍລິຫານ (ອ່ານຢ່າງດຽວ)',
    description: 'ອ່ານເລື່ອງແຈ້ງ ແລະ ລາຍງານ ໃນບໍລິສັດທີ່ຢູ່ໃນຂອບເຂດ',
    permissions: MANAGER_VIEWER_PERMISSIONS,
  },
  {
    code: 'super_admin',
    nameTh: 'ຜູ້ດູແລລະບົບ',
    description: 'ທຸກບໍລິສັດ ບໍ່ມີຂໍ້ຈຳກັດ — ແນະນຳບໍ່ເກີນ 2 ບັນຊີ',
    permissions: null,
  },
];
