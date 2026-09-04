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

const DATABASE_URL = requireEnv('DATABASE_URL');

/**
 * เปิด SSL เมื่อฐานข้อมูลอยู่นอกเครื่อง
 *
 * ผู้ให้บริการอย่าง Neon, Supabase, Railway บังคับ SSL ทั้งหมด
 * ถ้าไม่เปิดจะเชื่อมต่อไม่ได้เลย ด้วยข้อความที่ไม่บอกสาเหตุตรง ๆ
 * ("connection closed" เฉย ๆ) ซึ่งเสียเวลาไล่หามาก
 *
 * ตัดสินจาก host แทนการบังคับให้ตั้ง env เพิ่ม — localhost ไม่ต้องใช้ SSL
 * และการลืมตั้งค่านี้ตอน deploy คือความผิดพลาดที่เกิดซ้ำได้ง่ายที่สุด
 *
 * ตั้ง DB_SSL ทับได้ ('require' หรือ 'false') เผื่อกรณีที่เดาผิด
 */
function resolveSsl(): 'require' | false {
  const override = process.env.DB_SSL;
  if (override === 'require') return 'require';
  if (override === 'false') return false;

  try {
    const host = new URL(DATABASE_URL).hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    return isLocal ? false : 'require';
  } catch {
    // อ่าน URL ไม่ออก ให้ปลอดภัยไว้ก่อน
    return 'require';
  }
}

/**
 * ต่อผ่านตัวรวม connection (PgBouncer) อยู่หรือไม่
 *
 * Neon, Supabase และผู้ให้บริการอื่นให้ endpoint สองแบบ
 * แบบ pooled จะมี "-pooler" อยู่ในชื่อ host
 *
 * ⚠️ สำคัญ: PgBouncer โหมด transaction ไม่รองรับ prepared statement
 *    แต่ postgres.js เปิดใช้เป็นค่าเริ่มต้น ผลคือพอมีคนใช้พร้อมกันหลายคน
 *    จะได้ error "prepared statement s1 already exists" แบบสุ่ม
 *    ซึ่งหาสาเหตุยากมาก เพราะคิวรีเดียวกันบางครั้งผ่านบางครั้งพัง
 *    ขึ้นกับว่า PgBouncer จับคำขอไปลง connection ไหน
 */
function isPooled(): boolean {
  try {
    return new URL(DATABASE_URL).hostname.includes('-pooler');
  } catch {
    return false;
  }
}

export const sql = postgres(DATABASE_URL, {
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idle_timeout: 30,
  connect_timeout: 10,
  ssl: resolveSsl(),
  // ปิด prepared statement เมื่อต่อผ่าน pooler มิฉะนั้นจะพังเป็นระยะ
  ...(isPooled() ? { prepare: false } : {}),
  connection: { TimeZone: DB_TIMEZONE },
  // ปิด log ของไดรเวอร์ ให้ Drizzle เป็นคนคุม logger ที่เดียว
  onnotice: () => {},
});

export const db = drizzle(sql, {
  schema,
  logger: process.env.DB_LOG === 'true',
});

export type Db = typeof db;
