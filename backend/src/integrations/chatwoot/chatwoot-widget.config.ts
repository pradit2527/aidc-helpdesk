/**
 * ค่าตั้งของ AIDC Support Hub — widget ของ Chatwoot ที่ฝังอยู่บนเว็บแอปของกลุ่ม
 *
 * ต่อยอดจาก CHATWOOT_* ชุดเดิม (ดู chatwoot-sync.config.ts) เพิ่มสามตัว
 *   CHATWOOT_PUBLIC_URL       ที่อยู่ Chatwoot ที่ "เบราว์เซอร์ของผู้เข้าชม" เปิดได้
 *                             ไม่ตั้ง = ใช้ CHATWOOT_BASE_URL
 *   CHATWOOT_WEBHOOK_TOKEN    ⚠️ ความลับ — ว่าง = ปิดทาง webhook (ตอบ 404)
 *   CHATWOOT_WIDGET_POLL_MS   ทุกกี่มิลลิวินาทีที่ไล่หาบทสนทนาใหม่ (ขั้นต่ำ 5000)
 *
 * ⚠️ ทำไมยังต้องดึงเป็นระยะ ทั้งที่มี webhook แล้ว
 *    webhook เป็นแค่ตัวเร่ง ไม่ใช่แหล่งความจริง — เครื่อง dev รับ webhook ไม่ได้
 *    (ไม่มีที่อยู่สาธารณะ) และ webhook ที่หายไปหนึ่งครั้งต้องไม่แปลว่าข้อความหาย
 *    ตัวดึงเป็นระยะจึงเป็นตัวหลักเสมอ webhook แค่ทำให้เร็วขึ้นเมื่อมันมาถึง
 */

const DEFAULT_POLL_MS = 10_000;
const MIN_POLL_MS = 5_000;

export interface ChatwootWidgetConfig {
  /** ที่อยู่ที่ส่งให้สคริปต์ฝังในหน้าเว็บ — ว่างได้ถ้ายังไม่ได้ตั้ง Chatwoot เลย */
  publicUrl: string;
  /** ว่าง = ยังไม่ได้เปิดใช้ทาง webhook */
  webhookToken: string;
  pollMs: number;
}

export function readChatwootWidgetConfig(
  env: NodeJS.ProcessEnv = process.env,
): ChatwootWidgetConfig {
  const publicUrl = (env.CHATWOOT_PUBLIC_URL ?? env.CHATWOOT_BASE_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  const pollMs = Math.max(MIN_POLL_MS, Number(env.CHATWOOT_WIDGET_POLL_MS ?? DEFAULT_POLL_MS) || DEFAULT_POLL_MS);
  return {
    publicUrl,
    webhookToken: (env.CHATWOOT_WEBHOOK_TOKEN ?? '').trim(),
    pollMs,
  };
}
