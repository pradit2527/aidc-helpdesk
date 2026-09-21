import { describe, expect, it } from 'vitest';

import {
  decideAssignment,
  mayAssignToOthers,
  maySelfAssign,
  type AssignmentActor,
  type AssignmentTarget,
} from './ticket.entity';

/**
 * กฎ "ใครมอบหมายงานให้ใครได้" — ตรรกะล้วน ไม่มีฐานข้อมูล ไม่มี HTTP
 *
 * กฎนี้ตัดสินสองที่ในระบบ (ตอนรับคำสั่งจริง กับตอนบอกหน้าจอว่าจะแสดงปุ่มไหม)
 * จึงต้องเป็นฟังก์ชันเดียว ถ้าเขียนแยกสองชุด วันหนึ่งจะมีปุ่มที่กดแล้วโดน 403
 */

const GOLF = 10; // หัวหน้าทีม IT Helpdesk
const ANON = 11; // สมาชิกทีมเดียวกัน
const OUTSIDER = 12; // เจ้าหน้าที่ที่ไม่ได้อยู่ทีมของกอล์ฟ
const ADMIN = 99;

const TEAM_HELPDESK = 1;
const TEAM_NETWORK = 2;

function actor(over: Partial<AssignmentActor> = {}): AssignmentActor {
  return { userId: GOLF, canAssign: true, isAdminLevel: false, ledTeamIds: [], ...over };
}

function target(userId: number, teamIds: readonly number[] = []): AssignmentTarget {
  return { userId, teamIds };
}

describe('decideAssignment — ผู้ดูแลระดับบริษัท', () => {
  it('มอบให้ใครก็ได้ แม้คนนั้นไม่ได้อยู่ทีมใดเลย', () => {
    const decision = decideAssignment(
      actor({ userId: ADMIN, isAdminLevel: true }),
      target(OUTSIDER),
    );
    expect(decision).toEqual({ allowed: true, via: 'admin' });
  });

  it('ไม่ต้องเป็นหัวหน้าทีมก่อนจึงจะมอบหมายได้', () => {
    const decision = decideAssignment(
      actor({ userId: ADMIN, isAdminLevel: true, ledTeamIds: [] }),
      target(ANON, [TEAM_HELPDESK]),
    );
    expect(decision.allowed).toBe(true);
  });
});

describe('decideAssignment — หัวหน้าทีม', () => {
  it('มอบให้สมาชิกในทีมที่ตนเป็นหัวหน้าได้', () => {
    const decision = decideAssignment(
      actor({ ledTeamIds: [TEAM_HELPDESK] }),
      target(ANON, [TEAM_HELPDESK]),
    );
    expect(decision).toEqual({ allowed: true, via: 'team_lead' });
  });

  it('มอบให้คนนอกทีมไม่ได้ — ตอบรหัสที่ผูกกับช่อง assignee_id', () => {
    const decision = decideAssignment(
      actor({ ledTeamIds: [TEAM_HELPDESK] }),
      target(OUTSIDER, [TEAM_NETWORK]),
    );
    expect(decision).toEqual({ allowed: false, code: 'ASSIGNEE_NOT_IN_TEAM' });
  });

  it('เป็นหัวหน้าทีมหนึ่ง ไม่ได้แปลว่าสั่งข้ามทีมได้', () => {
    const decision = decideAssignment(
      actor({ ledTeamIds: [TEAM_NETWORK] }),
      target(ANON, [TEAM_HELPDESK]),
    );
    expect(decision).toEqual({ allowed: false, code: 'ASSIGNEE_NOT_IN_TEAM' });
  });
});

describe('decideAssignment — เจ้าหน้าที่ทั่วไป', () => {
  /*
   * เคสสำคัญที่สุดของงานนี้
   *
   * ในชุดสิทธิ์ตั้งต้น agent ทุกคนถือ ticket.assign จึงผ่านด่าน permission
   * ทั้งหมด — ถ้าไม่มีกฎทีม ทุกคนจะโยนงานให้กันเองได้ตามใจ
   */
  it('ถือ ticket.assign แต่ไม่ได้เป็นหัวหน้าทีม → มอบให้คนอื่นไม่ได้', () => {
    const decision = decideAssignment(actor({ ledTeamIds: [] }), target(ANON, [TEAM_HELPDESK]));
    expect(decision).toEqual({ allowed: false, code: 'NOT_TEAM_LEAD' });
  });

  it('ไม่ถือ ticket.assign เลย → ถูกปฏิเสธด้วยเหตุเดียวกัน', () => {
    const decision = decideAssignment(actor({ canAssign: false }), target(ANON));
    expect(decision).toEqual({ allowed: false, code: 'NOT_TEAM_LEAD' });
  });
});

