/**
 * รันชุดทดสอบที่ต้องมีเซิร์ฟเวอร์รันอยู่ ตามลำดับที่ปลอดภัย
 *
 *   node test/run-all.mjs
 *
 * ทำไมต้องมีตัวรันแยก ไม่ปล่อยให้เรียกทีละไฟล์
 *   http-layer-smoke ทดสอบ rate limit ด้วยการยิงจนโดนจำกัดจริง
 *   ซึ่งกินโควตาของ endpoint login จนไฟล์อื่นที่รันตามหลังได้ 429 ทั้งชุด
 *   จึงต้องรันมันเป็นตัวสุดท้าย และรอให้หน้าต่างปิดก่อนรันซ้ำ
 *
 * ⚠️ ตั้ง AUTH_THROTTLE_TTL_SECONDS ให้สั้น (เช่น 15) ตอนพัฒนา
 *    ค่าเริ่มต้นคือ 300 วินาที ซึ่งจะทำให้รอนานเกินไปต่อการรันหนึ่งครั้ง
 */

import { spawn } from 'node:child_process';

const BASE = process.env.API_BASE ?? 'http://localhost:8000/api/v1';
const WINDOW_SECONDS = Number(process.env.AUTH_THROTTLE_TTL_SECONDS ?? 300);

/** ไฟล์ที่กินโควตา rate limit ต้องอยู่ท้ายสุด */
const SUITES = ['test/db-smoke.mjs', 'test/auth-smoke.mjs', 'test/http-layer-smoke.mjs'];

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** รอจนกว่า endpoint login จะรับคำขออีกครั้ง แทนการเดาเวลา */
async function waitForThrottleWindow() {
  const deadline = Date.now() + (WINDOW_SECONDS + 5) * 1000;

  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '', password: '' }),
    }).catch(() => null);

    // 400 = ผ่าน rate limit มาถึงชั้นตรวจข้อมูลแล้ว แปลว่าโควตาว่างแล้ว
    if (res && res.status !== 429) return true;
    await sleep(2000);
  }
  return false;
}

const alive = await fetch(`${BASE}/livez`).catch(() => null);
if (!alive?.ok) {
  console.error(`\nเซิร์ฟเวอร์ที่ ${BASE} ไม่ตอบสนอง — สั่ง npm run dev ก่อน\n`);
  process.exit(1);
}

let failures = 0;
for (const [index, suite] of SUITES.entries()) {
  if (index > 0) {
    process.stdout.write(`\nรอโควตา rate limit ว่างก่อนรัน ${suite} ...`);
    const ready = await waitForThrottleWindow();
    console.log(ready ? ' พร้อม' : ' หมดเวลารอ — ผลอาจเพี้ยนเพราะโดนจำกัด');
  }
  const code = await run(suite);
  if (code !== 0) failures += 1;
}

console.log(
  failures === 0
    ? '\n✓ ชุดทดสอบที่ต้องใช้เซิร์ฟเวอร์ผ่านครบทุกไฟล์\n'
    : `\n✗ มี ${failures} ไฟล์ที่ไม่ผ่าน\n`,
);
process.exit(failures === 0 ? 0 : 1);
