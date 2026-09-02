import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { type Envelope, NO_ENVELOPE, type ResponseMetaDto } from './envelope.dto';
import { RequestContextStore } from './request-context';

/** รูปร่างที่ service คืนมาเมื่อผลลัพธ์แบ่งหน้า */
interface PagedResult {
  items: unknown[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

/**
 * ตรวจว่าผลลัพธ์เป็นหน้าข้อมูลหรือไม่ ด้วยการดูรูปร่าง
 *
 * ตรวจครบทุกฟิลด์และตรวจชนิดด้วย ไม่ใช่แค่ `'items' in value` —
 * ถ้าเช็คหลวม ๆ วันหนึ่งจะมี DTO ที่บังเอิญมีฟิลด์ชื่อ items แล้วถูกแตกซองผิด
 * โดยไม่มีใครสังเกต เพราะมันยังตอบ 200 อยู่
 */
function isPagedResult(value: unknown): value is PagedResult {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.items) &&
    typeof candidate.page === 'number' &&
    typeof candidate.page_size === 'number' &&
    typeof candidate.total === 'number' &&
    typeof candidate.total_pages === 'number'
  );
}

/**
 * ห่อผลลัพธ์ที่สำเร็จทุกอันด้วยซองมาตรฐาน
 *
 * ฝั่ง error ไม่ผ่านตัวนี้ — AllExceptionsFilter ประกอบซองเอง
 * เพราะ interceptor ไม่ได้เห็น exception ที่ filter จัดการไปแล้ว
 * ทั้งสองตัวจึงต้องประกอบซองให้เหมือนกัน และนั่นคือเหตุผลที่ทั้งคู่
 * ใช้ ResponseMetaDto ตัวเดียวกันเป็นสัญญา
 */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(NO_ENVELOPE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    return next.handle().pipe(map((value) => this.wrap(value)));
  }

  private wrap(value: unknown): unknown {
    // 204 No Content — ห่อ body ใส่ response ที่ประกาศว่าไม่มี body ไม่ได้
    if (value === undefined) return value;

    const meta: ResponseMetaDto = {
      request_id: RequestContextStore.requestId() ?? 'unknown',
    };

    if (isPagedResult(value)) {
      // แตกหน้าข้อมูลออก: รายการไปอยู่ที่ data ตัวเลขไปอยู่ที่ meta
      // ฝั่งเรียกจึงวน data ได้ตรง ๆ เหมือน endpoint ที่คืนอาร์เรย์ธรรมดา
      const envelope: Envelope<unknown[]> = {
        success: true,
        data: value.items,
        error: null,
        meta: {
          ...meta,
          page: value.page,
          page_size: value.page_size,
          total: value.total,
          total_pages: value.total_pages,
        },
      };
      return envelope;
    }

    const envelope: Envelope<unknown> = {
      success: true,
      data: value ?? null,
      error: null,
      meta,
    };
    return envelope;
  }
}
