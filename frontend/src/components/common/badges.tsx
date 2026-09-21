/**
 * ປ້າຍສະຖານະທັງໝົດຂອງລະບົບ
 *
 * ກົດດຽວທີ່ຫ້າມລະເມີດ: ທຸກປ້າຍ = **ສີ + ໄອຄອນ + ຂໍ້ຄວາມ** ຄົບສາມຢ່າງ
 * ທົດສອບໂດຍເປີດໜ້າໃນໂໝດ grayscale ແລ້ວຕ້ອງຍັງອ່ານສະຖານະໄດ້ຄົບ (21-ui-ux-design.md §5)
 */

import {
  PRIORITY,
  SLA_STATUS,
  PENDING_REASON,
  statusMeta,
  type Priority,
  type SlaStatus,
  type TicketStatus,
} from '@/config/enums';
import { cn } from '@/lib/cn';
import { formatSlaRemaining } from '@/lib/format';

/**
 * ป้ายทุกชนิดต้องตัดบรรทัดได้เมื่อจำเป็น
 *
 * เดิมเป็น whitespace-nowrap ซึ่งดีตราบใดที่ข้อความสั้น แต่ป้ายบางอันยาวจริง
 * เช่น "ລໍຖ້າອາໄຫຼ່ / ຜູ້ໃຫ້ບໍລິການພາຍນອກ" กว้าง 243px ซึ่งเกินจอ 320px
 * และคำแปลไทยของบางป้ายก็ยาวกว่าลาว จึงยาวเกินได้อีกทาง
 *
 * flex-wrap จำเป็นคู่กับ whitespace-normal เพราะ inline-flex
 * ไม่ขึ้นบรรทัดใหม่ให้เอง ไอคอนกับข้อความจะเรียงเป็นแถวยาวแถวเดียว
 */
const BADGE_BASE = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-semibold';
const BADGE = `${BADGE_BASE} max-w-full flex-wrap`;

