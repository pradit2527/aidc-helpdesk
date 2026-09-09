/**
 * ทดสอบ endpoint เขียนข้อมูลหลักที่เพิ่งเพิ่ม ด้วยการเรียกจริงผ่าน API
 *
 *   node scripts/smoke-master-writes.mjs [origin] [username] [password]
 *
 * เขียนของจริงลงฐานข้อมูลที่ชี้อยู่ จึงตั้งใจให้รันกับเครื่อง dev เท่านั้น
 * ทุกอย่างที่สร้างขึ้นตั้งชื่อขึ้นต้นด้วย SMOKE_ และปิด is_active ทิ้งท้าย
 * เพราะระบบไม่มี endpoint ลบโดยตั้งใจ — ปิดคือสิ่งที่ทำได้จริงเท่านั้น
 */

const ORIGIN = process.argv[2] ?? 'http://localhost:8000';
const USER = process.argv[3] ?? 'demo.superadmin';
const PASS = process.argv[4] ?? 'AidcDemo#2026x';

const BASE = `${ORIGIN}/api/v1`;
const jar = new Map();
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const stamp = Date.now().toString().slice(-6);

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

let pass = 0;
let fail = 0;

function check(label, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label} — ${detail}`);
  }
}

const login = await call('POST', '/auth/login', { username: USER, password: PASS });
if (login.status !== 200) {
  console.error(`เข้าสู่ระบบไม่ผ่าน (${login.status}) ${login.json?.error?.code ?? ''}`);
  process.exit(1);
}
console.log(`\n${ORIGIN} — เข้าสู่ระบบเป็น ${USER}\n`);

/** สร้างแล้วแก้แล้วปิด — วงจรเต็มของทุกตาราง */
async function cycle(label, path, createBody, patchBody, nameOf) {
  const created = await call('POST', path, createBody);
  if (created.status !== 200 && created.status !== 201) {
    check(`${label} สร้าง`, false, `${created.status} ${JSON.stringify(created.json?.error ?? {})}`);
    return null;
  }
  const row = created.json?.data;
  check(`${label} สร้าง → ${nameOf(row)}`, true);

  const patched = await call('PATCH', `${path}/${row.id}`, patchBody);
  check(
    `${label} แก้ไข`,
    patched.status === 200,
    `${patched.status} ${JSON.stringify(patched.json?.error ?? {})}`,
  );

  const off = await call('PATCH', `${path}/${row.id}`, { is_active: false });
  if (off.status === 200) check(`${label} ปิดการใช้งาน`, true);
  return row;
}

console.log('แผนก');
await cycle(
  'department',
  '/departments',
  { company_id: 1, name: `SMOKE_ພະແນກ_${stamp}` },
  { name: `SMOKE_ພະແນກ_${stamp}_ແກ້ໄຂ` },
  (r) => r.name,
);

console.log('\nຫมวดหมู่');
await cycle(
  'category',
  '/categories',
  { code: `SMOKE_CAT_${stamp}`, name_th: `SMOKE ໝວດ ${stamp}`, company_id: null, sort_order: 999 },
  { name_th: `SMOKE ໝວດ ${stamp} ແກ້ໄຂ`, default_urgency: 'high' },
  (r) => r.name_th,
);

console.log('\nระบบงาน');
await cycle(
  'service',
  '/services',
  {
    code: `SMOKE_SRV_${stamp}`,
    name_th: `SMOKE ລະບົບ ${stamp}`,
    service_group: 'infrastructure',
    service_tier: 'standard',
  },
  { is_24x7: true, service_tier: 'high' },
  (r) => r.name_th,
);

console.log('\nซอฟต์แวร์ที่อนุมัติ');
await cycle(
  'approved-software',
  '/approved-software',
  { name: `SMOKE_App_${stamp}`, version: '1.0', license_type: 'freeware' },
  { note: 'ແກ້ໄຂຈາກ smoke test' },
  (r) => r.name,
);

console.log('\nแม่แบบรายการตรวจ');
const template = await cycle(
  'checklist-template',
  '/checklist-templates',
  { code: `SMOKE_CL_${stamp}`, name_th: `SMOKE ແມ່ແບບ ${stamp}` },
  { doc_ref: 'SMOKE-DOC-1' },
  (r) => r.name_th,
);
if (template) {
  const item = await call('POST', '/checklist-items', {
    template_id: template.id,
    title_th: `SMOKE ລາຍການ ${stamp}`,
  });
  check(
    'checklist-item เพิ่มรายการย่อย',
    item.status === 200 || item.status === 201,
    `${item.status} ${JSON.stringify(item.json?.error ?? {})}`,
  );
}

console.log('\nแคตตาล็อกบริการ');
await cycle(
  'catalog-item',
  '/catalog-items',
  {
    code: `SMOKE_REQ_${stamp}`,
    name_th: `SMOKE ຄຳຂໍ ${stamp}`,
    target_mode: 'duration',
    target_minutes: 30,
  },
  { target_minutes: 60 },
  (r) => r.name_th,
);

console.log('\nกฎการยกระดับ');
await cycle(
  'escalation-rule',
  '/escalation-rules',
  {
    code: `SMOKE_ES_${stamp}`,
    trigger_type: 'resolution_breach',
    notify_contact_keys: 'head_of_it',
    priority: 'P3',
    threshold_minutes: 60,
  },
  { repeat_interval_minutes: 30 },
  (r) => r.code,
);

console.log('\nวันหยุด (ไม่มี is_active จึงแก้ได้อย่างเดียว)');
const holiday = await call('POST', '/holidays', {
  holiday_date: '2099-01-01',
  name: `SMOKE ວັນພັກ ${stamp}`,
  company_id: null,
});
check(
  'holiday สร้าง',
  holiday.status === 200 || holiday.status === 201,
  `${holiday.status} ${JSON.stringify(holiday.json?.error ?? {})}`,
);
if (holiday.json?.data?.id) {
  const patched = await call('PATCH', `/holidays/${holiday.json.data.id}`, {
    name: `SMOKE ວັນພັກ ${stamp} ແກ້ໄຂ`,
  });
  check('holiday แก้ไข', patched.status === 200, `${patched.status}`);
}

console.log('\nเวลาทำการ (แก้ได้อย่างเดียว)');
const hours = await call('GET', '/business-hours');
const monday = (hours.json?.data ?? []).find((h) => h.day_of_week === 1);
if (monday) {
  const ok = await call('PATCH', `/business-hours/${monday.id}`, { start_time: '08:30' });
  check('business-hours แก้ไข', ok.status === 200, `${ok.status}`);
  const bad = await call('PATCH', `/business-hours/${monday.id}`, {
    start_time: '18:00',
    end_time: '09:00',
  });
  check('business-hours กันเวลาเริ่มหลังเวลาเลิก', bad.status === 422, `ได้ ${bad.status} ไม่ใช่ 422`);
} else {
  check('business-hours หาแถววันจันทร์', false, 'ไม่พบ');
}

console.log('\nกฎที่ต้องปฏิเสธ');
const dupe = await call('POST', '/categories', {
  code: `SMOKE_CAT_${stamp}`,
  name_th: 'ซ้ำ',
  company_id: null,
});
check('รหัสซ้ำ → 409', dupe.status === 409, `ได้ ${dupe.status}`);

const badCode = await call('POST', '/categories', { code: 'ไม่ใช่รหัส', name_th: 'x' });
check('รหัสผิดรูปแบบ → 422', badCode.status === 422, `ได้ ${badCode.status}`);

const noMinutes = await call('POST', '/catalog-items', {
  code: `SMOKE_BAD_${stamp}`,
  name_th: 'ขาดนาที',
  target_mode: 'duration',
});
check('duration ที่ไม่มี target_minutes → 422', noMinutes.status === 422, `ได้ ${noMinutes.status}`);

const needChain = await call('POST', '/catalog-items', {
  code: `SMOKE_BAD2_${stamp}`,
  name_th: 'ขาดสายอนุมัติ',
  target_mode: 'duration',
  target_minutes: 10,
  requires_approval: true,
});
check('requires_approval ที่ไม่มี approval_chain → 422', needChain.status === 422, `ได้ ${needChain.status}`);

const ghost = await call('PATCH', '/departments/99999999', { name: 'ไม่มีจริง' });
check('แก้แถวที่ไม่มี → 404', ghost.status === 404, `ได้ ${ghost.status}`);

console.log(`\nผ่าน ${pass} · ไม่ผ่าน ${fail}\n`);
process.exitCode = fail === 0 ? 0 : 1;
