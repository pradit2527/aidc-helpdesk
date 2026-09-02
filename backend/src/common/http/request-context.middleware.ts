import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { RequestContextStore, resolveRequestId } from './request-context';

/**
 * เปิดบริบทของคำขอ และตอบ request id กลับไปใน header
 *
 * ต้องเป็น middleware ไม่ใช่ interceptor เพราะ interceptor ทำงาน "หลัง" guard
 * ถ้าใช้ interceptor คำขอที่ถูก guard ปฏิเสธจะไม่มี request id เลย
 * ซึ่งคือกรณีที่ต้องการ trace มากที่สุดกรณีหนึ่ง
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req.header('X-Request-Id'));

    // ตอบกลับทันทีไม่รอจบคำขอ เพื่อให้ client มีรหัสไว้อ้างอิงแม้คำขอจะพังกลางทาง
    res.setHeader('X-Request-Id', requestId);

    RequestContextStore.run({ requestId, startedAt: process.hrtime.bigint() }, () => {
      next();
    });
  }
}
