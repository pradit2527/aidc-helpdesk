import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * รัน migration ที่ยังไม่ถูกใช้ตามลำดับใน meta/_journal.json
 *
 * แยกออกมาจาก migrate.ts เพื่อให้เรียกได้สองทางโดยไม่ชนกัน
 *   - จากบรรทัดคำสั่ง: npm run db:migrate (migrate.ts)
 *   - ตอนแอปบูต: main.ts เมื่อ MIGRATE_ON_BOOT=true
 *
 * ถ้า import migrate.ts มาใช้ซ้ำตรง ๆ จะได้ main() ของมันทำงานทันทีที่ import
 * แล้วปิด process ทิ้งหลังทำเสร็จ ซึ่งแอปไม่ต้องการ
 */
export async function runMigrations(log: (message: string) => void): Promise<void> {
  /*
   * ใช้ MIGRATE_URL ก่อนถ้ามี — 0001 เรียก CREATE EXTENSION ซึ่งบัญชีของแอป
   * ไม่มีสิทธิ์ตามที่ตั้งใจไว้ใน scripts/bootstrap-db.sql
   */
  const url = process.env.MIGRATE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('ต้องตั้ง MIGRATE_URL หรือ DATABASE_URL ก่อน');

  /*
   * max: 1 เพราะ migrator ต้องรันทุกคำสั่งบน connection เดียวกัน
   * ไม่เช่นนั้น advisory lock ที่กันการรันซ้อนจะอยู่คนละ session
   * — ล็อกนี้คือสิ่งที่ทำให้หลายอินสแตนซ์บูตพร้อมกันได้อย่างปลอดภัย
   */
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const started = Date.now();

  try {
    await migrate(drizzle(client), { migrationsFolder: './src/db/migrations' });
    log(`migrate สำเร็จใน ${Date.now() - started} ms`);
  } finally {
    await client.end();
  }
}
