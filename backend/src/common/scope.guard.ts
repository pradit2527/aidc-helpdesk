import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AccessScope } from './scope';
import { ScopeService } from './scope.service';

/** ผูก AccessScope ไว้กับ request หนึ่งครั้ง แล้วให้ controller หยิบไปใช้ */
interface RequestWithScope extends Request {
  scope?: AccessScope;
}

/**
 * ตัวระบุว่า request นี้เป็นของใคร
 *
 * ⚠️ ยังไม่ได้ตรวจคุกกี้ aidc_at จริง เพราะยังไม่ได้เขียนชั้น auth
 *    ระหว่างนี้จึงอ่านผู้ใช้จาก DEV_USER_ID ซึ่ง **ใช้ได้เฉพาะนอก production**
 *    และโยน 401 ทันทีถ้ามีคนพยายามรันแบบนี้บน production
 *
 *    การเปิดทางลัดไว้เงียบ ๆ โดยไม่กั้น NODE_ENV คือวิธีที่ระบบหลุดขึ้น
 *    production พร้อมรูรับ user id จาก header ได้จริง จึงกั้นไว้ตั้งแต่ตอนนี้
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly scopes: ScopeService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithScope>();

    const userId = this.resolveUserId(req);
    req.scope = await this.scopes.forUser(userId);
    return true;
  }

  private resolveUserId(req: RequestWithScope): number {
    // TODO(auth): อ่านและตรวจลายเซ็นของคุกกี้ aidc_at แล้วดึง sub ออกมาแทนบล็อกนี้
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'ຍັງບໍ່ໄດ້ຕິດຕັ້ງລະບົບຢືນຢັນຕົວຕົນ',
        },
      });
    }

    /*
     * ต้องส่ง header มาทุกครั้ง ไม่มีค่าตั้งต้นจากตัวแปรสภาพแวดล้อม
     *
     * เคยรับ DEV_USER_ID เป็นค่าสำรอง แต่ผลคือทุก request ที่ไม่ระบุตัวตน
     * กลายเป็นผู้ใช้คนนั้นเงียบ ๆ เท่ากับ API ไม่มีการยืนยันตัวตนเลยตอน dev
     * ซึ่งทำให้เขียนโค้ดที่ลืมส่งตัวตนไปได้โดยไม่มีอะไรฟ้อง
     * แล้วไปพังตอนต่อ auth จริง — ให้ล้มตั้งแต่ตอนนี้ดีกว่า
     */
    const header = req.header('X-Dev-User-Id');
    const devUserId = Number(header);
    if (!header || !Number.isInteger(devUserId) || devUserId <= 0) {
      throw new UnauthorizedException({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'ຕ້ອງສົ່ງ header X-Dev-User-Id ໃນໂໝດພັດທະນາ',
        },
      });
    }
    return devUserId;
  }
}

/** `@CurrentScope() scope: AccessScope` ในพารามิเตอร์ของ controller */
export const CurrentScope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessScope => {
    const req = context.switchToHttp().getRequest<RequestWithScope>();
    if (!req.scope) {
      // เกิดได้กรณีเดียวคือลืมใส่ ScopeGuard บน controller นั้น
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'ບໍ່ພົບຂອບເຂດສິດຂອງຜູ້ໃຊ້' },
      });
    }
    return req.scope;
  },
);
