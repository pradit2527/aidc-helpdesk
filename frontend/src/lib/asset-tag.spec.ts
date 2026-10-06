import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { categoryNeedsAssetTag } from './asset-tag';

/*
 * กฎ "เรื่องไหนต้องถามเลขทรัพย์สิน"
 *
 * ชุดสุดท้ายอ่านรายชื่อหมวดจาก seed ของ backend จริง ๆ ไม่ใช่รายการที่เขียนซ้ำในไฟล์นี้
 * ถ้ามีคนเพิ่มหมวดย่อยใต้หมวดอุปกรณ์ แล้วลืมนึกว่ามันควรซ่อนช่องหรือเปล่า เทสต์ข้อสุดท้ายจะบอก
 */

describe('categoryNeedsAssetTag — ตามหมวดหลัก', () => {
  it('ยังไม่เลือกหมวด → ซ่อน', () => {
    expect(categoryNeedsAssetTag(null, null)).toBe(false);
    expect(categoryNeedsAssetTag(undefined, undefined)).toBe(false);
  });

  it('หมวดอุปกรณ์ที่เสีย (HARDWARE) → แสดง แม้ยังไม่เลือกหมวดย่อย', () => {
    expect(categoryNeedsAssetTag('HARDWARE', null)).toBe(true);
  });

  it('หมวดคำขออุปกรณ์ (SR_EQUIPMENT) → แสดง', () => {
    expect(categoryNeedsAssetTag('SR_EQUIPMENT', null)).toBe(true);
  });

  it.each([
    'ACCESS',
    'SOFTWARE',
    'NETWORK',
    'COMMUNICATION',
    'SECURITY',
    'SR_DATA',
    'SR_ADVISORY',
    'MAGIC',
  ])('หมวด %s ไม่เกี่ยวกับตัวเครื่อง → ซ่อน', (code) => {
    expect(categoryNeedsAssetTag(code, null)).toBe(false);
  });
});

describe('categoryNeedsAssetTag — หมวดย่อยชนะหมวดหลัก', () => {
  it('เตรียมคอมพิวเตอร์ให้พนักงานใหม่ อยู่ใต้ LIFECYCLE แต่เป็นเรื่องตัวเครื่อง → แสดง', () => {
    expect(categoryNeedsAssetTag('LIFECYCLE', 'LIFECYCLE_NEW_PC')).toBe(true);
  });

  it('เปิดบัญชีพนักงานใหม่ (LIFECYCLE_ONBOARD) ไม่ใช่เรื่องตัวเครื่อง → ซ่อน', () => {
    expect(categoryNeedsAssetTag('LIFECYCLE', 'LIFECYCLE_ONBOARD')).toBe(false);
  });

  it('อุปกรณ์สูญหายอยู่ใต้ SECURITY แต่ต้องรู้ว่าเครื่องไหน → แสดง', () => {
    expect(categoryNeedsAssetTag('SECURITY', 'SECURITY_DEVICE_LOST')).toBe(true);
  });

  it('เหตุความปลอดภัยอื่นใน SECURITY → ซ่อน', () => {
    expect(categoryNeedsAssetTag('SECURITY', 'SECURITY_PHISHING')).toBe(false);
  });

  it.each(['MOBILE_SIM', 'CCTV_PLAYBACK'])(
    '%s อยู่ใต้หมวดอุปกรณ์ แต่ไม่มีตัวเครื่องให้ติดเลข → ซ่อน',
    (sub) => {
      expect(categoryNeedsAssetTag('SR_EQUIPMENT', sub)).toBe(false);
    },
  );

  it('หมวดย่อยที่ไม่รู้จักใต้หมวดอุปกรณ์ → แสดงโดยปริยาย (ผิดทางที่ปลอดภัย)', () => {
    expect(categoryNeedsAssetTag('HARDWARE', 'HARDWARE_SOMETHING_NEW')).toBe(true);
  });

  it('หมวดย่อยที่ไม่รู้จักใต้หมวดอื่น → ซ่อน', () => {
    expect(categoryNeedsAssetTag('ACCESS', 'ACCESS_SOMETHING_NEW')).toBe(false);
  });
});

describe('ตรวจกับรายชื่อหมวดจริงใน seed ของ backend', () => {
  const seed = readFileSync(
    join(__dirname, '../../../backend/src/db/seed/data/catalog.ts'),
    'utf8',
  );

  const subs = [...seed.matchAll(/parentCode: '([A-Z_]+)', code: '([A-Z_]+)'/g)].map((m) => ({
    parent: m[1] as string,
    code: m[2] as string,
  }));

  it('อ่านหมวดย่อยจาก seed ได้ (กันเทสต์ว่างเปล่าเงียบ ๆ ถ้ารูปแบบไฟล์เปลี่ยน)', () => {
    expect(subs.length).toBeGreaterThan(50);
  });

  it('หมวดย่อยทุกใบใต้ HARDWARE แสดงช่อง — เหตุขัดข้องของอุปกรณ์ต้องบอกได้ว่าเครื่องไหน', () => {
    const wrong = subs.filter(
      (s) => s.parent === 'HARDWARE' && !categoryNeedsAssetTag(s.parent, s.code),
    );
    expect(wrong.map((s) => s.code)).toEqual([]);
  });

  it('ใต้ SR_EQUIPMENT ซ่อนเฉพาะสองใบที่ตั้งใจไว้ ที่เหลือแสดง', () => {
    const hidden = subs
      .filter((s) => s.parent === 'SR_EQUIPMENT' && !categoryNeedsAssetTag(s.parent, s.code))
      .map((s) => s.code)
      .sort();
    expect(hidden).toEqual(['CCTV_PLAYBACK', 'MOBILE_SIM']);
  });

  it('หมวดย่อยที่ระบุไว้ว่าเป็นเรื่องตัวเครื่องมีอยู่จริงใน seed — กันรหัสสะกดผิดแล้วกฎไม่ทำงาน', () => {
    const codes = new Set(subs.map((s) => s.code));
    for (const code of [
      'LIFECYCLE_NEW_PC',
      'SECURITY_DEVICE_LOST',
      'MOBILE_SIM',
      'CCTV_PLAYBACK',
    ]) {
      expect(codes.has(code), code).toBe(true);
    }
  });

  it('หมวดย่อยนอกกลุ่มอุปกรณ์ที่แสดงช่อง มีแค่สองใบที่ตั้งใจ (ไม่มีอะไรแอบเข้ามา)', () => {
    const shown = subs
      .filter(
        (s) =>
          !['HARDWARE', 'SR_EQUIPMENT'].includes(s.parent) &&
          categoryNeedsAssetTag(s.parent, s.code),
      )
      .map((s) => s.code)
      .sort();
    expect(shown).toEqual(['LIFECYCLE_NEW_PC', 'SECURITY_DEVICE_LOST']);
  });
});
