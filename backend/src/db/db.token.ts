/**
 * โทเคนสำหรับ inject ตัวเชื่อมฐานข้อมูล — อยู่แยกไฟล์ไม่มี import ใด ๆ โดยตั้งใจ
 *
 * เดิมค่านี้อยู่ใน db.module.ts แต่ตอนที่ไฟล์นั้นเริ่ม import repository ทั้ง 8
 * ตัวเข้ามาเอง (เพื่อประกาศเป็น provider ของ @Global module) ก็เกิดวงจรอ้างอิง:
 * repository ทุกตัว import DB จาก db.module.ts → db.module.ts import repository
 * กลับเข้ามา → ใครก็ตามที่ require repository ก่อน db.module.ts จบ (เช่น
 * use case ที่ import TicketRepository ตรง ๆ ตั้งแต่ต้นไฟล์ app.module.ts)
 * จะทำให้ CommonJS คืนอ็อบเจ็กต์ exports ของ db.module.ts ที่ยังโหลดไม่เสร็จ
 * กลับมา แล้ว NestJS เห็น provider เป็น undefined ตีความว่าเป็น circular
 * dependency — อาการนี้ขึ้นอยู่กับว่าใครถูก require ก่อนกัน จึงดูเหมือนสุ่ม
 *
 * ทางแก้ถาวรคือแยกโทเคนออกมาไว้ไฟล์ที่ไม่ import อะไรเลย ทั้ง db.module.ts
 * และ repository ทุกตัวจึง import จากที่นี่แทน ไม่มีทางเกิดวงจรได้อีก
 * เพราะไฟล์นี้โหลดเสร็จสมบูรณ์เสมอไม่ว่าใครจะ require ก่อน
 */
export const DB = Symbol('DRIZZLE_DB');
