/**
 * แปลงหัว Range ของ HTTP เป็นช่วงไบต์ที่จะส่ง — จำเป็นต่อการเล่นวิดีโอ
 *
 * เบราว์เซอร์ขอวิดีโอเป็นช่วง ("bytes=0-" แล้วค่อยกระโดดไปช่วงอื่นเมื่อผู้ใช้เลื่อนแถบเวลา)
 * Safari ยิ่งเข้มกว่านั้น: ถ้าเซิร์ฟเวอร์ตอบ 200 ทั้งไฟล์แทน 206 มันจะไม่เล่นเลย
 * ผู้ใช้ iPhone และ Mac จึงเห็นวิดีโอเป็นกล่องเปล่าทั้งที่ไฟล์ไม่ได้เสีย
 *
 * ตามมาตรฐาน (RFC 9110 §14) เซิร์ฟเวอร์ "ไม่เข้าใจ Range" แล้วส่งทั้งไฟล์ได้เสมอ
 * จึงคืน null เมื่ออ่านไม่ออกหรือเป็นหลายช่วง — ผลคือส่งทั้งไฟล์ ซึ่งปลอดภัยกว่าเดา
 */

export interface ByteRange {
  start: number;
  /** รวมไบต์สุดท้าย (inclusive) ตามที่ Content-Range นับ */
  end: number;
}

/**
 * @returns ช่วงที่ต้องส่ง · `'unsatisfiable'` เมื่อเริ่มเกินท้ายไฟล์ (ตอบ 416) · null เมื่อไม่ต้องใช้ช่วง
 */
export function parseByteRange(header: string | undefined, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header || size <= 0) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  // หลายช่วง (มีจุลภาค) หรือหน่วยอื่น ไม่ตรงรูปแบบนี้ → ส่งทั้งไฟล์
  if (!match) return null;

  const [, rawStart = '', rawEnd = ''] = match;
  if (rawStart === '' && rawEnd === '') return null;

  // "bytes=-500" = 500 ไบต์สุดท้าย
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!Number.isSafeInteger(suffix) || suffix === 0) return 'unsatisfiable';
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }

  const start = Number(rawStart);
  if (!Number.isSafeInteger(start)) return null;
  if (start >= size) return 'unsatisfiable';

  // เกินท้ายไฟล์ให้ตัดที่ท้ายไฟล์ ไม่ใช่ผิดพลาด (เบราว์เซอร์ส่ง "bytes=0-" เป็นปกติ)
  const requestedEnd = rawEnd === '' ? size - 1 : Number(rawEnd);
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return null;

  return { start, end: Math.min(requestedEnd, size - 1) };
}
