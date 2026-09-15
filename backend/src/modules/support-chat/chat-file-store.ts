import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { NotFoundError } from '../../common/errors/domain-error';
import type { StoredChatAttachment } from '../../db/repositories/support-chat.repository';
import type { ChatFileType } from './chat-file-type';

/**
 * ที่เก็บไฟล์ของแชท — ใช้ร่วมกันระหว่างไฟล์ที่ผู้ใช้อัปโหลดและไฟล์ที่นำเข้าจาก Chatwoot
 *
 * รากเดียวกับไฟล์แนบของ ticket แยกโฟลเดอร์ย่อย chat/ · บน production ต้องชี้
 * ATTACHMENT_DIR ไปยังดิสก์ที่สำรองข้อมูล ไม่งั้นไฟล์หายไปพร้อมคอนเทนเนอร์
 */
function root(): string {
  return path.resolve(process.env.ATTACHMENT_DIR ?? 'storage/attachments');
}

/** path เต็มของไฟล์ — ตรวจว่ายังอยู่ใต้โฟลเดอร์รากเป็นด่านสุดท้าย */
export function chatFilePath(key: string): string {
  const base = root();
  const full = path.resolve(base, key);
  if (!full.startsWith(base + path.sep)) {
    throw new NotFoundError('NOT_FOUND', 'ບໍ່ພົບໄຟລ໌');
  }
  return full;
}

/**
 * เขียนไฟล์ที่ตรวจชนิดแล้วลงดิสก์
 *
 * ⚠️ ชื่อไฟล์ของผู้ใช้ไม่ถูกใช้ประกอบ path — ชื่อบนดิสก์เป็น uuid ล้วน (กัน path traversal)
 */
export async function writeChatFile(
  companyId: number,
  detected: ChatFileType,
  name: string,
  buffer: Buffer,
): Promise<StoredChatAttachment> {
  const now = new Date();
  const key = [
    'chat',
    String(companyId),
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0'),
    `${crypto.randomUUID()}.${detected.ext}`,
  ].join('/');

  const full = chatFilePath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);

  return {
    key,
    name: name.slice(0, 255) || `file.${detected.ext}`,
    mime: detected.mime,
    size: buffer.length,
    kind: detected.kind,
  };
}
