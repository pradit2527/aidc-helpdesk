import { describe, expect, it } from 'vitest';

import { chatRatingState, ratingMessage, RATING_WINDOW_DAYS } from './chat-rating';

const now = new Date('2026-09-22T10:00:00+07:00');
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
const base = { satisfactionScore: null, closedAt: null, isRequester: true, now };

describe('chatRatingState — ให้คะแนนจากห้องแชท', () => {
  it('แก้ไขเสร็จรอยืนยัน → ให้ได้ และเรื่องปิดไปพร้อมคะแนน', () => {
    expect(chatRatingState({ ...base, status: 'resolved' })).toEqual({ canRate: true, closesTicket: true, reason: null });
  });

  it('คำขอบริการที่ส่งมอบแล้ว → ให้ได้เหมือนเหตุขัดข้อง', () => {
    expect(chatRatingState({ ...base, status: 'fulfilled' }).closesTicket).toBe(true);
  });

  it('เรื่องที่ปิดไปแล้ว (ปิดอัตโนมัติ/เจ้าหน้าที่ปิด) → ให้ย้อนหลังได้ แต่ไม่ปิดซ้ำ', () => {
    expect(chatRatingState({ ...base, status: 'closed', closedAt: daysAgo(2) })).toEqual({
      canRate: true,
      closesTicket: false,
      reason: null,
    });
  });

  it(`ปิดเกิน ${RATING_WINDOW_DAYS} วัน → หมดเวลาให้คะแนน`, () => {
    expect(chatRatingState({ ...base, status: 'closed', closedAt: daysAgo(RATING_WINDOW_DAYS + 1) }).reason).toBe('expired');
  });

  it('ยังทำอยู่ → ยังไม่ถึงเวลา', () => {
    for (const status of ['new', 'assigned', 'in_progress', 'pending_user', 'pending_approval']) {
      expect(chatRatingState({ ...base, status }).reason).toBe('not_done');
    }
  });

  it('ยกเลิกหรือไม่อนุมัติ → ไม่มีงานให้ประเมิน', () => {
    expect(chatRatingState({ ...base, status: 'cancelled' }).canRate).toBe(false);
    expect(chatRatingState({ ...base, status: 'rejected' }).canRate).toBe(false);
  });

  it('ให้คะแนนแล้ว → ให้ซ้ำไม่ได้', () => {
    expect(chatRatingState({ ...base, status: 'closed', satisfactionScore: 4 }).reason).toBe('already_rated');
  });

  it('ไม่ใช่ผู้แจ้ง (เช่นเจ้าหน้าที่) → ให้แทนไม่ได้ ไม่งั้น CSAT คือคะแนนที่ทีมให้ตัวเอง', () => {
    expect(chatRatingState({ ...base, status: 'resolved', isRequester: false }).reason).toBe('not_requester');
  });
});

describe('ratingMessage', () => {
  it('แสดงดาวตามคะแนน', () => {
    expect(ratingMessage(4)).toContain('★★★★☆ (4 / 5)');
    expect(ratingMessage(1)).toContain('★☆☆☆☆ (1 / 5)');
  });
});
