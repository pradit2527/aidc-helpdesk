import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Lao } from 'next/font/google';
import './globals.css';

/**
 * ฟอนต์เดียวทั้งระบบ ต้องตรงกับที่ backend ใช้สร้าง PDF (ADR-003)
 *
 * ⚠️ Noto Sans Thai แสดงอักษรลาวไม่ได้ — เป็นคนละ Unicode block
 *    (ไทย U+0E00–U+0E7F · ลาว U+0E80–U+0EFF) ถ้าใช้ผิดจะได้กล่องสี่เหลี่ยมทั้งหน้า
 *
 * next/font ดาวน์โหลดและ self-host ให้ตอน build — ไม่มีการเรียก Google CDN ตอน runtime
 * ซึ่งจำเป็นเพราะระบบติดตั้ง on-prem และ CSP เป็น default-src 'self'
 */
const notoSansLao = Noto_Sans_Lao({
  subsets: ['lao', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-lao',
});

export const metadata: Metadata = {
  title: {
    default: 'AIDC Service Desk',
    template: '%s · AIDC Service Desk',
  },
  description: 'ສູນບໍລິການໄອທີຂອງກຸ່ມບໍລິສັດ AIDC',
  robots: { index: false, follow: false }, // ລະບົບພາຍໃນອົງກອນ
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // รองรับจอบากของมือถือ
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="lo" className={notoSansLao.variable}>
      <body>
        {/* ລິ້ງຂ້າມໄປເນື້ອຫາຫຼັກຕ້ອງເປັນ element ທຳອິດຂອງໜ້າ (WCAG 2.4.1) */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
                     focus:rounded focus:bg-surface focus:px-4 focus:py-2 focus:shadow-dialog"
        >
          ຂ້າມໄປຫາເນື້ອຫາຫຼັກ
        </a>
        {children}
      </body>
    </html>
  );
}
