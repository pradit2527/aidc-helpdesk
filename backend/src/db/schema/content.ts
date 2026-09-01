/**
 * ไฟล์แนบ คลังความรู้ การแจ้งเตือน และร่องรอยการใช้งาน — 7 ตาราง
 * ตรงกับ docs/02-data-model.md v2.0 §2.5, §4.6, §4.7
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  KB_STATUS,
  KB_VISIBILITY,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_STATUS,
  SCAN_STATUS,
} from '../../common/constants';
import { appUser, company, inList } from './organization';
import { ticket, ticketComment } from './ticket';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const kbCategory = pgTable(
  'kb_category',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    parentId: bigint('parent_id', { mode: 'number' }),
    nameTh: varchar('name_th', { length: 150 }).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
  },
  // ชื่อซ้ำภายใต้แม่เดียวกันไม่ได้ — parent_id เป็น NULL สำหรับหมวดระดับบนสุด
  // ซึ่งเป็นกรณีที่ต้องกันซ้ำมากที่สุด จึงต้อง NULLS NOT DISTINCT
  (t) => [unique('uq_kb_category_parent_name').on(t.parentId, t.nameTh).nullsNotDistinct()],
);

export const kbArticle = pgTable(
  'kb_article',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    kbCategoryId: bigint('kb_category_id', { mode: 'number' })
      .notNull()
      .references(() => kbCategory.id),
    // null = ทุกบริษัทเห็น
    companyId: bigint('company_id', { mode: 'number' }).references(() => company.id),
    title: varchar('title', { length: 255 }).notNull(),
    summary: varchar('summary', { length: 500 }),
    bodyMarkdown: text('body_markdown').notNull(),
    visibility: varchar('visibility', { length: 20 }).default('public').notNull(),
    status: varchar('status', { length: 20 }).default('draft').notNull(),
    tags: varchar('tags', { length: 255 }),
    authorId: bigint('author_id', { mode: 'number' })
      .notNull()
      .references(() => appUser.id),
    viewCount: integer('view_count').default(0).notNull(),
    helpfulCount: integer('helpful_count').default(0).notNull(),
    notHelpfulCount: integer('not_helpful_count').default(0).notNull(),
    sourceTicketId: bigint('source_ticket_id', { mode: 'number' }).references(() => ticket.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('ck_kb_visibility_valid', inList('visibility', KB_VISIBILITY)),
    check('ck_kb_status_valid', inList('status', KB_STATUS)),
    // เผยแพร่แล้วต้องมีเวลาเผยแพร่
    check('ck_kb_published_needs_date', sql`status <> 'published' OR published_at IS NOT NULL`),
    index('ix_kb_article_company').on(t.companyId),
    index('ix_kb_article_status').on(t.status, t.visibility),
  ],
);

export const attachment = pgTable(
  'attachment',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    // ทั้งสามเป็น null ได้ชั่วคราว เพราะ POST /attachments อัปโหลด "ก่อน" สร้าง ticket (B-08)
    // งาน cleanup_orphan_attachments ลบไฟล์ที่ไม่ผูกกับอะไรเกิน 24 ชม.
    ticketId: bigint('ticket_id', { mode: 'number' }).references(() => ticket.id),
    commentId: bigint('comment_id', { mode: 'number' }).references(() => ticketComment.id),
    kbArticleId: bigint('kb_article_id', { mode: 'number' }).references(() => kbArticle.id),

    // path สัมพัทธ์ {company_id}/{yyyy}/{mm}/{uuid}.{ext} — ระบบเป็นคนกำหนดทั้งหมด
    // ชื่อไฟล์ของผู้ใช้ไม่เคยถูกใช้ประกอบ path (กัน path traversal)
    storageKey: varchar('storage_key', { length: 255 }).notNull().unique(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    // ตรวจจาก magic bytes จริง ไม่เชื่อ Content-Type ที่ client ส่งมา (NFR-15)
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    uploadedBy: bigint('uploaded_by', { mode: 'number' })
      .notNull()
      .references(() => appUser.id),
    // รองรับ virus scan ในเฟส 2 — เฟส 1 เป็น skipped ทั้งหมด (B-04)
    scanStatus: varchar('scan_status', { length: 20 }).default('skipped').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('ck_attachment_scan_status_valid', inList('scan_status', SCAN_STATUS)),
    check('ck_attachment_size_max_20mb', sql`file_size <= 20971520`),
    index('ix_attachment_ticket').on(t.ticketId),
  ],
);

/** กันโหวตซ้ำรายผู้ใช้ (B-05 / US-13 AC-3) */
export const kbFeedback = pgTable(
  'kb_feedback',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    kbArticleId: bigint('kb_article_id', { mode: 'number' })
      .notNull()
      .references(() => kbArticle.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => appUser.id),
    isHelpful: boolean('is_helpful').notNull(),
    note: varchar('note', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('uq_kb_feedback_article_user').on(t.kbArticleId, t.userId)],
);

