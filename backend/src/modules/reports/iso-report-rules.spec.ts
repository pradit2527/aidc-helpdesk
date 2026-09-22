import { describe, expect, it } from 'vitest';

import {
  canSeeWholeTeam,
  csatPoints,
  localMonthStart,
  overallStatus,
  percentOf,
  previousPeriod,
  reportNumber,
  TEAM_KPI,
  teamKpiScore,
  teamKpiVerdicts,
  wholeLocalMonth,
} from './iso-report-rules';

/** ขอบเดือนตามเวลาเวียงจันทน์ — แบบเดียวกับที่หน้ารายงานส่งมา */
const sep = { from: new Date('2026-09-01T00:00:00+07:00'), to: new Date('2026-10-01T00:00:00+07:00') };

describe('ขอบเดือนตามเวลาเวียงจันทน์', () => {
  it('วันที่ 1 เวลา 00:00 ท้องถิ่น = 17:00 UTC ของวันก่อน', () => {
    expect(localMonthStart(2026, 8).toISOString()).toBe('2026-08-31T17:00:00.000Z');
  });

  it('เดือนเต็มถูกจำได้ แม้ค่าที่ส่งมาเป็น UTC', () => {
    expect(wholeLocalMonth(sep.from, sep.to)).toEqual({ year: 2026, month: 8 });
    expect(
      wholeLocalMonth(new Date('2026-08-31T17:00:00Z'), new Date('2026-09-30T17:00:00Z')),
    ).toEqual({ year: 2026, month: 8 });
  });

  it('ขอบเดือนแบบ UTC ไม่นับเป็นเดือนเต็ม — จะดึงงาน 7 ชั่วโมงแรกของวันที่ 1 ไปผิดเดือน', () => {
    expect(
      wholeLocalMonth(new Date('2026-09-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z')),
    ).toBeNull();
  });

  it('ช่วงที่ยาวไม่ครบเดือนไม่นับเป็นเดือนเต็ม', () => {
    expect(wholeLocalMonth(sep.from, new Date('2026-09-15T00:00:00+07:00'))).toBeNull();
  });
});

describe('previousPeriod — ช่วงที่ใช้เทียบแนวโน้ม', () => {
  it('เดือนเต็มเทียบกับเดือนก่อนหน้าทั้งเดือน', () => {
    const prev = previousPeriod(sep.from, sep.to);
    expect(prev.from.toISOString()).toBe(new Date('2026-08-01T00:00:00+07:00').toISOString());
    expect(prev.to.toISOString()).toBe(sep.from.toISOString());
  });

  it('มีนาคมเทียบกุมภาพันธ์ทั้งเดือน ไม่ใช่ 31 วันก่อนหน้าที่กินถึงมกราคม', () => {
    const prev = previousPeriod(
      new Date('2026-03-01T00:00:00+07:00'),
      new Date('2026-04-01T00:00:00+07:00'),
    );
    expect(prev.from.toISOString()).toBe(new Date('2026-02-01T00:00:00+07:00').toISOString());
  });

  it('มกราคมย้อนข้ามปีไปธันวาคม', () => {
    const prev = previousPeriod(
      new Date('2027-01-01T00:00:00+07:00'),
      new Date('2027-02-01T00:00:00+07:00'),
    );
    expect(prev.from.toISOString()).toBe(new Date('2026-12-01T00:00:00+07:00').toISOString());
  });

  it('ช่วงอื่นใช้ความยาวเท่ากันที่ติดกันด้านหน้า', () => {
    const from = new Date('2026-09-10T00:00:00+07:00');
    const to = new Date('2026-09-17T00:00:00+07:00');
    const prev = previousPeriod(from, to);
    expect(prev.to.getTime()).toBe(from.getTime());
    expect(to.getTime() - from.getTime()).toBe(prev.to.getTime() - prev.from.getTime());
  });
});

describe('reportNumber — เลขที่เอกสาร (ISO/IEC 20000-1 §7.5.2)', () => {
  it('เดือนเต็มได้ SPR-YYYYMM', () => {
    expect(reportNumber(sep.from, sep.to)).toBe('SPR-202609');
  });

  it('ช่วงอื่นได้วันแรกถึงวันสุดท้าย — to เป็นขอบเปิด จึงเป็นวันก่อนหน้า', () => {
    expect(
      reportNumber(new Date('2026-09-10T00:00:00+07:00'), new Date('2026-09-17T00:00:00+07:00')),
    ).toBe('SPR-20260910-20260916');
  });
});

