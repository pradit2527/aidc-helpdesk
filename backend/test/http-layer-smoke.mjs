/**
 * ทดสอบชั้น HTTP — ซองมาตรฐาน การจัดการข้อผิดพลาด trace id และ rate limit
 *
 *   node test/http-layer-smoke.mjs
 *
 * ตรวจสิ่งที่ "ต้องเป็นจริงกับทุก endpoint" ไม่ใช่ตรรกะของ endpoint ใดอันหนึ่ง
 */

const BASE = process.env.API_BASE ?? 'http://localhost:8000/api/v1';
const USERNAME = process.env.SEED_ADMIN_USERNAME ?? 'admin';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'AidcHelpdesk2026!';

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** ทุก response ที่ห่อซองต้องมีสี่คีย์นี้ครบ ไม่ขาดไม่เกิน */
function hasEnvelopeShape(body) {
  if (typeof body !== 'object' || body === null) return false;
  const keys = Object.keys(body).sort();
  return (
    keys.length === 4 &&
    keys[0] === 'data' &&
    keys[1] === 'error' &&
    keys[2] === 'meta' &&
    keys[3] === 'success'
  );
}

const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function call(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
  const cookie = cookieHeader();
  if (cookie) headers.Cookie = cookie;
  const csrf = jar.get('aidc_csrf');
  if (csrf && options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrf;

  const res = await fetch(BASE + path, { ...options, headers });
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const [name, ...rest] = pair.split('=');
    const value = rest.join('=');
    if (value === '') jar.delete(name.trim());
    else jar.set(name.trim(), value);
  }
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, body, res };
}

console.log('\nตรวจชั้น HTTP\n');

// ── ซองบน response ที่สำเร็จ ─────────────────────────────────────────
console.log('ซองมาตรฐาน');
const login = await call('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
});
check('login คืนซองครบสี่คีย์', hasEnvelopeShape(login.body), Object.keys(login.body ?? {}).join(','));
check('success เป็น true', login.body?.success === true);
check('error เป็น null เมื่อสำเร็จ', login.body?.error === null);
check('data มีเนื้อหาจริง', Boolean(login.body?.data?.user?.username), login.body?.data?.user?.username);
check('meta.request_id มีค่า', typeof login.body?.meta?.request_id === 'string');

// ── ซองบนผลลัพธ์ที่แบ่งหน้า ─────────────────────────────────────────
console.log('\nการแบ่งหน้า');
const list = await call('/tickets?page=1&page_size=5');
check('list คืนซองครบสี่คีย์', hasEnvelopeShape(list.body));
check('data เป็นอาร์เรย์ตรง ๆ ไม่ใช่ { items }', Array.isArray(list.body?.data), typeof list.body?.data);
check('meta.page อยู่ในซอง', list.body?.meta?.page === 1, String(list.body?.meta?.page));
check('meta.page_size อยู่ในซอง', list.body?.meta?.page_size === 5, String(list.body?.meta?.page_size));
check('meta.total เป็นตัวเลข', typeof list.body?.meta?.total === 'number');
check('meta.total_pages เป็นตัวเลข', typeof list.body?.meta?.total_pages === 'number');
check(
  'ไม่มี items หลงเหลือใน data',
  !Object.prototype.hasOwnProperty.call(list.body?.data ?? {}, 'items'),
);

// ── ซองบน response ที่ผิดพลาด ───────────────────────────────────────
console.log('\nการจัดการข้อผิดพลาด');
const notFound = await call('/tickets/99999999');
check('404 คืนซองรูปแบบเดียวกับตอนสำเร็จ', hasEnvelopeShape(notFound.body));
check('success เป็น false', notFound.body?.success === false);
check('data เป็น null', notFound.body?.data === null);
check('error.code มีค่า', typeof notFound.body?.error?.code === 'string', notFound.body?.error?.code);
check('error.message เป็นภาษาลาว', /[\u0E80-\u0EFF]/.test(notFound.body?.error?.message ?? ''), notFound.body?.error?.message);

