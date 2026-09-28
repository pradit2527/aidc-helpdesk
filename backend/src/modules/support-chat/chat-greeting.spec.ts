import { describe, expect, it } from 'vitest';

import { CHAT_GREETING, GREETING_FRESH_MINUTES, shouldGreetWidget } from './chat-greeting';

const now = new Date('2026-09-28T10:00:00+07:00');
const minutesAgo = (m: number) => Math.floor((now.getTime() - m * 60_000) / 1000);
const fresh = { created: true, status: 'open', lastActivityAt: minutesAgo(1) };

describe('CHAT_GREETING — ข้อความต้อนรับ', () => {
  it('สั้นกว่าเพดานความยาวของข้อความแชท (4000 ตัวอักษร)', () => {
    expect(CHAT_GREETING.length).toBeLessThan(4000);
  });

  it('มีลิงก์หน้าแจ้งเรื่อง และไม่ใช่ลิงก์ในเครื่องนักพัฒนา', () => {
    expect(CHAT_GREETING).toContain('https://');
    expect(CHAT_GREETING).not.toContain('localhost');
  });

  it('หลายบรรทัด — หน้าเว็บต้องแสดงเป็นการ์ด ไม่ใช่บรรทัดเดียวกลางจอ', () => {
    expect(CHAT_GREETING.split('\n').length).toBeGreaterThan(1);
  });
});

describe('shouldGreetWidget — ทักห้องจาก widget เฉพาะของใหม่จริง', () => {
  it('ห้องใหม่ที่เพิ่งมีคนพิมพ์ → ทัก', () => {
    expect(shouldGreetWidget(fresh, now)).toBe(true);
  });

  it('ห้องที่มีอยู่แล้ว → ไม่ทักซ้ำ', () => {
    expect(shouldGreetWidget({ ...fresh, created: false }, now)).toBe(false);
  });

  it('บทสนทนาเก่าที่ตัวซิงก์เพิ่งกวาดเจอรอบแรก → ไม่ทัก', () => {
    expect(shouldGreetWidget({ ...fresh, lastActivityAt: minutesAgo(GREETING_FRESH_MINUTES + 1) }, now)).toBe(false);
  });

  it('บทสนทนาที่ปิดไปแล้ว → ไม่ทัก', () => {
    expect(shouldGreetWidget({ ...fresh, status: 'resolved' }, now)).toBe(false);
  });

  it('ไม่รู้เวลาความเคลื่อนไหวล่าสุด → ไม่ทัก (ไม่เดาว่าใหม่)', () => {
    expect(shouldGreetWidget({ ...fresh, lastActivityAt: null }, now)).toBe(false);
    expect(shouldGreetWidget({ created: true, status: 'open' }, now)).toBe(false);
  });

  it('นาฬิกาสองเครื่องไม่ตรงกันจนเวลาเป็นอนาคต → ยังถือว่าใหม่', () => {
    expect(shouldGreetWidget({ ...fresh, lastActivityAt: minutesAgo(-5) }, now)).toBe(true);
  });
});
