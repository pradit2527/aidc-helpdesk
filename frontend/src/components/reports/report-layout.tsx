'use client';

import { Search, X } from 'lucide-react';
import * as React from 'react';

import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { cn } from '@/lib/cn';

/**
 * โครงหน้าตาที่ทุกหน้ารายงานใช้ร่วมกัน
 *
 * ก่อนหน้านี้แต่ละหน้าจัดวางเอง ผลคือหน้าหนึ่งเป็นการ์ดคะแนน หน้าหนึ่งเป็นแถบ
 * อีกหน้าเป็นกล่องตัวเลขสิบกว่ากล่อง ผู้ใช้ต้องเรียนรู้หน้าตาใหม่ทุกครั้งที่เปลี่ยนหน้า
 *
 * กติกาของชุดนี้มีสามข้อ
 *   1. สรุปบนสุด **ไม่เกินสี่ตัวเลข** — เกินกว่านั้นไม่มีใครอ่าน ให้ลงตารางแทน
 *   2. ข้อมูลที่เหลือเป็นตารางเสมอ หัวคอลัมน์บอกหน่วย ตัวเลขชิดขวา
 *   3. หัวข้อของแต่ละส่วนอ่านรู้เรื่องด้วยตัวเอง เลขข้อมาตรฐานเป็นคำอธิบายตัวเล็กใต้หัวข้อ
 */

export type Tone = 'neutral' | 'good' | 'warn' | 'bad';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'text-ink',
  good: 'text-sla-ok',
  warn: 'text-sla-risk',
  bad: 'text-sla-breach',
};

export interface SummaryItem {
  label: string;
  value: string;
  /** บรรทัดเล็กใต้ตัวเลข เช่นเป้าหมายหรือค่าเดือนก่อน */
  sub?: string;
  tone?: Tone;
}

/**
 * แถบสรุปบนสุดของรายงาน — สี่ช่องเท่ากันเสมอ
 *
 * ⚠️ รับได้สูงสุดสี่รายการโดยตั้งใจ ถ้าส่งมามากกว่านั้นจะตัดทิ้งพร้อมเตือนใน console
 *    เพราะถ้าปล่อยให้ใส่ได้ไม่จำกัด หน้าจะกลับไปเป็นกล่องตัวเลขสิบกว่ากล่องเหมือนเดิม
 */
export function SummaryStrip({ items }: { items: SummaryItem[] }): React.JSX.Element {
  if (items.length > 4 && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(`SummaryStrip: ได้รับ ${items.length} รายการ แสดงแค่สี่รายการแรก`);
  }
  const shown = items.slice(0, 4);

  return (
    <Card>
      <CardBody className="grid grid-cols-2 gap-x-6 gap-y-4 py-4 lg:grid-cols-4">
        {shown.map((item) => (
          <div key={item.label}>
            <p className="text-caption text-ink-3">{item.label}</p>
            <p className={cn('tabular text-h2 leading-tight', TONE_CLASS[item.tone ?? 'neutral'])}>
              {item.value}
            </p>
            {item.sub && <p className="text-caption text-ink-3">{item.sub}</p>}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

/**
 * หนึ่งส่วนของรายงาน: หัวข้อ + คำอธิบายเล็ก + ตาราง
 *
 * ใช้ section ซ้อนกันเป็นชั้น ๆ แทนแท็บ เพราะรายงานถูกพิมพ์เป็นเอกสารบ่อย
 * แท็บทำให้เนื้อหาที่ซ่อนอยู่หายไปจากกระดาษ และผู้อ่านไม่รู้ว่ายังมีอะไรอีก
 */
export function ReportSection({
  title,
  clause,
  hint,
  actions,
  children,
}: {
  title: string;
  /** เลขข้อของมาตรฐาน เช่น "ISO/IEC 20000-1 §8.3.3" — ตัวเล็ก ไม่แย่งความสนใจ */
  clause?: string;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Card className="print-break-avoid">
      <CardBody>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-h3">{title}</h2>
            {(clause || hint) && (
              <p className="text-caption text-ink-3">
                {hint}
                {hint && clause && ' · '}
                {clause}
              </p>
            )}
          </div>
          {actions}
        </div>
        {children}
      </CardBody>
    </Card>
  );
}

/**
 * ช่องค้นหาของหน้ารายงาน — ทุกหน้ามีช่องนี้ที่ตำแหน่งเดียวกัน
 *
 * กรองแถวในทุกตารางของหน้าพร้อมกัน ไม่ใช่ตารางเดียว เพราะผู้ใช้ค้นด้วย "คำ"
 * เช่นชื่อบริษัทหรือเลขที่เรื่อง โดยไม่รู้ว่าคำนั้นอยู่ตารางไหน
 */
export function ReportSearch({
  value,
  onChange,
  placeholder = 'ຄົ້ນຫາໃນລາຍງານ...',
  count,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** จำนวนแถวที่เหลือหลังกรอง — บอกเฉพาะตอนมีคำค้น */
  count?: number;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <div className="relative w-full max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
          aria-hidden="true"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="pl-9 pr-9"
        />
        {value !== '' && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="ລ້າງຄຳຄົ້ນຫາ"
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-ink-3 hover:bg-subtle hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {value !== '' && count !== undefined && (
        <p className="text-caption text-ink-3" role="status" aria-live="polite">
          ພົບ {count} ແຖວ
        </p>
      )}
    </div>
  );
}

/**
 * กรองแถวด้วยคำค้น — เทียบกับข้อความที่ผู้เรียกบอกว่าแถวนั้น "มีคำอะไรบ้าง"
 *
 * คำค้นว่างคืนทุกแถวโดยไม่สร้างอาเรย์ใหม่ เพื่อไม่ให้ตารางรีเรนเดอร์ทุกครั้งที่พิมพ์
 */
export function filterRows<T>(rows: T[], term: string, toText: (row: T) => string): T[] {
  const q = term.trim().toLowerCase();
  if (q === '') return rows;
  return rows.filter((row) => toText(row).toLowerCase().includes(q));
}

type ResultStatus = 'pass' | 'fail' | 'no_data';
type ResultLabels = { pass: string; fail: string; noData: string };

const DEFAULT_RESULT_LABELS: ResultLabels = { pass: 'ຜ່ານ', fail: 'ຕົກ', noData: 'ຍັງວັດບໍ່ໄດ້' };

/** ข้อความของป้ายผล — ตารางใช้เป็น `text` ของคอลัมน์ ให้ค้นหา/ส่งออกได้คำเดียวกับที่ป้ายแสดง */
export function resultLabel(
  status: ResultStatus,
  labels: ResultLabels = DEFAULT_RESULT_LABELS,
): string {
  return status === 'pass' ? labels.pass : status === 'fail' ? labels.fail : labels.noData;
}

/** ป้ายผลการประเมินที่ใช้เหมือนกันทุกหน้า — ผ่าน / ตก / ยังวัดไม่ได้ */
export function ResultChip({
  status,
  labels,
}: {
  status: ResultStatus;
  labels?: ResultLabels;
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-caption font-medium',
        status === 'pass' && 'bg-success-subtle text-success',
        status === 'fail' && 'bg-danger-subtle text-danger',
        status === 'no_data' && 'bg-subtle text-ink-2',
      )}
    >
      {resultLabel(status, labels)}
    </span>
  );
}
