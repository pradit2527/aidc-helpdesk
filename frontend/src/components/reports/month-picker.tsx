'use client';

import * as React from 'react';

import { Select } from '@/components/ui/field';
import { buddhistYear, LAO_MONTHS } from '@/lib/format';

/**
 * ตัวเลือกเดือนของรายงานรายเดือน — ย้อนหลัง 12 เดือนนับจากเดือนปัจจุบัน
 *
 * ⚠️ ขอบเดือนเป็นเวลาเวียงจันทน์ (+07:00) ไม่ใช่ UTC
 *    ขอบแบบ UTC จะดึงงานของวันที่ 1 เวลา 00:00–07:00 ไปอยู่เดือนก่อน
 *    และ backend จะไม่ถือว่าเป็น "เดือนเต็ม" จึงเทียบกับเดือนก่อนหน้าไม่ได้
 *
 * เดิมหน้ารายงาน SLA ฝังตัวเลือกไว้สามเดือนตายตัว (มิ.ย.–ส.ค. 2569)
 * พอขึ้นเดือนใหม่ก็เลือกเดือนปัจจุบันไม่ได้ — ตัวนี้คำนวณจากวันนี้เสมอ
 */

const OFFSET_MS = 7 * 60 * 60 * 1000;

/** เดือนปัจจุบันตามเวลาเวียงจันทน์ในรูป YYYY-MM */
export function currentMonth(now: Date = new Date()): string {
  const local = new Date(now.getTime() + OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** ช่วงเวลาเต็มเดือน — to เป็นขอบเปิด (วันที่ 1 ของเดือนถัดไป) */
export function monthRange(value: string): { from: string; to: string } {
  const [y = 2026, m = 1] = value.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const iso = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}-01T00:00:00+07:00`;
  return { from: iso(y, m), to: iso(nextY, nextM) };
}

/** เช่น "ກັນຍາ 2569" */
export function monthLabel(value: string): string {
  const [y = 2026, m = 1] = value.split('-').map(Number);
  return `${LAO_MONTHS[m - 1]} ${buddhistYear(y)}`;
}

function lastMonths(count: number): string[] {
  const [y = 2026, m = 1] = currentMonth().split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function MonthPicker({
  value,
  onChange,
  id = 'report-month',
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}): React.JSX.Element {
  const months = React.useMemo(() => lastMonths(12), []);
  const now = months[0];

  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="ເລືອກເດືອນຂອງລາຍງານ"
      className="w-auto"
    >
      {months.map((m) => (
        <option key={m} value={m}>
          {monthLabel(m)}
          {m === now ? ' (ເດືອນນີ້)' : ''}
        </option>
      ))}
    </Select>
  );
}
