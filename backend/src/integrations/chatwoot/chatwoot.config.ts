import { createHmac } from 'node:crypto';

/**
 * ค่าตั้งของแชทถาม-ตอบผ่าน Chatwoot
 *
 * backend ถือค่าเดียวคือ HMAC token ของ inbox — ที่อยู่เซิร์ฟเวอร์และ website token
 * เป็นของ frontend และเปิดเผยอยู่ในหน้าเว็บอยู่แล้วตามการออกแบบของ Chatwoot
 *
 * ⚠️ HMAC token ต้องไม่หลุดไปถึงเบราว์เซอร์เด็ดขาด
 *    ถ้าหลุด ใครก็คำนวณรหัสยืนยันของคนอื่นได้ แล้วเปิดแชทในนามคนนั้น
 *    เห็นบทสนทนาย้อนหลังที่เขาเคยคุยกับทีม IT ทั้งหมด
 */
export interface ChatwootConfig {
  /** ว่าง = ไม่ได้เปิดการยืนยันตัวตน แชทยังใช้ได้ แต่ Chatwoot เชื่อ identifier ที่ส่งมาเฉย ๆ */
  hmacToken: string;
}

export function readChatwootConfig(env: NodeJS.ProcessEnv = process.env): ChatwootConfig {
  return { hmacToken: env.CHATWOOT_HMAC_TOKEN?.trim() ?? '' };
}

/**
 * รหัสยืนยันตัวตนตามสเปก identity validation ของ Chatwoot
 *
 * HMAC-SHA256 ของ identifier ด้วย HMAC token ของ inbox แสดงเป็นเลขฐานสิบหก
 * Chatwoot คำนวณแบบเดียวกันฝั่งตัวเองแล้วเทียบ — ไม่ตรงคือปฏิเสธ
 */
export function chatwootIdentifierHash(hmacToken: string, identifier: string): string {
  return createHmac('sha256', hmacToken).update(identifier).digest('hex');
}
