/**
 * ป้ายสถานะทั้งหมดของระบบ
 *
 * กฎเดียวที่ห้ามละเมิด: ทุกป้าย = **สี + ไอคอน + ข้อความ** ครบสามอย่าง
 * ทดสอบโดยเปิดหน้าในโหมด grayscale แล้วต้องยังอ่านสถานะได้ครบ (21-ui-ux-design.md §5)
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

const BADGE = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap';

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
  // "รอผู้แจ้ง" อย่างเดียวไม่พอ — ผู้ใช้ต้องรู้ว่ารออะไรอยู่ (G-06)
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
 * มาตรวัดความเร่งด่วนแบบขีด — ยกมาจาก prototype (ADR-003 C-03)
 *
 * ความสูงของขีดบอกลำดับได้โดยไม่ต้องดูสี ใช้คู่กับป้ายสีเพื่อให้อ่านได้สองทาง
 */
export function PriorityMeter({ priority }: { priority: Priority }) {
  const { bars, label } = PRIORITY[priority];
  return (
    <span className="meter" role="img" aria-label={label}>
      {[1, 2, 3, 4].map((i) => (
        <i
          key={i}
          className={cn(
            i <= bars && (priority === 'P1' ? 'bg-p1-solid' : 'bg-ink'),
          )}
        />
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
 * ป้าย SLA
 *
 * ⚠️ ห้ามทำนาฬิกานับถอยหลัง — remainingMinutes เป็น "นาทีทำการ"
 * ตอน 17:31 หรือวันเสาร์นาฬิกาต้องหยุด ซึ่ง client คำนวณเองไม่ได้ (FE-07)
 * จึงแสดงค่าคงที่ที่ backend ส่งมา แล้ว refetch ทุก 60 วินาทีแทน
 */
export function SlaBadge({
  status,
  remainingMinutes,
  remainingUnit,
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
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={cn(BADGE, meta.className, className)}>
        <Icon className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
        {meta.label}
        {/* แสดงเวลาที่เหลือเฉพาะตอนที่ยังมีเวลาเหลือจริง
            ถ้าเกินกำหนดแล้ว คำว่า "เกินกำหนด" ในป้ายบอกครบอยู่แล้ว
            ไม่ต้องต่อท้ายว่า "เหลือ เกินกำหนดแล้ว" ให้ซ้ำซ้อน */}
        {typeof remainingMinutes === 'number' &&
          remainingMinutes > 0 &&
          status !== 'paused' && (
            <span className="tabular font-normal">
              · เหลือ {formatMinutes(remainingMinutes)}
              {remainingUnit === 'business_minutes' ? 'ทำการ' : ''}
            </span>
          )}
        {typeof remainingMinutes === 'number' && remainingMinutes < 0 && (
          <span className="tabular font-normal">
            · เกินมา {formatMinutes(Math.abs(remainingMinutes))}
            {remainingUnit === 'business_minutes' ? 'ทำการ' : ''}
          </span>
        )}
      </span>
      {dueAt && (
        <span className="text-caption text-ink-3 tabular">ครบกำหนด {dueAt}</span>
      )}
    </span>
  );
}

/** นาที -> "3 ชม. 20 น." · เกิน 1 วันทำการแสดงเป็นวันเพื่อให้อ่านง่าย */
function formatMinutes(m: number): string {
  if (m <= 0) return '0 นาที';
  const BUSINESS_DAY = 540;
  if (m >= BUSINESS_DAY) return `${(m / BUSINESS_DAY).toFixed(1)} วัน`;
  const h = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  return h > 0 ? `${h} ชม. ${String(mm).padStart(2, '0')} น.` : `${Math.floor(m)} นาที`;
}
