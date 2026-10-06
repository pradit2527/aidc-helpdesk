import { createElement as h, forwardRef, Fragment, useMemo, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { cellText, compareCells, hasComponent, parseNumber } from './cell-text';

describe('cellText — ดึงข้อความที่ผู้ใช้เห็นจากเซลล์', () => {
  it('ข้อความและตัวเลขธรรมดา', () => {
    expect(cellText('ສະບາຍດີ')).toBe('ສະບາຍດີ');
    expect(cellText(42)).toBe('42');
    expect(cellText(0)).toBe('0');
  });

  it('ค่าที่ไม่แสดงผล (null · undefined · boolean) → ว่าง', () => {
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
    expect(cellText(false)).toBe('');
    expect(cellText(true)).toBe('');
  });

  it('องค์ประกอบ HTML ซ้อนกัน → ข้อความข้างใน', () => {
    const cell = h('span', { className: 'tabular font-semibold' }, h('b', null, '95.2'), '%');
    expect(cellText(cell)).toBe('95.2%');
  });

  it('อาร์เรย์และ Fragment ต่อกันตามลำดับ', () => {
    expect(cellText(['A', ' ', 'B'])).toBe('A B');
    expect(cellText(h(Fragment, null, 'x', h('i', null, 'y')))).toBe('xy');
  });

  it('⚠️ ไม่เรียกฟังก์ชันคอมโพเนนต์เลย — ป้ายที่เอาข้อความจาก props อ่านออกเป็นว่าง (คอลัมน์ต้องส่ง text เอง)', () => {
    const Chip = vi.fn(({ ok }: { ok: boolean }) => h('span', null, ok ? 'ຜ່ານ' : 'ຕົກ'));
    expect(cellText(h(Chip, { ok: true }))).toBe('');
    expect(Chip).not.toHaveBeenCalled();
  });

  it('คอมโพเนนต์ที่ครอบข้อความไว้เป็นลูก → อ่านลูกได้ (เช่น ลิงก์เลขที่เรื่อง)', () => {
    const Wrapper = ({ children }: { children?: string }) => h('a', null, children);
    expect(cellText(h(Wrapper, null, 'IT-2569-0001'))).toBe('IT-2569-0001');
    // next/link เป็น forwardRef — ต้องผ่านเหมือนกัน
    const Linky = forwardRef<HTMLAnchorElement, { children?: string }>((props, ref) =>
      h('a', { ref }, props.children),
    );
    expect(cellText(h(Linky, null, 'IT-2569-0002'))).toBe('IT-2569-0002');
  });

  it('⚠️ regression: ใช้ใน useMemo ระหว่าง render จริงกับคอมโพเนนต์ที่มี hook ต้องไม่พังและไม่ยุ่งกับ hook ของตาราง', () => {
    // รุ่นแรกเรียกคอมโพเนนต์ตรง ๆ — นอก render ไม่มี dispatcher จึงจับ hook ได้และเทสต์ผ่าน
    // แต่ใน render จริง hook ของมันถูกผูกเข้ากับตาราง แล้วหน้าล้มด้วย areHookInputsEqual
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Hooky = vi.fn((_props: { children?: string }) => {
      useState(0);
      useMemo(() => 1, []);
      return h('span', null, 'ไม่ควรเห็นข้อความนี้');
    });
    function Host() {
      const text = useMemo(
        () => cellText(h('b', null, h(Hooky, null, 'IT-2569-0003'), ' · ', h(Hooky, null, 'x'))),
        [],
      );
      useState('hook ของตารางต้องไม่ถูกแย่ง');
      return h('p', null, text);
    }
    expect(renderToString(h(Host))).toContain('IT-2569-0003 · x');
    expect(Hooky).not.toHaveBeenCalled();
    expect(quiet).not.toHaveBeenCalled();
    quiet.mockRestore();
  });

  it('⚠️ องค์ประกอบสองตัวติดกันคั่นด้วยช่องว่าง (รหัสบริษัท + ชื่อเต็ม) แต่ข้อความล้วนไม่ถูกแยก', () => {
    const company = h(
      'span',
      null,
      h('span', null, 'AIDC-TECH'),
      h('span', { className: 'block' }, 'ບໍລິສັດ ເອໄອດີຊີ'),
    );
    expect(cellText(company)).toBe('AIDC-TECH ບໍລິສັດ ເອໄອດີຊີ');
    expect(cellText(h('span', null, '95.', h('b', null, '2'), '%'))).toBe('95.2%');
    expect(cellText(h('span', null, h('b', null, '95.2'), '%'))).toBe('95.2%');
  });

  it('ไอคอนหรือค่าเงื่อนไขที่ไม่แสดงผลคั่นกลาง ไม่ทำให้เกิดช่องว่างเกินหรือคำติดกัน', () => {
    const Icon = () => h('svg');
    expect(
      cellText(h('span', null, h(Icon), h('b', null, 'A'), false, null, h('i', null, 'B'))),
    ).toBe('A B');
  });

  it('ช่องว่างซ้อนและขึ้นบรรทัดใหม่ถูกยุบเหลือช่องเดียว', () => {
    expect(cellText(h('div', null, '  A \n\n  B  '))).toBe('A B');
  });

  it('ไอคอนที่ไม่มีข้อความไม่ทำให้เซลล์เพี้ยน', () => {
    expect(cellText(h('span', null, h('svg', { width: 12 }), '12 ຊມ.'))).toBe('12 ຊມ.');
  });
});

describe('hasComponent', () => {
  const Chip = () => h('span', null, 'x');

  it('HTML ล้วนและข้อความ → ไม่มีคอมโพเนนต์', () => {
    expect(hasComponent('a')).toBe(false);
    expect(hasComponent(h('span', null, h('b', null, '1'), '%'))).toBe(false);
    expect(hasComponent(null)).toBe(false);
  });

  it('เจอคอมโพเนนต์ทั้งที่ชั้นนอกและซ้อนลึก', () => {
    expect(hasComponent(h(Chip))).toBe(true);
    expect(hasComponent(h('span', null, 'ก', h(Fragment, null, h(Chip))))).toBe(true);
    expect(hasComponent(['ก', h(Chip, { key: 'a' })])).toBe(true);
  });
});

describe('parseNumber', () => {
  it.each([
    ['1,234', 1234],
    ['95.2%', 95.2],
    ['-3', -3],
    ['+7', 7],
    ['.5', 0.5],
    ['0', 0],
  ])('"%s" → %s', (text, value) => {
    expect(parseNumber(text)).toBe(value);
  });

  it.each(['3 ມື້ 14 ຊມ.', 'P1', '12 ນາທີ', '', '—', '1.2.3', 'abc'])(
    '"%s" → ไม่ใช่ตัวเลขล้วน',
    (text) => {
      expect(parseNumber(text)).toBeNull();
    },
  );
});

describe('compareCells — เรียงลำดับ', () => {
  const sort = (values: string[], dir: 'asc' | 'desc') =>
    [...values].sort((a, b) => compareCells(a, b, dir));

  it('⚠️ ตัวเลขเรียงเป็นตัวเลข ไม่ใช่ตัวอักษร — "100" ต้องมากกว่า "9"', () => {
    expect(sort(['100', '9', '25', '1,000'], 'asc')).toEqual(['9', '25', '100', '1,000']);
    expect(sort(['100', '9', '25', '1,000'], 'desc')).toEqual(['1,000', '100', '25', '9']);
  });

  it('เปอร์เซ็นต์เทียบเป็นตัวเลข', () => {
    expect(sort(['95.2%', '100%', '60%'], 'asc')).toEqual(['60%', '95.2%', '100%']);
  });

  it('⚠️ เซลล์ว่างอยู่ท้ายเสมอ ทั้งเรียงขึ้นและลง', () => {
    expect(sort(['5', '—', '3', '', '9'], 'asc')).toEqual(['3', '5', '9', '—', '']);
    expect(sort(['5', '—', '3', '', '9'], 'desc')).toEqual(['9', '5', '3', '—', '']);
  });

  it('ข้อความที่มีตัวเลขปน เรียงแบบรู้จักตัวเลข ("ข้อ 2" มาก่อน "ข้อ 10")', () => {
    expect(sort(['ຂໍ້ 10', 'ຂໍ້ 2', 'ຂໍ້ 1'], 'asc')).toEqual(['ຂໍ້ 1', 'ຂໍ້ 2', 'ຂໍ້ 10']);
  });

  it('ระดับความสำคัญ P1–P4 เรียงตามเลข', () => {
    expect(sort(['P3', 'P1', 'P4', 'P2'], 'asc')).toEqual(['P1', 'P2', 'P3', 'P4']);
  });

  it('รับค่าที่เป็นตัวเลขจริงจาก sortValue ได้ตรง ๆ', () => {
    expect(compareCells(3, 10, 'asc')).toBeLessThan(0);
    expect(compareCells(3, 10, 'desc')).toBeGreaterThan(0);
  });

  it('null จาก sortValue ถือเป็นว่าง → ท้ายเสมอ', () => {
    expect(compareCells(null, 5, 'asc')).toBeGreaterThan(0);
    expect(compareCells(null, 5, 'desc')).toBeGreaterThan(0);
  });

  it('เท่ากัน → 0 (ให้ sort ที่เสถียรคงลำดับเดิมไว้)', () => {
    expect(compareCells('5', '5', 'asc')).toBe(0);
    expect(compareCells('', '—', 'asc')).toBe(0);
  });
});