/** 1 แถว = 1 ช่องทาง เพื่อให้ retry รายช่องทางแยกกันได้ */
export const notification = pgTable(
  'notification',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => appUser.id),
    ticketId: bigint('ticket_id', { mode: 'number' }).references(() => ticket.id),
    eventType: varchar('event_type', { length: 40 }).notNull(),
    channel: varchar('channel', { length: 20 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body').notNull(),
    status: varchar('status', { length: 20 }).default('pending').notNull(),
    retryCount: integer('retry_count').default(0).notNull(),
    errorMessage: varchar('error_message', { length: 500 }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('ck_notification_channel_valid', inList('channel', NOTIFICATION_CHANNEL)),
    check('ck_notification_status_valid', inList('status', NOTIFICATION_STATUS)),
    index('ix_notification_unread').on(t.userId, t.channel, t.readAt),
    // กัน BullMQ retry สร้างแถวซ้ำในวันเดียวกัน (S-04)
    //
    // ต้องตรึงโซนเวลาในนิพจน์ ใช้ created_at::date เฉย ๆ ไม่ได้สองเหตุผล
    //   1) Postgres ปฏิเสธ เพราะการแปลง timestamptz เป็น date ขึ้นกับ TimeZone
    //      ของ session จึงเป็น STABLE ไม่ใช่ IMMUTABLE ซึ่งดัชนีต้องการ
    //   2) ต่อให้ยอมรับ ขอบเขต "วัน" ก็จะเลื่อนตามโซนเวลาของผู้เชื่อมต่อ
    //      งานที่รันจาก worker คนละโซนจะตัดวันไม่ตรงกัน
    // timezone(text, timestamptz) เป็น IMMUTABLE จึงใช้เป็นดัชนีได้
    uniqueIndex('uq_notification_dedup').on(
      t.userId,
      t.ticketId,
      t.eventType,
      t.channel,
      sql`((created_at AT TIME ZONE 'Asia/Vientiane')::date)`,
    ),
  ],
);

export const notificationChannel = pgTable(
  'notification_channel',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 20 }).notNull(),
    destination: varchar('destination', { length: 255 }),
    isEnabled: boolean('is_enabled').default(true).notNull(),
    // LINE ต้องผูกบัญชีสำเร็จก่อนจึงส่งได้
    isVerified: boolean('is_verified').default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    unique('uq_notification_channel_user').on(t.userId, t.channel),
    check('ck_notification_channel_code_valid', inList('channel', NOTIFICATION_CHANNEL)),
  ],
);

/**
 * append-only — ห้าม UPDATE/DELETE จากชั้น application
 * เก็บอย่างน้อย 1 ปี และห้าม purge ก่อน 90 วัน (NFR-18 / นโยบาย 3.3)
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: bigint('actor_id', { mode: 'number' }).references(() => appUser.id),
    companyId: bigint('company_id', { mode: 'number' }).references(() => company.id),
    action: varchar('action', { length: 40 }).notNull(),
    entityType: varchar('entity_type', { length: 40 }).notNull(),
    entityId: bigint('entity_id', { mode: 'number' }),
    // เฉพาะฟิลด์ที่เปลี่ยน — ห้ามเก็บ password / token (NFR-19)
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    ipAddress: varchar('ip_address', { length: 45 }), // รองรับ IPv6
    userAgent: varchar('user_agent', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('ix_audit_created').on(t.createdAt),
    index('ix_audit_actor').on(t.actorId, t.createdAt),
    index('ix_audit_entity').on(t.entityType, t.entityId),
    index('ix_audit_company').on(t.companyId, t.createdAt),
  ],
);
