/**
 * ข้อมูลจำลองสำหรับ dev เท่านั้น
 *
 * ⚠️ ชั่วคราว — จะถูกแทนที่ด้วย MSW handler ที่ gen จาก openapi.json
 * ทันทีที่ backend ส่ง endpoint ชุดแรก (docs/20-frontend-architecture.md §10.1)
 *
 * รูปร่างของข้อมูลตรงกับ docs/03-api-spec.md v2.0 §3.3 ทุกฟิลด์
 * รวมถึงบล็อก sla ที่มี remaining_unit และสถานะครบทั้ง 7 ค่า
 */

import type { Priority, SlaStatus, TicketStatus } from '@/config/enums';

export interface TicketListItem {
  id: number;
  ticket_no: string;
  ticket_type: 'incident' | 'service_request';
  subject: string;
  status: TicketStatus;
  pending_reason: 'user' | 'vendor' | 'approval' | null;
  priority: Priority;
  support_tier: 1 | 2 | 3;
  company: { id: number; code: string };
  department: { id: number; name: string } | null;
  category: { id: number; name_th: string };
  requester: { id: number; full_name: string };
  assignee: { id: number; full_name: string } | null;
  sla: {
    status: SlaStatus;
    remaining_minutes: number | null;
    remaining_unit: 'business_minutes' | 'calendar_minutes';
    resolution_due_at: string;
    is_resolution_breached: boolean;
  };
  reopen_count: number;
  comment_count: number;
  attachment_count: number;
  updated_at: string;
}

export const MOCK_USER = {
  full_name: 'ພູວົງ ສີສຸກ',
  roles: ['agent'],
  company: { id: 7, code: 'AIDC-LOG', name_th: 'ເອໄອດີຊີ ໂລຈິສຕິກ' },
  scoped_companies: [
    { id: 7, code: 'AIDC-LOG' },
    { id: 2, code: 'AIDC-CON' },
  ],
};

