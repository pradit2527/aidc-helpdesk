/**
 * สร้างบัญชีทดสอบ 1 บัญชีต่อ 1 บทบาท
 *
 *   node scripts/make-demo-users.mjs                  ใช้รหัสผ่านที่สุ่มให้
 *   DEMO_PASSWORD='...' node scripts/make-demo-users.mjs   กำหนดเอง
 *
 * ⚠️ สคริปต์นี้มีไว้สำหรับเครื่องพัฒนาและเครื่องทดสอบเท่านั้น
 *    บัญชีเหล่านี้ใช้รหัสผ่านร่วมกันและชื่อผู้ใช้ที่เดาได้ — ถ้าหลุดขึ้น
 *    production ที่มีข้อมูลพนักงานจริง เท่ากับเปิดประตูทิ้งไว้ 5 บาน
 *    จึงปฏิเสธที่จะรันเมื่อ NODE_ENV=production
 *
 * ต่างจาก seed ตรงที่ตั้ง must_change_password = false โดยตั้งใจ
 * เพราะจุดประสงค์คือให้ล็อกอินเข้าไปทดสอบหน้าจอของแต่ละบทบาทได้ทันที
 * ไม่ใช่ให้ติดหน้าเปลี่ยนรหัสผ่านทั้ง 5 บัญชี
 */

import crypto from 'node:crypto';

import argon2 from 'argon2';
import postgres from 'postgres';

if (process.env.NODE_ENV === 'production') {
  console.error('ปฏิเสธ: ห้ามสร้างบัญชีทดสอบบน production');
  process.exit(1);
}

const DATABASE_URL = process.env.MIGRATE_URL ?? process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ไม่ได้ตั้ง DATABASE_URL');
  process.exit(1);
}

/**
 * บทบาททั้ง 5 พร้อมขอบเขตบริษัทที่เหมาะกับบทบาทนั้น
 *
 * company คือรหัสบริษัทที่ผู้ใช้สังกัด (app_user.company_id เป็น NOT NULL)
 * scopeAll = true หมายถึงให้เห็นทุกบริษัทในกลุ่ม ซึ่งสมเหตุสมผลเฉพาะ
 * manager_viewer ที่ต้องดูรายงานข้ามบริษัท — บทบาทอื่นผูกกับบริษัทเดียว
 */
const DEMO_USERS = [
  {
    username: 'demo.enduser',
    role: 'end_user',
    fullName: 'ດີໂມ ຜູ້ໃຊ້ທົ່ວໄປ',
    jobTitle: 'ພະນັກງານ',
    scopeAll: false,
  },
  {
    username: 'demo.agent',
    role: 'agent',
    fullName: 'ດີໂມ ເຈົ້າໜ້າທີ່ IT',
    jobTitle: 'IT Support',
    scopeAll: false,
  },
  {
    username: 'demo.companyadmin',
    role: 'company_admin',
    fullName: 'ດີໂມ ຜູ້ດູແລບໍລິສັດ',
    jobTitle: 'IT Manager',
    scopeAll: false,
  },
  {
    username: 'demo.manager',
    role: 'manager_viewer',
    fullName: 'ດີໂມ ຜູ້ບໍລິຫານ',
    jobTitle: 'Management',
    scopeAll: true,
  },
  {
    username: 'demo.superadmin',
    role: 'super_admin',
    fullName: 'ດີໂມ ຜູ້ດູແລລະບົບ',
    jobTitle: 'System Administrator',
    scopeAll: false, // super_admin ข้ามการตรวจขอบเขตอยู่แล้ว ไม่ต้องผูก scope
  },
];

/**
 * รหัสผ่านต้องผ่านนโยบาย 3.2 — ยาว ≥ 12 และมีครบ 4 ประเภทอักขระ
 * สุ่มจาก crypto ไม่ใช่ Math.random ซึ่งเดาลำดับถัดไปได้จากค่าที่เห็นแล้ว
 */
