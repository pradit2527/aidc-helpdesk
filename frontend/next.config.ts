import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // standalone = image เล็ก รันด้วย `node server.js` ไม่ต้องมี node_modules ใน image สุดท้าย
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,

  // ไม่มี DATABASE_URL / ORM ในโปรเจกต์นี้โดยเจตนา (ADR-002 §2.1)
  // ข้อมูลทั้งหมดมาจาก backend ผ่าน /api/v1 เท่านั้น
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1',
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // on-prem: ห้ามโหลดสคริปต์/ฟอนต์จากภายนอกทั้งหมด
          // เป็นมาตรการชดเชยที่ทำให้ token ใน httpOnly cookie ปลอดภัยจริง
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "style-src 'self' 'unsafe-inline'", // Next.js inject critical CSS
              "script-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
