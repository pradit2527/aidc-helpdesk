/**
 * Ticket แกนกลาง — 5 ตาราง
 * ตรงกับ docs/02-data-model.md v2.0 §2.2, §3
 *
 * CHECK constraint ในไฟล์นี้คือเหตุผลหลักที่เลือก Drizzle แทน Prisma —
 * กฎจากเอกสารควบคุมถูกบังคับถึงระดับฐานข้อมูล ไม่ใช่แค่ในโค้ด
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  CHANNEL,
  IMPACT,
  PENDING_REASON,
  PRIORITY,
  SLA_EXCLUSION_CODE,
  SOURCE_DEVICE,
  TICKET_STATUS,
  TICKET_TYPE,
  URGENCY,
} from '../../common/constants';
import { appUser, company, department, inList } from './organization';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const ticketCategory = pgTable(
  'ticket_category',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    // null = หมวดหมู่ใช้ร่วมทั้งกลุ่ม
    companyId: bigint('company_id', { mode: 'number' }).references(() => company.id),
    parentId: bigint('parent_id', { mode: 'number' }),
    code: varchar('code', { length: 40 }).notNull(),
    nameTh: varchar('name_th', { length: 150 }).notNull(),

    // v1.0 เคยมี default_priority — ถูกแทนด้วยสองคอลัมน์นี้
    // เพราะระบบคำนวณ priority เอง การเก็บ default_priority ไว้จะขัดกันเอง (G-02)
    defaultImpact: varchar('default_impact', { length: 20 }).default('individual').notNull(),
    defaultUrgency: varchar('default_urgency', { length: 20 }).default('medium').notNull(),
    defaultAssigneeId: bigint('default_assignee_id', { mode: 'number' }).references(
      () => appUser.id,
    ),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    ...timestamps,
  },
  (t) => [
    check('ck_ticket_category_impact_valid', inList('default_impact', IMPACT)),
    check('ck_ticket_category_urgency_valid', inList('default_urgency', URGENCY)),
    // code ต้องไม่ซ้ำในขอบเขตเดียวกัน มิฉะนั้น seed จะสร้างหมวดหมู่ซ้ำทุกครั้งที่รัน
    // และ ticket ที่อ้าง 'NETWORK' จะไม่รู้ว่าหมายถึงแถวไหน
    unique('uq_ticket_category_company_code').on(t.companyId, t.code).nullsNotDistinct(),
    index('ix_ticket_category_company').on(t.companyId),
  ],
);

/**
 * ออกเลข ticket แบบไม่ชนกัน (B-03)
 *
 * ใช้ SELECT … FOR UPDATE ในทรานแซกชันเดียวกับการ insert ticket
 * ห้ามใช้ COUNT(*)+1 เด็ดขาด — race condition ที่ 200 request พร้อมกันจะเลขซ้ำ
 */
export const ticketSequence = pgTable(
  'ticket_sequence',
  {
    companyId: bigint('company_id', { mode: 'number' })
      .notNull()
      .references(() => company.id),
    period: char('period', { length: 6 }).notNull(), // yyyymm
    lastNo: integer('last_no').default(0).notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.period] })],
);