describe('decideAssignment — รับงานเอง', () => {
  it('ใครก็รับงานเองได้ ไม่ว่าจะอยู่ทีมไหนหรือไม่อยู่ทีมเลย', () => {
    for (const a of [
      actor({ userId: ANON, canAssign: false, ledTeamIds: [] }),
      actor({ userId: ANON, canAssign: true, ledTeamIds: [TEAM_HELPDESK] }),
      actor({ userId: ANON, isAdminLevel: true }),
    ]) {
      expect(decideAssignment(a, target(ANON))).toEqual({ allowed: true, via: 'self' });
    }
  });
});

describe('mayAssignToOthers — ปุ่มบนหน้าจอ', () => {
  it('ขึ้นเฉพาะผู้ดูแล หรือหัวหน้าทีมที่ถือ ticket.assign', () => {
    expect(mayAssignToOthers({ canAssign: true, isAdminLevel: true, ledTeamIds: [] })).toBe(true);
    expect(
      mayAssignToOthers({ canAssign: true, isAdminLevel: false, ledTeamIds: [TEAM_HELPDESK] }),
    ).toBe(true);
    expect(mayAssignToOthers({ canAssign: true, isAdminLevel: false, ledTeamIds: [] })).toBe(false);
    // ไม่มีสิทธิ์ ticket.assign ก็จบตั้งแต่ต้น แม้จะเป็นหัวหน้าทีม
    expect(
      mayAssignToOthers({ canAssign: false, isAdminLevel: true, ledTeamIds: [TEAM_HELPDESK] }),
    ).toBe(false);
  });
});

describe('maySelfAssign — ทีม support รับได้เฉพาะเรื่องที่ยังว่าง', () => {
  // ทีม support (support_agent): ไม่ถือ ticket.assign
  const supportAgent = actor({ userId: ANON, canAssign: false, ledTeamIds: [] });
  // หัวหน้าทีม (support_lead) ที่เป็น is_lead ของทีมจริง
  const lead = actor({ userId: GOLF, canAssign: true, ledTeamIds: [TEAM_HELPDESK] });
  // ถือบทบาทหัวหน้าแต่ยังไม่ได้เป็น is_lead ของทีมใด
  const leadWithoutTeam = actor({ userId: GOLF, canAssign: true, ledTeamIds: [] });
  const admin = actor({ userId: ADMIN, canAssign: true, isAdminLevel: true });

  it('เรื่องที่ยังไม่มีผู้รับผิดชอบ → ทุกคนกดรับได้', () => {
    for (const a of [supportAgent, lead, leadWithoutTeam, admin]) {
      expect(maySelfAssign(a, null)).toBe(true);
    }
  });

  it('เรื่องที่เพื่อนร่วมทีมถืออยู่ → ทีม support รับทับไม่ได้', () => {
    // ไม่งั้นหัวหน้ามอบงานให้คนหนึ่ง แล้วอีกคนกดรับดึงไปเองได้ = เลี่ยงข้อห้ามมอบหมาย
    expect(maySelfAssign(supportAgent, OUTSIDER)).toBe(false);
  });

  it('หัวหน้าทีมและผู้ดูแลดึงงานที่คนอื่นถืออยู่กลับมาได้', () => {
    expect(maySelfAssign(lead, ANON)).toBe(true);
    expect(maySelfAssign(admin, ANON)).toBe(true);
  });

  it('ถือบทบาทหัวหน้าแต่ไม่ได้เป็นหัวหน้าทีมใด → ดึงงานคนอื่นไม่ได้ เหมือนทีม support', () => {
    expect(maySelfAssign(leadWithoutTeam, ANON)).toBe(false);
  });

  it('เรื่องที่ตนถืออยู่แล้ว ผ่านด่านนี้ (การมอบซ้ำให้ตัวเองเป็นเรื่องของ entity)', () => {
    expect(maySelfAssign(supportAgent, ANON)).toBe(true);
  });
});
