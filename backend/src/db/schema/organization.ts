/**
 * องค์กร ผู้ใช้ สิทธิ์ และผู้รับการยกระดับ — 10 ตาราง
 * ตรงกับ docs/02-data-model.md v2.0 §2.1, §3, §4.1, §4.2, §5.3
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
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

import { AUTH_PROVIDER, CONTACT_KEY } from '../../common/constants';

/** ตัวช่วยสร้าง CHECK จากรายการค่าที่อนุญาต */
export function inList(col: string, values: readonly string[]): ReturnType<typeof sql> {
  return sql.raw(`${col} IN (${values.map((v) => `'${v}'`).join(', ')})`);
}

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const company = pgTable('company', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  nameTh: varchar('name_th', { length: 150 }).notNull(),
  nameEn: varchar('name_en', { length: 150 }),
  logoPath: varchar('logo_path', { length: 255 }),
  contactEmail: varchar('contact_email', { length: 150 }),
  // ห้ามลบบริษัท ใช้ is_active = false เท่านั้น
  isActive: boolean('is_active').default(true).notNull(),
  ...timestamps,
});

export const department = pgTable(
  'department',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    companyId: bigint('company_id', { mode: 'number' })
      .notNull()
      .references(() => company.id),
    name: varchar('name', { length: 150 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    ...timestamps,
  },
  (t) => [unique('uq_department_company_name').on(t.companyId, t.name), index('ix_department_company').on(t.companyId)],
);

export const appUser = pgTable(
  'app_user',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    companyId: bigint('company_id', { mode: 'number' })
      .notNull()
      .references(() => company.id),
    departmentId: bigint('department_id', { mode: 'number' }).references(() => department.id),
    username: varchar('username', { length: 50 }).notNull().unique(),
    email: varchar('email', { length: 150 }),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    employeeCode: varchar('employee_code', { length: 50 }),
    phone: varchar('phone', { length: 30 }),
    jobTitle: varchar('job_title', { length: 100 }),

    // nullable เพราะผู้ใช้ SSO ในเฟส 2 จะไม่มีรหัสผ่าน — เตรียมไว้ตั้งแต่แรก
    // จะได้ไม่ต้องทำ migration ที่กระทบทุกแถวภายหลัง (B-01)
    passwordHash: varchar('password_hash', { length: 255 }),
    authProvider: varchar('auth_provider', { length: 20 }).default('local').notNull(),
    externalSubject: varchar('external_subject', { length: 255 }),
    mustChangePassword: boolean('must_change_password').default(true).notNull(),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),

    // นโยบาย 3.2: "การปลดล็อกต้องยืนยันตัวตนกับ Service Desk"
    // จึงใช้ธง is_locked ไม่ใช่ locked_until — ปลดเองตามเวลาไม่ได้
    failedLoginCount: integer('failed_login_count').default(0).notNull(),
    isLocked: boolean('is_locked').default(false).notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    unlockedBy: bigint('unlocked_by', { mode: 'number' }),

    // เพิ่มค่านี้แล้ว token เก่าทั้งหมดของบัญชีเป็นโมฆะทันที (B-02)
    tokenVersion: integer('token_version').default(0).notNull(),
    isAdminAccount: boolean('is_admin_account').default(false).notNull(),

    isActive: boolean('is_active').default(true).notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    // ใช้ส่งการแจ้งเตือนขาออกเท่านั้น ไม่ใช่ช่องทางรับแจ้ง (SLA 3.2)
    lineUserId: varchar('line_user_id', { length: 100 }),

    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('uq_app_user_provider_subject').on(t.authProvider, t.externalSubject),
    check('ck_app_user_auth_provider_valid', inList('auth_provider', AUTH_PROVIDER)),
    // ผู้ใช้ local ต้องมีรหัสผ่าน · ผู้ใช้ SSO ไม่ต้องมี
    check(
      'ck_app_user_local_needs_password',
      sql`auth_provider <> 'local' OR password_hash IS NOT NULL`,
    ),
    index('ix_app_user_company_active').on(t.companyId, t.isActive),
  ],
);

/** ห้ามใช้รหัสผ่านซ้ำ (นโยบาย 3.2) — เก็บกี่ชุดกำหนดที่ PASSWORD_HISTORY_SIZE */
export const passwordHistory = pgTable(
  'password_history',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('ix_password_history_user').on(t.userId)],
);

export const role = pgTable('role', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  code: varchar('code', { length: 30 }).notNull().unique(),
  nameTh: varchar('name_th', { length: 100 }).notNull(),
  description: varchar('description', { length: 255 }),
  isSystem: boolean('is_system').default(true).notNull(),
});

export const permission = pgTable('permission', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  code: varchar('code', { length: 60 }).notNull().unique(),
  groupName: varchar('group_name', { length: 40 }).notNull(),
  description: varchar('description', { length: 255 }),
});

export const rolePermission = pgTable(
  'role_permission',
  {
    roleId: bigint('role_id', { mode: 'number' })
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    permissionId: bigint('permission_id', { mode: 'number' })
      .notNull()
      .references(() => permission.id, { onDelete: 'cascade' }),
  },
  (t) => [unique('pk_role_permission').on(t.roleId, t.permissionId)],
);

export const userRole = pgTable(
  'user_role',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    roleId: bigint('role_id', { mode: 'number' })
      .notNull()
      .references(() => role.id),
    grantedBy: bigint('granted_by', { mode: 'number' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
    // สิทธิ์ชั่วคราวต้องมีกำหนดสิ้นสุด (นโยบาย 3.3 / SOP-03 ข้อ 6)
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    unique('uq_user_role').on(t.userId, t.roleId),
    index('ix_user_role_user').on(t.userId),
    index('ix_user_role_expires').on(t.expiresAt),
  ],
);

/**
 * ขอบเขตบริษัทของ role นั้น
 * ถ้าไม่มีแถวเลย → ขอบเขตเป็นบริษัทต้นสังกัดของผู้ใช้
 * super_admin ไม่ต้องมี scope (เห็นทุกบริษัทเสมอ)
 */
export const userRoleScope = pgTable(
  'user_role_scope',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userRoleId: bigint('user_role_id', { mode: 'number' })
      .notNull()
      .references(() => userRole.id, { onDelete: 'cascade' }),
    companyId: bigint('company_id', { mode: 'number' })
      .notNull()
      .references(() => company.id),
  },
  (t) => [
    unique('uq_user_role_scope').on(t.userRoleId, t.companyId),
    index('ix_user_role_scope_role').on(t.userRoleId),
  ],
);

/**
 * ผูกตำแหน่งในองค์กรกับบัญชีผู้ใช้จริง
 *
 * Head of IT / CEO / DPO เป็นตำแหน่ง ไม่ใช่ชุดสิทธิ์ — การเพิ่มเป็น role
 * จะทำให้ permission matrix บวมโดยไม่ได้ประโยชน์ (05-… §5.1)
 */
export const escalationContact = pgTable(
  'escalation_contact',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    // null = ระดับกลุ่ม ใช้เป็น fallback เมื่อบริษัทนั้นไม่ได้กำหนดคนของตัวเอง
    companyId: bigint('company_id', { mode: 'number' }).references(() => company.id),
    contactKey: varchar('contact_key', { length: 30 }).notNull(),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => appUser.id),
    isPrimary: boolean('is_primary').default(true).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    ...timestamps,
  },
  (t) => [
    unique('uq_escalation_contact').on(t.companyId, t.contactKey, t.userId),
    check('ck_escalation_contact_key_valid', inList('contact_key', CONTACT_KEY)),
    index('ix_escalation_contact_key').on(t.contactKey),
  ],
);
