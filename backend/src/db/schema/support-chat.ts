/**
 * แชทช่วยเหลือระหว่างผู้ใช้กับทีมไอที — 2 ตาราง
 *
 * หนึ่งคนมีแชทที่เปิดอยู่ได้ครั้งละหนึ่งห้องเท่านั้น (บังคับด้วย unique index บางส่วน)
 * ผู้ใช้จึงคุยต่อในห้องเดิมเสมอ ไม่ใช่เปิดห้องใหม่ทุกครั้งที่กดปุ่มแชท ซึ่งทำให้ทีมไอที
 * เห็นเรื่องเดียวกันกระจายอยู่หลายห้อง — ห้องที่ปิดแล้วเก็บไว้เป็นประวัติ
 *
 * ห้องมาได้สองทาง (คอลัมน์ origin)
 *   helpdesk  ผู้ใช้ที่ล็อกอินใน Helpdesk กดแชทกับทีมไอที — requester_id คือเจ้าของห้อง
 *   widget    ผู้เข้าชมเว็บของกลุ่มเปิดแชทจาก widget ของ Chatwoot — ไม่มีบัญชีใน Helpdesk
 *             requester_id จึงเป็น null และตัวตนเท่าที่รู้อยู่ในคอลัมน์ contact_*
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { appUser, company, inList } from './organization';
import { supportProject } from './support-project';
import { ticket } from './ticket';

export const SUPPORT_CHAT_STATUS = ['open', 'closed'] as const;
export type SupportChatStatus = (typeof SUPPORT_CHAT_STATUS)[number];

export const SUPPORT_CHAT_ORIGIN = ['helpdesk', 'widget'] as const;
export type SupportChatOrigin = (typeof SUPPORT_CHAT_ORIGIN)[number];

export const supportChat = pgTable(
  'support_chat',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /*
     * บริษัทต้นสังกัดของผู้ถาม ณ ตอนเปิดห้อง — ใช้ตัดสินว่าทีมไอทีบริษัทไหนเห็นห้องนี้
     *
     * ห้องจาก widget ไม่มีผู้ถามที่เป็นพนักงาน จึงใช้บริษัทของโครงการ
     * และถ้าโครงการเป็นส่วนกลาง (company_id เป็น null) ให้ใช้บริษัทเจ้าของระบบ
     * — ไม่มีห้องไหนไม่มีบริษัท เพราะนั่นคือห้องที่ไม่มีกฎการมองเห็น
     */
    companyId: bigint('company_id', { mode: 'number' })
      .notNull()
      .references(() => company.id),
    /** null = ห้องจาก widget (ผู้เข้าชมเว็บไม่มีบัญชีใน Helpdesk) */
    requesterId: bigint('requester_id', { mode: 'number' }).references(() => appUser.id),
    /** โครงการที่ห้องนี้สังกัด — null สำหรับห้องที่เปิดจากใน Helpdesk เอง */
    projectId: bigint('project_id', { mode: 'number' }).references(() => supportProject.id),
    origin: varchar('origin', { length: 20 }).default('helpdesk').notNull(),

    /*
     * ตัวตนของผู้เข้าชมเท่าที่ Chatwoot รู้ — ว่างได้ทั้งหมด ผู้เข้าชมไม่จำเป็นต้องกรอกอะไรเลย
     * contact_identifier คือ identifier ฝั่ง Chatwoot ไม่ใช่ชื่อผู้ใช้ใน Helpdesk
     */
    contactName: varchar('contact_name', { length: 150 }),
    contactEmail: varchar('contact_email', { length: 255 }),
    contactPhone: varchar('contact_phone', { length: 40 }),
    contactIdentifier: varchar('contact_identifier', { length: 255 }),
    /**
     * Chatwoot ยืนยันตัวตนของผู้เข้าชมรายนี้ด้วย HMAC แล้วหรือยัง
     * (`meta.hmac_verified` ของบทสนทนา — เว็บต้นทางคำนวณ identifier_hash ด้วย hmac_token ของ inbox)
     *
     * ⚠️ ธงนี้คือเส้นแบ่งเดียวระหว่าง "อีเมลที่ระบบต้นทางรับรอง" กับ "อีเมลที่ใครก็พิมพ์ได้"
     *    อีเมลจากฟอร์มก่อนแชทที่ยังไม่ผ่าน HMAC ต้องไม่ถูกผูกกับบัญชีใน Helpdesk เด็ดขาด
     *    มิฉะนั้นใครก็พิมพ์อีเมลหัวหน้าตัวเองแล้วเข้าไปอยู่ในห้องแชทของเขา
     */
    contactVerified: boolean('contact_verified').default(false).notNull(),
    // เจ้าหน้าที่คนแรกที่ตอบ — ตั้งให้อัตโนมัติ ไม่ต้องกดรับเรื่อง
    assigneeId: bigint('assignee_id', { mode: 'number' }).references(() => appUser.id),
    status: varchar('status', { length: 20 }).default('open').notNull(),
    // เผื่อเชื่อมกับ ticket ที่เปิดจากห้องนี้
    ticketId: bigint('ticket_id', { mode: 'number' }).references(() => ticket.id),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).defaultNow().notNull(),
    lastMessageBy: bigint('last_message_by', { mode: 'number' }).references(() => appUser.id),
    // อ่านถึงเมื่อไร แยกฝั่ง — ใช้คำนวณว่ามีข้อความที่ยังไม่ได้อ่านไหม
    requesterReadAt: timestamp('requester_read_at', { withTimezone: true }),
    staffReadAt: timestamp('staff_read_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: bigint('closed_by', { mode: 'number' }).references(() => appUser.id),

    /*
     * ซิงก์สองทางกับ Chatwoot — null ทั้งหมดเมื่อปิดการซิงก์หรือห้องนี้ยังไม่ถูกส่งไป
     * หนึ่งห้องใน Helpdesk = หนึ่งการสนทนาใน Chatwoot (inbox ชนิด API)
     */
    chatwootConversationId: bigint('chatwoot_conversation_id', { mode: 'number' }),
    chatwootContactId: bigint('chatwoot_contact_id', { mode: 'number' }),
    // id ข้อความล่าสุดใน Chatwoot ที่ระบบเห็นแล้ว — ดึงเฉพาะข้อความที่ใหม่กว่านี้
    chatwootCursor: bigint('chatwoot_cursor', { mode: 'number' }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('ck_support_chat_status_valid', inList('status', SUPPORT_CHAT_STATUS)),
    check('ck_support_chat_origin_valid', inList('origin', SUPPORT_CHAT_ORIGIN)),
    /*
     * หนึ่งคนหนึ่งห้องที่เปิดอยู่ — ยังคุมเหมือนเดิมหลัง requester_id เป็น null ได้
     * เพราะ NULL ในดัชนี unique ของ Postgres ถือว่าไม่ซ้ำกัน ห้องจาก widget
     * ทุกห้องจึงอยู่ร่วมกันได้ ส่วนห้องของพนักงานยังถูกบังคับข้อละหนึ่งเหมือนเดิม
     */
    uniqueIndex('uq_support_chat_open_requester')
      .on(t.requesterId)
      .where(sql`status = 'open'`),
    /*
     * หนึ่งบทสนทนาใน Chatwoot = หนึ่งห้องที่นี่เสมอ
     *
     * ตัวค้นพบ (discovery) อ่านรายการบทสนทนาซ้ำทุกรอบ ถ้าไม่มีดัชนีนี้
     * การ upsert ที่ชนกันสองรอบพร้อมกันจะสร้างห้องซ้ำให้ผู้เข้าชมคนเดียวกัน
     */
    uniqueIndex('uq_support_chat_chatwoot_conversation')
      .on(t.chatwootConversationId)
      .where(sql`chatwoot_conversation_id is not null`),
    index('ix_support_chat_company_status').on(t.companyId, t.status, t.lastMessageAt),
    index('ix_support_chat_project').on(t.projectId, t.status, t.lastMessageAt),
  ],
);

