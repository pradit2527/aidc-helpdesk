/**
 * ตรวจว่าไม่มีหน้าไหนเลื่อนซ้ายขวาได้ ในทุกความกว้างที่รองรับ
 *
 *   node scripts/check-responsive.mjs
 *
 * ทำไมต้องเป็นสคริปต์ ไม่ใช่ตรวจด้วยตา
 * การเลื่อนแนวนอนเกิดจาก element เดียวที่กว้างเกิน แล้วมันมักอยู่นอกจอพอดี
 * จึงมองไม่เห็นตอนเปิดดู — ต้องวัดถึงจะรู้ และต้องวัดซ้ำทุกครั้งที่แก้ layout
 *
 * ตัวที่อยู่ในกล่องที่เลื่อนเองได้ (overflow-x: auto) ถูกข้าม เพราะถูกคลิปแล้ว
 * ตารางกว้างที่เลื่อนในกล่องตัวเองไม่ถือว่าผิด — ที่ผิดคือทั้งหน้าเลื่อนได้
 */

import { chromium } from 'playwright';

const BASE = process.env.WEB_BASE ?? 'http://localhost:3000';

/** ความกว้างที่ต้องผ่าน — เล็กสุดคือ iPhone SE ซึ่งยังมีใช้งานจริงที่ไซต์งาน */
const WIDTHS = [320, 375, 414, 768, 1024, 1440];

const PATHS = [
  '/login',
  '/queue',
  '/tickets',
  '/tickets/my',
  '/tickets/new',
  '/tickets/1038',
  '/approvals',
  '/dashboard',
  '/reports',
  '/reports/sla-compliance',
  '/kb',
  '/kb/301',
  '/notifications',
  '/profile',
  '/admin',
  '/admin/users',
  '/admin/roles',
  '/admin/escalation',
  '/admin/services',
  '/admin/problems',
  '/admin/catalog',
  '/admin/checklists',
  '/admin/software',
  '/admin/sla',
  '/admin/business-hours',
  '/admin/companies',
  '/admin/system',
  '/admin/audit-logs',
];

const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const inScroller = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
      p = p.parentElement;
    }
    return false;
  };
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > vw + 1 && !inScroller(el)) {
      offenders.push(el.tagName + '.' + String(el.className || '').slice(0, 45));
      if (offenders.length >= 3) break;
    }
  }
  return { vw, scrollW: document.documentElement.scrollWidth, offenders };
})()`;

/**
 * เป้าแตะต้องสูงพอสำหรับมือที่ใส่ถุงมือ (กฎ M-1 = 44px · ยอมถึง 36px)
 *
 * ข้ามสองกลุ่มที่ไม่ใช่เป้าแตะจริง
 *   - .sr-only เช่นลิงก์ข้ามไปเนื้อหา ซึ่งสูง 1px จนกว่าจะถูกโฟกัส
 *   - ลิงก์ที่เป็นข้อความในเนื้อหา (ไม่มีพื้นหลัง ไม่มีขอบ ไม่มี padding)
 *     พวกนี้เป็นส่วนหนึ่งของประโยค การบังคับให้สูง 44px จะทำให้บรรทัดห่างผิดปกติ
 */
const TAP_TARGETS = `(() => {
  const small = [];
  for (const el of document.querySelectorAll('a[href], button')) {
    if (el.closest('.sr-only') || el.classList.contains('sr-only')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    const padded = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) > 0;
    const decorated = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderTopWidth !== '0px';
    if (!padded && !decorated) continue;
    if (r.height < 36) {
      small.push(el.tagName + '.' + String(el.className || '').slice(0, 40) + ' h=' + Math.round(r.height));
      if (small.length >= 3) break;
    }
  }
  return small;
})()`;

const browser = await chromium.launch();
let failures = 0;
let checks = 0;

for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  console.log(`\n── ความกว้าง ${width}px ─────────────────────────────`);

  for (const path of PATHS) {
    checks += 1;
    try {
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30_000 });
    } catch {
      console.log(`  ✗ ${path} — โหลดไม่สำเร็จ`);
      failures += 1;
      continue;
    }

    const result = await page.evaluate(MEASURE);
    if (result.scrollW > result.vw + 1) {
      failures += 1;
      console.log(
        `  ✗ ${path} — เลื่อนแนวนอนได้ (${result.scrollW} > ${result.vw})` +
          (result.offenders.length ? `\n      ตัวที่ล้น: ${result.offenders.join(' · ')}` : ''),
      );
    }

    // เป้าแตะเล็กเกินตรวจเฉพาะบนมือถือ ซึ่งเป็นที่ที่ใช้นิ้วจริง
    if (width <= 414) {
      const small = await page.evaluate(TAP_TARGETS);
      if (small.length > 0) {
        failures += 1;
        console.log(`  ✗ ${path} — เป้าแตะเตี้ยกว่า 36px: ${small.join(' · ')}`);
      }
    }
  }
  await context.close();
}

await browser.close();
console.log(
  `\nตรวจ ${checks} ครั้ง · ${failures === 0 ? 'ผ่านทั้งหมด' : `ล้มเหลว ${failures} รายการ`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
