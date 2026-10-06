/**
 * ตรวจชนิดไฟล์จากเนื้อไฟล์จริง ไม่ใช่จากนามสกุลหรือ Content-Type (NFR-15)
 *
 * ⚠️ ห้ามเชื่อ Content-Type ที่ client ส่งมาเด็ดขาด
 *    ค่านั้นผู้เรียกตั้งเองได้ทั้งหมด — ไฟล์ .exe ที่ประกาศตัวเองว่าเป็น
 *    image/png จะผ่านการตรวจที่ดูแต่ header แล้วถูกเก็บไว้ในระบบ
 *    รอให้คนอื่นกดดาวน์โหลด
 *
 * ⚠️ ห้ามเชื่อนามสกุลไฟล์เช่นกัน — ผู้ใช้เปลี่ยนนามสกุลได้ในหนึ่งคลิก
 *
 * วิธีที่ใช้: อ่านไบต์แรก ๆ (magic bytes) เทียบกับลายเซ็นที่รู้จัก
 * ไฟล์ที่ไม่ตรงลายเซ็นใดเลยถูกปฏิเสธ — เป็นรายการอนุญาต ไม่ใช่รายการห้าม
 * เพราะรายการห้ามจะพลาดชนิดที่ยังไม่มีใครคิดถึงเสมอ
 */

export interface DetectedType {
  mime: string;
  ext: string;
}

/** ลายเซ็นไบต์ต้นไฟล์ที่อนุญาต — ครอบคลุมสิ่งที่ผู้ใช้แนบจริงในงาน Service Desk */
const SIGNATURES: { mime: string; ext: string; offset: number; bytes: number[] }[] = [
  { mime: 'image/png', ext: 'png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', ext: 'jpg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', ext: 'gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', ext: 'webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  { mime: 'application/pdf', ext: 'pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  // วิดีโอ WebM (Matroska ใช้ลายเซ็นเดียวกัน — ไฟล์ .mkv จะถูกเก็บเป็น webm และเล่นไม่ได้ในเบราว์เซอร์
  // แต่ดาวน์โหลดไปเปิดด้วยโปรแกรมเล่นได้ตามปกติ ยอมรับความไม่ละเอียดนี้แทนการแกะ container)
  { mime: 'video/webm', ext: 'webm', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  /*
   * ไฟล์ Office สมัยใหม่ (docx/xlsx/pptx) เป็น zip ทั้งหมด จึงมีลายเซ็นเดียวกัน
   * แยกจากกันไม่ได้ด้วย magic bytes อย่างเดียว ต้องเปิดอ่านรายการไฟล์ข้างใน
   *
   * เก็บเป็น application/zip แล้วให้ชื่อไฟล์เดิมเป็นตัวบอกผู้ใช้ว่าคืออะไร
   * — ยอมเสียความละเอียดของชนิด เพื่อไม่ต้องแกะ zip ของผู้ใช้ระหว่างอัปโหลด
   *   ซึ่งเปิดช่องให้ zip bomb ทำงาน
   */
  { mime: 'application/zip', ext: 'zip', offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: 'application/zip', ext: 'zip', offset: 0, bytes: [0x50, 0x4b, 0x05, 0x06] },
];

/**
 * วิดีโอตระกูล ISO base media — mp4 / mov / 3gp ขึ้นต้นด้วยกล่อง "ftyp" ที่ไบต์ 4–7
 * แล้วตามด้วยชื่อ "brand" 4 ไบต์ที่บอกว่าเป็นไฟล์ชนิดไหน
 *
 * ⚠️ ต้องดู brand ด้วย ห้ามดูแค่ "ftyp" — ไฟล์ภาพ HEIC (รูปจาก iPhone) และ AVIF ใช้โครงเดียวกัน
 *    ต่างกันที่ brand (heic · heix · mif1 · avif) ถ้ายอมทุก ftyp ไฟล์ภาพกลุ่มนี้จะถูกเก็บเป็น
 *    "วิดีโอ" แล้วเบราว์เซอร์เล่นไม่ได้ ผู้ใช้เห็นเป็นภาพเสีย การเป็นรายการอนุญาตตาม brand
 *    จึงปล่อยให้ HEIC ถูกปฏิเสธเหมือนเดิม ไม่ใช่เปลี่ยนความหมายของมันไปเงียบ ๆ
 */
const MP4_BRANDS: ReadonlySet<string> = new Set([
  'isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'dash', 'M4V ', 'M4VH', 'M4VP', 'f4v ', 'MSNV', 'XAVC',
]);
const THREE_GP_BRANDS: ReadonlySet<string> = new Set(['3gp4', '3gp5', '3gp6', '3gp7', '3g2a', '3g2b', '3g2c']);

function detectIsoVideo(head: Buffer): DetectedType | null {
  if (head.length < 12) return null;
  if (head.toString('latin1', 4, 8) !== 'ftyp') return null;

  const brand = head.toString('latin1', 8, 12);
  if (brand === 'qt  ') return { mime: 'video/quicktime', ext: 'mov' };
  if (MP4_BRANDS.has(brand)) return { mime: 'video/mp4', ext: 'mp4' };
  if (THREE_GP_BRANDS.has(brand)) return { mime: 'video/3gpp', ext: '3gp' };
  return null;
}

/** ชนิดข้อความล้วนที่ยอมรับ — ตรวจด้วยเนื้อหา ไม่ใช่ลายเซ็น เพราะไม่มี */
const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'log']);

