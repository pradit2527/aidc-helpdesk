/**
 * ตัวเรียก API ตัวเดียวของทั้งระบบ
 *
 * ยึดกติกาสองข้อจาก docs/20-frontend-architecture.md §4
 *   1. token อยู่ในคุกกี้ httpOnly เท่านั้น — ไม่มี Authorization: Bearer
 *      และไม่มีอะไรเกี่ยวกับ token ใน localStorage เลย
 *      โค้ด JS อ่าน access token ไม่ได้ XSS จึงขโมยไปใช้ต่อไม่ได้
 *   2. คุกกี้ถูกส่งอัตโนมัติ จึงต้องกัน CSRF ด้วย double-submit
 *      อ่าน aidc_csrf (คุกกี้ที่ JS อ่านได้) แล้วส่งซ้ำใน X-CSRF-Token
 *      เว็บอื่นอ่านคุกกี้ของเราไม่ได้ จึงประกอบ header นี้ไม่ได้
 */

/**
 * เส้นทางสัมพัทธ์เสมอ — next.config.ts ส่งต่อ /api/v1/* ไปยัง backend ให้
 * ทุกคำขอจึงเป็น same-origin ทั้งตอน dev และ production
 * ซึ่งเป็นเงื่อนไขที่ทำให้คุกกี้ httpOnly + SameSite=Lax ใช้งานได้จริง
 */
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

/** ชื่อรหัสข้อผิดพลาดที่ API ใช้ — ตรงกับ docs/03-api-spec.md §2.4 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ACCOUNT_LOCKED'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'SELF_APPROVAL_FORBIDDEN'
  | 'WORKAROUND_REQUIRES_PROBLEM'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    /** ข้อความรายฟิลด์สำหรับผูกกลับเข้าฟอร์ม */
    readonly fields?: Record<string, string>,
    readonly retryAfterSeconds?: number,
    /**
     * รหัสอ้างอิงคำขอ ตรงกับ log ฝั่งเซิร์ฟเวอร์
     * แสดงให้ผู้ใช้เห็นตอนเกิด 500 เพื่อให้แจ้ง Service Desk ได้ตรงเรื่อง
     */
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * ซองมาตรฐานที่ backend ตอบกลับทุก endpoint
 * ดู backend/src/common/http/envelope.dto.ts
 */
interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: { code?: string; message?: string; details?: { field: string; message: string }[] } | null;
  meta: PageMeta;
}

export interface PageMeta {
  request_id: string;
  page?: number;
  page_size?: number;
  total?: number;
  total_pages?: number;
}

/** ผลลัพธ์ของ endpoint ที่แบ่งหน้า — รายการกับตัวเลขแยกกันคนละที่ในซอง */
export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

/** ข้อความที่ผู้ใช้อ่านแล้วรู้ว่าต้องทำอะไรต่อ ไม่ใช่ชื่อรหัสดิบ */
const FALLBACK_MESSAGE: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: 'ຂໍ້ມູນທີ່ກອກຍັງບໍ່ຖືກຕ້ອງ ກະລຸນາກວດຄືນ',
  UNAUTHENTICATED: 'ເຊດຊັນໝົດອາຍຸແລ້ວ ກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່',
  FORBIDDEN: 'ທ່ານບໍ່ມີສິດເຮັດລາຍການນີ້',
  NOT_FOUND: 'ບໍ່ພົບຂໍ້ມູນທີ່ຕ້ອງການ',
  CONFLICT: 'ຂໍ້ມູນຖືກແກ້ໄຂໄປແລ້ວ ກະລຸນາໂຫຼດໜ້າໃໝ່',
  ACCOUNT_LOCKED: 'ບັນຊີຖືກລັອກຊົ່ວຄາວ',
  PASSWORD_CHANGE_REQUIRED: 'ຕ້ອງປ່ຽນລະຫັດຜ່ານກ່ອນໃຊ້ງານ',
  SELF_APPROVAL_FORBIDDEN: 'ຜູ້ຂໍອະນຸມັດຄຳຂໍຂອງຕົນເອງບໍ່ໄດ້',
  WORKAROUND_REQUIRES_PROBLEM: 'ຕ້ອງເປີດ Problem ກ່ອນຈຶ່ງບັນທຶກທາງແກ້ຊົ່ວຄາວໄດ້',
  RATE_LIMITED: 'ສົ່ງຄຳຂໍຖີ່ເກີນໄປ ກະລຸນາລໍຖ້າຄາວໜຶ່ງ',
  SERVER_ERROR: 'ລະບົບຂັດຂ້ອງ ກະລຸນາລອງໃໝ່ອີກຄັ້ງ',
  NETWORK_ERROR: 'ເຊື່ອມຕໍ່ເຊີບເວີບໍ່ໄດ້ ກະລຸນາກວດອິນເຕີເນັດ',
};

