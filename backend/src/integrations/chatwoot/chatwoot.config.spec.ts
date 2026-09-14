import { describe, expect, it } from 'vitest';

import { chatwootIdentifierHash, readChatwootConfig } from './chatwoot.config';

describe('chatwootIdentifierHash', () => {
  it('ตรงกับค่าอ้างอิงที่รู้ผลแน่นอนของ HMAC-SHA256', () => {
    // ตัวอย่างมาตรฐานที่ใช้ตรวจ HMAC-SHA256 กันทั่วไป — ถ้าไม่ตรง Chatwoot จะปฏิเสธทุกคน
    expect(
      chatwootIdentifierHash('key', 'The quick brown fox jumps over the lazy dog'),
    ).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });

  it('ผู้ใช้คนละคนได้รหัสคนละค่า และคนเดิมได้ค่าเดิมทุกครั้ง', () => {
    const a = chatwootIdentifierHash('secret', 'demo.enduser');
    expect(chatwootIdentifierHash('secret', 'demo.enduser')).toBe(a);
    expect(chatwootIdentifierHash('secret', 'demo.agent')).not.toBe(a);
  });
});

describe('readChatwootConfig', () => {
  it('ตัดช่องว่างรอบค่า และคืนค่าว่างเมื่อไม่ได้ตั้ง', () => {
    expect(readChatwootConfig({ CHATWOOT_HMAC_TOKEN: '  abc  ' }).hmacToken).toBe('abc');
    expect(readChatwootConfig({}).hmacToken).toBe('');
  });
});
