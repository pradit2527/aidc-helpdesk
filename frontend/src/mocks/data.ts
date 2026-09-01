/**
 * ข้อมูลจำลองที่ขับทุกหน้าจอระหว่างที่ backend ยังต่อไม่ครบ
 *
 * รูปร่างทุกอย่างตรงกับ src/lib/types.ts ซึ่งตรงกับ docs/03-api-spec.md v2.0
 * เมื่อ endpoint จริงพร้อม ให้เปลี่ยนเฉพาะใน src/mocks/queries.ts ทีละตัว
 * ไม่ต้องแตะหน้าจอเลยแม้แต่ไฟล์เดียว
 *
 * ⚠️ วันที่ทุกค่าคำนวณจาก BASE_TIME ที่ตรึงไว้ ไม่ใช่ new Date() ตอนโหลด
 *    ถ้าใช้เวลาจริง ค่าที่เรนเดอร์บนเซิร์ฟเวอร์กับบนเบราว์เซอร์จะต่างกัน
 *    แล้ว React จะเตือน hydration mismatch ทุกหน้าที่มีวันที่
 */

import type {
  AdminUser,
  ApprovalStep,
  AuditEntry,
  BusinessHoursRow,
  Company,
  DashboardSummary,
  Department,
  Holiday,
  KbArticle,
  NotificationItem,
  PermissionInfo,
  RoleWithPermissions,
  SessionUser,
  SlaComplianceRow,
  SlaPolicy,
  SystemInfo,
  TicketCategory,
  TicketDetail,
  TicketListItem,
} from '@/lib/types';

/** 31 ສິງຫາ 2569 (2026) 12:30 ນ. ຕາມເວລາວຽງຈັນ */
const BASE_TIME = new Date('2026-08-31T05:30:00.000Z');

function at(offsetMinutes: number): string {
  return new Date(BASE_TIME.getTime() + offsetMinutes * 60_000).toISOString();
}

const DAY = 60 * 24;

// ── บริษัท ────────────────────────────────────────────────────────────
export const COMPANIES: Company[] = [
  { id: 1, code: 'AIDC-HQ', name_th: 'AIDC HQ', name_en: 'AIDC HQ', contact_email: 'itsupport@aidctech.com.la', is_active: true, user_count: 84, open_ticket_count: 12 },
  { id: 2, code: 'AIDC-CON', name_th: 'AIDC Construction', name_en: 'AIDC Construction', contact_email: 'itsupport@aidctech.com.la', is_active: true, user_count: 212, open_ticket_count: 27 },
  { id: 3, code: 'COSI', name_th: 'COSI', name_en: 'COSI', contact_email: 'itsupport@aidctech.com.la', is_active: true, user_count: 46, open_ticket_count: 8 },
  { id: 4, code: 'AIDC-HM', name_th: 'Heavy Machine', name_en: 'AIDC Heavy Machine', contact_email: 'itsupport@aidctech.com.la', is_active: true, user_count: 133, open_ticket_count: 15 },
  { id: 5, code: 'AIDC-TECH', name_th: 'AIDC Tech', name_en: 'AIDC Tech', contact_email: 'itsupport@aidctech.com.la', is_active: true, user_count: 61, open_ticket_count: 9 },
  { id: 6, code: 'AIDC-TRD', name_th: 'AIDC Trading', name_en: 'AIDC Trading', contact_email: 'itsupport@aidctech.com.la', is_active: true, user_count: 97, open_ticket_count: 11 },
  { id: 7, code: 'AIDC-LOG', name_th: 'AIDC Logistic', name_en: 'AIDC Logistic', contact_email: 'itsupport@aidctech.com.la', is_active: true, user_count: 178, open_ticket_count: 22 },
];

// ── ผู้ใช้ที่ล็อกอินอยู่ ───────────────────────────────────────────────
export const SESSION: SessionUser = {
  id: 88,
  username: 'phouvong.s',
  full_name: 'ພູວົງ ສີສຸກ',
  email: 'phouvong.s@aidctech.com.la',
  job_title: 'ເຈົ້າໜ້າທີ່ສະໜັບສະໜູນໄອທີ',
  company: { id: 7, code: 'AIDC-LOG', name_th: 'AIDC Logistic' },
  department: { id: 24, name: 'ໄອທີ' },
  roles: ['agent', 'company_admin', 'super_admin'],
  scoped_companies: [
    { id: 7, code: 'AIDC-LOG' },
    { id: 2, code: 'AIDC-CON' },
  ],
  permissions: [],
  must_change_password: false,
  unread_notifications: 5,
};

