import { describe, expect, it } from 'vitest';

import { describeMissing, readSuperworkConfig } from './superwork.config';

const complete = {
  SUPERWORK_ENABLED: 'true',
  SUPERWORK_API_KEY: 'sw_live_0123456789abcdef',
  SUPERWORK_ACTIVITY_ID: 'e332265e-0d7f-46df-b4ea-7eea01d68f4a',
  SUPERWORK_CARD_ID: 'd1bf078c-f543-4bbf-9228-ec3948d57dff',
  SUPERWORK_MEMBER_IDS: 'b4cbe1d0-1f33-4b75-896a-12ab827309ab',
};

describe('describeMissing', () => {
  it('ตั้งครบ → ไม่มีอะไรขาด', () => {
    expect(describeMissing(readSuperworkConfig(complete))).toEqual([]);
  });

  it('ไม่มีคีย์ → บอกชื่อตัวแปร', () => {
    expect(describeMissing(readSuperworkConfig({ ...complete, SUPERWORK_API_KEY: '' }))).toEqual([
      'SUPERWORK_API_KEY',
    ]);
  });

  it('คีย์ยังเป็นข้อความตัวอย่างภาษาลาว → บอกว่าไม่ใช่คีย์จริง แทนที่จะไปล้มตอนส่ง', () => {
    const missing = describeMissing(readSuperworkConfig({ ...complete, SUPERWORK_API_KEY: 'ວາງຄີຢູ່ນີ້' }));
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain('SUPERWORK_API_KEY');
  });

  it('คีย์มีช่องว่างปน (วางมาพร้อมคำอธิบาย) → ไม่ผ่าน', () => {
    expect(describeMissing(readSuperworkConfig({ ...complete, SUPERWORK_API_KEY: 'key here' }))).toHaveLength(1);
  });
});
