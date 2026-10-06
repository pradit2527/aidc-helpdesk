/**
 * เลขหน้าที่จะแสดงบนแถบเลือกหน้า — null คือ "…"
 *
 * เจ็ดช่องเสมอเมื่อมีหน้ามากพอ: หน้าแรก · หน้าสุดท้าย · หน้าปัจจุบันกับข้างละหนึ่ง · และ "…" คั่น
 * ตารางร้อยหน้าไม่ควรได้ปุ่มร้อยปุ่ม และความกว้างของแถบต้องไม่ขยับเมื่อกดเปลี่ยนหน้า
 */
export function pageWindow(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);

  if (page <= 4) return [1, 2, 3, 4, 5, null, pageCount];
  if (page >= pageCount - 3)
    return [1, null, pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  return [1, null, page - 1, page, page + 1, null, pageCount];
}
