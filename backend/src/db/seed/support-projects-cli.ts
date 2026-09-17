/**
 * ลงทะเบียนโครงการสนับสนุนของ AIDC Support Hub และผูกกับ inbox ใน Chatwoot
 *
 *   npx tsx src/db/seed/support-projects-cli.ts
 *   npx tsx src/db/seed/support-projects-cli.ts --link DEMO=1
 *   npx tsx src/db/seed/support-projects-cli.ts --link DEMO=1 --link ILP=3
 *
 * แยกจาก npm run db:seed โดยตั้งใจ — seed ทั้งชุดเขียนทับบทบาท สิทธิ์ และค่า SLA
 * ตามไฟล์ data/ ซึ่งอาจลบสิ่งที่ผู้ดูแลแก้ผ่านหน้าจอไปแล้ว ส่วนตัวนี้แตะแค่ support_project
 *
 * รันซ้ำได้เสมอ และ **ไม่ย้อนสิ่งที่ผู้ดูแลทำผ่านหน้าจอ**
 *   - แถวที่มีอยู่แล้ว: ไม่แตะ is_active และไม่แตะการผูก inbox เด็ดขาด
 *     (ผู้ดูแลอาจเปิดใช้งานหรือผูก inbox ไปแล้ว การรันสคริปต์ต้องไม่ปิดมันกลับ)
 *   - เติมให้เฉพาะช่องที่ยังว่าง: หมวดหมู่ตั้งต้น ทีม และที่อยู่เว็บ
 *   - ชื่อโครงการไม่ถูกเขียนทับ เพราะผู้ดูแลอาจเปลี่ยนชื่อให้ตรงกับที่ผู้ใช้เรียกจริง
 *
 * --link CODE=INBOX_ID (ใส่ซ้ำได้)
 *   อ่าน inbox นั้นจาก Chatwoot แบบ **GET อย่างเดียว** ตรวจว่าเป็น widget ของเว็บจริง
 *   แล้วเก็บเลข inbox กับ website token ไว้ในโครงการ
 *
 *   ⚠️ ผูกได้เฉพาะโครงการที่ไฟล์ข้อมูลกำหนดว่าเปิดใช้งาน — โครงการที่ลงทะเบียนไว้เฉย ๆ
 *      (is_active = false) ต้องถูกเปิดจากหน้าผู้ดูแลก่อน การผูก inbox ให้โครงการที่ยังปิดอยู่
 *      เท่ากับเปิดทางให้ข้อความจากเว็บจริงไหลเข้ามาโดยที่ยังไม่มีใครตั้งใจให้เกิด
 *
 * ⚠️ ไม่มีคำสั่งไหนในไฟล์นี้ที่เขียนอะไรลง Chatwoot — อ่านอย่างเดียวทั้งหมด
 */

import 'dotenv/config';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { chatwootWebsiteInboxes } from '../../integrations/chatwoot/chatwoot-api';
import { readChatwootSyncConfig } from '../../integrations/chatwoot/chatwoot-sync.config';
import * as schema from '../schema';
import { SUPPORT_PROJECTS } from './data/support-projects';

type Db = ReturnType<typeof drizzle<typeof schema>>;

interface ProjectResult {
  code: string;
  name: string;
  state: 'สร้างใหม่' | 'มีอยู่แล้ว';
  isActive: boolean;
  category: string;
  team: string;
  inbox: string;
}

/** อ่าน --link CODE=INBOX_ID ที่ใส่มากี่ครั้งก็ได้ */
function parseLinks(argv: readonly string[]): Map<string, number> {
  const links = new Map<string, number>();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--link') continue;
    const raw = argv[i + 1];
    if (!raw) throw new Error('--link ต้องตามด้วย CODE=INBOX_ID');

    const [code, value] = raw.split('=');
    const inboxId = Number(value);
    if (!code || !Number.isInteger(inboxId) || inboxId <= 0) {
      throw new Error(`--link ${raw} ไม่ถูกต้อง — ต้องเป็นรูปแบบ CODE=INBOX_ID เช่น DEMO=1`);
    }
    links.set(code.trim().toUpperCase(), inboxId);
  }
  return links;
}

