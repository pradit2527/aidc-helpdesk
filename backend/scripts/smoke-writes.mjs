/**
 * ทดสอบ endpoint ที่เขียนข้อมูล ด้วยเรื่องจริงในฐานข้อมูล
 *
 *   node scripts/smoke-writes.mjs [origin] [username] [password]
 *
 * ⚠️ สคริปต์นี้เขียนข้อมูลจริง — คอมเมนต์ที่เพิ่มจะค้างอยู่ในเรื่องนั้น
 *    ใช้กับเครื่องพัฒนาเท่านั้น
 *
 * ตรวจสิ่งที่ต่างจาก smoke ตัวอื่น: ผลข้างเคียงที่ถูกต้อง
 * ไม่ใช่แค่ "ตอบ 201 ไหม" แต่ถามว่า first_response_at ถูกเซ็ตจริงไหม
 * และถูกเซ็ตครั้งเดียวไม่ทับซ้ำ
 */

const ORIGIN = process.argv[2] ?? 'http://localhost:8000';
const BASE = `${ORIGIN}/api/v1`;
const USER = process.argv[3] ?? 'demo.superadmin';
const PASS = process.argv[4] ?? process.env.SMOKE_PASSWORD;

if (!PASS) {
  console.error('ต้องส่งรหัสผ่านมาทาง argument ที่ 3 หรือ SMOKE_PASSWORD');
  process.exit(1);
}