// ── เรื่องแจ้ง ─────────────────────────────────────────────────────────
export const TICKETS: TicketListItem[] = [
  {
    id: 1038,
    ticket_no: 'AIDC-LOG-202608-0038',
    ticket_type: 'incident',
    subject: 'WMS ເຂົ້າລະບົບບໍ່ໄດ້ທັງສາງ',
    status: 'new',
    pending_reason: null,
    priority: 'P1',
    support_tier: 1,
    company: { id: 7, code: 'AIDC-LOG' },
    department: { id: 22, name: 'ຄັງສິນຄ້າ' },
    category: { id: 78, name_th: 'ລະບົບ ERP' },
    requester: { id: 145, full_name: 'ສົມຊາຍ ກິດຕິວັດ' },
    assignee: null,
    sla: { status: 'breached', remaining_minutes: -72, remaining_unit: 'calendar_minutes', resolution_due_at: at(-72), is_resolution_breached: true },
    reopen_count: 0,
    comment_count: 1,
    attachment_count: 0,
    updated_at: at(-3),
  },
  {
    id: 1042,
    ticket_no: 'AIDC-LOG-202608-0042',
    ticket_type: 'incident',
    subject: 'ເຄື່ອງສະແກນບາໂຄດຄັງ 2 ອ່ານບໍ່ຕິດ',
    status: 'in_progress',
    pending_reason: null,
    priority: 'P2',
    support_tier: 1,
    company: { id: 7, code: 'AIDC-LOG' },
    department: { id: 22, name: 'ຄັງສິນຄ້າ' },
    category: { id: 79, name_th: 'ອຸປະກອນຄອມພິວເຕີ' },
    requester: { id: 145, full_name: 'ສົມຊາຍ ກິດຕິວັດ' },
    assignee: { id: 88, full_name: 'ພູວົງ ສີສຸກ' },
    sla: { status: 'at_risk', remaining_minutes: 42, remaining_unit: 'business_minutes', resolution_due_at: at(42), is_resolution_breached: false },
    reopen_count: 0,
    comment_count: 3,
    attachment_count: 2,
    updated_at: at(-88),
  },
  {
    id: 1035,
    ticket_no: 'AIDC-CON-202608-0035',
    ticket_type: 'incident',
    subject: 'ເຄື່ອງພິມແບບພິມບໍ່ອອກກ່ອນປະຊຸມໜ້າວຽກ',
    status: 'assigned',
    pending_reason: null,
    priority: 'P3',
    support_tier: 1,
    company: { id: 2, code: 'AIDC-CON' },
    department: { id: 11, name: 'ໜ້າວຽກກໍ່ສ້າງ' },
    category: { id: 41, name_th: 'ເຄື່ອງພິມ ແລະ ເຄື່ອງສະແກນ' },
    requester: { id: 201, full_name: 'ຄຳໃສ ພົມມະຈັນ' },
    assignee: { id: 90, full_name: 'ທະນູ ວັດທະນາ' },
    sla: { status: 'on_track', remaining_minutes: 310, remaining_unit: 'business_minutes', resolution_due_at: at(DAY + 120), is_resolution_breached: false },
    reopen_count: 0,
    comment_count: 2,
    attachment_count: 1,
    updated_at: at(-DAY),
  },
  {
    id: 1031,
    ticket_no: 'AIDC-LOG-202608-0031',
    ticket_type: 'service_request',
    subject: 'ຂໍສິດເຂົ້າເຖິງໂຟນເດີງົບປະມານ 2570',
    status: 'pending_user',
    pending_reason: 'approval',
    priority: 'P4',
    support_tier: 1,
    company: { id: 7, code: 'AIDC-LOG' },
    department: { id: 30, name: 'ບັນຊີ ແລະ ການເງິນ' },
    category: { id: 55, name_th: 'ສິດເຂົ້າເຖິງລະບົບ' },
    requester: { id: 210, full_name: 'ກັນລະຍາ ຈະເລີນ' },
    assignee: { id: 91, full_name: 'ສົມຍິງ ຈັນທະວົງ' },
    sla: { status: 'paused', remaining_minutes: null, remaining_unit: 'business_minutes', resolution_due_at: '', is_resolution_breached: false },
    reopen_count: 0,
    comment_count: 4,
    attachment_count: 1,
    updated_at: at(-2 * DAY),
  },
  {
    id: 1027,
    ticket_no: 'AIDC-LOG-202608-0027',
    ticket_type: 'incident',
    subject: 'GPS ລົດທະບຽນ 82-4471 ບໍ່ສົ່ງພິກັດ ລໍຖ້າອາໄຫຼ່ຈາກຜູ້ໃຫ້ບໍລິການ',
    status: 'pending_user',
    pending_reason: 'vendor',
    priority: 'P2',
    support_tier: 3,
    company: { id: 7, code: 'AIDC-LOG' },
    department: { id: 24, name: 'ຂົນສົ່ງ' },
    category: { id: 82, name_th: 'ໂທລະສັບ ແລະ ອຸປະກອນເຄື່ອນທີ່' },
    requester: { id: 220, full_name: 'ບຸນມີ ແກ້ວມະນີ' },
    assignee: { id: 88, full_name: 'ພູວົງ ສີສຸກ' },
    sla: { status: 'paused', remaining_minutes: null, remaining_unit: 'business_minutes', resolution_due_at: at(3 * DAY), is_resolution_breached: false },
    reopen_count: 0,
    comment_count: 6,
    attachment_count: 2,
    updated_at: at(-3 * DAY),
  },
  {
    id: 1024,
    ticket_no: 'AIDC-TECH-202608-0024',
    ticket_type: 'incident',
    subject: 'Wi-Fi ຊັ້ນ 3 ອາຄານ B ຫຼຸດເປັນຊ່ວງ',
    status: 'resolved',
    pending_reason: null,
    priority: 'P3',
    support_tier: 2,
    company: { id: 5, code: 'AIDC-TECH' },
    department: { id: 50, name: 'ພັດທະນາລະບົບ' },
    category: { id: 33, name_th: 'ເຄືອຂ່າຍ ແລະ ອິນເຕີເນັດ' },
    requester: { id: 230, full_name: 'ວິໄລ ສຸວັນນະ' },
    assignee: { id: 90, full_name: 'ທະນູ ວັດທະນາ' },
    sla: { status: 'on_track', remaining_minutes: null, remaining_unit: 'business_minutes', resolution_due_at: at(-2 * DAY), is_resolution_breached: false },
    reopen_count: 1,
    comment_count: 8,
    attachment_count: 0,
    updated_at: at(-4 * DAY),
  },
  {
    id: 1019,
    ticket_no: 'AIDC-HQ-202608-0019',
    ticket_type: 'service_request',
    subject: 'ຂໍປ່ຽນເມົ້າ (ຜູ້ແຈ້ງຍົກເລີກເອງ)',
    status: 'cancelled',
    pending_reason: null,
    priority: 'P4',
    support_tier: 1,
    company: { id: 1, code: 'AIDC-HQ' },
    department: { id: 60, name: 'ບໍລິຫານ' },
    category: { id: 12, name_th: 'ອຸປະກອນຄອມພິວເຕີ' },
    requester: { id: 240, full_name: 'ນາງ ດາລາ ພັນທະວົງ' },
    assignee: null,
    sla: { status: 'on_track', remaining_minutes: null, remaining_unit: 'business_minutes', resolution_due_at: '', is_resolution_breached: false },
    reopen_count: 0,
    comment_count: 1,
    attachment_count: 0,
    updated_at: at(-5 * DAY),
  },
  {
    id: 1015,
    ticket_no: 'AIDC-CON-202608-0015',
    ticket_type: 'service_request',
    subject: 'ຕິດຕັ້ງ AutoCAD ໃຫ້ພະນັກງານໃໝ່ 3 ຄົນ',
    status: 'closed',
    pending_reason: null,
    priority: 'P4',
    support_tier: 1,
    company: { id: 2, code: 'AIDC-CON' },
    department: { id: 11, name: 'ອອກແບບ' },
    category: { id: 30, name_th: 'ຊອບແວ ແລະ ແອັບພລິເຄຊັນ' },
    requester: { id: 250, full_name: 'ສີສະຫວາດ ອິນທະວົງ' },
    assignee: { id: 91, full_name: 'ສົມຍິງ ຈັນທະວົງ' },
    sla: { status: 'on_track', remaining_minutes: null, remaining_unit: 'business_minutes', resolution_due_at: at(-6 * DAY), is_resolution_breached: false },
    reopen_count: 0,
    comment_count: 5,
    attachment_count: 3,
    updated_at: at(-7 * DAY),
  },
];

const APPROVALS: ApprovalStep[] = [
  {
    id: 501,
    seq: 1,
    approver: { id: 260, full_name: 'ຫົວໜ້າພະແນກການເງິນ' },
    status: 'approved',
    comment: 'ອະນຸມັດ ພະນັກງານຢູ່ໃນທີມງົບປະມານຈິງ',
    decided_at: at(-2 * DAY + 180),
  },
  {
    id: 502,
    seq: 2,
    approver: { id: 261, full_name: 'ເຈົ້າຂອງລະບົບ (System Owner)' },
    status: 'pending',
    comment: null,
    decided_at: null,
  },
];

