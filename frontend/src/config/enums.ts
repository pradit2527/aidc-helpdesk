/**
 * metadata ສຳລັບການສະແດງຜົນຂອງທຸກ enum ໃນລະບົບ — ແຫຼ່ງຄວາມຈິງດຽວຂອງ UI
 *
 * ກົດທີ່ຍຶດ (21-ui-ux-design.md §5 / ADR-003):
 *   ທຸກສະຖານະຕ້ອງສື່ດ້ວຍ **ສີ + ໄອຄອນ + ຂໍ້ຄວາມ** ຄົບສາມຢ່າງສະເໝີ
 *   ຫ້າມຕັດອັນໃດອັນໜຶ່ງອອກ ເຖິງແມ່ນໃນຕາຕະລາງທີ່ແໜ້ນ — ຜູ້ໃຊ້ຕາບອດສີຕ້ອງອ່ານອອກ
 *
 * ຄຳທີ່ໃຊ້ຕ້ອງເປັນຄຳທີ່ພະນັກງານໜ້າງານເຂົ້າໃຈ ຫ້າມສັບ ITIL (NFR-32)
 *   "ເລື່ອງທີ່ແຈ້ງ" ບໍ່ແມ່ນ "incident" · "ຜູ້ຮັບຜິດຊອບ" ບໍ່ແມ່ນ "assignee"
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
  /** ຂໍ້ຄວາມທີ່ຜູ້ໃຊ້ເຫັນ */
  label: string;
  icon: LucideIcon;
  /** class ຂອງ Tailwind ທີ່ຊີ້ໄປ design token */
  className: string;
}

// ── ສະຖານະເລື່ອງ 7 ຄ່າ ──────────────────────────────────────────────
export const TICKET_STATUS = {
  new: { label: 'ໃໝ່', icon: Circle, className: 'bg-st-new-bg text-st-new-fg' },
  assigned: {
    label: 'ມອບໝາຍແລ້ວ',
    icon: UserCheck,
    className: 'bg-st-assigned-bg text-st-assigned-fg',
  },
  in_progress: {
    label: 'ກຳລັງດຳເນີນການ',
    icon: Settings,
    className: 'bg-st-progress-bg text-st-progress-fg',
  },
  pending_user: {
    label: 'ລໍຖ້າຜູ້ແຈ້ງ',
    icon: PauseCircle,
    className: 'bg-st-pending-bg text-st-pending-fg',
  },
  resolved: {
    label: 'ແກ້ໄຂແລ້ວ',
    icon: CheckCircle2,
    className: 'bg-st-resolved-bg text-st-resolved-fg',
  },
  closed: { label: 'ປິດແລ້ວ', icon: Archive, className: 'bg-st-closed-bg text-st-closed-fg' },
  cancelled: {
    label: 'ຍົກເລີກ',
    icon: XCircle,
    // closed ກັບ cancelled ໃຊ້ໂທນເທົາໃກ້ກັນໂດຍຕັ້ງໃຈ (ທັງຄູ່ຄື "ຈົບແລ້ວ")
    // ແຍກກັນດ້ວຍໄອຄອນຄົນລະຕົວ + ເສັ້ນຂອບຂີດ ເພື່ອໃຫ້ຕ່າງກັນເຖິງພິມຂາວດຳ
    className: 'bg-st-cancelled-bg text-st-cancelled-fg border border-dashed border-control',
  },
} as const satisfies Record<string, DisplayMeta>;

export type TicketStatus = keyof typeof TICKET_STATUS;

/** ເຫດຜົນທີ່ຢຸດນັບເວລາ — ສະແດງແທນຄຳວ່າ "ລໍຖ້າຜູ້ແຈ້ງ" ໃຫ້ຮູ້ວ່າລໍຖ້າຫຍັງ */
export const PENDING_REASON = {
  user: 'ລໍຖ້າຂໍ້ມູນຈາກຜູ້ແຈ້ງ',
  vendor: 'ລໍຖ້າອາໄຫຼ່ / ຜູ້ໃຫ້ບໍລິການພາຍນອກ',
  approval: 'ລໍຖ້າອະນຸມັດ',
} as const;

// ── ລະດັບຄວາມສຳຄັນ P1–P4 ──────────────────────────────────────────
export interface PriorityMeta extends DisplayMeta {
  /** ຈຳນວນຂີດທີ່ຕິດໃນມາດວັດ — ຄວາມສູງບອກລະດັບໄດ້ໂດຍບໍ່ຕ້ອງເບິ່ງສີ */
  bars: 1 | 2 | 3 | 4;
  /** ຄວາມໜາແຖບຊ້າຍຂອງແຖວ (21-ui-ux-design.md §5.2) */
  railClass: string;
  /** ເກນຕາມເອກະສານຄວບຄຸມ — ສະແດງເປັນ tooltip ໃຫ້ຜູ້ໃຊ້ເຂົ້າໃຈວ່າເປັນຫຍັງໄດ້ລະດັບນີ້ */
  criteria: string;
}

