/**
 * ทีมสนับสนุนและสมาชิกในทีม — 2 ตาราง
 *
 * ⚠️ "หัวหน้าทีม" เป็นข้อมูล ไม่ใช่บทบาท
 *
 *    ความต้องการคือ "ให้หัวหน้าทีมไอทีมอบหมายงานให้คนในทีมตัวเองได้" ซึ่งถ้าทำเป็น
 *    role ใหม่จะต้องเพิ่ม permission code ใหม่ แล้วทุกครั้งที่มีทีมที่สอง ทีมที่สาม
 *    เมทริกซ์สิทธิ์จะบวมขึ้นโดยไม่ได้ตอบคำถามที่สำคัญกว่าคือ "หัวหน้าของใคร"
 *    — permission บอกได้แค่ "มอบหมายได้ไหม" ไม่ได้บอกว่า "มอบหมายให้ใครได้"
 *
 *    แบบเดียวกับ escalation_contact ที่เก็บตำแหน่ง Head of IT / CEO / DPO
 *    เป็นข้อมูล ไม่ใช่ชุดสิทธิ์ (organization.ts)
 */

import {
  bigint,
  bigserial,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

import { appUser, company } from './organization';

export const supportTeam = pgTable(
  'support_team',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    code: varchar('code', { length: 40 }).notNull().unique(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    /**
     * null = ทีมส่วนกลางที่ดูแลทุกบริษัทในกลุ่ม
     *
     * รูปแบบเดียวกับ ticket_category, business_hours และ sla_policy ที่ใช้
     * company_id เป็น NULL แทน "ใช้ร่วมกันทั้งกลุ่ม" — ไม่ใช่ข้อมูลกำพร้า
     */
    companyId: bigint('company_id', { mode: 'number' }).references(() => company.id),
    // ห้ามลบทีม ใช้ is_active = false — ประวัติการมอบหมายอ้างถึงทีมที่เคยมีอยู่
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('ix_support_team_company').on(t.companyId)],
);

export const supportTeamMember = pgTable(
  'support_team_member',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    // ลบทีมทิ้ง (กรณีแก้ข้อมูลผิดทันที) ต้องไม่ทิ้งแถวสมาชิกกำพร้าไว้
    teamId: bigint('team_id', { mode: 'number' })
      .notNull()
      .references(() => supportTeam.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => appUser.id),
    /** หัวหน้าทีมนับเป็นสมาชิกด้วยเสมอ — ธงนี้เพิ่มอำนาจมอบหมาย ไม่ได้แทนการเป็นสมาชิก */
    isLead: boolean('is_lead').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('uq_support_team_member').on(t.teamId, t.userId),
    /*
     * ดัชนีนี้อยู่บนเส้นทางร้อน — ScopeService อ่าน "ทีมที่ผู้ใช้คนนี้สังกัด"
     * ทุกครั้งที่ประกอบสิทธิ์ใหม่ (ทุก 30 วินาทีต่อผู้ใช้หนึ่งคน)
     */
    index('ix_support_team_member_user').on(t.userId),
  ],
);
