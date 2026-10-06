/**
 * ไฟล์แนบฝั่งแสดงผล — ตัดสินว่าจะแสดงเป็นรูป วิดีโอ หรือลิงก์ดาวน์โหลด
 *
 * ต้องตรงกับ isInlineSafeMime ของ backend (backend/src/common/files/file-type.ts) ซึ่งเป็นตัวตัดสินจริง
 * ว่าชนิดไหนเปิดในหน้าเว็บได้ — ถ้าหน้านี้ยอมให้ชนิดที่ backend ไม่ยอม ผลคือแสดงเป็นรูปเสีย
 * ส่วนถ้าหน้านี้เข้มกว่า ผลคือแสดงเป็นลิงก์ซึ่งปลอดภัยเสมอ จึงผิดทางที่ไม่เสียหาย
 */
export type AttachmentKind = 'image' | 'video' | 'file';

export function attachmentKind(mime: string): AttachmentKind {
  if (/^image\/(png|jpeg|gif|webp)$/.test(mime)) return 'image';
  if (/^video\/(mp4|webm|quicktime|3gpp)$/.test(mime)) return 'video';
  return 'file';
}

/** inline = เปิดแสดงในหน้า (รูป/วิดีโอเท่านั้น) · ไม่ใส่ = ดาวน์โหลด */
export function attachmentUrl(id: number, inline = false): string {
  return `/api/v1/attachments/${id}/download${inline ? '?inline=1' : ''}`;
}
