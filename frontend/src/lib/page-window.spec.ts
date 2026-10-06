import { describe, expect, it } from 'vitest';

import { pageWindow } from './page-window';

describe('pageWindow', () => {
  it('หน้าน้อย (≤ 7) แสดงครบทุกหน้า ไม่มี …', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('ต้นทาง: 1 2 3 4 5 … สุดท้าย', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5, null, 20]);
    expect(pageWindow(4, 20)).toEqual([1, 2, 3, 4, 5, null, 20]);
  });

  it('กลางทาง: 1 … ก่อน ปัจจุบัน ถัดไป … สุดท้าย', () => {
    expect(pageWindow(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
  });

  it('ปลายทาง: 1 … ห้าหน้าสุดท้าย', () => {
    expect(pageWindow(17, 20)).toEqual([1, null, 16, 17, 18, 19, 20]);
    expect(pageWindow(20, 20)).toEqual([1, null, 16, 17, 18, 19, 20]);
  });

  it('ยาวเจ็ดช่องเสมอเมื่อมีหน้ามาก — แถบไม่ขยับความกว้างตอนเปลี่ยนหน้า', () => {
    for (let p = 1; p <= 50; p += 1) expect(pageWindow(p, 50)).toHaveLength(7);
  });

  it('หน้าปัจจุบันอยู่ในรายการเสมอ และไม่มีเลขซ้ำ', () => {
    for (let p = 1; p <= 30; p += 1) {
      const w = pageWindow(p, 30).filter((n): n is number => n !== null);
      expect(w).toContain(p);
      expect(new Set(w).size).toBe(w.length);
    }
  });
});