function generatePassword() {
  const sets = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ', // ตัด I O ออก อ่านสับสนกับ 1 0
    'abcdefghijkmnopqrstuvwxyz', // ตัด l ออก
    '23456789', // ตัด 0 1 ออก
    '!@#$%^&*',
  ];
  const pick = (s) => s[crypto.randomInt(s.length)];
  const chars = sets.map(pick);
  const all = sets.join('');
  while (chars.length < 16) chars.push(pick(all));
  // สลับตำแหน่ง มิฉะนั้น 4 ตัวแรกจะเป็นตัวใหญ่ เล็ก เลข สัญลักษณ์ เสมอ
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const password = process.env.DEMO_PASSWORD ?? generatePassword();
if (password.length < 12) {
  console.error('DEMO_PASSWORD ต้องยาวอย่างน้อย 12 อักขระ (นโยบาย 3.2)');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  ssl: new URL(DATABASE_URL).hostname === 'localhost' ? false : 'require',
  ...(new URL(DATABASE_URL).hostname.includes('-pooler') ? { prepare: false } : {}),
  max: 1,
});

try {
  const companies = await sql`SELECT id, code FROM company ORDER BY id`;
  if (companies.length === 0) throw new Error('ยังไม่มีบริษัทในฐานข้อมูล — รัน npm run db:seed ก่อน');

  const roles = await sql`SELECT id, code FROM role`;
  const roleByCode = new Map(roles.map((r) => [r.code, r.id]));

  const homeCompany = companies[0];
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const created = [];

  for (const u of DEMO_USERS) {
    const roleId = roleByCode.get(u.role);
    if (!roleId) {
      console.warn(`  ข้าม ${u.username} — ไม่พบบทบาท ${u.role}`);
      continue;
    }

    /*
     * เขียนทับ password_hash ของบัญชีทดสอบโดยตั้งใจ ต่างจาก seed
     * เพราะจุดประสงค์ของสคริปต์นี้คือ "ให้ได้รหัสที่ใช้เข้าได้แน่ ๆ"
     * ถ้าไม่เขียนทับ การรันซ้ำจะพิมพ์รหัสใหม่ที่ใช้เข้าไม่ได้ ซึ่งแย่กว่า
     */
    const [user] = await sql`
      INSERT INTO app_user (company_id, username, email, full_name, job_title,
                            password_hash, auth_provider, must_change_password,
                            is_admin_account, is_active, password_changed_at)
      VALUES (${homeCompany.id}, ${u.username}, ${`${u.username}@aidctech.com.la`},
              ${u.fullName}, ${u.jobTitle}, ${passwordHash}, 'local', false,
              ${u.role === 'super_admin'}, true, now())
      ON CONFLICT (username) DO UPDATE SET
        password_hash = excluded.password_hash,
        must_change_password = false,
        is_active = true,
        is_locked = false,
        failed_login_count = 0,
        password_changed_at = now()
      RETURNING id
    `;

    await sql`
      INSERT INTO user_role (user_id, role_id)
      VALUES (${user.id}, ${roleId})
      ON CONFLICT (user_id, role_id) DO NOTHING
    `;

    // ผูกขอบเขตบริษัท — ต้องหา user_role.id ก่อน เพราะ scope ผูกกับการมอบบทบาท
    // ไม่ใช่ผูกกับตัวผู้ใช้ คนหนึ่งจึงเป็น agent ของบริษัท ก. และ
    // manager_viewer ของทั้งกลุ่มพร้อมกันได้
    const [ur] = await sql`
      SELECT id FROM user_role WHERE user_id = ${user.id} AND role_id = ${roleId}
    `;
    const targets = u.scopeAll ? companies : [homeCompany];
    for (const c of targets) {
      await sql`
        INSERT INTO user_role_scope (user_role_id, company_id)
        VALUES (${ur.id}, ${c.id})
        ON CONFLICT DO NOTHING
      `;
    }

    created.push({ ...u, id: user.id, companies: targets.map((c) => c.code) });
  }

  console.log('\nสร้างบัญชีทดสอบเรียบร้อย — รหัสผ่านเดียวกันทุกบัญชี\n');
  console.log(`  รหัสผ่าน: ${password}\n`);
  console.log('  ชื่อผู้ใช้             บทบาท           ขอบเขตบริษัท');
  console.log('  ' + '─'.repeat(62));
  for (const c of created) {
    console.log(
      `  ${c.username.padEnd(20)} ${c.role.padEnd(16)} ${c.companies.join(', ')}`,
    );
  }
  console.log('\n  ทั้งหมดตั้ง must_change_password = false — เข้าใช้ได้ทันที');
  console.log('  ⚠️ ห้ามใช้บัญชีชุดนี้บนระบบที่มีข้อมูลพนักงานจริง\n');
} catch (err) {
  console.error('ล้มเหลว:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