/** รายละเอียดเต็มของเรื่อง — เติมฟิลด์ที่หน้ารายการไม่ต้องใช้ */
export function ticketDetail(id: number): TicketDetail | null {
  const base = TICKETS.find((t) => t.id === id);
  if (!base) return null;

  const isRequest = base.ticket_type === 'service_request';
  const closed = ['resolved', 'closed', 'cancelled'].includes(base.status);

  return {
    ...base,
    description:
      base.id === 1038
        ? 'ຕັ້ງແຕ່ເຊົ້າ ພະນັກງານຄັງທຸກຄົນເຂົ້າລະບົບ WMS ບໍ່ໄດ້ ຂຶ້ນວ່າ "ບໍ່ສາມາດເຊື່ອມຕໍ່ເຊີບເວີ" ຮັບເຂົ້າ-ຈ່າຍອອກສິນຄ້າບໍ່ໄດ້ທັງໝົດ ລົດຂົນສົ່ງລໍຖ້າຢູ່ໜ້າຄັງ 6 ຄັນ'
        : 'ລາຍລະອຽດຂອງເລື່ອງທີ່ຜູ້ແຈ້ງກອກເຂົ້າມາ ພ້ອມສິ່ງທີ່ໄດ້ລອງແກ້ໄຂເບື້ອງຕົ້ນແລ້ວ',
    channel: 'portal',
    impact: base.priority === 'P1' ? 'org_wide' : base.priority === 'P2' ? 'department' : 'individual',
    urgency: base.priority === 'P1' || base.priority === 'P2' ? 'high' : base.priority === 'P4' ? 'low' : 'medium',
    created_at: at(-4 * 60),
    first_response_at: base.status === 'new' ? null : at(-3 * 60),
    response_due_at: at(-3 * 60 - 45),
    resolved_at: closed ? at(-2 * DAY) : null,
    resolution_note: closed ? 'ປ່ຽນອຸປະກອນ ແລະ ທົດສອບການໃຊ້ງານກັບຜູ້ແຈ້ງແລ້ວ' : null,
    workaround_at: base.id === 1027 ? at(-2 * DAY) : null,
    workaround_note: base.id === 1027 ? 'ໃຊ້ການລາຍງານພິກັດດ້ວຍມືຜ່ານວິທະຍຸແທນຊົ່ວຄາວ' : null,
    vendor_ref: base.support_tier === 3 ? 'VND-2569-0114' : null,
    is_major_incident: base.priority === 'P1',
    is_security_incident: false,
    satisfaction_score: base.status === 'closed' ? 5 : null,
    can: {
      update: !closed,
      assign: !closed,
      assign_self: !closed && base.assignee === null,
      change_status: !closed,
      change_priority: !closed,
      request_priority_review: !closed,
      set_workaround: !closed && base.ticket_type === 'incident',
      declare_major_incident: !closed,
      comment: true,
      comment_internal: true,
      attach: !closed,
      close_own: base.status === 'resolved',
      reopen: base.status === 'resolved' || base.status === 'closed',
      cancel: base.status === 'new',
      delete: false,
      view_history: true,
    },
    comments: [
      {
        id: 9001,
        author: base.requester,
        body: 'ລອງປິດເປີດເຄື່ອງແລ້ວ ຍັງເປັນຄືເກົ່າ ຂໍຄວາມຊ່ວຍເຫຼືອດ່ວນ',
        is_internal: false,
        created_at: at(-4 * 60 + 10),
        attachments: [{ id: 1, file_name: 'ໜ້າຈໍຂໍ້ຜິດພາດ.jpg', file_size: 842_113 }],
      },
      {
        id: 9002,
        author: { id: 88, full_name: 'ພູວົງ ສີສຸກ' },
        body: 'ຮັບເລື່ອງແລ້ວ ກຳລັງກວດເຊີບເວີ ຈະລາຍງານຄວາມຄືບໜ້າພາຍໃນ 1 ຊົ່ວໂມງ',
        is_internal: false,
        created_at: at(-3 * 60),
        attachments: [],
      },
      {
        id: 9003,
        author: { id: 90, full_name: 'ທະນູ ວັດທະນາ' },
        body: 'ກວດແລ້ວ service ຂອງ WMS ຢຸດເອງຕອນ 06:12 — ກຳລັງເບິ່ງ log ຕໍ່',
        is_internal: true,
        created_at: at(-2 * 60),
        attachments: [],
      },
    ],
    history: [
      { id: 8001, actor: base.requester, field: 'status', from_value: null, to_value: 'new', reason: null, created_at: at(-4 * 60) },
      { id: 8002, actor: { id: 88, full_name: 'ພູວົງ ສີສຸກ' }, field: 'assignee', from_value: null, to_value: 'ພູວົງ ສີສຸກ', reason: null, created_at: at(-3 * 60 - 5) },
      { id: 8003, actor: { id: 88, full_name: 'ພູວົງ ສີສຸກ' }, field: 'priority', from_value: 'P2', to_value: 'P1', reason: 'ກະທົບການຮັບ-ຈ່າຍສິນຄ້າທັງຄັງ ບໍ່ມີທາງລ່ຽງ', created_at: at(-3 * 60) },
    ],
    approvals: isRequest ? APPROVALS : [],
    checklist:
      base.id === 1015
        ? [
            { id: 7001, title: 'ສ້າງບັນຊີຜູ້ໃຊ້ ແລະ ອີເມວ', is_required: true, evidence_required: false, is_done: true, done_by: { id: 91, full_name: 'ສົມຍິງ ຈັນທະວົງ' }, done_at: at(-7 * DAY) },
            { id: 7002, title: 'ມອບສິດເຂົ້າເຖິງລະບົບຕາມໜ້າທີ່', is_required: true, evidence_required: true, is_done: true, done_by: { id: 91, full_name: 'ສົມຍິງ ຈັນທະວົງ' }, done_at: at(-7 * DAY) },
            { id: 7003, title: 'ຕິດຕັ້ງໂປຣແກຣມປ້ອງກັນໄວຣັສ', is_required: true, evidence_required: false, is_done: false, done_by: null, done_at: null },
          ]
        : [],
  };
}

