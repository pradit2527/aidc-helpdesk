/**
 * กระบวนการตาม SOP — catalog · การอนุมัติ · checklist · บัญชีซอฟต์แวร์ — 7 ตาราง
 * ตรงกับ docs/02-data-model.md v2.0 §2.4, §5.10–5.16
 *
 * ทั้งหมดนี้ SOP-03/04/05/06 บังคับ ไม่ใช่ของที่เลือกทำได้
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  APPROVAL_STATUS,
  APPROVER_TYPE,
  CLOCK_START_EVENT,
  PRIORITY,
  TARGET_MODE,
} from '../../common/constants';
import { appUser, company, inList } from './organization';
import { ticket, ticketCategory } from './ticket';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const checklistTemplate = pgTable(
  'checklist_template',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    companyId: bigint('company_id', { mode: 'number' }).references(() => company.id),
    code: varchar('code', { length: 40 }).notNull(),
    nameTh: varchar('name_th', { length: 150 }).notNull(),
    docRef: varchar('doc_ref', { length: 40 }), // เช่น AIDC-IT-SOP-001 ก.1
    // เพิ่มทีละ 1 เมื่อแก้รายการ — ticket เก่าอ้างเวอร์ชันเดิมผ่านสแนปช็อต
    version: integer('version').default(1).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    ...timestamps,
  },
  (t) => [unique('uq_checklist_template_company_code').on(t.companyId, t.code)],
);

export const checklistItem = pgTable(
  'checklist_item',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    templateId: bigint('template_id', { mode: 'number' })
      .notNull()
      .references(() => checklistTemplate.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').default(0).notNull(),
    titleTh: varchar('title_th', { length: 255 }).notNull(),
    description: varchar('description', { length: 500 }),
    // true = บล็อกการเปลี่ยนสถานะเป็น resolved (SOP-04 ข้อ 6 / SOP-05 ข้อ 6)
    isRequired: boolean('is_required').default(true).notNull(),
    // true = ต้องแนบไฟล์หลักฐานก่อนติ๊กว่าเสร็จ
    evidenceRequired: boolean('evidence_required').default(false).notNull(),
    defaultRoleCode: varchar('default_role_code', { length: 30 }),
    isActive: boolean('is_active').default(true).notNull(),
  },
  (t) => [unique('uq_checklist_item_template_order').on(t.templateId, t.sortOrder)],
);

/**
 * เป้าหมายเวลารายรายการของคำขอบริการ (SLA 5.3)
 *
 * เหตุผลที่ต้องมีตารางนี้: รีเซ็ตรหัสผ่านมีเป้า 30 นาทีทำการ ขณะที่ P4 คือ
 * 5 วันทำการ — ต่างกัน 90 เท่า ใช้ sla_target ตาม priority อย่างเดียวแทนไม่ได้
 */
export const serviceCatalogItem = pgTable(
  'service_catalog_item',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    companyId: bigint('company_id', { mode: 'number' }).references(() => company.id),
    code: varchar('code', { length: 40 }).notNull(),
    nameTh: varchar('name_th', { length: 150 }).notNull(),
    categoryId: bigint('category_id', { mode: 'number' }).references(() => ticketCategory.id),
    defaultImpact: varchar('default_impact', { length: 20 }).default('individual').notNull(),
    defaultUrgency: varchar('default_urgency', { length: 20 }).default('low').notNull(),
    defaultPriority: varchar('default_priority', { length: 10 }).default('P4').notNull(),

    targetMode: varchar('target_mode', { length: 30 }).default('duration').notNull(),
    targetMinutes: integer('target_minutes'), // นาทีทำการ
    // จุดเริ่มนับต่างกัน 4 แบบ — คำขอสิทธิ์เริ่มนับ "หลังการอนุมัติครบถ้วน" (SLA 5.3)
    clockStartEvent: varchar('clock_start_event', { length: 30 }).default('on_create').notNull(),
    leadTimeDays: integer('lead_time_days'),
    leadTimeUnit: varchar('lead_time_unit', { length: 10 }), // calendar / business

    requiresApproval: boolean('requires_approval').default(false).notNull(),
    // ลำดับ approver_type คั่นด้วย , เช่น "line_manager,system_owner"
    approvalChain: varchar('approval_chain', { length: 200 }),
    checklistTemplateId: bigint('checklist_template_id', { mode: 'number' }).references(
      () => checklistTemplate.id,
    ),
    isActive: boolean('is_active').default(true).notNull(),
    ...timestamps,
  },
  (t) => [
    unique('uq_catalog_item_company_code').on(t.companyId, t.code),
    check('ck_catalog_target_mode_valid', inList('target_mode', TARGET_MODE)),
    check('ck_catalog_clock_start_valid', inList('clock_start_event', CLOCK_START_EVENT)),
    check('ck_catalog_priority_valid', inList('default_priority', PRIORITY)),
    // target_mode = duration ต้องมีจำนวนนาที
    check(
      'ck_catalog_duration_needs_minutes',
      sql`target_mode <> 'duration' OR target_minutes IS NOT NULL`,
    ),
    // ต้องอนุมัติ = ต้องระบุว่าใครอนุมัติ
    check(
      'ck_catalog_approval_needs_chain',
      sql`requires_approval = false OR approval_chain IS NOT NULL`,
    ),
    index('ix_catalog_item_company').on(t.companyId),
  ],
);

/**
 * การอนุมัติแบบเรียงลำดับ (SOP-03, SOP-06)
 *
 * ระหว่างมีขั้น pending ticket จะอยู่ pending_user + pending_reason='approval'
 * ซึ่งหยุดนับ SLA ตาม SLA ข้อ 9
 */
