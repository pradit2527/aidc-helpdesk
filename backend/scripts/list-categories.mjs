/**
 * แสดงหมวดหมู่ปัญหาพร้อมจำนวน ticket ที่ผูกอยู่
 *
 *   node scripts/list-categories.mjs
 *
 * ใช้ตรวจก่อนจะปิดหรือลบหมวดหมู่ — หมวดที่มี ticket ผูกอยู่ลบไม่ได้
 * เพราะ ticket เก่าจะชี้ไปที่ความว่างเปล่า ต้องปิดการใช้งานแทน
 */

import postgres from 'postgres';

const DATABASE_URL = process.env.MIGRATE_URL ?? process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ไม่ได้ตั้ง DATABASE_URL');
  process.exit(1);
}

const url = new URL(DATABASE_URL);
const sql = postgres(DATABASE_URL, {
  ssl: url.hostname === 'localhost' ? false : 'require',
  ...(url.hostname.includes('-pooler') ? { prepare: false } : {}),
  max: 1,
});

try {
  const rows = await sql`
    SELECT c.id, c.code, c.name_th, c.sort_order, c.is_active,
           (SELECT count(*)::int FROM ticket t WHERE t.category_id = c.id) AS tickets
    FROM ticket_category c
    ORDER BY c.sort_order, c.id
  `;
  console.table(
    rows.map((r) => ({
      id: r.id,
      code: r.code,
      ชื่อ: r.name_th,
      ลำดับ: r.sort_order,
      ใช้งาน: r.is_active,
      ticket: Number(r.tickets),
    })),
  );
} catch (err) {
  console.error('ล้มเหลว:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