// ── คลังความรู้ ────────────────────────────────────────────────────────
export const KB_ARTICLES: KbArticle[] = [
  {
    id: 301,
    title: 'ວິທີແກ້ເມື່ອເຂົ້າ Wi-Fi ຂອງບໍລິສັດບໍ່ໄດ້',
    summary: 'ຂັ້ນຕອນກວດ 5 ຢ່າງກ່ອນແຈ້ງໄອທີ ໃຊ້ໄດ້ທັງຄອມ ແລະ ໂທລະສັບ',
    body_markdown:
      '## ກ່ອນແຈ້ງໄອທີ ລອງກວດ 5 ຂໍ້ນີ້\n\n1. ເປີດ–ປິດ Wi-Fi ໃໝ່ອີກຄັ້ງ\n2. ກວດວ່າເລືອກຊື່ເຄືອຂ່າຍ `AIDC-STAFF` ບໍ່ແມ່ນ `AIDC-GUEST`\n3. ລືມເຄືອຂ່າຍແລ້ວເຂົ້າໃໝ່ ພ້ອມພິມລະຫັດຜ່ານຄືນ\n4. ກວດວ່າໂໝດເຮືອບິນປິດຢູ່\n5. ຣີສະຕາດເຄື່ອງ\n\n> ຖ້າຄົບ 5 ຂໍ້ແລ້ວຍັງບໍ່ໄດ້ ໃຫ້ແຈ້ງເລື່ອງພ້ອມບອກຊັ້ນ ແລະ ອາຄານທີ່ຢູ່',
    category: { id: 2, name_th: 'ເຄືອຂ່າຍ ແລະ ອິນເຕີເນັດ' },
    visibility: 'public',
    status: 'published',
    tags: ['wifi', 'ເຄືອຂ່າຍ'],
    author: { id: 90, full_name: 'ທະນູ ວັດທະນາ' },
    view_count: 1284,
    helpful_count: 96,
    not_helpful_count: 7,
    published_at: at(-30 * DAY),
    updated_at: at(-6 * DAY),
  },
  {
    id: 302,
    title: 'ຣີເຊັດລະຫັດຜ່ານດ້ວຍຕົນເອງ',
    summary: 'ຂັ້ນຕອນຢືນຢັນຕົວຕົນກັບ Service Desk ແລະ ຕັ້ງລະຫັດໃໝ່',
    body_markdown:
      '## ຂັ້ນຕອນ\n\n1. ໂທຫາ Service Desk ຫຼື ແຈ້ງເລື່ອງປະເພດ **ຂໍບໍລິການ**\n2. ຢືນຢັນຕົວຕົນດ້ວຍລະຫັດພະນັກງານ ແລະ ວັນເດືອນປີເກີດ\n3. ຮັບລະຫັດຊົ່ວຄາວ ແລ້ວປ່ຽນທັນທີເມື່ອເຂົ້າສູ່ລະບົບ\n\nເປົ້າໝາຍເວລາ: **30 ນາທີເຮັດວຽກ** ນັບຫຼັງຢືນຢັນຕົວຕົນສຳເລັດ',
    category: { id: 3, name_th: 'ອີເມວ ແລະ ບັນຊີຜູ້ໃຊ້' },
    visibility: 'public',
    status: 'published',
    tags: ['ລະຫັດຜ່ານ', 'ບັນຊີ'],
    author: { id: 88, full_name: 'ພູວົງ ສີສຸກ' },
    view_count: 2140,
    helpful_count: 173,
    not_helpful_count: 12,
    published_at: at(-60 * DAY),
    updated_at: at(-12 * DAY),
  },
  {
    id: 303,
    title: 'ຂັ້ນຕອນຮັບມືເມື່ອສົງໄສວ່າຖືກຫຼອກລວງທາງອີເມວ',
    summary: 'ສິ່ງທີ່ຕ້ອງເຮັດພາຍໃນ 30 ນາທີ ແລະ ສິ່ງທີ່ຫ້າມເຮັດເດັດຂາດ',
    body_markdown:
      '## ຫ້າມເຮັດ\n\n- ຫ້າມກົດລິ້ງ ຫຼື ເປີດໄຟລ໌ແນບ\n- ຫ້າມລຶບອີເມວນັ້ນ (ເປັນຫຼັກຖານ)\n\n## ຕ້ອງເຮັດທັນທີ\n\n1. ຖ່າຍພາບໜ້າຈໍໄວ້\n2. ແຈ້ງເລື່ອງໝວດ **ຄວາມປອດໄພຂໍ້ມູນ** ທັນທີ\n3. ຖ້າກົດລິ້ງໄປແລ້ວ ໃຫ້ຕັດເຄືອຂ່າຍຂອງເຄື່ອງທັນທີ ແລ້ວໂທແຈ້ງ',
    category: { id: 6, name_th: 'ຄວາມປອດໄພຂໍ້ມູນ' },
    visibility: 'internal',
    status: 'published',
    tags: ['ຄວາມປອດໄພ', 'phishing'],
    author: { id: 88, full_name: 'ພູວົງ ສີສຸກ' },
    view_count: 615,
    helpful_count: 58,
    not_helpful_count: 2,
    published_at: at(-14 * DAY),
    updated_at: at(-2 * DAY),
  },
  {
    id: 304,
    title: 'ວິທີກວດເບື້ອງຕົ້ນເມື່ອເຄື່ອງພິມພິມບໍ່ອອກ',
    summary: 'ໄລ່ຈາກສາຍໄຟຈົນເຖິງຄິວງານພິມ',
    body_markdown:
      '1. ກວດວ່າເຄື່ອງພິມເປີດຢູ່ ແລະ ບໍ່ມີໄຟສີແດງກະພິບ\n2. ກວດເຈ້ຍ ແລະ ໝຶກ\n3. ລຶບຄິວງານພິມທີ່ຄ້າງທັງໝົດແລ້ວສັ່ງພິມໃໝ່\n4. ກວດວ່າເລືອກເຄື່ອງພິມຖືກຕົວ',
    category: { id: 1, name_th: 'ແກ້ບັນຫາເບື້ອງຕົ້ນ' },
    visibility: 'public',
    status: 'draft',
    tags: ['ເຄື່ອງພິມ'],
    author: { id: 91, full_name: 'ສົມຍິງ ຈັນທະວົງ' },
    view_count: 0,
    helpful_count: 0,
    not_helpful_count: 0,
    published_at: null,
    updated_at: at(-1 * DAY),
  },
];

export const KB_CATEGORIES = [
  { id: 1, name_th: 'ແກ້ບັນຫາເບື້ອງຕົ້ນ' },
  { id: 2, name_th: 'ເຄືອຂ່າຍ ແລະ ອິນເຕີເນັດ' },
  { id: 3, name_th: 'ອີເມວ ແລະ ບັນຊີຜູ້ໃຊ້' },
  { id: 4, name_th: 'ຊອບແວສຳນັກງານ' },
  { id: 5, name_th: 'ລະບົບ ERP' },
  { id: 6, name_th: 'ຄວາມປອດໄພຂໍ້ມູນ' },
  { id: 7, name_th: 'ຄູ່ມືການໃຊ້ງານລະບົບ Helpdesk' },
];

// ── การแจ้งเตือน ───────────────────────────────────────────────────────
export const NOTIFICATIONS: NotificationItem[] = [
  { id: 601, event_type: 'sla_breached', title: 'ເລື່ອງເກີນກຳນົດ SLA', body: 'AIDC-LOG-202608-0038 ເກີນກຳນົດແກ້ໄຂແລ້ວ 1 ຊົ່ວໂມງ 12 ນາທີ', ticket: { id: 1038, ticket_no: 'AIDC-LOG-202608-0038' }, channel: 'in_app', read_at: null, created_at: at(-40) },
  { id: 602, event_type: 'assigned', title: 'ທ່ານໄດ້ຮັບມອບໝາຍວຽກໃໝ່', body: 'AIDC-LOG-202608-0042 ຖືກມອບໝາຍໃຫ້ທ່ານ', ticket: { id: 1042, ticket_no: 'AIDC-LOG-202608-0042' }, channel: 'in_app', read_at: null, created_at: at(-95) },
  { id: 603, event_type: 'sla_warning', title: 'ໃກ້ຄົບກຳນົດ', body: 'AIDC-LOG-202608-0042 ໃຊ້ເວລາໄປແລ້ວ 75% ຂອງເປົ້າໝາຍ', ticket: { id: 1042, ticket_no: 'AIDC-LOG-202608-0042' }, channel: 'in_app', read_at: null, created_at: at(-130) },
  { id: 604, event_type: 'comment', title: 'ມີຄອມເມັນໃໝ່', body: 'ທະນູ ວັດທະນາ ຄອມເມັນໃນ AIDC-LOG-202608-0038', ticket: { id: 1038, ticket_no: 'AIDC-LOG-202608-0038' }, channel: 'in_app', read_at: null, created_at: at(-120) },
  { id: 605, event_type: 'approval_pending', title: 'ລໍຖ້າການອະນຸມັດຈາກທ່ານ', body: 'AIDC-LOG-202608-0031 ຂັ້ນທີ 2 ລໍຖ້າທ່ານພິຈາລະນາ', ticket: { id: 1031, ticket_no: 'AIDC-LOG-202608-0031' }, channel: 'in_app', read_at: null, created_at: at(-2 * DAY) },
  { id: 606, event_type: 'resolved', title: 'ເລື່ອງຂອງທ່ານຖືກແກ້ໄຂແລ້ວ', body: 'AIDC-TECH-202608-0024 ແກ້ໄຂແລ້ວ ກະລຸນາຢືນຢັນປິດເລື່ອງ', ticket: { id: 1024, ticket_no: 'AIDC-TECH-202608-0024' }, channel: 'in_app', read_at: at(-3 * DAY), created_at: at(-4 * DAY) },
];

