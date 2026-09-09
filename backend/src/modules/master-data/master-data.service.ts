import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-error';
import {
  CLOCK_START_EVENT,
  SERVICE_GROUP,
  SERVICE_TIER,
  TARGET_MODE,
} from '../../common/constants';
import type { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import {
  appUser,
  approvedSoftware,
  businessHours,
  checklistItem,
  checklistTemplate,
  company,
  department,
  escalationContact,
  holiday,
  maintenanceWindow,
  permission,
  role,
  rolePermission,
  service,
  serviceCatalogItem,
  serviceOutage,
  slaEscalationRule,
  slaPolicy,
  slaTarget,
  ticket,
  ticketCategory,
  userRole,
} from '../../db/schema';

/**
 * ข้อมูลหลักที่หน้าผู้ดูแลใช้อ่าน
 *
 * รวมไว้ที่เดียวเพราะทุกตัวเป็นการอ่านตารางอ้างอิงแบบเดียวกัน
 * การแยกเป็นโมดูลละตารางจะได้ไฟล์สิบกว่าไฟล์ที่หน้าตาเหมือนกันหมด
 * โดยไม่ได้ทำให้อะไรชัดขึ้น
 *
 * ⚠️ ตารางที่มี company_id ต้องกรองตามขอบเขตของผู้เรียกเสมอ
 *    ผู้ดูแลของบริษัทหนึ่งไม่ควรเห็นแผนกหรือนโยบาย SLA ของอีกบริษัท
 *    ส่วนตารางที่ใช้ร่วมกันทั้งกลุ่ม (permission, role) ไม่มีขอบเขต
 */
@Injectable()
export class MasterDataService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * เงื่อนไขขอบเขตบริษัทสำหรับตารางที่มีคอลัมน์ company_id
   *
   * ⚠️ company_id ที่เป็น NULL แปลว่า "ใช้ร่วมกันทั้งกลุ่มบริษัท" ไม่ใช่ข้อมูลกำพร้า
   *    เป็นรูปแบบเดียวกับที่ SlaConfigRepository ใช้ — แถวระดับบริษัททับแถวระดับกลุ่ม
   *    ตอนแรกเขียนตกไป ผลคือค่าเริ่มต้นของทั้งกลุ่ม เช่น เวลาทำการและนโยบาย SLA
   *    หายไปทั้งหมดสำหรับผู้ใช้ที่ไม่ใช่ super_admin ซึ่งเป็นข้อมูลที่ทุกคนต้องเห็น
   *
   *    จับได้เพราะ business-hours คืน 0 รายการทั้งที่ในฐานข้อมูลมี 7 แถว
   *
   * คืน undefined เมื่อผู้เรียกเป็น super_admin เพื่อให้ไม่ต้องมีเงื่อนไขเลย
   * ส่วนผู้ที่ไม่มีบริษัทในขอบเขตยังเห็นแถวระดับกลุ่มได้ แต่ไม่เห็นของบริษัทใด
   */
  private companyScope(scope: AccessScope, col: PgColumn): SQL | undefined {
    if (scope.isSuperAdmin) return undefined;
    const ids = [...scope.companyIds];
    if (ids.length === 0) return isNull(col);
    return or(isNull(col), inArray(col, ids));
  }

  /**
   * ประกอบการอ้างถึงแบบซ้อน ตาม docs/03-api-spec.md
   *
   * สเปกกำหนดให้ทุกการอ้างถึงหน่วยงานหรือบุคคลเป็นอ็อบเจกต์ซ้อน
   * ไม่ใช่คู่ของ `x_id` + `x_code` แบบแบน เหตุผลคือ null ที่มีความหมาย —
   * `company: null` บอกชัดว่า "แถวนี้เป็นระดับกลุ่ม" ส่วนแบบแบนต้องดู
   * สองฟิลด์ประกอบกันแล้วเดาเอง ซึ่งหน้าจอแต่ละหน้าเดาไม่เหมือนกัน
   *
   * คืน null เมื่อ id เป็น null เพื่อไม่ให้ได้อ็อบเจกต์ที่มีแต่ค่าว่าง
   */
  private static ref<T extends Record<string, unknown>>(
    id: number | null,
    fields: T,
  ): ({ id: number } & T) | null {
    return id === null ? null : { id, ...fields };
  }

  async companies(scope: AccessScope) {
    return this.db
      .select({
        id: company.id,
        code: company.code,
        name_th: company.nameTh,
        name_en: company.nameEn,
        contact_email: company.contactEmail,
        is_active: company.isActive,
        /*
         * นับด้วยคิวรีย่อย ไม่ใช่ join + groupBy
         *
         * join สองตารางพร้อมกันแล้วนับ จะได้ผลคูณกันของสองความสัมพันธ์
         * (บริษัทที่มีผู้ใช้ 10 คนและ ticket 5 ใบ จะนับผู้ใช้ได้ 50)
         * ซึ่งเป็นข้อผิดพลาดที่ตัวเลขยังดูสมเหตุสมผลจนไม่มีใครสังเกต
         */
        user_count: sql<number>`(
          SELECT count(*)::int FROM ${appUser}
          WHERE ${appUser.companyId} = ${company.id} AND ${appUser.deletedAt} IS NULL
        )`,
        open_ticket_count: sql<number>`(
          SELECT count(*)::int FROM ${ticket}
          WHERE ${ticket.companyId} = ${company.id}
            AND ${ticket.deletedAt} IS NULL
            AND ${ticket.status} IN ('new','assigned','in_progress','pending_user')
        )`,
      })
      .from(company)
      .where(this.companyScope(scope, company.id))
      .orderBy(asc(company.code));
  }

  async departments(scope: AccessScope) {
    const rows = await this.db
      .select({
        id: department.id,
        name: department.name,
        company_id: department.companyId,
        company_code: company.code,
        company_name_th: company.nameTh,
        is_active: department.isActive,
        user_count: sql<number>`(
          SELECT count(*)::int FROM ${appUser}
          WHERE ${appUser.departmentId} = ${department.id} AND ${appUser.deletedAt} IS NULL
        )`,
      })
      .from(department)
      .innerJoin(company, eq(company.id, department.companyId))
      .where(this.companyScope(scope, department.companyId))
      .orderBy(asc(company.code), asc(department.name));

    return rows.map(({ company_id, company_code, company_name_th, ...r }) => ({
      ...r,
      company: MasterDataService.ref(company_id, {
        code: company_code,
        name_th: company_name_th,
      }),
    }));
  }

  /**
   * หมวดหมู่ปัญหา — เป็นโครงต้นไม้สองชั้น
   *
   * คืนแบนราบพร้อม parent_id ให้หน้าจอประกอบเอง แทนการซ้อนเป็นต้นไม้
   * เพราะบางหน้าต้องการรายการแบน (ตัวเลือกในฟอร์ม) บางหน้าต้องการต้นไม้
   * การคืนแบนราบทำได้ทั้งสองแบบ ส่วนต้นไม้ทำให้แบนกลับยาก
   */
  /**
   * @param activeOnly true = เฉพาะหมวดที่ยังเปิดใช้ (ฟอร์มแจ้งเรื่องใหม่)
   *                   false = ทั้งหมดรวมที่ปิดแล้ว (หน้าผู้ดูแล)
   *
   * ⚠️ ค่าเริ่มต้นเป็น false โดยตั้งใจ
   *    หน้าผู้ดูแลต้องเห็นหมวดที่ปิดไปแล้วเพื่อเปิดกลับหรือแก้ชื่อ
   *    ส่วนฟอร์มแจ้งเรื่องต้องส่ง active_only=true มาเอง — ถ้าสลับค่าเริ่มต้น
   *    หน้าผู้ดูแลจะมองไม่เห็นหมวดที่ปิดแล้วเลย และจะดูเหมือนข้อมูลหาย
   */
  async categories(scope: AccessScope, activeOnly = false) {
    const assignee = alias(appUser, 'default_assignee');
    const rows = await this.db
      .select({
        id: ticketCategory.id,
        code: ticketCategory.code,
        name_th: ticketCategory.nameTh,
        parent_id: ticketCategory.parentId,
        company_id: ticketCategory.companyId,
        company_code: company.code,
        default_impact: ticketCategory.defaultImpact,
        default_urgency: ticketCategory.defaultUrgency,
        assignee_id: ticketCategory.defaultAssigneeId,
        assignee_name: assignee.fullName,
        sort_order: ticketCategory.sortOrder,
        is_active: ticketCategory.isActive,
      })
      .from(ticketCategory)
      .leftJoin(company, eq(company.id, ticketCategory.companyId))
      .leftJoin(assignee, eq(assignee.id, ticketCategory.defaultAssigneeId))
      .where(
        activeOnly
          ? and(this.companyScope(scope, ticketCategory.companyId), eq(ticketCategory.isActive, true))
          : this.companyScope(scope, ticketCategory.companyId),
      )
      .orderBy(asc(ticketCategory.sortOrder), asc(ticketCategory.nameTh));

    return rows.map(({ company_id, company_code, assignee_id, assignee_name, ...r }) => ({
      ...r,
      company: MasterDataService.ref(company_id, { code: company_code ?? '' }),
      default_assignee: MasterDataService.ref(assignee_id, {
        full_name: assignee_name ?? '',
      }),
    }));
  }

  async catalogItems(scope: AccessScope) {
    const rows = await this.db
      .select({
        id: serviceCatalogItem.id,
        code: serviceCatalogItem.code,
        name_th: serviceCatalogItem.nameTh,
        company_id: serviceCatalogItem.companyId,
        company_code: company.code,
        category_id: serviceCatalogItem.categoryId,
        category_name: ticketCategory.nameTh,
        default_priority: serviceCatalogItem.defaultPriority,
        target_minutes: serviceCatalogItem.targetMinutes,
        clock_start_event: serviceCatalogItem.clockStartEvent,
        lead_time_days: serviceCatalogItem.leadTimeDays,
        requires_approval: serviceCatalogItem.requiresApproval,
        approval_chain: serviceCatalogItem.approvalChain,
        checklist_template_id: serviceCatalogItem.checklistTemplateId,
        checklist_template_name: checklistTemplate.nameTh,
        is_active: serviceCatalogItem.isActive,
      })
      .from(serviceCatalogItem)
      .leftJoin(company, eq(company.id, serviceCatalogItem.companyId))
      .leftJoin(ticketCategory, eq(ticketCategory.id, serviceCatalogItem.categoryId))
      .leftJoin(
        checklistTemplate,
        eq(checklistTemplate.id, serviceCatalogItem.checklistTemplateId),
      )
      .where(this.companyScope(scope, serviceCatalogItem.companyId))
      .orderBy(asc(serviceCatalogItem.nameTh));

    return rows.map(
      ({
        company_id,
        company_code,
        category_id,
        category_name,
        checklist_template_id,
        checklist_template_name,
        ...r
      }) => ({
        ...r,
        company: MasterDataService.ref(company_id, { code: company_code ?? '' }),
        category: MasterDataService.ref(category_id, { name_th: category_name ?? '' }),
        checklist_template: MasterDataService.ref(checklist_template_id, {
          name_th: checklist_template_name ?? '',
        }),
      }),
    );
  }

  async services(scope: AccessScope) {
    const rows = await this.db
      .select({
        id: service.id,
        code: service.code,
        name_th: service.nameTh,
        company_id: service.companyId,
        company_code: company.code,
        service_group: service.serviceGroup,
        service_tier: service.serviceTier,
        owner_id: service.ownerUserId,
        owner_name: appUser.fullName,
        is_24x7: service.is24x7,
        is_active: service.isActive,
        open_outage_count: sql<number>`(
          SELECT count(*)::int FROM ${serviceOutage}
          WHERE ${serviceOutage.serviceId} = ${service.id} AND ${serviceOutage.endedAt} IS NULL
        )`,
      })
      .from(service)
      .leftJoin(company, eq(company.id, service.companyId))
      .leftJoin(appUser, eq(appUser.id, service.ownerUserId))
      .where(this.companyScope(scope, service.companyId))
      .orderBy(asc(service.serviceTier), asc(service.nameTh));

    return rows.map(({ company_id, company_code, owner_id, owner_name, ...r }) => ({
      ...r,
      company: MasterDataService.ref(company_id, { code: company_code ?? '' }),
      owner: MasterDataService.ref(owner_id, { full_name: owner_name ?? '' }),
      /*
       * ยังไม่คำนวณ uptime รายระบบที่นี่ — คืน null แทน 100
       *
       * ตัวเลข uptime ที่คำนวณจากตาราง service_outage ที่ยังว่าง จะได้ 100%
       * ทุกระบบ ซึ่งอ่านแล้วเข้าใจว่าเดือนนี้ไม่มีระบบไหนล่มเลย
       * ทั้งที่ความจริงคือยังไม่มีใครบันทึกเหตุขัดข้อง
       * ค่ารวมของทั้งกลุ่มดูได้ที่ GET /reports/kpi (KPI-6)
       */
      uptime_percent_month: null,
    }));
  }

  async approvedSoftwareList(scope: AccessScope) {
    const rows = await this.db
      .select({
        id: approvedSoftware.id,
        name: approvedSoftware.name,
        version: approvedSoftware.version,
        license_type: approvedSoftware.licenseType,
        note: approvedSoftware.note,
        company_id: approvedSoftware.companyId,
        company_code: company.code,
        is_active: approvedSoftware.isActive,
      })
      .from(approvedSoftware)
      .leftJoin(company, eq(company.id, approvedSoftware.companyId))
      .where(this.companyScope(scope, approvedSoftware.companyId))
      .orderBy(asc(approvedSoftware.name));

    return rows.map(({ company_id, company_code, ...r }) => ({
      ...r,
      company: MasterDataService.ref(company_id, { code: company_code ?? '' }),
    }));
  }

  /** นโยบาย SLA พร้อมเป้าหมายรายระดับความสำคัญ */
  async slaPolicies(scope: AccessScope) {
    const policies = await this.db
      .select({
        id: slaPolicy.id,
        name: slaPolicy.name,
        company_id: slaPolicy.companyId,
        company_code: company.code,
        doc_ref: slaPolicy.docRef,
        doc_version: slaPolicy.docVersion,
        effective_from: slaPolicy.effectiveFrom,
        effective_to: slaPolicy.effectiveTo,
        is_default: slaPolicy.isDefault,
        is_active: slaPolicy.isActive,
      })
      .from(slaPolicy)
      .leftJoin(company, eq(company.id, slaPolicy.companyId))
      .where(this.companyScope(scope, slaPolicy.companyId))
      .orderBy(asc(slaPolicy.id));

    if (policies.length === 0) return [];

    const targets = await this.db
      .select({
        policy_id: slaTarget.slaPolicyId,
        priority: slaTarget.priority,
        response_minutes: slaTarget.responseMinutes,
        resolution_minutes: slaTarget.resolutionMinutes,
        clock_mode: slaTarget.clockMode,
        // จำเป็นต่อ P1 ที่ต้องรายงานความคืบหน้าทุก 30 นาที (SLA 5.1)
        status_report_interval_minutes: slaTarget.statusReportIntervalMinutes,
        escalation_percent: slaTarget.escalationPercent,
      })
      .from(slaTarget)
      .where(
        inArray(
          slaTarget.slaPolicyId,
          policies.map((p) => p.id),
        ),
      )
      .orderBy(asc(slaTarget.priority));

    return policies.map(({ company_id, company_code, ...p }) => ({
      ...p,
      company: MasterDataService.ref(company_id, { code: company_code ?? '' }),
      targets: targets
        .filter((t) => t.policy_id === p.id)
        .map(({ policy_id: _policy_id, ...t }) => t),
    }));
  }

  async businessHours(scope: AccessScope) {
    return this.db
      .select({
        id: businessHours.id,
        company_id: businessHours.companyId,
        company_code: company.code,
        day_of_week: businessHours.dayOfWeek,
        start_time: businessHours.startTime,
        end_time: businessHours.endTime,
        is_working_day: businessHours.isWorkingDay,
      })
      .from(businessHours)
      // leftJoin ไม่ใช่ innerJoin — แถวระดับกลุ่มมี company_id เป็น NULL
      // innerJoin ตัดทิ้งทั้งหมด ซึ่งคือสาเหตุที่เคยคืน 0 รายการทั้งที่ในฐานข้อมูลมี 7 แถว
      .leftJoin(company, eq(company.id, businessHours.companyId))
      .where(this.companyScope(scope, businessHours.companyId))
      .orderBy(asc(company.code), asc(businessHours.dayOfWeek));
  }

  /**
   * วันหยุด
   *
   * ⚠️ ตารางนี้ยังว่างอยู่ — ปฏิทินวันหยุดราชการลาวเป็นข้อค้างที่รอองค์กร (Q-03)
   *    ตราบใดที่ยังว่าง เครื่องคำนวณ SLA จะนับวันหยุดเป็นวันทำการ
   *    ทำให้กำหนดเวลาที่คำนวณได้เร็วกว่าความจริง
   */
  async holidays(scope: AccessScope) {
    return this.db
      .select({
        id: holiday.id,
        company_id: holiday.companyId,
        holiday_date: holiday.holidayDate,
        name: holiday.name,
      })
      .from(holiday)
      .where(this.companyScope(scope, holiday.companyId))
      .orderBy(asc(holiday.holidayDate));
  }

  async escalationRules(scope: AccessScope) {
    const rows = await this.db
      .select({
        id: slaEscalationRule.id,
        code: slaEscalationRule.code,
        company_id: slaEscalationRule.companyId,
        company_code: company.code,
        trigger_type: slaEscalationRule.triggerType,
        priority: slaEscalationRule.priority,
        threshold_minutes: slaEscalationRule.thresholdMinutes,
        threshold_clock_mode: slaEscalationRule.thresholdClockMode,
        notify_contact_keys: slaEscalationRule.notifyContactKeys,
        notify_roles: slaEscalationRule.notifyRoles,
        repeat_interval_minutes: slaEscalationRule.repeatIntervalMinutes,
        notify_outside_business_hours: slaEscalationRule.notifyOutsideBusinessHours,
        is_active: slaEscalationRule.isActive,
      })
      .from(slaEscalationRule)
      .leftJoin(company, eq(company.id, slaEscalationRule.companyId))
      .where(this.companyScope(scope, slaEscalationRule.companyId))
      .orderBy(asc(slaEscalationRule.priority), asc(slaEscalationRule.thresholdMinutes));

    /*
     * notify_contact_keys / notify_roles เก็บเป็น jsonb ในฐานข้อมูล
     * แต่หน้าจอแสดงเป็นข้อความคั่นจุลภาค — แปลงที่นี่ที่เดียว
     * ไม่ปล่อยให้แต่ละหน้าเดาเองว่าได้อาร์เรย์หรือได้ข้อความ
     */
    const asCsv = (v: unknown): string =>
      Array.isArray(v) ? v.join(',') : typeof v === 'string' ? v : '';

    return rows.map(({ company_id, company_code, ...r }) => ({
      ...r,
      company: MasterDataService.ref(company_id, { code: company_code ?? '' }),
      notify_contact_keys: asCsv(r.notify_contact_keys),
      notify_roles: asCsv(r.notify_roles) || null,
    }));
  }

  /**
   * ผู้รับการยกระดับตามตำแหน่ง
   *
   * เชื่อม contact_key ที่กฎยกระดับอ้างถึง (head_of_it, ceo, dpo, …)
   * เข้ากับคนจริง — ถ้าตารางนี้ว่าง กฎยกระดับจะทำงานแล้วไม่มีใครได้รับแจ้ง
   * ซึ่งเป็นความล้มเหลวแบบเงียบที่อันตรายที่สุดของระบบยกระดับ
   */
  async escalationContacts(scope: AccessScope) {
    const rows = await this.db
      .select({
        id: escalationContact.id,
        company_id: escalationContact.companyId,
        company_code: company.code,
        contact_key: escalationContact.contactKey,
        user_id: escalationContact.userId,
        user_name: appUser.fullName,
        user_email: appUser.email,
        is_primary: escalationContact.isPrimary,
        is_active: escalationContact.isActive,
      })
      .from(escalationContact)
      .innerJoin(appUser, eq(appUser.id, escalationContact.userId))
      // leftJoin — company_id = NULL คือผู้รับระดับกลุ่ม ซึ่งเป็นตัวสำรอง
      // ให้บริษัทที่ยังไม่ได้กำหนดคนของตัวเอง innerJoin จะตัดแถวเหล่านั้นทิ้ง
      .leftJoin(company, eq(company.id, escalationContact.companyId))
      .where(this.companyScope(scope, escalationContact.companyId))
      .orderBy(asc(escalationContact.contactKey), asc(appUser.fullName));

    return rows.map(({ company_id, company_code, user_id, user_name, user_email, ...r }) => ({
      ...r,
      company: MasterDataService.ref(company_id, { code: company_code ?? '' }),
      user: { id: user_id, full_name: user_name, email: user_email },
    }));
  }

  /**
   * เหตุขัดข้องของระบบงาน — ตัวตั้งของ KPI-6 Uptime
   *
   * ended_at = NULL แปลว่ายังขัดข้องอยู่ ณ ตอนนี้ ไม่ใช่ข้อมูลไม่ครบ
   * หน้าจอต้องแยกสองกรณีนี้ให้เห็น
   */
  async serviceOutages(scope: AccessScope) {
    const rows = await this.db
      .select({
        id: serviceOutage.id,
        service_id: serviceOutage.serviceId,
        service_name: service.nameTh,
        service_tier: service.serviceTier,
        ticket_id: serviceOutage.ticketId,
        ticket_no: ticket.ticketNo,
        started_at: serviceOutage.startedAt,
        ended_at: serviceOutage.endedAt,
        is_planned: serviceOutage.isPlanned,
        maintenance_window_id: serviceOutage.maintenanceWindowId,
        cause: serviceOutage.cause,
        recorded_by_id: serviceOutage.recordedBy,
        recorded_by_name: appUser.fullName,
      })
      .from(serviceOutage)
      .innerJoin(service, eq(service.id, serviceOutage.serviceId))
      .leftJoin(ticket, eq(ticket.id, serviceOutage.ticketId))
      .leftJoin(appUser, eq(appUser.id, serviceOutage.recordedBy))
      // ขอบเขตมาจากระบบงานที่ล่ม ไม่ใช่จากตัวเหตุขัดข้องเอง
      // เพราะ service_outage ไม่มีคอลัมน์ company_id
      .where(this.companyScope(scope, service.companyId))
      .orderBy(desc(serviceOutage.startedAt))
      .limit(200);

    return rows.map(
      ({
        service_id,
        service_name,
        service_tier,
        ticket_id,
        ticket_no,
        recorded_by_id,
        recorded_by_name,
        ...r
      }) => ({
        ...r,
        service: { id: service_id, name_th: service_name, service_tier },
        ticket: MasterDataService.ref(ticket_id, { ticket_no: ticket_no ?? '' }),
        recorded_by: MasterDataService.ref(recorded_by_id, {
          full_name: recorded_by_name ?? '',
        }),
        started_at: r.started_at.toISOString(),
        ended_at: r.ended_at?.toISOString() ?? null,
        is_ongoing: r.ended_at === null,
        duration_minutes:
          r.ended_at === null
            ? null
            : Math.round((r.ended_at.getTime() - r.started_at.getTime()) / 60000),
      }),
    );
  }

  /** หน้าต่างบำรุงรักษาที่วางแผนไว้ — downtime ในช่วงนี้ไม่นับเข้า KPI-6 */
  async maintenanceWindows(scope: AccessScope) {
    const rows = await this.db
      .select({
        id: maintenanceWindow.id,
        company_id: maintenanceWindow.companyId,
        company_code: company.code,
        service_id: maintenanceWindow.serviceId,
        service_name: service.nameTh,
        planned_start: maintenanceWindow.plannedStart,
        planned_end: maintenanceWindow.plannedEnd,
        notified_at: maintenanceWindow.notifiedAt,
        notice_lead_business_days: maintenanceWindow.noticeLeadBusinessDays,
        description: maintenanceWindow.description,
        created_by_id: maintenanceWindow.createdBy,
        created_by_name: appUser.fullName,
      })
      .from(maintenanceWindow)
      .leftJoin(company, eq(company.id, maintenanceWindow.companyId))
      .leftJoin(service, eq(service.id, maintenanceWindow.serviceId))
      .innerJoin(appUser, eq(appUser.id, maintenanceWindow.createdBy))
      .where(this.companyScope(scope, maintenanceWindow.companyId))
      .orderBy(desc(maintenanceWindow.plannedStart))
      .limit(200);

    const now = Date.now();
    return rows.map(
      ({
        company_id,
        company_code,
        service_id,
        service_name,
        created_by_id,
        created_by_name,
        ...r
      }) => ({
        ...r,
        company: MasterDataService.ref(company_id, { code: company_code ?? '' }),
        service: MasterDataService.ref(service_id, { name_th: service_name ?? '' }),
        created_by: MasterDataService.ref(created_by_id, { full_name: created_by_name }),
        planned_start: r.planned_start.toISOString(),
        planned_end: r.planned_end.toISOString(),
        notified_at: r.notified_at?.toISOString() ?? null,
        is_active_now: r.planned_start.getTime() <= now && r.planned_end.getTime() >= now,
        // SLA 3.1 บังคับให้แจ้งล่วงหน้าตามจำนวนวันที่กำหนด — หน้าต่างที่ยังไม่แจ้ง
        // ต้องเห็นชัด เพราะการบำรุงรักษาที่ไม่ได้แจ้งนับเป็น downtime เต็มจำนวน
        is_notified: r.notified_at !== null,
      }),
    );
  }

  /** แม่แบบรายการตรวจ พร้อมรายการย่อย */
  async checklistTemplates(scope: AccessScope) {
    const templates = await this.db
      .select({
        id: checklistTemplate.id,
        code: checklistTemplate.code,
        name_th: checklistTemplate.nameTh,
        company_id: checklistTemplate.companyId,
        company_code: company.code,
        doc_ref: checklistTemplate.docRef,
        version: checklistTemplate.version,
        is_active: checklistTemplate.isActive,
      })
      .from(checklistTemplate)
      .leftJoin(company, eq(company.id, checklistTemplate.companyId))
      .where(this.companyScope(scope, checklistTemplate.companyId))
      .orderBy(asc(checklistTemplate.nameTh));

    if (templates.length === 0) return [];

    const items = await this.db
      .select({
        template_id: checklistItem.templateId,
        id: checklistItem.id,
        title_th: checklistItem.titleTh,
        description: checklistItem.description,
        is_required: checklistItem.isRequired,
        evidence_required: checklistItem.evidenceRequired,
        // บอกว่าข้อนี้ปกติเป็นหน้าที่ของบทบาทไหน — หน้าจอใช้แสดงป้ายกำกับ
        default_role_code: checklistItem.defaultRoleCode,
        sort_order: checklistItem.sortOrder,
      })
      .from(checklistItem)
      .where(
        inArray(
          checklistItem.templateId,
          templates.map((t) => t.id),
        ),
      )
      .orderBy(asc(checklistItem.sortOrder));

    return templates.map(({ company_id, company_code, ...t }) => ({
      ...t,
      company: MasterDataService.ref(company_id, { code: company_code ?? '' }),
      items: items
        .filter((i) => i.template_id === t.id)
        .map(({ template_id: _template_id, ...i }) => i),
    }));
  }

  /**
   * บทบาทพร้อมสิทธิ์ที่ผูกไว้
   *
   * ⚠️ approval.decide ไม่เคยถูกผูกกับบทบาทใด โดยตั้งใจ
   *    สิทธิ์อนุมัติมาจากการเป็นผู้อนุมัติของคำขอนั้นโดยตรง ไม่ใช่จากบทบาท
   *    มิฉะนั้นทุกคนในบทบาทนั้นจะอนุมัติคำขอของใครก็ได้
   */
  async roles() {
    const roles = await this.db
      .select({
        id: role.id,
        code: role.code,
        name_th: role.nameTh,
        description: role.description,
        is_system: role.isSystem,
        // นับเฉพาะการมอบบทบาทที่ยังไม่หมดอายุ — บทบาทที่หมดอายุแล้ว
        // ยังอยู่ในตารางแต่ไม่มีผลกับสิทธิ์จริง การนับรวมจะทำให้ผู้ดูแล
        // เข้าใจว่ามีคนถือสิทธิ์นั้นมากกว่าความจริง
        user_count: sql<number>`(
          SELECT count(DISTINCT ${userRole.userId})::int FROM ${userRole}
          WHERE ${userRole.roleId} = ${role.id}
            AND (${userRole.expiresAt} IS NULL OR ${userRole.expiresAt} > now())
        )`,
      })
      .from(role)
      .orderBy(asc(role.id));

    const links = await this.db
      .select({ role_id: rolePermission.roleId, code: permission.code })
      .from(rolePermission)
      .innerJoin(permission, eq(permission.id, rolePermission.permissionId));

    return roles.map((r) => ({
      ...r,
      permissions: links.filter((l) => l.role_id === r.id).map((l) => l.code),
    }));
  }

  async permissions() {
    return this.db
      .select({
        id: permission.id,
        code: permission.code,
        group_name: permission.groupName,
        description: permission.description,
      })
      .from(permission)
      .orderBy(asc(permission.code));
  }

  /**
   * สร้างหมวดหมู่ปัญหา
   *
   * ⚠️ code เป็นตัวระบุถาวร แก้ไม่ได้หลังสร้าง
   *    รายงานย้อนหลัง กฎ routing และการนำเข้าข้อมูลอ้างถึง code ไม่ใช่ id
   *    การเปลี่ยน code ภายหลังทำให้ของเหล่านั้นชี้ผิดโดยไม่มีอะไรฟ้อง
   *    ถ้าตั้งผิดให้ปิดตัวเก่าแล้วสร้างใหม่
   */
  async createCategory(
    scope: AccessScope,
    input: {
      code: string;
      name_th: string;
      company_id?: number | null;
      default_impact?: string;
      default_urgency?: string;
      sort_order?: number;
      is_active?: boolean;
    },
  ) {
    scope.require('category.manage');

    const code = input.code?.trim().toUpperCase() ?? '';
    const nameTh = input.name_th?.trim() ?? '';

    if (!/^[A-Z0-9_]{2,40}$/.test(code)) {
      throw new ValidationError('VALIDATION_ERROR', 'ລະຫັດຕ້ອງເປັນ A–Z, 0–9 ຫຼື _ ຄວາມຍາວ 2–40 ຕົວ', [
        { field: 'code', message: 'ຮູບແບບລະຫັດບໍ່ຖືກຕ້ອງ' },
      ]);
    }
    if (nameTh.length < 2) {
      throw new ValidationError('VALIDATION_ERROR', 'ຊື່ໝວດໝູ່ສັ້ນເກີນໄປ', [
        { field: 'name_th', message: 'ຕ້ອງຍາວຢ່າງໜ້ອຍ 2 ຕົວອັກສອນ' },
      ]);
    }

    /*
     * company_id = null คือหมวดระดับกลุ่มที่ทุกบริษัทใช้ร่วมกัน
     * ซึ่งมีแต่ super_admin เท่านั้นที่สร้างได้ — ผู้ดูแลบริษัทเดียว
     * ไม่ควรสร้างของที่บังคับใช้กับอีก 6 บริษัท
     */
    const companyId = input.company_id ?? null;
    if (companyId === null && !scope.isSuperAdmin) {
      throw new ForbiddenError(
        'FORBIDDEN',
        'ມີແຕ່ຜູ້ດູແລລະບົບເທົ່ານັ້ນທີ່ສ້າງໝວດໝູ່ລະດັບກຸ່ມໄດ້',
      );
    }
    if (companyId !== null && !scope.inScope(companyId)) {
      throw new ForbiddenError('FORBIDDEN', 'ບໍລິສັດນີ້ຢູ່ນອກຂອບເຂດຂອງທ່ານ');
    }

    try {
      const [row] = await this.db
        .insert(ticketCategory)
        .values({
          companyId,
          code,
          nameTh,
          defaultImpact: input.default_impact ?? 'individual',
          defaultUrgency: input.default_urgency ?? 'medium',
          sortOrder: input.sort_order ?? 0,
          isActive: input.is_active ?? true,
        })
        .returning({ id: ticketCategory.id });

      return this.categoryById(scope, row!.id);
    } catch (err) {
      // unique (company_id, code) — บอกให้ชัดว่าซ้ำ ไม่ใช่ 500 ที่อ่านไม่รู้เรื่อง
      if (err instanceof Error && err.message.includes('uq_ticket_category_company_code')) {
        throw new ConflictError('CATEGORY_CODE_EXISTS', `ມີລະຫັດ ${code} ຢູ່ແລ້ວ`, { code });
      }
      throw err;
    }
  }

  /**
   * แก้ไขหมวดหมู่
   *
   * ⚠️ ไม่มี endpoint ลบโดยตั้งใจ — ปิดด้วย is_active เท่านั้น
   *    ticket เก่าอ้างถึง category_id อยู่ ถ้าลบแถวไป ประวัติจะชี้ไปที่
   *    ความว่างเปล่า และรายงานย้อนหลังจะนับหมวดนั้นไม่ได้อีกเลย
   *    ฐานข้อมูลก็ปฏิเสธการลบอยู่แล้วด้วย FK แต่ข้อความที่ได้อ่านไม่รู้เรื่อง
   *
   * ⚠️ code ไม่อยู่ในรายการที่แก้ได้ ด้วยเหตุผลเดียวกับตอนสร้าง
   */
  async updateCategory(
    scope: AccessScope,
    id: number,
    input: {
      name_th?: string;
      default_impact?: string;
      default_urgency?: string;
      sort_order?: number;
      is_active?: boolean;
    },
  ) {
    scope.require('category.manage');

    // อ่านก่อนเพื่อตรวจขอบเขต — นอกขอบเขตได้ 404 ไม่ใช่ 403
    const current = await this.categoryById(scope, id);

    const patch: Record<string, unknown> = {};
    if (input.name_th !== undefined) {
      const nameTh = input.name_th.trim();
      if (nameTh.length < 2) {
        throw new ValidationError('VALIDATION_ERROR', 'ຊື່ໝວດໝູ່ສັ້ນເກີນໄປ', [
          { field: 'name_th', message: 'ຕ້ອງຍາວຢ່າງໜ້ອຍ 2 ຕົວອັກສອນ' },
        ]);
      }
      patch.nameTh = nameTh;
    }
    if (input.default_impact !== undefined) patch.defaultImpact = input.default_impact;
    if (input.default_urgency !== undefined) patch.defaultUrgency = input.default_urgency;
    if (input.sort_order !== undefined) patch.sortOrder = input.sort_order;
    if (input.is_active !== undefined) patch.isActive = input.is_active;

    if (Object.keys(patch).length === 0) return current;

    await this.db.update(ticketCategory).set(patch).where(eq(ticketCategory.id, id));
    return this.categoryById(scope, id);
  }

  /** อ่านหมวดเดียวพร้อมตรวจขอบเขต — ใช้ยืนยันผลหลังเขียน */
  private async categoryById(scope: AccessScope, id: number) {
    const rows = await this.categories(scope);
    const found = rows.find((r) => r.id === id);
    if (!found) {
      throw new NotFoundError('CATEGORY_NOT_FOUND', 'ບໍ່ພົບໝວດໝູ່ທີ່ລະບຸ', { id });
    }
    return found;
  }


  /* ══════════════════════════════════════════════════════════════════════════
   * การเขียนข้อมูลหลัก
   *
   * ทุกเมธอดในส่วนนี้ใช้กติกาเดียวกันสี่ข้อ เขียนไว้ตรงนี้ครั้งเดียว
   * แทนที่จะย้ำซ้ำในทุกตัว
   *
   *  1. ไม่มีการลบ มีแต่ปิดด้วย is_active = false
   *     ticket และรายงานย้อนหลังอ้างถึงแถวเหล่านี้ด้วย id การลบทำให้ประวัติ
   *     ชี้ไปที่ความว่างเปล่า และ FK ก็ปฏิเสธอยู่ดีด้วยข้อความที่ผู้ใช้อ่านไม่รู้เรื่อง
   *     (ตารางที่ไม่มี is_active เช่น holiday จึงแก้ได้อย่างเดียว)
   *
   *  2. company_id = null คือ "ใช้ร่วมกันทั้งกลุ่ม" ซึ่งมีแต่ super_admin สร้างได้
   *     ผู้ดูแลของบริษัทเดียวไม่ควรสร้างของที่บังคับใช้กับอีก 6 บริษัท
   *
   *  3. แถวนอกขอบเขตตอบ 404 ไม่ใช่ 403 — การตอบ 403 ยืนยันว่าแถวนั้นมีอยู่จริง
   *     ซึ่งเป็นข้อมูลที่ไม่ควรบอก (กฎเดียวกับ US-07 AC-2)
   *     ทำได้ด้วยการอ่านผ่านเมธอดอ่านปกติที่กรองขอบเขตอยู่แล้ว
   *
   *  4. code แก้ไม่ได้หลังสร้าง — รายงาน กฎ routing และไฟล์นำเข้าอ้างถึง code
   *     ไม่ใช่ id การเปลี่ยนทีหลังทำให้ของเหล่านั้นชี้ผิดโดยไม่มีอะไรฟ้อง
   * ══════════════════════════════════════════════════════════════════════════ */

  /** null = ระดับกลุ่ม (เฉพาะ super_admin) · มีค่า = ต้องอยู่ในขอบเขต */
  private assertCanWrite(scope: AccessScope, companyId: number | null): void {
    if (companyId === null) {
      if (!scope.isSuperAdmin) {
        throw new ForbiddenError(
          'FORBIDDEN',
          'ມີແຕ່ຜູ້ດູແລລະບົບເທົ່ານັ້ນທີ່ສ້າງລາຍການລະດັບກຸ່ມໄດ້',
        );
      }
      return;
    }
    if (!scope.inScope(companyId)) {
      throw new ForbiddenError('FORBIDDEN', 'ບໍລິສັດນີ້ຢູ່ນອກຂອບເຂດຂອງທ່ານ');
    }
  }

  private static text(value: unknown, field: string, min: number, label: string): string {
    const v = typeof value === 'string' ? value.trim() : '';
    if (v.length < min) {
      throw new ValidationError('VALIDATION_ERROR', label, [{ field, message: label }]);
    }
    return v;
  }

  /** ช่องที่ปล่อยว่างได้ — สตริงว่างเก็บเป็น null ไม่ใช่ '' เพื่อให้ค้นหาง่าย */
  private static optional(value: unknown): string | null {
    const v = typeof value === 'string' ? value.trim() : '';
    return v.length === 0 ? null : v;
  }

  private static codeOf(value: unknown, field = 'code'): string {
    const v = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!/^[A-Z0-9_]{2,40}$/.test(v)) {
      throw new ValidationError(
        'VALIDATION_ERROR',
        'ລະຫັດຕ້ອງເປັນ A–Z, 0–9 ຫຼື _ ຄວາມຍາວ 2–40 ຕົວ',
        [{ field, message: 'ຮູບແບບລະຫັດບໍ່ຖືກຕ້ອງ' }],
      );
    }
    return v;
  }

  /** ค่าที่ฐานข้อมูลมี CHECK คุมอยู่ — ดักที่นี่ให้ได้ข้อความที่อ่านรู้เรื่องแทน 500 */
  private static oneOf<T extends string>(
    value: unknown,
    allowed: readonly T[],
    field: string,
  ): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
      throw new ValidationError('VALIDATION_ERROR', `ຄ່າຂອງ ${field} ບໍ່ຖືກຕ້ອງ`, [
        { field, message: `ຕ້ອງເປັນໜຶ່ງໃນ ${allowed.join(', ')}` },
      ]);
    }
    return value as T;
  }

  /**
   * แปลงการชนคีย์ซ้ำของ Postgres เป็นข้อความที่ผู้ใช้เข้าใจ
   *
   * คืน Error ให้ผู้เรียก throw เอง แทนที่จะ throw ในนี้ เพื่อให้ TypeScript
   * เห็นได้ชัดว่าเส้นทางนั้นจบแน่ ๆ ไม่ต้องพึ่งการอนุมานชนิด never
   */
  private static conflictError(
    err: unknown,
    constraint: string,
    code: string,
    message: string,
  ): Error {
    if (err instanceof Error && err.message.includes(constraint)) {
      return new ConflictError(code, message);
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  private static pick<T extends { id: number }>(
    rows: readonly T[],
    id: number,
    code: string,
    message: string,
  ): T {
    const found = rows.find((r) => r.id === id);
    if (!found) throw new NotFoundError(code, message, { id });
    return found;
  }

  private static requireCompanyId(value: unknown): number {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ValidationError('VALIDATION_ERROR', 'ຕ້ອງລະບຸບໍລິສັດ', [
        { field: 'company_id', message: 'ຕ້ອງລະບຸບໍລິສັດ' },
      ]);
    }
    return n;
  }

  // ── บริษัท ────────────────────────────────────────────────────────────────

  /**
   * สร้างบริษัทใหม่ในกลุ่ม
   *
   * จำกัดที่ super_admin เท่านั้น ไม่ใช่แค่ company.manage — การเพิ่มบริษัท
   * เปลี่ยนรูปของทั้งกลุ่ม ไม่ใช่การแก้ข้อมูลภายในบริษัทใดบริษัทหนึ่ง
   */
  async createCompany(
    scope: AccessScope,
    input: {
      code: string;
      name_th: string;
      name_en?: string | null;
      contact_email?: string | null;
      is_active?: boolean;
    },
  ) {
    scope.require('company.manage');
    if (!scope.isSuperAdmin) {
      throw new ForbiddenError('FORBIDDEN', 'ມີແຕ່ຜູ້ດູແລລະບົບເທົ່ານັ້ນທີ່ເພີ່ມບໍລິສັດໄດ້');
    }

    const code = MasterDataService.codeOf(input.code);
    const nameTh = MasterDataService.text(input.name_th, 'name_th', 2, 'ຊື່ບໍລິສັດສັ້ນເກີນໄປ');

    try {
      const [row] = await this.db
        .insert(company)
        .values({
          code,
          nameTh,
          nameEn: MasterDataService.optional(input.name_en),
          contactEmail: MasterDataService.optional(input.contact_email),
          isActive: input.is_active ?? true,
        })
        .returning({ id: company.id });
      return MasterDataService.pick(
        await this.companies(scope),
        row!.id,
        'COMPANY_NOT_FOUND',
        'ບໍ່ພົບບໍລິສັດ',
      );
    } catch (err) {
      throw MasterDataService.conflictError(
        err,
        'company_code_key',
        'COMPANY_CODE_EXISTS',
        `ມີລະຫັດບໍລິສັດ ${code} ຢູ່ແລ້ວ`,
      );
    }
  }

  async updateCompany(
    scope: AccessScope,
    id: number,
    input: {
      name_th?: string;
      name_en?: string | null;
      contact_email?: string | null;
      is_active?: boolean;
    },
  ) {
    scope.require('company.manage');
    const current = MasterDataService.pick(
      await this.companies(scope),
      id,
      'COMPANY_NOT_FOUND',
      'ບໍ່ພົບບໍລິສັດ',
    );

    const patch: Record<string, unknown> = {};
    if (input.name_th !== undefined) {
      patch.nameTh = MasterDataService.text(input.name_th, 'name_th', 2, 'ຊື່ບໍລິສັດສັ້ນເກີນໄປ');
    }
    if (input.name_en !== undefined) patch.nameEn = MasterDataService.optional(input.name_en);
    if (input.contact_email !== undefined) {
      patch.contactEmail = MasterDataService.optional(input.contact_email);
    }
    if (input.is_active !== undefined) patch.isActive = input.is_active;
    if (Object.keys(patch).length === 0) return current;

    await this.db.update(company).set(patch).where(eq(company.id, id));
    return MasterDataService.pick(
      await this.companies(scope),
      id,
      'COMPANY_NOT_FOUND',
      'ບໍ່ພົບບໍລິສັດ',
    );
  }

  // ── แผนก ──────────────────────────────────────────────────────────────────

  /**
   * สร้างแผนก
   *
   * department.company_id เป็น NOT NULL — ไม่มีแนวคิด "แผนกระดับกลุ่ม"
   * ต่างจากตารางอื่นในไฟล์นี้ที่ null แปลว่าใช้ร่วมกันทั้งกลุ่ม
   */
  async createDepartment(
    scope: AccessScope,
    input: { company_id: number; name: string; is_active?: boolean },
  ) {
    scope.require('department.manage');
    const companyId = MasterDataService.requireCompanyId(input.company_id);
    const name = MasterDataService.text(input.name, 'name', 2, 'ຊື່ພະແນກສັ້ນເກີນໄປ');
    this.assertCanWrite(scope, companyId);

    try {
      const [row] = await this.db
        .insert(department)
        .values({ companyId, name, isActive: input.is_active ?? true })
        .returning({ id: department.id });
      return MasterDataService.pick(
        await this.departments(scope),
        row!.id,
        'DEPARTMENT_NOT_FOUND',
        'ບໍ່ພົບພະແນກ',
      );
    } catch (err) {
      throw MasterDataService.conflictError(
        err,
        'uq_department_company_name',
        'DEPARTMENT_EXISTS',
        `ມີພະແນກຊື່ ${name} ໃນບໍລິສັດນີ້ຢູ່ແລ້ວ`,
      );
    }
  }

  async updateDepartment(
    scope: AccessScope,
    id: number,
    input: { name?: string; is_active?: boolean },
  ) {
    scope.require('department.manage');
    const current = MasterDataService.pick(
      await this.departments(scope),
      id,
      'DEPARTMENT_NOT_FOUND',
      'ບໍ່ພົບພະແນກ',
    );

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      patch.name = MasterDataService.text(input.name, 'name', 2, 'ຊື່ພະແນກສັ້ນເກີນໄປ');
    }
    if (input.is_active !== undefined) patch.isActive = input.is_active;
    if (Object.keys(patch).length === 0) return current;

    try {
      await this.db.update(department).set(patch).where(eq(department.id, id));
    } catch (err) {
      throw MasterDataService.conflictError(
        err,
        'uq_department_company_name',
        'DEPARTMENT_EXISTS',
        'ມີພະແນກຊື່ນີ້ໃນບໍລິສັດນີ້ຢູ່ແລ້ວ',
      );
    }
    return MasterDataService.pick(
      await this.departments(scope),
      id,
      'DEPARTMENT_NOT_FOUND',
      'ບໍ່ພົບພະແນກ',
    );
  }

  // ── ทะเบียนระบบงาน ────────────────────────────────────────────────────────

  async createService(
    scope: AccessScope,
    input: {
      code: string;
      name_th: string;
      service_group: string;
      service_tier?: string;
      company_id?: number | null;
      owner_user_id?: number | null;
      is_24x7?: boolean;
      is_active?: boolean;
    },
  ) {
    scope.require('service.manage');
    const code = MasterDataService.codeOf(input.code);
    const nameTh = MasterDataService.text(input.name_th, 'name_th', 2, 'ຊື່ລະບົບງານສັ້ນເກີນໄປ');
    const serviceGroup = MasterDataService.oneOf(
      input.service_group,
      SERVICE_GROUP,
      'service_group',
    );
    const serviceTier = MasterDataService.oneOf(
      input.service_tier ?? 'standard',
      SERVICE_TIER,
      'service_tier',
    );
    const companyId = input.company_id ?? null;
    this.assertCanWrite(scope, companyId);

    try {
      const [row] = await this.db
        .insert(service)
        .values({
          companyId,
          code,
          nameTh,
          serviceGroup,
          serviceTier,
          ownerUserId: input.owner_user_id ?? null,
          is24x7: input.is_24x7 ?? false,
          isActive: input.is_active ?? true,
        })
        .returning({ id: service.id });
      return MasterDataService.pick(
        await this.services(scope),
        row!.id,
        'SERVICE_NOT_FOUND',
        'ບໍ່ພົບລະບົບງານ',
      );
    } catch (err) {
      throw MasterDataService.conflictError(
        err,
        'uq_service_company_code',
        'SERVICE_CODE_EXISTS',
        `ມີລະຫັດ ${code} ຢູ່ແລ້ວ`,
      );
    }
  }

  async updateService(
    scope: AccessScope,
    id: number,
    input: {
      name_th?: string;
      service_group?: string;
      service_tier?: string;
      owner_user_id?: number | null;
      is_24x7?: boolean;
      is_active?: boolean;
    },
  ) {
    scope.require('service.manage');
    const current = MasterDataService.pick(
      await this.services(scope),
      id,
      'SERVICE_NOT_FOUND',
      'ບໍ່ພົບລະບົບງານ',
    );

    const patch: Record<string, unknown> = {};
    if (input.name_th !== undefined) {
      patch.nameTh = MasterDataService.text(input.name_th, 'name_th', 2, 'ຊື່ລະບົບງານສັ້ນເກີນໄປ');
    }
    if (input.service_group !== undefined) {
      patch.serviceGroup = MasterDataService.oneOf(
        input.service_group,
        SERVICE_GROUP,
        'service_group',
      );
    }
    if (input.service_tier !== undefined) {
      patch.serviceTier = MasterDataService.oneOf(input.service_tier, SERVICE_TIER, 'service_tier');
    }
    if (input.owner_user_id !== undefined) patch.ownerUserId = input.owner_user_id;
    if (input.is_24x7 !== undefined) patch.is24x7 = input.is_24x7;
    if (input.is_active !== undefined) patch.isActive = input.is_active;
    if (Object.keys(patch).length === 0) return current;

    await this.db.update(service).set(patch).where(eq(service.id, id));
    return MasterDataService.pick(
      await this.services(scope),
      id,
      'SERVICE_NOT_FOUND',
      'ບໍ່ພົບລະບົບງານ',
    );
  }

  // ── ซอฟต์แวร์ที่อนุมัติ ────────────────────────────────────────────────────

  async createApprovedSoftware(
    scope: AccessScope,
    input: {
      name: string;
      version?: string | null;
      license_type?: string | null;
      note?: string | null;
      company_id?: number | null;
      is_active?: boolean;
    },
  ) {
    scope.require('service.manage');
    const name = MasterDataService.text(input.name, 'name', 2, 'ຊື່ຊອບແວສັ້ນເກີນໄປ');
    const companyId = input.company_id ?? null;
    this.assertCanWrite(scope, companyId);

    try {
      const [row] = await this.db
        .insert(approvedSoftware)
        .values({
          companyId,
          name,
          version: MasterDataService.optional(input.version),
          licenseType: MasterDataService.optional(input.license_type),
          note: MasterDataService.optional(input.note),
          isActive: input.is_active ?? true,
        })
        .returning({ id: approvedSoftware.id });
      return MasterDataService.pick(
        await this.approvedSoftwareList(scope),
        row!.id,
        'SOFTWARE_NOT_FOUND',
        'ບໍ່ພົບຊອບແວ',
      );
    } catch (err) {
      throw MasterDataService.conflictError(
        err,
        'uq_approved_software',
        'SOFTWARE_EXISTS',
        `ມີ ${name} ລຸ້ນນີ້ຢູ່ແລ້ວ`,
      );
    }
  }

  async updateApprovedSoftware(
    scope: AccessScope,
    id: number,
    input: {
      name?: string;
      version?: string | null;
      license_type?: string | null;
      note?: string | null;
      is_active?: boolean;
    },
  ) {
    scope.require('service.manage');
    const current = MasterDataService.pick(
      await this.approvedSoftwareList(scope),
      id,
      'SOFTWARE_NOT_FOUND',
      'ບໍ່ພົບຊອບແວ',
    );

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      patch.name = MasterDataService.text(input.name, 'name', 2, 'ຊື່ຊອບແວສັ້ນເກີນໄປ');
    }
    if (input.version !== undefined) patch.version = MasterDataService.optional(input.version);
    if (input.license_type !== undefined) {
      patch.licenseType = MasterDataService.optional(input.license_type);
    }
    if (input.note !== undefined) patch.note = MasterDataService.optional(input.note);
    if (input.is_active !== undefined) patch.isActive = input.is_active;
    if (Object.keys(patch).length === 0) return current;

    await this.db.update(approvedSoftware).set(patch).where(eq(approvedSoftware.id, id));
    return MasterDataService.pick(
      await this.approvedSoftwareList(scope),
      id,
      'SOFTWARE_NOT_FOUND',
      'ບໍ່ພົບຊອບແວ',
    );
  }

  // ── วันหยุด ───────────────────────────────────────────────────────────────

  /**
   * เพิ่มวันหยุด
   *
   * ตารางนี้ว่างมาตลอด (Q-03) และตราบใดที่ยังว่าง เครื่องคำนวณ SLA จะนับ
   * วันหยุดเป็นวันทำการ ทำให้กำหนดเวลาที่คำนวณได้เร็วกว่าความจริง —
   * หน้าจอนี้จึงเป็นทางแก้ประเด็นนั้นโดยตรง ไม่ใช่แค่ตารางอ้างอิงอีกอัน
   */
  async createHoliday(
    scope: AccessScope,
    input: { holiday_date: string; name: string; company_id?: number | null },
  ) {
    scope.require('business_hours.manage');
    const name = MasterDataService.text(input.name, 'name', 2, 'ຊື່ວັນພັກສັ້ນເກີນໄປ');
    const holidayDate = MasterDataService.text(
      input.holiday_date,
      'holiday_date',
      10,
      'ຕ້ອງລະບຸວັນທີ',
    );
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) {
      throw new ValidationError('VALIDATION_ERROR', 'ຮູບແບບວັນທີບໍ່ຖືກຕ້ອງ', [
        { field: 'holiday_date', message: 'ຕ້ອງເປັນ YYYY-MM-DD' },
      ]);
    }
    const companyId = input.company_id ?? null;
    this.assertCanWrite(scope, companyId);

    try {
      const [row] = await this.db
        .insert(holiday)
        .values({ companyId, holidayDate, name })
        .returning({ id: holiday.id });
      return MasterDataService.pick(
        await this.holidays(scope),
        row!.id,
        'HOLIDAY_NOT_FOUND',
        'ບໍ່ພົບວັນພັກ',
      );
    } catch (err) {
      throw MasterDataService.conflictError(
        err,
        'uq_holiday_company_date',
        'HOLIDAY_EXISTS',
        `ມີວັນພັກວັນທີ ${holidayDate} ຢູ່ແລ້ວ`,
      );
    }
  }

  async updateHoliday(
    scope: AccessScope,
    id: number,
    input: { name?: string; holiday_date?: string },
  ) {
    scope.require('business_hours.manage');
    const current = MasterDataService.pick(
      await this.holidays(scope),
      id,
      'HOLIDAY_NOT_FOUND',
      'ບໍ່ພົບວັນພັກ',
    );

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      patch.name = MasterDataService.text(input.name, 'name', 2, 'ຊື່ວັນພັກສັ້ນເກີນໄປ');
    }
    if (input.holiday_date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.holiday_date)) {
        throw new ValidationError('VALIDATION_ERROR', 'ຮູບແບບວັນທີບໍ່ຖືກຕ້ອງ', [
          { field: 'holiday_date', message: 'ຕ້ອງເປັນ YYYY-MM-DD' },
        ]);
      }
      patch.holidayDate = input.holiday_date;
    }
    if (Object.keys(patch).length === 0) return current;

    try {
      await this.db.update(holiday).set(patch).where(eq(holiday.id, id));
    } catch (err) {
      throw MasterDataService.conflictError(
        err,
        'uq_holiday_company_date',
        'HOLIDAY_EXISTS',
        'ມີວັນພັກວັນທີນີ້ຢູ່ແລ້ວ',
      );
    }
    return MasterDataService.pick(
      await this.holidays(scope),
      id,
      'HOLIDAY_NOT_FOUND',
      'ບໍ່ພົບວັນພັກ',
    );
  }

  // ── เวลาทำการ ─────────────────────────────────────────────────────────────

  /**
   * แก้เวลาทำการรายวัน
   *
   * มีแต่แก้ ไม่มีสร้าง — seed วางไว้ครบ 7 วันต่อบริษัทอยู่แล้ว การเพิ่มแถว
   * ใหม่มีแต่จะชนคีย์ (company_id, day_of_week) ที่ unique อยู่
   */
  async updateBusinessHours(
    scope: AccessScope,
    id: number,
    input: { start_time?: string; end_time?: string; is_working_day?: boolean },
  ) {
    scope.require('business_hours.manage');
    const current = MasterDataService.pick(
      await this.businessHours(scope),
      id,
      'BUSINESS_HOURS_NOT_FOUND',
      'ບໍ່ພົບເວລາເຮັດວຽກ',
    );

    const time = (value: string, field: string): string => {
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
        throw new ValidationError('VALIDATION_ERROR', 'ຮູບແບບເວລາບໍ່ຖືກຕ້ອງ', [
          { field, message: 'ຕ້ອງເປັນ HH:MM' },
        ]);
      }
      return value.length === 5 ? `${value}:00` : value;
    };

    const patch: Record<string, unknown> = {};
    if (input.start_time !== undefined) patch.startTime = time(input.start_time, 'start_time');
    if (input.end_time !== undefined) patch.endTime = time(input.end_time, 'end_time');
    if (input.is_working_day !== undefined) patch.isWorkingDay = input.is_working_day;
    if (Object.keys(patch).length === 0) return current;

    /*
     * ฐานข้อมูลมี CHECK ว่า start_time < end_time อยู่แล้ว แต่ดักที่นี่ก่อน
     * เพื่อให้ได้ 422 พร้อมชื่อช่องที่ผิด แทน 500 ที่บอกแค่ชื่อ constraint
     */
    const start = (patch.startTime as string | undefined) ?? `${current.start_time}`;
    const end = (patch.endTime as string | undefined) ?? `${current.end_time}`;
    if (start >= end) {
      throw new ValidationError('VALIDATION_ERROR', 'ເວລາເລີ່ມຕ້ອງກ່ອນເວລາເລີກ', [
        { field: 'end_time', message: 'ຕ້ອງຫຼັງເວລາເລີ່ມ' },
      ]);
    }

    await this.db.update(businessHours).set(patch).where(eq(businessHours.id, id));
    return MasterDataService.pick(
      await this.businessHours(scope),
      id,
      'BUSINESS_HOURS_NOT_FOUND',
      'ບໍ່ພົບເວລາເຮັດວຽກ',
    );
  }

  // ── แม่แบบรายการตรวจ ──────────────────────────────────────────────────────

  async createChecklistTemplate(
    scope: AccessScope,
    input: {
      code: string;
      name_th: string;
      doc_ref?: string | null;
      company_id?: number | null;
      is_active?: boolean;
    },
  ) {
    scope.require('category.manage');
    const code = MasterDataService.codeOf(input.code);
    const nameTh = MasterDataService.text(input.name_th, 'name_th', 2, 'ຊື່ແມ່ແບບສັ້ນເກີນໄປ');
    const companyId = input.company_id ?? null;
    this.assertCanWrite(scope, companyId);

    try {
      const [row] = await this.db
        .insert(checklistTemplate)
        .values({
          companyId,
          code,
          nameTh,
          docRef: MasterDataService.optional(input.doc_ref),
          isActive: input.is_active ?? true,
        })
        .returning({ id: checklistTemplate.id });
      return MasterDataService.pick(
        await this.checklistTemplates(scope),
        row!.id,
        'CHECKLIST_TEMPLATE_NOT_FOUND',
        'ບໍ່ພົບແມ່ແບບ',
      );
    } catch (err) {
      throw MasterDataService.conflictError(
        err,
        'uq_checklist_template_company_code',
        'CHECKLIST_TEMPLATE_EXISTS',
        `ມີລະຫັດ ${code} ຢູ່ແລ້ວ`,
      );
    }
  }

  /**
   * แก้แม่แบบรายการตรวจ
   *
   * ⚠️ ไม่แตะ version ให้อัตโนมัติ — ticket เก่าอ้างเวอร์ชันเดิมผ่านสแนปช็อต
   *    การเลื่อนเวอร์ชันเป็นการตัดสินใจของผู้ดูแล ไม่ใช่ผลข้างเคียงของการแก้ชื่อ
   */
  async updateChecklistTemplate(
    scope: AccessScope,
    id: number,
    input: { name_th?: string; doc_ref?: string | null; version?: number; is_active?: boolean },
  ) {
    scope.require('category.manage');
    const current = MasterDataService.pick(
      await this.checklistTemplates(scope),
      id,
      'CHECKLIST_TEMPLATE_NOT_FOUND',
      'ບໍ່ພົບແມ່ແບບ',
    );

    const patch: Record<string, unknown> = {};
    if (input.name_th !== undefined) {
      patch.nameTh = MasterDataService.text(input.name_th, 'name_th', 2, 'ຊື່ແມ່ແບບສັ້ນເກີນໄປ');
    }
    if (input.doc_ref !== undefined) patch.docRef = MasterDataService.optional(input.doc_ref);
    if (input.version !== undefined) patch.version = input.version;
    if (input.is_active !== undefined) patch.isActive = input.is_active;
    if (Object.keys(patch).length === 0) return current;

    await this.db.update(checklistTemplate).set(patch).where(eq(checklistTemplate.id, id));
    return MasterDataService.pick(
      await this.checklistTemplates(scope),
      id,
      'CHECKLIST_TEMPLATE_NOT_FOUND',
      'ບໍ່ພົບແມ່ແບບ',
    );
  }

  /** เพิ่มรายการย่อยในแม่แบบ — ตรวจขอบเขตผ่านแม่แบบที่เป็นเจ้าของ */
  async createChecklistItem(
    scope: AccessScope,
    input: {
      template_id: number;
      title_th: string;
      description?: string | null;
      sort_order?: number;
      is_required?: boolean;
      evidence_required?: boolean;
    },
  ) {
    scope.require('category.manage');
    const template = MasterDataService.pick(
      await this.checklistTemplates(scope),
      Number(input.template_id),
      'CHECKLIST_TEMPLATE_NOT_FOUND',
      'ບໍ່ພົບແມ່ແບບ',
    );
    const titleTh = MasterDataService.text(input.title_th, 'title_th', 2, 'ຊື່ລາຍການສັ້ນເກີນໄປ');

    /*
     * ลำดับซ้ำไม่ได้ (unique template_id + sort_order) — เติมท้ายให้เองเมื่อ
     * ไม่ได้ระบุมา ไม่งั้นการเพิ่มรายการที่สองจะชนกับรายการแรกที่ลำดับ 0
     */
    const items = (template as { items?: { sort_order: number }[] }).items ?? [];
    const sortOrder =
      input.sort_order ?? items.reduce((max, i) => Math.max(max, i.sort_order), 0) + 10;

    try {
      await this.db.insert(checklistItem).values({
        templateId: template.id,
        titleTh,
        description: MasterDataService.optional(input.description),
        sortOrder,
        isRequired: input.is_required ?? true,
        evidenceRequired: input.evidence_required ?? false,
        isActive: true,
      });
    } catch (err) {
      throw MasterDataService.conflictError(
        err,
        'uq_checklist_item_template_order',
        'CHECKLIST_ITEM_ORDER_EXISTS',
        `ມີລາຍການລຳດັບ ${sortOrder} ຢູ່ແລ້ວ`,
      );
    }

    return MasterDataService.pick(
      await this.checklistTemplates(scope),
      template.id,
      'CHECKLIST_TEMPLATE_NOT_FOUND',
      'ບໍ່ພົບແມ່ແບບ',
    );
  }

  // ── รายการในแคตตาล็อกบริการ ───────────────────────────────────────────────

  /**
   * สร้างรายการแคตตาล็อก
   *
   * ฐานข้อมูลมี CHECK สองข้อที่ต้องดักไว้ก่อน ไม่งั้นผู้ใช้จะได้ 500
   * ที่บอกแค่ชื่อ constraint คือ
   *   · target_mode = duration ต้องมี target_minutes
   *   · requires_approval = true ต้องมี approval_chain
   */
  async createCatalogItem(
    scope: AccessScope,
    input: {
      code: string;
      name_th: string;
      category_id?: number | null;
      company_id?: number | null;
      default_impact?: string;
      default_urgency?: string;
      default_priority?: string;
      target_mode?: string;
      target_minutes?: number | null;
      clock_start_event?: string;
      requires_approval?: boolean;
      approval_chain?: string | null;
      checklist_template_id?: number | null;
      is_active?: boolean;
    },
  ) {
    scope.require('category.manage');
    const code = MasterDataService.codeOf(input.code);
    const nameTh = MasterDataService.text(input.name_th, 'name_th', 2, 'ຊື່ລາຍການສັ້ນເກີນໄປ');
    const targetMode = MasterDataService.oneOf(
      input.target_mode ?? 'duration',
      TARGET_MODE,
      'target_mode',
    );
    const clockStart = MasterDataService.oneOf(
      input.clock_start_event ?? 'on_create',
      CLOCK_START_EVENT,
      'clock_start_event',
    );
    const requiresApproval = input.requires_approval ?? false;
    const approvalChain = MasterDataService.optional(input.approval_chain);
    const targetMinutes = input.target_minutes ?? null;

    if (targetMode === 'duration' && targetMinutes === null) {
      throw new ValidationError('VALIDATION_ERROR', 'ຕ້ອງລະບຸເວລາເປົ້າໝາຍ', [
        { field: 'target_minutes', message: 'ຈຳເປັນເມື່ອໂໝດເປັນ duration' },
      ]);
    }
    if (requiresApproval && approvalChain === null) {
      throw new ValidationError('VALIDATION_ERROR', 'ຕ້ອງລະບຸລຳດັບຜູ້ອະນຸມັດ', [
        { field: 'approval_chain', message: 'ຈຳເປັນເມື່ອຕ້ອງຜ່ານການອະນຸມັດ' },
      ]);
    }

    const companyId = input.company_id ?? null;
    this.assertCanWrite(scope, companyId);

    try {
      const [row] = await this.db
        .insert(serviceCatalogItem)
        .values({
          companyId,
          code,
          nameTh,
          categoryId: input.category_id ?? null,
          defaultImpact: input.default_impact ?? 'individual',
          defaultUrgency: input.default_urgency ?? 'low',
          defaultPriority: input.default_priority ?? 'P4',
          targetMode,
          targetMinutes,
          clockStartEvent: clockStart,
          requiresApproval,
          approvalChain,
          checklistTemplateId: input.checklist_template_id ?? null,
          isActive: input.is_active ?? true,
        })
        .returning({ id: serviceCatalogItem.id });
      return MasterDataService.pick(
        await this.catalogItems(scope),
        row!.id,
        'CATALOG_ITEM_NOT_FOUND',
        'ບໍ່ພົບລາຍການ',
      );
    } catch (err) {
      throw MasterDataService.conflictError(
        err,
        'uq_catalog_item_company_code',
        'CATALOG_ITEM_CODE_EXISTS',
        `ມີລະຫັດ ${code} ຢູ່ແລ້ວ`,
      );
    }
  }

  async updateCatalogItem(
    scope: AccessScope,
    id: number,
    input: {
      name_th?: string;
      category_id?: number | null;
      default_impact?: string;
      default_urgency?: string;
      default_priority?: string;
      target_minutes?: number | null;
      requires_approval?: boolean;
      approval_chain?: string | null;
      checklist_template_id?: number | null;
      is_active?: boolean;
    },
  ) {
    scope.require('category.manage');
    const current = MasterDataService.pick(
      await this.catalogItems(scope),
      id,
      'CATALOG_ITEM_NOT_FOUND',
      'ບໍ່ພົບລາຍການ',
    );

    const patch: Record<string, unknown> = {};
    if (input.name_th !== undefined) {
      patch.nameTh = MasterDataService.text(input.name_th, 'name_th', 2, 'ຊື່ລາຍການສັ້ນເກີນໄປ');
    }
    if (input.category_id !== undefined) patch.categoryId = input.category_id;
    if (input.default_impact !== undefined) patch.defaultImpact = input.default_impact;
    if (input.default_urgency !== undefined) patch.defaultUrgency = input.default_urgency;
    if (input.default_priority !== undefined) patch.defaultPriority = input.default_priority;
    if (input.target_minutes !== undefined) patch.targetMinutes = input.target_minutes;
    if (input.requires_approval !== undefined) patch.requiresApproval = input.requires_approval;
    if (input.approval_chain !== undefined) {
      patch.approvalChain = MasterDataService.optional(input.approval_chain);
    }
    if (input.checklist_template_id !== undefined) {
      patch.checklistTemplateId = input.checklist_template_id;
    }
    if (input.is_active !== undefined) patch.isActive = input.is_active;
    if (Object.keys(patch).length === 0) return current;

    /*
     * ตรวจ CHECK ทั้งสองข้อกับ "ค่าหลังแก้" ไม่ใช่แค่ค่าที่ส่งมา
     * การเปิด requires_approval โดยไม่ส่ง approval_chain มาด้วย ต้องล้มที่นี่
     * ไม่ใช่ไปล้มที่ฐานข้อมูลด้วยข้อความที่อ่านไม่รู้เรื่อง
     */
    const nextRequiresApproval =
      (patch.requiresApproval as boolean | undefined) ?? current.requires_approval;
    const nextChain =
      input.approval_chain !== undefined
        ? (patch.approvalChain as string | null)
        : (current.approval_chain ?? null);
    if (nextRequiresApproval && nextChain === null) {
      throw new ValidationError('VALIDATION_ERROR', 'ຕ້ອງລະບຸລຳດັບຜູ້ອະນຸມັດ', [
        { field: 'approval_chain', message: 'ຈຳເປັນເມື່ອຕ້ອງຜ່ານການອະນຸມັດ' },
      ]);
    }
    const nextMinutes =
      input.target_minutes !== undefined
        ? (patch.targetMinutes as number | null)
        : (current.target_minutes ?? null);
    /*
     * target_mode ไม่ได้อยู่ในผลลัพธ์ที่หน้าจอใช้ จึงต้องอ่านจากตารางตรง ๆ
     * แก้ไม่ได้จากที่นี่อยู่แล้ว แต่ต้องรู้ค่าเพื่อตัดสินว่าจำเป็นต้องมีนาทีไหม
     */
    const [modeRow] = await this.db
      .select({ targetMode: serviceCatalogItem.targetMode })
      .from(serviceCatalogItem)
      .where(eq(serviceCatalogItem.id, id));
    if (modeRow?.targetMode === 'duration' && nextMinutes === null) {
      throw new ValidationError('VALIDATION_ERROR', 'ຕ້ອງລະບຸເວລາເປົ້າໝາຍ', [
        { field: 'target_minutes', message: 'ຈຳເປັນເມື່ອໂໝດເປັນ duration' },
      ]);
    }

    await this.db.update(serviceCatalogItem).set(patch).where(eq(serviceCatalogItem.id, id));
    return MasterDataService.pick(
      await this.catalogItems(scope),
      id,
      'CATALOG_ITEM_NOT_FOUND',
      'ບໍ່ພົບລາຍການ',
    );
  }

  // ── กฎการยกระดับ ──────────────────────────────────────────────────────────

  async createEscalationRule(
    scope: AccessScope,
    input: {
      code: string;
      trigger_type: string;
      notify_contact_keys: string;
      company_id?: number | null;
      priority?: string | null;
      threshold_minutes?: number | null;
      threshold_clock_mode?: string;
      notify_roles?: string | null;
      repeat_interval_minutes?: number | null;
      notify_outside_business_hours?: boolean;
      is_active?: boolean;
    },
  ) {
    scope.require('escalation.manage');
    const code = MasterDataService.codeOf(input.code);
    const triggerType = MasterDataService.text(
      input.trigger_type,
      'trigger_type',
      2,
      'ຕ້ອງລະບຸເງື່ອນໄຂກະຕຸ້ນ',
    );
    const notifyContactKeys = MasterDataService.text(
      input.notify_contact_keys,
      'notify_contact_keys',
      2,
      'ຕ້ອງລະບຸຜູ້ຮັບການແຈ້ງ',
    );
    const companyId = input.company_id ?? null;
    this.assertCanWrite(scope, companyId);

    try {
      const [row] = await this.db
        .insert(slaEscalationRule)
        .values({
          companyId,
          code,
          triggerType,
          priority: MasterDataService.optional(input.priority),
          thresholdMinutes: input.threshold_minutes ?? null,
          thresholdClockMode: input.threshold_clock_mode ?? 'business_hours',
          notifyContactKeys,
          notifyRoles: MasterDataService.optional(input.notify_roles),
          repeatIntervalMinutes: input.repeat_interval_minutes ?? null,
          notifyOutsideBusinessHours: input.notify_outside_business_hours ?? false,
          isActive: input.is_active ?? true,
        })
        .returning({ id: slaEscalationRule.id });
      return MasterDataService.pick(
        await this.escalationRules(scope),
        row!.id,
        'ESCALATION_RULE_NOT_FOUND',
        'ບໍ່ພົບກົດການຍົກລະດັບ',
      );
    } catch (err) {
      throw MasterDataService.conflictError(
        err,
        'uq_escalation_rule_company_code',
        'ESCALATION_RULE_CODE_EXISTS',
        `ມີລະຫັດ ${code} ຢູ່ແລ້ວ`,
      );
    }
  }

  async updateEscalationRule(
    scope: AccessScope,
    id: number,
    input: {
      trigger_type?: string;
      priority?: string | null;
      threshold_minutes?: number | null;
      threshold_clock_mode?: string;
      notify_contact_keys?: string;
      notify_roles?: string | null;
      repeat_interval_minutes?: number | null;
      notify_outside_business_hours?: boolean;
      is_active?: boolean;
    },
  ) {
    scope.require('escalation.manage');
    const current = MasterDataService.pick(
      await this.escalationRules(scope),
      id,
      'ESCALATION_RULE_NOT_FOUND',
      'ບໍ່ພົບກົດການຍົກລະດັບ',
    );

    const patch: Record<string, unknown> = {};
    if (input.trigger_type !== undefined) {
      patch.triggerType = MasterDataService.text(
        input.trigger_type,
        'trigger_type',
        2,
        'ຕ້ອງລະບຸເງື່ອນໄຂກະຕຸ້ນ',
      );
    }
    if (input.priority !== undefined) patch.priority = MasterDataService.optional(input.priority);
    if (input.threshold_minutes !== undefined) patch.thresholdMinutes = input.threshold_minutes;
    if (input.threshold_clock_mode !== undefined) {
      patch.thresholdClockMode = input.threshold_clock_mode;
    }
    if (input.notify_contact_keys !== undefined) {
      patch.notifyContactKeys = MasterDataService.text(
        input.notify_contact_keys,
        'notify_contact_keys',
        2,
        'ຕ້ອງລະບຸຜູ້ຮັບການແຈ້ງ',
      );
    }
    if (input.notify_roles !== undefined) {
      patch.notifyRoles = MasterDataService.optional(input.notify_roles);
    }
    if (input.repeat_interval_minutes !== undefined) {
      patch.repeatIntervalMinutes = input.repeat_interval_minutes;
    }
    if (input.notify_outside_business_hours !== undefined) {
      patch.notifyOutsideBusinessHours = input.notify_outside_business_hours;
    }
    if (input.is_active !== undefined) patch.isActive = input.is_active;
    if (Object.keys(patch).length === 0) return current;

    await this.db.update(slaEscalationRule).set(patch).where(eq(slaEscalationRule.id, id));
    return MasterDataService.pick(
      await this.escalationRules(scope),
      id,
      'ESCALATION_RULE_NOT_FOUND',
      'ບໍ່ພົບກົດການຍົກລະດັບ',
    );
  }

}