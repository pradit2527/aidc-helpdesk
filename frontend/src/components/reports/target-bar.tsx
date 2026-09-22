'use client';

import { AlertOctagon, ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDashed } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * ชิ้นส่วนภาพของรายงาน — "ค่าจริงเทียบเป้า" ในรูปเดียวกันทุกหน้า
 *
 * ผู้อ่านรายงานส่วนใหญ่อยากรู้เรื่องเดียว: ผ่านเป้าไหม ห่างเท่าไร
 * ตัวเลขเปล่า "60%" ต้องไปหาเป้าเองว่าคือ 95 — แถบที่มีเส้นเป้ากำกับตอบได้ในครึ่งวินาที
 */

export type Direction = 'higher' | 'lower';

export function meetsTarget(value: number | null, target: number, direction: Direction): boolean | null {
  if (value === null) return null;
  return direction === 'higher' ? value >= target : value <= target;
}

/** แถบค่าจริง พร้อมเส้นแนวตั้งที่ตำแหน่งเป้า · สีบอกผ่าน/ไม่ผ่าน */
export function TargetBar({
  value,
  target,
  max = 100,
  min = 0,
  direction = 'higher',
  targetLabel,
  label,
}: {
  value: number | null;
  target: number;
  max?: number;
  min?: number;
  direction?: Direction;
  /** ข้อความใต้เส้นเป้า เช่น "ເປົ້າ 95%" · ไม่ส่ง = ไม่แสดง */
  targetLabel?: string | undefined;
  /** ข้อความสำหรับโปรแกรมอ่านหน้าจอ */
  label: string;
}): React.JSX.Element {
  const ok = meetsTarget(value, target, direction);
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
  const targetPos = pos(target);
  // ป้ายเป้าที่อยู่ชิดขวาจะล้นขอบการ์ด — ยึดขอบขวาแทนการจัดกึ่งกลาง
  const labelStyle: React.CSSProperties =
    targetPos > 80 ? { right: 0 } : { left: `${targetPos}%`, transform: 'translateX(-50%)' };

  return (
    <div>
      <div className="relative h-2.5 rounded-full bg-subtle" role="img" aria-label={label}>
        {value !== null && (
          <div
            className={cn('h-full rounded-full', ok ? 'bg-sla-ok' : 'bg-sla-breach-solid')}
            // ขั้นต่ำ 2% ให้เห็นว่ามีค่า แม้ค่าจริงจะใกล้ศูนย์ — ค่าจริงอยู่ในข้อความข้างแถบ
            style={{ width: `${Math.max(pos(value), 2)}%` }}
          />
        )}
        <span
          className="absolute -bottom-1 -top-1 w-0.5 rounded bg-ink"
          style={{ left: `calc(${targetPos}% - 1px)` }}
          aria-hidden="true"
        />
      </div>
      {targetLabel && (
        <div className="relative mt-1 h-4 text-caption text-ink-3" aria-hidden="true">
          <span className="absolute whitespace-nowrap" style={labelStyle}>
            {targetLabel}
          </span>
        </div>
      )}
    </div>
  );
}

/** ป้ายผ่าน / ไม่ผ่าน / ยังวัดไม่ได้ */
export function VerdictChip({ meets, className }: { meets: boolean | null; className?: string }): React.JSX.Element {
  const meta =
    meets === null
      ? { text: 'ຍັງວັດບໍ່ໄດ້', cls: 'bg-sla-paused-bg text-sla-paused', Icon: CircleDashed }
      : meets
        ? { text: 'ຜ່ານເປົ້າ', cls: 'bg-sla-ok-bg text-sla-ok', Icon: CheckCircle2 }
        : { text: 'ບໍ່ຜ່ານເປົ້າ', cls: 'bg-sla-breach-bg text-sla-breach', Icon: AlertOctagon };
  const { Icon } = meta;
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-semibold',
        meta.cls,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.text}
    </span>
  );
}

/** เทียบกับเดือนก่อน — ลูกศรชี้ทิศที่ค่าเปลี่ยน สีบอกว่าดีขึ้นหรือแย่ลง */
export function Trend({
  value,
  prev,
  direction,
  format,
}: {
  value: number | null;
  prev: number | null;
  direction: Direction;
  format: (v: number) => string;
}): React.JSX.Element | null {
  if (prev === null) return <span className="text-caption text-ink-3">ເດືອນກ່ອນ: ບໍ່ມີຂໍ້ມູນ</span>;
  if (value === null) return <span className="text-caption text-ink-3">ເດືອນກ່ອນ {format(prev)}</span>;

  const delta = Math.round((value - prev) * 10) / 10;
  if (delta === 0) return <span className="text-caption text-ink-3">ເທົ່າເດືອນກ່ອນ ({format(prev)})</span>;

  const better = direction === 'higher' ? delta > 0 : delta < 0;
  const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-caption', better ? 'text-sla-ok' : 'text-sla-breach')}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {better ? 'ດີຂຶ້ນ' : 'ແຍ່ລົງ'} ຈາກ {format(prev)}
    </span>
  );
}

/**
 * การ์ดตัวชี้วัดหนึ่งตัว — ชื่อที่คนทั่วไปอ่านเข้าใจ + ค่าใหญ่ + ผ่านไหม + แถบเทียบเป้า + เทียบเดือนก่อน
 */
export function Scorecard({
  title,
  hint,
  value,
  target,
  direction = 'higher',
  max = 100,
  min = 0,
  format,
  prev,
  basis,
}: {
  title: string;
  /** อธิบายสั้น ๆ ว่าตัวเลขนี้นับอะไร */
  hint: string;
  value: number | null;
  target: number;
  direction?: Direction;
  max?: number;
  min?: number;
  format: (v: number) => string;
  /** undefined = ไม่แสดงการเทียบเดือนก่อน */
  prev?: number | null;
  /** เช่น "ຈາກ 5 ເລື່ອງທີ່ປິດ" */
  basis?: string | undefined;
}): React.JSX.Element {
  const ok = meetsTarget(value, target, direction);
  const targetText = `ເປົ້າ ${direction === 'higher' ? '≥' : '≤'} ${format(target)}`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-hair bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-body-sm font-semibold text-ink">{title}</p>
          <p className="text-caption text-ink-3">{hint}</p>
        </div>
        <VerdictChip meets={ok} />
      </div>
      <p
        className={cn(
          'tabular text-display leading-none',
          ok === true && 'text-sla-ok',
          ok === false && 'text-sla-breach',
          ok === null && 'text-ink-3',
        )}
      >
        {value === null ? '—' : format(value)}
      </p>
      <TargetBar
        value={value}
        target={target}
        max={max}
        min={min}
        direction={direction}
        targetLabel={targetText}
        label={`${title} ${value === null ? 'ຍັງວັດບໍ່ໄດ້' : format(value)} · ${targetText}`}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {basis && <span className="text-caption text-ink-3">{basis}</span>}
        {prev !== undefined && <Trend value={value} prev={prev} direction={direction} format={format} />}
      </div>
    </div>
  );
}
