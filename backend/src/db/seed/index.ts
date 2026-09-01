/**
 * ใส่ข้อมูลตั้งต้นที่ระบบต้องมีจึงจะทำงานได้
 *
 *   npm run db:seed
 *
 * รันซ้ำได้เสมอ ทุกตารางใช้ ON CONFLICT บนคีย์ธรรมชาติ ไม่ใช่ id
 * ที่ต้องรันซ้ำได้เพราะเมื่อเอกสารควบคุมเปลี่ยนค่า SLA เราแก้ไฟล์ data/
 * แล้วรันใหม่ ไม่ใช่ไปแก้ฐานข้อมูลด้วยมือแล้วลืมว่าแก้อะไรไป
 */

import 'dotenv/config';

import * as argon2 from 'argon2';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';
import { CATALOG_ITEMS, CHECKLIST_TEMPLATES, KB_CATEGORIES, TICKET_CATEGORIES } from './data/catalog';
import { COMPANIES, OWNER_COMPANY_CODE } from './data/organization';
import { PERMISSIONS, ROLES, ROW_LEVEL_ONLY_PERMISSIONS } from './data/permissions';
import {
  BUSINESS_HOURS,
  ESCALATION_RULES,
  SERVICE_TIER_TARGETS,
  SLA_POLICY,
  SLA_TARGETS,
} from './data/sla';

type Db = ReturnType<typeof drizzle<typeof schema>>;

/** นับจำนวนแถวที่แตะไปในแต่ละตาราง เพื่อพิมพ์สรุปตอนจบ */
const counts = new Map<string, number>();
function record(table: string, n: number): void {
  counts.set(table, (counts.get(table) ?? 0) + n);
}

/**
 * ตรวจก่อนแตะฐานข้อมูลว่าทุก permission code ที่ role อ้างถึงมีอยู่จริง
 *
 * ถ้าไม่ตรวจ การพิมพ์ code ผิดหนึ่งตัวจะเงียบสนิท — role นั้นได้สิทธิ์น้อยกว่า
 * ที่เอกสารกำหนดโดยไม่มีใครรู้ จนกว่าจะมีคนกดปุ่มแล้วโดน 403
 */
function validate(): void {
  const known = new Set(PERMISSIONS.map((p) => p.code));

  if (known.size !== PERMISSIONS.length) {
    throw new Error('มี permission code ซ้ำในไฟล์ data/permissions.ts');
  }

  for (const role of ROLES) {
    if (role.permissions === null) continue;
    const unknown = role.permissions.filter((c) => !known.has(c));
    if (unknown.length > 0) {
      throw new Error(`role ${role.code} อ้าง permission ที่ไม่มีอยู่: ${unknown.join(', ')}`);
    }
    const granted = new Set(role.permissions);
    if (granted.size !== role.permissions.length) {
      throw new Error(`role ${role.code} มี permission ซ้ำในรายการ`);
    }
    const rowLevel = role.permissions.filter((c) => ROW_LEVEL_ONLY_PERMISSIONS.includes(c));
    if (rowLevel.length > 0) {
      throw new Error(
        `role ${role.code} ห้ามได้ ${rowLevel.join(', ')} ผ่าน role_permission ` +
          '— สิทธิ์นี้ตรวจที่ระดับแถวเท่านั้น',
      );
    }
  }

  const catalogCategories = new Set(TICKET_CATEGORIES.map((c) => c.code));
  for (const item of CATALOG_ITEMS) {
    if (!catalogCategories.has(item.categoryCode)) {
      throw new Error(`catalog ${item.code} อ้างหมวดหมู่ที่ไม่มี: ${item.categoryCode}`);
    }
  }

  const templates = new Set(CHECKLIST_TEMPLATES.map((t) => t.code));
  for (const item of CATALOG_ITEMS) {
    if (item.checklistTemplateCode && !templates.has(item.checklistTemplateCode)) {
      throw new Error(`catalog ${item.code} อ้าง checklist ที่ไม่มี: ${item.checklistTemplateCode}`);
    }
  }
}

