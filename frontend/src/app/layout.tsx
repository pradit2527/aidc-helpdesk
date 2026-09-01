import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Archivo, Noto_Sans_Lao, Noto_Sans_Thai } from 'next/font/google';

import { THEME_INIT_SCRIPT } from '@/lib/preferences';
import { Providers } from './providers';
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

/**
 * ฟอนต์หัวเรื่องและตัวเลข ตามต้นแบบ (prototype ใช้ Archivo)
 *
 * ใช้เฉพาะข้อความละตินและตัวเลข — Archivo ไม่มีอักษรลาว
 * ข้อความลาวจึงตกไปที่ Noto Sans Lao ตามลำดับ fallback เสมอ
 */
/**
 * ฟอนต์ไทยสำหรับผู้ใช้ที่สลับภาษาเป็นไทย
 *
 * ต้องโหลดคู่กับฟอนต์ลาวเสมอ ไม่ใช่โหลดตามภาษาที่เลือก เพราะสองภาษานี้
 * อยู่คนละ Unicode block ฟอนต์เดียวแสดงครบทั้งคู่ไม่ได้ และหน้าเดียวกัน
 * มีทั้งสองภาษาปนกันได้จริง เช่นชื่อคนลาวในหน้าที่ตั้งภาษาไทยไว้
 */
const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-thai',
});

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-archivo',
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /**
   * ต้องแนบ nonce ให้สคริปต์ตั้งธีม
   *
   * CSP ที่ middleware ตั้งไว้เป็นแบบ nonce + strict-dynamic ซึ่งบล็อก
   * inline script ทุกตัวที่ไม่มี nonce — รวมถึงตัวนี้ ผลคือสคริปต์ไม่ทำงาน
   * ธีมจึงถูกทาโดย React หลัง hydration แทน และผู้ใช้โหมดมืดเห็นหน้าขาววาบ
   * ทุกครั้งที่โหลด ซึ่งเป็นสิ่งเดียวที่สคริปต์ตัวนี้มีไว้ป้องกัน
   */
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html
      lang="lo"
      // ค่า data-theme ถูกเขียนทับโดยสคริปต์ด้านล่างก่อนเบราว์เซอร์วาดเฟรมแรก
      data-theme="light"
      className={`${notoSansLao.variable} ${notoSansThai.variable} ${archivo.variable}`}
    >
      <head>
        {/* ต้องรันก่อนเนื้อหาถูกวาด มิฉะนั้นผู้ใช้โหมดมืดจะเห็นหน้าขาววาบหนึ่งครั้ง */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {/* ລິ້ງຂ້າມໄປເນື້ອຫາຫຼັກຕ້ອງເປັນ element ທຳອິດຂອງໜ້າ (WCAG 2.4.1) */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
                     focus:rounded focus:bg-surface focus:px-4 focus:py-2 focus:shadow-dialog"
        >
          ຂ້າມໄປຫາເນື້ອຫາຫຼັກ
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
