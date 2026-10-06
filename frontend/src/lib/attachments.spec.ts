import { describe, expect, it } from 'vitest';

import { attachmentKind, attachmentUrl } from './attachments';

describe('attachmentKind', () => {
  it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])('%s → image', (mime) => {
    expect(attachmentKind(mime)).toBe('image');
  });

  it.each(['video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp'])('%s → video', (mime) => {
    expect(attachmentKind(mime)).toBe('video');
  });

  it.each(['image/svg+xml', 'application/pdf', 'application/zip', 'text/plain', 'text/html', ''])(
    '⚠️ "%s" → file (ลิงก์ดาวน์โหลด ไม่ใช่แสดงในหน้า)',
    (mime) => {
      expect(attachmentKind(mime)).toBe('file');
    },
  );
});

describe('attachmentUrl', () => {
  it('ดาวน์โหลดเป็นค่าเริ่มต้น', () => {
    expect(attachmentUrl(88)).toBe('/api/v1/attachments/88/download');
  });

  it('inline ต่อ query ให้ถูกต้อง', () => {
    expect(attachmentUrl(88, true)).toBe('/api/v1/attachments/88/download?inline=1');
  });
});
