/**
 * ข้อความที่แชทได้รับเมื่อเรื่องที่ผูกไว้เปลี่ยนสถานะ — กฎล้วน ๆ ไม่มี I/O
 *
 * ทำไมต้องมีไฟล์นี้แยก
 *   ผู้เข้าชมเว็บไม่มีบัญชีใน Helpdesk เขาเปิดหน้าเรื่องแจ้งไม่ได้เลย
 *   ห้องแชทคือช่องทางเดียวที่เขาจะรู้ว่าเรื่องของตัวเองไปถึงไหนแล้ว
 *   ถ้าไม่ส่งอะไรกลับไป เขาจะเห็นแค่ความเงียบหลังจากเล่าปัญหาจบ
 *
 * ⚠️ หนึ่งการเปลี่ยนสถานะ = หนึ่งข้อความ ไม่ใช่หนึ่งข้อความต่อหนึ่งเหตุการณ์ในระบบ
 *    ผู้เรียกต้องเรียกเฉพาะตอนที่สถานะ "เปลี่ยนจริง" (from !== to) มิฉะนั้น
 *    การมอบหมายซ้ำหรือการทบทวนระดับความสำคัญจะยิงข้อความเดิมซ้ำใส่ผู้เข้าชม
 *
 * ⚠️ ไม่ทำซ้ำสิ่งที่ประวัติของเรื่องมีอยู่แล้ว — ประวัติภายใน (ticket_status_history)
 *    ยังเป็นหลักฐานตาม SOP เหมือนเดิม ข้อความในแชทเป็นการ "บอกผู้ถาม"
 *    ไม่ใช่สำเนาของหลักฐานนั้น
 */

import type { TicketStatus } from '../../common/constants';

/** เพดานความยาวข้อความในแชท — ck_support_chat_message_content บังคับไว้ที่ 4000 */
export const CHAT_NOTICE_MAX_LENGTH = 4000;

/** ข้อความตั้งต้นของแต่ละสถานะ — ตัวที่มีรายละเอียดเพิ่มจะถูกต่อท้ายใน notice() */
const BASE_NOTICE: Partial<Record<TicketStatus, string>> = {
  assigned: 'ທີມງານຮັບເລື່ອງແລ້ວ',
  in_progress: 'ກຳລັງດຳເນີນການແກ້ໄຂ',
  pending_user: 'ພັກເລື່ອງໄວ້ກ່ອນ',
  // สองสถานะใหม่ของสายคำขอบริการ — ผู้ถามต้องรู้ว่าเรื่องค้างอยู่ที่ขั้นไหน
  pending_approval: 'ລໍຖ້າການອະນຸມັດ',
  pending_vendor: 'ສົ່ງຕໍ່ໃຫ້ຜູ້ໃຫ້ບໍລິການພາຍນອກແລ້ວ',
  resolved: 'ແກ້ໄຂສຳເລັດແລ້ວ',
  fulfilled: 'ສົ່ງມອບແລ້ວ',
  rejected: 'ຄຳຂໍບໍ່ໄດ້ຮັບການອະນຸມັດ',
  closed: 'ປິດເລື່ອງແລ້ວ',
  cancelled: 'ຍົກເລີກເລື່ອງແລ້ວ',
};

export interface TicketStatusNoticeDetail {
  /**
   * เหตุผลที่ผู้เปลี่ยนสถานะกรอกไว้
   *
   * ใช้กับ pending_user (ลำดับเดียวกับข้อความถึงผู้แจ้งใน ChangeTicketStatusUseCase)
   * และ cancelled ซึ่งบังคับกรอกเหตุผลอยู่แล้ว
   */
  reason?: string | null | undefined;
  /** บันทึกวิธีแก้ — บังคับกรอกเมื่อ resolved */
  resolutionNote?: string | null | undefined;
}

/**
 * ข้อความภาษาลาวสำหรับการเปลี่ยนไปสถานะนี้ · null = สถานะที่ไม่ต้องบอกผู้ถาม
 *
 * `new` เป็น null เพราะเรื่องยังไม่ขยับ — เรื่องเพิ่งถูกสร้างจากแชทห้องนี้เอง
 * ผู้ถามเพิ่งคุยจบ การส่ง "แจ้งเรื่องแล้ว" ซ้ำอีกครั้งไม่ได้เพิ่มอะไร
 */
export function ticketStatusNotice(
  to: TicketStatus,
  detail: TicketStatusNoticeDetail = {},
): string | null {
  const base = BASE_NOTICE[to];
  if (!base) return null;

  /*
   * ต่อท้ายด้วยรายละเอียดเฉพาะสถานะที่ "ผู้ถามต้องทำอะไรต่อ" หรือ "ต้องรู้ว่าทำไม"
   *
   * pending_vendor ไม่ต่อเหตุผล เพราะเหตุผลของการส่งต่อผู้ขายมักมีชื่อผู้ขาย
   * รหัสอะไหล่ และเงื่อนไขราคาติดมาด้วย ซึ่งเป็นข้อมูลภายในที่ไม่ควรไปถึงผู้เข้าชม
   * เจ้าหน้าที่ที่อยากเล่าให้ฟังใช้ช่อง comment ซึ่งตั้งใจส่งออกอยู่แล้ว
   */
  /*
   * ⚠️ resolved / fulfilled ใช้ resolutionNote เท่านั้น ห้ามถอยไปใช้ reason
   *    reason ของการเปลี่ยนสถานะเป็นบันทึกภายใน ไม่ใช่คำอธิบายที่เขียนให้ผู้ถามอ่าน
   *    (เทสต์ "แก้ไขเสร็จไม่หยิบ reason มาใช้แทนบันทึกวิธีแก้" คุมข้อนี้ไว้)
   *    คำขอที่ส่งมอบแล้วโดยไม่มีบันทึก จะได้ข้อความเปล่า ๆ ซึ่งถูกต้องแล้ว —
   *    resolution_note ไม่บังคับสำหรับ fulfilled
   */
  const extra =
    to === 'resolved' || to === 'fulfilled'
      ? clean(detail.resolutionNote)
      : to === 'pending_user' || to === 'cancelled' || to === 'rejected'
        ? clean(detail.reason)
        : null;

  const text = extra ? `${base}: ${extra}` : base;
  return text.length <= CHAT_NOTICE_MAX_LENGTH ? text : `${text.slice(0, CHAT_NOTICE_MAX_LENGTH - 1)}…`;
}

function clean(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}
