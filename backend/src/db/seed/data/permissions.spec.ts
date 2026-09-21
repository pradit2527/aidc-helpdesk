import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROLE_CODE, ROLE_SIDE, roleSide } from '../../../common/constants';
import { CHECKLIST_TEMPLATES } from './catalog';
import { PERMISSIONS, ROLES } from './permissions';

/**
 * โครงสร้างบทบาทสองฝั่ง — ผู้ใช้งาน / Helpdesk support (หัวหน้าทีม · ทีม support)
 *
 * ⚠️ เทียบข้อมูล seed กับไฟล์ migration 0014 ด้วย เพราะสองที่นี้ต้องบอกเรื่องเดียวกัน:
 *    seed คือสิ่งที่ฐานข้อมูลใหม่ได้ ส่วน migration คือสิ่งที่ production ที่มีอยู่แล้วได้
 *    (production รัน migration ตอนบูต แต่ไม่ได้รัน seed)
 */

const MIGRATION = readFileSync(join(__dirname, '../../migrations/0014_support_roles.sql'), 'utf8');

function perms(code: string): ReadonlySet<string> {
  const role = ROLES.find((r) => r.code === code);
  if (!role) throw new Error(`ไม่มีบทบาท ${code} ใน seed`);
  // null = ได้ทุกสิทธิ์ที่มอบผ่าน role ได้
  return new Set(role.permissions ?? PERMISSIONS.map((p) => p.code));
}

describe('บทบาทและฝั่ง', () => {
  it('seed มีครบทุกบทบาทที่ระบบรู้จัก ไม่มีเกิน ไม่มีขาด', () => {
    expect(ROLES.map((r) => r.code).sort()).toEqual([...ROLE_CODE].sort());
  });

  it('ทุกบทบาทมีฝั่ง — สองฝั่งหลักคือ user กับ support', () => {
    for (const code of ROLE_CODE) expect(['user', 'support', 'admin']).toContain(ROLE_SIDE[code]);

    expect(roleSide('end_user')).toBe('user');
    expect(roleSide('support_lead')).toBe('support');
    expect(roleSide('support_agent')).toBe('support');
  });

  it('รหัสที่ไม่รู้จักถือเป็นฝั่งผู้ใช้งาน (สิทธิ์น้อยที่สุด) ไม่ใช่ฝั่ง support', () => {
    expect(roleSide('agent')).toBe('user');
    expect(roleSide('whatever')).toBe('user');
  });

  it('ฝั่ง Helpdesk มีสองระดับพอดี', () => {
    const support = ROLE_CODE.filter((c) => ROLE_SIDE[c] === 'support');
    expect([...support].sort()).toEqual(['support_agent', 'support_lead']);
  });
});

describe('ฝั่งผู้ใช้งาน (end_user)', () => {
  const p = perms('end_user');

  it('แจ้งปัญหา ติดตาม และคอมเมนต์เรื่องของตนได้', () => {
    for (const c of ['ticket.create', 'ticket.read', 'ticket.comment', 'ticket.attach']) {
      expect(p.has(c), c).toBe(true);
    }
  });

  it('รับงานหรือมอบหมายงานไม่ได้ และไม่เปลี่ยนสถานะเรื่อง', () => {
    for (const c of ['ticket.assign', 'ticket.assign_self', 'ticket.change_status']) {
      expect(p.has(c), c).toBe(false);
    }
  });

  it('ไม่มีคอมเมนต์ภายในของทีมไอที', () => {
    expect(p.has('ticket.comment_internal')).toBe(false);
  });
});

describe('ฝั่ง Helpdesk — ทีม support (support_agent)', () => {
  const p = perms('support_agent');

  it('รับงานเองได้', () => {
    expect(p.has('ticket.assign_self')).toBe(true);
  });

  it('มอบหมายงานให้คนอื่นไม่ได้', () => {
    expect(p.has('ticket.assign')).toBe(false);
  });

  it('ทำงานกับ ticket และแชทได้ครบ — เปลี่ยนสถานะ คอมเมนต์ภายใน ปิดงาน', () => {
    // ticket.change_status คือสิทธิ์ที่เปิดกล่องแชท และเป็นเกณฑ์ "ผู้รับเรื่องได้" (assignableUsers)
    for (const c of [
      'ticket.change_status',
      'ticket.comment_internal',
      'ticket.change_priority',
      'ticket.declare_major_incident',
      'checklist.update',
    ]) {
      expect(p.has(c), c).toBe(true);
    }
  });

  it('ไม่มีสิทธิ์ระดับผู้ดูแล — ไม่มอบบทบาท ไม่ลบเรื่อง ไม่แก้หมวดหมู่', () => {
    for (const c of ['user.assign_role', 'ticket.delete', 'category.manage', 'role.manage']) {
      expect(p.has(c), c).toBe(false);
    }
  });
});

