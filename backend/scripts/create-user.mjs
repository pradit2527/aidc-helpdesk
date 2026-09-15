/**
 * สร้างบัญชีผู้ใช้หนึ่งบัญชี (หรือตั้งรหัสผ่านใหม่ถ้ามีชื่อนี้อยู่แล้ว)
 *
 *   node scripts/create-user.mjs demo.cosi
 *   node scripts/create-user.mjs demo.cosi --role agent --company AIDC-HQ --name "ຊື່ ນາມສະກຸນ"
 *
 * รหัสผ่านถูกถามตอนรัน และไม่แสดงบนจอขณะพิมพ์
 * ถ้ารันแบบไม่มีหน้าจอให้พิมพ์ ใส่ผ่านตัวแปร NEW_USER_PASSWORD แทน
 *
 * ⚠️ ไม่รับรหัสผ่านเป็นอาร์กิวเมนต์โดยตั้งใจ — อาร์กิวเมนต์ค้างอยู่ในประวัติคำสั่งของ shell
 *    และคนอื่นบนเครื่องเดียวกันเห็นได้จากรายการโปรเซส
 *
 * ⚠️ สำหรับเครื่องพัฒนาและเครื่องทดสอบเท่านั้น — บน production ให้สร้างผู้ใช้
 *    ผ่านหน้าจัดการผู้ใช้ ซึ่งบันทึกลง audit log ว่าใครสร้างให้ใคร
 */

import 'dotenv/config';
import readline from 'node:readline';

import argon2 from 'argon2';
import postgres from 'postgres';

const ROLES = ['end_user', 'agent', 'company_admin', 'manager_viewer', 'super_admin'];

if (process.env.NODE_ENV === 'production') {
  console.error('ปฏิเสธ: ห้ามสร้างบัญชีด้วยสคริปต์บน production — ใช้หน้าจัดการผู้ใช้');
  process.exit(1);
}

function parseArgs(argv) {
  const [username, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.replace(/^--/, '');
    const value = rest[i + 1];
    if (!key || value === undefined) break;
    options[key] = value;
  }
  return { username, ...options };
}

/** ถามรหัสผ่านโดยไม่แสดงตัวอักษรที่พิมพ์ */
function promptHidden(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve(null);
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = function writeMasked(text) {
      // แสดงเฉพาะคำถาม ตัวอักษรที่พิมพ์ถูกซ่อน
      if (text.includes(question)) rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.output.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

/** นโยบายรหัสผ่านข้อ 3.2 — ยาวอย่างน้อย 12 และมีครบ 4 ประเภทอักขระ */
function passwordProblem(password) {
  if (password.length < 12) return 'ต้องยาวอย่างน้อย 12 ตัวอักษร';
  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 4) return 'ต้องมีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และสัญลักษณ์ครบทั้ง 4 แบบ';
  return null;
}

const args = parseArgs(process.argv.slice(2));
const role = args.role ?? 'end_user';

if (!args.username || !/^[a-z0-9._-]{3,50}$/i.test(args.username)) {
  console.error('\nระบุชื่อผู้ใช้ 3–50 ตัว (a-z 0-9 . _ -) เช่น  node scripts/create-user.mjs demo.cosi\n');
  process.exit(1);
}
if (!ROLES.includes(role)) {
  console.error(`\nบทบาทต้องเป็นหนึ่งใน: ${ROLES.join(', ')}\n`);
  process.exit(1);
}

const url = process.env.MIGRATE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('\nไม่ได้ตั้ง DATABASE_URL ใน .env\n');
  process.exit(1);
}

const password = process.env.NEW_USER_PASSWORD ?? (await promptHidden(`รหัสผ่านของ ${args.username}: `));
if (!password) {
  console.error('\nไม่ได้รับรหัสผ่าน — รันในเทอร์มินัลที่พิมพ์ได้ หรือตั้ง NEW_USER_PASSWORD\n');
  process.exit(1);
}
const problem = passwordProblem(password);
if (problem) {
  console.error(`\nรหัสผ่านไม่ผ่านนโยบาย: ${problem}\n`);
  process.exit(1);
}

const host = new URL(url).hostname;
const sql = postgres(url, {
  ssl: host === 'localhost' || host === '127.0.0.1' ? false : 'require',
  ...(host.includes('-pooler') ? { prepare: false } : {}),
  max: 1,
});

try {
  const companies = await sql`SELECT id, code FROM company WHERE is_active = true ORDER BY id`;
  if (companies.length === 0) throw new Error('ยังไม่มีบริษัทในฐานข้อมูล — รัน npm run db:seed ก่อน');

  const home = args.company ? companies.find((c) => c.code === args.company) : companies[0];
  if (!home) {
    throw new Error(`ไม่พบบริษัท ${args.company} — มี: ${companies.map((c) => c.code).join(', ')}`);
  }

  const [roleRow] = await sql`SELECT id FROM role WHERE code = ${role}`;
  if (!roleRow) throw new Error(`ไม่พบบทบาท ${role} ในฐานข้อมูล`);

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const fullName = args.name ?? args.username;

  const [user] = await sql`
    INSERT INTO app_user (company_id, username, email, full_name, job_title,
                          password_hash, auth_provider, must_change_password,
                          is_admin_account, is_active, password_changed_at)
    VALUES (${home.id}, ${args.username}, ${args.email ?? null}, ${fullName}, ${args['job-title'] ?? null},
            ${passwordHash}, 'local', false, ${role === 'super_admin'}, true, now())
    ON CONFLICT (username) DO UPDATE SET
      password_hash = excluded.password_hash,
      must_change_password = false,
      is_active = true,
      is_locked = false,
      failed_login_count = 0,
      password_changed_at = now(),
      -- เปลี่ยนรหัสผ่าน = เตะทุกอุปกรณ์ที่ค้าง session ของบัญชีนี้ออก
      token_version = app_user.token_version + 1
    RETURNING id, (xmax = 0) AS inserted
  `;

  await sql`
    INSERT INTO user_role (user_id, role_id)
    VALUES (${user.id}, ${roleRow.id})
    ON CONFLICT (user_id, role_id) DO NOTHING
  `;

  // super_admin ข้ามขอบเขตอยู่แล้ว · manager_viewer ดูรายงานข้ามบริษัท · บทบาทอื่นผูกบริษัทต้นสังกัด
  if (role !== 'super_admin') {
    const [userRole] = await sql`SELECT id FROM user_role WHERE user_id = ${user.id} AND role_id = ${roleRow.id}`;
    const targets = role === 'manager_viewer' ? companies : [home];
    for (const c of targets) {
      await sql`INSERT INTO user_role_scope (user_role_id, company_id) VALUES (${userRole.id}, ${c.id}) ON CONFLICT DO NOTHING`;
    }
  }

  console.log(`\n${user.inserted ? 'สร้างบัญชีแล้ว' : 'บัญชีนี้มีอยู่แล้ว — ตั้งรหัสผ่านใหม่แล้ว'}`);
  console.log(`  ชื่อผู้ใช้ : ${args.username}`);
  console.log(`  บทบาท    : ${role}`);
  console.log(`  บริษัท    : ${home.code}`);
  console.log('  รหัสผ่าน  : (ตามที่พิมพ์ — ไม่แสดงบนจอ)\n');
} catch (err) {
  console.error('\nล้มเหลว:', err.message, '\n');
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
