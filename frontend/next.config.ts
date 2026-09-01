import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // standalone = image เล็ก รันด้วย `node server.js` ไม่ต้องมี node_modules ใน image สุดท้าย
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,

  // แถบสถานะของ Next ในโหมด dev ทับ bottom nav ช่องซ้ายสุดบนจอมือถือพอดี
  // ซึ่งทำให้ตรวจเมนูมือถือไม่ได้ จึงปิดไว้ (มีผลเฉพาะตอน dev)
  devIndicators: false,

  // ไม่มี DATABASE_URL / ORM ในโปรเจกต์นี้โดยเจตนา (ADR-002 §2.1)
  // ข้อมูลทั้งหมดมาจาก backend ผ่าน /api/v1 เท่านั้น
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1',
  },

  /**
   * ส่งต่อ /api/v1/* ไปยัง backend
   *
   * ทำแบบนี้แทนที่จะให้เบราว์เซอร์ยิงไป http://localhost:8000 ตรง ๆ
   * เพราะ auth ใช้คุกกี้ การยิงข้ามพอร์ตทำให้คุกกี้กลายเป็น third-party
   * ต้องตั้ง SameSite=None; Secure และเปิด CORS แบบมี credentials
   * ซึ่งเป็นค่าที่หลวมกว่าที่ควรเป็น และต่างจากตอน production
   * ผ่าน proxy แล้วทุกอย่างเป็น same-origin เหมือน production ทุกประการ
   */
  async rewrites() {
    const backend = process.env.BACKEND_ORIGIN ?? 'http://localhost:8000';
    return [{ source: '/api/v1/:path*', destination: `${backend}/api/v1/:path*` }];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Content-Security-Policy ไม่ได้ตั้งที่นี่ — ต้องเป็น nonce ต่อคำขอ
          // จึงตั้งใน src/middleware.ts แทน (headers() ตรงนี้เป็นค่าคงที่ ใส่ nonce ไม่ได้)
        ],
      },
    ];
  },
};

export default nextConfig;
