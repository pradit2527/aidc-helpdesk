'use client';

import Link from 'next/link';
import * as React from 'react';

import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

/** แถบหัวข้อของหน้า พร้อมปุ่มการกระทำหลักด้านขวา */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string | undefined;
  actions?: React.ReactNode | undefined;
}): React.JSX.Element {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-h1">{title}</h1>
        {description && <p className="mt-1 text-body-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** แท็บที่ใช้ทั้งในคิวงานและหน้ารายการอื่น ๆ */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { key: T; label: string; count?: number | undefined }[];
  value: T;
  onChange: (key: T) => void;
  label: string;
}): React.JSX.Element {
  return (
    <div className="overflow-x-auto">
      <div role="tablist" aria-label={label} className="flex min-w-max gap-1 border-b border-hair">
        {tabs.map((tab) => {
          const active = tab.key === value;
          return (
            <button
              key={tab.key}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onChange(tab.key)}
              className={cn(
                'flex min-h-tap items-center gap-2 border-b-2 px-3 text-body-sm font-semibold transition-colors',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-ink-2 hover:text-ink',
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'tabular grid h-5 min-w-[22px] place-items-center rounded-full px-1.5 text-caption',
                    active ? 'bg-primary-subtle text-primary' : 'bg-subtle text-ink-2',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Avatar({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg' | undefined;
}): React.JSX.Element {
  const sizeClass = {
    sm: 'h-7 w-7 text-[11px]',
    md: 'h-9 w-9 text-caption',
    lg: 'h-12 w-12 text-body',
  }[size];

  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid flex-none place-items-center rounded-full bg-subtle font-semibold text-ink-2',
        sizeClass,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** คู่ ป้ายกำกับ–ค่า ที่ใช้ในแผงรายละเอียดด้านข้าง */
export function DefRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
      <dt className="text-caption text-ink-3">{label}</dt>
      <dd className="min-w-0 text-right text-body-sm text-ink">{children}</dd>
    </div>
  );
}

/**
 * กล่องบอกว่ายังต่อ backend ไม่ครบ
 *
 * มีไว้เพื่อไม่ให้ผู้ทดสอบเข้าใจผิดว่าหน้าเสร็จแล้วทั้งที่ยังอ่านข้อมูลจำลอง
 * ตั้งใจให้เห็นชัด ไม่ใช่ตัวเล็กมุมจอ และจะถูกลบเมื่อผูก API จริงครบ
 */
export function MockNotice({ endpoint }: { endpoint: string }): React.JSX.Element {
  return (
    <p className="mb-4 rounded border border-dashed border-control bg-subtle px-3 py-2 text-caption text-ink-2">
      ໜ້ານີ້ຍັງໃຊ້ຂໍ້ມູນຈຳລອງ — ລໍຖ້າ <code className="font-mono">{endpoint}</code> ຈາກ backend
    </p>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success' | undefined;
  title: string;
  children?: React.ReactNode | undefined;
  action?: React.ReactNode | undefined;
}): React.JSX.Element {
  const toneClass = {
    info: 'border-primary/30 bg-primary-subtle text-ink',
    warning: 'border-sla-risk/30 bg-sla-risk-bg text-ink',
    danger: 'border-sla-breach/30 bg-sla-breach-bg text-ink',
    success: 'border-sla-ok/30 bg-sla-ok-bg text-ink',
  }[tone];

  return (
    <div className={cn('rounded border px-4 py-3', toneClass)} role={tone === 'danger' ? 'alert' : undefined}>
      <p className="text-body-sm font-semibold">{title}</p>
      {children && <div className="mt-1 text-body-sm text-ink-2">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** ลิงก์ย้อนกลับด้านบนของหน้ารายละเอียด */
export function BackLink({ href, label }: { href: string; label: string }): React.JSX.Element {
  return (
    <Link
      href={href}
      className="mb-3 inline-flex min-h-[36px] items-center gap-1 text-body-sm text-ink-2 hover:text-primary"
    >
      ← {label}
    </Link>
  );
}
