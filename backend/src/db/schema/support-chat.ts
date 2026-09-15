/**
 * แชทช่วยเหลือระหว่างผู้ใช้กับทีมไอที — 2 ตาราง
 *
 * หนึ่งคนมีแชทที่เปิดอยู่ได้ครั้งละหนึ่งห้องเท่านั้น (บังคับด้วย unique index บางส่วน)
 * ผู้ใช้จึงคุยต่อในห้องเดิมเสมอ ไม่ใช่เปิดห้องใหม่ทุกครั้งที่กดปุ่มแชท ซึ่งทำให้ทีมไอที
 * เห็นเรื่องเดียวกันกระจายอยู่หลายห้อง — ห้องที่ปิดแล้วเก็บไว้เป็นประวัติ
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
import { ticket } from './ticket';

export const SUPPORT_CHAT_STATUS = ['open', 'closed'] as const;
export type SupportChatStatus = (typeof SUPPORT_CHAT_STATUS)[number];

export const supportChat = pgTable(
  'support_chat',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    // บริษัทต้นสังกัดของผู้ถาม ณ ตอนเปิดห้อง — ใช้ตัดสินว่าทีมไอทีบริษัทไหนเห็นห้องนี้
    companyId: bigint('company_id', { mode: 'number' })
      .notNull()
      .references(() => company.id),
    requesterId: bigint('requester_id', { mode: 'number' })
      .notNull()
      .references(() => appUser.id),
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
    uniqueIndex('uq_support_chat_open_requester')
      .on(t.requesterId)
      .where(sql`status = 'open'`),
    index('ix_support_chat_company_status').on(t.companyId, t.status, t.lastMessageAt),
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
