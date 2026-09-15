/**
 * เพิ่มบริการที่ยังไม่มีลงทะเบียนบริการของฐานข้อมูลที่ใช้งานอยู่แล้ว
 *
 *   npx tsx src/db/seed/services-cli.ts
 *
 * แตะเฉพาะแถวบริการที่ยังไม่มี code ใน SERVICES — ไม่รัน seed ทั้งชุด
 * และไม่เขียนทับบริการเดิมที่ผู้ดูแลตั้งระดับหรือเจ้าของไว้แล้ว
 */

import 'dotenv/config';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';
import { seedServices } from './services';

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('ต้องตั้ง DATABASE_URL ก่อน');

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  try {
    const added = await db.transaction((tx) => seedServices(tx as unknown as Db));
    console.log(`เพิ่มบริการใหม่ ${added.length} รายการ${added.length > 0 ? `: ${added.join(', ')}` : ''}`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('เพิ่มบริการล้มเหลว:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
