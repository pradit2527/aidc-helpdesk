'use client';

import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

/**
 * ตารางที่ใช้ซ้ำทุกหน้าที่มีรายการ
 *
 * บนจอแคบตารางไม่ถูกย่อให้เล็กลง แต่เลื่อนแนวนอนในกล่องของตัวเอง
 * ตัวหน้าเว็บต้องไม่เลื่อนซ้ายขวาเด็ดขาด (กฎ M-2)
 * หน้าที่มีรายการหลักจะสลับไปใช้การ์ดแทนบนมือถือ ไม่ใช้ตารางเลย
 */

export interface Column<T> {
  key: string;
  header: string;
  /** ซ่อนคอลัมน์รองบนจอแคบแทนที่จะบีบให้อ่านไม่ออก */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl' | undefined;
  align?: 'left' | 'right' | 'center' | undefined;
  width?: string | undefined;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: ((row: T) => void) | undefined;
  emptyTitle?: string | undefined;
  emptyHint?: string | undefined;
  caption?: string | undefined;
}

const HIDE_CLASS = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  // ตารางเริ่มแสดงที่ lg (1024px) แต่เมื่อหักแถบเมนูซ้ายกับระยะขอบแล้ว
  // เหลือความกว้างจริงราว 690px ซึ่งไม่พอสำหรับเจ็ดคอลัมน์
  // คอลัมน์รองจึงรอถึง xl ค่อยโผล่ แทนที่จะบีบทุกคอลัมน์จนอ่านไม่ออก
  xl: 'hidden xl:table-cell',
} as const;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyTitle = 'ບໍ່ມີຂໍ້ມູນ',
  emptyHint,
  caption,
}: DataTableProps<T>): React.JSX.Element {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <>
      {/*
        บนจอเล็กแปลงเป็นการ์ด ไม่ใช่ตารางที่ปัดซ้ายขวา
        ตารางกว้าง 640–720px บนจอ 375px อ่านได้ทีละสองคอลัมน์ ต้องปัดไปมา
        เพื่อจับคู่ค่ากับหัวคอลัมน์ ซึ่งใช้งานจริงไม่ไหว
        คอลัมน์แรกกลายเป็นหัวการ์ด ที่เหลือเป็นคู่ ป้ายกำกับ–ค่า
      */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(
              'rounded-lg border border-hair bg-surface p-4 shadow-card',
              onRowClick && 'cursor-pointer',
            )}
          >
            {columns[0] && <div className="mb-2">{columns[0].render(row)}</div>}
            <dl className="divide-y divide-hair">
              {columns.slice(1).map((col) =>
                col.header ? (
                  <div key={col.key} className="flex items-baseline justify-between gap-3 py-1.5">
                    <dt className="flex-none text-caption text-ink-3">{col.header}</dt>
                    <dd className="min-w-0 text-right text-body-sm">{col.render(row)}</dd>
                  </div>
                ) : (
                  // คอลัมน์ที่ไม่มีหัวข้อคือคอลัมน์ปุ่ม วางเต็มแถวไม่ต้องมีป้ายกำกับ
                  <div key={col.key} className="pt-2">
                    {col.render(row)}
                  </div>
                ),
              )}
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[640px] border-collapse text-body-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-hair text-left">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'px-3 py-2.5 text-caption font-semibold text-ink-2',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.hideBelow && HIDE_CLASS[col.hideBelow],
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-hair last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-subtle',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-3 py-3 align-middle',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.hideBelow && HIDE_CLASS[col.hideBelow],
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  hint?: string | undefined;
  action?: React.ReactNode | undefined;
  icon?: React.ComponentType<{ className?: string }> | undefined;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-subtle text-ink-3">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 text-body font-semibold text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-body-sm text-ink-2">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}): React.JSX.Element | null {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hair px-4 py-3 lg:px-5">
      <p className="tabular text-caption text-ink-2">
        ສະແດງ {formatNumber(from)}–{formatNumber(to)} ຈາກ {formatNumber(total)} ລາຍການ
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          ກ່ອນໜ້າ
        </Button>
        <span className="tabular px-1 text-caption text-ink-2">
          {page} / {pageCount}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          ຖັດໄປ
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