function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)aidc_csrf=([^;]*)/);
  const value = match?.[1];
  return value === undefined ? null : decodeURIComponent(value);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | undefined;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null> | undefined;
  signal?: AbortSignal | undefined;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    // ค่าว่างไม่ใช่ตัวกรอง — ส่งไปจะกลายเป็นเงื่อนไข "เท่ากับสตริงว่าง" ที่ backend
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${BASE_URL}${path}?${search}` : `${BASE_URL}${path}`;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  // GET/HEAD ไม่เปลี่ยนสถานะ จึงไม่ต้องมี CSRF token
  if (method !== 'GET') {
    const csrf = readCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const init: RequestInit = {
    method,
    headers,
    // credentials: 'include' คือหัวใจของ auth แบบคุกกี้
    // ถ้าลืมใส่ คำขอจะไม่แนบคุกกี้และได้ 401 ทุกครั้งโดยไม่มีร่องรอย
    credentials: 'include',
  };
  // ใส่คีย์เฉพาะเมื่อมีค่าจริง เพราะ tsconfig เปิด exactOptionalPropertyTypes
  // การส่ง body: undefined ไม่เท่ากับการไม่ส่ง body
  if (body !== undefined) init.body = JSON.stringify(body);
  if (signal) init.signal = signal;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, 'NETWORK_ERROR', FALLBACK_MESSAGE.NETWORK_ERROR);
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as Envelope<T> | null;
  const requestId = payload?.meta?.request_id ?? response.headers.get('X-Request-Id') ?? undefined;

  if (!response.ok) {
    const error = payload?.error ?? {};
    const code = (error.code as ApiErrorCode) ?? statusToCode(response.status);
    throw new ApiError(
      response.status,
      code,
      error.message || FALLBACK_MESSAGE[code] || FALLBACK_MESSAGE.SERVER_ERROR,
      toFieldMap(error.details),
      Number(response.headers.get('Retry-After')) || undefined,
      requestId,
    );
  }

  // แกะซองออกให้ผู้เรียก เพื่อให้โค้ดหน้าจอไม่ต้องเขียน .data ทุกที่
  // ถ้าปล่อยให้แกะเอง วันหนึ่งจะมีคนลืมแล้วได้ undefined ตอน runtime
  return (payload?.data ?? null) as T;
}

/**
 * เรียก endpoint ที่แบ่งหน้า แล้วประกอบรายการกับตัวเลขกลับเป็นก้อนเดียว
 *
 * backend แยกไว้คนละที่โดยตั้งใจ (data เป็นอาร์เรย์ · meta เป็นตัวเลข)
 * แต่ฝั่งหน้าจอใช้คู่กันเสมอ จึงรวมให้ตรงนี้ที่เดียว
 */
export async function apiRequestPage<T>(
  path: string,
  options: RequestOptions = {},
): Promise<Page<T>> {
  const { method = 'GET', body, query, signal } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const init: RequestInit = { method, headers, credentials: 'include' };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (signal) init.signal = signal;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, 'NETWORK_ERROR', FALLBACK_MESSAGE.NETWORK_ERROR);
  }

  const payload = (await response.json().catch(() => null)) as Envelope<T[]> | null;
  const requestId = payload?.meta?.request_id ?? response.headers.get('X-Request-Id') ?? undefined;

  if (!response.ok) {
    const error = payload?.error ?? {};
    const code = (error.code as ApiErrorCode) ?? statusToCode(response.status);
    throw new ApiError(
      response.status,
      code,
      error.message || FALLBACK_MESSAGE[code] || FALLBACK_MESSAGE.SERVER_ERROR,
      toFieldMap(error.details),
      Number(response.headers.get('Retry-After')) || undefined,
      requestId,
    );
  }

  const meta = payload?.meta ?? { request_id: '' };
  const items = payload?.data ?? [];
  return {
    items,
    page: meta.page ?? 1,
    page_size: meta.page_size ?? items.length,
    total: meta.total ?? items.length,
    total_pages: meta.total_pages ?? 1,
  };
}

/**
 * แปลง details ของ backend เป็นแมปที่ฟอร์มผูกกลับเข้าช่องได้ทันที
 * เก็บข้อความแรกของแต่ละฟิลด์ เพราะช่องกรอกหนึ่งช่องแสดงได้ทีละข้อความ
 */
function toFieldMap(
  details: { field: string; message: string }[] | undefined,
): Record<string, string> | undefined {
  if (!details?.length) return undefined;
  const map: Record<string, string> = {};
  for (const { field, message } of details) {
    if (field && !(field in map)) map[field] = message;
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

function statusToCode(status: number): ApiErrorCode {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422) return 'VALIDATION_ERROR';
  if (status === 423) return 'ACCOUNT_LOCKED';
  if (status === 429) return 'RATE_LIMITED';
  return 'SERVER_ERROR';
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => apiRequest<T>(path, { query }),
  /** สำหรับ endpoint ที่แบ่งหน้า — คืน items พร้อมตัวเลขหน้าในก้อนเดียว */
  page: <T>(path: string, query?: RequestOptions['query']) => apiRequestPage<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};
