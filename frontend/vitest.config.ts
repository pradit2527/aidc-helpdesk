import path from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * ตั้งค่าเทสต์ของหน้าเว็บ
 *
 * ต้องมีไฟล์นี้เพราะ tsconfig ของ Next ตั้ง "jsx": "preserve" (ให้ Next คอมไพล์ JSX เอง)
 * ซึ่ง esbuild ของ vitest อ่านแล้วจะปล่อย JSX ไว้ไม่แปลง → เทสต์ที่ import คอมโพเนนต์พังด้วย
 * "Unexpected token <" จึงสั่งให้ esbuild แปลง JSX ในเทสต์เป็นแบบ automatic แทน
 * (มีผลเฉพาะตอนรันเทสต์ ไม่แตะการ build ของ Next)
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    // ให้ import '@/lib/…' ในคอมโพเนนต์ทำงานในเทสต์เหมือนใน Next
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