async function main(): Promise<void> {
  const url = process.env.MIGRATE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('ต้องตั้ง MIGRATE_URL หรือ DATABASE_URL ก่อน');

  // บรรทัดแรกเสมอ — ผู้รันต้องเห็นว่ากำลังเขียนลงฐานข้อมูลตัวไหนก่อนอย่างอื่น
  console.log(`ฐานข้อมูลปลายทาง: ${new URL(url).host}`);

  const links = parseLinks(process.argv.slice(2));
  const seedByCode = new Map(SUPPORT_PROJECTS.map((p) => [p.code, p]));

  /*
   * ตรวจคำสั่ง --link ทั้งหมด "ก่อน" แตะฐานข้อมูลและก่อนยิง Chatwoot
   * ถ้าตรวจไปทำไป จะได้โครงการที่ผูกไปแล้วครึ่งหนึ่งเมื่อคำสั่งที่สามผิด
   */
  for (const [code] of links) {
    const seed = seedByCode.get(code);
    if (!seed) {
      throw new Error(`--link ${code}=… ไม่มีโครงการรหัสนี้ใน data/support-projects.ts`);
    }
    if (!seed.isActive) {
      throw new Error(
        `--link ${code}=… ทำไม่ได้ — โครงการ ${code} ถูกลงทะเบียนไว้แบบยังไม่เปิดใช้งาน\n` +
          '  เปิดใช้งานจากหน้าผู้ดูแล (PATCH /support-projects/{id} is_active: true) ก่อน แล้วผูก inbox จากหน้านั้นได้เลย',
      );
    }
  }

  const client = postgres(url, {
    max: 1,
    onnotice: () => {},
    ssl: new URL(url).hostname === 'localhost' ? false : 'require',
    ...(new URL(url).hostname.includes('-pooler') ? { prepare: false } : {}),
  });
  const db = drizzle(client, { schema });

  try {
    // ── อ่านสถานะปัจจุบันก่อน ยังไม่เขียนอะไรทั้งสิ้น ──
    const wantedCategories = [
      ...new Set(SUPPORT_PROJECTS.map((p) => p.defaultCategoryCode).filter((c): c is string => c !== null)),
    ];
    const wantedTeams = [
      ...new Set(SUPPORT_PROJECTS.map((p) => p.teamCode).filter((c): c is string => c !== null)),
    ];
    const wantedCompanies = [
      ...new Set(SUPPORT_PROJECTS.map((p) => p.companyCode).filter((c): c is string => c !== null)),
    ];

    const [categories, teams, companies, existing] = await Promise.all([
      wantedCategories.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: schema.ticketCategory.id, code: schema.ticketCategory.code })
            .from(schema.ticketCategory)
            // เอาเฉพาะหมวดหมู่ส่วนกลาง — หมวดหมู่ของบริษัทหนึ่งมี code ซ้ำกันได้
            .where(
              and(
                isNull(schema.ticketCategory.companyId),
                inArray(schema.ticketCategory.code, wantedCategories),
              ),
            ),
      wantedTeams.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: schema.supportTeam.id, code: schema.supportTeam.code })
            .from(schema.supportTeam)
            .where(inArray(schema.supportTeam.code, wantedTeams)),
      wantedCompanies.length === 0
        ? Promise.resolve([])
        : db
            .select({ id: schema.company.id, code: schema.company.code })
            .from(schema.company)
            .where(inArray(schema.company.code, wantedCompanies)),
      db
        .select({ code: schema.supportProject.code })
        .from(schema.supportProject)
        .where(inArray(schema.supportProject.code, [...seedByCode.keys()])),
    ]);

    const categoryByCode = new Map(categories.map((c) => [c.code, c.id]));
    const teamByCode = new Map(teams.map((t) => [t.code, t.id]));
    const companyByCode = new Map(companies.map((c) => [c.code, c.id]));
    const before = new Set(existing.map((row) => row.code));

    for (const project of SUPPORT_PROJECTS) {
      if (project.companyCode !== null && !companyByCode.has(project.companyCode)) {
        throw new Error(`โครงการ ${project.code} อ้างบริษัทที่ไม่มี: ${project.companyCode}`);
      }
      if (project.teamCode !== null && !teamByCode.has(project.teamCode)) {
        throw new Error(
          `โครงการ ${project.code} อ้างทีมที่ไม่มี: ${project.teamCode} — รัน support-team-cli.ts ก่อน`,
        );
      }
    }

    // ── อ่าน inbox จาก Chatwoot (GET อย่างเดียว) ──
    const inboxes = links.size > 0 ? await readInboxes([...links.values()]) : new Map();

    // ── เขียนลงฐานข้อมูล ──
    const results: ProjectResult[] = [];

    await db.transaction(async (tx) => {
      const t = tx as unknown as Db;

      for (const project of SUPPORT_PROJECTS) {
        const categoryId =
          project.defaultCategoryCode === null
            ? null
            : (categoryByCode.get(project.defaultCategoryCode) ?? null);
        const teamId = project.teamCode === null ? null : (teamByCode.get(project.teamCode) ?? null);
        const companyId =
          project.companyCode === null ? null : (companyByCode.get(project.companyCode) ?? null);
        const link = inboxes.get(links.get(project.code) ?? -1) ?? null;

        await t
          .insert(schema.supportProject)
          .values({
            code: project.code,
            name: project.name,
            companyId,
            defaultCategoryId: categoryId,
            teamId,
            locale: project.locale,
            isActive: project.isActive,
            chatwootInboxId: link?.id ?? null,
            chatwootWebsiteToken: link?.websiteToken ?? null,
            websiteUrl: link?.websiteUrl ?? null,
          })
          .onConflictDoUpdate({
            target: schema.supportProject.code,
            set: {
              /*
               * ⚠️ ไม่มี is_active และไม่มี chatwoot_inbox_id ในชุดนี้โดยตั้งใจ
               *    ผู้ดูแลที่เปิดใช้งานหรือผูก inbox ผ่านหน้าจอไปแล้ว ต้องไม่ถูกย้อนกลับ
               *    การผูก inbox ของแถวเดิมทำจากหน้าผู้ดูแลเท่านั้น
               *
               * เติมเฉพาะช่องที่ยังว่าง — ค่าที่ผู้ดูแลตั้งเองแล้วไม่ถูกทับ
               * ชื่อโครงการไม่อยู่ในชุดนี้เช่นกัน เพราะผู้ดูแลอาจเปลี่ยนให้ตรงกับที่ผู้ใช้เรียกจริง
               */
              defaultCategoryId: sql`coalesce(${schema.supportProject.defaultCategoryId}, excluded.default_category_id)`,
              teamId: sql`coalesce(${schema.supportProject.teamId}, excluded.team_id)`,
              websiteUrl: sql`coalesce(${schema.supportProject.websiteUrl}, excluded.website_url)`,
              updatedAt: new Date(),
            },
          });

        const current = await t
          .select({
            isActive: schema.supportProject.isActive,
            defaultCategoryId: schema.supportProject.defaultCategoryId,
            teamId: schema.supportProject.teamId,
            chatwootInboxId: schema.supportProject.chatwootInboxId,
            chatwootWebsiteToken: schema.supportProject.chatwootWebsiteToken,
          })
          .from(schema.supportProject)
          .where(eq(schema.supportProject.code, project.code))
          .limit(1);
        const row = current[0]!;

        results.push({
          code: project.code,
          name: project.name,
          state: before.has(project.code) ? 'มีอยู่แล้ว' : 'สร้างใหม่',
          isActive: row.isActive,
          category: project.defaultCategoryCode ?? '—',
          team: row.teamId === null ? '—' : (project.teamCode ?? '—'),
          inbox:
            row.chatwootInboxId === null
              ? '—'
              : `${row.chatwootInboxId}${row.chatwootWebsiteToken ? '' : ' (ไม่มี token)'}`,
        });
      }
    });

    console.log('\nสรุปโครงการสนับสนุน\n');
    console.log(
      `  ${'รหัส'.padEnd(16)}${'ชื่อ'.padEnd(22)}${'สถานะ'.padEnd(12)}${'เปิดใช้'.padEnd(10)}${'หมวดหมู่'.padEnd(16)}${'ທີມ'.padEnd(14)}inbox`,
    );
    console.log(`  ${'─'.repeat(96)}`);
    for (const r of results) {
      console.log(
        `  ${r.code.padEnd(16)}${r.name.padEnd(22)}${r.state.padEnd(12)}${(r.isActive ? 'ເປີດ' : 'ປິດ').padEnd(10)}${r.category.padEnd(16)}${r.team.padEnd(14)}${r.inbox}`,
      );
    }

    const created = results.filter((r) => r.state === 'สร้างใหม่').length;
    const active = results.filter((r) => r.isActive).length;
    console.log(`\nสร้างใหม่ ${created} · มีอยู่แล้ว ${results.length - created} · เปิดใช้งาน ${active}`);
    if (links.size === 0) {
      console.log('ยังไม่ได้ผูก inbox ใด — ใช้ --link CODE=INBOX_ID หรือผูกจากหน้าผู้ดูแล');
    }
    console.log('เสร็จเรียบร้อย');
  } finally {
    await client.end();
  }
}

