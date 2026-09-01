import { Global, Module } from '@nestjs/common';

import { db } from './client';

/**
 * โทเคนสำหรับ inject ตัวเชื่อมฐานข้อมูล
 *
 * ใช้ค่าคงที่แทนคลาสเพราะ `db` เป็นอ็อบเจ็กต์ที่ Drizzle สร้างให้
 * ไม่ใช่คลาสที่ NestJS จะ new เองได้
 */
export const DB = Symbol('DRIZZLE_DB');

/**
 * @Global เพราะทุกโมดูลที่แตะข้อมูลต้องใช้ตัวเดียวกันหมด
 * ถ้าไม่ประกาศเป็น global แต่ละโมดูลต้อง import ซ้ำ ซึ่งไม่ได้เพิ่มความปลอดภัยอะไร
 * มีแต่จะลืมแล้วเจอ error ตอน runtime
 */
@Global()
@Module({
  providers: [{ provide: DB, useValue: db }],
  exports: [DB],
})
export class DbModule {}