/** ครอบคลุมสถานะทั้ง 7 ค่าและ SLA ทั้ง 4 ค่า เพื่อให้เห็น design system ครบ */
export const MOCK_TICKETS: TicketListItem[] = [
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
    department: { id: 22, name: 'ສາງສິນຄ້າ' },
    category: { id: 78, name_th: 'ລະບົບສາງສິນຄ້າ (WMS)' },
    requester: { id: 145, full_name: 'ສົມຊາຍ ກິດຕິວັດ' },
    assignee: null,
    sla: {
      status: 'breached',
      remaining_minutes: -72,
      remaining_unit: 'calendar_minutes',
      resolution_due_at: '31 ສິງຫາ 2569 11:15 ນ.',
      is_resolution_breached: true,
    },
    reopen_count: 0,
    comment_count: 1,
    attachment_count: 0,
    updated_at: '12:27 ນ.',
  },
  {
    id: 1042,
    ticket_no: 'AIDC-LOG-202608-0042',
    ticket_type: 'incident',
    subject: 'ເຄື່ອງສະແກນບາໂຄດສາງ 2 ອ່ານບໍ່ຕິດ',
    status: 'in_progress',
    pending_reason: null,
    priority: 'P2',
    support_tier: 1,
    company: { id: 7, code: 'AIDC-LOG' },
    department: { id: 22, name: 'ສາງສິນຄ້າ' },
    category: { id: 79, name_th: 'ເຄື່ອງສະແກນບາໂຄດ/ເຄື່ອງພິມສະຫຼາກ' },
    requester: { id: 145, full_name: 'ສົມຊາຍ ກິດຕິວັດ' },
    assignee: { id: 88, full_name: 'ພູວົງ ສີສຸກ' },
    sla: {
      status: 'at_risk',
      remaining_minutes: 42,
      remaining_unit: 'business_minutes',
      resolution_due_at: '31 ສິງຫາ 2569 17:15 ນ.',
      is_resolution_breached: false,
    },
    reopen_count: 0,
    comment_count: 3,
    attachment_count: 2,
    updated_at: '11:02 ນ.',
  },
  {
    id: 1035,
    ticket_no: 'AIDC-CON-202608-0035',
    ticket_type: 'incident',
    subject: 'plotter ພິມແບບບໍ່ອອກກ່ອນປະຊຸມໜ້າງານ',
    status: 'assigned',
    pending_reason: null,
    priority: 'P3',
    support_tier: 1,
    company: { id: 2, code: 'AIDC-CON' },
    department: { id: 11, name: 'ໜ້າງານ 4' },
    category: { id: 41, name_th: 'ເຄື່ອງພິມແບບ (plotter)' },
    requester: { id: 201, full_name: 'ຫົວໜ້າໜ້າງານ 4' },
    assignee: { id: 90, full_name: 'ທະນູ ວັດທະນາ' },
    sla: {
      status: 'on_track',
      remaining_minutes: 310,
      remaining_unit: 'business_minutes',
      resolution_due_at: '1 ກັນຍາ 2569 14:30 ນ.',
      is_resolution_breached: false,
    },
    reopen_count: 0,
    comment_count: 2,
    attachment_count: 1,
    updated_at: 'ມື້ວານ',
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
    department: { id: 30, name: 'ການເງິນ' },
    category: { id: 55, name_th: 'ຂໍສິດເຂົ້າເຖິງລະບົບ' },
    requester: { id: 210, full_name: 'ກັນລະຍາ ຈະເລີນ' },
    assignee: { id: 91, full_name: 'ສົມຍິງ ຈັນທະວົງ' },
    sla: {
      status: 'paused',
      remaining_minutes: null,
      remaining_unit: 'business_minutes',
      resolution_due_at: 'ເລີ່ມນັບຫຼັງອະນຸມັດຄົບ',
      is_resolution_breached: false,
    },
    reopen_count: 0,
    comment_count: 4,
    attachment_count: 1,
    updated_at: '2 ມື້ກ່ອນ',
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
    department: { id: 24, name: 'ປະຕິບັດການຂົນສົ່ງ' },
    category: { id: 82, name_th: 'GPS / ລະບົບຕິດຕາມລົດ' },
    requester: { id: 220, full_name: 'ສູນຄວບຄຸມຂົນສົ່ງ' },
    assignee: { id: 88, full_name: 'ພູວົງ ສີສຸກ' },
    sla: {
      status: 'paused',
      remaining_minutes: null,
      remaining_unit: 'business_minutes',
      resolution_due_at: '3 ກັນຍາ 2569 10:00 ນ.',
      is_resolution_breached: false,
    },
    reopen_count: 0,
    comment_count: 6,
    attachment_count: 2,
    updated_at: '3 ມື້ກ່ອນ',
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
    category: { id: 33, name_th: 'ເຄືອຂ່າຍ / Wi-Fi' },
    requester: { id: 230, full_name: 'ທີມພັດທະນາລະບົບ' },
    assignee: { id: 90, full_name: 'ທະນູ ວັດທະນາ' },
    sla: {
      status: 'on_track',
      remaining_minutes: null,
      remaining_unit: 'business_minutes',
      resolution_due_at: 'ປິດອັດຕະໂນມັດໃນ 2 ມື້ເຮັດວຽກ',
      is_resolution_breached: false,
    },
    reopen_count: 1,
    comment_count: 8,
    attachment_count: 0,
    updated_at: '4 ມື້ກ່ອນ',
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
    department: { id: 60, name: 'ທຸລະການ' },
    category: { id: 12, name_th: 'ອຸປະກອນຕໍ່ພ່ວງ' },
    requester: { id: 240, full_name: 'ເລຂານຸການຜູ້ບໍລິຫານ' },
    assignee: null,
    sla: {
      status: 'on_track',
      remaining_minutes: null,
      remaining_unit: 'business_minutes',
      resolution_due_at: '—',
      is_resolution_breached: false,
    },
    reopen_count: 0,
    comment_count: 1,
    attachment_count: 0,
    updated_at: '5 ມື້ກ່ອນ',
  },
];

export const QUEUE_TABS = [
  { key: 'unassigned', label: 'ຍັງບໍ່ມີຄົນຮັບ', count: 1 },
  { key: 'mine', label: 'ວຽກຂອງຂ້ອຍ', count: 2 },
  { key: 'pending', label: 'ລໍຖ້າຜູ້ແຈ້ງ', count: 2 },
  { key: 'breached', label: 'ເກີນກຳນົດ', count: 1 },
] as const;
