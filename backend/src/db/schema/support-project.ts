/**
 * โครงการสนับสนุน (support project) — หนึ่งเว็บแอปของกลุ่ม = หนึ่งแถวในตารางนี้
 *
 * AIDC Support Hub เฟส 1: ทุกเว็บแอปในเครือฝัง widget ของ Chatwoot ไว้หน้าเว็บ
 * หนึ่งเว็บ = หนึ่ง inbox ชนิด Website ใน Chatwoot = หนึ่งแถวที่นี่
 * บทสนทนาที่ผู้เข้าชมเริ่มจาก widget ไหน ก็ถูกติดป้ายด้วยโครงการนั้นในกล่องแชท
 *
 * ⚠️ chatwoot_website_token ไม่ใช่ความลับ
 *    Chatwoot ออกแบบให้ token นี้อยู่ในสคริปต์ที่ทุกหน้าเว็บโหลด ใครเปิด view-source
 *    ก็เห็น — เก็บไว้ที่นี่เพื่อให้ endpoint สาธารณะจ่ายให้สคริปต์ฝังได้
 *    ตัวที่เป็นความลับจริงคือ hmac_token ของ inbox ซึ่ง **ห้าม** เก็บหรือส่งออกจากที่นี่
 */

import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { company, inList } from './organization';
import { supportTeam } from './support-team';
import { ticketCategory } from './ticket';

/** ภาษาที่ widget ของโครงการนี้ใช้คุยกับผู้เข้าชม */
export const SUPPORT_PROJECT_LOCALES = ['lo', 'th', 'en'] as const;
export type SupportProjectLocale = (typeof SUPPORT_PROJECT_LOCALES)[number];

export const supportProject = pgTable(
  'support_project',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** รหัสที่สคริปต์ฝังใช้เรียกหาตัวเอง เช่น ILP — ตัวพิมพ์ใหญ่ ตัวเลข และขีดล่าง */
    code: varchar('code', { length: 40 }).notNull().unique(),
    name: varchar('name', { length: 120 }).notNull(),
    websiteUrl: varchar('website_url', { length: 255 }),
    /**
     * null = โครงการส่วนกลางที่ใช้ร่วมทั้งกลุ่ม
     *
     * รูปแบบเดียวกับ support_team, ticket_category และ sla_policy
     * แชทของโครงการส่วนกลางยังต้องมีบริษัทเสมอ (ดู support_chat.company_id)
     * เพราะ row-level scoping ตัดสินจากบริษัท ไม่ใช่จากโครงการ
     */
    companyId: bigint('company_id', { mode: 'number' }).references(() => company.id),
    /** หมวดหมู่ตั้งต้นเมื่อแชทของโครงการนี้ถูกยกระดับเป็น ticket */
    defaultCategoryId: bigint('default_category_id', { mode: 'number' }).references(
      () => ticketCategory.id,
    ),
    teamId: bigint('team_id', { mode: 'number' }).references(() => supportTeam.id),

    /*
     * ผูกกับ inbox ชนิด Website ใน Chatwoot
     * ทั้งคู่ว่างได้ = สร้างโครงการไว้ก่อนแล้วค่อยผูก inbox ทีหลัง
     */
    chatwootInboxId: bigint('chatwoot_inbox_id', { mode: 'number' }),
    chatwootWebsiteToken: varchar('chatwoot_website_token', { length: 120 }),

    locale: varchar('locale', { length: 5 }).default('lo').notNull(),
    // ห้ามลบโครงการ ใช้ is_active = false — แชทเก่าอ้างถึงโครงการที่เคยมีอยู่
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('ck_support_project_locale_valid', inList('locale', SUPPORT_PROJECT_LOCALES)),
    check('ck_support_project_code_format', sql`code ~ '^[A-Z0-9_]{2,40}$'`),
    /*
     * หนึ่ง inbox ผูกได้กับโครงการเดียว — ถ้าผูกซ้ำ บทสนทนาเดียวกันจะถูกนำเข้า
     * เป็นแชทสองห้องคนละโครงการ แล้วเจ้าหน้าที่สองคนตอบคนละห้องให้ผู้เข้าชมคนเดียวกัน
     */
    uniqueIndex('uq_support_project_chatwoot_inbox')
      .on(t.chatwootInboxId)
      .where(sql`chatwoot_inbox_id is not null`),
    index('ix_support_project_company').on(t.companyId),
  ],
);