async function seedPermissionsAndRoles(db: Db): Promise<void> {
  const perms = await db
    .insert(schema.permission)
    .values(PERMISSIONS.map((p) => ({ code: p.code, groupName: p.group, description: p.description })))
    .onConflictDoUpdate({
      target: schema.permission.code,
      set: {
        groupName: sql`excluded.group_name`,
        description: sql`excluded.description`,
      },
    })
    .returning({ id: schema.permission.id, code: schema.permission.code });
  record('permission', perms.length);

  const roles = await db
    .insert(schema.role)
    .values(
      ROLES.map((r) => ({
        code: r.code,
        nameTh: r.nameTh,
        description: r.description,
        isSystem: true,
      })),
    )
    .onConflictDoUpdate({
      target: schema.role.code,
      set: { nameTh: sql`excluded.name_th`, description: sql`excluded.description` },
    })
    .returning({ id: schema.role.id, code: schema.role.code });
  record('role', roles.length);

  const permId = new Map(perms.map((p) => [p.code, p.id]));
  const roleId = new Map(roles.map((r) => [r.code, r.id]));

  // permission ที่มอบผ่าน role ได้ — ตัดกลุ่มที่ตรวจระดับแถวออกก่อนเสมอ
  const grantable = PERMISSIONS.map((p) => p.code).filter(
    (c) => !ROW_LEVEL_ONLY_PERMISSIONS.includes(c),
  );

  const pairs: { roleId: number; permissionId: number }[] = [];
  for (const role of ROLES) {
    const codes = role.permissions ?? grantable;
    for (const code of codes) {
      pairs.push({ roleId: roleId.get(role.code)!, permissionId: permId.get(code)! });
    }
  }

  // เมทริกซ์นี้ต้อง "เท่ากับ" เอกสารเสมอ ไม่ใช่ "อย่างน้อย" เอกสาร
  // การถอนสิทธิ์ออกจากเอกสารแล้ว seed ใหม่ต้องถอนออกจากฐานข้อมูลจริง
  // ถ้าใช้แค่ upsert สิทธิ์ที่ถูกถอนจะค้างอยู่ตลอดไป จึงต้องล้างก่อนใส่ใหม่
  await db.delete(schema.rolePermission);
  await db.insert(schema.rolePermission).values(pairs);
  record('role_permission', pairs.length);
}

async function seedCompanies(db: Db): Promise<Map<string, number>> {
  const rows = await db
    .insert(schema.company)
    .values(
      COMPANIES.map((c) => ({
        code: c.code,
        nameTh: c.nameTh,
        nameEn: c.nameEn,
        contactEmail: c.contactEmail,
        isActive: true,
      })),
    )
    .onConflictDoUpdate({
      target: schema.company.code,
      set: {
        nameTh: sql`excluded.name_th`,
        nameEn: sql`excluded.name_en`,
        contactEmail: sql`excluded.contact_email`,
      },
    })
    .returning({ id: schema.company.id, code: schema.company.code });
  record('company', rows.length);

  const byCode = new Map(rows.map((r) => [r.code, r.id]));

  const departments = COMPANIES.flatMap((c) =>
    c.departments.map((name) => ({ companyId: byCode.get(c.code)!, name, isActive: true })),
  );
  await db
    .insert(schema.department)
    .values(departments)
    .onConflictDoNothing({ target: [schema.department.companyId, schema.department.name] });
  record('department', departments.length);

  return byCode;
}