export const ticket = pgTable(
  'ticket',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ticketNo: varchar('ticket_no', { length: 30 }).notNull().unique(),

    // ── ข้อมูลพื้นฐาน ──
    ticketType: varchar('ticket_type', { length: 20 }).default('incident').notNull(),
    companyId: bigint('company_id', { mode: 'number' })
      .notNull()
      .references(() => company.id),
    departmentId: bigint('department_id', { mode: 'number' }).references(() => department.id),
    categoryId: bigint('category_id', { mode: 'number' })
      .notNull()
      .references(() => ticketCategory.id),
    catalogItemId: bigint('catalog_item_id', { mode: 'number' }),
    serviceId: bigint('service_id', { mode: 'number' }),
    problemId: bigint('problem_id', { mode: 'number' }),

    requesterId: bigint('requester_id', { mode: 'number' })
      .notNull()
      .references(() => appUser.id),
    createdBy: bigint('created_by', { mode: 'number' })
      .notNull()
      .references(() => appUser.id),
    assigneeId: bigint('assignee_id', { mode: 'number' }).references(() => appUser.id),

    subject: varchar('subject', { length: 255 }).notNull(),
    description: text('description').notNull(),

    // 4 ช่องทางตามเอกสารควบคุม — ไม่มี LINE (G-15)
    channel: varchar('channel', { length: 20 }).default('portal').notNull(),
    sourceDevice: varchar('source_device', { length: 20 }),
    // ใช้กับ channel='phone' เพื่อรายงานเป้า "รับสายภายใน 3 นาที"
    callAnsweredAt: timestamp('call_answered_at', { withTimezone: true }),
    // สะพานชั่วคราวก่อนมี Asset module (นโยบาย 3.9)
    assetTag: varchar('asset_tag', { length: 50 }),

    // ── ระดับความสำคัญ ──
    impact: varchar('impact', { length: 20 }).default('individual').notNull(),
    urgency: varchar('urgency', { length: 20 }).default('medium').notNull(),
    // ระบบคำนวณจาก impact × urgency — ผู้แจ้งส่งมาโดยตรงไม่ได้ (SLA ข้อ 4)
    priority: varchar('priority', { length: 10 }).default('P3').notNull(),
    // จุดเริ่มนับ SLA ใหม่เมื่อมีการปรับระดับ — ไม่ใช่ created_at (G-08)
    priorityChangedAt: timestamp('priority_changed_at', { withTimezone: true }),
    priorityReviewRequestedAt: timestamp('priority_review_requested_at', { withTimezone: true }),
    priorityReviewReason: varchar('priority_review_reason', { length: 500 }),

    // ── สถานะและการหยุดนับเวลา ──
    status: varchar('status', { length: 20 }).default('new').notNull(),
    pendingReason: varchar('pending_reason', { length: 20 }),
    pendingStartedAt: timestamp('pending_started_at', { withTimezone: true }),
    // บังคับสำหรับ reason='vendor' — ต้องแจ้งผู้รับบริการก่อนจึงหยุดนับเวลาได้ (SLA 5.4)
    pendingNotifiedAt: timestamp('pending_notified_at', { withTimezone: true }),
    pendingDurationMinutes: integer('pending_duration_minutes').default(0).notNull(),

    // ต้องส่งติดตามครบ 2 ครั้งก่อน จึงเริ่มนับ 3 วันทำการเพื่อปิดอัตโนมัติได้ (G-09)
    followupCount: integer('followup_count').default(0).notNull(),
    lastFollowupAt: timestamp('last_followup_at', { withTimezone: true }),

    supportTier: smallint('support_tier').default(1).notNull(),
    tierChangedAt: timestamp('tier_changed_at', { withTimezone: true }),
    vendorRef: varchar('vendor_ref', { length: 100 }),
    // counter สำหรับ KPI-3 (FCR) — นับจาก history ทุกครั้งช้าเกินไป
    assigneeChangeCount: integer('assignee_change_count').default(0).notNull(),

    // ── SLA ──
    slaPolicyId: bigint('sla_policy_id', { mode: 'number' }),
    // จุดเริ่มนับจริง ต่างจาก created_at สำหรับคำขอที่ต้องอนุมัติก่อน (SLA 5.3)
    slaClockStartedAt: timestamp('sla_clock_started_at', { withTimezone: true }),
    responseDueAt: timestamp('response_due_at', { withTimezone: true }),
    resolutionDueAt: timestamp('resolution_due_at', { withTimezone: true }),
    // คอมเมนต์สาธารณะครั้งแรกจาก agent — การ assign ไม่นับ (SLA 5.1)
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    // ใช้กับคำขอเชิงวันที่ (onboarding / offboarding)
    targetDate: date('target_date'),
    nextStatusReportDueAt: timestamp('next_status_report_due_at', { withTimezone: true }),

    // หยุดนับ resolution ของ incident ทันที และบังคับผูก problem (SLA 5.4)
    workaroundAt: timestamp('workaround_at', { withTimezone: true }),
    workaroundNote: text('workaround_note'),

    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNote: text('resolution_note'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    // null พร้อมกับ closed_at ไม่ null = ระบบปิดอัตโนมัติ
    closedBy: bigint('closed_by', { mode: 'number' }).references(() => appUser.id),

    isResponseBreached: boolean('is_response_breached').default(false).notNull(),
    isResolutionBreached: boolean('is_resolution_breached').default(false).notNull(),
    escalationNotifiedAt: timestamp('escalation_notified_at', { withTimezone: true }),

    // ข้อยกเว้นตาม SLA ข้อ 9 — ตัดออกจากตัวหาร KPI และไม่ตั้งธง breach
    slaExclusionCode: varchar('sla_exclusion_code', { length: 30 }),
    slaExclusionNote: varchar('sla_exclusion_note', { length: 500 }),

    reopenCount: integer('reopen_count').default(0).notNull(),
    resolvedByKbId: bigint('resolved_by_kb_id', { mode: 'number' }),

    // ── เหตุร้ายแรงและความปลอดภัย ──
    isMajorIncident: boolean('is_major_incident').default(false).notNull(),
    incidentCommanderId: bigint('incident_commander_id', { mode: 'number' }).references(
      () => appUser.id,
    ),
    // ticket ที่ตั้งธงนี้ใช้ขอบเขตการมองเห็นแคบกว่าบริษัทปกติ (SOP-10 ข้อ 2)
    isSecurityIncident: boolean('is_security_incident').default(false).notNull(),
    personalDataAffected: boolean('personal_data_affected').default(false).notNull(),
    dpoNotifiedAt: timestamp('dpo_notified_at', { withTimezone: true }),
    // = เวลาที่ประเมินว่ากระทบข้อมูลส่วนบุคคล + 72 ชม. (PDPA)
    regulatorNotifyDueAt: timestamp('regulator_notify_due_at', { withTimezone: true }),
    isImmediateSuspend: boolean('is_immediate_suspend').default(false).notNull(),
    restorePointDate: date('restore_point_date'),

    // ── CSAT ──
    satisfactionScore: smallint('satisfaction_score'),
    // จำเป็นต่อการรายงาน Response Rate ที่ SLA ภาคผนวก ก.3 บังคับให้รายงานคู่กับ CSAT
    csatSentAt: timestamp('csat_sent_at', { withTimezone: true }),
    csatRespondedAt: timestamp('csat_responded_at', { withTimezone: true }),

    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('ck_ticket_type_valid', inList('ticket_type', TICKET_TYPE)),
    check('ck_ticket_status_valid', inList('status', TICKET_STATUS)),
    check('ck_ticket_priority_valid', inList('priority', PRIORITY)),
    check('ck_ticket_impact_valid', inList('impact', IMPACT)),
    check('ck_ticket_urgency_valid', inList('urgency', URGENCY)),
    check('ck_ticket_channel_valid', inList('channel', CHANNEL)),
    check(
      'ck_ticket_source_device_valid',
      sql`source_device IS NULL OR ${inList('source_device', SOURCE_DEVICE)}`,
    ),
    check(
      'ck_ticket_pending_reason_valid',
      sql`pending_reason IS NULL OR ${inList('pending_reason', PENDING_REASON)}`,
    ),
    check(
      'ck_ticket_sla_exclusion_valid',
      sql`sla_exclusion_code IS NULL OR ${inList('sla_exclusion_code', SLA_EXCLUSION_CODE)}`,
    ),
    check('ck_ticket_support_tier_range', sql`support_tier BETWEEN 1 AND 3`),
    check(
      'ck_ticket_satisfaction_range',
      sql`satisfaction_score IS NULL OR satisfaction_score BETWEEN 1 AND 5`,
    ),
    // บังคับที่ระดับฐานข้อมูล: อยู่ pending_user ต้องระบุเหตุผลเสมอ (G-06)
    check(
      'ck_ticket_pending_needs_reason',
      sql`status <> 'pending_user' OR pending_reason IS NOT NULL`,
    ),
    // คำขอบริการต้องผูกกับรายการใน catalog เพื่อให้รู้เป้าหมายเวลา (G-14)
    check(
      'ck_ticket_service_request_needs_catalog',
      sql`ticket_type <> 'service_request' OR catalog_item_id IS NOT NULL`,
    ),
    // Tier 3 ต้องมีรหัสอ้างอิงผู้ให้บริการ (SLA 6.1 / ES-05)
    check('ck_ticket_tier3_needs_vendor_ref', sql`support_tier <> 3 OR vendor_ref IS NOT NULL`),

    index('ix_ticket_company_status').on(t.companyId, t.status, t.createdAt),
    index('ix_ticket_assignee_status').on(t.assigneeId, t.status),
    index('ix_ticket_requester').on(t.requesterId, t.createdAt),
    index('ix_ticket_due').on(t.resolutionDueAt),
    index('ix_ticket_status_report').on(t.nextStatusReportDueAt),
    index('ix_ticket_tier').on(t.supportTier, t.createdAt),
    index('ix_ticket_problem').on(t.problemId, t.createdAt),
  ],
);

