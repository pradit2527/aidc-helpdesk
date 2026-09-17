/**
 * สร้างทีมสนับสนุนและบัญชีของสมาชิกที่ยังไม่มี
 *
 *   npx tsx src/db/seed/support-team-cli.ts
 *
 * หรือผ่านสคริปต์ที่ถามรหัสผ่านให้ (แนะนำ)
 *
 *   powershell -ExecutionPolicy Bypass -File scripts/create-it-team.ps1
 *
 * แยกจาก npm run db:seed โดยตั้งใจ — seed ทั้งชุดเขียนทับบทบาท สิทธิ์ และค่า SLA
 * ตามไฟล์ data/ ซึ่งอาจลบสิ่งที่ผู้ดูแลแก้ผ่านหน้าจอไปแล้ว ส่วนตัวนี้แตะแค่
 * ทีม สมาชิกในทีม และบัญชีที่ยังไม่มี
 *
 * รันซ้ำได้เสมอ
 *   - บัญชีที่มีอยู่แล้ว **ไม่ถูกแตะรหัสผ่าน** ไม่ถูกเปลี่ยนชื่อ และไม่ถูกถอนบทบาทเดิม
 *     เติมให้เฉพาะบทบาทที่ระบุในไฟล์ข้อมูลถ้ายังไม่มี
 *   - ทีมถูก upsert ตาม code · สมาชิกถูก upsert ตาม (team_id, user_id)
 *     คนที่ถูกเพิ่มเข้าทีมผ่านหน้าจอภายหลังจะไม่ถูกลบทิ้ง
 *
 * ⚠️ รหัสผ่านมาจากตัวแปรสภาพแวดล้อมเท่านั้น หนึ่งตัวแปรต่อหนึ่งบัญชี
 *    (SEED_TEAM_PASSWORD_IT_GOLF ...) ถ้าไม่มีให้ถอยไปใช้ SEED_TEAM_PASSWORD
 *    ถ้าบัญชีใดต้องสร้างแต่ไม่มีรหัสผ่านที่ผ่านนโยบาย จะหยุดก่อนเขียนอะไรลงฐานข้อมูล
 *    และไม่มีการพิมพ์รหัสผ่านออกหน้าจอไม่ว่ากรณีใด
 */

import 'dotenv/config';

import * as argon2 from 'argon2';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';
import {
  passwordEnvName,
  SUPPORT_TEAMS,
  TEAM_HOME_COMPANY_CODE,
  type SupportTeamMemberSeed,
} from './data/support-teams';

type Db = ReturnType<typeof drizzle<typeof schema>>;

/** นโยบาย 3.2 — ต้องตรงกับที่ UsersService.createUser บังคับ */
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;

/** ตรวจรหัสผ่านหนึ่งอัน คืนเหตุผลที่ไม่ผ่าน (ไม่เคยแตะตัวรหัสผ่านเองในข้อความ) */
function passwordProblem(password: string, username: string): string | null {
  if (password.length === 0) return `ไม่ได้ตั้ง ${passwordEnvName(username)} และไม่มี SEED_TEAM_PASSWORD`;
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return `ต้องยาว ${PASSWORD_MIN}–${PASSWORD_MAX} อักขระ (นโยบาย 3.2)`;
  }
  const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 4) return 'ต้องมีตัวพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และสัญลักษณ์ ครบสี่ประเภท';
  if (password.toLowerCase().includes(username.toLowerCase())) {
    return 'ห้ามมีชื่อผู้ใช้อยู่ในรหัสผ่าน';
  }
  return null;
}

/** ผลของคนหนึ่งคน ใช้พิมพ์ตารางสรุปตอนจบ */
interface PersonResult {
  username: string;
  fullName: string;
  roleCode: string;
  teamRole: 'หัวหน้าทีม' | 'สมาชิก';
  state: 'สร้างใหม่' | 'มีอยู่แล้ว';
}

