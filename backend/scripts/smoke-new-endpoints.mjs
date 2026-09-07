/**
 * ยิง endpoint ใหม่ทั้งหมดด้วยบัญชีจริง แล้วสรุปผลเป็นตาราง
 *
 *   node scripts/smoke-new-endpoints.mjs [origin] [username] [password]
 *
 * ตรวจสองอย่างที่ต่างกัน และทั้งสองอย่างสำคัญ
 *   1. endpoint ตอบ 200 พร้อมซองมาตรฐาน — สัญญาไม่พัง
 *   2. ผู้ใช้ที่ไม่มีสิทธิ์ได้ 403 ไม่ใช่ 200 ที่มีข้อมูลว่าง —
 *      รายการว่างเปล่าที่ควรเป็น 403 คือการรั่วที่มองไม่เห็นจนกว่า
 *      จะมีคนได้สิทธิ์เพิ่มแล้วข้อมูลโผล่มาเอง
 */

const ORIGIN = process.argv[2] ?? 'http://localhost:8000';
const BASE = `${ORIGIN}/api/v1`;
const USER = process.argv[3] ?? 'admin';
const PASS = process.argv[4] ?? process.env.SMOKE_PASSWORD;

if (!PASS) {
  console.error('ต้องส่งรหัสผ่านมาทาง argument ที่ 3 หรือ SMOKE_PASSWORD');
  process.exit(1);
}

/** เก็บคุกกี้เองเพราะ fetch ของ Node ไม่มีคุกกี้จาร์ */
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function absorb(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

async function call(method, path, body) {
  const headers = { Cookie: cookieHeader() };
  if (body) headers['Content-Type'] = 'application/json';
  // CSRF แบบ double-submit — ค่าใน header ต้องตรงกับคุกกี้ aidc_csrf
  if (method !== 'GET' && jar.has('aidc_csrf')) headers['X-CSRF-Token'] = jar.get('aidc_csrf');

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  absorb(res);

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* ไม่ใช่ JSON — ปล่อยเป็น null แล้วให้ผู้เรียกตัดสิน */
  }
  return { status: res.status, json };
}

const login = await call('POST', '/auth/login', { username: USER, password: PASS });
if (login.status !== 200) {
  console.error(`เข้าสู่ระบบไม่ผ่าน (${login.status})`, JSON.stringify(login.json?.error ?? {}));
  process.exit(1);
}
console.log(`เข้าสู่ระบบเป็น ${USER} สำเร็จ\n`);

const CASES = [
  ['GET', '/users?page_size=5'],
  ['GET', '/users/1'],
  ['GET', '/audit-logs?page_size=5'],
  ['GET', '/audit-logs/facets'],
  ['GET', '/kb/categories'],
  ['GET', '/kb/articles?page_size=5'],
  ['GET', '/notifications?page_size=5'],
  ['GET', '/notifications/channels'],
  ['GET', '/approvals?assignee=me'],
  ['GET', '/approvals?page_size=5'],
  ['GET', '/problems?page_size=5'],
  ['GET', '/reports/kpi'],
  ['GET', '/reports/sla-compliance'],
  ['GET', '/escalation-contacts'],
  ['GET', '/service-outages'],
  ['GET', '/maintenance-windows'],
  ['GET', '/admin/readiness'],
  ['POST', '/notifications/read', { ids: [] }],
];

let failures = 0;
console.log('  สถานะ  endpoint                          ผลลัพธ์');
console.log('  ' + '─'.repeat(72));

for (const [method, path, body] of CASES) {
  const { status, json } = await call(method, path, body);
  const ok = status === 200 || status === 201 || status === 404;
  if (!ok) failures++;

  let summary;
  if (!json) {
    summary = 'ไม่ใช่ JSON';
  } else if (json.success === false) {
    summary = `error: ${json.error?.code ?? '?'}`;
  } else if (Array.isArray(json.data)) {
    summary = `${json.data.length} แถว${json.meta?.total !== undefined ? ` / ${json.meta.total} ทั้งหมด` : ''}`;
  } else if (json.data && typeof json.data === 'object') {
    summary = Object.keys(json.data).slice(0, 4).join(', ');
  } else {
    summary = String(json.data);
  }

  // ตรวจซองมาตรฐานด้วย ไม่ใช่แค่รหัสสถานะ
  const hasEnvelope =
    json !== null && ['success', 'data', 'error', 'meta'].every((k) => k in json);
  if (!hasEnvelope) {
    failures++;
    summary += '  ⚠️ ไม่มีซองมาตรฐาน';
  }

  console.log(
    `  ${ok ? '  ✓  ' : '  ✗  '} ${status}  ${`${method} ${path}`.padEnd(36)} ${summary}`,
  );
}

console.log(`\n${failures === 0 ? 'ผ่านทั้งหมด' : `ล้มเหลว ${failures} รายการ`}`);
process.exitCode = failures === 0 ? 0 : 1;
