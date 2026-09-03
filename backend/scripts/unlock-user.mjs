/**
 * ปลดล็อกบัญชีที่ถูกล็อกจากการกรอกรหัสผ่านผิดครบจำนวน
 *
 *   npm run db:unlock              ปลดบัญชีใน SEED_ADMIN_USERNAME
 *   npm run db:unlock -- somchai.k ปลดบัญชีที่ระบุ
 *
 * ทำไมต้องมีสคริปต์นี้
 *   นโยบาย 3.2 กำหนดว่าการปลดล็อกต้องยืนยันตัวตนกับ Service Desk
 *   จึงตั้งใจไม่ให้ปลดเองตามเวลา และยังไม่มี endpoint สำหรับผู้ดูแล
 *   ผลคือถ้าบัญชีผู้ดูแลคนเดียวของระบบถูกล็อก จะไม่มีใครปลดให้ได้เลย
 *
 * ⚠️ สคริปต์นี้สำหรับเครื่องพัฒนาและการกู้คืนเท่านั้น
 *    บน production การปลดล็อกต้องผ่าน POST /users/{id}/unlock ที่บันทึก
 *    ลง audit log ว่าใครปลดให้ใครเมื่อไร — การแก้ฐานข้อมูลตรง ๆ ไม่ทิ้งร่องรอย
 */

import 'dotenv/config';
import postgres from 'postgres';

const username = process.argv[2] ?? process.env.SEED_ADMIN_USERNAME;

if (!username) {
  console.error('\nไม่รู้ว่าจะปลดบัญชีไหน — ระบุชื่อผู้ใช้ หรือตั้ง SEED_ADMIN_USERNAME ใน .env\n');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\nไม่ได้ตั้งค่า DATABASE_URL\n');
  process.exit(1);
}

const sql = postgres(url);

try {
  const [before] = await sql`
    select username, is_locked, failed_login_count, is_active
    from app_user
    where username = ${username}
  `;

  if (!before) {
    console.error(`\nไม่พบบัญชี "${username}"\n`);
    process.exit(1);
  }

  if (!before.is_locked && before.failed_login_count === 0) {
    console.log(`\nบัญชี "${username}" ไม่ได้ถูกล็อกอยู่แล้ว ไม่ต้องทำอะไร\n`);
    process.exit(0);
  }

  const [after] = await sql`
    update app_user
       set is_locked = false,
           failed_login_count = 0
     where username = ${username}
    returning username, is_locked, failed_login_count, must_change_password
  `;

  console.log(`\nปลดล็อก "${after.username}" แล้ว`);
  console.log(`  ก่อนหน้า : ล็อก=${before.is_locked} · กรอกผิดสะสม=${before.failed_login_count}`);
  console.log(`  ตอนนี้   : ล็อก=${after.is_locked} · กรอกผิดสะสม=${after.failed_login_count}`);

  if (after.must_change_password) {
    console.log('\n  หมายเหตุ: บัญชีนี้ยังต้องเปลี่ยนรหัสผ่านตอนเข้าใช้ครั้งแรก');
    console.log('           หลังล็อกอินระบบจะพาไปหน้าเปลี่ยนรหัสผ่านเอง');
  }
  console.log('');
} finally {
  await sql.end();
}
