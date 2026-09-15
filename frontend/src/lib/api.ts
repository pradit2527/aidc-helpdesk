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
  /**
   * จำนวนที่ยังไม่อ่าน — มีเฉพาะ GET /notifications
   *
   * นับจากทั้งหมด ไม่ใช่จากหน้าปัจจุบัน จึงใช้เป็นตัวเลขบนกระดิ่งได้ตรง ๆ
   * โดยไม่ต้องดึงทุกหน้ามานับเอง
   */
  unread?: number;
}

/** ผลลัพธ์ของ endpoint ที่แบ่งหน้า — รายการกับตัวเลขแยกกันคนละที่ในซอง */
export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  unread?: number;
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

export function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)aidc_csrf=([^;]*)/);
  const value = match?.[1];
  return value === undefined ? null : decodeURIComponent(value);
}

/**
 * ยิงเมื่อ session หมดจริง คือต่ออายุไม่สำเร็จแล้ว — SessionProvider ฟังแล้วพาไปหน้าล็อกอิน
 */
export const SESSION_EXPIRED_EVENT = 'aidc:session-expired';

/**
 * เส้นทางที่ห้ามลองต่ออายุเมื่อได้ 401
 *
 * login ได้ 401 แปลว่ารหัสผิด ไม่ใช่ session หมด — ถ้าไปต่ออายุให้ ข้อความ "รหัสผิด"
 * จะถูกกลบ ส่วน refresh เองได้ 401 แล้วต่ออายุซ้ำจะวนไม่รู้จบ
 */
const NO_REFRESH_PATHS = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);

let refreshing: Promise<boolean> | null = null;

/**
 * ต่ออายุ session ด้วย refresh token (อายุ 7 วัน)
 *
 * ⚠️ นี่คือเหตุที่ผู้ใช้เคยถูกเด้งไปหน้าล็อกอินทุก 30 นาที
 *    access token หมดอายุใน 30 นาที แต่ไม่มีโค้ดไหนเรียก /auth/refresh เลย
 *    refresh token 7 วันที่ backend ออกให้จึงไม่เคยถูกใช้สักครั้ง
 *
 * คำขอที่ได้ 401 พร้อมกันหลายตัวรอการต่ออายุก้อนเดียว — ถ้าต่างคนต่างต่อ
 * คุกกี้ชุดใหม่จะทับกันไปมาและชนเพดานอัตราการเรียกของ /auth/refresh
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
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

/**
 * ประกอบคำขอใหม่ทุกครั้งที่ยิง — ห้ามใช้ก้อนเดิมซ้ำตอนลองอีกรอบหลังต่ออายุ
 * เพราะการต่ออายุออก CSRF token ใหม่ ก้อนเดิมยังถือค่าเก่าซึ่งจะได้ 403
 */
function buildInit({ method = 'GET', body, signal }: RequestOptions): RequestInit {
  const headers: Record<string, string> = { Accept: 'application/json' };
  /*
   * ส่งไฟล์ (FormData) ห้ามตั้ง Content-Type เอง — เบราว์เซอร์ต้องใส่ boundary ของ multipart ต่อท้าย
   * ถ้าตั้งเป็นค่าตายตัว server แยกส่วนของไฟล์ไม่ออกและปฏิเสธทั้งคำขอ
   */
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

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
  if (body !== undefined) init.body = isForm ? (body as FormData) : JSON.stringify(body);
  if (signal) init.signal = signal;
  return init;
}

/**
 * ยิงคำขอ — ถ้าได้ 401 ต่ออายุ session แล้วลองอีกครั้งเดียว
 *
 * ผู้ใช้จึงไม่เห็นว่า access token หมดอายุเลย ตราบใดที่ refresh token ยังใช้ได้
 * ต่ออายุไม่สำเร็จ = session หมดจริง จึงแจ้ง SessionProvider ให้พาไปหน้าล็อกอิน
 */
async function send(path: string, options: RequestOptions): Promise<Response> {
  const url = buildUrl(path, options.query);
  const attempt = async (): Promise<Response> => {
    try {
      return await fetch(url, buildInit(options));
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      throw new ApiError(0, 'NETWORK_ERROR', FALLBACK_MESSAGE.NETWORK_ERROR);
    }
  };

  const response = await attempt();
  if (response.status !== 401 || NO_REFRESH_PATHS.has(path)) return response;

  if (await refreshSession()) return attempt();

  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  return response;
}

function toApiError(response: Response, payload: Envelope<unknown> | null): ApiError {
  const error = payload?.error ?? {};
  const code = (error.code as ApiErrorCode) ?? statusToCode(response.status);
  return new ApiError(
    response.status,
    code,
    error.message || FALLBACK_MESSAGE[code] || FALLBACK_MESSAGE.SERVER_ERROR,
    toFieldMap(error.details),
    Number(response.headers.get('Retry-After')) || undefined,
    payload?.meta?.request_id ?? response.headers.get('X-Request-Id') ?? undefined,
  );
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as Envelope<T> | null;

  if (!response.ok) throw toApiError(response, payload);

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
  const response = await send(path, options);
  const payload = (await response.json().catch(() => null)) as Envelope<T[]> | null;

  if (!response.ok) throw toApiError(response, payload);

  const meta = payload?.meta ?? { request_id: '' };
  const items = payload?.data ?? [];
  return {
    items,
    page: meta.page ?? 1,
    page_size: meta.page_size ?? items.length,
    total: meta.total ?? items.length,
    total_pages: meta.total_pages ?? 1,
    ...(meta.unread !== undefined ? { unread: meta.unread } : {}),
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
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};
