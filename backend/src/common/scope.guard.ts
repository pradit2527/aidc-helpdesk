import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthService, COOKIE } from '../modules/auth/auth.service';
import type { AccessScope } from './scope';
import { ScopeService } from './scope.service';

interface RequestWithScope extends Request {
  scope?: AccessScope;
}

/** เมท็อดที่ไม่เปลี่ยนสถานะ ไม่ต้องตรวจ CSRF */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * ตัวระบุว่า request นี้เป็นของใคร และมีสิทธิ์อะไร
 *
 * ทำสองอย่างที่ต้องอยู่ด้วยกัน
 *   1. อ่านและตรวจ access token จากคุกกี้ httpOnly แล้วประกอบ AccessScope
 *   2. ตรวจ CSRF token สำหรับเมท็อดที่เปลี่ยนสถานะ
 *
 * ข้อ 2 แยกออกไปเป็น guard ต่างหากไม่ได้ เพราะถ้าลืมใส่ตัวใดตัวหนึ่งบน controller
 * จะได้ endpoint ที่ยืนยันตัวตนแล้วแต่เปิดให้เว็บอื่นสั่งงานแทนผู้ใช้ได้
 * ผูกไว้ด้วยกันทำให้ลืมทีละครึ่งไม่ได้
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(
    private readonly scopes: ScopeService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithScope>();

    const userId = await this.resolveUserId(req);
    this.assertCsrf(req);
    req.scope = await this.scopes.forUser(userId);
    return true;
  }

  private async resolveUserId(req: RequestWithScope): Promise<number> {
    const token = req.cookies?.[COOKIE.access] as string | undefined;
    if (token) {
      return this.auth.userIdFromAccessToken(token);
    }

    /*
     * ทางลัดสำหรับ dev เท่านั้น ใช้เมื่อยังไม่ได้ล็อกอินผ่านเบราว์เซอร์
     * เช่นตอนรันเทสต์หรือกดลองใน Swagger
     *
     * ปิดตายบน production — ถ้าเปิดทิ้งไว้ ใครก็สวมเป็นใครก็ได้ด้วย header เดียว
     */
    if (process.env.NODE_ENV !== 'production') {
      const header = req.header('X-Dev-User-Id');
      const devUserId = Number(header);
      if (header && Number.isInteger(devUserId) && devUserId > 0) {
        return devUserId;
      }
    }

    throw new UnauthorizedException({
      error: { code: 'UNAUTHENTICATED', message: 'ກະລຸນາເຂົ້າສູ່ລະບົບກ່ອນ' },
    });
  }

  /**
   * double-submit cookie
   *
   * คุกกี้ถูกแนบไปกับทุกคำขออัตโนมัติ เว็บอื่นจึงสั่งงานแทนผู้ใช้ได้ถ้าไม่กันอะไรเลย
   * แต่เว็บอื่นอ่านคุกกี้ของโดเมนเราไม่ได้ จึงประกอบ header ให้ตรงกับคุกกี้ไม่ได้
   *
   * ข้ามเฉพาะคำขอที่ยืนยันตัวตนด้วย X-Dev-User-Id เพราะนั่นไม่ได้ใช้คุกกี้
   * จึงไม่มีช่องโหว่ CSRF ตั้งแต่ต้น
   */
  private assertCsrf(req: RequestWithScope): void {
    if (SAFE_METHODS.has(req.method)) return;
    if (!req.cookies?.[COOKIE.access]) return;

    const cookieToken = req.cookies?.[COOKIE.csrf] as string | undefined;
    const headerToken = req.header('X-CSRF-Token');

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'ຄຳຂໍບໍ່ຜ່ານການກວດ CSRF — ກະລຸນາໂຫຼດໜ້າໃໝ່ແລ້ວລອງອີກຄັ້ງ',
        },
      });
    }
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