/** ทุกการเปลี่ยนสถานะและระดับต้องบันทึกที่นี่เสมอ — เป็นหลักฐานตาม SOP */
export const ticketStatusHistory = pgTable(
  'ticket_status_history',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ticketId: bigint('ticket_id', { mode: 'number' })
      .notNull()
      .references(() => ticket.id, { onDelete: 'cascade' }),
    fromStatus: varchar('from_status', { length: 20 }),
    toStatus: varchar('to_status', { length: 20 }).notNull(),
    fromAssigneeId: bigint('from_assignee_id', { mode: 'number' }),
    toAssigneeId: bigint('to_assignee_id', { mode: 'number' }),
    fromPriority: varchar('from_priority', { length: 10 }),
    toPriority: varchar('to_priority', { length: 10 }),
    fromTier: smallint('from_tier'),
    toTier: smallint('to_tier'),
    // บังคับกรณี cancel / reopen / เปลี่ยนระดับ / ยกระดับ tier
    reason: varchar('reason', { length: 500 }),
    changedBy: bigint('changed_by', { mode: 'number' }).references(() => appUser.id),
    changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('ix_ticket_history_ticket').on(t.ticketId, t.changedAt)],
);

export const ticketComment = pgTable(
  'ticket_comment',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ticketId: bigint('ticket_id', { mode: 'number' })
      .notNull()
      .references(() => ticket.id, { onDelete: 'cascade' }),
    authorId: bigint('author_id', { mode: 'number' }).references(() => appUser.id),
    body: text('body').notNull(),
    // true = เห็นเฉพาะ agent ขึ้นไป
    // ต้องไม่ถูกส่งใน API response ของผู้แจ้งตั้งแต่แรก (US-02 AC-3)
    isInternal: boolean('is_internal').default(false).notNull(),
    isSystem: boolean('is_system').default(false).notNull(),
    ...timestamps,
  },
  (t) => [index('ix_comment_ticket_created').on(t.ticketId, t.createdAt)],
);