async function seedSla(db: Db): Promise<void> {
  await db
    .insert(schema.businessHours)
    .values(
      BUSINESS_HOURS.map((h) => ({
        companyId: null,
        dayOfWeek: h.dayOfWeek,
        startTime: h.startTime,
        endTime: h.endTime,
        isWorkingDay: h.isWorkingDay,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.businessHours.companyId, schema.businessHours.dayOfWeek],
      set: {
        startTime: sql`excluded.start_time`,
        endTime: sql`excluded.end_time`,
        isWorkingDay: sql`excluded.is_working_day`,
      },
    });
  record('business_hours', BUSINESS_HOURS.length);

  const [policy] = await db
    .insert(schema.slaPolicy)
    .values({
      companyId: null,
      name: SLA_POLICY.name,
      isDefault: true,
      isActive: true,
      docRef: SLA_POLICY.docRef,
      docVersion: SLA_POLICY.docVersion,
      effectiveFrom: SLA_POLICY.effectiveFrom,
    })
    .onConflictDoUpdate({
      target: [schema.slaPolicy.companyId, schema.slaPolicy.docRef, schema.slaPolicy.docVersion],
      set: { name: sql`excluded.name`, isDefault: sql`excluded.is_default` },
    })
    .returning({ id: schema.slaPolicy.id });
  record('sla_policy', 1);

  await db
    .insert(schema.slaTarget)
    .values(
      SLA_TARGETS.map((t) => ({
        slaPolicyId: policy.id,
        priority: t.priority,
        responseMinutes: t.responseMinutes,
        resolutionMinutes: t.resolutionMinutes,
        clockMode: t.clockMode,
        statusReportIntervalMinutes: t.statusReportIntervalMinutes,
        escalationPercent: 75,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.slaTarget.slaPolicyId, schema.slaTarget.priority],
      set: {
        responseMinutes: sql`excluded.response_minutes`,
        resolutionMinutes: sql`excluded.resolution_minutes`,
        clockMode: sql`excluded.clock_mode`,
        statusReportIntervalMinutes: sql`excluded.status_report_interval_minutes`,
      },
    });
  record('sla_target', SLA_TARGETS.length);

  await db
    .insert(schema.serviceTierTarget)
    .values(
      SERVICE_TIER_TARGETS.map((t) => ({
        tierCode: t.tierCode,
        uptimePercent: t.uptimePercent,
        maxDowntimeMinutesMonth: t.maxDowntimeMinutesMonth,
      })),
    )
    .onConflictDoUpdate({
      target: schema.serviceTierTarget.tierCode,
      set: {
        uptimePercent: sql`excluded.uptime_percent`,
        maxDowntimeMinutesMonth: sql`excluded.max_downtime_minutes_month`,
      },
    });
  record('service_tier_target', SERVICE_TIER_TARGETS.length);

  await db
    .insert(schema.slaEscalationRule)
    .values(
      ESCALATION_RULES.map((r) => ({
        companyId: null,
        code: r.code,
        triggerType: r.triggerType,
        priority: r.priority,
        thresholdMinutes: r.thresholdMinutes,
        thresholdClockMode: r.thresholdClockMode,
        notifyContactKeys: r.notifyContactKeys,
        notifyRoles: r.notifyRoles,
        repeatIntervalMinutes: r.repeatIntervalMinutes,
        notifyOutsideBusinessHours: r.notifyOutsideBusinessHours,
        isActive: true,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.slaEscalationRule.companyId, schema.slaEscalationRule.code],
      set: {
        triggerType: sql`excluded.trigger_type`,
        priority: sql`excluded.priority`,
        thresholdMinutes: sql`excluded.threshold_minutes`,
        thresholdClockMode: sql`excluded.threshold_clock_mode`,
        notifyContactKeys: sql`excluded.notify_contact_keys`,
        notifyRoles: sql`excluded.notify_roles`,
        repeatIntervalMinutes: sql`excluded.repeat_interval_minutes`,
        notifyOutsideBusinessHours: sql`excluded.notify_outside_business_hours`,
      },
    });
  record('sla_escalation_rule', ESCALATION_RULES.length);
}

async function seedCatalog(db: Db): Promise<void> {
  const categories = await db
    .insert(schema.ticketCategory)
    .values(
      TICKET_CATEGORIES.map((c) => ({
        companyId: null,
        code: c.code,
        nameTh: c.nameTh,
        defaultImpact: c.defaultImpact,
        defaultUrgency: c.defaultUrgency,
        sortOrder: c.sortOrder,
        isActive: true,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.ticketCategory.companyId, schema.ticketCategory.code],
      set: {
        nameTh: sql`excluded.name_th`,
        defaultImpact: sql`excluded.default_impact`,
        defaultUrgency: sql`excluded.default_urgency`,
        sortOrder: sql`excluded.sort_order`,
      },
    })
    .returning({ id: schema.ticketCategory.id, code: schema.ticketCategory.code });
  record('ticket_category', categories.length);
  const categoryId = new Map(categories.map((c) => [c.code, c.id]));

  const templates = await db
    .insert(schema.checklistTemplate)
    .values(
      CHECKLIST_TEMPLATES.map((t) => ({
        companyId: null,
        code: t.code,
        nameTh: t.nameTh,
        docRef: t.docRef,
        version: 1,
        isActive: true,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.checklistTemplate.companyId, schema.checklistTemplate.code],
      set: { nameTh: sql`excluded.name_th`, docRef: sql`excluded.doc_ref` },
    })
    .returning({ id: schema.checklistTemplate.id, code: schema.checklistTemplate.code });
  record('checklist_template', templates.length);
  const templateId = new Map(templates.map((t) => [t.code, t.id]));

  const items = CHECKLIST_TEMPLATES.flatMap((t) =>
    t.items.map((i) => ({
      templateId: templateId.get(t.code)!,
      sortOrder: i.sortOrder,
      titleTh: i.titleTh,
      isRequired: i.isRequired,
      evidenceRequired: i.evidenceRequired,
      defaultRoleCode: i.defaultRoleCode,
      isActive: true,
    })),
  );
  await db
    .insert(schema.checklistItem)
    .values(items)
    .onConflictDoUpdate({
      target: [schema.checklistItem.templateId, schema.checklistItem.sortOrder],
      set: {
        titleTh: sql`excluded.title_th`,
        isRequired: sql`excluded.is_required`,
        evidenceRequired: sql`excluded.evidence_required`,
        defaultRoleCode: sql`excluded.default_role_code`,
      },
    });
  record('checklist_item', items.length);

  await db
    .insert(schema.serviceCatalogItem)
    .values(
      CATALOG_ITEMS.map((c) => ({
        companyId: null,
        code: c.code,
        nameTh: c.nameTh,
        categoryId: categoryId.get(c.categoryCode)!,
        defaultImpact: c.defaultImpact,
        defaultUrgency: c.defaultUrgency,
        defaultPriority: c.defaultPriority,
        targetMode: 'duration' as const,
        targetMinutes: c.targetMinutes,
        clockStartEvent: c.clockStartEvent,
        requiresApproval: c.requiresApproval,
        approvalChain: c.approvalChain,
        checklistTemplateId: c.checklistTemplateCode
          ? templateId.get(c.checklistTemplateCode)!
          : null,
        isActive: true,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.serviceCatalogItem.companyId, schema.serviceCatalogItem.code],
      set: {
        nameTh: sql`excluded.name_th`,
        categoryId: sql`excluded.category_id`,
        defaultImpact: sql`excluded.default_impact`,
        defaultUrgency: sql`excluded.default_urgency`,
        defaultPriority: sql`excluded.default_priority`,
        targetMinutes: sql`excluded.target_minutes`,
        clockStartEvent: sql`excluded.clock_start_event`,
        requiresApproval: sql`excluded.requires_approval`,
        approvalChain: sql`excluded.approval_chain`,
        checklistTemplateId: sql`excluded.checklist_template_id`,
      },
    });
  record('service_catalog_item', CATALOG_ITEMS.length);

  await db
    .insert(schema.kbCategory)
    .values(
      KB_CATEGORIES.map((c) => ({
        parentId: null,
        nameTh: c.nameTh,
        sortOrder: c.sortOrder,
        isActive: true,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.kbCategory.parentId, schema.kbCategory.nameTh],
      set: { sortOrder: sql`excluded.sort_order` },
    });
  record('kb_category', KB_CATEGORIES.length);
}

/**
 * บัญชีผู้ดูแลระบบเริ่มต้น
 *
 * รหัสผ่านมาจาก SEED_ADMIN_PASSWORD เท่านั้น ไม่มีค่าตายตัวสำรอง
 * เพราะรหัสตายตัวในซอร์สคือรหัสที่ทุกคนบนอินเทอร์เน็ตรู้ และมักติดไปถึง production
 * must_change_password = true บังคับเปลี่ยนตั้งแต่เข้าครั้งแรกอยู่แล้ว
 */
async function seedSuperAdmin(db: Db, companyByCode: Map<string, number>): Promise<void> {
  const username = process.env.SEED_ADMIN_USERNAME ?? 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!password) {
    console.log('  ข้าม super_admin — ไม่ได้ตั้ง SEED_ADMIN_PASSWORD');
    return;
  }
  if (password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD ต้องยาวอย่างน้อย 12 อักขระ (นโยบาย 3.2)');
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const [user] = await db
    .insert(schema.appUser)
    .values({
      companyId: companyByCode.get(OWNER_COMPANY_CODE)!,
      username,
      email: 'itsupport@aidctech.com.la',
      fullName: 'ຜູ້ດູແລລະບົບ',
      passwordHash,
      authProvider: 'local',
      mustChangePassword: true,
      isAdminAccount: true,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: schema.appUser.username,
      // ไม่เขียนทับ password_hash ของบัญชีที่มีอยู่แล้ว
      // การรัน seed ซ้ำต้องไม่รีเซ็ตรหัสผ่านที่ผู้ดูแลตั้งไว้เอง
      set: { isActive: sql`true`, isAdminAccount: sql`true` },
    })
    .returning({ id: schema.appUser.id });

  const [adminRole] = await db
    .select({ id: schema.role.id })
    .from(schema.role)
    .where(eq(schema.role.code, 'super_admin'));

  await db
    .insert(schema.userRole)
    .values({ userId: user.id, roleId: adminRole.id })
    .onConflictDoNothing({ target: [schema.userRole.userId, schema.userRole.roleId] });

  record('app_user', 1);
  console.log(`  บัญชีผู้ดูแล: ${username} (ต้องเปลี่ยนรหัสผ่านเมื่อเข้าครั้งแรก)`);
}

async function main(): Promise<void> {
  validate();
  console.log(`ตรวจข้อมูลผ่าน — permission ${PERMISSIONS.length} · role ${ROLES.length}`);

  const url = process.env.MIGRATE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('ต้องตั้ง MIGRATE_URL หรือ DATABASE_URL ก่อน');

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  try {
    // ทั้งชุดอยู่ในทรานแซกชันเดียว ล้มกลางทางแล้วไม่ทิ้งข้อมูลครึ่ง ๆ กลาง ๆ
    await db.transaction(async (tx) => {
      await seedPermissionsAndRoles(tx as unknown as Db);
      const companies = await seedCompanies(tx as unknown as Db);
      await seedSla(tx as unknown as Db);
      await seedCatalog(tx as unknown as Db);
      await seedSuperAdmin(tx as unknown as Db, companies);
    });

    console.log('\nสรุปข้อมูลที่ใส่');
    for (const [table, n] of counts) {
      console.log(`  ${table.padEnd(22)} ${String(n).padStart(4)}`);
    }
    console.log('\nseed สำเร็จ');
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('seed ล้มเหลว:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
