import { describe, expect, it } from 'vitest';

import { classifyUpload, MAX_UPLOAD_BYTES, rejectionMessage, UPLOAD_ACCEPT } from './upload-rules';

const f = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('classifyUpload — รูปภาพ', () => {
  it.each([
    ['a.png', 'image/png'],
    ['a.jpg', 'image/jpeg'],
    ['a.gif', 'image/gif'],
    ['a.webp', 'image/webp'],
  ])('%s → รับเป็นรูป', (name, type) => {
    expect(classifyUpload(f(name, type))).toEqual({ ok: true, kind: 'image' });
  });

  it('Windows ส่ง type ว่างมาให้ — ใช้นามสกุลตัดสิน', () => {
    expect(classifyUpload(f('screenshot.png', ''))).toEqual({ ok: true, kind: 'image' });
  });

  it('⚠️ HEIC จาก iPhone ถูกปัดตกพร้อมเหตุผลเฉพาะ — ไม่ใช่ "ชนิดไม่รองรับ" เฉย ๆ', () => {
    expect(classifyUpload(f('IMG_0001.HEIC', 'image/heic'))).toEqual({ ok: false, reason: 'heic' });
    expect(classifyUpload(f('IMG_0001.heic', ''))).toEqual({ ok: false, reason: 'heic' });
  });

  it('รูปชนิดอื่นที่ backend ไม่รับ (bmp · svg) → image_format', () => {
    expect(classifyUpload(f('a.bmp', 'image/bmp'))).toEqual({ ok: false, reason: 'image_format' });
    expect(classifyUpload(f('a.svg', 'image/svg+xml'))).toEqual({
      ok: false,
      reason: 'image_format',
    });
  });
});

describe('classifyUpload — วิดีโอ', () => {
  it.each([
    ['clip.mp4', 'video/mp4'],
    ['IMG_1.mov', 'video/quicktime'],
    ['clip.webm', 'video/webm'],
    ['clip.3gp', 'video/3gpp'],
  ])('%s → รับเป็นวิดีโอ', (name, type) => {
    expect(classifyUpload(f(name, type))).toEqual({ ok: true, kind: 'video' });
  });

  it('.mov ที่ Windows ไม่รู้จักชนิด (type ว่าง) → ยังรับ', () => {
    expect(classifyUpload(f('IMG_1.MOV', ''))).toEqual({ ok: true, kind: 'video' });
  });

  it('วิดีโอรูปแบบที่ backend ไม่รับ (avi · mkv · wmv) → video_format', () => {
    expect(classifyUpload(f('a.avi', 'video/x-msvideo'))).toEqual({
      ok: false,
      reason: 'video_format',
    });
    expect(classifyUpload(f('a.mkv', 'video/x-matroska'))).toEqual({
      ok: false,
      reason: 'video_format',
    });
  });
});

describe('classifyUpload — เอกสาร', () => {
  it.each(['a.pdf', 'a.docx', 'a.xlsx', 'a.pptx', 'a.zip', 'a.txt', 'a.csv'])(
    '%s → รับเป็นเอกสาร',
    (name) => {
      expect(classifyUpload(f(name, 'application/octet-stream'))).toEqual({
        ok: true,
        kind: 'document',
      });
    },
  );

  it('⚠️ .doc / .xls แบบเก่า backend ไม่รับ (ไม่ใช่ zip) → บอกให้บันทึกเป็นแบบใหม่', () => {
    expect(classifyUpload(f('a.doc', 'application/msword'))).toEqual({
      ok: false,
      reason: 'legacy_office',
    });
    expect(classifyUpload(f('a.xls', 'application/vnd.ms-excel'))).toEqual({
      ok: false,
      reason: 'legacy_office',
    });
  });

  it('ไฟล์ที่ไม่รู้จักเลย (.exe) → type', () => {
    expect(classifyUpload(f('setup.exe', 'application/x-msdownload'))).toEqual({
      ok: false,
      reason: 'type',
    });
  });
});

describe('classifyUpload — ขนาด', () => {
  it('พอดี 20 MB → ผ่าน', () => {
    expect(classifyUpload(f('a.mp4', 'video/mp4', MAX_UPLOAD_BYTES)).ok).toBe(true);
  });

  it('เกิน 20 MB แม้เป็นชนิดที่ถูก → too_big (เช็กขนาดก่อนชนิด)', () => {
    expect(classifyUpload(f('a.mp4', 'video/mp4', MAX_UPLOAD_BYTES + 1))).toEqual({
      ok: false,
      reason: 'too_big',
    });
  });
});

describe('rejectionMessage + UPLOAD_ACCEPT', () => {
  it('ทุกเหตุผลมีข้อความ และมีชื่อไฟล์ — ผู้ใช้เลือกหลายไฟล์พร้อมกันได้ ต้องรู้ว่าไฟล์ไหน', () => {
    for (const reason of [
      'too_big',
      'heic',
      'video_format',
      'image_format',
      'legacy_office',
      'type',
    ] as const) {
      expect(rejectionMessage('x.bin', reason)).toContain('x.bin');
    }
  });

  it('accept ของช่องเลือกไฟล์ไม่เปิดกว้างเกิน backend (ไม่มี image/* หรือ video/* เปล่า ๆ)', () => {
    expect(UPLOAD_ACCEPT).not.toMatch(/(^|,)image\/\*/);
    expect(UPLOAD_ACCEPT).not.toMatch(/(^|,)video\/\*/);
    expect(UPLOAD_ACCEPT).toContain('video/mp4');
    expect(UPLOAD_ACCEPT).not.toContain('.doc,');
  });
});
