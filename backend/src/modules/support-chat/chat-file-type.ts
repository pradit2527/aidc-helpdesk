import { detectFileType } from '../../common/files/file-type';
import type { ChatAttachmentKind } from '../../db/repositories/support-chat.repository';

/**
 * ชนิดไฟล์ที่ส่งในแชทได้ — ชุดเดียวกับไฟล์แนบของ ticket บวกไฟล์เสียง
 *
 * แยกไว้ที่นี่ ไม่เพิ่มเสียงเข้า detectFileType ตรง ๆ เพราะไฟล์แนบของ ticket
 * ยังไม่มีเหตุผลต้องรับไฟล์เสียง การขยายรายการอนุญาตของส่วนอื่นโดยไม่จำเป็น
 * คือการเปิดช่องให้ของที่ไม่ได้ตั้งใจเข้ามา
 *
 * ⚠️ ไม่มี SVG โดยตั้งใจ — รูปแสดงในหน้าเว็บตรง ๆ (inline) และ SVG รันสคริปต์ได้
 */

export interface ChatFileType {
  mime: string;
  ext: string;
  kind: ChatAttachmentKind;
}

/** ≤ 20 MB ต่อไฟล์ ตรงกับ CHECK ck_support_chat_message_attachment_max_20mb */
export const CHAT_MAX_FILE_BYTES = 20 * 1024 * 1024;

function startsWith(head: Buffer, offset: number, bytes: readonly number[]): boolean {
  if (head.length < offset + bytes.length) return false;
  return bytes.every((b, i) => head[offset + i] === b);
}

/*
 * ลายเซ็นไฟล์เสียง
 *
 * - webm: สิ่งที่ Chrome/Edge/Firefox บันทึกจากไมโครโฟน (MediaRecorder)
 * - mp4/m4a: สิ่งที่ Safari บันทึก
 * - ogg, wav, mp3: ไฟล์เสียงที่ผู้ใช้แนบเอง
 *
 * webm กับ mp4 เป็นกล่องที่ใส่วิดีโอได้ด้วย ถ้าผู้ใช้แนบวิดีโอมา จะเล่นได้แค่เสียง
 * ในตัวเล่นเสียง ซึ่งไม่อันตราย — ไม่คุ้มที่จะแกะโครงสร้างไฟล์ระหว่างอัปโหลด
 */
const AUDIO: { mime: string; ext: string; test: (head: Buffer) => boolean }[] = [
  { mime: 'audio/webm', ext: 'webm', test: (h) => startsWith(h, 0, [0x1a, 0x45, 0xdf, 0xa3]) },
  { mime: 'audio/ogg', ext: 'ogg', test: (h) => startsWith(h, 0, [0x4f, 0x67, 0x67, 0x53]) },
  {
    mime: 'audio/wav',
    ext: 'wav',
    test: (h) => startsWith(h, 0, [0x52, 0x49, 0x46, 0x46]) && startsWith(h, 8, [0x57, 0x41, 0x56, 0x45]),
  },
  { mime: 'audio/mp4', ext: 'm4a', test: (h) => startsWith(h, 4, [0x66, 0x74, 0x79, 0x70]) },
  {
    mime: 'audio/mpeg',
    ext: 'mp3',
    // ID3 tag หรือ frame sync ของ MPEG audio (11 บิตแรกเป็น 1)
    test: (h) => startsWith(h, 0, [0x49, 0x44, 0x33]) || (h[0] === 0xff && ((h[1] ?? 0) & 0xe0) === 0xe0),
  },
];

/**
 * @param head ไบต์ต้นไฟล์ (อย่างน้อย 16 ไบต์)
 * @returns null เมื่อไม่ใช่ชนิดที่อนุญาต
 */
export function detectChatFile(head: Buffer, fileName: string): ChatFileType | null {
  // ตรวจรูป/เอกสารก่อน — JPEG ขึ้นต้นด้วย FF D8 ซึ่งชนกับการตรวจ frame sync ของ mp3 ถ้ากลับลำดับ
  const base = detectFileType(head, fileName);
  if (base) return { ...base, kind: base.mime.startsWith('image/') ? 'image' : 'file' };

  for (const audio of AUDIO) {
    if (audio.test(head)) return { mime: audio.mime, ext: audio.ext, kind: 'audio' };
  }
  return null;
}

/**
 * ชื่อไฟล์ภาษาลาว/ไทยจาก multer มาเป็นตัวอักษรเพี้ยน
 *
 * multer ถอดชื่อไฟล์ใน multipart เป็น latin1 ตามสเปกเก่า แต่เบราว์เซอร์ส่งมาเป็น UTF-8
 * "ຮູບ.png" จึงกลายเป็น "à»®àº¹àºš.png" — แปลงกลับ แล้วใช้ค่าเดิมถ้าแปลงแล้วไม่ใช่ UTF-8 ที่ถูกต้อง
 */
export function decodeUploadName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}