// ── ผู้ใช้ ─────────────────────────────────────────────────────────────
export const USERS: AdminUser[] = [
  { id: 88, username: 'phouvong.s', full_name: 'ພູວົງ ສີສຸກ', email: 'phouvong.s@aidctech.com.la', employee_code: 'LOG-0088', phone: '020 5555 0088', job_title: 'ເຈົ້າໜ້າທີ່ສະໜັບສະໜູນໄອທີ', company: { id: 7, code: 'AIDC-LOG' }, department: { id: 24, name: 'ໄອທີ' }, roles: ['agent', 'company_admin'], scoped_companies: [{ id: 7, code: 'AIDC-LOG' }, { id: 2, code: 'AIDC-CON' }], is_active: true, is_locked: false, must_change_password: false, last_login_at: at(-45) },
  { id: 90, username: 'thanou.v', full_name: 'ທະນູ ວັດທະນາ', email: 'thanou.v@aidctech.com.la', employee_code: 'TECH-0090', phone: '020 5555 0090', job_title: 'ຜູ້ດູແລລະບົບເຄືອຂ່າຍ', company: { id: 5, code: 'AIDC-TECH' }, department: { id: 50, name: 'ໂຄງສ້າງພື້ນຖານ' }, roles: ['agent'], scoped_companies: [{ id: 5, code: 'AIDC-TECH' }], is_active: true, is_locked: false, must_change_password: false, last_login_at: at(-180) },
  { id: 91, username: 'somying.c', full_name: 'ສົມຍິງ ຈັນທະວົງ', email: 'somying.c@aidctech.com.la', employee_code: 'CON-0091', phone: '020 5555 0091', job_title: 'ເຈົ້າໜ້າທີ່ Service Desk', company: { id: 2, code: 'AIDC-CON' }, department: { id: 11, name: 'ໄອທີ' }, roles: ['agent'], scoped_companies: [{ id: 2, code: 'AIDC-CON' }], is_active: true, is_locked: false, must_change_password: false, last_login_at: at(-2 * DAY) },
  { id: 145, username: 'somchay.k', full_name: 'ສົມຊາຍ ກິດຕິວັດ', email: null, employee_code: 'LOG-0145', phone: '020 5555 0145', job_title: 'ຫົວໜ້າຄັງສິນຄ້າ', company: { id: 7, code: 'AIDC-LOG' }, department: { id: 22, name: 'ຄັງສິນຄ້າ' }, roles: ['end_user'], scoped_companies: [], is_active: true, is_locked: false, must_change_password: false, last_login_at: at(-20) },
  { id: 210, username: 'kanlaya.j', full_name: 'ກັນລະຍາ ຈະເລີນ', email: 'kanlaya.j@aidctech.com.la', employee_code: 'LOG-0210', phone: null, job_title: 'ນັກບັນຊີ', company: { id: 7, code: 'AIDC-LOG' }, department: { id: 30, name: 'ບັນຊີ ແລະ ການເງິນ' }, roles: ['end_user'], scoped_companies: [], is_active: true, is_locked: true, must_change_password: false, last_login_at: at(-6 * DAY) },
  { id: 260, username: 'boualy.p', full_name: 'ບົວລີ ພົມມະສອນ', email: 'boualy.p@aidctech.com.la', employee_code: 'HQ-0260', phone: '020 5555 0260', job_title: 'ຜູ້ຈັດການຝ່າຍ', company: { id: 1, code: 'AIDC-HQ' }, department: { id: 60, name: 'ບໍລິຫານ' }, roles: ['manager_viewer'], scoped_companies: [{ id: 1, code: 'AIDC-HQ' }], is_active: true, is_locked: false, must_change_password: false, last_login_at: at(-DAY) },
  { id: 301, username: 'admin', full_name: 'ຜູ້ດູແລລະບົບ', email: 'itsupport@aidctech.com.la', employee_code: null, phone: null, job_title: 'Super Admin', company: { id: 5, code: 'AIDC-TECH' }, department: null, roles: ['super_admin'], scoped_companies: [], is_active: true, is_locked: false, must_change_password: true, last_login_at: null },
];

// ── โครงสร้างองค์กร ────────────────────────────────────────────────────
export const DEPARTMENTS: Department[] = [
  { id: 22, company: { id: 7, code: 'AIDC-LOG' }, name: 'ຄັງສິນຄ້າ', user_count: 64, is_active: true },
  { id: 24, company: { id: 7, code: 'AIDC-LOG' }, name: 'ຂົນສົ່ງ', user_count: 88, is_active: true },
  { id: 30, company: { id: 7, code: 'AIDC-LOG' }, name: 'ບັນຊີ ແລະ ການເງິນ', user_count: 12, is_active: true },
  { id: 31, company: { id: 7, code: 'AIDC-LOG' }, name: 'ໄອທີ', user_count: 6, is_active: true },
  { id: 11, company: { id: 2, code: 'AIDC-CON' }, name: 'ໜ້າວຽກກໍ່ສ້າງ', user_count: 140, is_active: true },
  { id: 12, company: { id: 2, code: 'AIDC-CON' }, name: 'ຄວາມປອດໄພ', user_count: 18, is_active: true },
  { id: 13, company: { id: 2, code: 'AIDC-CON' }, name: 'ໄອທີ', user_count: 5, is_active: true },
];

