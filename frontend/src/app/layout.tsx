import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import './globals.css';

/**
 * ฟอนต์เดียวทั้งระบบ ตรงกับที่ backend ใช้สร้าง PDF (ADR-003)
 * next/font ดาวน์โหลดและ self-host ให้ตอน build — ไม่มีการเรียก Google CDN ตอน runtime
 * ซึ่งจำเป็นเพราะระบบติดตั้ง on-prem และ CSP เป็น default-src 'self'
 */
const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-thai',
});

export const metadata: Metadata = {
  title: {
    default: 'AIDC Service Desk',
    template: '%s · AIDC Service Desk',
  },
  description: 'ศูนย์บริการไอทีของกลุ่มบริษัท AIDC',
  robots: { index: false, follow: false }, // ระบบภายในองค์กร
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // รองรับจอบากของมือถือ
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={notoSansThai.variable}>
      <body>
        {/* ลิงก์ข้ามไปเนื้อหาหลักต้องเป็น element แรกของหน้า (WCAG 2.4.1) */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
                     focus:rounded focus:bg-surface focus:px-4 focus:py-2 focus:shadow-dialog"
        >
          ข้ามไปยังเนื้อหาหลัก
        </a>
        {children}
      </body>
    </html>
  );
}
