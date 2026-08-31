import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** รวม class โดยให้ class ที่ส่งมาทีหลังชนะเมื่อขัดกัน (เช่น px-2 กับ px-4) */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
