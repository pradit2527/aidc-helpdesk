/**
 * Smoke test ของ API — รันด้วย `node test/api-smoke.mjs`
 *
 * เขียนเป็นสคริปต์ Node แทน curl เพราะ Git Bash บน Windows แปลงข้อความ
 * non-ASCII ใน argument เป็น "?" ก่อนถึง curl ทำให้ทดสอบภาษาลาวไม่ได้
 */

const BASE = process.env.API_BASE ?? 'http://localhost:8000/api/v1';

let pass = 0;
const fail = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail.push(name);
    console.log(`  FAIL  ${name}  ${detail}`);
  }
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: res.status === 204 ? null : await res.json() };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, json: await res.json() };
}

console.log('\nAIDC Helpdesk API — smoke test\n');

// ── เมทริกซ์ระดับความสำคัญ (SLA ข้อ 4) ──
const MATRIX = [
  ['org_wide', 'high', 'P1'],
  ['org_wide', 'medium', 'P2'],
  ['org_wide', 'low', 'P3'],
  ['department', 'high', 'P2'],
  ['department', 'medium', 'P3'],
  ['department', 'low', 'P3'],
  ['individual', 'high', 'P3'],
  ['individual', 'medium', 'P3'],
  ['individual', 'low', 'P4'],
];

for (const [impact, urgency, want] of MATRIX) {
  const { json } = await post('/tickets', {
    subject: 'ທົດສອບເມທຣິກລະດັບຄວາມສຳຄັນ',
    description: 'ກວດວ່າລະບົບຄຳນວນລະດັບຈາກຜົນກະທົບ x ຄວາມຮີບດ່ວນ',
    category_id: 79,
    impact,
    urgency,
  });
  check(`เมทริกซ์ ${impact} × ${urgency} → ${want}`, json.priority === want, `ได้ ${json.priority}`);
}

// ── P1 ต้องใช้นาฬิกาปฏิทิน 24x7 (SLA 5.4) ──
{
  const { json } = await post('/tickets', {
    subject: 'ທົດສອບໂໝດໂມງຂອງ P1',
    description: 'P1 ຕ້ອງນັບຕໍ່ເນື່ອງ 24x7 ບໍ່ແມ່ນນັບສະເພາະເວລາເຮັດວຽກ',
    category_id: 79,
    impact: 'org_wide',
    urgency: 'high',
  });
  check('P1 ใช้นาฬิกา calendar_24x7', json.sla.clock_mode === 'calendar_24x7');
  check('P1 หน่วยเวลาเป็น calendar_minutes', json.sla.remaining_unit === 'calendar_minutes');
}

// ── P2 ต้องนับเฉพาะเวลาทำการ ──
{
  const { json } = await post('/tickets', {
    subject: 'ທົດສອບໂໝດໂມງຂອງ P2',
    description: 'P2 ຕ້ອງນັບສະເພາະເວລາເຮັດວຽກ ຈັນ-ສຸກ 08:30-17:30',
    category_id: 79,
    impact: 'department',
    urgency: 'high',
  });
  check('P2 ใช้นาฬิกา business_hours', json.sla.clock_mode === 'business_hours');
  check('P2 หน่วยเวลาเป็น business_minutes', json.sla.remaining_unit === 'business_minutes');
}

// ── ห้ามส่ง priority มาเอง (SLA ข้อ 4 / G-17) ──
{
  const { status } = await post('/tickets', {
    subject: 'ທົດສອບສົ່ງ priority ມາເອງ',
    description: 'ຄວນຖືກປະຕິເສດ ເພາະລະບົບເປັນຜູ້ຄຳນວນລະດັບ',
    category_id: 79,
    impact: 'individual',
    urgency: 'low',
    priority: 'P1',
  });
  check('ส่ง priority มาเองถูกปฏิเสธ', status === 400, `ได้ HTTP ${status}`);
}

// ── ข้อความภาษาลาวต้องไม่เพี้ยน ──
{
  const subject = 'ເຄື່ອງສະແກນບາໂຄດສາງ 2 ອ່ານບໍ່ຕິດ';
  const description = 'ອ່ານບໍ່ຕິດຕັ້ງແຕ່ເຊົ້າ ມີລົດລໍຖ້າ 4 ຄັນ';
  const { json } = await post('/tickets', {
    subject,
    description,
    category_id: 79,
    impact: 'department',
    urgency: 'high',
  });
  check('หัวข้อภาษาลาวไม่เพี้ยน', json.subject === subject);
  check('รายละเอียดภาษาลาวไม่เพี้ยน', json.description === description);
  check(
    'อักษรอยู่ในช่วง Unicode ลาว U+0E80–U+0EFF',
    [...json.subject].some((c) => c.codePointAt(0) >= 0x0e80 && c.codePointAt(0) <= 0x0eff),
  );
}

// ── ตัวกรอง ──
{
  const { json } = await get('/tickets?status=pending_user');
  check('กรอง status=pending_user', json.items.every((t) => t.status === 'pending_user'));
  check(
    'ทุกใบที่ pending_user มี pending_reason',
    json.items.every((t) => t.pending_reason !== null),
  );
  check('SLA ของ pending_user เป็น paused', json.items.every((t) => t.sla.status === 'paused'));
}

// ── บล็อก can ──
{
  const { json } = await get('/tickets/1042');
  check('มีบล็อก can ใน response', typeof json.can === 'object' && json.can !== null);
  check('can มีครบ 15 สิทธิ์', Object.keys(json.can ?? {}).length === 15);
}

// ── health ──
{
  const { status, json } = await get('/health');
  check('health ตอบ 200', status === 200);
  check('health มี db และ redis', 'db' in json && 'redis' in json);
}

// ── OpenAPI ──
{
  const res = await fetch(`${BASE}/openapi.json`);
  const doc = await res.json();
  const paths = Object.keys(doc.paths ?? {});
  check('openapi.json ใช้งานได้', res.status === 200);
  check('มี path ครบ', paths.length >= 6, `พบ ${paths.length}`);
  check('OpenAPI 3.x', String(doc.openapi ?? '').startsWith('3.'));
}

console.log(`\nรวม ${pass + fail.length} เคส · ผ่าน ${pass} · ล้มเหลว ${fail.length}`);
if (fail.length) {
  console.log('ที่ล้มเหลว:', fail.join(', '));
  process.exit(1);
}
