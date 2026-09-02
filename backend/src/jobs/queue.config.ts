import type { ConnectionOptions, JobsOptions } from 'bullmq';

/**
 * ชื่อคิวและงาน
 *
 * ⚠️ ชื่อเหล่านี้ถูกเก็บอยู่ใน Redis ของ production แล้ว
 *    เปลี่ยนชื่อ = งานที่ค้างอยู่ในคิวเดิมจะไม่มีใครหยิบไปทำตลอดไป
 *    ถ้าต้องเปลี่ยนจริง ต้องปล่อยให้คิวเดิมว่างก่อนแล้วค่อยเปลี่ยน
 */
export const QUEUE = {
  // ⚠️ ห้ามมี ':' ในชื่อคิว — BullMQ ใช้ ':' เป็นตัวคั่นคีย์ภายในของตัวเอง
  //    และปฏิเสธชื่อที่มีมันด้วยข้อความ "Queue name cannot contain :"
  sla: 'aidc-sla',
  notification: 'aidc-notification',
} as const;

export const JOB = {
  /** กวาดหาเรื่องที่ใกล้เกินกำหนดหรือเกินแล้ว */
  scanSla: 'scan_sla',
  /** ส่งการแจ้งเตือนหนึ่งรายการ */
  sendNotification: 'send_notification',
} as const;

/** คีย์ที่ worker เขียนไว้ให้ /health อ่าน เพื่อรู้ว่างานยังเดินอยู่ */
export const SLA_SCAN_HEARTBEAT_KEY = 'aidc:job:scan_sla:last_run_at';

/**
 * BullMQ ต้องการ connection ของตัวเอง
 *
 * maxRetriesPerRequest ต้องเป็น null เพราะ worker ใช้คำสั่งแบบบล็อกรอคิว
 * ซึ่งกินเวลานานกว่า timeout ปกติ ถ้าใช้ค่าเริ่มต้นของ ioredis
 * worker จะหลุดการเชื่อมต่อเป็นระยะโดยไม่มีสาเหตุที่ชัดเจนใน log
 */
export function queueConnection(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.password ? { password: url.password } : {}),
    maxRetriesPerRequest: null,
  };
}

/**
 * ค่าเริ่มต้นของงานทุกชิ้น
 *
 * เก็บประวัติงานที่สำเร็จไว้จำกัดจำนวน มิฉะนั้น Redis จะบวมขึ้นเรื่อย ๆ
 * จนกินหน่วยความจำหมดเครื่องภายในไม่กี่สัปดาห์ ซึ่งเป็นวิธีที่ระบบคิว
 * ทำให้เซิร์ฟเวอร์ล่มบ่อยที่สุด
 *
 * งานที่ล้มเหลวเก็บนานกว่า เพราะเป็นสิ่งที่ต้องมีคนมาไล่ดู
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 100, age: 3600 },
  removeOnFail: { count: 1000, age: 7 * 24 * 3600 },
};

/** งานกวาด SLA รันทุก 5 นาที — ถี่พอที่การเตือนล่วงหน้าจะยังทัน */
export const SLA_SCAN_INTERVAL_MS = 5 * 60 * 1000;
