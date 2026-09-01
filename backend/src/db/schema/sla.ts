/**
 * SLA ปฏิทิน escalation ทะเบียนระบบงาน และ Problem — 10 ตาราง
 * ตรงกับ docs/02-data-model.md v2.0 §2.3, §4.3, §5.4–5.9
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  CLOCK_MODE,
  PRIORITY,
  PROBLEM_STATUS,
  SERVICE_GROUP,
  SERVICE_TIER,
} from '../../common/constants';
import { appUser, company, inList } from './organization';
import { ticket } from './ticket';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

/**
 * ผูกกับเอกสารควบคุมเสมอ
 *
 * SLA ทบทวนทุก 12 เดือน — เมื่อขึ้นเวอร์ชันใหม่ **ห้าม UPDATE แถวเดิม**
 * ให้ตั้ง effective_to ของแถวเดิมแล้ว INSERT แถวใหม่
 * ticket.sla_policy_id เป็นสแนปช็อตอยู่แล้ว จึงไม่กระทบ ticket เก่า (US-11 AC-1)
 */
export const slaPolicy = pgTable(
  'sla_policy',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    companyId: bigint('company_id', { mode: 'number' }).references(() => company.id),
    name: varchar('name', { length: 100 }).notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),

    // ตรวจย้อนกลับได้ว่าค่าชุดนี้มาจากเอกสารฉบับใด (Document Control)
    docRef: varchar('doc_ref', { length: 40 }),
    docVersion: varchar('doc_version', { length: 10 }),
    effectiveFrom: date('effective_from'),
    effectiveTo: date('effective_to'), // null = ยังบังคับใช้อยู่
    ...timestamps,
  },
  (t) => [index('ix_sla_policy_company').on(t.companyId)],
);

export const slaTarget = pgTable(
  'sla_target',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    slaPolicyId: bigint('sla_policy_id', { mode: 'number' })
      .notNull()
      .references(() => slaPolicy.id, { onDelete: 'cascade' }),
    priority: varchar('priority', { length: 10 }).notNull(),
    responseMinutes: integer('response_minutes').notNull(),
    resolutionMinutes: integer('resolution_minutes').notNull(),

    // P1 = calendar_24x7 (มีทีม On-call) · P2–P4 = business_hours (SLA 5.4)
    clockMode: varchar('clock_mode', { length: 20 }).default('business_hours').notNull(),
    // รอบรายงานสถานะ — null = รายงานเมื่อสถานะเปลี่ยนเท่านั้น (SLA 5.1)
    statusReportIntervalMinutes: integer('status_report_interval_minutes'),
    // กลไกเตือนล่วงหน้าของทีมเอง ไม่ได้มาจากเอกสารควบคุม
    escalationPercent: integer('escalation_percent').default(75).notNull(),
  },
  (t) => [
    unique('uq_sla_target_policy_priority').on(t.slaPolicyId, t.priority),
    check('ck_sla_target_priority_valid', inList('priority', PRIORITY)),
    check('ck_sla_target_clock_mode_valid', inList('clock_mode', CLOCK_MODE)),
    check('ck_sla_target_minutes_positive', sql`response_minutes > 0 AND resolution_minutes > 0`),
  ],
);

/** ค่าเริ่มต้น จ.–ศ. 08:30–17:30 · เสาร์และอาทิตย์ is_working_day = false (G-01) */
export const businessHours = pgTable(
  'business_hours',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    companyId: bigint('company_id', { mode: 'number' }).references(() => company.id),
    dayOfWeek: smallint('day_of_week').notNull(), // 0 = อาทิตย์
    startTime: time('start_time').default('08:30:00').notNull(),
    endTime: time('end_time').default('17:30:00').notNull(),
    isWorkingDay: boolean('is_working_day').default(true).notNull(),
  },
  (t) => [
    unique('uq_business_hours_company_dow').on(t.companyId, t.dayOfWeek),
    check('ck_business_hours_dow_range', sql`day_of_week BETWEEN 0 AND 6`),
    check('ck_business_hours_order', sql`start_time < end_time`),
    index('ix_business_hours_company').on(t.companyId),
  ],
);

export const holiday = pgTable(
  'holiday',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    companyId: bigint('company_id', { mode: 'number' }).references(() => company.id),
    holidayDate: date('holiday_date').notNull(),
    name: varchar('name', { length: 150 }).notNull(),
  },
  (t) => [
    unique('uq_holiday_company_date').on(t.companyId, t.holidayDate),
    index('ix_holiday_date').on(t.holidayDate),
  ],
);

/**
 * กฎ ES-01…ES-12 เก็บในตารางไม่ hard-code
 *
 * จำเป็นเพราะเอกสาร SLA ทบทวนทุก 12 เดือน — ถ้า hard-code
 * ต้อง deploy ใหม่ทุกครั้งที่เกณฑ์เปลี่ยน (05-… §5.2)
 */
export const slaEscalationRule = pgTable(
  'sla_escalation_rule',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    companyId: bigint('company_id', { mode: 'number' }).references(() => company.id),
    code: varchar('code', { length: 20 }).notNull(),
    triggerType: varchar('trigger_type', { length: 30 }).notNull(),
    priority: varchar('priority', { length: 10 }),
    thresholdMinutes: integer('threshold_minutes'),
    thresholdClockMode: varchar('threshold_clock_mode', { length: 20 })
      .default('business_hours')
      .notNull(),
    notifyContactKeys: varchar('notify_contact_keys', { length: 200 }).notNull(),
    notifyRoles: varchar('notify_roles', { length: 200 }),
    repeatIntervalMinutes: integer('repeat_interval_minutes'),
    // true เฉพาะ ES-01 / ES-02 / ES-03 — สอดคล้อง SLA 3.1 ที่ On-call ครอบคลุมเฉพาะ P1
    notifyOutsideBusinessHours: boolean('notify_outside_business_hours').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    ...timestamps,
  },
  (t) => [unique('uq_escalation_rule_company_code').on(t.companyId, t.code)],
);