describe('ฝั่ง Helpdesk — หัวหน้าทีม (support_lead)', () => {
  const lead = perms('support_lead');
  const agent = perms('support_agent');

  it('รับงานเองได้ และมอบหมายให้คนอื่นได้', () => {
    expect(lead.has('ticket.assign_self')).toBe(true);
    expect(lead.has('ticket.assign')).toBe(true);
  });

  it('เท่ากับทีม support ทุกอย่าง + ticket.assign อย่างเดียว ไม่มีอะไรเกินหรือขาด', () => {
    expect([...lead].filter((c) => !agent.has(c))).toEqual(['ticket.assign']);
    expect([...agent].filter((c) => !lead.has(c))).toEqual([]);
  });

  it('ไม่ได้อำนาจผู้ดูแลระบบมาด้วย — ตั้ง/ถอดหัวหน้าทีมและมอบบทบาทเป็นของผู้ดูแล', () => {
    expect(lead.has('user.assign_role')).toBe(false);
  });
});

describe('ใครถือ ticket.assign', () => {
  it('มีเฉพาะหัวหน้าทีมกับผู้ดูแล — ทีม support ผู้แจ้ง และผู้บริหารอ่านอย่างเดียวไม่มี', () => {
    const holders = ROLES.filter((r) => perms(r.code).has('ticket.assign')).map((r) => r.code);
    expect([...holders].sort()).toEqual(['company_admin', 'super_admin', 'support_lead']);
  });
});

describe('migration 0014 ตรงกับ seed', () => {
  it('เปลี่ยนชื่อแถว agent เดิมเป็น support_agent (UPDATE) — ไม่ลบแล้วสร้างใหม่ ผู้ใช้จึงตามมาเอง', () => {
    expect(MIGRATION).toMatch(/UPDATE "role"\s+SET "code" = 'support_agent'/);
    expect(MIGRATION).toMatch(/WHERE "code" = 'agent'/);
  });

  it('ไม่ลบบทบาทหรือการมอบบทบาทของใครเลย', () => {
    expect(MIGRATION).not.toMatch(/DELETE FROM "role"\s/);
    expect(MIGRATION).not.toMatch(/DELETE FROM "user_role"/);
    expect(MIGRATION).not.toMatch(/DROP /);
  });

  it('ชื่อและคำอธิบายของสองบทบาทใหม่เหมือน seed ทุกตัวอักษร', () => {
    for (const code of ['support_lead', 'support_agent']) {
      const role = ROLES.find((r) => r.code === code)!;
      expect(MIGRATION, `${code} nameTh`).toContain(`'${role.nameTh}'`);
      expect(MIGRATION, `${code} description`).toContain(`'${role.description}'`);
    }
  });

  it('ถอน ticket.assign จากทีม support และมอบให้หัวหน้าทีม — ตรงกับ seed', () => {
    expect(perms('support_agent').has('ticket.assign')).toBe(false);
    expect(perms('support_lead').has('ticket.assign')).toBe(true);

    expect(MIGRATION).toMatch(
      /DELETE FROM "role_permission"[\s\S]*?"code" = 'support_agent'[\s\S]*?"code" = 'ticket\.assign'/,
    );
    expect(MIGRATION).toMatch(
      /JOIN "permission" p ON p\."code" = 'ticket\.assign'\s+WHERE lead\."code" = 'support_lead'/,
    );
  });

  it('ยกหัวหน้าทีมเดิมเป็น support_lead โดยเปลี่ยน role_id ของแถวเดิม (ขอบเขตบริษัทและวันหมดอายุไม่หาย)', () => {
    expect(MIGRATION).toMatch(/UPDATE "user_role" ur\s+SET "role_id" = lead\."id"/);
    expect(MIGRATION).toContain('m."is_lead" = true');
    expect(MIGRATION).toContain('t."is_active" = true');
  });

  it('ตามไปเปลี่ยนรหัสบทบาทในข้อมูลที่เก็บเป็นข้อความ (checklist / กฎยกระดับ)', () => {
    expect(MIGRATION).toMatch(/UPDATE "checklist_item"\s+SET "default_role_code" = 'support_agent'/);
    expect(MIGRATION).toMatch(/UPDATE "sla_escalation_rule"/);
  });

  it('seed ไม่เหลือรหัส agent เดิมใน checklist', () => {
    const codes = CHECKLIST_TEMPLATES.flatMap((t) => t.items.map((i) => i.defaultRoleCode));
    expect(codes).not.toContain('agent');
    expect(codes).toContain('support_agent');
  });
});