export const approvalRequest = pgTable(
  'approval_request',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ticketId: bigint('ticket_id', { mode: 'number' })
      .notNull()
      .references(() => ticket.id, { onDelete: 'cascade' }),
    // ขั้น n+1 เปิดใช้ได้เมื่อขั้น n เป็น approved
    seq: smallint('seq').default(1).notNull(),
    approverType: varchar('approver_type', { length: 30 }).notNull(),
    // null = ยังหาผู้อนุมัติไม่ได้ ต้องแจ้ง company_admin ให้กำหนดคน
    approverId: bigint('approver_id', { mode: 'number' }).references(() => appUser.id),
    status: varchar('status', { length: 20 }).default('pending').notNull(),
    decidedBy: bigint('decided_by', { mode: 'number' }).references(() => appUser.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    comment: varchar('comment', { length: 500 }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    // หลักฐานการอนุมัติ (SOP-03 ข้อ 4)
    attachmentId: bigint('attachment_id', { mode: 'number' }),
    // สิทธิ์ชั่วคราวต้องมีกำหนดสิ้นสุด (SOP-03 ข้อ 6)
    accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }),
  },
  (t) => [
    unique('uq_approval_ticket_seq').on(t.ticketId, t.seq),
    check('ck_approval_status_valid', inList('status', APPROVAL_STATUS)),
    check('ck_approval_approver_type_valid', inList('approver_type', APPROVER_TYPE)),
    // ปฏิเสธต้องมีเหตุผลเสมอ — บังคับที่ระดับฐานข้อมูล
    check('ck_approval_reject_needs_comment', sql`status <> 'rejected' OR comment IS NOT NULL`),
    // ตัดสินแล้วต้องมีทั้งคนตัดสินและเวลา
    check(
      'ck_approval_decided_complete',
      sql`status NOT IN ('approved','rejected') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)`,
    ),
    index('ix_approval_ticket').on(t.ticketId),
    index('ix_approval_approver_status').on(t.approverId, t.status),
  ],
);

export const ticketChecklist = pgTable(
  'ticket_checklist',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ticketId: bigint('ticket_id', { mode: 'number' })
      .notNull()
      .references(() => ticket.id, { onDelete: 'cascade' }),
    templateId: bigint('template_id', { mode: 'number' })
      .notNull()
      .references(() => checklistTemplate.id),
    // สแนปช็อตเวอร์ชัน — แก้ template ภายหลังไม่กระทบ ticket เก่า
    // หลักเดียวกับ ticket.sla_policy_id
    templateVersion: integer('template_version').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('uq_ticket_checklist').on(t.ticketId, t.templateId),
    index('ix_ticket_checklist_ticket').on(t.ticketId),
  ],
);

export const ticketChecklistItem = pgTable(
  'ticket_checklist_item',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ticketChecklistId: bigint('ticket_checklist_id', { mode: 'number' })
      .notNull()
      .references(() => ticketChecklist.id, { onDelete: 'cascade' }),
    // null ได้ถ้าต้นทางถูกลบ — ข้อความยังอยู่ใน title_snapshot
    checklistItemId: bigint('checklist_item_id', { mode: 'number' }).references(
      () => checklistItem.id,
    ),
    titleSnapshot: varchar('title_snapshot', { length: 255 }).notNull(),
    isRequired: boolean('is_required').default(true).notNull(),
    evidenceRequired: boolean('evidence_required').default(false).notNull(),
    isDone: boolean('is_done').default(false).notNull(),
    doneBy: bigint('done_by', { mode: 'number' }).references(() => appUser.id),
    doneAt: timestamp('done_at', { withTimezone: true }),
    note: varchar('note', { length: 500 }),
    attachmentId: bigint('attachment_id', { mode: 'number' }),
  },
  (t) => [
    // ข้อที่ต้องมีหลักฐาน ติ๊กเสร็จไม่ได้ถ้ายังไม่แนบไฟล์
    check(
      'ck_checklist_item_evidence_when_done',
      sql`NOT (is_done AND evidence_required AND attachment_id IS NULL)`,
    ),
    // ติ๊กเสร็จแล้วต้องรู้ว่าใครติ๊กและเมื่อไร (เป็นหลักฐานตาม SOP)
    check(
      'ck_checklist_item_done_complete',
      sql`NOT is_done OR (done_by IS NOT NULL AND done_at IS NOT NULL)`,
    ),
    index('ix_ticket_checklist_item_parent').on(t.ticketChecklistId),
  ],
);

/**
 * บัญชีซอฟต์แวร์อนุมัติ (SOP-06 ข้อ 2 / นโยบาย 3.5)
 *
 * เฟส 1 เป็น master data อ่านอย่างเดียว — ให้ระบบเช็กได้ว่าคำขอติดตั้ง
 * เข้าข่าย SR-SW-INSTALL (2 วันทำการ) หรือ SR-SW-NONSTD (ต้องอนุมัติ)
 */
export const approvedSoftware = pgTable(
  'approved_software',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    companyId: bigint('company_id', { mode: 'number' }).references(() => company.id),
    name: varchar('name', { length: 150 }).notNull(),
    version: varchar('version', { length: 50 }),
    licenseType: varchar('license_type', { length: 50 }),
    note: varchar('note', { length: 500 }),
    isActive: boolean('is_active').default(true).notNull(),
    ...timestamps,
  },
  (t) => [index('ix_approved_software_name').on(t.name), index('ix_approved_software_company').on(t.companyId)],
);