export const TICKET_CATEGORIES: TicketCategory[] = [
  { id: 1, code: 'NETWORK', name_th: 'ເຄືອຂ່າຍ ແລະ ອິນເຕີເນັດ', parent_id: null, company: null, default_impact: 'department', default_urgency: 'high', default_assignee: { id: 90, full_name: 'ທະນູ ວັດທະນາ' }, sort_order: 10, is_active: true },
  { id: 2, code: 'HARDWARE', name_th: 'ອຸປະກອນຄອມພິວເຕີ', parent_id: null, company: null, default_impact: 'individual', default_urgency: 'medium', default_assignee: null, sort_order: 20, is_active: true },
  { id: 3, code: 'SOFTWARE', name_th: 'ຊອບແວ ແລະ ແອັບພລິເຄຊັນ', parent_id: null, company: null, default_impact: 'individual', default_urgency: 'medium', default_assignee: null, sort_order: 30, is_active: true },
  { id: 4, code: 'ERP', name_th: 'ລະບົບ ERP', parent_id: null, company: null, default_impact: 'department', default_urgency: 'high', default_assignee: null, sort_order: 40, is_active: true },
  { id: 5, code: 'EMAIL', name_th: 'ອີເມວ ແລະ ບັນຊີຜູ້ໃຊ້', parent_id: null, company: null, default_impact: 'individual', default_urgency: 'medium', default_assignee: null, sort_order: 50, is_active: true },
  { id: 6, code: 'PRINTER', name_th: 'ເຄື່ອງພິມ ແລະ ເຄື່ອງສະແກນ', parent_id: null, company: null, default_impact: 'individual', default_urgency: 'low', default_assignee: null, sort_order: 60, is_active: true },
  { id: 7, code: 'ACCESS', name_th: 'ສິດເຂົ້າເຖິງລະບົບ', parent_id: null, company: null, default_impact: 'individual', default_urgency: 'medium', default_assignee: null, sort_order: 70, is_active: true },
  { id: 8, code: 'SECURITY', name_th: 'ຄວາມປອດໄພຂໍ້ມູນ', parent_id: null, company: null, default_impact: 'org_wide', default_urgency: 'high', default_assignee: { id: 88, full_name: 'ພູວົງ ສີສຸກ' }, sort_order: 80, is_active: true },
  { id: 9, code: 'CCTV', name_th: 'ກ້ອງວົງຈອນປິດ', parent_id: null, company: null, default_impact: 'individual', default_urgency: 'low', default_assignee: null, sort_order: 90, is_active: true },
  { id: 10, code: 'MOBILE', name_th: 'ໂທລະສັບ ແລະ ອຸປະກອນເຄື່ອນທີ່', parent_id: null, company: null, default_impact: 'individual', default_urgency: 'low', default_assignee: null, sort_order: 100, is_active: true },
  { id: 11, code: 'OTHER', name_th: 'ອື່ນ ໆ', parent_id: null, company: null, default_impact: 'individual', default_urgency: 'low', default_assignee: null, sort_order: 999, is_active: true },
];

// ── SLA และเวลาทำการ ───────────────────────────────────────────────────
export const SLA_POLICY: SlaPolicy = {
  id: 1,
  name: 'AIDC ມາດຕະຖານກຸ່ມ',
  doc_ref: 'AIDC-IT-SLA-001',
  doc_version: '1.1',
  effective_from: '2026-08-01',
  effective_to: null,
  is_default: true,
  targets: [
    { priority: 'P1', response_minutes: 15, resolution_minutes: 240, clock_mode: 'calendar_24x7', status_report_interval_minutes: 60, escalation_percent: 75 },
    { priority: 'P2', response_minutes: 30, resolution_minutes: 480, clock_mode: 'business_hours', status_report_interval_minutes: 240, escalation_percent: 75 },
    { priority: 'P3', response_minutes: 120, resolution_minutes: 1080, clock_mode: 'business_hours', status_report_interval_minutes: null, escalation_percent: 75 },
    { priority: 'P4', response_minutes: 240, resolution_minutes: 2700, clock_mode: 'business_hours', status_report_interval_minutes: null, escalation_percent: 75 },
  ],
};

export const BUSINESS_HOURS: BusinessHoursRow[] = [
  { day_of_week: 0, start_time: '08:30', end_time: '17:30', is_working_day: false },
  { day_of_week: 1, start_time: '08:30', end_time: '17:30', is_working_day: true },
  { day_of_week: 2, start_time: '08:30', end_time: '17:30', is_working_day: true },
  { day_of_week: 3, start_time: '08:30', end_time: '17:30', is_working_day: true },
  { day_of_week: 4, start_time: '08:30', end_time: '17:30', is_working_day: true },
  { day_of_week: 5, start_time: '08:30', end_time: '17:30', is_working_day: true },
  { day_of_week: 6, start_time: '08:30', end_time: '17:30', is_working_day: false },
];

/**
 * 🔴 ปฏิทินวันหยุดฉบับทางการยังไม่ได้รับ (Q-03 — บล็อก go-live)
 *    รายการนี้ว่างโดยตั้งใจ ดีกว่าเดาแล้วคำนวณ SLA ผิดทั้งระบบ
 */
export const HOLIDAYS: Holiday[] = [];

