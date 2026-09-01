/**
 * ປ້າຍສະຖານະທັງໝົດຂອງລະບົບ
 *
 * ກົດດຽວທີ່ຫ້າມລະເມີດ: ທຸກປ້າຍ = **ສີ + ໄອຄອນ + ຂໍ້ຄວາມ** ຄົບສາມຢ່າງ
 * ທົດສອບໂດຍເປີດໜ້າໃນໂໝດ grayscale ແລ້ວຕ້ອງຍັງອ່ານສະຖານະໄດ້ຄົບ (21-ui-ux-design.md §5)
 */

import {
  PRIORITY,
  SLA_STATUS,
  TICKET_STATUS,
  PENDING_REASON,
  type Priority,
  type SlaStatus,
  type TicketStatus,
} from '@/config/enums';
import { cn } from '@/lib/cn';
import { formatSlaRemaining } from '@/lib/format';

const BADGE =
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap';

export function StatusBadge({
  status,
  pendingReason,
  className,
}: {
  status: TicketStatus;
  pendingReason?: keyof typeof PENDING_REASON | null;
  className?: string;
}) {
  const meta = TICKET_STATUS[status];
  const Icon = meta.icon;
  // "ລໍຖ້າຜູ້ແຈ້ງ" ຢ່າງດຽວບໍ່ພໍ — ຜູ້ໃຊ້ຕ້ອງຮູ້ວ່າລໍຖ້າຫຍັງຢູ່ (G-06)
  const label =
    status === 'pending_user' && pendingReason ? PENDING_REASON[pendingReason] : meta.label;

  return (
    <span className={cn(BADGE, meta.className, className)}>
      <Icon className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * ມາດວັດຄວາມຮີບດ່ວນແບບຂີດ — ຍົກມາຈາກ prototype (ADR-003 C-03)
 *
 * ຄວາມສູງຂອງຂີດບອກລຳດັບໄດ້ໂດຍບໍ່ຕ້ອງເບິ່ງສີ ໃຊ້ຄູ່ກັບປ້າຍສີເພື່ອໃຫ້ອ່ານໄດ້ສອງທາງ
 */
export function PriorityMeter({ priority }: { priority: Priority }) {
  const { bars, label } = PRIORITY[priority];
  return (
    <span className="meter" role="img" aria-label={label}>
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className={cn(i <= bars && (priority === 'P1' ? 'bg-p1-solid' : 'bg-ink'))} />
      ))}
    </span>
  );
}

export function PriorityBadge({
  priority,
  withMeter = true,
  className,
}: {
  priority: Priority;
  withMeter?: boolean;
  className?: string;
}) {
  const meta = PRIORITY[priority];
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-2">
      {withMeter && <PriorityMeter priority={priority} />}
      <span className={cn(BADGE, meta.className, className)} title={meta.criteria}>
        <Icon className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
        {meta.label}
      </span>
    </span>
  );
}

/**
 * ປ້າຍ SLA
 *
 * ⚠️ ຫ້າມເຮັດໂມງນັບຖອຍຫຼັງ — remainingMinutes ເປັນ "ນາທີເຮັດວຽກ"
 * ຕອນ 17:31 ຫຼື ວັນເສົາໂມງຕ້ອງຢຸດ ເຊິ່ງ client ຄຳນວນເອງບໍ່ໄດ້ (FE-07)
 * ຈຶ່ງສະແດງຄ່າຄົງທີ່ທີ່ backend ສົ່ງມາ ແລ້ວ refetch ທຸກ 60 ວິນາທີແທນ
 */
export function SlaBadge({
  status,
  remainingMinutes,
  remainingUnit = 'business_minutes',
  dueAt,
  className,
}: {
  status: SlaStatus;
  remainingMinutes?: number | null;
  remainingUnit?: 'business_minutes' | 'calendar_minutes';
  dueAt?: string | null;
  className?: string;
}) {
  const meta = SLA_STATUS[status];
  const Icon = meta.icon;

  // ປ້າຍບອກສະຖານະຢູ່ແລ້ວ ຈຶ່ງບອກຕົວເລກເພີ່ມສະເພາະຕອນທີ່ເພີ່ມຄວາມໝາຍຈິງ
  // "ຢຸດນັບຊົ່ວຄາວ · ຢຸດນັບຢູ່" ຄືການເວົ້າຄຳດຽວກັນສອງເທື່ອ
  const showRemaining = typeof remainingMinutes === 'number' && status !== 'paused';

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={cn(BADGE, meta.className, className)}>
        <Icon className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
        {meta.label}
        {showRemaining && (
          <span className="tabular font-normal">
            · {formatSlaRemaining(remainingMinutes, remainingUnit)}
          </span>
        )}
      </span>
      {dueAt && <span className="tabular text-caption text-ink-3">ຄົບກຳນົດ {dueAt}</span>}
    </span>
  );
}
