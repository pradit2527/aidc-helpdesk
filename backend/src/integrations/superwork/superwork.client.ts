import type { SuperworkConfig } from './superwork.config';

/**
 * ตัวเรียก Partner Workboard API ของ Super Work
 *
 * เขียนเองด้วย fetch แทนการลากไลบรารี HTTP เข้ามา — มีสองเส้นทางที่ใช้จริง
 * และกฎการลองใหม่ที่ต้องเขียนเองอยู่ดีเพราะเป็นกฎเฉพาะของ API นี้
 *
 * ⚠️ ตัวนี้ไม่รู้จัก ticket และไม่ควรรู้ — รับ payload สำเร็จรูปมายิงอย่างเดียว
 *    การแปลง ticket เป็น task อยู่ที่ service ชั้นบน
 */

export interface SuperworkTaskPayload {
  activityId: string;
  cardId: string;
  title: string;
  members: string[];
  description?: string;
  priorityStatus?: string;
  dueDate?: string;
  point?: number;
  checkers?: string[];
  subItems?: { title: string }[];
}

export interface SuperworkTask {
  id: string;
  title: string;
  point?: number;
  priorityStatus?: string;
  dueDate?: string | null;
  idempotentReplay?: boolean;
}

export class SuperworkApiError extends Error {
  constructor(
    readonly status: number,
    /** รหัสที่เอกสารบอกให้ตัดสินใจจากตัวนี้ ไม่ใช่จาก message */
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SuperworkApiError';
  }
}

/** รหัสที่ลองใหม่แล้วมีโอกาสสำเร็จ — นอกจากนี้คือลองกี่ครั้งก็ได้ผลเดิม */
const RETRYABLE_CODES = new Set(['activity_busy', 'internal_error']);
const MAX_ATTEMPTS = 3;
/** เอกสารบอกว่า activity_busy ให้รอ ~200ms แล้วลองใหม่ */
const BUSY_BACKOFF_MS = 200;
/** กันการรอตามคำสั่ง Retry-After ที่ยาวจนคำขอของผู้ใช้ค้าง */
const MAX_RETRY_AFTER_MS = 3000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class SuperworkClient {
  constructor(private readonly config: SuperworkConfig) {}

  /**
   * สร้าง task
   *
   * idempotencyKey ต้องเป็นค่าที่ผูกกับต้นเรื่องฝั่งเรา (เลขที่ ticket) ไม่ใช่ค่าสุ่ม —
   * ถ้า timeout ระหว่างทาง Super Work อาจสร้างไปแล้ว การยิงซ้ำด้วยคีย์เดิม
   * จะได้ task เดิมกลับมาแทนที่จะได้ใบซ้ำที่ต้องมีคนตามลบ
   */
  async createTask(
    payload: SuperworkTaskPayload,
    idempotencyKey: string,
  ): Promise<SuperworkTask> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const { body, status, retryAfterMs } = await this.post(payload, idempotencyKey);

        if (status === 200 || status === 201) {
          return (body as { task: SuperworkTask }).task;
        }

        const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
        const code = error?.code ?? `http_${status}`;
        const apiError = new SuperworkApiError(status, code, error?.message ?? `HTTP ${status}`);

        const canRetry =
          attempt < MAX_ATTEMPTS && (RETRYABLE_CODES.has(code) || status === 429 || status >= 500);
        if (!canRetry) throw apiError;

        lastError = apiError;
        await sleep(status === 429 ? (retryAfterMs ?? MAX_RETRY_AFTER_MS) : BUSY_BACKOFF_MS);
      } catch (err) {
        // ข้อผิดพลาดที่ตัดสินแล้วว่าไม่ควรลองใหม่ ต้องโยนออกทันที ไม่วนต่อ
        if (err instanceof SuperworkApiError) throw err;
        // เน็ตสะดุดหรือหมดเวลา — ลองใหม่ได้ เพราะ idempotency key กันของซ้ำให้แล้ว
        lastError = err;
        if (attempt === MAX_ATTEMPTS) break;
        await sleep(BUSY_BACKOFF_MS * attempt);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('ຕິດຕໍ່ Super Work ບໍ່ໄດ້');
  }

  private async post(
    payload: SuperworkTaskPayload,
    idempotencyKey: string,
  ): Promise<{ status: number; body: unknown; retryAfterMs: number | undefined }> {
    /*
     * ต้องมีเพดานเวลาเสมอ — fetch ไม่มี timeout ในตัว คำขอที่ค้างจะถือ event loop
     * ไว้จนกว่า TCP จะยอมแพ้เอง ซึ่งนานกว่าที่ผู้ใช้จะรอไหวมาก
     */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const res = await fetch(`${this.config.baseUrl}/tasks`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.config.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const retryAfter = Number(res.headers.get('Retry-After') ?? '');
      return {
        status: res.status,
        body: await res.json().catch(() => null),
        retryAfterMs: Number.isFinite(retryAfter)
          ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
          : undefined,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