export function StatusBadge({
  status,
  pendingReason,
  className,
}: {
  /** ຮັບ string ນຳ — ສະຖານະທີ່ backend ເພີ່ມກ່ອນ frontend ຕ້ອງສະແດງໄດ້ ບໍ່ແມ່ນລົ້ມ */
  status: TicketStatus | (string & {});
  /** ຂໍ້ຄວາມອິດສະຫຼະ — ບໍ່ແມ່ນ enum ອີກຕໍ່ໄປ (backend ຖອດ CHECK ອອກແລ້ວ) */
  pendingReason?: string | null;
  className?: string;
}) {
  const meta = statusMeta(status);
  const Icon = meta.icon;
  /*
   * "ລໍຖ້າຜູ້ແຈ້ງ" ຢ່າງດຽວບໍ່ພໍ — ຜູ້ໃຊ້ຕ້ອງຮູ້ວ່າລໍຖ້າຫຍັງຢູ່ (G-06)
   *
   * pending_vendor ກັບ pending_approval ບອກຢູ່ໃນຊື່ສະຖານະແລ້ວ ຈຶ່ງບໍ່ທັບ
   * ເຫຼືອແຕ່ pending_user — ແລະ ຂໍ້ມູນເກົ່າຍັງເປັນ 'user'/'vendor'/'approval'
   * ສ່ວນຂໍ້ມູນໃໝ່ເປັນຂໍ້ຄວາມອິດສະຫຼະ ຈຶ່ງແປໄດ້ກໍ່ແປ ແປບໍ່ໄດ້ກໍ່ສະແດງຕາມທີ່ມາ
   */
  const reasonLabel =
    pendingReason && pendingReason in PENDING_REASON
      ? PENDING_REASON[pendingReason as keyof typeof PENDING_REASON]
      : (pendingReason ?? null);
  const label = status === 'pending_user' && reasonLabel ? reasonLabel : meta.label;

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
  compact = false,
  className,
}: {
  status: SlaStatus;
  remainingMinutes?: number | null;
  remainingUnit?: 'business_minutes' | 'calendar_minutes';
  dueAt?: string | null;
  /** บรรทัดเดียวสำหรับตาราง — ข้อความเต็มอยู่ใน tooltip และโปรแกรมอ่านหน้าจอ */
  compact?: boolean;
  className?: string;
}) {
  const meta = SLA_STATUS[status];
  const Icon = meta.icon;

  // ປ້າຍບອກສະຖານະຢູ່ແລ້ວ ຈຶ່ງບອກຕົວເລກເພີ່ມສະເພາະຕອນທີ່ເພີ່ມຄວາມໝາຍຈິງ
  // "ຢຸດນັບຊົ່ວຄາວ · ຢຸດນັບຢູ່" ຄືການເວົ້າຄຳດຽວກັນສອງເທື່ອ
  const showRemaining = typeof remainingMinutes === 'number' && status !== 'paused';

  if (compact) {
    const full = showRemaining
      ? `${meta.label} · ${formatSlaRemaining(remainingMinutes, remainingUnit)}`
      : meta.label;
    /*
     * ตารางต้องอ่านทีละแถวได้เร็ว ป้ายสองสามบรรทัดทำให้แถวสูงไม่เท่ากันและตาต้องไล่ลงหาเอง
     * จึงย่อเหลือบรรทัดเดียว: ไอคอน + คำนำสั้นที่ยังบอกสถานะ + เวลาแบบย่อ
     * ยังครบ สี + ไอคอน + ข้อความ ตามกฎ — ข้อความเต็มพร้อมหน่วย "ມື້ເຮັດວຽກ" อยู่ใน title
     */
    return (
      <span className={cn(BADGE_BASE, 'whitespace-nowrap', meta.className, className)} title={full}>
        <Icon className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
        <span className="sr-only">{full}</span>
        <span className="tabular" aria-hidden="true">
          {compactSlaText(status, showRemaining ? remainingMinutes : null, remainingUnit)}
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-full flex-col items-start gap-0.5">
      {/*
        ป้ายนี้ยาวกว่าป้ายอื่นเพราะมีเวลาที่เหลือต่อท้าย เช่น
        "ເກີນກຳນົດ · ເກີນມາ 1 ຊມ. 12 ນທ." ซึ่งบนจอ 320px กว้างเกินจอ
        จึงยอมให้ตัดบรรทัดได้ ต่างจากป้ายสถานะอื่นที่สั้นพอเสมอ
      */}
      {/* flex-wrap จำเป็นด้วย เพราะ inline-flex ไม่ตัดบรรทัดให้เอง
          whitespace-normal อย่างเดียวยังทำให้สามชิ้นในป้ายเรียงกันเป็นแถวยาวแถวเดียว */}
      <span
        className={cn(BADGE, 'max-w-full flex-wrap whitespace-normal', meta.className, className)}
      >
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

/**
 * ข้อความ SLA บรรทัดเดียว เช่น "ເຫຼືອ 2 ຊມ. 24 ນທ." · "ໃກ້ຄົບ · 2 ຊມ." · "ເກີນ 1 ມື້ 4 ຊມ."
 *
 * คำนำต่างกันทุกสถานะ ผู้ใช้ตาบอดสีจึงแยก "ยังทัน" "ใกล้ครบ" "เกิน" ออกจากตัวอักษรได้เอง
 *
 * ⚠️ "ມື້" ในตารางนี้คือวันทำการ (540 นาที) เสมอ — เวลาแบบนับปฏิทิน (P1) ไม่ถูกแปลงเป็นวัน
 *    เหมือน formatMinutes ใช้ floor ไม่ใช่ round เพราะ 539 นาทีปัดขึ้นจะได้ "0 ມື້ 9 ຊມ." ที่เท่ากับหนึ่งวันเต็ม
 */
function compactSlaText(
  status: SlaStatus,
  minutes: number | null | undefined,
  unit: 'business_minutes' | 'calendar_minutes',
): string {
  if (status === 'paused' || minutes === null || minutes === undefined) return 'ຢຸດນັບ';

  const abs = Math.abs(minutes);
  let span: string;
  if (unit === 'business_minutes' && abs >= 540) {
    const days = Math.floor(abs / 540);
    const hours = Math.floor((abs % 540) / 60);
    span = hours > 0 ? `${days} ມື້ ${hours} ຊມ.` : `${days} ມື້`;
  } else if (abs >= 60) {
    const hours = Math.floor(abs / 60);
    const rest = abs % 60;
    // เกินสิบชั่วโมงแล้ว นาทีไม่ช่วยตัดสินใจอะไร ตัดทิ้งให้สั้น
    span = hours >= 10 || rest === 0 ? `${hours} ຊມ.` : `${hours} ຊມ. ${rest} ນທ.`;
  } else {
    span = `${abs} ນທ.`;
  }

  if (status === 'breached' || minutes < 0) return `ເກີນ ${span}`;
  if (status === 'at_risk') return `ໃກ້ຄົບ · ${span}`;
  return `ເຫຼືອ ${span}`;
}