const badPayload = await call('/tickets', {
  method: 'POST',
  body: JSON.stringify({ subject: '', ฟิลด์ที่ไม่มีจริง: 1 }),
});
check('ส่งฟิลด์ที่ไม่รู้จักได้ 400', badPayload.status === 400, `ได้ ${badPayload.status}`);
check('มี error.details รายฟิลด์', Array.isArray(badPayload.body?.error?.details));
check(
  'details แต่ละรายการมี field และ message',
  (badPayload.body?.error?.details ?? []).every((d) => 'field' in d && 'message' in d),
);

// ── ไม่รั่วรายละเอียดภายใน ───────────────────────────────────────────
console.log('\nการไม่รั่วข้อมูลภายใน');
const allErrorText = JSON.stringify([notFound.body, badPayload.body]);
for (const leak of ['stack', 'at Object.', 'node_modules', 'postgres', 'drizzle', 'D:\\\\']) {
  check(`ไม่มี "${leak}" ใน response`, !allErrorText.includes(leak));
}

// ── trace id ────────────────────────────────────────────────────────
console.log('\nการตามรอยคำขอ');
const traced = await call('/auth/me');
const headerId = traced.res.headers.get('X-Request-Id');
check('ตอบ header X-Request-Id', Boolean(headerId), String(headerId));
check('header ตรงกับ meta.request_id', headerId === traced.body?.meta?.request_id);

const supplied = 'my-own-trace-id-12345';
const echoed = await call('/auth/me', { headers: { 'X-Request-Id': supplied } });
check('รับ request id ที่ส่งมาจากภายนอก', echoed.body?.meta?.request_id === supplied, echoed.body?.meta?.request_id);

const injection = await call('/auth/me', { headers: { 'X-Request-Id': 'bad id with spaces' } });
check(
  'ปฏิเสธ request id ที่รูปแบบไม่ปลอดภัย แล้วสร้างใหม่แทน',
  injection.body?.meta?.request_id !== 'bad id with spaces',
  injection.body?.meta?.request_id,
);

// ── endpoint ที่ไม่ห่อซองโดยตั้งใจ ──────────────────────────────────
console.log('\nจุดตรวจสุขภาพ');
const livez = await fetch(`${BASE}/livez`).then((r) => r.json());
check('/livez ไม่ห่อซอง (load balancer มีสัญญาของตัวเอง)', !hasEnvelopeShape(livez), JSON.stringify(livez));
check('/livez ตอบ alive', livez.status === 'alive');

const health = await call('/health');
check('/health ห่อซอง', hasEnvelopeShape(health.body));
check(
  '/health ตรวจฐานข้อมูลจริง ไม่ใช่ค่าคงที่',
  typeof health.body?.data?.components?.database?.latency_ms === 'number',
  String(health.body?.data?.components?.database?.latency_ms),
);
check(
  'Redis ล่มถือเป็น degraded ไม่ใช่ down',
  ['ok', 'degraded'].includes(health.body?.data?.components?.redis?.status),
  health.body?.data?.components?.redis?.status,
);

// ── rate limit ──────────────────────────────────────────────────────
console.log('\nการจำกัดอัตราการเรียก');
const burst = await Promise.all(
  Array.from({ length: 14 }, () =>
    fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ไม่มีบัญชีนี้', password: 'ผิดแน่นอน-1234' }),
    }).then((r) => r.status),
  ),
);
check('ยิง login รัวแล้วโดนจำกัด', burst.includes(429), `สถานะที่ได้: ${[...new Set(burst)].join(', ')}`);

const limited = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'x', password: 'y' }),
});
if (limited.status === 429) {
  const body = await limited.json().catch(() => null);
  check('429 ก็ยังห่อซองเหมือนกัน', hasEnvelopeShape(body), JSON.stringify(body)?.slice(0, 80));
  check('429 มี error.code เป็น RATE_LIMITED', body?.error?.code === 'RATE_LIMITED', body?.error?.code);
} else {
  check('429 ก็ยังห่อซองเหมือนกัน', false, `ได้ ${limited.status} — โควตายังไม่หมด`);
  check('429 มี error.code เป็น RATE_LIMITED', false, 'ข้ามเพราะยังไม่ถูกจำกัด');
}

console.log(`\nผ่าน ${passed} · ล้มเหลว ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
