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
  full_name: 'ปิยะ ศรีสุข',
  roles: ['agent'],
  company: { id: 7, code: 'AIDC-LOG', name_th: 'เอไอดีซี โลจิสติกส์' },
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
    subject: 'WMS ล็อกอินไม่ได้ทั้งคลัง',
    status: 'new',
    pending_reason: null,
    priority: 'P1',
    support_tier: 1,
    company: { id: 7, code: 'AIDC-LOG' },
    department: { id: 22, name: 'คลังสินค้า' },
    category: { id: 78, name_th: 'ระบบคลังสินค้า (WMS)' },
    requester: { id: 145, full_name: 'สมชาย กิตติวัฒน์' },
    assignee: null,
    sla: {
      status: 'breached',
      remaining_minutes: -72,
      remaining_unit: 'calendar_minutes',
      resolution_due_at: '31 ส.ค. 2569 11:15 น.',
      is_resolution_breached: true,
    },
    reopen_count: 0,
    comment_count: 1,
    attachment_count: 0,
    updated_at: '12:27 น.',
  },
  {
    id: 1042,
    ticket_no: 'AIDC-LOG-202608-0042',
    ticket_type: 'incident',
    subject: 'เครื่องยิงบาร์โค้ดคลัง 2 อ่านไม่ติด',
    status: 'in_progress',
    pending_reason: null,
    priority: 'P2',
    support_tier: 1,
    company: { id: 7, code: 'AIDC-LOG' },
    department: { id: 22, name: 'คลังสินค้า' },
    category: { id: 79, name_th: 'เครื่องยิงบาร์โค้ด/เครื่องพิมพ์ฉลาก' },
    requester: { id: 145, full_name: 'สมชาย กิตติวัฒน์' },
    assignee: { id: 88, full_name: 'ปิยะ ศรีสุข' },
    sla: {
      status: 'at_risk',
      remaining_minutes: 42,
      remaining_unit: 'business_minutes',
      resolution_due_at: '31 ส.ค. 2569 17:15 น.',
      is_resolution_breached: false,
    },
    reopen_count: 0,
    comment_count: 3,
    attachment_count: 2,
    updated_at: '11:02 น.',
  },
  {
    id: 1035,
    ticket_no: 'AIDC-CON-202608-0035',
    ticket_type: 'incident',
    subject: 'plotter พิมพ์แบบไม่ออกก่อนประชุมหน้างาน',
    status: 'assigned',
    pending_reason: null,
    priority: 'P3',
    support_tier: 1,
    company: { id: 2, code: 'AIDC-CON' },
    department: { id: 11, name: 'ไซต์งาน 4' },
    category: { id: 41, name_th: 'เครื่องพิมพ์แบบ (plotter)' },
    requester: { id: 201, full_name: 'โฟร์แมนไซต์ 4' },
    assignee: { id: 90, full_name: 'ธนา วัฒนกิจ' },
    sla: {
      status: 'on_track',
      remaining_minutes: 310,
      remaining_unit: 'business_minutes',
      resolution_due_at: '1 ก.ย. 2569 14:30 น.',
      is_resolution_breached: false,
    },
    reopen_count: 0,
    comment_count: 2,
    attachment_count: 1,
    updated_at: 'เมื่อวาน',
  },
  {
    id: 1031,
    ticket_no: 'AIDC-LOG-202608-0031',
    ticket_type: 'service_request',
    subject: 'ขอสิทธิ์เข้าถึงโฟลเดอร์งบประมาณ 2570',
    status: 'pending_user',
    pending_reason: 'approval',
    priority: 'P4',
    support_tier: 1,
    company: { id: 7, code: 'AIDC-LOG' },
    department: { id: 30, name: 'การเงิน' },
    category: { id: 55, name_th: 'ขอสิทธิ์เข้าถึงระบบ' },
    requester: { id: 210, full_name: 'กมลชนก เจริญวัฒน์' },
    assignee: { id: 91, full_name: 'สมหญิง กันทะวงศ์' },
    sla: {
      status: 'paused',
      remaining_minutes: null,
      remaining_unit: 'business_minutes',
      resolution_due_at: 'เริ่มนับหลังอนุมัติครบ',
      is_resolution_breached: false,
    },
    reopen_count: 0,
    comment_count: 4,
    attachment_count: 1,
    updated_at: '2 วันก่อน',
  },
  {
    id: 1027,
    ticket_no: 'AIDC-LOG-202608-0027',
    ticket_type: 'incident',
    subject: 'GPS รถทะเบียน 82-4471 ไม่ส่งพิกัด รออะไหล่จากผู้ให้บริการ',
    status: 'pending_user',
    pending_reason: 'vendor',
    priority: 'P2',
    support_tier: 3,
    company: { id: 7, code: 'AIDC-LOG' },
    department: { id: 24, name: 'ปฏิบัติการขนส่ง' },
    category: { id: 82, name_th: 'GPS / ระบบติดตามรถ' },
    requester: { id: 220, full_name: 'ศูนย์ควบคุมขนส่ง' },
    assignee: { id: 88, full_name: 'ปิยะ ศรีสุข' },
    sla: {
      status: 'paused',
      remaining_minutes: null,
      remaining_unit: 'business_minutes',
      resolution_due_at: '3 ก.ย. 2569 10:00 น.',
      is_resolution_breached: false,
    },
    reopen_count: 0,
    comment_count: 6,
    attachment_count: 2,
    updated_at: '3 วันก่อน',
  },
  {
    id: 1024,
    ticket_no: 'AIDC-TECH-202608-0024',
    ticket_type: 'incident',
    subject: 'Wi-Fi ชั้น 3 อาคาร B หลุดเป็นช่วง',
    status: 'resolved',
    pending_reason: null,
    priority: 'P3',
    support_tier: 2,
    company: { id: 5, code: 'AIDC-TECH' },
    department: { id: 50, name: 'พัฒนาระบบ' },
    category: { id: 33, name_th: 'เครือข่าย / Wi-Fi' },
    requester: { id: 230, full_name: 'ทีมพัฒนาระบบ' },
    assignee: { id: 90, full_name: 'ธนา วัฒนกิจ' },
    sla: {
      status: 'on_track',
      remaining_minutes: null,
      remaining_unit: 'business_minutes',
      resolution_due_at: 'ปิดอัตโนมัติใน 2 วันทำการ',
      is_resolution_breached: false,
    },
    reopen_count: 1,
    comment_count: 8,
    attachment_count: 0,
    updated_at: '4 วันก่อน',
  },
  {
    id: 1019,
    ticket_no: 'AIDC-HQ-202608-0019',
    ticket_type: 'service_request',
    subject: 'ขอเปลี่ยนเมาส์ (ผู้แจ้งยกเลิกเอง)',
    status: 'cancelled',
    pending_reason: null,
    priority: 'P4',
    support_tier: 1,
    company: { id: 1, code: 'AIDC-HQ' },
    department: { id: 60, name: 'ธุรการ' },
    category: { id: 12, name_th: 'อุปกรณ์ต่อพ่วง' },
    requester: { id: 240, full_name: 'เลขานุการผู้บริหาร' },
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
    updated_at: '5 วันก่อน',
  },
];

export const QUEUE_TABS = [
  { key: 'unassigned', label: 'ยังไม่มีคนรับ', count: 1 },
  { key: 'mine', label: 'งานของฉัน', count: 2 },
  { key: 'pending', label: 'รอผู้แจ้ง', count: 2 },
  { key: 'breached', label: 'เกินกำหนด', count: 1 },
] as const;
