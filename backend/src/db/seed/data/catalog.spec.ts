import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APPROVER_TYPE, computePriority } from '../../../common/constants';
import { CATALOG_ITEMS, TICKET_CATEGORIES, TICKET_SUBCATEGORIES } from './catalog';

/**
 * ขอบเขตหมวดหมู่ตามชนิดของเรื่อง และการแยก EMAIL_PASSWORD
 *
 * ⚠️ ไฟล์นี้เทียบ **ข้อมูล seed กับไฟล์ migration** ด้วย ไม่ใช่แค่ตรวจ seed
 *    สองที่นี้ต้องบอกเรื่องเดียวกันเสมอ — seed คือสิ่งที่ฐานข้อมูลใหม่ได้
 *    ส่วน migration คือสิ่งที่ฐานข้อมูลที่มีอยู่แล้วได้ ถ้าสองอันไม่ตรงกัน
 *    เครื่อง dev กับ production จะมีขอบเขตหมวดหมู่คนละชุดโดยไม่มีอะไรฟ้อง
 *    แล้วฟอร์มแจ้งเรื่องจะกรองไม่เหมือนกันสองที่
 */

/** เนื้อไฟล์ดิบของ 0010 — ใช้เฉพาะเทสต์ที่ตรวจเรื่องเฉพาะของไฟล์นั้น (การแยก EMAIL_PASSWORD) */
const MIGRATION = readFileSync(
  join(__dirname, '../../migrations/0010_ticket_type_workflow.sql'),
  'utf8',
);

/*
 * ไม่ใช่แค่ 0010 — 0012 เพิ่มขอบเขตให้อีก 2 หมวดหลังจากที่ SA ตัดสินใจ
 * ทีหลัง (ดูคอมเมนต์ในไฟล์นั้น) ถ้ามีการแก้ขอบเขตเพิ่มในอนาคตอีก ให้เติมชื่อ
 * ไฟล์ลงลิสต์นี้ต่อ ไม่ใช่ย้อนไปแก้ 0010 ที่ apply ไปแล้ว
 */
const SCOPE_MIGRATION_FILES = [
  '0010_ticket_type_workflow.sql',
  '0012_category_scope_sa_ruling.sql',
  '0013_category_sla_alignment.sql',
];

/** เนื้อไฟล์ดิบของ 0013 — ใช้ตรวจว่าการย้ายหมวดย่อยใน seed กับใน SQL ตรงกันทีละแถว */
const MIGRATION_0013 = readFileSync(
  join(__dirname, '../../migrations/0013_category_sla_alignment.sql'),
  'utf8',
);

/*
 * ตัดคอมเมนต์ทิ้งก่อนแกะรายการรหัส
 *
 * ⚠️ ต้องตัดก่อนหาวงเล็บปิด ไม่ใช่หลัง
 *    คอมเมนต์ในไฟล์ migration มีวงเล็บอยู่ด้วย (เช่น "แยกเป็นครึ่ง (...)")
 *    ถ้าหา ')' จากข้อความดิบ ตัวแกะจะหยุดกลางรายการแล้วเทสต์จะรายงานว่า
 *    migration ตกหล่นสิบกว่าแถว ทั้งที่ไฟล์ถูกต้องทุกบรรทัด
 */
const MIGRATION_SQL = SCOPE_MIGRATION_FILES.map((file) =>
  readFileSync(join(__dirname, '../../migrations', file), 'utf8').replace(/--.*$/gm, ''),
).join('\n');

