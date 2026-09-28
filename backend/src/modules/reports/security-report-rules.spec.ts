import { describe, expect, it } from 'vitest';

import { reportNumber } from './iso-report-rules';
import {
  ACCESS_TARGETS,
  check,
  EVIDENCE_GAPS,
  securityStatus,
  SECURITY_REPORT_PREFIX,
  type SecurityCheck,
} from './security-report-rules';

const row = (code: string, status: SecurityCheck['status']): SecurityCheck => ({
  code,
  control: 'A.5.x',
  title: code,
  status,
  detail: '',
});

describe('check', () => {
  const base = { code: 'ACC-1', control: 'A.5.18', title: 'สิทธิ์หมดอายุ', detail: '0 รายการ' };

  it('จำนวนที่ไม่ควรมี: เท่ากับเพดานยังผ่าน เกินแล้วตก', () => {
    expect(check({ ...base, value: 0, atMost: 0 }).status).toBe('pass');
    expect(check({ ...base, value: 1, atMost: 0 }).status).toBe('fail');
  });

  it('เปอร์เซ็นต์: ถึงเป้าผ่าน ต่ำกว่าเป้าตก', () => {
    expect(check({ ...base, value: 100, atLeast: 100 }).status).toBe('pass');
    expect(check({ ...base, value: 99.9, atLeast: 100 }).status).toBe('fail');
  });

  it('ไม่มีตัวอย่างในเดือนนั้น → no_data ไม่ใช่ผ่าน', () => {
    expect(check({ ...base, value: null, atMost: 0 }).status).toBe('no_data');
    expect(check({ ...base, value: null, atLeast: 95 }).status).toBe('no_data');
  });

  it('ศูนย์คือค่าที่วัดได้ ไม่ใช่ไม่มีข้อมูล', () => {
    expect(check({ ...base, value: 0, atLeast: 95 }).status).toBe('fail');
  });
});

describe('securityStatus', () => {
  it('ทุกข้อผ่าน → on_target', () => {
    expect(securityStatus([row('SEC-1', 'pass'), row('ACC-1', 'pass')]).status).toBe('on_target');
  });

  it('เหตุความปลอดภัยเกินกำหนดแก้ไข → off_target ทันที', () => {
    const out = securityStatus([row('SEC-2', 'fail'), row('ACC-1', 'pass')]);
    expect(out.status).toBe('off_target');
    expect(out.failing).toEqual(['SEC-2']);
  });

  it('สิทธิ์หมดอายุที่ยังค้างอยู่ → off_target เพราะเป็นการควบคุมหลัก', () => {
    expect(securityStatus([row('ACC-1', 'fail')]).status).toBe('off_target');
  });

  it('ข้ออื่นตก → at_risk', () => {
    expect(securityStatus([row('ACC-2', 'fail'), row('SEC-1', 'pass')]).status).toBe('at_risk');
  });

  it('วัดไม่ได้เลยทั้งเดือน → no_data ไม่ใช่ผ่าน', () => {
    expect(securityStatus([row('SEC-1', 'no_data'), row('ACC-1', 'no_data')]).status).toBe('no_data');
  });

  it('ไม่มีข้อให้ตรวจเลย → no_data', () => {
    expect(securityStatus([]).status).toBe('no_data');
  });
});

describe('เลขที่เอกสาร', () => {
  it('ใช้คำนำหน้าของตัวเอง ไม่ชนกับรายงานบริการ', () => {
    const from = new Date('2026-09-01T00:00:00+07:00');
    const to = new Date('2026-10-01T00:00:00+07:00');
    expect(reportNumber(from, to, SECURITY_REPORT_PREFIX)).toBe('ISR-202609');
    expect(reportNumber(from, to)).toBe('SPR-202609');
  });
});

describe('ทะเบียนช่องว่างของหลักฐาน', () => {
  it('ทุกแถวบอกครบว่าขาดอะไรและต้องทำอะไร', () => {
    expect(EVIDENCE_GAPS.length).toBeGreaterThan(0);
    for (const gap of EVIDENCE_GAPS) {
      expect(gap.control).toMatch(/^A\./);
      expect(gap.missing.length).toBeGreaterThan(10);
      expect(gap.action.length).toBeGreaterThan(10);
    }
  });
});

describe('เกณฑ์การเข้าถึง', () => {
  it('สิทธิ์ที่หมดอายุแล้วต้องไม่เหลือค้างเลย', () => {
    expect(ACCESS_TARGETS.expiredGrantsAllowed).toBe(0);
  });
});
