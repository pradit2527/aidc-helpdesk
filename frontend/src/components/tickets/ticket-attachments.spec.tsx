import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { TicketAttachment } from '@/lib/types';

import { TicketAttachments } from './ticket-attachments';

/*
 * หน้ารายละเอียดเรื่องแสดงไฟล์แนบของผู้แจ้งอย่างไร
 *
 * เรนเดอร์เป็น HTML แล้วตรวจโครงสร้าง — ไม่ผ่านเบราว์เซอร์ เพราะรูปและวิดีโอโหลดผ่านคุกกี้ล็อกอิน
 * ซึ่งทดสอบอัตโนมัติโดยไม่ล็อกอินแทนผู้ใช้จริงไม่ได้
 */

const file = (id: number, name: string, mime: string, size = 2048): TicketAttachment => ({
  id,
  file_name: name,
  file_size: size,
  mime_type: mime,
});

const html = (items: TicketAttachment[] | undefined): string =>
  renderToStaticMarkup(<TicketAttachments attachments={items} />);

describe('TicketAttachments', () => {
  it('ไม่มีไฟล์ → ไม่เรนเดอร์อะไรเลย (ไม่เหลือหัวข้อเปล่า ๆ)', () => {
    expect(html([])).toBe('');
  });

  it('API รุ่นเก่าไม่ส่งช่อง attachments มา → ไม่พังทั้งหน้า', () => {
    expect(html(undefined)).toBe('');
  });

  it('รูปภาพ → แสดงเป็นรูปจากโหมด inline และกดเปิดเต็มจอได้', () => {
    const out = html([file(7, 'error.png', 'image/png')]);
    expect(out).toContain('<img');
    expect(out).toContain('src="/api/v1/attachments/7/download?inline=1"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('วิดีโอ → เล่นในหน้าได้ โหลดแค่ metadata ก่อนกดเล่น', () => {
    const out = html([file(8, 'clip.mp4', 'video/mp4')]);
    expect(out).toContain('<video');
    expect(out).toContain('controls');
    expect(out).toContain('preload="metadata"');
    expect(out).toContain('src="/api/v1/attachments/8/download?inline=1"');
    expect(out).toContain('type="video/mp4"');
  });

  it('⚠️ PDF และ zip → ลิงก์ดาวน์โหลดเท่านั้น ไม่มี <img> <video> หรือ ?inline', () => {
    const out = html([
      file(9, 'report.pdf', 'application/pdf'),
      file(10, 'logs.zip', 'application/zip'),
    ]);
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<video');
    expect(out).not.toContain('inline=1');
  });

  it('⚠️ SVG ไม่ถูกแสดงเป็นรูป แม้ชื่อไฟล์จะดูเป็นรูป — สคริปต์ใน SVG รันในโดเมนเราได้', () => {
    const out = html([file(11, 'logo.svg', 'image/svg+xml')]);
    expect(out).not.toContain('<img');
    expect(out).not.toContain('inline=1');
  });

  it('ทุกชิ้นมีลิงก์ดาวน์โหลดเสมอ แม้แสดงในหน้าได้ (ทางออกเมื่อวิดีโอ .mov เล่นในเบราว์เซอร์ไม่ได้)', () => {
    const out = html([file(7, 'a.png', 'image/png'), file(8, 'b.mov', 'video/quicktime')]);
    expect(out).toContain('href="/api/v1/attachments/7/download"');
    expect(out).toContain('href="/api/v1/attachments/8/download"');
    expect(out).toContain('download="b.mov"');
  });

  it('แสดงจำนวนไฟล์ ชื่อ และขนาด', () => {
    const out = html([
      file(7, 'screenshot.png', 'image/png', 1536),
      file(8, 'clip.mp4', 'video/mp4', 5 * 1024 * 1024),
    ]);
    expect(out).toContain('(2)');
    expect(out).toContain('screenshot.png');
    expect(out).toContain('clip.mp4');
  });
});
