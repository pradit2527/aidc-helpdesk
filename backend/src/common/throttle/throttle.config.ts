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
} as const;

/**
 * ตั้งค่าอัตราการเรียก
 *
 * ตัวเลขตั้งจากการใช้งานจริงที่คาดไว้ ไม่ได้ตั้งลอย ๆ:
 * หน้า dashboard ยิงราว 6 คำขอตอนเปิด และผู้ใช้เปิดหน้าใหม่ทุกไม่กี่วินาที
 * 300 ครั้ง/นาที จึงกว้างพอสำหรับคนทำงานเร็ว แต่ยังตัดสคริปต์ที่ยิงรัวได้
 */
export const throttleConfig: ThrottlerModuleOptions = {
  /*
   * ⚠️ ประกาศ throttler ตัวเดียวโดยตั้งใจ
   *
   * ใน @nestjs/throttler v6 ทุก throttler ที่ประกาศไว้จะมีผลกับ "ทุก" route
   * ไม่ใช่เฉพาะ route ที่อ้างชื่อมันด้วย @Throttle
   * เคยประกาศตัวชื่อ auth ที่ 10 ครั้ง/5 นาทีไว้ด้วย ผลคือทั้งระบบถูกจำกัด
   * ไว้ที่ 10 คำขอต่อ 5 นาที ซึ่งจับได้เพราะเทสต์ที่เคยผ่านกลายเป็น 429 ยกชุด
   *
   * วิธีที่ถูกคือทับค่าของ throttler เดิมเป็นราย route ด้วย
   * @Throttle({ default: { limit, ttl } })
   */
  throttlers: [{ name: THROTTLE.default, ttl: seconds(60), limit: 300 }],
};

/**
 * ค่าจำกัดสำหรับ endpoint ยืนยันตัวตน ใช้กับ @Throttle() ราย route
 *
 * ตัวล็อกบัญชี (ผิด 5 ครั้ง) กันการเดารหัสของ "บัญชีเดียว" อยู่แล้ว
 * แต่กัน password spraying ไม่ได้ — คือลองรหัสยอดนิยมหนึ่งตัวกับผู้ใช้พันคน
 * ซึ่งไม่ทำให้บัญชีไหนถูกล็อกเลยสักบัญชี ชั้นนี้จึงกันกรณีนั้นโดยเฉพาะ
 *
 * ตั้งอายุหน้าต่างผ่าน env ได้ เพื่อให้ชุดทดสอบไม่ต้องรอ 5 นาที
 * ต่อการรันหนึ่งครั้ง — ค่าเริ่มต้นยังเป็น 5 นาทีเสมอ
 */
const AUTH_WINDOW_SECONDS = Number(process.env.AUTH_THROTTLE_TTL_SECONDS ?? 300);

export const AUTH_THROTTLE = {
  login: { limit: 10, ttl: seconds(AUTH_WINDOW_SECONDS) },
  refresh: { limit: 30, ttl: seconds(AUTH_WINDOW_SECONDS) },
  changePassword: { limit: 5, ttl: seconds(AUTH_WINDOW_SECONDS) },
} as const;

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
