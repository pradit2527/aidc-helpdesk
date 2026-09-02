/**
 * ลำดับชั้นของ error ที่ชั้นโดเมนและ use case โยนออกมา
 *
 * ทำไมไม่ใช้ HttpException ของ NestJS ตรง ๆ
 *   เพราะชั้นโดเมนไม่ควรรู้ว่ามันถูกเรียกผ่าน HTTP
 *   กฎ "รหัส ticket ซ้ำไม่ได้" เป็นจริงเหมือนกันหมด ไม่ว่าจะถูกเรียกจาก
 *   REST controller, งาน background, หรือสคริปต์ย้ายข้อมูล
 *   ถ้าโดเมนโยน ConflictException ออกมา จะลาก @nestjs/common เข้าไปอยู่ในชั้นที่
 *   ควรเป็น TypeScript ล้วน และเทสต์ก็ต้องบูต Nest ขึ้นมาเพื่อเช็คกฎธุรกิจข้อเดียว
 *
 * AllExceptionsFilter เป็นผู้แปลง error พวกนี้เป็น HTTP status
 * การแมปอยู่ที่เดียวคือ HTTP_STATUS_BY_KIND ด้านล่าง
 */

/** ประเภทของความผิดพลาด ใช้ตัดสิน HTTP status */
export type DomainErrorKind =
  /** ข้อมูลที่ส่งมาไม่ผ่านกฎ → 422 */
  | 'validation'
  /** ไม่ได้ยืนยันตัวตน หรือ token ใช้ไม่ได้ → 401 */
  | 'unauthenticated'
  /** ยืนยันตัวตนแล้วแต่ไม่มีสิทธิ์ → 403 */
  | 'forbidden'
  /** ไม่พบสิ่งที่อ้างถึง หรืออยู่นอกขอบเขตที่มองเห็น → 404 */
  | 'not_found'
  /** ชนกับสถานะปัจจุบัน เช่น รหัสซ้ำ หรือเปลี่ยนสถานะข้ามขั้น → 409 */
  | 'conflict'
  /** ทำไม่ได้เพราะสถานะของทรัพยากรเอง เช่น บัญชีถูกล็อก → 423 */
  | 'locked'
  /** เรียกถี่เกินกำหนด → 429 */
  | 'rate_limited';

const HTTP_STATUS_BY_KIND: Record<DomainErrorKind, number> = {
  validation: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  locked: 423,
  rate_limited: 429,
};

export interface FieldIssue {
  field: string;
  message: string;
}

export interface DomainErrorOptions {
  /** รหัสคงที่ที่ frontend ใช้ตัดสินใจ เช่น TICKET_NOT_FOUND — ห้ามเปลี่ยนเมื่อประกาศแล้ว */
  code: string;
  /** ข้อความภาษาลาวที่แสดงผู้ใช้ได้ทันที ห้ามใส่รายละเอียดภายในระบบ */
  message: string;
  kind: DomainErrorKind;
  /** ข้อผิดพลาดรายฟิลด์ สำหรับให้ฟอร์มไฮไลต์ช่องที่ผิด */
  issues?: FieldIssue[];
  /** ข้อมูลช่วยดีบัก จะถูกเขียนลง log เท่านั้น ไม่ถูกส่งกลับหาผู้เรียก */
  debug?: Record<string, unknown>;
  cause?: unknown;
}

export class DomainError extends Error {
  readonly code: string;
  readonly kind: DomainErrorKind;
  readonly issues: FieldIssue[];
  readonly debug: Record<string, unknown>;

  constructor(options: DomainErrorOptions) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = options.code;
    this.kind = options.kind;
    this.issues = options.issues ?? [];
    this.debug = options.debug ?? {};
    Error.captureStackTrace?.(this, new.target);
  }

  get httpStatus(): number {
    return HTTP_STATUS_BY_KIND[this.kind];
  }
}

/*
 * ตัวช่วยสร้าง error ที่ใช้บ่อย
 *
 * มีไว้เพื่อให้ทุกคนเรียกแบบเดียวกัน ไม่ใช่เพื่อบังคับว่าต้องใช้ —
 * เคสที่ต้องการ code เฉพาะทางให้ new DomainError ตรง ๆ ได้
 */

export class NotFoundError extends DomainError {
  constructor(code: string, message: string, debug?: Record<string, unknown>) {
    super({ code, message, kind: 'not_found', ...(debug ? { debug } : {}) });
  }
}

export class ConflictError extends DomainError {
  constructor(code: string, message: string, debug?: Record<string, unknown>) {
    super({ code, message, kind: 'conflict', ...(debug ? { debug } : {}) });
  }
}

export class ForbiddenError extends DomainError {
  constructor(code: string, message: string, debug?: Record<string, unknown>) {
    super({ code, message, kind: 'forbidden', ...(debug ? { debug } : {}) });
  }
}

export class ValidationError extends DomainError {
  constructor(code: string, message: string, issues?: FieldIssue[]) {
    super({ code, message, kind: 'validation', ...(issues ? { issues } : {}) });
  }
}

/** ตรวจว่า error ที่จับได้มาจากชั้นโดเมนของเราหรือมาจากที่อื่น */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
