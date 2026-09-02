import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, seconds, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Request } from 'express';

import { RequestContextStore } from '../http/request-context';

/**
 * ชื่อกลุ่มอัตราการเรียก อ้างถึงด้วย @Throttle({ [ชื่อ]: {...} })
 */
export const THROTTLE = {
  /** ค่าเริ่มต้นของทุก endpoint */
  default: 'default',
  /** เข้มกว่ามาก สำหรับ endpoint ที่เดารหัสผ่านได้ */
  auth: 'auth',
} as const;

/**
 * ตั้งค่าอัตราการเรียก
 *
 * ตัวเลขตั้งจากการใช้งานจริงที่คาดไว้ ไม่ได้ตั้งลอย ๆ:
 * หน้า dashboard ยิงราว 6 คำขอตอนเปิด และผู้ใช้เปิดหน้าใหม่ทุกไม่กี่วินาที
 * 300 ครั้ง/นาที จึงกว้างพอสำหรับคนทำงานเร็ว แต่ยังตัดสคริปต์ที่ยิงรัวได้
 */
export const throttleConfig: ThrottlerModuleOptions = {
  throttlers: [
    { name: THROTTLE.default, ttl: seconds(60), limit: 300 },
    /*
     * 10 ครั้งต่อ 5 นาที สำหรับ endpoint ยืนยันตัวตน
     *
     * ตัวล็อกบัญชี (ผิด 5 ครั้ง) กันการเดารหัสของ "บัญชีเดียว" อยู่แล้ว
     * แต่กัน password spraying ไม่ได้ — คือลองรหัสยอดนิยมหนึ่งตัวกับผู้ใช้พันคน
     * ซึ่งไม่ทำให้บัญชีไหนถูกล็อกเลยสักบัญชี
     * ตัวจำกัดตาม IP นี้จึงเป็นชั้นที่กันกรณีนั้นโดยเฉพาะ
     */
    { name: THROTTLE.auth, ttl: seconds(300), limit: 10 },
  ],
};

/**
 * นับอัตราการเรียกรายผู้ใช้เมื่อรู้ว่าเป็นใคร ไม่งั้นนับราย IP
 *
 * ทำไมต้องแยก: ทั้งสำนักงานออกเน็ตผ่าน IP เดียวกัน ถ้านับราย IP อย่างเดียว
 * พนักงานคนที่ 20 ที่เปิดหน้าเว็บจะโดนบล็อกเพราะเพื่อนร่วมงานใช้โควตาไปหมด
 */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    const userId = RequestContextStore.userId();
    if (userId !== undefined) return `user:${userId}`;

    /*
     * ⚠️ req.ip จะเป็น IP ของ nginx ไม่ใช่ของผู้ใช้ ถ้าไม่ตั้ง trust proxy
     *    ผลคือทุกคนใช้โควตาก้อนเดียวกัน แล้วระบบจะบล็อกทั้งบริษัทพร้อมกัน
     *    ค่านี้ตั้งไว้ที่ main.ts ด้วย app.set('trust proxy', ...)
     */
    return `ip:${req.ip ?? 'unknown'}`;
  }
}
