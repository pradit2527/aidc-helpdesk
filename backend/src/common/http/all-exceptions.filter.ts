import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { DomainError, isDomainError } from '../errors/domain-error';
import type { Envelope, ErrorDetailDto } from './envelope.dto';
import { RequestContextStore } from './request-context';

/** ข้อความที่ส่งออกไปเมื่อเกิดข้อผิดพลาดที่เราไม่ได้คาดไว้ */
const GENERIC_MESSAGE = 'ເກີດຂໍ້ຜິດພາດພາຍໃນລະບົບ ກະລຸນາລອງໃໝ່ ຫຼື ແຈ້ງ Service Desk';

/** สถานะที่ถือว่าเป็นความผิดของผู้เรียก ไม่ใช่ของระบบ — log เป็น warn ไม่ใช่ error */
const CLIENT_ERROR_FLOOR = 400;
const SERVER_ERROR_FLOOR = 500;

interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details?: ErrorDetailDto[];
  /** รายละเอียดที่เขียนลง log เท่านั้น ไม่ส่งออกไปหาผู้เรียก */
  logDetail?: Record<string, unknown>;
}

/**
 * ด่านสุดท้ายของ error ทุกชนิดในระบบ
 *
 * หน้าที่สำคัญที่สุดคือ **ไม่ปล่อยรายละเอียดภายในออกไปหาผู้เรียก**
 * ข้อความอย่าง "duplicate key value violates unique constraint ticket_ticket_no_key"
 * บอกผู้โจมตีทั้งชื่อตาราง ชื่อคอลัมน์ และชนิดฐานข้อมูลในบรรทัดเดียว
 *
 * หลักการที่ยึด: อะไรที่เราตั้งใจโยน (DomainError, HttpException) ส่งข้อความจริงออกไปได้
 * อะไรที่หลุดมาโดยไม่ได้ตั้งใจ ส่งข้อความกลาง ๆ ออกไปแล้วเก็บของจริงไว้ใน log
 * โดยผูกกับ request_id เดียวกัน เพื่อให้ทีมหาเจอจากที่ผู้ใช้แจ้งมา
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();

    const normalized = this.normalize(exception);
    const requestId = RequestContextStore.requestId() ?? 'unknown';

    this.log(exception, normalized, req, requestId);

    const envelope: Envelope<null> = {
      success: false,
      data: null,
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details ? { details: normalized.details } : {}),
      },
      meta: { request_id: requestId },
    };

    // ตั้ง header ก่อนเสมอ เพื่อให้ผู้ใช้ที่เจอ 500 ยังมีรหัสไปแจ้ง Service Desk ได้
    res.setHeader('X-Request-Id', requestId);
    res.status(normalized.status).json(envelope);
  }

  private normalize(exception: unknown): NormalizedError {
    if (isDomainError(exception)) {
      return this.fromDomainError(exception);
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    // ที่เหลือคือของที่ไม่ได้ตั้งใจให้เกิด — บั๊ก, DB ล่ม, สมมติฐานที่ผิด
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: GENERIC_MESSAGE,
      logDetail: {
        thrown:
          exception instanceof Error
            ? { name: exception.name, message: exception.message }
            : { raw: String(exception) },
      },
    };
  }

  private fromDomainError(error: DomainError): NormalizedError {
    return {
      status: error.httpStatus,
      code: error.code,
      message: error.message,
      ...(error.issues.length > 0 ? { details: error.issues } : {}),
      ...(Object.keys(error.debug).length > 0 ? { logDetail: error.debug } : {}),
    };
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();
    const payload = exception.getResponse();

    if (typeof payload === 'object' && payload !== null) {
      const body = payload as Record<string, unknown>;

      /*
       * รูปแบบที่โค้ดเดิมใช้: throw new UnauthorizedException({ error: { code, message } })
       * รองรับไว้เพื่อให้ย้ายมาใช้ DomainError ได้ทีละส่วนโดยไม่ต้องหยุดทั้งระบบ
       */
      const nested = body.error;
      if (typeof nested === 'object' && nested !== null) {
        const inner = nested as Record<string, unknown>;
        if (typeof inner.code === 'string' && typeof inner.message === 'string') {
          return {
            status,
            code: inner.code,
            message: inner.message,
            ...(Array.isArray(inner.details)
              ? { details: inner.details as ErrorDetailDto[] }
              : {}),
          };
        }
      }

      /*
       * ValidationPipe โยน BadRequestException ที่ message เป็นอาร์เรย์ของข้อความ
       * แปลงเป็น details รายฟิลด์ เพื่อให้ฟอร์มไฮไลต์ช่องที่ผิดได้
       *
       * ใช้ 400 ไม่ใช่ 422 โดยตั้งใจ — ตรงนี้คือ "รูปร่างคำขอผิด" (ฟิลด์เกิน ชนิดผิด)
       * ส่วน 422 สงวนไว้ให้ "รูปร่างถูกแต่ผิดกฎธุรกิจ" ซึ่งมาจาก DomainError
       */
      if (Array.isArray(body.message)) {
        return {
          status,
          code: 'VALIDATION_ERROR',
          message: 'ຂໍ້ມູນທີ່ສົ່ງມາບໍ່ຖືກຕ້ອງ',
          details: body.message.map((line) => this.toFieldIssue(String(line))),
        };
      }

      if (typeof body.message === 'string') {
        return { status, code: this.codeForStatus(status), message: body.message };
      }
    }

    if (typeof payload === 'string') {
      return { status, code: this.codeForStatus(status), message: payload };
    }

    return { status, code: this.codeForStatus(status), message: GENERIC_MESSAGE };
  }

  /**
   * class-validator คืนข้อความอย่าง "subject should not be empty"
   * ตัดคำแรกมาเป็นชื่อฟิลด์ — ไม่แม่นยำเสมอไปแต่ช่วยฟอร์มได้จริง
   * และดีกว่าโยนอาร์เรย์ข้อความดิบให้ frontend ไปแยกเอง
   */
  private toFieldIssue(line: string): ErrorDetailDto {
    const [first] = line.split(' ');
    return { field: first ?? '', message: line };
  }

  private codeForStatus(status: number): string {
    const known: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHENTICATED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      405: 'METHOD_NOT_ALLOWED',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      415: 'UNSUPPORTED_MEDIA_TYPE',
      422: 'VALIDATION_ERROR',
      423: 'LOCKED',
      429: 'RATE_LIMITED',
      503: 'SERVICE_UNAVAILABLE',
    };
    return known[status] ?? (status >= SERVER_ERROR_FLOOR ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  }

  private log(
    exception: unknown,
    normalized: NormalizedError,
    req: Request,
    requestId: string,
  ): void {
    const base = {
      request_id: requestId,
      user_id: RequestContextStore.userId() ?? null,
      method: req.method,
      // path ไม่ใช่ originalUrl — query string อาจมีคำค้นที่เป็นข้อมูลส่วนบุคคล
      path: req.path,
      status: normalized.status,
      code: normalized.code,
      ...(normalized.logDetail ?? {}),
    };

    if (normalized.status >= SERVER_ERROR_FLOOR) {
      // เฉพาะ 5xx เท่านั้นที่เก็บ stack — 4xx เป็นเรื่องปกติของระบบที่มีผู้ใช้จริง
      // ถ้าเก็บ stack ทุก 401 log จะเต็มไปด้วยเสียงรบกวนจน 500 จริงหาไม่เจอ
      this.logger.error(base, exception instanceof Error ? exception.stack : undefined);
    } else if (normalized.status >= CLIENT_ERROR_FLOOR) {
      this.logger.warn(base);
    }
  }
}
