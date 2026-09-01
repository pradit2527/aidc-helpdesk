/**
 * ทดสอบว่า API อ่านและเขียนฐานข้อมูลจริงได้ ไม่ใช่คืนข้อมูลตัวอย่าง
 *
 *   node test/db-smoke.mjs
 *
 * เขียนเป็นสคริปต์ Node ไม่ใช่ curl เพราะ Git Bash บน Windows แปลงอาร์กิวเมนต์
 * ที่ไม่ใช่ ASCII เป็นเครื่องหมายคำถาม ข้อความภาษาลาวที่ส่งไปจึงเพี้ยนทั้งหมด
 * และจะดูเหมือนว่า backend เก็บข้อมูลผิด ทั้งที่ปัญหาอยู่ที่ shell
 */

const BASE = process.env.API_BASE ?? 'http://localhost:8000/api/v1';
const DEV_USER = process.env.DEV_USER_ID ?? '1';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Dev-User-Id': DEV_USER,
      ...(options.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

console.log('\nตรวจการเชื่อมต่อฐานข้อมูลผ่าน API\n');

// ── สร้างเรื่องใหม่ ──────────────────────────────────────────────────
const subject = 'ເຄື່ອງສະແກນບາໂຄດຄັງ 2 ອ່ານບໍ່ຕິດ';
const created = await call('/tickets', {
  method: 'POST',
  body: JSON.stringify({
    subject,
    description: 'ພະນັກງານຄັງແຈ້ງວ່າສະແກນບໍ່ຕິດຕັ້ງແຕ່ເຊົ້າ ມີລົດລໍຖ້າ 4 ຄັນ',
    category_id: 1,
    impact: 'department',
    urgency: 'high',
  }),
});

check('POST /tickets สร้างสำเร็จ', created.status === 201, `ได้ ${created.status}`);
const ticket = created.body ?? {};

check('ข้อความภาษาลาวถูกเก็บและอ่านกลับมาครบ', ticket.subject === subject, ticket.subject);

// เมทริกซ์ SLA ข้อ 4: department × high = P2
check('ระดับความสำคัญคำนวณจาก impact × urgency', ticket.priority === 'P2', ticket.priority);

check(
  'เลขที่เรื่องออกตามรูปแบบ {รหัสบริษัท}-{ปีเดือน}-{ลำดับ}',
  /^[A-Z-]+-\d{6}-\d{4}$/.test(ticket.ticket_no ?? ''),
  ticket.ticket_no,
);

check('สถานะเริ่มต้นเป็น new', ticket.status === 'new', ticket.status);

// P2 นับเฉพาะนาทีทำการ (SLA 5.4)
check(
  'P2 ใช้โหมดนาฬิกาเวลาทำการ',
  ticket.sla?.clock_mode === 'business_hours',
  ticket.sla?.clock_mode,
);
check(
  'หน่วยเวลาที่เหลือตรงกับโหมดนาฬิกา',
  ticket.sla?.remaining_unit === 'business_minutes',
  ticket.sla?.remaining_unit,
);
check('กำหนดเวลาตอบรับถูกคำนวณให้', Boolean(ticket.sla?.response_due_at));
check('กำหนดเวลาแก้ไขถูกคำนวณให้', Boolean(ticket.sla?.resolution_due_at));

// P2: ตอบรับ 30 นาทีทำการ · แก้ไข 480 นาทีทำการ
const target = new Date(ticket.sla?.resolution_due_at ?? 0).getTime();
const start = new Date(ticket.sla?.clock_started_at ?? 0).getTime();
check(
  'กำหนดปิดงานอยู่หลังเวลาเริ่มนับเสมอ',
  Number.isFinite(target) && target > start,
  `${ticket.sla?.clock_started_at} -> ${ticket.sla?.resolution_due_at}`,
);

check('บล็อก can ถูกส่งมาให้ frontend', typeof ticket.can === 'object' && ticket.can !== null);

// ── อ่านกลับ ────────────────────────────────────────────────────────
const detail = await call(`/tickets/${ticket.id}`);
check('GET /tickets/{id} อ่านแถวเดิมกลับมาได้', detail.body?.id === ticket.id);
check('รายละเอียดคงข้อความลาวไว้ถูกต้อง', detail.body?.subject === subject);

const list = await call('/tickets?page_size=50');
check(
  'GET /tickets มีเรื่องที่เพิ่งสร้างอยู่ในรายการ',
  (list.body?.items ?? []).some((t) => t.id === ticket.id),
);
check('จำนวนรวมนับจากฐานข้อมูลจริง', (list.body?.total ?? 0) >= 1, String(list.body?.total));

// ── ค้นหาภาษาลาว ────────────────────────────────────────────────────
const search = await call(`/tickets?q=${encodeURIComponent('ບາໂຄດ')}`);
check(
  'ค้นคำภาษาลาวกลางประโยคเจอ',
  (search.body?.items ?? []).some((t) => t.id === ticket.id),
  `เจอ ${search.body?.items?.length ?? 0} รายการ`,
);

// ── เปลี่ยนระดับความสำคัญ ────────────────────────────────────────────
const escalated = await call(`/tickets/${ticket.id}/priority`, {
  method: 'POST',
  body: JSON.stringify({
    impact: 'org_wide',
    urgency: 'high',
    reason: 'ກະທົບການຮັບ-ຈ່າຍສິນຄ້າທັງຄັງ ບໍ່ມີທາງລ່ຽງ',
  }),
});
check('POST /tickets/{id}/priority สำเร็จ', escalated.status === 201, `ได้ ${escalated.status}`);
check('org_wide × high ได้ P1', escalated.body?.priority === 'P1', escalated.body?.priority);
check(
  'P1 สลับไปใช้นาฬิกาปฏิทิน 24×7',
  escalated.body?.sla?.clock_mode === 'calendar_24x7',
  escalated.body?.sla?.clock_mode,
);
check('ปรับเป็น P1 แล้วถูกตั้งเป็นเหตุร้ายแรง', escalated.body?.is_major_incident === true);

// ── เปลี่ยนสถานะ ────────────────────────────────────────────────────
const paused = await call(`/tickets/${ticket.id}/status`, {
  method: 'POST',
  body: JSON.stringify({
    to_status: 'pending_user',
    pending_reason: 'user',
    reason: 'ລໍຖ້າຜູ້ແຈ້ງຢືນຢັນວ່າສະແກນເນີຮຸ່ນໃດ',
  }),
});
check('เปลี่ยนเป็นรอผู้แจ้งสำเร็จ', paused.body?.status === 'pending_user', paused.body?.status);
check('สถานะ SLA เปลี่ยนเป็นหยุดนับ', paused.body?.sla?.status === 'paused', paused.body?.sla?.status);
check(
  'ระหว่างหยุดนับไม่รายงานเวลาที่เหลือ',
  paused.body?.sla?.remaining_minutes === null,
  String(paused.body?.sla?.remaining_minutes),
);

// ── ปฏิเสธค่าที่ไม่ควรรับ ────────────────────────────────────────────
const withPriority = await call('/tickets', {
  method: 'POST',
  body: JSON.stringify({
    subject: 'ທົດສອບສົ່ງ priority ມາໂດຍກົງ',
    description: 'ຄວນຖືກປະຕິເສດຕາມ SLA ຂໍ້ 4',
    category_id: 1,
    impact: 'individual',
    urgency: 'low',
    priority: 'P1',
  }),
});
check(
  'ส่ง priority มาตรง ๆ ถูกปฏิเสธ (SLA ข้อ 4)',
  withPriority.status === 400,
  `ได้ ${withPriority.status}`,
);

const noAuth = await fetch(`${BASE}/tickets`).then((r) => r.status);
check('เรียกโดยไม่ระบุผู้ใช้ได้ 401', noAuth === 401, `ได้ ${noAuth}`);

console.log(`\nผ่าน ${passed} · ล้มเหลว ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
