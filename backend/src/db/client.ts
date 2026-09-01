/**
 * การเชื่อมต่อฐานข้อมูลของแอป
 *
 * ใช้ไดรเวอร์ postgres.js ไม่ใช่ node-postgres เพราะ
 *   - parse ชนิด timestamptz กลับมาเป็น Date ที่ถูกต้องโดยไม่ต้องตั้งค่าเพิ่ม
 *   - รองรับ prepared statement ในตัว ซึ่ง Drizzle ใช้เต็มที่
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`ไม่ได้ตั้งค่า ${name} — คัดลอก .env.example เป็น .env ก่อน`);
  }
  return value;
}

/**
 * ทุก connection ต้องอยู่โซนเวลาเดียวกับ SLA engine
 * ถ้าปล่อยให้ Postgres ใช้โซนเวลาของเครื่อง การตัดวันของ
 * uq_notification_dedup (created_at::date) จะเลื่อนตามเซิร์ฟเวอร์
 */
export const DB_TIMEZONE = 'Asia/Vientiane';

export const sql = postgres(requireEnv('DATABASE_URL'), {
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idle_timeout: 30,
  connect_timeout: 10,
  connection: { TimeZone: DB_TIMEZONE },
  // ปิด log ของไดรเวอร์ ให้ Drizzle เป็นคนคุม logger ที่เดียว
  onnotice: () => {},
});

export const db = drizzle(sql, {
  schema,
  logger: process.env.DB_LOG === 'true',
});

export type Db = typeof db;
