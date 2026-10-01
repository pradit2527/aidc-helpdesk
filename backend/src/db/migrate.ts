/**
 * รัน migration ทั้งหมดที่ยังไม่ถูกใช้ตามลำดับใน meta/_journal.json
 *
 *   npm run db:migrate
 *
 * ใช้ MIGRATE_URL ไม่ใช่ DATABASE_URL เพราะ 0001 เรียก CREATE EXTENSION
 * ซึ่งบัญชีของแอปไม่มีสิทธิ์ตามที่ตั้งใจไว้ใน scripts/bootstrap-db.sql
 */

import 'dotenv/config';

import { runMigrations } from './run-migrations';

async function main(): Promise<void> {
  const url = process.env.MIGRATE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('ต้องตั้ง MIGRATE_URL หรือ DATABASE_URL ก่อน');
  }

  console.log(`กำลัง migrate ไปยัง ${new URL(url).host} ...`);
  // eslint-disable-next-line no-console
  await runMigrations((message) => console.log(message));
}

main().catch((err: unknown) => {
  console.error('migrate ล้มเหลว:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