const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
function absorb(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
async function call(method, path, body) {
  const headers = { Accept: 'application/json', Cookie: cookieHeader() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && jar.has('aidc_csrf')) headers['X-CSRF-Token'] = jar.get('aidc_csrf');
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  absorb(res);
  return { status: res.status, json: await res.json().catch(() => null) };
}

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(46)} ${detail ?? ''}`);
}

const login = await call('POST', '/auth/login', { username: USER, password: PASS });
if (login.status !== 200) {
  console.error(`เข้าสู่ระบบไม่ผ่าน (${login.status})`);
  process.exit(1);
}
console.log(`\nทดสอบ endpoint ที่เขียนข้อมูล — เข้าสู่ระบบเป็น ${USER}\n`);

// หาเรื่องที่ยังไม่เคยมีการตอบรับ เพื่อทดสอบการเซ็ต first_response_at
const list = await call('GET', '/tickets?page_size=50');
const tickets = list.json?.data ?? [];
if (tickets.length === 0) {
  console.error('ยังไม่มีเรื่องในระบบ — ข้ามการทดสอบ');
  process.exit(0);
}

/*
 * หาเรื่องที่ยังไม่เคยตอบรับ
 *
 * ⚠️ นับจำนวนที่อ่านรายละเอียดไม่สำเร็จด้วย ไม่ใช่ปล่อยผ่านเงียบ ๆ
 *    เดิมเขียนไว้ว่า "ทุกเรื่องมี first_response_at แล้ว" ทุกครั้งที่หาไม่เจอ
 *    ซึ่งเป็นข้อความเดียวกันทั้งกรณีที่หาเจอครบและกรณีที่อ่านไม่ได้เลย
 *    (เช่นโดน rate limit) — ทำให้เส้นทางที่สำคัญที่สุดถูกข้ามโดยไม่มีใครรู้
 */
let target = null;
let unreadable = 0;
for (const t of tickets) {
  const d = await call('GET', `/tickets/${t.id}`);
  if (d.status !== 200 || !d.json?.data) {
    unreadable++;
    continue;
  }
  if (d.json.data.first_response_at === null) {
    target = d.json.data;
    break;
  }
}

if (unreadable > 0) {
  console.log(`  ⚠️ อ่านรายละเอียดไม่ได้ ${unreadable} เรื่อง (rate limit?) — ผลอาจไม่ครบ`);
}

if (!target) {
  console.log('  · ไม่พบเรื่องที่ยังไม่เคยตอบรับ — ข้ามการตรวจ first_response_at');
  const first = await call('GET', `/tickets/${tickets[0].id}`);
  if (first.status !== 200 || !first.json?.data) {
    console.error('อ่านเรื่องไหนไม่ได้เลย — หยุดการทดสอบ');
    process.exit(1);
  }
  target = first.json.data;
}

console.log(`เรื่องที่ใช้ทดสอบ: ${target.ticket_no} (${target.subject.slice(0, 32)})\n`);

// ── คอมเมนต์ ────────────────────────────────────────────────────────
const before = target.first_response_at;

const c1 = await call('POST', `/tickets/${target.id}/comments`, {
  body: 'ຮັບເລື່ອງແລ້ວ ກຳລັງກວດສອບ (ທົດສອບອັດຕະໂນມັດ)',
});
check('POST /tickets/{id}/comments', c1.status === 201, `HTTP ${c1.status}`);

const afterFirst = await call('GET', `/tickets/${target.id}`);
const fr1 = afterFirst.json?.data?.first_response_at;

if (before === null) {
  check('เซ็ต first_response_at ตอนตอบครั้งแรก', fr1 !== null, fr1 ?? 'ยังเป็น null');
  check('รายงานว่านับเป็นการตอบครั้งแรก', c1.json?.data?.counted_as_first_response === true);
} else {
  check('first_response_at เดิมไม่ถูกแตะ', fr1 === before, 'มีอยู่ก่อนแล้ว');
}

// คอมเมนต์ที่สองต้องไม่ทับเวลาตอบรับครั้งแรก
const c2 = await call('POST', `/tickets/${target.id}/comments`, {
  body: 'ຄຳເຫັນທີສອງ (ທົດສອບ)',
});
const afterSecond = await call('GET', `/tickets/${target.id}`);
check(
  'คอมเมนต์ที่สองไม่ทับ first_response_at',
  afterSecond.json?.data?.first_response_at === fr1,
  fr1 ?? '',
);
check('ไม่นับคอมเมนต์ที่สองเป็นการตอบครั้งแรก', c2.json?.data?.counted_as_first_response === false);

// คอมเมนต์ภายใน
const c3 = await call('POST', `/tickets/${target.id}/comments`, {
  body: 'ບັນທຶກພາຍໃນ (ທົດສອບ)',
  is_internal: true,
});
check('คอมเมนต์ภายในเขียนได้ (มีสิทธิ์)', c3.status === 201, `HTTP ${c3.status}`);

// ข้อความว่างต้องถูกปฏิเสธ
const c4 = await call('POST', `/tickets/${target.id}/comments`, { body: '   ' });
check('ข้อความว่างถูกปฏิเสธ 422', c4.status === 422, `HTTP ${c4.status}`);

// ── รายการตรวจ ──────────────────────────────────────────────────────
const detail = (await call('GET', `/tickets/${target.id}`)).json?.data;
const item = detail?.checklist?.[0];

if (!item) {
  console.log('  · เรื่องนี้ไม่มีรายการตรวจ — ข้ามการทดสอบ checklist');
} else {
  const r = await call('PATCH', `/checklist-items/${item.id}`, { is_done: true });
  const expectEvidence = item.evidence_required === true;
  if (expectEvidence) {
    check('ข้อที่ต้องมีหลักฐาน ติ๊กไม่ได้ 422', r.status === 422, r.json?.error?.code ?? '');
  } else {
    check('PATCH /checklist-items/{id}', r.status === 200, `HTTP ${r.status}`);
    check(
      'คืน all_required_done',
      typeof r.json?.data?.all_required_done === 'boolean',
      String(r.json?.data?.all_required_done),
    );
    // คืนสถานะเดิมเพื่อไม่ให้ข้อมูลทดสอบค้าง
    await call('PATCH', `/checklist-items/${item.id}`, { is_done: item.is_done });
  }
}

// ── ปลดล็อกบัญชี ────────────────────────────────────────────────────
const users = await call('GET', '/users?page_size=1');
const someone = users.json?.data?.[0];
if (someone) {
  const u = await call('POST', `/users/${someone.id}/unlock`);
  check('POST /users/{id}/unlock', u.status === 201 || u.status === 200, `HTTP ${u.status}`);
}

// ── นอกขอบเขตต้องได้ 404 ไม่ใช่ 403 ─────────────────────────────────
const ghost = await call('POST', '/tickets/999999/comments', { body: 'x' });
check('เรื่องที่ไม่มีอยู่ตอบ 404 ไม่ใช่ 403', ghost.status === 404, `HTTP ${ghost.status}`);

console.log(`\n${failures === 0 ? 'ผ่านทั้งหมด' : `ล้มเหลว ${failures} รายการ`}`);
process.exitCode = failures === 0 ? 0 : 1;
