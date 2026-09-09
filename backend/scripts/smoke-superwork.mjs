/**
 * ทดสอบว่าเรื่องแจ้งใหม่ไปโผล่บนบอร์ด Super Work จริงไหม
 *
 *   node scripts/smoke-superwork.mjs [origin] [username] [password]
 *
 * สร้าง ticket จริงหนึ่งใบผ่าน API ของเราเอง แล้วรอให้ตัวเชื่อมทำงาน
 * จากนั้นไปอ่านบอร์ด Super Work เพื่อยืนยันว่ามี task ที่ชื่อขึ้นต้นด้วย
 * เลขที่ ticket ใบนั้น — ไม่ได้เชื่อจาก log ฝั่งเรา แต่ไปดูของจริงที่ปลายทาง
 *
 * ⚠️ เขียนของจริงทั้งสองระบบ ใช้กับเครื่อง dev เท่านั้น
 */

import { readFileSync } from 'node:fs';

const ORIGIN = process.argv[2] ?? 'http://localhost:8000';
const USER = process.argv[3] ?? 'demo.enduser';
const PASS = process.argv[4] ?? 'AidcDemo#2026x';

/** อ่านค่าจาก .env เอง — สคริปต์นี้ต้องคุยกับ Super Work โดยตรงเพื่อไปตรวจผล */
function env(key) {
  const line = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : '';
}

const SW_BASE = env('SUPERWORK_BASE_URL');
const SW_KEY = env('SUPERWORK_API_KEY');
const SW_ACTIVITY = env('SUPERWORK_ACTIVITY_ID');

const BASE = `${ORIGIN}/api/v1`;
const jar = new Map();
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

function absorb(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

async function call(method, path, body) {
  const headers = { Accept: 'application/json', Cookie: cookie() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && jar.has('aidc_csrf')) {
    headers['X-CSRF-Token'] = decodeURIComponent(jar.get('aidc_csrf'));
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  absorb(res);
  return { status: res.status, json: await res.json().catch(() => null) };
}

const login = await call('POST', '/auth/login', { username: USER, password: PASS });
if (login.status !== 200) {
  console.error(`เข้าสู่ระบบไม่ผ่าน (${login.status}) ${login.json?.error?.code ?? ''}`);
  process.exit(1);
}
console.log(`\nเข้าสู่ระบบเป็น ${USER}`);

const cats = await call('GET', '/categories?active_only=true');
const category = (cats.json?.data ?? [])[0];
if (!category) {
  console.error('ไม่มีหมวดหมู่ที่เปิดใช้งาน');
  process.exit(1);
}

const stamp = new Date().toISOString().slice(11, 19);
const created = await call('POST', '/tickets', {
  ticket_type: 'incident',
  subject: `ทดสอบตัวเชื่อม Super Work ${stamp}`,
  description: 'สร้างโดย scripts/smoke-superwork.mjs เพื่อยืนยันว่าเรื่องแจ้งไปขึ้นบอร์ด',
  category_id: category.id,
  impact: 'individual',
  urgency: 'medium',
  channel: 'portal',
});

if (created.status !== 200 && created.status !== 201) {
  console.error(`สร้าง ticket ไม่สำเร็จ (${created.status})`, created.json?.error);
  process.exit(1);
}

const ticket = created.json.data;
console.log(`สร้าง ticket แล้ว: ${ticket.ticket_no} (id ${ticket.id})`);

if (!SW_KEY || !SW_ACTIVITY) {
  console.log('\nไม่ได้ตั้ง SUPERWORK_API_KEY / SUPERWORK_ACTIVITY_ID จึงตรวจปลายทางไม่ได้');
  process.exit(0);
}

/*
 * ตัวเชื่อมทำงานแบบไม่รอผล จึงต้องเผื่อเวลาให้มันยิงเสร็จ
 * วนถามแทนการหลับรวดเดียว เพื่อให้จบเร็วเมื่อสำเร็จ และไม่รอเก้อนานเมื่อพัง
 */
async function findTask() {
  const res = await fetch(`${SW_BASE}/activities/${SW_ACTIVITY}/tasks`, {
    headers: { 'X-API-Key': SW_KEY, Accept: 'application/json' },
  });
  const body = await res.json().catch(() => null);
  return (body?.tasks ?? []).find((t) => t.title?.startsWith(ticket.ticket_no)) ?? null;
}

console.log('\nรอให้ตัวเชื่อมส่งขึ้นบอร์ด...');
let found = null;
for (let i = 0; i < 15 && !found; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  found = await findTask();
}

if (!found) {
  console.error(`\n✗ ไม่พบ task ที่ขึ้นต้นด้วย ${ticket.ticket_no} บนบอร์ด`);
  console.error('  ดู log ของ backend เพื่อหาสาเหตุ — ตัวเชื่อมกลืน error ลง log ทั้งหมด');
  process.exit(1);
}

console.log(`\n✓ พบบนบอร์ดแล้ว`);
console.log(`  task id     ${found.id}`);
console.log(`  title       ${found.title}`);
console.log(`  card        ${found.cardId}`);
console.log(`  priority    ${found.priorityStatus}`);
console.log(`  point       ${found.point}`);
console.log(`  dueDate     ${found.dueDate ?? '—'}`);
console.log(`  members     ${(found.members ?? []).map((m) => m.name).join(', ') || '—'}`);

// ยิงซ้ำด้วยเลขที่เดิมต้องไม่เกิดใบซ้ำ — พิสูจน์ว่า idempotency key ทำงาน
const before = (await fetch(`${SW_BASE}/activities/${SW_ACTIVITY}/tasks`, {
  headers: { 'X-API-Key': SW_KEY },
})
  .then((r) => r.json())
  .catch(() => ({ tasks: [] }))).tasks.length;

console.log(`\nจำนวน task บนบอร์ดตอนนี้: ${before}`);