/**
 * อ่าน inbox ที่ระบุจาก Chatwoot — GET อย่างเดียว
 *
 * ⚠️ รับเฉพาะ inbox ชนิด Website เท่านั้น
 *    inbox ชนิด API ที่ใช้ซิงก์แชทภายในไม่มี website token และไม่มี widget
 *    ถ้าผูกผิดใบ แชทของพนักงานทุกห้องจะถูกนำเข้าซ้ำเป็นห้องจากเว็บ
 */
async function readInboxes(
  inboxIds: readonly number[],
): Promise<Map<number, { id: number; websiteToken: string | null; websiteUrl: string | null }>> {
  const config = readChatwootSyncConfig();
  if (!config.apiReady) {
    throw new Error(
      'ยังตั้งค่า Chatwoot ไม่ครบ — ต้องมี CHATWOOT_BASE_URL, CHATWOOT_API_TOKEN และ CHATWOOT_ACCOUNT_ID',
    );
  }

  console.log(`อ่าน inbox จาก Chatwoot: ${config.baseUrl} บัญชี ${config.accountId} (อ่านอย่างเดียว)`);
  const websiteInboxes = await chatwootWebsiteInboxes(config);
  const byId = new Map(websiteInboxes.map((inbox) => [inbox.id, inbox]));

  const result = new Map<number, { id: number; websiteToken: string | null; websiteUrl: string | null }>();
  for (const inboxId of inboxIds) {
    const inbox = byId.get(inboxId);
    if (!inbox) {
      throw new Error(
        `inbox ${inboxId} ไม่ใช่ widget ของเว็บ (Channel::WebWidget) หรือไม่มีอยู่ในบัญชีนี้ — ` +
          `มีให้เลือก: ${[...byId.keys()].join(', ') || '(ไม่มีเลย)'}`,
      );
    }
    if (!inbox.website_token) {
      throw new Error(`inbox ${inboxId} ไม่มี website token — widget ยังใช้งานไม่ได้`);
    }
    console.log(`  inbox ${inbox.id} · ${inbox.name ?? ''} · ${inbox.website_url ?? 'ไม่ได้ตั้งที่อยู่เว็บ'}`);
    result.set(inboxId, {
      id: inbox.id,
      websiteToken: inbox.website_token,
      websiteUrl: inbox.website_url ?? null,
    });
  }
  return result;
}

main().catch((err: unknown) => {
  console.error('\nลงทะเบียนโครงการล้มเหลว:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
