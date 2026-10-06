/**
 * กติกาการเลือกไฟล์แนบฝั่งหน้าจอ — ต้องตรงกับที่ backend รับจริง
 *
 * backend ตรวจชนิดจากไบต์ต้นไฟล์ (backend/src/common/files/file-type.ts) และรับเฉพาะ
 *   รูป: png · jpeg · gif · webp   วิดีโอ: mp4 · mov · webm · 3gp
 *   เอกสาร: pdf · zip (ซึ่งรวม docx · xlsx · pptx) · ข้อความล้วน
 *
 * หน้าจอเคยประกาศรับ "image/*" และ ".doc .xls" กว้างกว่านั้น ผู้ใช้จึงเลือกไฟล์ได้
 * แล้วเพิ่งรู้ว่าใช้ไม่ได้ตอนกดส่ง ซึ่งเสียทั้งเวลาอัปโหลดและความมั่นใจ — ปัดตกตั้งแต่ตอนเลือก
 * พร้อมบอกเหตุผลที่ทำอะไรต่อได้ ดีกว่าให้ไปล้มที่ปลายทาง
 *
 * นี่เป็นด่านเพื่อความสะดวก ไม่ใช่ด่านความปลอดภัย — backend ตรวจซ้ำเสมอและไม่เชื่อสิ่งที่นี่บอก
 */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** ตรงกับ MAX_FILES_PER_REQUEST ของ backend — เกินนี้คำขอเดียวจะถูกปฏิเสธทั้งก้อน */
export const MAX_UPLOAD_FILES = 5;

export type UploadKind = 'image' | 'video' | 'document';

export type UploadRejection =
  /** ใหญ่เกิน 20 MB */
  | 'too_big'
  /** รูป HEIC/HEIF ของ iPhone — backend ยังไม่รองรับ */
  | 'heic'
  /** วิดีโอที่ไม่ใช่ mp4/mov/webm/3gp (เช่น avi · mkv · wmv) */
  | 'video_format'
  /** รูปที่ไม่ใช่ png/jpeg/gif/webp (เช่น bmp · svg · tiff) */
  | 'image_format'
  /** .doc / .xls แบบเก่า — ต้องบันทึกเป็น .docx / .xlsx ก่อน */
  | 'legacy_office'
  | 'type';

export type UploadVerdict = { ok: true; kind: UploadKind } | { ok: false; reason: UploadRejection };

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const VIDEO_EXT = new Set(['mp4', 'm4v', 'mov', 'webm', '3gp', '3g2']);
const VIDEO_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/3gpp',
  'video/3gpp2',
  'video/x-m4v',
]);
const DOC_EXT = new Set(['pdf', 'docx', 'xlsx', 'pptx', 'zip', 'txt', 'csv', 'log']);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * @param file ใช้แค่ชื่อ ชนิด และขนาด — รับ File ได้ แต่ไม่ผูกกับ DOM เพื่อทดสอบได้
 *
 * ตัดสินจากทั้ง MIME และนามสกุล เพราะ Windows มักส่ง type ว่างเปล่ามาให้กับ .mov และ .heic
 * ถ้าดู MIME อย่างเดียว ไฟล์ถูกต้องจะถูกปัดตกโดยไม่มีเหตุผล
 */
export function classifyUpload(file: { name: string; type: string; size: number }): UploadVerdict {
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: 'too_big' };

  const ext = extensionOf(file.name);
  const mime = file.type.toLowerCase();

  if (mime === 'image/heic' || mime === 'image/heif' || ext === 'heic' || ext === 'heif') {
    return { ok: false, reason: 'heic' };
  }

  if (IMAGE_MIME.has(mime) || (mime === '' && IMAGE_EXT.has(ext)))
    return { ok: true, kind: 'image' };
  if (mime.startsWith('image/')) return { ok: false, reason: 'image_format' };

  if (VIDEO_MIME.has(mime) || (mime === '' && VIDEO_EXT.has(ext)))
    return { ok: true, kind: 'video' };
  if (mime.startsWith('video/')) return { ok: false, reason: 'video_format' };

  if (ext === 'doc' || ext === 'xls' || ext === 'ppt')
    return { ok: false, reason: 'legacy_office' };

  // ชนิดไม่ชัดจาก MIME แต่นามสกุลเป็นรูป/วิดีโอ/เอกสารที่รู้จัก ก็ผ่าน (ทางเดียวกับ type ว่าง)
  if (IMAGE_EXT.has(ext)) return { ok: true, kind: 'image' };
  if (VIDEO_EXT.has(ext)) return { ok: true, kind: 'video' };
  if (DOC_EXT.has(ext)) return { ok: true, kind: 'document' };

  return { ok: false, reason: 'type' };
}

/** ข้อความอธิบายเหตุที่ปัดตก — พร้อมทางออก ไม่ใช่แค่บอกว่า "ไม่รองรับ" */
export function rejectionMessage(fileName: string, reason: UploadRejection): string {
  switch (reason) {
    case 'too_big':
      return `«${fileName}» ໃຫຍ່ເກີນ 20 MB — ຖ້າເປັນວິດີໂອ ໃຫ້ຖ່າຍສັ້ນລົງ ຫຼື ຕັດໃຫ້ສັ້ນກ່ອນ`;
    case 'heic':
      return `«${fileName}» ເປັນຮູບແບບ HEIC ຂອງ iPhone ທີ່ຍັງບໍ່ຮອງຮັບ — ປ່ຽນເປັນ JPEG ກ່ອນ ຫຼື ແຄັບໜ້າຈໍແທນ`;
    case 'video_format':
      return `«${fileName}» — ວິດີໂອຮອງຮັບສະເພາະ MP4 · MOV · WebM · 3GP`;
    case 'image_format':
      return `«${fileName}» — ຮູບພາບຮອງຮັບສະເພາະ PNG · JPEG · GIF · WebP`;
    case 'legacy_office':
      return `«${fileName}» ເປັນໄຟລ໌ Office ແບບເກົ່າ — ບັນທຶກເປັນ .docx / .xlsx / .pptx ກ່ອນ`;
    default:
      return `«${fileName}» ເປັນຊະນິດທີ່ບໍ່ຮອງຮັບ — ຮອງຮັບ ຮູບພາບ · ວິດີໂອ · PDF · Word · Excel`;
  }
}

/** ค่า accept ของ <input type="file"> — ให้ตัวเลือกไฟล์ของระบบกรองให้ตั้งแต่ต้น */
export const UPLOAD_ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,video/mp4,video/quicktime,video/webm,video/3gpp,' +
  '.pdf,.docx,.xlsx,.pptx,.zip,.txt,.csv';
