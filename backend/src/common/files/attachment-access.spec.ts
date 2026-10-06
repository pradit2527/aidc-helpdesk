import { describe, expect, it } from 'vitest';

import { canReadAttachment, type AttachmentFacts, type Viewer } from './attachment-access';

/*
 * ใครเปิดไฟล์แนบได้ — ทุกข้อในนี้คือรูรั่วที่เคยมีอยู่จริง (ฟังก์ชันดาวน์โหลดไม่ตรวจผู้ขอเลย)
 */

const UPLOADER = 20;
const OTHER_REQUESTER = 21;
const STAFF = 31;

const file = (over: Partial<AttachmentFacts> = {}): AttachmentFacts => ({
  uploadedBy: UPLOADER,
  ticketId: 5,
  onInternalComment: false,
  kbArticleId: null,
  ...over,
});
const viewer = (userId: number, canSeeInternal = false): Viewer => ({ userId, canSeeInternal });

describe('canReadAttachment — ไฟล์ที่ผูกกับเรื่องแล้ว', () => {
  it('คนที่เห็นเรื่องได้ เปิดไฟล์ของเรื่องนั้นได้', () => {
    expect(canReadAttachment(file(), viewer(STAFF), true)).toBe(true);
  });

  it('⚠️ คนที่เห็นเรื่องไม่ได้ (บริษัทอื่น/นอกขอบเขต) เปิดไม่ได้ แม้รู้เลข id', () => {
    expect(canReadAttachment(file(), viewer(OTHER_REQUESTER), false)).toBe(false);
  });

  it('คนอัปโหลดเองเปิดได้เสมอ แม้ภายหลังเห็นเรื่องไม่ได้แล้ว', () => {
    expect(canReadAttachment(file(), viewer(UPLOADER), false)).toBe(true);
  });
});

describe('canReadAttachment — ไฟล์ที่ยังไม่ผูกกับอะไร (กำลังกรอกฟอร์ม)', () => {
  it('คนอัปโหลดเปิดได้ — ต้องเห็นตัวอย่างไฟล์ที่เพิ่งแนบ', () => {
    expect(canReadAttachment(file({ ticketId: null }), viewer(UPLOADER), false)).toBe(true);
  });

  it('⚠️ คนอื่นเปิดไม่ได้ แม้เป็นเจ้าหน้าที่ — ไฟล์ยังไม่ใช่ของเรื่องใด จึงไม่มีสิทธิ์จากเรื่อง', () => {
    expect(canReadAttachment(file({ ticketId: null }), viewer(STAFF, true), true)).toBe(false);
  });
});

describe('canReadAttachment — ไฟล์ในคอมเมนต์ภายใน', () => {
  const internal = file({ onInternalComment: true, uploadedBy: STAFF });

  it('⚠️ ผู้แจ้งเปิดรูปที่ทีมไอทีแนบในบันทึกภายในไม่ได้ ทั้งที่เห็นเรื่องได้', () => {
    expect(canReadAttachment(internal, viewer(UPLOADER, false), true)).toBe(false);
  });

  it('เจ้าหน้าที่ที่เห็นคอมเมนต์ภายในเปิดได้', () => {
    expect(canReadAttachment(internal, viewer(32, true), true)).toBe(true);
  });

  it('คนเขียนคอมเมนต์เองเปิดไฟล์ของตัวเองได้', () => {
    expect(canReadAttachment(internal, viewer(STAFF, false), true)).toBe(true);
  });
});

describe('canReadAttachment — ไฟล์ของคลังความรู้', () => {
  it('อ่านได้ทั้งองค์กร เหมือนตัวบทความ (พฤติกรรมเดิม ไม่เปลี่ยน)', () => {
    const kb = file({ ticketId: null, kbArticleId: 9, uploadedBy: STAFF });
    expect(canReadAttachment(kb, viewer(OTHER_REQUESTER), false)).toBe(true);
  });
});

describe('canReadAttachment — ไม่มีเจ้าของ', () => {
  it('uploadedBy เป็น null (ข้อมูลนำเข้า) ไม่ทำให้ใครเผลอผ่านเพราะ null === null', () => {
    expect(canReadAttachment(file({ uploadedBy: null, ticketId: null }), viewer(0), false)).toBe(false);
  });
});
