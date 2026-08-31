/**
 * metadata สำหรับแสดงผลของทุก enum ในระบบ — แหล่งความจริงเดียวของ UI
 *
 * กฎที่ยึด (21-ui-ux-design.md §5 / ADR-003):
 *   ทุกสถานะต้องสื่อด้วย **สี + ไอคอน + ข้อความ** ครบสามอย่างเสมอ
 *   ห้ามตัดอันใดอันหนึ่งออกแม้ในตารางที่แน่น — ผู้ใช้ตาบอดสีต้องอ่านออก
 *
 * คำที่ใช้ต้องเป็นคำที่พนักงานหน้างานเข้าใจ ห้ามศัพท์ ITIL (NFR-32)
 *   "เรื่องที่แจ้ง" ไม่ใช่ "incident" · "ผู้รับผิดชอบ" ไม่ใช่ "assignee"
 */

import {
  Archive,
  ArrowDown,
  ArrowUp,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Minus,
  PauseCircle,
  Settings,
  UserCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

export interface DisplayMeta {
  /** ข้อความที่ผู้ใช้เห็น */
  label: string;
  icon: LucideIcon;
  /** class ของ Tailwind ที่ชี้ไป design token */
  className: string;
}

// ── สถานะเรื่อง 7 ค่า ────────────────────────────────────────────────
export const TICKET_STATUS = {
  new: { label: 'ใหม่', icon: Circle, className: 'bg-st-new-bg text-st-new-fg' },
  assigned: {
    label: 'มอบหมายแล้ว',
    icon: UserCheck,
    className: 'bg-st-assigned-bg text-st-assigned-fg',
  },
  in_progress: {
    label: 'กำลังดำเนินการ',
    icon: Settings,
    className: 'bg-st-progress-bg text-st-progress-fg',
  },
  pending_user: {
    label: 'รอผู้แจ้ง',
    icon: PauseCircle,
    className: 'bg-st-pending-bg text-st-pending-fg',
  },
  resolved: {
    label: 'แก้ไขเสร็จ',
    icon: CheckCircle2,
    className: 'bg-st-resolved-bg text-st-resolved-fg',
  },
  closed: { label: 'ปิดแล้ว', icon: Archive, className: 'bg-st-closed-bg text-st-closed-fg' },
  cancelled: {
    label: 'ยกเลิก',
    icon: XCircle,
    // closed กับ cancelled ใช้โทนเทาใกล้กันโดยตั้งใจ (ทั้งคู่คือ "จบแล้ว")
    // แยกกันด้วยไอคอนคนละตัว + เส้นขอบประ เพื่อให้ต่างกันแม้พิมพ์ขาวดำ
    className: 'bg-st-cancelled-bg text-st-cancelled-fg border border-dashed border-control',
  },
} as const satisfies Record<string, DisplayMeta>;

export type TicketStatus = keyof typeof TICKET_STATUS;

/** เหตุผลที่หยุดนับเวลา — แสดงต่อท้ายสถานะ "รอผู้แจ้ง" ให้ชัดว่ารออะไร */
export const PENDING_REASON = {
  user: 'รอข้อมูลจากผู้แจ้ง',
  vendor: 'รออะไหล่ / ผู้ให้บริการภายนอก',
  approval: 'รออนุมัติ',
} as const;

// ── ระดับความสำคัญ P1–P4 ────────────────────────────────────────────
export interface PriorityMeta extends DisplayMeta {
  /** จำนวนขีดที่ติดในมาตรวัด — ความสูงบอกระดับได้โดยไม่ต้องพึ่งสี */
  bars: 1 | 2 | 3 | 4;
  /** ความหนาแถบซ้ายของแถว (21-ui-ux-design.md §5.2) */
  railClass: string;
  /** เกณฑ์ตามเอกสารควบคุม — แสดงเป็น tooltip ให้ผู้ใช้เข้าใจว่าทำไมได้ระดับนี้ */
  criteria: string;
}

export const PRIORITY = {
  P1: {
    label: 'P1 – วิกฤต',
    icon: AlertTriangle,
    className: 'bg-p1-bg text-p1-fg',
    bars: 4,
    railClass: 'prio-rail-p1',
    criteria: 'ระบบสำคัญหยุดให้บริการทั้งองค์กร ไม่มีทางเลี่ยง',
  },
  P2: {
    label: 'P2 – สูง',
    icon: ArrowUp,
    className: 'bg-p2-bg text-p2-fg',
    bars: 3,
    railClass: 'prio-rail-p2',
    criteria: 'ใช้ไม่ได้ทั้งแผนก หรือระบบสำคัญที่ยังมีทางเลี่ยงชั่วคราว',
  },
  P3: {
    label: 'P3 – ปานกลาง',
    icon: Minus,
    className: 'bg-p3-bg text-p3-fg',
    bars: 2,
    railClass: 'prio-rail-p3',
    criteria: 'กระทบผู้ใช้รายบุคคล ทำงานไม่ได้หรือไม่สะดวก',
  },
  P4: {
    label: 'P4 – ต่ำ',
    icon: ArrowDown,
    className: 'bg-p4-bg text-p4-fg',
    bars: 1,
    railClass: 'prio-rail-p4',
    criteria: 'คำขอบริการทั่วไปหรือคำปรึกษาที่ไม่กระทบงานเร่งด่วน',
  },
} as const satisfies Record<string, PriorityMeta>;

export type Priority = keyof typeof PRIORITY;

// ── สถานะ SLA 4 ค่า ─────────────────────────────────────────────────
export const SLA_STATUS = {
  on_track: { label: 'ตรงเวลา', icon: CheckCircle2, className: 'bg-sla-ok-bg text-sla-ok' },
  at_risk: { label: 'ใกล้ครบกำหนด', icon: Clock, className: 'bg-sla-risk-bg text-sla-risk' },
  breached: {
    label: 'เกินกำหนด',
    icon: AlertOctagon,
    className: 'bg-sla-breach-bg text-sla-breach',
  },
  paused: {
    label: 'หยุดนับชั่วคราว',
    icon: PauseCircle,
    className: 'bg-sla-paused-bg text-sla-paused',
  },
} as const satisfies Record<string, DisplayMeta>;

export type SlaStatus = keyof typeof SLA_STATUS;

// ── ประเภทงานและช่องทาง ─────────────────────────────────────────────
export const TICKET_TYPE = {
  incident: 'เหตุขัดข้อง',
  service_request: 'คำขอบริการ',
} as const;

/** 4 ช่องทางตามเอกสารควบคุม — ไม่มี LINE (LINE ใช้แจ้งเตือนขาออกเท่านั้น) */
export const CHANNEL = {
  portal: 'ระบบออนไลน์',
  email: 'อีเมล',
  phone: 'โทรศัพท์',
  walk_in: 'ติดต่อด้วยตนเอง',
} as const;

// ── คำถามที่ผู้แจ้งตอบแทนการเลือกระดับเอง (SLA ข้อ 4) ───────────────
export const IMPACT_OPTIONS = [
  { value: 'individual', label: 'เฉพาะฉันคนเดียว' },
  { value: 'department', label: 'ทั้งแผนก หรือหลายคน' },
  { value: 'org_wide', label: 'ทั้งบริษัท หรือระบบสำคัญหยุดทำงาน' },
] as const;

export const URGENCY_OPTIONS = [
  { value: 'high', label: 'เร่งด่วนมาก' },
  { value: 'medium', label: 'เร่งด่วนปานกลาง' },
  { value: 'low', label: 'ไม่เร่งด่วน' },
] as const;

/**
 * เมทริกซ์เดียวกับที่ backend ใช้ (SLA ข้อ 4)
 *
 * ที่มีอยู่ฝั่ง frontend ด้วยเพื่อ **แสดงตัวอย่างระดับให้ผู้ใช้เห็นทันทีขณะกรอกฟอร์ม**
 * เท่านั้น — ค่าจริงที่บันทึกมาจาก backend เสมอ ถ้าสองฝั่งไม่ตรงกัน
 * ให้ยึดค่าที่ backend ส่งกลับมาใน response
 */
export const PRIORITY_MATRIX: Record<string, Record<string, Priority>> = {
  org_wide: { high: 'P1', medium: 'P2', low: 'P3' },
  department: { high: 'P2', medium: 'P3', low: 'P3' },
  individual: { high: 'P3', medium: 'P3', low: 'P4' },
};

export function previewPriority(impact: string, urgency: string): Priority | null {
  return PRIORITY_MATRIX[impact]?.[urgency] ?? null;
}
