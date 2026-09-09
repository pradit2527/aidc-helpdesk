/**
 * ปรับหมวดหมู่ปัญหาของสภาพแวดล้อมหนึ่งให้ตรงกับที่ตั้งใจไว้ ผ่าน API
 *
 *   node scripts/sync-categories.mjs <origin> <username> <password>
 *   node scripts/sync-categories.mjs https://aidc-helpdesk.vercel.app admin 'xxx'
 *
 * ใช้ API ไม่ใช่ต่อฐานข้อมูลตรง เพราะ production ไม่ได้เปิดพอร์ตฐานข้อมูล
 * ให้เครื่องข้างนอก และการเขียนผ่าน API ได้การตรวจสิทธิ์กับขอบเขตบริษัท
 * เหมือนที่ผู้ใช้จริงได้ — สคริปต์ที่ต่อ DB ตรงจะข้ามด่านพวกนั้นไปหมด
 *
 * ทำงานแบบ idempotent: รันซ้ำได้ไม่เกิดของซ้ำ
 *   มีอยู่แล้ว + ค่าตรง  → ข้าม
 *   มีอยู่แล้ว + ค่าต่าง → PATCH
 *   ยังไม่มี            → POST
 *
 * ⚠️ ไม่ลบหมวดใด ๆ — หมวดที่เลิกใช้ให้ตั้ง isActive:false ใน DESIRED
 *    ticket เก่าอ้างถึง category_id อยู่ การลบทำให้ประวัติชี้ไปที่ความว่างเปล่า
 */

const ORIGIN = process.argv[2] ?? 'http://localhost:8000';
const USER = process.argv[3] ?? 'admin';
const PASS = process.argv[4] ?? process.env.SYNC_PASSWORD;

if (!PASS) {
  console.error('ต้องส่งรหัสผ่านมาทาง argument ที่ 4 หรือ SYNC_PASSWORD');
  process.exit(1);
}

/** สถานะที่ต้องการ — ตรงกับ src/db/seed/data/catalog.ts */
const DESIRED = [
  { code: 'ERP', isActive: false },
  {
    code: 'AI_TOOLS',
    nameTh: 'ຂໍສິດໃຊ້ເຄື່ອງມື AI',
    defaultImpact: 'individual',
    defaultUrgency: 'medium',
    sortOrder: 110,
    isActive: true,
  },
  {
    code: 'SUPER_WORK',
    nameTh: 'Super Work',
    defaultImpact: 'department',
    defaultUrgency: 'medium',
    sortOrder: 120,
    isActive: true,
  },
];

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
  // CSRF double-submit — ทุกคำขอที่เปลี่ยนสถานะต้องมี header ตรงกับคุกกี้
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
console.log(`\n${ORIGIN}\nเข้าสู่ระบบเป็น ${USER}\n`);

const before = (await call('GET', '/categories')).json?.data ?? [];
const byCode = new Map(before.map((c) => [c.code, c]));

let created = 0;
let updated = 0;
let skipped = 0;
let failed = 0;

for (const want of DESIRED) {
  const has = byCode.get(want.code);

  if (!has) {
    if (want.nameTh === undefined) {
      // ตั้งใจให้ปิดหมวดที่ยังไม่มี — ไม่ต้องสร้างขึ้นมาเพื่อปิด
      console.log(`  · ${want.code.padEnd(12)} ไม่มีในระบบนี้ ข้าม`);
      skipped++;
      continue;
    }
    const r = await call('POST', '/categories', {
      code: want.code,
      name_th: want.nameTh,
      company_id: null,
      default_impact: want.defaultImpact,
      default_urgency: want.defaultUrgency,
      sort_order: want.sortOrder,
      is_active: want.isActive,
    });
    if (r.status === 201 || r.status === 200) {
      console.log(`  + ${want.code.padEnd(12)} สร้างแล้ว — ${want.nameTh}`);
      created++;
    } else {
      console.log(`  ✗ ${want.code.padEnd(12)} สร้างไม่สำเร็จ ${r.status} ${r.json?.error?.code ?? ''}`);
      failed++;
    }
    continue;
  }

  // เทียบเฉพาะฟิลด์ที่ระบุไว้ใน DESIRED — ที่ไม่ระบุถือว่าไม่สนใจ
  const patch = {};
  if (want.nameTh !== undefined && has.name_th !== want.nameTh) patch.name_th = want.nameTh;
  if (want.sortOrder !== undefined && has.sort_order !== want.sortOrder) {
    patch.sort_order = want.sortOrder;
  }
  if (want.isActive !== undefined && has.is_active !== want.isActive) {
    patch.is_active = want.isActive;
  }

  if (Object.keys(patch).length === 0) {
    console.log(`  = ${want.code.padEnd(12)} ตรงอยู่แล้ว`);
    skipped++;
    continue;
  }

  const r = await call('PATCH', `/categories/${has.id}`, patch);
  if (r.status === 200) {
    console.log(`  ~ ${want.code.padEnd(12)} แก้แล้ว — ${Object.keys(patch).join(', ')}`);
    updated++;
  } else {
    console.log(`  ✗ ${want.code.padEnd(12)} แก้ไม่สำเร็จ ${r.status} ${r.json?.error?.code ?? ''}`);
    failed++;
  }
}

const active = (await call('GET', '/categories?active_only=true')).json?.data ?? [];
console.log(`\nสร้าง ${created} · แก้ ${updated} · ข้าม ${skipped}${failed ? ` · ล้มเหลว ${failed}` : ''}`);
console.log(`\nหมวดที่ฟอร์มแจ้งเรื่องจะเห็น (${active.length}):`);
active.forEach((c, i) => console.log(`  ${String(i + 1).padStart(2)}. ${c.name_th}`));

process.exitCode = failed === 0 ? 0 : 1;