/**
 * @param head ไบต์ต้นไฟล์ (อย่างน้อย 16 ไบต์)
 * @param fileName ชื่อไฟล์เดิม ใช้เฉพาะกับไฟล์ข้อความล้วนที่ไม่มีลายเซ็น
 * @returns null เมื่อไม่ตรงชนิดที่อนุญาต
 */
export function detectFileType(head: Buffer, fileName: string): DetectedType | null {
  for (const sig of SIGNATURES) {
    if (head.length < sig.offset + sig.bytes.length) continue;
    if (sig.bytes.every((b, i) => head[sig.offset + i] === b)) {
      return { mime: sig.mime, ext: sig.ext };
    }
  }

  const video = detectIsoVideo(head);
  if (video) return video;

  /*
   * ไฟล์ข้อความไม่มี magic bytes จึงตรวจสองชั้น
   *   1. นามสกุลอยู่ในรายการที่อนุญาต
   *   2. เนื้อไฟล์ไม่มีไบต์ศูนย์ — ไฟล์ไบนารีที่เปลี่ยนนามสกุลเป็น .txt
   *      มักมีไบต์ศูนย์อยู่ต้นไฟล์ ส่วนข้อความ UTF-8 ไม่มีเลย
   */
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (TEXT_EXTENSIONS.has(ext) && !head.includes(0x00)) {
    return { mime: 'text/plain', ext };
  }

  return null;
}

/** ≤ 20 MB ต่อไฟล์ ตรงกับ CHECK ck_attachment_size_max_20mb ในฐานข้อมูล */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** ≤ 5 ไฟล์ต่อคำขอ ตาม docs/03-api-spec.md §2.5 */
export const MAX_FILES_PER_REQUEST = 5;

/**
 * ชนิดที่เปิดแสดงในหน้าเว็บได้โดยตรง (รูปภาพ · วิดีโอ) — ใช้ตัดสินว่า ?inline=1 ได้ผลไหม
 *
 * ต้องเป็นรายการอนุญาตแคบ ๆ ที่ **ไม่มีทางรันสคริปต์ได้** — นั่นคือเหตุผลที่ SVG, HTML
 * และ PDF ไม่อยู่ในนี้ แม้บางตัวจะรับอัปโหลดได้ ตัวพวกนั้นต้องดาวน์โหลดอย่างเดียวเสมอ
 * (ถ้าเปิดในโดเมนเรา สคริปต์ข้างในจะรันพร้อมคุกกี้ของคนที่กดเปิด)
 */
export function isInlineSafeMime(mime: string): boolean {
  return /^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm|quicktime|3gpp))$/.test(mime);
}
