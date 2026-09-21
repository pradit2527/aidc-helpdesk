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
  Ban,
  CheckCircle2,
  Circle,
  Clock,
  Minus,
  PackageCheck,
  PauseCircle,
  Settings,
  Stamp,
  Truck,
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

// ── ສະຖານະເລື່ອງ 11 ຄ່າ ─────────────────────────────────────────────
//
// ທັງ incident ແລະ service_request ໃຊ້ enum ດຽວກັນ ແຕ່ແຕ່ລະປະເພດໃຊ້ພຽງບາງສ່ວນ
// (ເບິ່ງ TYPE_STATUSES ຂ້າງລຸ່ມ) ແລະ ມີກົດການປ່ຽນສະຖານະຂອງຕົນເອງທີ່ backend ຕັດສິນ
//
// ກຸ່ມສີຍຶດຕາມຄວາມໝາຍ ບໍ່ແມ່ນຕາມຊື່ — ສີບອກ "ໄລຍະ" ໄອຄອນບອກ "ອັນໃດ"
//   ຟ້າ/ມ່ວງ = ກຳລັງເດີນ · ເຫຼືອງ = ຢຸດລໍຖ້າ · ຂຽວ = ສຳເລັດ · ແດງ/ເທົາ = ຈົບແບບບໍ່ສຳເລັດ
export const TICKET_STATUS = {
  new: { label: 'ໃໝ່', icon: Circle, className: 'bg-st-new-bg text-st-new-fg' },
  pending_approval: {
    // ລໍຖ້າອະນຸມັດເປັນສະຖານະຂອງຕົນເອງແລ້ວ ບໍ່ແມ່ນ pending_user + ເຫດຜົນອີກຕໍ່ໄປ
    label: 'ລໍຖ້າອະນຸມັດ',
    icon: Stamp,
    className: 'bg-st-pending-bg text-st-pending-fg',
  },
  rejected: {
    label: 'ບໍ່ອະນຸມັດ',
    icon: Ban,
    className: 'bg-st-rejected-bg text-st-rejected-fg',
  },
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
  pending_vendor: {
    // ໂທນເຫຼືອງດຽວກັບ pending_user ໂດຍຕັ້ງໃຈ (ທັງຄູ່ຄື "ຢຸດລໍຖ້າ ໂມງ SLA ຢຸດນັບ")
    // ແຍກດ້ວຍໄອຄອນລົດຂົນສົ່ງ + ຂໍ້ຄວາມ ຈຶ່ງອ່ານອອກເຖິງພິມຂາວດຳ
    label: 'ລໍຖ້າຜູ້ໃຫ້ບໍລິການພາຍນອກ',
    icon: Truck,
    className: 'bg-st-pending-bg text-st-pending-fg',
  },
  resolved: {
    // "ແກ້ໄຂແລ້ວ" ຢ່າງດຽວອ່ານໄດ້ວ່າ "ແກ້ (ຂໍ້ຄວາມ) ແລ້ວ" — ເຈົ້າຂອງລະບົບຢືນຢັນວ່າຕ້ອງສື່ວ່າ "ສຳເລັດ"
    label: 'ແກ້ໄຂສຳເລັດ',
    icon: CheckCircle2,
    className: 'bg-st-resolved-bg text-st-resolved-fg',
  },
  fulfilled: {
    // ຄູ່ກັບ resolved ແຕ່ຂອງຄຳຂໍບໍລິການ — "ແກ້ໄຂ" ບໍ່ມີຄວາມໝາຍກັບຄຳຂໍທີ່ບໍ່ມີບັນຫາໃຫ້ແກ້
    label: 'ສົ່ງມອບແລ້ວ',
    icon: PackageCheck,
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

/**
 * ຄົ້ນ metadata ຂອງສະຖານະແບບບໍ່ພັງ
 *
 * ⚠️ ໃຊ້ຕົວນີ້ແທນ TICKET_STATUS[x] ສະເໝີເມື່ອຄ່າມາຈາກ API
 *
 *    backend ເພີ່ມສະຖານະໃໝ່ໄດ້ກ່ອນ frontend deploy ຕາມ ແລະ TICKET_STATUS[x].label
 *    ຂອງຄ່າທີ່ບໍ່ຮູ້ຈັກຈະເປັນ undefined.label ເຊິ່ງເຮັດໃຫ້ທັງໜ້າຂາວ
 *    (ແບບດຽວກັບທີ່ເຄີຍເກີດໃນ commit 677ffb3) — ໜ້າທີ່ສະແດງລະຫັດດິບ
 *    ຍັງໃຊ້ວຽກໄດ້ ສ່ວນໜ້າຂາວໃຊ້ບໍ່ໄດ້ເລີຍ
 */
export function statusMeta(status: string): DisplayMeta {
  return (
    (TICKET_STATUS as Record<string, DisplayMeta>)[status] ?? {
      label: status,
      icon: Circle,
      className: 'bg-st-closed-bg text-st-closed-fg',
    }
  );
}

export function statusLabel(status: string): string {
  return statusMeta(status).label;
}

/** ລຳດັບຕາມວົງຈອນຊີວິດຂອງເລື່ອງ ບໍ່ແມ່ນຕາມຕົວອັກສອນ — ໃຊ້ຮ່ວມກັນທຸກໜ້າທີ່ລຽງສະຖານະ */
export const STATUS_ORDER: readonly TicketStatus[] = [
  'new',
  'pending_approval',
  'assigned',
  'in_progress',
  'pending_user',
  'pending_vendor',
  'resolved',
  'fulfilled',
  'closed',
  'rejected',
  'cancelled',
];

/**
 * ສະຖານະທີ່ແຕ່ລະປະເພດໃຊ້ຈິງ
 *
 * ⚠️ ໃຊ້ສຳລັບ "ສະແດງຕົວເລືອກໃຫ້ແຄບລົງ" ເທົ່ານັ້ນ ເຊັ່ນ ຊິບກັ່ນຕອງໃນລາຍງານ
 *    ການຕັດສິນວ່າປ່ຽນໄປສະຖານະໃດໄດ້ແທ້ຍຶດ available_transitions ຈາກ backend ສະເໝີ
 */
export const TYPE_STATUSES: Record<keyof typeof TICKET_TYPE, readonly TicketStatus[]> = {
  incident: [
    'new',
    'assigned',
    'in_progress',
    'pending_user',
    'pending_vendor',
    'resolved',
    'closed',
    'cancelled',
  ],
  service_request: [
    'new',
    'pending_approval',
    'rejected',
    'assigned',
    'in_progress',
    'pending_user',
    'pending_vendor',
    'fulfilled',
    'closed',
    'cancelled',
  ],
};

/**
 * "ເຮັດວຽກຈົບແລ້ວ ລໍຖ້າຜູ້ແຈ້ງຢືນຢັນ" — incident ໃຊ້ resolved · service_request ໃຊ້ fulfilled
 *
 * ສອງຄ່ານີ້ມີຄວາມໝາຍດຽວກັນທຸກບ່ອນທີ່ຖາມວ່າ "ແກ້ແລ້ວບໍ" ຈຶ່ງລວມໄວ້ບ່ອນດຽວ
 * ແທນທີ່ຈະຂຽນ status === 'resolved' ກະຈາຍຢູ່ຫຼາຍໜ້າແລ້ວລືມເພີ່ມ fulfilled ບາງໜ້າ
 */
export const DONE_STATUSES: readonly TicketStatus[] = ['resolved', 'fulfilled'];

export function isDoneStatus(status: string): boolean {
  return (DONE_STATUSES as readonly string[]).includes(status);
}

/**
 * ລໍຖ້າຄົນນອກທີມ — ທີມງານເຮັດຫຍັງຕໍ່ບໍ່ໄດ້ຈົນກວ່າຈະມີຄົນຕອບ
 *
 * ⚠️ `pending_vendor` **ບໍ່ຢູ່ໃນນີ້** ແລະ ບໍ່ຢຸດໂມງ SLA
 *
 *    ຕົງກັບ WAITING_STATUSES ໃນ backend/src/common/constants.ts ເຊິ່ງລະບຸໄວ້ວ່າ
 *    SA ຕັດສິນແລ້ວວ່າການສົ່ງງານໃຫ້ຜູ້ໃຫ້ບໍລິການພາຍນອກ "ບໍ່ຢຸດ" ນາລິກາ ເພາະການ
 *    ເລືອກ ແລະ ເລັ່ງຜູ້ຂາຍເປັນຄວາມຮັບຜິດຊອບຂອງທີມໄອທີເອງ
 *
 *    ຖ້າໜ້າຈໍສະແດງວ່າ pending_vendor "ຢຸດນັບ" ເລື່ອງທີ່ຄ້າງລໍຖ້າອາໄຫຼ່ຈົນເກີນກຳນົດ
 *    ຈະຖືກເຊື່ອງບໍ່ໃຫ້ເຫັນໃນລາຍງານ ທັງທີ່ມັນເປັນເລື່ອງທີ່ເກີນກຳນົດແທ້
 */
export const WAITING_STATUSES: readonly TicketStatus[] = ['pending_approval', 'pending_user'];

export function isWaitingStatus(status: string): boolean {
  return (WAITING_STATUSES as readonly string[]).includes(status);
}

/**
 * ສະຖານະທີ່ໂມງ SLA ຢຸດນັບຈິງ — ຕົງກັບ PAUSED_STATUSES ຂອງ backend ທຸກຄ່າ
 *
 * = ລໍຖ້າຄົນນອກທີມ + ເຮັດຈົບແລ້ວລໍຖ້າຜູ້ແຈ້ງຢືນຢັນ
 */
export const PAUSED_STATUSES: readonly TicketStatus[] = [...WAITING_STATUSES, ...DONE_STATUSES];

export function isSlaPausedStatus(status: string): boolean {
  return (PAUSED_STATUSES as readonly string[]).includes(status);
}

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
