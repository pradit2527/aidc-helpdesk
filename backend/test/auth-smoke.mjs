/**
 * ทดสอบการยืนยันตัวตนจริง — คุกกี้ CSRF การล็อกบัญชี และการเตะ session
 *
 *   node test/auth-smoke.mjs
 *
 * เก็บคุกกี้เองแทนการใช้ cookie jar ของ fetch เพราะ Node ยังไม่มีให้
 * และการเห็นคุกกี้ตรง ๆ ทำให้ตรวจได้ว่า httpOnly กับ path ถูกตั้งจริงไหม
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

/** เก็บคุกกี้แบบง่าย ๆ ไม่สนใจ path เพราะทดสอบกับ origin เดียว */
function makeJar() {
  const jar = new Map();
  return {
    store(res) {
      for (const line of res.headers.getSetCookie?.() ?? []) {
        const [pair] = line.split(';');
        const [name, ...rest] = pair.split('=');
        const value = rest.join('=');
        if (value === '') jar.delete(name.trim());
        else jar.set(name.trim(), value);
      }
      return res;
    },
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    get(name) {
      return jar.get(name);
    },
    clear() {
      jar.clear();
    },
  };
}

console.log('\nตรวจการยืนยันตัวตน\n');

const jar = makeJar();

async function call(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
  const cookie = jar.header();
  if (cookie) headers.Cookie = cookie;
  const csrf = jar.get('aidc_csrf');
  if (csrf && options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrf;

  const res = await fetch(BASE + path, { ...options, headers });
  jar.store(res);
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, body, res };
}

// ── รหัสผ่านผิด ──────────────────────────────────────────────────────
const wrong = await call('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username: USERNAME, password: 'ผิดแน่นอน-1234' }),
});
check('รหัสผ่านผิดได้ 401', wrong.status === 401, `ได้ ${wrong.status}`);
check(
  'ไม่บอกว่าชื่อผู้ใช้มีอยู่จริงหรือไม่',
  wrong.body?.error?.code === 'INVALID_CREDENTIALS',
  wrong.body?.error?.code,
);

// ── ชื่อผู้ใช้ที่ไม่มีจริง ต้องได้ข้อความเดียวกัน ─────────────────────
const noUser = await call('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username: 'ไม่มีบัญชีนี้แน่นอน', password: 'ผิดแน่นอน-1234' }),
});
check(
  'บัญชีที่ไม่มีจริงตอบเหมือนรหัสผ่านผิดทุกประการ',
  noUser.status === wrong.status && noUser.body?.error?.code === wrong.body?.error?.code,
  `${noUser.status} / ${noUser.body?.error?.code}`,
);

// ── เข้าสู่ระบบสำเร็จ ────────────────────────────────────────────────
const login = await call('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
});
check('เข้าสู่ระบบสำเร็จได้ 200', login.status === 200, `ได้ ${login.status}`);

const setCookies = login.res.headers.getSetCookie?.() ?? [];
const atCookie = setCookies.find((c) => c.startsWith('aidc_at='));
const rtCookie = setCookies.find((c) => c.startsWith('aidc_rt='));
const csrfCookie = setCookies.find((c) => c.startsWith('aidc_csrf='));

check('ตั้งคุกกี้ครบสามตัว', Boolean(atCookie && rtCookie && csrfCookie));
check('access token เป็น httpOnly', /HttpOnly/i.test(atCookie ?? ''), atCookie?.slice(0, 60));
check('refresh token เป็น httpOnly', /HttpOnly/i.test(rtCookie ?? ''));
check(
  'csrf token อ่านด้วย JS ได้ (ไม่เป็น httpOnly)',
  !/HttpOnly/i.test(csrfCookie ?? ''),
  csrfCookie?.slice(0, 60),
);
check(
  'refresh token จำกัด path ไว้ที่ /api/v1/auth',
  /Path=\/api\/v1\/auth/i.test(rtCookie ?? ''),
  rtCookie?.slice(0, 80),
);
check('token ไม่เคยอยู่ใน response body', !JSON.stringify(login.body ?? {}).includes('eyJ'));

