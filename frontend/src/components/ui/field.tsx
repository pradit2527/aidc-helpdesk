'use client';

import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * ช่องกรอกทั้งหมดของระบบ
 *
 * ขนาดตัวอักษรต้อง >= 16px เสมอ ห้ามลดลงมาแม้บนมือถือ
 * เพราะ Safari บน iOS จะซูมหน้าเข้าเองทันทีที่โฟกัส input ที่เล็กกว่านั้น
 * ผู้ใช้ต้องหุบนิ้วออกเองทุกช่อง ซึ่งกรอกฟอร์มยาวแทบไม่ได้
 */

/**
 * .field-input นิยามไว้แล้วใน globals.css รวมทั้ง font-size: 16px ที่กัน iOS ซูม
 * ที่นี่แค่เติมสถานะ "กรอกผิด" ทับลงไป ไม่นิยามสไตล์ช่องกรอกซ้ำอีกชุด
 */
const invalidClass =
  'aria-[invalid=true]:border-sla-breach-solid aria-[invalid=true]:bg-sla-breach-bg/40 ' +
  'disabled:bg-subtle disabled:text-ink-3';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn('field-input', invalidClass, className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn('field-input', invalidClass, 'min-h-0 py-2.5', className)}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn('field-input', invalidClass, 'pr-8', className)} {...props}>
      {children}
    </select>
  );
});

/**
 * `| undefined` ที่เขียนไว้ทุกช่องไม่ใช่ส่วนเกิน — tsconfig เปิด
 * exactOptionalPropertyTypes ไว้ จึงถือว่า "ไม่ส่ง prop" กับ "ส่งมาเป็น undefined"
 * เป็นคนละเรื่องกัน และผู้เรียกมักส่งค่าจาก errors[key] ซึ่งเป็น undefined ได้
 */
interface FieldProps {
  label: string;
  htmlFor?: string | undefined;
  /** ข้อความช่วยเหลือใต้ช่อง — หายไปเมื่อมี error เพื่อไม่ให้อ่านสองบรรทัดพร้อมกัน */
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  children: React.ReactNode;
  className?: string | undefined;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: FieldProps): React.JSX.Element {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-label text-ink">
        {label}
        {required && (
          <>
            {' '}
            <span className="text-sla-breach" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(ຈຳເປັນ)</span>
          </>
        )}
      </label>

      {/* ผูก aria-describedby/aria-invalid ให้ลูกอัตโนมัติ ไม่ต้องเขียนซ้ำทุกฟอร์ม */}
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id: htmlFor,
            'aria-describedby': describedBy,
            'aria-invalid': error ? true : undefined,
          })
        : children}

      {error ? (
        <p id={`${htmlFor}-error`} className="text-caption text-sla-breach" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-caption text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
