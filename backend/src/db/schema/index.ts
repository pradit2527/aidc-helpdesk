/**
 * รวม schema ทุกตารางไว้ที่เดียว — 39 ตาราง
 *
 * drizzle-kit อ่านไฟล์นี้เพื่อ generate migration
 * และชั้น repository import จากที่นี่ที่เดียว ไม่ import ไฟล์ย่อยตรง ๆ
 */

export * from './organization';
export * from './ticket';
export * from './sla';
export * from './process';
export * from './content';
