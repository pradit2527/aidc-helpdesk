import { describe, expect, it } from 'vitest';

import { detectFileType, isInlineSafeMime } from './file-type';

/** สร้างหัวไฟล์ ISO base media: [ขนาดกล่อง 4 ไบต์]["ftyp"][brand] ตามด้วยข้อมูลสุ่ม */
function isoHead(brand: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x20]),
    Buffer.from('ftyp', 'latin1'),
    Buffer.from(brand, 'latin1'),
    Buffer.alloc(20, 0x41),
  ]);
}

describe('detectFileType — วิดีโอ', () => {
  it.each([
    ['isom', 'video/mp4', 'mp4'],
    ['mp42', 'video/mp4', 'mp4'], // กล้องมือถือ Android ส่วนใหญ่
    ['avc1', 'video/mp4', 'mp4'],
    ['qt  ', 'video/quicktime', 'mov'], // iPhone
    ['3gp4', 'video/3gpp', '3gp'],
  ])('brand "%s" → %s', (brand, mime, ext) => {
    expect(detectFileType(isoHead(brand), 'clip.bin')).toEqual({ mime, ext });
  });

  it('WebM (ลายเซ็น EBML) → video/webm', () => {
    const head = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(28, 0)]);
    expect(detectFileType(head, 'clip.webm')).toEqual({ mime: 'video/webm', ext: 'webm' });
  });

  it('⚠️ ไฟล์ภาพ HEIC (รูปจาก iPhone) ใช้โครงเดียวกันแต่ต้องไม่ถูกนับเป็นวิดีโอ', () => {
    for (const brand of ['heic', 'heix', 'mif1', 'avif', 'msf1']) {
      expect(detectFileType(isoHead(brand), 'photo.heic'), brand).toBeNull();
    }
  });

  it('ไม่เชื่อนามสกุล — ไฟล์ที่ชื่อ .mp4 แต่ไม่มีลายเซ็นวิดีโอ ถูกปฏิเสธ', () => {
    expect(detectFileType(Buffer.alloc(32, 0x41), 'fake.mp4')).toBeNull();
  });

  it('ไฟล์สั้นกว่าหัวที่ต้องอ่าน ไม่พังและไม่ถูกนับเป็นวิดีโอ', () => {
    expect(detectFileType(Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74]), 'x.mp4')).toBeNull();
  });

  it('ชนิดเดิมยังทำงาน — PNG และ JPEG', () => {
    expect(
      detectFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), 'a.png')?.mime,
    ).toBe('image/png');
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]), 'a.jpg')?.mime).toBe(
      'image/jpeg',
    );
  });
});

describe('isInlineSafeMime — ชนิดที่เปิดในหน้าเว็บได้โดยไม่มีทางรันสคริปต์', () => {
  it.each([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/3gpp',
  ])('%s → เปิดในหน้าได้', (mime) => {
    expect(isInlineSafeMime(mime)).toBe(true);
  });

  it.each(['image/svg+xml', 'text/html', 'application/pdf', 'application/zip', 'text/plain', 'image/svg', ''])(
    '⚠️ "%s" → ต้องดาวน์โหลดอย่างเดียว',
    (mime) => {
      expect(isInlineSafeMime(mime)).toBe(false);
    },
  );
});
