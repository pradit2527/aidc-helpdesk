import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import type { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import {
  approvedSoftware,
  businessHours,
  checklistItem,
  checklistTemplate,
  company,
  department,
  holiday,
  permission,
  role,
  rolePermission,
  service,
  serviceCatalogItem,
  slaEscalationRule,
  slaPolicy,
  slaTarget,
  ticketCategory,
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

  async companies(scope: AccessScope) {
    return this.db
      .select({
        id: company.id,
        code: company.code,
        name_th: company.nameTh,
        name_en: company.nameEn,
        contact_email: company.contactEmail,
        is_active: company.isActive,
      })
      .from(company)
      .where(this.companyScope(scope, company.id))
      .orderBy(asc(company.code));
  }

  async departments(scope: AccessScope) {
    return this.db
      .select({
        id: department.id,
        name: department.name,
        company_id: department.companyId,
        company_code: company.code,
        is_active: department.isActive,
      })
      .from(department)
      .innerJoin(company, eq(company.id, department.companyId))
      .where(this.companyScope(scope, department.companyId))
      .orderBy(asc(company.code), asc(department.name));
  }

  /**
   * หมวดหมู่ปัญหา — เป็นโครงต้นไม้สองชั้น
   *
   * คืนแบนราบพร้อม parent_id ให้หน้าจอประกอบเอง แทนการซ้อนเป็นต้นไม้
   * เพราะบางหน้าต้องการรายการแบน (ตัวเลือกในฟอร์ม) บางหน้าต้องการต้นไม้
   * การคืนแบนราบทำได้ทั้งสองแบบ ส่วนต้นไม้ทำให้แบนกลับยาก
   */
  async categories(scope: AccessScope) {
    return this.db
      .select({
        id: ticketCategory.id,
        code: ticketCategory.code,
        name_th: ticketCategory.nameTh,
        parent_id: ticketCategory.parentId,
        default_impact: ticketCategory.defaultImpact,
        default_urgency: ticketCategory.defaultUrgency,
        sort_order: ticketCategory.sortOrder,
        is_active: ticketCategory.isActive,
      })
      .from(ticketCategory)
      .where(this.companyScope(scope, ticketCategory.companyId))
      .orderBy(asc(ticketCategory.sortOrder), asc(ticketCategory.nameTh));
  }

  async catalogItems(scope: AccessScope) {
    return this.db
      .select({
        id: serviceCatalogItem.id,
        code: serviceCatalogItem.code,
        name_th: serviceCatalogItem.nameTh,
        category_id: serviceCatalogItem.categoryId,
        requires_approval: serviceCatalogItem.requiresApproval,
        lead_time_days: serviceCatalogItem.leadTimeDays,
        target_minutes: serviceCatalogItem.targetMinutes,
        is_active: serviceCatalogItem.isActive,
      })
      .from(serviceCatalogItem)
      .where(this.companyScope(scope, serviceCatalogItem.companyId))
      .orderBy(asc(serviceCatalogItem.nameTh));
  }

  async services(scope: AccessScope) {
    return this.db
      .select({
        id: service.id,
        code: service.code,
        name_th: service.nameTh,
        service_group: service.serviceGroup,
        service_tier: service.serviceTier,
        is_active: service.isActive,
      })
      .from(service)
      .where(this.companyScope(scope, service.companyId))
      .orderBy(asc(service.serviceTier), asc(service.nameTh));
  }

  async approvedSoftwareList(scope: AccessScope) {
    return this.db
      .select({
        id: approvedSoftware.id,
        name: approvedSoftware.name,
        version: approvedSoftware.version,
        license_type: approvedSoftware.licenseType,
        note: approvedSoftware.note,
        is_active: approvedSoftware.isActive,
      })
      .from(approvedSoftware)
      .where(this.companyScope(scope, approvedSoftware.companyId))
      .orderBy(asc(approvedSoftware.name));
  }

  /** นโยบาย SLA พร้อมเป้าหมายรายระดับความสำคัญ */
  async slaPolicies(scope: AccessScope) {
    const policies = await this.db
      .select({
        id: slaPolicy.id,
        name: slaPolicy.name,
        company_id: slaPolicy.companyId,
        doc_ref: slaPolicy.docRef,
        doc_version: slaPolicy.docVersion,
        is_default: slaPolicy.isDefault,
        is_active: slaPolicy.isActive,
      })
      .from(slaPolicy)
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
        escalation_percent: slaTarget.escalationPercent,
      })
      .from(slaTarget)
      .where(
        inArray(
          slaTarget.slaPolicyId,
          policies.map((p) => p.id),
        ),
      );

    return policies.map((p) => ({
      ...p,
      targets: targets.filter((t) => t.policy_id === p.id),
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
        date: holiday.holidayDate,
        name: holiday.name,
      })
      .from(holiday)
      .where(this.companyScope(scope, holiday.companyId))
      .orderBy(asc(holiday.holidayDate));
  }

  async escalationRules(scope: AccessScope) {
    return this.db
      .select({
        id: slaEscalationRule.id,
        code: slaEscalationRule.code,
        company_id: slaEscalationRule.companyId,
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
      .where(this.companyScope(scope, slaEscalationRule.companyId))
      .orderBy(asc(slaEscalationRule.priority), asc(slaEscalationRule.thresholdMinutes));
  }

  /** แม่แบบรายการตรวจ พร้อมรายการย่อย */
  async checklistTemplates(scope: AccessScope) {
    const templates = await this.db
      .select({
        id: checklistTemplate.id,
        code: checklistTemplate.code,
        name_th: checklistTemplate.nameTh,
        doc_ref: checklistTemplate.docRef,
        version: checklistTemplate.version,
        is_active: checklistTemplate.isActive,
      })
      .from(checklistTemplate)
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

    return templates.map((t) => ({
      ...t,
      items: items.filter((i) => i.template_id === t.id),
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
}
