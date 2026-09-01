import type { Config } from 'drizzle-kit';

/**
 * drizzle-kit generate อ่าน schema แล้วสร้างไฟล์ SQL ลง src/db/migrations
 *
 * ต่างจาก Prisma Migrate ตรงที่ไฟล์ที่ได้เป็น SQL ธรรมดาที่แก้มือได้
 * จึงเขียน down migration เองได้ ซึ่ง NFR-24 บังคับว่าทุก migration ต้องมี
 */
export default {
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/aidc_helpdesk',
  },
  // ชื่อ constraint ต้องคงที่ระหว่างรอบ generate มิฉะนั้น diff จะมั่ว
  breakpoints: true,
  strict: true,
  verbose: true,
} satisfies Config;
