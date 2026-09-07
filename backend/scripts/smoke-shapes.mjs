/**
 * ตรวจว่ารูปร่างที่ API คืน ตรงกับที่หน้าจอคาดหวังจริง
 *
 *   node scripts/smoke-shapes.mjs [origin] [username] [password]
 *
 * ต่างจาก smoke-new-endpoints.mjs ตรงที่ตัวนั้นถามว่า "ตอบ 200 ไหม"
 * ส่วนตัวนี้ถามว่า "ฟิลด์ที่หน้าจออ่านมีอยู่จริงไหม" — endpoint ที่ตอบ 200
 * พร้อมฟิลด์ผิดชื่อจะทำให้หน้าจอขึ้น undefined โดยไม่มี error ที่ไหนเลย
 *
 * ⚠️ ตารางที่ยังไม่มีข้อมูลจะข้ามการตรวจฟิลด์ (ไม่มีแถวให้ตรวจ)
 *    และรายงานว่า "ว่าง" ไม่ใช่ "ผ่าน" — เพื่อไม่ให้เข้าใจว่าตรวจแล้ว
 */

const ORIGIN = process.argv[2] ?? 'http://localhost:8000';
const BASE = `${ORIGIN}/api/v1`;
const USER = process.argv[3] ?? 'demo.superadmin';
const PASS = process.argv[4] ?? process.env.SMOKE_PASSWORD;

if (!PASS) {
  console.error('ต้องส่งรหัสผ่านมาทาง argument ที่ 3 หรือ SMOKE_PASSWORD');
  process.exit(1);
}

/** ฟิลด์ที่หน้าจอแต่ละหน้าอ่านจริง — ดึงมาจากโค้ดหน้านั้น ไม่ใช่เดา */
const EXPECT = {
  '/companies': ['id', 'code', 'name_th', 'name_en', 'contact_email', 'user_count', 'open_ticket_count'],
  '/departments': ['id', 'name', 'company', 'user_count', 'is_active'],
  '/categories': ['id', 'code', 'name_th', 'parent_id', 'default_impact', 'default_urgency', 'sort_order'],
  '/catalog-items': ['id', 'code', 'name_th', 'category', 'default_priority', 'target_minutes', 'clock_start_event', 'requires_approval', 'approval_chain', 'checklist_template'],
  '/services': ['id', 'code', 'name_th', 'company', 'service_group', 'service_tier', 'owner', 'is_24x7', 'uptime_percent_month', 'open_outage_count'],
  '/approved-software': ['id', 'company', 'name', 'version', 'license_type', 'note', 'is_active'],
  '/sla-policies': ['id', 'company', 'name', 'doc_ref', 'doc_version', 'effective_from', 'effective_to', 'is_default', 'targets'],
  '/business-hours': ['id', 'company_id', 'day_of_week', 'start_time', 'end_time', 'is_working_day'],
  '/holidays': ['id', 'holiday_date', 'name'],
  '/escalation-rules': ['id', 'company', 'code', 'trigger_type', 'priority', 'threshold_minutes', 'threshold_clock_mode', 'notify_contact_keys', 'notify_roles', 'repeat_interval_minutes', 'notify_outside_business_hours'],
  '/escalation-contacts': ['id', 'company', 'contact_key', 'user', 'is_primary', 'is_active'],
  '/service-outages': ['id', 'service', 'ticket', 'started_at', 'ended_at', 'is_planned', 'cause', 'recorded_by'],
  '/maintenance-windows': ['id', 'company', 'service', 'planned_start', 'planned_end', 'notified_at', 'notice_lead_business_days', 'description', 'created_by'],
  '/checklist-templates': ['id', 'company', 'code', 'name_th', 'doc_ref', 'version', 'is_active', 'items'],
  '/roles': ['id', 'code', 'name_th', 'description', 'is_system', 'permissions', 'user_count'],
  '/permissions': ['code', 'group_name', 'description'],
  '/users': ['id', 'username', 'full_name', 'email', 'is_active'],
  '/problems': ['id', 'company', 'code', 'title', 'service', 'root_cause_code', 'status', 'opened_at', 'rca_due_at', 'owner'],
};

/** endpoint ที่คืนอ็อบเจกต์เดียว ไม่ใช่อาร์เรย์ */
const EXPECT_OBJECT = {
  '/dashboard/summary': ['open_tickets', 'breached', 'at_risk', 'resolved_this_month', 'sla_compliance_percent', 'avg_first_response_minutes', 'by_priority', 'by_status', 'trend', 'top_categories'],
  '/system/info': ['app', 'database', 'counts', 'backup'],
  '/admin/readiness': ['ready', 'blocking_count', 'checks'],
  '/reports/kpi': ['period', 'items', 'kpi2_first_response', 'csat', 'sip_required'],
  '/reports/sla-compliance': ['period', 'target_percent', 'overall', 'by_company', 'by_priority', 'matrix'],
};

const login = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: USER, password: PASS }),
});
if (login.status !== 200) {
  console.error(`เข้าสู่ระบบไม่ผ่าน (${login.status})`);
  process.exit(1);
}
const cookie = login.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ');

let failures = 0;
let empties = 0;

async function check(path, expected, isObject) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  const body = await res.json().catch(() => null);

  if (res.status !== 200 || !body?.success) {
    failures++;
    console.log(`  ✗ ${path.padEnd(24)} HTTP ${res.status} ${body?.error?.code ?? ''}`);
    return;
  }

  const sample = isObject ? body.data : body.data?.[0];
  if (!sample) {
    empties++;
    console.log(`  · ${path.padEnd(24)} ยังไม่มีข้อมูล — ข้ามการตรวจฟิลด์`);
    return;
  }

  const missing = expected.filter((f) => !(f in sample));
  if (missing.length > 0) {
    failures++;
    console.log(`  ✗ ${path.padEnd(24)} ขาดฟิลด์: ${missing.join(', ')}`);
  } else {
    console.log(`  ✓ ${path.padEnd(24)} ครบ ${expected.length} ฟิลด์`);
  }
}

console.log('\nตรวจรูปร่างที่ API คืน เทียบกับฟิลด์ที่หน้าจออ่านจริง\n');
for (const [path, fields] of Object.entries(EXPECT)) await check(path, fields, false);
for (const [path, fields] of Object.entries(EXPECT_OBJECT)) await check(path, fields, true);

console.log(
  `\n${failures === 0 ? 'รูปร่างตรงทั้งหมด' : `ไม่ตรง ${failures} รายการ`}` +
    (empties > 0 ? ` · ยังไม่มีข้อมูลให้ตรวจ ${empties} รายการ` : ''),
);
process.exitCode = failures === 0 ? 0 : 1;