// ── บทบาทและสิทธิ์ ─────────────────────────────────────────────────────
export const PERMISSION_GROUPS: { group: string; label: string; permissions: PermissionInfo[] }[] = [
  {
    group: 'ticket',
    label: 'ເລື່ອງແຈ້ງ',
    permissions: [
      { code: 'ticket.create', group_name: 'ticket', description: 'ສ້າງເລື່ອງແຈ້ງຂອງຕົນເອງ' },
      { code: 'ticket.create_for_other', group_name: 'ticket', description: 'ສ້າງເລື່ອງແຈ້ງແທນຜູ້ອື່ນ' },
      { code: 'ticket.read', group_name: 'ticket', description: 'ເບິ່ງເລື່ອງແຈ້ງ' },
      { code: 'ticket.update', group_name: 'ticket', description: 'ແກ້ໄຂເນື້ອຫາເລື່ອງ' },
      { code: 'ticket.assign', group_name: 'ticket', description: 'ມອບໝາຍໃຫ້ຜູ້ອື່ນ' },
      { code: 'ticket.assign_self', group_name: 'ticket', description: 'ຮັບວຽກເອງ' },
      { code: 'ticket.change_status', group_name: 'ticket', description: 'ປ່ຽນສະຖານະ' },
      { code: 'ticket.close_own', group_name: 'ticket', description: 'ຢືນຢັນປິດເລື່ອງຂອງຕົນ' },
      { code: 'ticket.reopen', group_name: 'ticket', description: 'ເປີດເລື່ອງຄືນ' },
      { code: 'ticket.cancel', group_name: 'ticket', description: 'ຍົກເລີກເລື່ອງ' },
      { code: 'ticket.change_priority', group_name: 'ticket', description: 'ປ່ຽນລະດັບຄວາມສຳຄັນ' },
      { code: 'ticket.request_priority_review', group_name: 'ticket', description: 'ຂໍທົບທວນລະດັບ' },
      { code: 'ticket.set_workaround', group_name: 'ticket', description: 'ບັນທຶກທາງແກ້ຊົ່ວຄາວ' },
      { code: 'ticket.declare_major_incident', group_name: 'ticket', description: 'ປະກາດເຫດຮ້າຍແຮງ' },
      { code: 'ticket.comment', group_name: 'ticket', description: 'ຄອມເມັນສາທາລະນະ' },
      { code: 'ticket.comment_internal', group_name: 'ticket', description: 'ຄອມເມັນພາຍໃນ' },
      { code: 'ticket.attach', group_name: 'ticket', description: 'ແນບໄຟລ໌' },
      { code: 'ticket.delete', group_name: 'ticket', description: 'ລຶບເລື່ອງ' },
      { code: 'ticket.view_history', group_name: 'ticket', description: 'ເບິ່ງປະຫວັດ' },
    ],
  },
  {
    group: 'approval',
    label: 'ການອະນຸມັດ',
    permissions: [
      { code: 'approval.read', group_name: 'approval', description: 'ເບິ່ງຂັ້ນຕອນການອະນຸມັດ' },
      { code: 'approval.decide', group_name: 'approval', description: 'ອະນຸມັດ / ປະຕິເສດ (ກວດທີ່ລະດັບແຖວ)' },
      { code: 'approval.manage', group_name: 'approval', description: 'ປ່ຽນຜູ້ອະນຸມັດ' },
      { code: 'checklist.update', group_name: 'approval', description: 'ຕິກລາຍການ checklist' },
    ],
  },
  {
    group: 'user',
    label: 'ຜູ້ໃຊ້',
    permissions: [
      { code: 'user.read', group_name: 'user', description: 'ເບິ່ງລາຍຊື່ຜູ້ໃຊ້' },
      { code: 'user.create', group_name: 'user', description: 'ສ້າງຜູ້ໃຊ້' },
      { code: 'user.update', group_name: 'user', description: 'ແກ້ໄຂຜູ້ໃຊ້' },
      { code: 'user.delete', group_name: 'user', description: 'ປິດການໃຊ້ງານຜູ້ໃຊ້' },
      { code: 'user.assign_role', group_name: 'user', description: 'ມອບບົດບາດ' },
      { code: 'user.reset_password', group_name: 'user', description: 'ຣີເຊັດລະຫັດ ແລະ ປົດລັອກ' },
    ],
  },
  {
    group: 'org',
    label: 'ອົງກອນ',
    permissions: [
      { code: 'company.manage', group_name: 'org', description: 'ຈັດການບໍລິສັດ' },
      { code: 'department.manage', group_name: 'org', description: 'ຈັດການພະແນກ' },
      { code: 'category.manage', group_name: 'org', description: 'ຈັດການໝວດໝູ່ ແລະ catalog' },
    ],
  },
  {
    group: 'sla',
    label: 'SLA ແລະ ບໍລິການ',
    permissions: [
      { code: 'sla.read', group_name: 'sla', description: 'ເບິ່ງຄ່າ SLA' },
      { code: 'sla.manage', group_name: 'sla', description: 'ແກ້ SLA policy ແລະ target' },
      { code: 'business_hours.manage', group_name: 'sla', description: 'ແກ້ເວລາເຮັດວຽກ ແລະ ວັນພັກ' },
      { code: 'escalation.manage', group_name: 'sla', description: 'ແກ້ກົດ escalation' },
      { code: 'service.manage', group_name: 'sla', description: 'ທະບຽນລະບົບງານ ແລະ ເຫດຂັດຂ້ອງ' },
      { code: 'problem.manage', group_name: 'sla', description: 'ຈັດການ Problem ແລະ RCA' },
    ],
  },
  {
    group: 'kb',
    label: 'ຄັງຄວາມຮູ້',
    permissions: [
      { code: 'kb.read', group_name: 'kb', description: 'ອ່ານບົດຄວາມ' },
      { code: 'kb.create', group_name: 'kb', description: 'ສ້າງບົດຄວາມ' },
      { code: 'kb.update', group_name: 'kb', description: 'ແກ້ໄຂບົດຄວາມ' },
      { code: 'kb.publish', group_name: 'kb', description: 'ເຜີຍແຜ່ບົດຄວາມ' },
      { code: 'kb.delete', group_name: 'kb', description: 'ລຶບບົດຄວາມ' },
      { code: 'kb.manage_category', group_name: 'kb', description: 'ຈັດການໝວດໝູ່' },
      { code: 'kb.feedback', group_name: 'kb', description: 'ໃຫ້ຄະແນນບົດຄວາມ' },
    ],
  },
  {
    group: 'report',
    label: 'ລາຍງານ',
    permissions: [
      { code: 'dashboard.view', group_name: 'report', description: 'ເບິ່ງແດຊບອດ' },
      { code: 'report.view', group_name: 'report', description: 'ເບິ່ງລາຍງານ' },
      { code: 'report.export', group_name: 'report', description: 'ສົ່ງອອກລາຍງານ' },
    ],
  },
  {
    group: 'admin',
    label: 'ຜູ້ດູແລລະບົບ',
    permissions: [
      { code: 'role.read', group_name: 'admin', description: 'ເບິ່ງບົດບາດ ແລະ ສິດ' },
      { code: 'role.manage', group_name: 'admin', description: 'ແກ້ສິດຂອງບົດບາດ' },
      { code: 'audit.read', group_name: 'admin', description: 'ອ່ານບັນທຶກການໃຊ້ງານ' },
      { code: 'system.manage', group_name: 'admin', description: 'ຂໍ້ມູນລະບົບ ແລະ backup' },
    ],
  },
  {
    group: 'notification',
    label: 'ການແຈ້ງເຕືອນ',
    permissions: [
      { code: 'notification.manage_own', group_name: 'notification', description: 'ຈັດການຊ່ອງທາງແຈ້ງເຕືອນຂອງຕົນ' },
    ],
  },
];

const ALL_PERMISSION_CODES = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.code));

const END_USER_CODES = ['ticket.create', 'ticket.read', 'ticket.update', 'ticket.close_own', 'ticket.reopen', 'ticket.cancel', 'ticket.request_priority_review', 'ticket.comment', 'ticket.attach', 'ticket.view_history', 'approval.read', 'user.read', 'user.update', 'sla.read', 'kb.read', 'kb.feedback', 'notification.manage_own'];

const AGENT_CODES = ['ticket.create', 'ticket.create_for_other', 'ticket.read', 'ticket.update', 'ticket.assign', 'ticket.assign_self', 'ticket.change_status', 'ticket.close_own', 'ticket.reopen', 'ticket.cancel', 'ticket.change_priority', 'ticket.request_priority_review', 'ticket.set_workaround', 'ticket.declare_major_incident', 'ticket.comment', 'ticket.comment_internal', 'ticket.attach', 'ticket.view_history', 'approval.read', 'checklist.update', 'user.read', 'user.update', 'user.reset_password', 'sla.read', 'service.manage', 'problem.manage', 'kb.read', 'kb.create', 'kb.update', 'kb.feedback', 'dashboard.view', 'report.view', 'report.export', 'notification.manage_own'];

const COMPANY_ADMIN_CODES = [...AGENT_CODES.filter((c) => c !== 'ticket.create_for_other'), 'ticket.create_for_other', 'ticket.delete', 'approval.manage', 'user.create', 'user.delete', 'user.assign_role', 'department.manage', 'category.manage', 'kb.publish', 'kb.delete', 'kb.manage_category', 'role.read', 'audit.read'];

const MANAGER_VIEWER_CODES = ['ticket.create', 'ticket.read', 'ticket.view_history', 'approval.read', 'user.update', 'sla.read', 'kb.read', 'kb.feedback', 'dashboard.view', 'report.view', 'report.export', 'notification.manage_own'];

export const ROLES: RoleWithPermissions[] = [
  { id: 1, code: 'end_user', name_th: 'ຜູ້ແຈ້ງ', description: 'ພະນັກງານທົ່ວໄປ ເຫັນສະເພາະເລື່ອງທີ່ຕົນແຈ້ງ', is_system: true, permissions: END_USER_CODES, user_count: 706 },
  { id: 2, code: 'agent', name_th: 'ເຈົ້າໜ້າທີ່ support', description: 'ທີມ IT ເຫັນທຸກເລື່ອງໃນບໍລິສັດທີ່ຢູ່ໃນຂອບເຂດ', is_system: true, permissions: AGENT_CODES, user_count: 18 },
  { id: 3, code: 'company_admin', name_th: 'ຜູ້ດູແລລະດັບບໍລິສັດ', description: 'ຫົວໜ້າ IT ຂອງແຕ່ລະບໍລິສັດ', is_system: true, permissions: COMPANY_ADMIN_CODES, user_count: 7 },
  { id: 4, code: 'manager_viewer', name_th: 'ຜູ້ບໍລິຫານ (ອ່ານຢ່າງດຽວ)', description: 'ອ່ານເລື່ອງແຈ້ງ ແລະ ລາຍງານ', is_system: true, permissions: MANAGER_VIEWER_CODES, user_count: 14 },
  // approval.decide ບໍ່ຖືກມອບຜ່ານ role ໃດເລີຍ ລວມທັງ super_admin
  { id: 5, code: 'super_admin', name_th: 'ຜູ້ດູແລລະບົບ', description: 'ທຸກບໍລິສັດ ບໍ່ມີຂໍ້ຈຳກັດ', is_system: true, permissions: ALL_PERMISSION_CODES.filter((c) => c !== 'approval.decide'), user_count: 2 },
];

