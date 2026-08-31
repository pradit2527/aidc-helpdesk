import { NextResponse, type NextRequest } from 'next/server';

/**
 * ด่านแรกของทุกคำขอ
 *
 * ตอนนี้ทำเรื่องเดียว: สร้าง CSP แบบ nonce ต่อคำขอ
 *
 * ทำไมต้องเป็น nonce ไม่ใช่ header คงที่ใน next.config.ts:
 * Next.js App Router ส่ง RSC payload มาเป็น inline script (self.__next_f.push)
 * ถ้าใช้ script-src 'self' เฉย ๆ หน้าจะพังทั้งบน dev และ production
 * และการเปิด 'unsafe-inline' ก็ทำให้ CSP แทบไม่มีความหมาย —
 * ซึ่งสำคัญมากเพราะ CSP คือมาตรการที่ทำให้ token ใน httpOnly cookie ปลอดภัยจริง
 *
 * 'strict-dynamic' ทำให้สคริปต์ที่ถูก nonce อนุญาตแล้วโหลดสคริปต์ลูกต่อได้
 * โดยไม่ต้องไล่ใส่ nonce ทุกไฟล์
 *
 * ยังไม่ได้ทำ (จะเพิ่มเมื่อ backend มี /auth):
 *   - ตรวจ session cookie แล้วส่งไป /login
 *   - refresh token ฝั่ง server
 *   - บังคับเปลี่ยนรหัสผ่านครั้งแรก
 * ดู docs/20-frontend-architecture.md §4.2
 */
export function middleware(req: NextRequest) {
  const isDev = process.env.NODE_ENV !== 'production';
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const csp = [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // Next.js inject critical CSS เป็น style tag — ยังต้องเปิด unsafe-inline ให้ style
    "style-src 'self' 'unsafe-inline'",
    // dev ต้องใช้ eval สำหรับ hot reload · production ไม่ต้อง
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // dev ต้องเปิด websocket ให้ hot reload คุยกลับได้
    isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  // ส่ง nonce ต่อให้ Next.js ผ่าน request header — Next อ่านค่านี้แล้วใส่ให้ script ที่มันสร้างเอง
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  matcher: [
    // ข้าม static asset เพราะไม่ต้องมี CSP และการรัน middleware ทุกไฟล์เปลืองเปล่า
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
