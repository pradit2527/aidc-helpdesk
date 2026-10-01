import { describe, expect, it } from 'vitest';

import { exportFileName, toCsv, type UserCsvRow } from './user-csv';

const row = (over: Partial<UserCsvRow> = {}): UserCsvRow => ({
  username: 'somchai.k',
  full_name: 'ສົມໄຊ ກອງແກ້ວ',
  email: 'somchai.k@aidctech.com.la',
  employee_code: 'EMP-0042',
  job_title: 'IT Support',
  company_code: 'AIDC-TECH',
  department_name: 'IT Infra And Operations',
  roles: 'support_agent',
  is_active: true,
  is_locked: false,
  must_change_password: false,
  last_login_at: new Date('2026-09-30T02:15:00.000Z'),
  ...over,
});

const lines = (csv: string): string[] => csv.replace(/^﻿/, '').trimEnd().split('\r\n');

describe('toCsv — ไฟล์ต้องเปิดใน Excel บนเครื่องผู้ใช้ได้', () => {
  it('ขึ้นต้นด้วย BOM และจบบรรทัดด้วย CRLF', () => {
    const csv = toCsv([row()]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('\r\n');
  });

  it('หัวตารางมาก่อน แล้วหนึ่งแถวต่อหนึ่งคน', () => {
    const out = lines(toCsv([row(), row({ username: 'nary.p' })]));
    expect(out).toHaveLength(3);
    expect(out[0]).toContain('username');
    expect(out[1]).toContain('somchai.k');
    expect(out[2]).toContain('nary.p');
  });

  it('⚠️ ไม่มีคอลัมน์ใดเกี่ยวกับรหัสผ่าน', () => {
    const header = lines(toCsv([row()]))[0] ?? '';
    for (const word of ['password', 'hash', 'argon', 'ລະຫັດຜ່ານ']) {
      expect(header.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  it('สถานะรหัสตั้งต้นส่งออกเป็นใช่/ไม่ ไม่ใช่ตัวรหัส', () => {
    expect(lines(toCsv([row({ must_change_password: true })]))[1]).toContain('ແມ່ນ');
  });
});

describe('toCsv — ค่าที่ทำให้ไฟล์เพี้ยนหรืออันตราย', () => {
  it('ค่าที่มีจุลภาคถูกครอบด้วยอัญประกาศ ไม่งั้นคอลัมน์เลื่อนทั้งแถว', () => {
    const out = lines(toCsv([row({ job_title: 'Head of IT, Operations' })]))[1] ?? '';
    expect(out).toContain('"Head of IT, Operations"');
  });

  it('อัญประกาศในค่าถูกทำซ้ำตามกติกา RFC 4180', () => {
    const out = lines(toCsv([row({ full_name: 'ສົມໄຊ "ໄຊ" ກອງແກ້ວ' })]))[1] ?? '';
    expect(out).toContain('"ສົມໄຊ ""ໄຊ"" ກອງແກ້ວ"');
  });

  it('ขึ้นบรรทัดใหม่ในค่าไม่ทำให้ไฟล์ขาดเป็นสองแถว', () => {
    expect(lines(toCsv([row({ job_title: 'IT\nSupport' })]))).toHaveLength(2);
  });

  it('⚠️ ค่าที่ขึ้นต้นด้วย = + - @ ถูกกันไม่ให้ Excel ตีความเป็นสูตร', () => {
    const out = lines(toCsv([row({ full_name: '=HYPERLINK("http://evil","คลิก")' })]))[1] ?? '';
    expect(out).toContain(`"'=HYPERLINK`);
  });

  it('ค่าว่างออกมาเป็นช่องว่าง ไม่ใช่คำว่า null', () => {
    const out = lines(toCsv([row({ email: null, department_name: null })]))[1] ?? '';
    expect(out).not.toContain('null');
  });
});

describe('เวลาในไฟล์', () => {
  it('แปลงเป็นเวลาเวียงจันทน์ ไม่ใช่ UTC', () => {
    // 02:15 UTC = 09:15 ที่เวียงจันทน์ (+07:00)
    expect(lines(toCsv([row()]))[1]).toContain('2026-09-30 09:15');
  });

  it('คนที่ไม่เคยเข้าระบบอ่านออกว่ายังไม่เคยเข้า ไม่ใช่ช่องว่าง', () => {
    expect(lines(toCsv([row({ last_login_at: null })]))[1]).toContain('ຍັງບໍ່ເຄີຍເຂົ້າ');
  });

  it('ชื่อไฟล์มีวันที่ เรียงตามลำดับได้เมื่อเก็บหลายครั้ง', () => {
    expect(exportFileName(new Date('2026-10-01T03:00:00.000Z'))).toBe(
      'aidc-helpdesk-users-20261001.csv',
    );
  });
});
