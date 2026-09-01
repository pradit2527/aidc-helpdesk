/**
 * รัน migration ทั้งหมดที่ยังไม่ถูกใช้ตามลำดับใน meta/_journal.json
 *
 *   npm run db:migrate
 *
 * ใช้ MIGRATE_URL ไม่ใช่ DATABASE_URL เพราะ 0001 เรียก CREATE EXTENSION
 * ซึ่งบัญชีของแอปไม่มีสิทธิ์ตามที่ตั้งใจไว้ใน scripts/bootstrap-db.sql
 */

import 'dotenv/config';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main(): Promise<void> {
  const url = process.env.MIGRATE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('ต้องตั้ง MIGRATE_URL หรือ DATABASE_URL ก่อน');
  }

  // max: 1 เพราะ migrator ต้องรันทุกคำสั่งบน connection เดียวกัน
  // ไม่เช่นนั้น advisory lock ที่กันการรันซ้อนจะอยู่คนละ session
  const client = postgres(url, { max: 1, onnotice: () => {} });

  const host = new URL(url).host;
  console.log(`กำลัง migrate ไปยัง ${host} ...`);

  const started = Date.now();
  try {
    await migrate(drizzle(client), { migrationsFolder: './src/db/migrations' });
    console.log(`migrate สำเร็จใน ${Date.now() - started} ms`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('migrate ล้มเหลว:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
