/**
 * ตัวช่วยแปลงพารามิเตอร์แบ่งหน้าจาก query string
 *
 * query string เป็น string เสมอ และผู้เรียกส่งอะไรมาก็ได้ — `page=-1`,
 * `page_size=999999`, `page=abc` การรับค่าตรง ๆ แล้วเอาไปคำนวณ offset
 * ทำให้เกิดได้ทั้ง offset ติดลบ (Postgres ตอบ error) และการดึงทั้งตาราง
 * ในคำขอเดียว ซึ่งเป็นช่องทาง DoS ที่ราคาถูกมากสำหรับผู้โจมตี
 *
 * ทุก endpoint ที่แบ่งหน้าต้องผ่านสองฟังก์ชันนี้ ไม่ใช่เขียน Math.min ซ้ำเอง
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** @returns จำนวนเต็ม ≥ 1 เสมอ ค่าที่แปลงไม่ได้กลายเป็น 1 */
export function clampPage(raw: string | number | undefined | null): number {
  const n = Number(raw ?? 1);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

/** @returns จำนวนเต็มในช่วง 1..MAX_PAGE_SIZE ค่าที่แปลงไม่ได้กลายเป็นค่าเริ่มต้น */
export function clampPageSize(raw: string | number | undefined | null): number {
  const n = Number(raw ?? DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(n)));
}

/** รูปร่างที่ EnvelopeInterceptor รู้จักและแตกเป็น data + meta ให้เอง */
export interface PagedResult<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export function paged<T>(items: T[], page: number, pageSize: number, total: number): PagedResult<T> {
  return {
    items,
    page,
    page_size: pageSize,
    total,
    // อย่างน้อย 1 เสมอ — หน้าจอที่แสดง "หน้า 1 จาก 0" ตอนไม่มีข้อมูลอ่านแล้วสับสน
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
