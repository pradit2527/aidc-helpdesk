import * as React from 'react';

import { cn } from '@/lib/cn';

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn('rounded-lg border border-hair bg-surface shadow-card', className)}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b border-hair px-4 py-3 lg:px-5',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>): React.JSX.Element {
  return <h2 className={cn('text-h3', className)} {...props} />;
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cn('px-4 py-4 lg:px-5', className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-t border-hair px-4 py-3 lg:px-5',
        className,
      )}
      {...props}
    />
  );
}

/**
 * การ์ดตัวเลขสรุปบนแดชบอร์ด
 *
 * ตัวเลขใช้ font-variant-numeric: tabular-nums เพื่อให้หลักตรงกันทุกใบ
 * ถ้าไม่ตั้ง ตัวเลขจะขยับซ้ายขวาทุกครั้งที่ค่าเปลี่ยน แล้วอ่านเทียบกันยาก
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string | undefined;
  tone?: 'default' | 'breach' | 'risk' | 'ok' | undefined;
  icon?: React.ComponentType<{ className?: string }> | undefined;
}): React.JSX.Element {
  const toneClass = {
    default: 'text-ink',
    breach: 'text-sla-breach',
    risk: 'text-sla-risk',
    ok: 'text-sla-ok',
  }[tone];

  return (
    <Card className="p-4 lg:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-body-sm text-ink-2">{label}</span>
        {Icon && <Icon className={cn('h-5 w-5 flex-none', toneClass)} />}
      </div>
      <p className={cn('tabular mt-2 text-display', toneClass)}>{value}</p>
      {hint && <p className="mt-1 text-caption text-ink-3">{hint}</p>}
    </Card>
  );
}