describe('overallStatus — สถานะบนบทสรุปผู้บริหาร', () => {
  const kpi = (code: string, meets: boolean | null) => ({ code, meets_target: meets });

  it('ทุกตัวผ่าน → on_target', () => {
    expect(overallStatus([kpi('KPI-1', true), kpi('KPI-4', true)], 0).status).toBe('on_target');
  });

  it('KPI-1 ตก → off_target', () => {
    expect(overallStatus([kpi('KPI-1', false), kpi('KPI-4', true)], 0)).toEqual({
      status: 'off_target',
      failing: ['KPI-1'],
    });
  });

  it('P1 เกินกำหนดแม้ครั้งเดียว → off_target แม้ KPI ทุกตัวผ่าน (เป้า P1 = 100%)', () => {
    expect(overallStatus([kpi('KPI-1', true)], 1).status).toBe('off_target');
  });

  it('KPI อื่นตก → at_risk', () => {
    expect(overallStatus([kpi('KPI-1', true), kpi('KPI-4', false)], 0).status).toBe('at_risk');
  });

  it('ไม่มีตัวไหนวัดได้เลย → no_data ไม่ใช่ "ผ่าน"', () => {
    expect(overallStatus([kpi('KPI-1', null), kpi('KPI-4', null)], 0).status).toBe('no_data');
  });
});

describe('คะแนน KPI ของทีมสนับสนุน', () => {
  it('CSAT 1 ดาว = 0 คะแนน · 5 ดาว = 100 (ไม่ใช่ 20 กับ 100)', () => {
    expect(csatPoints(1)).toBe(0);
    expect(csatPoints(5)).toBe(100);
    expect(csatPoints(3)).toBe(50);
  });

  it('รวมตามน้ำหนัก 40/30/30', () => {
    // 0.4×100 + 0.3×100 + 0.3×50 = 85
    expect(teamKpiScore({ resolutionMetPercent: 100, responseMetPercent: 100, csatAvg: 3 })).toBe(85);
  });

  it('ยังไม่มีคะแนนจากผู้ใช้ → กระจายน้ำหนักให้ SLA ไม่นับเป็น 0', () => {
    // (0.4×90 + 0.3×80) / 0.7 = 85.7
    expect(teamKpiScore({ resolutionMetPercent: 90, responseMetPercent: 80, csatAvg: null })).toBe(85.7);
  });

  it('ไม่มีอะไรวัดได้เลย → null', () => {
    expect(teamKpiScore({ resolutionMetPercent: null, responseMetPercent: null, csatAvg: null })).toBeNull();
  });

  it('ผ่านเป้าใช้เกณฑ์ ≥ 95% / ≥ 95% / ≥ 4.2 และ null เมื่อยังไม่มีข้อมูล', () => {
    expect(TEAM_KPI.targets).toEqual({ responseMetPercent: 95, resolutionMetPercent: 95, csatAvg: 4.2 });
    expect(
      teamKpiVerdicts({ responseMetPercent: 95, resolutionMetPercent: 94.9, csatAvg: null }),
    ).toEqual({ response: true, resolution: false, csat: null });
  });
});

describe('canSeeWholeTeam — ใครเห็นตัวเลขของทั้งทีม', () => {
  const scopeWith = (perms: string[], isSuperAdmin = false) => ({
    isSuperAdmin,
    has: (...codes: string[]) => isSuperAdmin || codes.some((c) => perms.includes(c)),
  });

  it('หัวหน้าทีมและผู้ดูแล (ถือ ticket.assign) เห็นทุกคน', () => {
    expect(canSeeWholeTeam(scopeWith(['ticket.assign', 'ticket.change_status', 'report.view']))).toBe(true);
  });

  it('ผู้บริหารอ่านอย่างเดียว (ไม่ได้ทำงานกับเรื่อง) เห็นทุกคน', () => {
    expect(canSeeWholeTeam(scopeWith(['report.view']))).toBe(true);
  });

  it('ทีม support เห็นเฉพาะของตัวเอง', () => {
    expect(canSeeWholeTeam(scopeWith(['ticket.assign_self', 'ticket.change_status', 'report.view']))).toBe(false);
  });

  it('super_admin เห็นทุกคน', () => {
    expect(canSeeWholeTeam(scopeWith([], true))).toBe(true);
  });
});

describe('percentOf', () => {
  it('ตัวหารศูนย์คืน null ไม่ใช่ 0 หรือ 100', () => {
    expect(percentOf(0, 0)).toBeNull();
    expect(percentOf(3, 4)).toBe(75);
  });
});