export const PRIORITY = {
  P1: {
    label: 'P1 – ວິກິດ',
    icon: AlertTriangle,
    className: 'bg-p1-bg text-p1-fg',
    bars: 4,
    railClass: 'prio-rail-p1',
    criteria: 'ລະບົບສຳຄັນຢຸດໃຫ້ບໍລິການທັງອົງກອນ ບໍ່ມີທາງລ່ຽງ',
  },
  P2: {
    label: 'P2 – ສູງ',
    icon: ArrowUp,
    className: 'bg-p2-bg text-p2-fg',
    bars: 3,
    railClass: 'prio-rail-p2',
    criteria: 'ໃຊ້ບໍ່ໄດ້ທັງພະແນກ ຫຼື ລະບົບສຳຄັນທີ່ຍັງມີທາງລ່ຽງຊົ່ວຄາວ',
  },
  P3: {
    label: 'P3 – ປານກາງ',
    icon: Minus,
    className: 'bg-p3-bg text-p3-fg',
    bars: 2,
    railClass: 'prio-rail-p3',
    criteria: 'ກະທົບຜູ້ໃຊ້ລາຍບຸກຄົນ ເຮັດວຽກບໍ່ໄດ້ ຫຼື ບໍ່ສະດວກ',
  },
  P4: {
    label: 'P4 – ຕ່ຳ',
    icon: ArrowDown,
    className: 'bg-p4-bg text-p4-fg',
    bars: 1,
    railClass: 'prio-rail-p4',
    criteria: 'ຄຳຂໍບໍລິການທົ່ວໄປ ຫຼື ຄຳປຶກສາທີ່ບໍ່ກະທົບວຽກຮີບດ່ວນ',
  },
} as const satisfies Record<string, PriorityMeta>;

export type Priority = keyof typeof PRIORITY;

// ── ສະຖານະ SLA 4 ຄ່າ ────────────────────────────────────────────────
export const SLA_STATUS = {
  on_track: { label: 'ຕົງເວລາ', icon: CheckCircle2, className: 'bg-sla-ok-bg text-sla-ok' },
  at_risk: { label: 'ໃກ້ຄົບກຳນົດ', icon: Clock, className: 'bg-sla-risk-bg text-sla-risk' },
  breached: {
    label: 'ເກີນກຳນົດ',
    icon: AlertOctagon,
    className: 'bg-sla-breach-bg text-sla-breach',
  },
  paused: {
    label: 'ຢຸດນັບຊົ່ວຄາວ',
    icon: PauseCircle,
    className: 'bg-sla-paused-bg text-sla-paused',
  },
} as const satisfies Record<string, DisplayMeta>;

export type SlaStatus = keyof typeof SLA_STATUS;

// ── ປະເພດວຽກ ແລະ ຊ່ອງທາງ ───────────────────────────────────────────
export const TICKET_TYPE = {
  incident: 'ເຫດຂັດຂ້ອງ',
  service_request: 'ຄຳຂໍບໍລິການ',
} as const;

/** 4 ຊ່ອງທາງຕາມເອກະສານຄວບຄຸມ — ບໍ່ມີ LINE (LINE ໃຊ້ແຈ້ງເຕືອນຂາອອກເທົ່ານັ້ນ) */
export const CHANNEL = {
  portal: 'ລະບົບອອນລາຍ',
  email: 'ອີເມວ',
  phone: 'ໂທລະສັບ',
  walk_in: 'ຕິດຕໍ່ດ້ວຍຕົນເອງ',
} as const;

// ── ຄຳຖາມທີ່ຜູ້ແຈ້ງຕອບແທນການເລືອກລະດັບເອງ (SLA ຂໍ້ 4) ──────────────
export const IMPACT_OPTIONS = [
  { value: 'individual', label: 'ສະເພາະຂ້ອຍຄົນດຽວ' },
  { value: 'department', label: 'ທັງພະແນກ ຫຼື ຫຼາຍຄົນ' },
  { value: 'org_wide', label: 'ທັງບໍລິສັດ ຫຼື ລະບົບສຳຄັນຢຸດເຮັດວຽກ' },
] as const;

export const URGENCY_OPTIONS = [
  { value: 'high', label: 'ຮີບດ່ວນຫຼາຍ' },
  { value: 'medium', label: 'ຮີບດ່ວນປານກາງ' },
  { value: 'low', label: 'ບໍ່ຮີບດ່ວນ' },
] as const;

/**
 * ເມທຣິກດຽວກັນກັບທີ່ backend ໃຊ້ (SLA ຂໍ້ 4)
 *
 * ທີ່ມີຢູ່ຝັ່ງ frontend ນຳ ເພື່ອ **ສະແດງຕົວຢ່າງລະດັບໃຫ້ຜູ້ໃຊ້ເຫັນທັນທີຂະນະກອກຟອມ**
 * ເທົ່ານັ້ນ — ຄ່າຈິງທີ່ບັນທຶກມາຈາກ backend ສະເໝີ ຖ້າສອງຝັ່ງບໍ່ຕົງກັນ
 * ໃຫ້ຍຶດຄ່າທີ່ backend ສົ່ງກັບມາໃນ response
 */
export const PRIORITY_MATRIX: Record<string, Record<string, Priority>> = {
  org_wide: { high: 'P1', medium: 'P2', low: 'P3' },
  department: { high: 'P2', medium: 'P3', low: 'P3' },
  individual: { high: 'P3', medium: 'P3', low: 'P4' },
};

export function previewPriority(impact: string, urgency: string): Priority | null {
  return PRIORITY_MATRIX[impact]?.[urgency] ?? null;
}
