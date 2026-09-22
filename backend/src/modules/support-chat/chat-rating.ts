/**
 * ให้คะแนนความพึงพอใจจากห้องแชท — กฎล้วน ๆ ไม่มี I/O
 *
 * ปัญหาที่แก้: เรื่องที่ยกระดับมาจากแชทไม่เคยได้คะแนนเลย เพราะทางเดียวที่ให้คะแนนได้
 * คือผู้แจ้งเปิดหน้ารายละเอียดของเรื่องแล้วกด "ยืนยันปิด" — คนที่คุยทางแชทไม่เคยเข้าหน้านั้น
 * KPI-4 (CSAT) จึงวัดได้เฉพาะเรื่องที่แจ้งผ่านฟอร์ม และหายไปทั้งช่องทางแชท
 *
 * ตอนนี้ห้องแชทแสดงการ์ดให้คะแนนเองเมื่อเรื่องที่ผูกไว้แก้เสร็จ และให้กดได้ในแชทเลย
 * ผลเหมือนการยืนยันปิดบนหน้าเรื่องทุกประการ (คะแนนเก็บที่คอลัมน์เดียวกัน นับเข้า KPI-4 เหมือนกัน)
 */

/** ให้คะแนนย้อนหลังได้นานเท่าไรหลังเรื่องปิด — เท่ากับช่วงที่ผู้แจ้งยังเปิดเรื่องคืนได้ */
export const RATING_WINDOW_DAYS = 7;

export type RatingBlockReason = 'not_requester' | 'already_rated' | 'not_done' | 'expired';

export interface ChatRatingState {
  canRate: boolean;
  /**
   * true = การให้คะแนนคือการ "ยืนยันว่าแก้แล้ว" ด้วย — เรื่องจะปิดพร้อมคะแนน
   * (เส้นเดียวกับที่ผู้แจ้งกดยืนยันปิดบนหน้าเรื่อง) · false = เรื่องปิดไปแล้ว เก็บแค่คะแนน
   */
  closesTicket: boolean;
  reason: RatingBlockReason | null;
}

/**
 * ผู้เรียกคนนี้ให้คะแนนเรื่องนี้ได้ไหม ตอนนี้
 *
 *   แก้ไข/ส่งมอบแล้ว รอยืนยัน   → ให้ได้ และเรื่องจะปิดไปพร้อมกัน
 *   ปิดแล้ว (ปิดเองอัตโนมัติ หรือเจ้าหน้าที่ปิด) → ให้ได้ภายใน RATING_WINDOW_DAYS วัน
 *   สถานะอื่น (ยังทำอยู่ ยกเลิก ไม่อนุมัติ) → ยังไม่ถึงเวลา
 *
 * ⚠️ ผู้แจ้งของเรื่องเท่านั้น — ถ้าเจ้าหน้าที่ให้แทนได้ CSAT คือคะแนนที่ทีมให้ตัวเอง
 * ⚠️ ให้ได้ครั้งเดียว — คะแนนแรกคือคะแนนที่นับ แก้ทีหลังไม่ได้
 */
export function chatRatingState(input: {
  status: string;
  satisfactionScore: number | null;
  closedAt: Date | null;
  isRequester: boolean;
  now: Date;
}): ChatRatingState {
  const blocked = (reason: RatingBlockReason): ChatRatingState => ({ canRate: false, closesTicket: false, reason });

  if (!input.isRequester) return blocked('not_requester');
  if (input.satisfactionScore !== null) return blocked('already_rated');

  if (input.status === 'resolved' || input.status === 'fulfilled') {
    return { canRate: true, closesTicket: true, reason: null };
  }

  if (input.status === 'closed') {
    const windowMs = RATING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (input.closedAt !== null && input.now.getTime() - input.closedAt.getTime() > windowMs) {
      return blocked('expired');
    }
    return { canRate: true, closesTicket: false, reason: null };
  }

  return blocked('not_done');
}

/** ข้อความที่ลงในห้องแชทหลังให้คะแนน — ทีมไอทีเห็นคะแนนในห้องเดียวกันทันที */
export function ratingMessage(score: number): string {
  const s = Math.min(5, Math.max(1, Math.round(score)));
  return `ໃຫ້ຄະແນນການບໍລິການ ${'★'.repeat(s)}${'☆'.repeat(5 - s)} (${s} / 5) — ຂອບໃຈທີ່ປະເມີນ`;
}

/** ข้อความผิดพลาดที่ผู้ใช้อ่านได้ ตามเหตุที่ให้คะแนนไม่ได้ */
export const RATING_BLOCK_MESSAGE: Record<RatingBlockReason, string> = {
  not_requester: 'ສະເພາະຜູ້ແຈ້ງເລື່ອງເທົ່ານັ້ນທີ່ໃຫ້ຄະແນນໄດ້',
  already_rated: 'ເລື່ອງນີ້ໃຫ້ຄະແນນແລ້ວ',
  not_done: 'ເລື່ອງນີ້ຍັງແກ້ໄຂບໍ່ສຳເລັດ ຈຶ່ງຍັງໃຫ້ຄະແນນບໍ່ໄດ້',
  expired: `ເລື່ອງນີ້ປິດເກີນ ${RATING_WINDOW_DAYS} ມື້ແລ້ວ ຈຶ່ງໃຫ້ຄະແນນບໍ່ໄດ້`,
};