async function main(): Promise<void> {
  const url = process.env.MIGRATE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('ต้องตั้ง MIGRATE_URL หรือ DATABASE_URL ก่อน');

  // บรรทัดแรกเสมอ — ผู้รันต้องเห็นว่ากำลังเขียนลงฐานข้อมูลตัวไหนก่อนอย่างอื่น
  console.log(`ฐานข้อมูลปลายทาง: ${new URL(url).host}`);

  const client = postgres(url, {
    max: 1,
    onnotice: () => {},
    ssl: new URL(url).hostname === 'localhost' ? false : 'require',
    ...(new URL(url).hostname.includes('-pooler') ? { prepare: false } : {}),
  });
  const db = drizzle(client, { schema });

  try {
    const everyone = SUPPORT_TEAMS.flatMap((t) => t.members);
    const usernames = everyone.map((m) => m.username);
    if (new Set(usernames).size !== usernames.length) {
      throw new Error('มีชื่อผู้ใช้ซ้ำในไฟล์ data/support-teams.ts');
    }

    // ── อ่านสถานะปัจจุบันก่อน ยังไม่เขียนอะไรทั้งสิ้น ──
    const [companies, roles, existing] = await Promise.all([
      db.select({ id: schema.company.id, code: schema.company.code }).from(schema.company).orderBy(schema.company.id),
      db.select({ id: schema.role.id, code: schema.role.code }).from(schema.role),
      db
        .select({ id: schema.appUser.id, username: schema.appUser.username })
        .from(schema.appUser)
        .where(inArray(schema.appUser.username, usernames)),
    ]);

    if (companies.length === 0) {
      throw new Error('ยังไม่มีบริษัทในฐานข้อมูล — รัน npm run db:seed ก่อน');
    }
    const homeCompany = companies.find((c) => c.code === TEAM_HOME_COMPANY_CODE) ?? companies[0]!;
    const companyByCode = new Map(companies.map((c) => [c.code, c.id]));
    const roleByCode = new Map(roles.map((r) => [r.code, r.id]));
    const userIdByUsername = new Map(existing.map((u) => [u.username, u.id]));

    for (const member of everyone) {
      if (!roleByCode.has(member.roleCode)) {
        throw new Error(`ไม่พบบทบาท ${member.roleCode} — รัน npm run db:seed ก่อน`);
      }
    }
    for (const team of SUPPORT_TEAMS) {
      if (team.companyCode !== null && !companyByCode.has(team.companyCode)) {
        throw new Error(`ทีม ${team.code} อ้างบริษัทที่ไม่มี: ${team.companyCode}`);
      }
    }

    /*
     * ── รหัสผ่าน: ตรวจทุกบัญชีที่ต้องสร้าง "ก่อน" แตะฐานข้อมูล ──
     *
     * ถ้าตรวจไปสร้างไป จะได้ทีมที่มีสมาชิกครึ่งเดียวเมื่อรหัสผ่านคนที่สามไม่ผ่าน
     * แล้วคนรันต้องมานั่งไล่ว่าใครถูกสร้างไปแล้วบ้าง
     */
    const missing = everyone.filter((m) => !userIdByUsername.has(m.username));
    const problems: string[] = [];
    const passwords = new Map<string, string>();

    for (const member of missing) {
      const password =
        process.env[passwordEnvName(member.username)] ?? process.env.SEED_TEAM_PASSWORD ?? '';
      const problem = passwordProblem(password, member.username);
      if (problem) problems.push(`  ${member.username.padEnd(12)} ${problem}`);
      else passwords.set(member.username, password);
    }

    if (problems.length > 0) {
      console.error(`\nต้องสร้างบัญชีใหม่ ${missing.length} บัญชี แต่รหัสผ่านไม่ผ่านนโยบาย:\n`);
      console.error(problems.join('\n'));
      console.error(
        `\nตั้งตัวแปรต่อบัญชี เช่น ${passwordEnvName(missing[0]!.username)} ` +
          '(หรือ SEED_TEAM_PASSWORD สำหรับทุกบัญชีที่ไม่ได้ตั้งเฉพาะ)',
      );
      console.error('หรือใช้ scripts/create-it-team.ps1 ซึ่งจะถามรหัสผ่านทีละบัญชีให้');
      throw new Error('หยุดก่อนเขียนฐานข้อมูล — ยังไม่มีอะไรถูกแก้');
    }

    // hash นอกทรานแซกชัน argon2 ตั้งใจให้ช้า ไม่ควรถือล็อกแถวไว้ระหว่างนั้น
    const hashes = new Map<string, string>();
    for (const [username, password] of passwords) {
      hashes.set(username, await argon2.hash(password, { type: argon2.argon2id }));
    }
    passwords.clear();

    const results: PersonResult[] = [];

    await db.transaction(async (tx) => {
      const t = tx as unknown as Db;

      for (const team of SUPPORT_TEAMS) {
        const teamCompanyId = team.companyCode === null ? null : companyByCode.get(team.companyCode)!;

        /*
         * ขอบเขตบริษัทของสมาชิกต้องตามขอบเขตของ "ทีม" ไม่ใช่ของบริษัทต้นสังกัด
         *
         * ทีมส่วนกลางรับเรื่องของทุกบริษัท สมาชิกจึงต้องเห็นทุกบริษัท — รอบแรกผูกไว้แค่
         * บริษัทต้นสังกัด (AIDC-TECH) ผลคือหัวหน้าเปิดเรื่องของ AIDC-HQ แล้วไม่เห็นลูกทีม
         * ในรายชื่อมอบหมายเลยสักคน เพราะ assignableUsers ตัดคนที่มองเรื่องนั้นไม่เห็นออก
         * (ถ้ามอบให้ได้ เขาจะได้รับเรื่องที่ตัวเองเปิดไม่ได้)
         */
        const scopeCompanyIds =
          teamCompanyId === null
            ? companies.map((c) => c.id)
            : [...new Set([teamCompanyId, homeCompany.id])];

        for (const member of team.members) {
          const created = !userIdByUsername.has(member.username);
          const userId = created
            ? await createUser(t, member, homeCompany.id, hashes.get(member.username)!)
            : userIdByUsername.get(member.username)!;
          userIdByUsername.set(member.username, userId);

          // บทบาทถูก "เติม" ไม่ใช่ "แทนที่" — บัญชีที่มีบทบาทอื่นอยู่แล้วต้องไม่ถูกถอน
          await ensureRole(t, userId, roleByCode.get(member.roleCode)!, member.roleCode, scopeCompanyIds);

          results.push({
            username: member.username,
            fullName: member.fullName,
            roleCode: member.roleCode,
            teamRole: member.isLead ? 'หัวหน้าทีม' : 'สมาชิก',
            state: created ? 'สร้างใหม่' : 'มีอยู่แล้ว',
          });
        }

        const [row] = await t
          .insert(schema.supportTeam)
          .values({
            code: team.code,
            name: team.name,
            description: team.description,
            companyId: teamCompanyId,
            isActive: true,
          })
          .onConflictDoUpdate({
            target: schema.supportTeam.code,
            set: {
              name: sql`excluded.name`,
              description: sql`excluded.description`,
              companyId: sql`excluded.company_id`,
              // ทีมที่เคยถูกปิดไว้ ต้องกลับมาใช้งานได้เมื่อรันสคริปต์นี้อีกครั้ง
              isActive: sql`true`,
              updatedAt: new Date(),
            },
          })
          .returning({ id: schema.supportTeam.id });

        const teamId = row!.id;

        await t
          .insert(schema.supportTeamMember)
          .values(
            team.members.map((m) => ({
              teamId,
              userId: userIdByUsername.get(m.username)!,
              isLead: m.isLead,
            })),
          )
          .onConflictDoUpdate({
            target: [schema.supportTeamMember.teamId, schema.supportTeamMember.userId],
            set: { isLead: sql`excluded.is_lead` },
          });
      }
    });

    console.log('\nสรุปสมาชิกทีม\n');
    console.log(
      `  ${'ชื่อผู้ใช้'.padEnd(14)}${'ชื่อ'.padEnd(14)}${'บทบาท'.padEnd(14)}${'ในทีม'.padEnd(12)}สถานะ`,
    );
    console.log(`  ${'─'.repeat(64)}`);
    for (const r of results) {
      console.log(
        `  ${r.username.padEnd(14)}${r.fullName.padEnd(14)}${r.roleCode.padEnd(14)}${r.teamRole.padEnd(12)}${r.state}`,
      );
    }

    const created = results.filter((r) => r.state === 'สร้างใหม่').length;
    console.log(`\nสร้างบัญชีใหม่ ${created} · ใช้บัญชีเดิม ${results.length - created}`);
    if (created > 0) {
      console.log('บัญชีใหม่ตั้ง must_change_password = true — แจ้งให้เจ้าตัวเปลี่ยนรหัสผ่านเอง');
    }
    console.log('เสร็จเรียบร้อย');
  } finally {
    await client.end();
  }
}

