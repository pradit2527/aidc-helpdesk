import { describe, expect, it } from 'vitest';

import { parseByteRange } from './byte-range';

const SIZE = 1000;

describe('parseByteRange', () => {
  it('ไม่มีหัว Range → null (ส่งทั้งไฟล์)', () => {
    expect(parseByteRange(undefined, SIZE)).toBeNull();
    expect(parseByteRange('', SIZE)).toBeNull();
  });

  it('"bytes=0-" คือสิ่งที่เบราว์เซอร์ส่งตอนเริ่มเล่นวิดีโอ → ตั้งแต่ต้นถึงท้ายไฟล์', () => {
    expect(parseByteRange('bytes=0-', SIZE)).toEqual({ start: 0, end: 999 });
  });

  it('ช่วงปกติ', () => {
    expect(parseByteRange('bytes=100-199', SIZE)).toEqual({ start: 100, end: 199 });
  });

  it('จุดสิ้นสุดเกินท้ายไฟล์ → ตัดที่ท้ายไฟล์ ไม่ใช่ผิดพลาด', () => {
    expect(parseByteRange('bytes=900-5000', SIZE)).toEqual({ start: 900, end: 999 });
  });

  it('"bytes=-200" = 200 ไบต์สุดท้าย (เครื่องเล่นบางตัวอ่านท้ายไฟล์ก่อนเพื่อหา moov atom)', () => {
    expect(parseByteRange('bytes=-200', SIZE)).toEqual({ start: 800, end: 999 });
  });

  it('suffix ยาวกว่าไฟล์ → ทั้งไฟล์', () => {
    expect(parseByteRange('bytes=-5000', SIZE)).toEqual({ start: 0, end: 999 });
  });

  it('เริ่มเกินท้ายไฟล์ → unsatisfiable (ตอบ 416)', () => {
    expect(parseByteRange('bytes=1000-', SIZE)).toBe('unsatisfiable');
    expect(parseByteRange('bytes=5000-6000', SIZE)).toBe('unsatisfiable');
  });

  it('suffix 0 ไบต์ → unsatisfiable', () => {
    expect(parseByteRange('bytes=-0', SIZE)).toBe('unsatisfiable');
  });

  it('หลายช่วง → ไม่รองรับ ส่งทั้งไฟล์ (มาตรฐานอนุญาตให้ละเลย Range ได้)', () => {
    expect(parseByteRange('bytes=0-10,20-30', SIZE)).toBeNull();
  });

  it('หน่วยอื่น หรือรูปแบบผิด → ส่งทั้งไฟล์ ไม่เดา', () => {
    expect(parseByteRange('items=0-5', SIZE)).toBeNull();
    expect(parseByteRange('bytes=abc-def', SIZE)).toBeNull();
    expect(parseByteRange('bytes=-', SIZE)).toBeNull();
  });

  it('จุดสิ้นสุดน้อยกว่าจุดเริ่ม → ส่งทั้งไฟล์', () => {
    expect(parseByteRange('bytes=500-100', SIZE)).toBeNull();
  });

  it('ไฟล์ว่าง → null', () => {
    expect(parseByteRange('bytes=0-', 0)).toBeNull();
  });
});