// ── บันทึกการใช้งาน ────────────────────────────────────────────────────
export const AUDIT_LOGS: AuditEntry[] = [
  { id: 9101, actor: { id: 88, full_name: 'ພູວົງ ສີສຸກ' }, company: { id: 7, code: 'AIDC-LOG' }, action: 'update', entity_type: 'ticket', entity_id: 1038, ip_address: '10.20.4.51', created_at: at(-3), old_value: { priority: 'P2' }, new_value: { priority: 'P1' } },
  { id: 9100, actor: { id: 88, full_name: 'ພູວົງ ສີສຸກ' }, company: { id: 7, code: 'AIDC-LOG' }, action: 'assign', entity_type: 'ticket', entity_id: 1042, ip_address: '10.20.4.51', created_at: at(-95), old_value: { assignee_id: null }, new_value: { assignee_id: 88 } },
  { id: 9099, actor: { id: 301, full_name: 'ຜູ້ດູແລລະບົບ' }, company: null, action: 'update', entity_type: 'sla_target', entity_id: 3, ip_address: '10.20.1.8', created_at: at(-DAY), old_value: { resolution_minutes: 960 }, new_value: { resolution_minutes: 1080 } },
  { id: 9098, actor: { id: 91, full_name: 'ສົມຍິງ ຈັນທະວົງ' }, company: { id: 2, code: 'AIDC-CON' }, action: 'reset_password', entity_type: 'app_user', entity_id: 210, ip_address: '10.30.2.14', created_at: at(-2 * DAY), old_value: null, new_value: { must_change_password: true } },
  { id: 9097, actor: null, company: null, action: 'login_failed', entity_type: 'app_user', entity_id: 210, ip_address: '203.0.113.44', created_at: at(-6 * DAY), old_value: null, new_value: { failed_login_count: 5, is_locked: true } },
];

// ── ข้อมูลระบบ ─────────────────────────────────────────────────────────
export const SYSTEM_INFO: SystemInfo = {
  version: '0.1.0',
  environment: 'development',
  database: { version: 'PostgreSQL 18.4', size_mb: 34 },
  counts: { users: 811, tickets: 1042, open_tickets: 104, kb_articles: 4 },
  // 🔴 ปลายทางสำรองข้อมูลนอกสถานที่ยังไม่ได้รับ (บล็อก go-live)
  last_backup_at: null,
  backup_destination: null,
  uptime_seconds: 42_318,
};

// ── แดชบอร์ดและรายงาน ──────────────────────────────────────────────────
export const DASHBOARD: DashboardSummary = {
  open_tickets: 104,
  breached: 7,
  at_risk: 12,
  resolved_this_month: 386,
  sla_compliance_percent: 93.2,
  avg_first_response_minutes: 24,
  by_priority: [
    { priority: 'P1', count: 3 },
    { priority: 'P2', count: 18 },
    { priority: 'P3', count: 54 },
    { priority: 'P4', count: 29 },
  ],
  by_status: [
    { status: 'new', count: 14 },
    { status: 'assigned', count: 21 },
    { status: 'in_progress', count: 42 },
    { status: 'pending_user', count: 27 },
  ],
  trend: [
    { date: '25 ສ.ຫ.', created: 22, resolved: 19 },
    { date: '26 ສ.ຫ.', created: 31, resolved: 27 },
    { date: '27 ສ.ຫ.', created: 18, resolved: 24 },
    { date: '28 ສ.ຫ.', created: 26, resolved: 22 },
    { date: '29 ສ.ຫ.', created: 9, resolved: 12 },
    { date: '30 ສ.ຫ.', created: 4, resolved: 6 },
    { date: '31 ສ.ຫ.', created: 17, resolved: 11 },
  ],
  top_categories: [
    { name: 'ເຄືອຂ່າຍ ແລະ ອິນເຕີເນັດ', count: 68 },
    { name: 'ອຸປະກອນຄອມພິວເຕີ', count: 54 },
    { name: 'ສິດເຂົ້າເຖິງລະບົບ', count: 47 },
    { name: 'ລະບົບ ERP', count: 39 },
    { name: 'ອີເມວ ແລະ ບັນຊີຜູ້ໃຊ້', count: 31 },
    { name: 'ເຄື່ອງພິມ ແລະ ເຄື່ອງສະແກນ', count: 24 },
  ],
};

export const SLA_COMPLIANCE: SlaComplianceRow[] = [
  { company: { id: 7, code: 'AIDC-LOG' }, priority: 'P1', total: 4, met: 3, excluded: 0, compliance_percent: 75.0 },
  { company: { id: 7, code: 'AIDC-LOG' }, priority: 'P2', total: 22, met: 21, excluded: 1, compliance_percent: 95.5 },
  { company: { id: 7, code: 'AIDC-LOG' }, priority: 'P3', total: 61, met: 59, excluded: 2, compliance_percent: 96.7 },
  { company: { id: 7, code: 'AIDC-LOG' }, priority: 'P4', total: 38, met: 38, excluded: 0, compliance_percent: 100.0 },
  { company: { id: 2, code: 'AIDC-CON' }, priority: 'P1', total: 2, met: 2, excluded: 0, compliance_percent: 100.0 },
  { company: { id: 2, code: 'AIDC-CON' }, priority: 'P2', total: 17, met: 15, excluded: 0, compliance_percent: 88.2 },
  { company: { id: 2, code: 'AIDC-CON' }, priority: 'P3', total: 74, met: 70, excluded: 3, compliance_percent: 94.6 },
  { company: { id: 2, code: 'AIDC-CON' }, priority: 'P4', total: 45, met: 44, excluded: 1, compliance_percent: 97.8 },
];

/** เรื่องที่ผู้ใช้ปัจจุบันต้องอนุมัติ — ผูกกับ ticket ที่ pending_reason = approval */
/**
 * ขั้นอนุมัติที่ยังรออยู่ ผูกกับ ticket ที่ pending_reason = approval
 *
 * กรอง pending ออกมาก่อนแล้วค่อยจับคู่ ไม่ใช่หยิบ APPROVALS[1] ตรง ๆ
 * เพราะการอ้างดัชนีคงที่จะพังทันทีที่ลำดับขั้นในข้อมูลเปลี่ยน
 */
const PENDING_STEP = APPROVALS.find((s) => s.status === 'pending');

export const MY_APPROVALS: { ticket: TicketListItem; step: ApprovalStep }[] = PENDING_STEP
  ? TICKETS.filter((t) => t.pending_reason === 'approval').map((t) => ({
      ticket: t,
      step: PENDING_STEP,
    }))
  : [];
