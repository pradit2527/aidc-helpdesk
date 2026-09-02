import { DomainError } from './errors/domain-error';
/**
 * ทดสอบขอบเขตการมองเห็นข้อมูล — ส่วนที่สำคัญที่สุดของระบบ (TR-01)
 * พอร์ตจากฉบับ Python ที่ผ่าน 18/18
 *
 * เทสต์ที่ตรวจ SQL ที่ repository สร้างจริง จะเพิ่มเมื่อ Drizzle schema พร้อม
 */

import { describe, expect, it } from 'vitest';

import { AccessScope } from './scope';

const COMPANY_A = 7;
const COMPANY_B = 2;

const AGENT_PERMS = ['ticket.read', 'ticket.comment', 'ticket.assign'];
const END_USER_PERMS = ['ticket.create', 'ticket.comment'];

function scope(o: Partial<{
  userId: number;
  companies: number[];
  perms: string[];
  superAdmin: boolean;
  contacts: string[];
}> = {}): AccessScope {
  return new AccessScope({
    userId: o.userId ?? 100,
    homeCompanyId: COMPANY_A,
    companyIds: o.companies ?? [COMPANY_A],
    permissions: o.perms ?? END_USER_PERMS,
    isSuperAdmin: o.superAdmin ?? false,
    contactKeys: o.contacts ?? [],
  });
}

describe('ตรรกะของ AccessScope', () => {
  it('end_user ไม่มี ticket.read จึงตกไปเส้นทาง "เฉพาะเรื่องของตน"', () => {
    expect(scope().has('ticket.read')).toBe(false);
  });

  it('require() ที่ไม่ผ่านต้องโยน FORBIDDEN ไม่ใช่คืน false เงียบ ๆ', () => {
    expect(() => scope().require('ticket.assign')).toThrow();
    try {
      scope().require('ticket.assign');
    } catch (e) {
      // โยน DomainError ไม่ใช่ HttpException ของ NestJS แล้ว
      // เพื่อให้ AccessScope ใช้ได้จากงาน background ที่ไม่เกี่ยวกับ HTTP ด้วย
      expect(e).toBeInstanceOf(DomainError);
      expect((e as DomainError).code).toBe('FORBIDDEN');
      expect((e as DomainError).httpStatus).toBe(403);
    }
  });

  it('super_admin ผ่านทุก permission', () => {
    expect(scope({ superAdmin: true, perms: [] }).has('อะไรก็ได้')).toBe(true);
  });

  it('US-07 AC-2 — ขอบริษัทอื่นมาต้องถูกตัดทิ้ง ไม่ใช่ตอบ error', () => {
    const s = scope({ companies: [COMPANY_A], perms: AGENT_PERMS });
    expect([...s.visibleCompanyIds([COMPANY_B])]).toEqual([]);
    expect([...s.visibleCompanyIds([COMPANY_A, COMPANY_B])]).toEqual([COMPANY_A]);
  });

  it('ไม่ส่งตัวกรองมา = เห็นทั้งขอบเขตของตน', () => {
    const s = scope({ companies: [COMPANY_A, COMPANY_B], perms: AGENT_PERMS });
    expect([...s.visibleCompanyIds()].sort()).toEqual([COMPANY_B, COMPANY_A].sort());
  });

  it('super_admin เห็นบริษัทที่ขอมา · ไม่ขอ = ไม่จำกัด', () => {
    const s = scope({ superAdmin: true });
    expect([...s.visibleCompanyIds([COMPANY_B])]).toEqual([COMPANY_B]);
    expect([...s.visibleCompanyIds()]).toEqual([]);
  });

  it('inScope', () => {
    const s = scope({ companies: [COMPANY_A], perms: AGENT_PERMS });
    expect(s.inScope(COMPANY_A)).toBe(true);
    expect(s.inScope(COMPANY_B)).toBe(false);
    expect(scope({ superAdmin: true }).inScope(999)).toBe(true);
  });

  it('companyIds ว่างให้ fallback เป็นบริษัทต้นสังกัด', () => {
    const s = new AccessScope({
      userId: 1,
      homeCompanyId: COMPANY_A,
      companyIds: [],
      permissions: AGENT_PERMS,
      isSuperAdmin: false,
    });
    expect([...s.companyIds]).toEqual([COMPANY_A]);
  });

  it('AccessScope แก้ไขไม่ได้หลังสร้าง', () => {
    const s = scope();
    expect(Object.isFrozen(s)).toBe(true);
  });
});

describe('เหตุความปลอดภัย (SOP-10 ข้อ 2)', () => {
  const ticket = { requesterId: 100, assigneeId: 200, incidentCommanderId: 300 };

  it('ผู้แจ้งและผู้รับผิดชอบเห็นได้', () => {
    expect(scope({ userId: 100, perms: AGENT_PERMS }).canSeeSecurityIncident(ticket)).toBe(true);
    expect(scope({ userId: 200, perms: AGENT_PERMS }).canSeeSecurityIncident(ticket)).toBe(true);
    expect(scope({ userId: 300, perms: AGENT_PERMS }).canSeeSecurityIncident(ticket)).toBe(true);
  });

  it('company_admin และ agent คนอื่นในบริษัทเดียวกันต้องไม่เห็น', () => {
    const other = scope({ userId: 999, companies: [COMPANY_A], perms: AGENT_PERMS });
    expect(other.canSeeSecurityIncident(ticket)).toBe(false);
  });

  it('head_of_it / ceo / dpo เห็นได้', () => {
    for (const key of ['head_of_it', 'ceo', 'dpo']) {
      const s = scope({ userId: 999, perms: AGENT_PERMS, contacts: [key] });
      expect(s.canSeeSecurityIncident(ticket), key).toBe(true);
    }
  });

  it('incident_manager อย่างเดียวยังไม่พอ — ไม่ใช่ผู้รับแจ้งของ SOP-10', () => {
    const s = scope({ userId: 999, perms: AGENT_PERMS, contacts: ['incident_manager'] });
    expect(s.canSeeSecurityIncident(ticket)).toBe(false);
  });

  it('tier2_group / tier3_group ก็ยังไม่พอ', () => {
    for (const key of ['tier2_group', 'tier3_group']) {
      const s = scope({ userId: 999, perms: AGENT_PERMS, contacts: [key] });
      expect(s.canSeeSecurityIncident(ticket), key).toBe(false);
    }
  });

  it('super_admin เห็นได้เสมอ', () => {
    expect(scope({ userId: 999, superAdmin: true }).canSeeSecurityIncident(ticket)).toBe(true);
  });

  it('assignee / incidentCommander เป็น null ไม่ทำให้พัง', () => {
    const s = scope({ userId: 999, perms: AGENT_PERMS });
    expect(
      s.canSeeSecurityIncident({ requesterId: 1, assigneeId: null, incidentCommanderId: null }),
    ).toBe(false);
  });
});
