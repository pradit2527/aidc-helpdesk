'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * ทุกปุ่มสูงอย่างน้อย 44px ตามกฎ M-1 (21-ui-ux-design.md)
 * เพราะผู้ใช้หน้างานกดผ่านถุงมือหรือมือเปื้อน
 * ขนาด sm ใช้ได้เฉพาะในตารางบนเดสก์ท็อปที่มีเมาส์
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded font-semibold transition-colors ' +
    'disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white hover:bg-primary-hover',
        secondary: 'border border-control bg-surface text-ink hover:bg-subtle',
        ghost: 'text-ink-2 hover:bg-subtle hover:text-ink',
        // ปุ่มทำลายล้างใช้สีเดียวกับ SLA breach เพื่อไม่เพิ่มความหมายของสีใหม่
        danger: 'bg-sla-breach-solid text-white hover:brightness-90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'min-h-[36px] px-3 text-body-sm',
        md: 'min-h-tap px-4 text-body-sm',
        lg: 'min-h-[52px] px-6 text-body',
        icon: 'h-tap w-tap',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, children, disabled, ...props },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size }), className);

  /**
   * asChild ยกสไตล์ไปให้ลูกแทนที่จะสร้าง <button> ซ้อน (ใช้กับ <Link> เป็นหลัก)
   *
   * ต้อง return แยกทางกันจริง ๆ ไม่ใช่แค่สลับ Comp เพราะ Slot ของ Radix
   * เรียก React.Children.only ซึ่งรับลูกได้ตัวเดียว
   * ถ้าเขียน {loading && <Loader2/>}{children} ไว้ในนั้น ตอน loading เป็น false
   * ลูกจะกลายเป็น [false, children] = สองตัว แล้วพังทั้งหน้าตอน runtime
   * โดยที่ typecheck ผ่านสบาย
   */
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      // ผู้ใช้ screen reader ต้องรู้ว่ากำลังรออยู่ ไม่ใช่ปุ่มค้าง
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

export { buttonVariants };