export const supportChatMessage = pgTable(
  'support_chat_message',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    chatId: bigint('chat_id', { mode: 'number' })
      .notNull()
      .references(() => supportChat.id, { onDelete: 'cascade' }),
    // null = ข้อความของระบบ เช่น "ทีมไอทีปิดแชทแล้ว"
    senderId: bigint('sender_id', { mode: 'number' }).references(() => appUser.id),
    // ว่างได้เมื่อข้อความนั้นเป็นไฟล์อย่างเดียว (รูป เสียง เอกสาร)
    body: text('body').notNull(),
    isSystem: boolean('is_system').default(false).notNull(),
    /**
     * ข้อความที่ผู้เข้าชมเว็บพิมพ์เองใน widget
     *
     * แยกจาก "ข้อความของระบบ" และ "ข้อความของเจ้าหน้าที่" ให้ชัด เพราะทั้งสามอย่าง
     * มี sender_id เป็น null ได้เหมือนกัน — ถ้าไม่มีธงนี้ ข้อความของผู้เข้าชม
     * จะถูกแสดงเป็นคำตอบของทีมไอทีในหน้าจอ (from_staff) ซึ่งกลับด้านกันทั้งห้อง
     */
    fromContact: boolean('from_contact').default(false).notNull(),

    /*
     * ไฟล์แนบของข้อความ — หนึ่งข้อความหนึ่งไฟล์ เหมือนแอปแชททั่วไป
     *
     * แยกจากตาราง attachment ของ ticket โดยตั้งใจ: ไฟล์ในแชทต้องเปิดได้เฉพาะคนในห้อง
     * ทางดาวน์โหลดจึงอยู่ใต้ /support-chat/{id}/... ที่ตรวจสิทธิ์ห้องทุกครั้ง
     * key เป็น path สัมพัทธ์ที่ระบบกำหนดเองทั้งหมด (chat/{company}/{yyyy}/{mm}/{uuid}.{ext})
     */
    attachmentKey: varchar('attachment_key', { length: 255 }).unique(),
    attachmentName: varchar('attachment_name', { length: 255 }),
    // ตรวจจาก magic bytes ไม่เชื่อ Content-Type ที่ client ส่งมา
    attachmentMime: varchar('attachment_mime', { length: 100 }),
    attachmentSize: bigint('attachment_size', { mode: 'number' }),
    attachmentKind: varchar('attachment_kind', { length: 10 }),

    /*
     * ซิงก์กับ Chatwoot
     * - chatwoot_message_id: ข้อความคู่กันใน Chatwoot · null = ยังไม่ได้ส่งไป · unique กันนำเข้าซ้ำ
     * - external_sender_name: คนตอบจากฝั่ง Chatwoot ที่ไม่มีบัญชีใน Helpdesk (sender_id เป็น null)
     */
    chatwootMessageId: bigint('chatwoot_message_id', { mode: 'number' }).unique(),
    externalSenderName: varchar('external_sender_name', { length: 150 }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // ต้องมีข้อความหรือไฟล์อย่างใดอย่างหนึ่ง — ข้อความว่างที่ไม่มีไฟล์คือฟองเปล่าในแชท
    check(
      'ck_support_chat_message_content',
      sql`char_length(body) <= 4000 and (char_length(body) >= 1 or attachment_key is not null)`,
    ),
    check(
      'ck_support_chat_message_attachment_kind_valid',
      sql`attachment_kind is null or attachment_kind in ('image', 'audio', 'file')`,
    ),
    check(
      'ck_support_chat_message_attachment_max_20mb',
      sql`attachment_size is null or attachment_size <= 20971520`,
    ),
    index('ix_support_chat_message_chat').on(t.chatId, t.id),
  ],
);