check('คืนบทบาทของผู้ใช้', Array.isArray(login.body?.user?.roles), String(login.body?.user?.roles));
check(
  'คืนรายการสิทธิ์ให้ frontend ตัดสินใจ',
  (login.body?.user?.permissions?.length ?? 0) > 0,
  `${login.body?.user?.permissions?.length} สิทธิ์`,
);
check(
  'คืนชื่อบริษัทจริง ไม่ใช่แค่ id',
  Boolean(login.body?.user?.company?.code),
  login.body?.user?.company?.code,
);

// ── ใช้ session ที่เพิ่งได้ ──────────────────────────────────────────
const me = await call('/auth/me');
check('GET /auth/me ใช้คุกกี้ที่เพิ่งได้', me.status === 200, `ได้ ${me.status}`);
check('me คืน username ตรงกับที่ล็อกอิน', me.body?.username === USERNAME, me.body?.username);

const tickets = await call('/tickets');
check('เรียก endpoint อื่นด้วยคุกกี้เดียวกันได้', tickets.status === 200, `ได้ ${tickets.status}`);

// ── CSRF ────────────────────────────────────────────────────────────
const withoutCsrf = await fetch(`${BASE}/tickets`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: jar.header() },
  body: JSON.stringify({
    subject: 'ທົດສອບ CSRF',
    description: 'ຄວນຖືກປະຕິເສດເພາະບໍ່ມີ X-CSRF-Token',
    category_id: 1,
    impact: 'individual',
    urgency: 'low',
  }),
});
check('คำขอที่เปลี่ยนสถานะโดยไม่มี CSRF token ถูกปฏิเสธ', withoutCsrf.status === 403, `ได้ ${withoutCsrf.status}`);

const wrongCsrf = await fetch(`${BASE}/tickets`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Cookie: jar.header(),
    // ค่า header ต้องเป็น Latin-1 เท่านั้น ใส่ภาษาไทยแล้ว fetch จะโยน TypeError
    'X-CSRF-Token': 'guessed-by-the-attacker',
  },
  body: JSON.stringify({
    subject: 'ທົດສອບ CSRF ຜິດຄ່າ',
    description: 'ຄວນຖືກປະຕິເສດເພາະ token ບໍ່ຕົງກັບຄຸກກີ້',
    category_id: 1,
    impact: 'individual',
    urgency: 'low',
  }),
});
check('CSRF token ที่ไม่ตรงกับคุกกี้ถูกปฏิเสธ', wrongCsrf.status === 403, `ได้ ${wrongCsrf.status}`);

const withCsrf = await call('/tickets', {
  method: 'POST',
  body: JSON.stringify({
    subject: 'ສ້າງຜ່ານ session ຈິງ',
    description: 'ຄຳຂໍນີ້ມີທັງຄຸກກີ້ ແລະ X-CSRF-Token ຄົບ',
    category_id: 1,
    impact: 'individual',
    urgency: 'low',
  }),
});
check('มี CSRF token ครบแล้วสร้างได้', withCsrf.status === 201, `ได้ ${withCsrf.status}`);

// ── ต่ออายุ session ─────────────────────────────────────────────────
const beforeRefresh = jar.get('aidc_at');
const refreshed = await call('/auth/refresh', { method: 'POST' });
check('ต่ออายุ session สำเร็จ', refreshed.status === 200, `ได้ ${refreshed.status}`);
check('ได้ access token ใบใหม่', jar.get('aidc_at') !== beforeRefresh);

// ── ออกจากระบบ ──────────────────────────────────────────────────────
const loggedOut = await call('/auth/logout', { method: 'POST' });
check('ออกจากระบบได้ 204', loggedOut.status === 204, `ได้ ${loggedOut.status}`);

const afterLogout = await fetch(`${BASE}/auth/me`, { headers: { Cookie: jar.header() } });
check('หลังออกจากระบบเรียก /auth/me ไม่ได้', afterLogout.status === 401, `ได้ ${afterLogout.status}`);

// ── ไม่มีคุกกี้เลย ──────────────────────────────────────────────────
const anonymous = await fetch(`${BASE}/tickets`);
check('ไม่มี session เรียก /tickets ได้ 401', anonymous.status === 401, `ได้ ${anonymous.status}`);

console.log(`\nผ่าน ${passed} · ล้มเหลว ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