/** ทะเบียนระบบงาน (SLA ข้อ 2) — จำเป็นต่อ KPI-6 Uptime และ SOP-03 ขั้นอนุมัติที่ 2 */
export const service = pgTable(
  'service',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    companyId: bigint('company_id', { mode: 'number' }).references(() => company.id),
    code: varchar('code', { length: 40 }).notNull(),
    nameTh: varchar('name_th', { length: 150 }).notNull(),
    serviceGroup: varchar('service_group', { length: 30 }).notNull(),
    serviceTier: varchar('service_tier', { length: 20 }).default('standard').notNull(),
    // System Owner — ใช้เป็นผู้อนุมัติขั้นที่ 2 ของ SOP-03
    ownerUserId: bigint('owner_user_id', { mode: 'number' }).references(() => appUser.id),
    // true = ตัวหารของ Uptime คือ 43,200 นาที/เดือน
    is24x7: boolean('is_24x7').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    ...timestamps,
  },
  (t) => [
    unique('uq_service_company_code').on(t.companyId, t.code),
    check('ck_service_tier_valid', inList('service_tier', SERVICE_TIER)),
    check('ck_service_group_valid', inList('service_group', SERVICE_GROUP)),
    index('ix_service_company').on(t.companyId),
  ],
);

export const serviceTierTarget = pgTable('service_tier_target', {
  tierCode: varchar('tier_code', { length: 20 }).primaryKey(),
  uptimePercent: numeric('uptime_percent', { precision: 5, scale: 3 }).notNull(),
  maxDowntimeMinutesMonth: integer('max_downtime_minutes_month').notNull(),
});

/** ตัวตั้งของสูตร Uptime — เฟส 1 บันทึกด้วยมือ เฟส 2 ค่อยเชื่อม Monitoring */
export const serviceOutage = pgTable(
  'service_outage',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    serviceId: bigint('service_id', { mode: 'number' })
      .notNull()
      .references(() => service.id),
    ticketId: bigint('ticket_id', { mode: 'number' }).references(() => ticket.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    // true = อยู่ในหน้าต่างบำรุงรักษา จึงไม่นับเป็น Downtime (SLA 5.2, ข้อ 9)
    isPlanned: boolean('is_planned').default(false).notNull(),
    maintenanceWindowId: bigint('maintenance_window_id', { mode: 'number' }),
    cause: varchar('cause', { length: 500 }),
    recordedBy: bigint('recorded_by', { mode: 'number' }).references(() => appUser.id),
    ...timestamps,
  },
  (t) => [
    check('ck_service_outage_order', sql`ended_at IS NULL OR ended_at > started_at`),
    index('ix_service_outage_service').on(t.serviceId, t.startedAt),
  ],
);

export const maintenanceWindow = pgTable(
  'maintenance_window',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    companyId: bigint('company_id', { mode: 'number' }).references(() => company.id),
    serviceId: bigint('service_id', { mode: 'number' }).references(() => service.id),
    plannedStart: timestamp('planned_start', { withTimezone: true }).notNull(),
    plannedEnd: timestamp('planned_end', { withTimezone: true }).notNull(),
    // ระบบบล็อกการยืนยันถ้าแจ้งล่วงหน้า < notice_lead_business_days (SLA 3.1)
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    noticeLeadBusinessDays: integer('notice_lead_business_days').default(3).notNull(),
    description: varchar('description', { length: 500 }),
    createdBy: bigint('created_by', { mode: 'number' })
      .notNull()
      .references(() => appUser.id),
    ...timestamps,
  },
  (t) => [
    check('ck_maintenance_window_order', sql`planned_end > planned_start`),
    index('ix_maintenance_window_start').on(t.plannedStart),
  ],
);

/** จำเป็นต่อ KPI-7 Repeat Incident · กฎ workaround · และ RCA (SLA 7.2, 7.3) */
export const problem = pgTable(
  'problem',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    companyId: bigint('company_id', { mode: 'number' })
      .notNull()
      .references(() => company.id),
    code: varchar('code', { length: 30 }).notNull().unique(),
    title: varchar('title', { length: 255 }).notNull(),
    serviceId: bigint('service_id', { mode: 'number' }).references(() => service.id),
    // ใช้จับ "P1 จากสาเหตุเดิมซ้ำภายใน 90 วัน" (ES-11)
    rootCauseCode: varchar('root_cause_code', { length: 40 }),
    rootCauseNote: text('root_cause_note'),
    status: varchar('status', { length: 20 }).default('open').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
    // = opened_at + 5 วันทำการ สำหรับเหตุ P1 (SLA 7.2)
    rcaDueAt: timestamp('rca_due_at', { withTimezone: true }),
    rcaSubmittedAt: timestamp('rca_submitted_at', { withTimezone: true }),
    ownerId: bigint('owner_id', { mode: 'number' }).references(() => appUser.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('ck_problem_status_valid', inList('status', PROBLEM_STATUS)),
    index('ix_problem_company').on(t.companyId),
    index('ix_problem_root_cause').on(t.rootCauseCode),
    index('ix_problem_rca_due').on(t.rcaDueAt),
  ],
);
