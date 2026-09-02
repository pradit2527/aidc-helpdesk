import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * บริบทของคำขอหนึ่งครั้ง ที่โค้ดชั้นล่างอ่านได้โดยไม่ต้องรับ req ส่งต่อกันเป็นทอด
 *
 * ทำไมต้องใช้ AsyncLocalStorage แทนการส่ง req ลงไปเป็นพารามิเตอร์
 *   ถ้าส่งต่อกันเอง ทุก method ตั้งแต่ controller ถึง repository ต้องมีพารามิเตอร์
 *   ที่ไม่เกี่ยวกับหน้าที่ตัวเองเลย เพียงเพื่อพา trace_id ลงไปให้ log
 *   สุดท้ายจะมีคนลืมส่ง แล้ว log แถวนั้นก็ขาด trace_id ไปเงียบ ๆ
 *
 * ราคาที่จ่ายคือ AsyncLocalStorage เป็น global state ที่มองไม่เห็นจากลายเซ็นฟังก์ชัน
 * จึงจำกัดไว้แค่ข้อมูลสำหรับ "สังเกตการณ์" เท่านั้น
 * ⚠️ ห้ามเอา userId ในนี้ไปตัดสินสิทธิ์เด็ดขาด — เรื่องสิทธิ์ต้องผ่าน AccessScope
 *    ที่ ScopeGuard ประกอบขึ้นและส่งเข้า handler อย่างชัดแจ้งเท่านั้น
 */
export interface RequestContext {
  /** ตรงกับ header X-Request-Id ที่ตอบกลับ และกับทุกบรรทัดใน log ของคำขอนี้ */
  readonly requestId: string;
  /** เติมทีหลังโดย ScopeGuard เมื่อรู้แล้วว่าใครเป็นคนเรียก */
  userId?: number;
  /** เอาไว้คิดเวลาที่ใช้ตอบ ใช้หน่วยเดียวกับ process.hrtime */
  readonly startedAt: bigint;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** รูปแบบ request id ที่ยอมรับจากภายนอก — กัน log injection ด้วยการจำกัดอักขระ */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

export const RequestContextStore = {
  /** เริ่มบริบทใหม่ครอบการทำงานของคำขอหนึ่งครั้ง */
  run<T>(context: RequestContext, fn: () => T): T {
    return storage.run(context, fn);
  },

  get(): RequestContext | undefined {
    return storage.getStore();
  },

  requestId(): string | undefined {
    return storage.getStore()?.requestId;
  },

  userId(): number | undefined {
    return storage.getStore()?.userId;
  },

  /**
   * ผูกผู้ใช้เข้ากับบริบท เรียกจาก ScopeGuard หลังตรวจ token ผ่านแล้ว
   * ถ้าเรียกนอกบริบทจะไม่ทำอะไร ไม่โยน error เพราะ log ไม่ควรทำให้คำขอล้ม
   */
  setUserId(userId: number): void {
    const context = storage.getStore();
    if (context) context.userId = userId;
  },
};

/**
 * รับ request id ที่ reverse proxy หรือ service ต้นทางส่งมา ถ้าไม่มีจึงสร้างใหม่
 *
 * การรับค่าจากภายนอกทำให้ trace เดียวต่อกันได้ตลอดสายเมื่อมีหลาย service
 * แต่ต้องตรวจรูปแบบก่อนเสมอ เพราะค่านี้จะถูกเขียนลง log —
 * ถ้าปล่อยให้ใส่ newline ได้ ผู้โจมตีจะปลอมบรรทัด log ขึ้นมาเองได้
 */
export function resolveRequestId(incoming: string | undefined): string {
  if (incoming && SAFE_REQUEST_ID.test(incoming)) return incoming;
  return randomUUID();
}