/** สร้างบัญชีใหม่หนึ่งบัญชี — กติกาเดียวกับ UsersService.createUser */
async function createUser(
  db: Db,
  member: SupportTeamMemberSeed,
  companyId: number,
  passwordHash: string,
): Promise<number> {
  const [created] = await db
    .insert(schema.appUser)
    .values({
      companyId,
      username: member.username,
      // อีเมลเว้นว่าง — เจ้าของกรอกเองผ่านหน้าจัดการผู้ใช้ (ดูหมายเหตุในไฟล์ข้อมูล)
      email: null,
      fullName: member.fullName,
      jobTitle: member.jobTitle,
      passwordHash,
      authProvider: 'local',
      mustChangePassword: true,
      isAdminAccount: member.roleCode === 'super_admin',
      isActive: true,
      passwordChangedAt: new Date(),
    })
    .returning({ id: schema.appUser.id });

  return created!.id;
}

/**
 * เติมบทบาทให้ผู้ใช้ พร้อมขอบเขตบริษัทตามชนิดของบทบาท
 *
 * super_admin ไม่มีแถว user_role_scope — เห็นทุกบริษัทอยู่แล้ว (เหมือน seedSuperAdmin)
 * บทบาทอื่นได้ขอบเขตตามทีม: ทีมส่วนกลาง = ทุกบริษัท · ทีมของบริษัท = บริษัทนั้น + ต้นสังกัด
 * เป็นการ "เติม" เท่านั้น ขอบเขตที่ผู้ดูแลเพิ่มให้ทีหลังผ่านหน้ามอบบทบาทไม่ถูกถอน
 */
async function ensureRole(
  db: Db,
  userId: number,
  roleId: number,
  roleCode: string,
  companyIds: readonly number[],
): Promise<void> {
  await db
    .insert(schema.userRole)
    .values({ userId, roleId })
    .onConflictDoNothing({ target: [schema.userRole.userId, schema.userRole.roleId] });

  if (roleCode === 'super_admin') return;

  const [granted] = await db
    .select({ id: schema.userRole.id })
    .from(schema.userRole)
    .where(and(eq(schema.userRole.userId, userId), eq(schema.userRole.roleId, roleId)))
    .limit(1);
  if (!granted || companyIds.length === 0) return;

  await db
    .insert(schema.userRoleScope)
    .values(companyIds.map((companyId) => ({ userRoleId: granted.id, companyId })))
    .onConflictDoNothing({ target: [schema.userRoleScope.userRoleId, schema.userRoleScope.companyId] });
}

main().catch((err: unknown) => {
  console.error('สร้างทีมล้มเหลว:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