/** code ที่ migration (ไฟล์ไหนก็ได้ในลิสต์) สั่งให้เป็นขอบเขตนี้ — อ่านจากทุกบล็อก UPDATE ... IN (...) */
function codesInMigration(scope: 'incident' | 'service_request'): Set<string> {
  const marker = `SET "ticket_type_scope" = '${scope}' WHERE "code" IN (`;
  const result = new Set<string>();
  let cursor = 0;
  for (;;) {
    const start = MIGRATION_SQL.indexOf(marker, cursor);
    if (start === -1) break;
    const bodyStart = start + marker.length;
    const bodyEnd = MIGRATION_SQL.indexOf(')', bodyStart);
    const body = MIGRATION_SQL.slice(bodyStart, bodyEnd);
    for (const part of body.split(',')) {
      const trimmed = part.trim();
      if (trimmed.startsWith("'")) result.add(trimmed.replace(/'/g, ''));
    }
    cursor = bodyEnd + 1;
  }
  if (result.size === 0) {
    throw new Error(`ไม่พบบล็อก UPDATE ของขอบเขต ${scope} ในไฟล์ migration ที่ตรวจ`);
  }
  return result;
}

const ALL = [...TICKET_CATEGORIES, ...TICKET_SUBCATEGORIES];

function scopeOf(code: string): string {
  const row = ALL.find((c) => c.code === code);
  if (!row) throw new Error(`ไม่มีหมวดหมู่รหัส ${code} ใน seed`);
  return row.ticketTypeScope ?? 'both';
}

describe('ขอบเขตหมวดหมู่ — seed ต้องตรงกับ migration 0010', () => {
  it('ทุกแถวที่ migration ตั้งเป็น incident มีขอบเขตเดียวกันใน seed', () => {
    for (const code of codesInMigration('incident')) {
      expect(scopeOf(code), `หมวด ${code}`).toBe('incident');
    }
  });

  it('ทุกแถวที่ migration ตั้งเป็น service_request มีขอบเขตเดียวกันใน seed', () => {
    for (const code of codesInMigration('service_request')) {
      expect(scopeOf(code), `หมวด ${code}`).toBe('service_request');
    }
  });

  it('ทุกแถวที่ seed ระบุขอบเขตไว้ ถูกครอบคลุมใน migration ด้วย', () => {
    const inMigration = new Set([
      ...codesInMigration('incident'),
      ...codesInMigration('service_request'),
    ]);

    /*
     * ทิศตรงข้ามของสองเทสต์ข้างบน — กันกรณีที่มีคนเพิ่มหมวดใหม่ใน seed
     * พร้อมขอบเขตที่ไม่ใช่ both แต่ลืมเติมลง migration ฐานข้อมูลที่มีอยู่แล้ว
     * จะได้ 'both' ค้างไว้ตลอดไป เพราะ seed ไม่เคยรันบน production
     */
    const missing = ALL.filter(
      (c) => (c.ticketTypeScope ?? 'both') !== 'both' && !inMigration.has(c.code),
    ).map((c) => c.code);

    expect(missing).toEqual([]);
  });
});

describe('การแยก "ลืมรหัสผ่าน" ออกจาก "บัญชีถูกล็อก"', () => {
  it('EMAIL_PASSWORD เหลือเฉพาะครึ่งที่เป็นคำขอบริการ', () => {
    const row = TICKET_SUBCATEGORIES.find((c) => c.code === 'EMAIL_PASSWORD');
    expect(row?.ticketTypeScope).toBe('service_request');
    // ชื่อต้องไม่พูดถึงบัญชีถูกล็อกอีกแล้ว มิฉะนั้นผู้แจ้งจะยังเลือกผิดช่องเหมือนเดิม
    expect(row?.nameTh).not.toContain('ລັອກ');
  });

  it('ครึ่งที่เป็นเหตุขัดข้องอยู่ใต้หมวดสื่อสาร ส่วนครึ่งที่เป็นคำขออยู่ใต้หมวดบัญชีและสิทธิ์', () => {
    const locked = TICKET_SUBCATEGORIES.find((c) => c.code === 'EMAIL_ACCOUNT_LOCKED');
    expect(locked?.ticketTypeScope).toBe('incident');
    expect(locked?.parentCode).toBe('COMMUNICATION');

    const password = TICKET_SUBCATEGORIES.find((c) => c.code === 'EMAIL_PASSWORD');
    expect(password?.parentCode).toBe('ACCESS');
  });

  /**
   * ⚠️ ข้อนี้คุ้มครองประวัติย้อนหลัง
   *    ticket เก่าทุกใบชี้มาที่ code EMAIL_PASSWORD ถ้าย้าย code นั้นไปให้
   *    ครึ่ง incident ประวัติทั้งหมดจะเปลี่ยนความหมายย้อนหลังโดยไม่มีใครสั่ง
   */
  it('migration ไม่สร้าง EMAIL_PASSWORD ใหม่ — ใช้แถวเดิม เปลี่ยนแค่ชื่อ', () => {
    expect(MIGRATION).toContain(`SET "name_th" = 'ລືມລະຫັດຜ່ານ'`);
    expect(MIGRATION).toContain(`'EMAIL_ACCOUNT_LOCKED'`);
    // แถวใหม่ต้องคัดลอก company_id / parent_id จากแถวเดิม ไม่ใช่เดาค่า
    expect(MIGRATION).toContain('FROM "ticket_category" src');
  });

  it('พ่อของแต่ละครึ่งเป็นชนิดเดียวกับลูก — ไม่มีครึ่งไหนเข้าถึงไม่ได้', () => {
    expect(scopeOf('COMMUNICATION')).toBe('incident');
    expect(scopeOf('ACCESS')).toBe('service_request');
  });
});

describe('หมวดหลักที่มีลูกสองชนิดต้องเป็น both', () => {
  it('ไม่มีหมวดหลักไหนแคบกว่าลูกของตัวเอง', () => {
    const offenders: string[] = [];

    for (const parent of TICKET_CATEGORIES) {
      const parentScope = parent.ticketTypeScope ?? 'both';
      if (parentScope === 'both') continue;

      const children = TICKET_SUBCATEGORIES.filter((c) => c.parentCode === parent.code);
      for (const child of children) {
        const childScope = child.ticketTypeScope ?? 'both';
        /*
         * ลูกต้อง "เข้าถึงได้" ผ่านพ่อเสมอ
         *
         * ถ้าพ่อเป็น incident แต่ลูกเป็น service_request ผู้แจ้งจะเลือกลูกตัวนั้น
         * ไม่ได้เลย เพราะพ่อถูกกรองทิ้งไปตั้งแต่ช่องแรกของฟอร์ม กลายเป็นหมวดที่
         * มีอยู่ในฐานข้อมูลแต่ไม่มีทางเลือกถึง
         *
         * พ่อที่ถูกจำกัดชนิดแล้ว ลูกต้องเป็นชนิดเดียวกันเป๊ะ — ลูกที่เป็น both
         * ใต้พ่อที่แคบ จะใช้ได้แค่ครึ่งเดียว ซึ่งขัดกับสิ่งที่ 'both' สื่อ
         * (categoryAllowsTicketType ใช้ตอนกรองจริงบนหน้าจอ ไม่ใช่ตอนตรวจผัง)
         */
        if (childScope !== parentScope) {
          offenders.push(`${parent.code} (${parentScope}) → ${child.code} (${childScope})`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('รายการ "อื่น ๆ (ລະບຸເອງ)" ของคำขอบริการ', () => {
  const other = CATALOG_ITEMS.find((i) => i.code === 'SR-OTHER');

  it('มีอยู่จริง และผูกกับหมวด OTHER', () => {
    expect(other).toBeDefined();
    expect(other?.categoryCode).toBe('OTHER');
  });

  /**
   * จำเป็นสองทางพร้อมกัน
   *   1. ข้อกำหนดของ SA — คำขอที่ไม่มีรายการรองรับต้องผ่านหัวหน้าไอทีเสมอ
   *   2. เป็นรายการที่ระบบเติมให้อัตโนมัติเมื่อดัดชนิดเรื่องของผู้แจ้งภายนอก
   *      ซึ่ง CHECK ck_ticket_service_request_needs_catalog บังคับว่าต้องมี
   */
  it('บังคับอนุมัติเสมอ และส่งไปที่หัวหน้าไอที', () => {
    expect(other?.requiresApproval).toBe(true);
    expect(other?.approvalChain).toBe('head_of_it');
  });

  it('นาฬิกาเริ่มนับหลังอนุมัติ ไม่ใช่ตอนเปิดเรื่อง', () => {
    expect(other?.clockStartEvent).toBe('after_approval');
  });
});

describe('สายอนุมัติใน catalog ต้องใช้ชนิดผู้อนุมัติที่มีอยู่จริง', () => {
  /**
   * ⚠️ ข้อมูล seed ชุดเดิมใช้ 'department_head' ซึ่งไม่เคยเป็นค่าที่ถูกต้องเลย
   *    CHECK ck_approval_approver_type_valid ในฐานข้อมูลจะปฏิเสธมัน — แต่ไม่มี
   *    ใครเคยรู้ เพราะไม่มีโค้ดส่วนไหนเคยสร้างแถว approval_request มาก่อน
   *    พอเฟสนี้เริ่มสร้างจริง ทุกคำขอที่ใช้สายนั้นจะล้มทั้งทรานแซกชัน
   */
  const APPROVER_TYPES = [
    'line_manager',
    'system_owner',
    'head_of_it',
    'budget_owner',
    'tier2_review',
    'cab',
  ];

  it('ทุกค่าใน approval_chain อยู่ใน APPROVER_TYPE', () => {
    const bad: string[] = [];
    for (const item of CATALOG_ITEMS) {
      for (const type of (item.approvalChain ?? '').split(',').filter(Boolean)) {
        if (!APPROVER_TYPES.includes(type.trim())) bad.push(`${item.code}: ${type}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('รายการที่ต้องอนุมัติต้องมีสายอนุมัติเสมอ (ck_catalog_approval_needs_chain)', () => {
    const missing = CATALOG_ITEMS.filter((i) => i.requiresApproval && !i.approvalChain).map(
      (i) => i.code,
    );
    expect(missing).toEqual([]);
  });
});

/*
 * ── จัดหมวดหมู่ให้ตรงเอกสารควบคุม (migration 0013) ──────────────────────────
 * แหล่ง: AIDC-IT-SLA-001 (5.2 ตัวอย่าง P1–P4 · 5.3 แค็ตตาล็อก · 6.2 กลุ่มบริการ) ·
 *        AIDC-IT-SOP-001 SOP-03…07 · SOP-6-2025 Security Incident Management
 */

const SUB_BY_CODE = new Map(TICKET_SUBCATEGORIES.map((c) => [c.code, c]));
const CATALOG_BY_CODE = new Map(CATALOG_ITEMS.map((i) => [i.code, i]));

/** ระบบงานของกลุ่ม — งานนี้ไม่แตะ (กฎ: ห้ามยุ่งกับ ILP และระบบอื่นในกลุ่มนี้จนกว่าเจ้าของสั่ง) */
const UNTOUCHED_PARENTS = ['SUPER_WORK', 'ILP', 'I_OFFICE_PLUS', 'APS', 'CMS', 'CMS_PLUS', 'MAGIC', 'OTHER', 'ERP'];

describe('ต้นไม้หมวดหมู่ — seed ต้องตรงกับ migration 0013 ทีละแถว', () => {
  it('หมวดย่อยทุกใบที่จัดการโดยงานนี้ ถูกย้ายเข้าหมวดหลักเดียวกันทั้งใน seed และใน SQL', () => {
    const mismatched: string[] = [];
    for (const sub of TICKET_SUBCATEGORIES) {
      if (UNTOUCHED_PARENTS.includes(sub.parentCode)) continue;
      // รูปแบบของแถวใน VALUES ของขั้น 4: ('หมวดหลัก', 'รหัส', ...
      if (!MIGRATION_0013.includes(`('${sub.parentCode}', '${sub.code}',`)) {
        mismatched.push(`${sub.parentCode} → ${sub.code}`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it('ระบบงานของกลุ่มไม่ถูกแตะโดย migration', () => {
    const sqlBody = MIGRATION_0013.replace(/--.*$/gm, '');
    for (const code of UNTOUCHED_PARENTS) {
      expect(sqlBody, `หมวด ${code}`).not.toContain(`'${code}'`);
    }
    for (const sub of TICKET_SUBCATEGORIES.filter((c) => UNTOUCHED_PARENTS.includes(c.parentCode))) {
      expect(sqlBody, `หมวดย่อย ${sub.code}`).not.toContain(`'${sub.code}'`);
    }
  });

  it('หมวดหลักเดิมที่ถูกย้ายลูกจนว่างถูกปิดใช้งาน ไม่ถูกลบ', () => {
    for (const code of ['EMAIL', 'PRINTER', 'CCTV', 'MOBILE', 'AI_TOOLS']) {
      const parent = TICKET_CATEGORIES.find((c) => c.code === code);
      expect(parent?.isActive, `หมวด ${code}`).toBe(false);
      expect(
        TICKET_SUBCATEGORIES.filter((c) => c.parentCode === code),
        `หมวด ${code} ต้องไม่มีลูกเหลือ`,
      ).toEqual([]);
    }
    expect(MIGRATION_0013).not.toMatch(/DELETE\s+FROM/i);
  });
});

describe('เหตุขัดข้อง (incident) — จัดตามกลุ่มบริการ SLA 6.2 และค่าตั้งต้นตรงตัวอย่าง SLA 5.2', () => {
  const priorityOf = (code: string): string => {
    const sub = SUB_BY_CODE.get(code);
    if (!sub) throw new Error(`ไม่มีหมวดย่อย ${code}`);
    return computePriority(sub.defaultImpact, sub.defaultUrgency);
  };

  it.each([
    ['NETWORK_OUTAGE', 'P1'], // "เครือข่ายทั้งสำนักงานใช้ไม่ได้"
    ['NETWORK_AUTH', 'P1'], // ระบบยืนยันตัวตนอยู่ tier critical
    ['SECURITY_ATTACK', 'P1'], // "ถูกโจมตีทางไซเบอร์"
    ['SECURITY_DATA_LEAK', 'P1'], // "ข้อมูลรั่วไหล"
    ['SECURITY_MALWARE', 'P1'],
    ['EMAIL_DEPT_DOWN', 'P2'], // "อีเมลทั้งแผนกใช้ไม่ได้"
    ['FILE_SERVER_DOWN', 'P2'],
    ['EMAIL_SEND_RECEIVE', 'P3'], // "อีเมลรายบุคคล"
    ['PRINTER_NOT_PRINTING', 'P3'], // "เครื่องพิมพ์"
    ['SOFTWARE_ERROR', 'P3'], // "โปรแกรมสำนักงานผิดพลาด"
  ])('%s มีค่าตั้งต้นที่คำนวณได้ %s ตามตัวอย่างใน SLA', (code, expected) => {
    expect(priorityOf(code)).toBe(expected);
  });

  it('Wi-Fi และ VPN อยู่กลุ่มสื่อสาร (tier high) ไม่ใช่โครงสร้างพื้นฐาน (tier critical)', () => {
    expect(SUB_BY_CODE.get('NETWORK_WIFI')?.parentCode).toBe('COMMUNICATION');
    expect(SUB_BY_CODE.get('NETWORK_VPN')?.parentCode).toBe('COMMUNICATION');
    expect(SUB_BY_CODE.get('NETWORK_OUTAGE')?.parentCode).toBe('NETWORK');
  });

  it('ครบทุกชนิดเหตุความปลอดภัยที่ SOP-6-2025 กำหนด', () => {
    const security = TICKET_SUBCATEGORIES.filter((c) => c.parentCode === 'SECURITY').map((c) => c.code);
    expect(security).toEqual(
      expect.arrayContaining([
        'SECURITY_MALWARE', // ไวรัส / โปรแกรมอันตราย
        'SECURITY_ATTACK', // โจมตี / Denial of service
        'SECURITY_PROBE', // สแกนหรือสืบหาช่องโหว่โดยไม่ได้รับอนุญาต
        'SECURITY_ACCOUNT', // พยายามเข้าถึงระบบโดยไม่ได้รับอนุญาต
        'SECURITY_DATA_LEAK', // เข้าถึง แก้ไข ส่งออก ทำลายข้อมูล
        'SECURITY_PHYSICAL', // เข้าพื้นที่โดยไม่ได้รับอนุญาต (Physical Incident)
        'SECURITY_DEVICE_LOST', // ลักทรัพย์สิน / อุปกรณ์สูญหาย
        'SECURITY_POLICY_BREACH', // ละเมิดนโยบาย (Procedural Incident)
      ]),
    );
    for (const code of security) expect(SUB_BY_CODE.get(code)?.ticketTypeScope).toBe('incident');
  });
});

describe('คำขอบริการ (service_request) — แค็ตตาล็อกตาม SLA 5.3 / SOP-03…07', () => {
  it('มีครบทุกรายการที่ SLA 5.3 และ SOP กำหนด', () => {
    for (const code of [
      'SR-PASSWORD-RESET',
      'SR-UNLOCK-ACCOUNT',
      'SR-ACCESS',
      'SR-SOFTWARE-INSTALL',
      'SR-SW-NONSTD',
      'SR-ONBOARDING',
      'SR-OFFBOARDING',
      'SR-EQUIPMENT',
      'SR-RESTORE',
      'SR-POLICY-EXC',
      'SR-CONSULT',
      'SR-OTHER',
    ]) {
      expect(CATALOG_BY_CODE.has(code), `รายการ ${code}`).toBe(true);
    }
  });

  it('ทุกรายการผูกกับหมวดย่อยที่ใช้กับคำขอบริการได้ — เลือกรายการแล้วฟอร์มเติมหมวดให้ครบ', () => {
    const offenders: string[] = [];
    for (const item of CATALOG_ITEMS) {
      // SR-OTHER ชี้หมวดหลัก OTHER ที่ไม่มีลูก (ปลายทางของทั้งสองสาย)
      if (item.categoryCode === 'OTHER') continue;
      const sub = SUB_BY_CODE.get(item.categoryCode);
      const scope = sub?.ticketTypeScope ?? 'both';
      if (!sub || (scope !== 'service_request' && scope !== 'both')) {
        offenders.push(`${item.code} → ${item.categoryCode}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('ซอฟต์แวร์ในบัญชีมาตรฐาน: 2 วันทำการ นับตั้งแต่รับคำขอ ไม่ต้องอนุมัติ (SLA 5.3 / SOP-06)', () => {
    const item = CATALOG_BY_CODE.get('SR-SOFTWARE-INSTALL');
    expect(item?.targetMinutes).toBe(1080);
    expect(item?.clockStartEvent).toBe('on_create');
    expect(item?.requiresApproval).toBe(false);
  });

  it('ซอฟต์แวร์นอกบัญชี: Tier 2 ประเมิน แล้ว Head of IT อนุมัติ (SOP-06)', () => {
    const item = CATALOG_BY_CODE.get('SR-SW-NONSTD');
    expect(item?.requiresApproval).toBe(true);
    expect(item?.approvalChain).toBe('tier2_review,head_of_it');
    expect(item?.clockStartEvent).toBe('after_approval');
  });

  it('ขอสิทธิ์: หัวหน้าหน่วยงาน → เจ้าของระบบ และนับหลังอนุมัติครบ 1 วันทำการ (SLA 5.3 / SOP-03)', () => {
    const item = CATALOG_BY_CODE.get('SR-ACCESS');
    expect(item?.approvalChain).toBe('line_manager,system_owner');
    expect(item?.clockStartEvent).toBe('after_approval');
    expect(item?.targetMinutes).toBe(540);
  });

  it('รีเซ็ตรหัสผ่านและปลดล็อก: 30 นาทีทำการ นับหลังยืนยันตัวตน (SLA 5.3 / นโยบาย 3.2)', () => {
    for (const code of ['SR-PASSWORD-RESET', 'SR-UNLOCK-ACCOUNT']) {
      const item = CATALOG_BY_CODE.get(code);
      expect(item?.targetMinutes, code).toBe(30);
      expect(item?.clockStartEvent, code).toBe('after_identity_verified');
    }
  });

  it('สายอนุมัติของทุกรายการใช้ชนิดผู้อนุมัติที่ระบบรู้จัก ไม่มี department_head', () => {
    for (const item of CATALOG_ITEMS) {
      for (const type of (item.approvalChain ?? '').split(',').filter(Boolean)) {
        expect((APPROVER_TYPE as readonly string[]).includes(type), `${item.code}: ${type}`).toBe(true);
      }
    }
  });

  it('migration แก้สายอนุมัติที่ค้างเป็น department_head ในฐานข้อมูลเดิม', () => {
    expect(MIGRATION_0013).toContain("replace(\"approval_chain\", 'department_head', 'line_manager')");
  });
});
