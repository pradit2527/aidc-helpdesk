import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import { MasterDataService } from './master-data.service';

/**
 * ข้อมูลหลักสำหรับหน้าผู้ดูแล — อ่านและเขียน
 *
 * ทุก endpoint กรองตามขอบเขตบริษัทของผู้เรียก ยกเว้นบทบาทและสิทธิ์
 * ที่ใช้ร่วมกันทั้งกลุ่มบริษัทจึงไม่มีขอบเขต
 *
 * สิทธิ์ที่ต้องมีแยกตามหัวข้อ ไม่ใช่ใช้ system.manage รวบทุกอัน
 * เพื่อให้มอบสิทธิ์ดูแลเฉพาะด้านได้ เช่น คนที่ดูแลปฏิทินเวลาทำการ
 * ไม่จำเป็นต้องเห็นบทบาทและสิทธิ์ของทุกคนในระบบ
 */
@ApiTags('Master data')
@Controller()
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class MasterDataController {
  constructor(private readonly master: MasterDataService) {}

  @Get('companies')
  @ApiOperation({ summary: 'บริษัทในกลุ่ม (เฉพาะที่อยู่ในขอบเขต)' })
  companies(@CurrentScope() scope: AccessScope) {
    scope.require('company.manage', 'user.read', 'dashboard.view');
    return this.master.companies(scope);
  }

  @Get('departments')
  @ApiOperation({ summary: 'แผนกทั้งหมดในขอบเขต' })
  departments(@CurrentScope() scope: AccessScope) {
    scope.require('department.manage', 'user.read');
    return this.master.departments(scope);
  }

  @Get('categories')
  @ApiOperation({
    summary: 'หมวดหมู่ปัญหา',
    description:
      'คืนแบนราบพร้อม `parent_id` ให้หน้าจอประกอบเป็นต้นไม้เอง — ' +
      'บางหน้าต้องการรายการแบนสำหรับตัวเลือกในฟอร์ม บางหน้าต้องการต้นไม้ · ' +
      '`active_only=true` สำหรับฟอร์มแจ้งเรื่องใหม่ ที่ต้องไม่เสนอหมวดที่ปิดไปแล้ว ' +
      '· ค่าเริ่มต้นคืนทั้งหมด เพราะหน้าผู้ดูแลต้องเห็นหมวดที่ปิดเพื่อเปิดกลับได้',
  })
  @ApiQuery({ name: 'active_only', required: false, enum: ['true', 'false'] })
  categories(@CurrentScope() scope: AccessScope, @Query('active_only') activeOnly?: string) {
    // ทุกคนที่แจ้งเรื่องได้ต้องเห็นหมวดหมู่ ไม่งั้นเลือกตอนแจ้งไม่ได้
    scope.require('ticket.create', 'category.manage');
    return this.master.categories(scope, activeOnly === 'true');
  }

  @Get('catalog-items')
  @ApiOperation({ summary: 'รายการในแคตตาล็อกบริการ' })
  catalogItems(@CurrentScope() scope: AccessScope) {
    scope.require('ticket.create', 'category.manage');
    return this.master.catalogItems(scope);
  }

  @Get('services')
  @ApiOperation({ summary: 'ทะเบียนระบบงาน' })
  services(@CurrentScope() scope: AccessScope) {
    scope.require('service.manage', 'ticket.read');
    return this.master.services(scope);
  }

  @Get('approved-software')
  @ApiOperation({ summary: 'ซอฟต์แวร์ที่อนุมัติให้ติดตั้ง' })
  approvedSoftware(@CurrentScope() scope: AccessScope) {
    scope.require('service.manage', 'ticket.read');
    return this.master.approvedSoftwareList(scope);
  }

  @Get('sla-policies')
  @ApiOperation({
    summary: 'นโยบาย SLA พร้อมเป้าหมายรายระดับความสำคัญ',
    description: 'เป้าหมายฝังมาใน `targets` ของแต่ละนโยบาย ไม่ต้องเรียกซ้ำ',
  })
  slaPolicies(@CurrentScope() scope: AccessScope) {
    scope.require('sla.read', 'sla.manage');
    return this.master.slaPolicies(scope);
  }

  @Get('business-hours')
  @ApiOperation({ summary: 'เวลาทำการรายบริษัท' })
  businessHours(@CurrentScope() scope: AccessScope) {
    scope.require('business_hours.manage', 'sla.read');
    return this.master.businessHours(scope);
  }

  @Get('holidays')
  @ApiOperation({
    summary: 'วันหยุด',
    description:
      '⚠️ ตารางนี้ยังว่าง — ปฏิทินวันหยุดราชการลาวเป็นข้อค้างที่รอองค์กร (Q-03) ' +
      'ตราบใดที่ยังว่าง เครื่องคำนวณ SLA จะนับวันหยุดเป็นวันทำการ ' +
      'ทำให้กำหนดเวลาที่คำนวณได้เร็วกว่าความจริง',
  })
  holidays(@CurrentScope() scope: AccessScope) {
    scope.require('business_hours.manage', 'sla.read');
    return this.master.holidays(scope);
  }

  @Get('escalation-rules')
  @ApiOperation({ summary: 'กฎการยกระดับเมื่อใกล้หรือเกินกำหนด' })
  escalationRules(@CurrentScope() scope: AccessScope) {
    scope.require('escalation.manage', 'sla.read');
    return this.master.escalationRules(scope);
  }

  @Get('escalation-contacts')
  @ApiOperation({
    summary: 'ผู้รับการยกระดับตามตำแหน่ง',
    description:
      'เชื่อม `contact_key` ที่กฎยกระดับอ้างถึงเข้ากับคนจริง · ' +
      'แถวที่ `company_id` เป็น null คือผู้รับระดับกลุ่ม ใช้เป็นตัวสำรอง ' +
      'ให้บริษัทที่ยังไม่ได้กำหนดคนของตัวเอง',
  })
  escalationContacts(@CurrentScope() scope: AccessScope) {
    scope.require('escalation.manage', 'sla.read');
    return this.master.escalationContacts(scope);
  }

  @Get('service-outages')
  @ApiOperation({
    summary: 'เหตุขัดข้องของระบบงาน (200 รายการล่าสุด)',
    description:
      'ตัวตั้งของ KPI-6 Uptime · `is_ongoing: true` แปลว่ายังขัดข้องอยู่ ' +
      'ไม่ใช่ข้อมูลไม่ครบ · `is_planned: true` ไม่นับเข้า Downtime ตาม SLA 5.2',
  })
  serviceOutages(@CurrentScope() scope: AccessScope) {
    scope.require('service.manage', 'sla.read');
    return this.master.serviceOutages(scope);
  }

  @Get('maintenance-windows')
  @ApiOperation({
    summary: 'หน้าต่างบำรุงรักษาที่วางแผนไว้ (200 รายการล่าสุด)',
    description:
      '`is_notified: false` คือหน้าต่างที่ยังไม่ได้แจ้งผู้ใช้ — SLA 3.1 บังคับให้แจ้ง ' +
      'ล่วงหน้าตาม `notice_lead_business_days` การบำรุงรักษาที่ไม่ได้แจ้ง ' +
      'นับเป็น downtime เต็มจำนวน',
  })
  maintenanceWindows(@CurrentScope() scope: AccessScope) {
    scope.require('service.manage', 'sla.read');
    return this.master.maintenanceWindows(scope);
  }

  @Get('checklist-templates')
  @ApiOperation({ summary: 'แม่แบบรายการตรวจ พร้อมรายการย่อย' })
  checklistTemplates(@CurrentScope() scope: AccessScope) {
    scope.require('checklist.update', 'category.manage');
    return this.master.checklistTemplates(scope);
  }

  @Get('roles')
  @ApiOperation({
    summary: 'บทบาทพร้อมรหัสสิทธิ์ที่ผูกไว้',
    description:
      '⚠️ `approval.decide` ไม่เคยปรากฏในบทบาทใด โดยตั้งใจ — ' +
      'สิทธิ์อนุมัติมาจากการเป็นผู้อนุมัติของคำขอนั้นโดยตรง ไม่ใช่จากบทบาท ' +
      'มิฉะนั้นทุกคนในบทบาทนั้นจะอนุมัติคำขอของใครก็ได้',
  })
  roles(@CurrentScope() scope: AccessScope) {
    scope.require('role.read', 'role.manage');
    return this.master.roles();
  }

  @Get('permissions')
  @ApiOperation({ summary: 'รายการสิทธิ์ทั้งหมดในระบบ' })
  permissions(@CurrentScope() scope: AccessScope) {
    scope.require('role.read', 'role.manage');
    return this.master.permissions();
  }

  @Post('categories')
  @ApiOperation({
    summary: 'สร้างหมวดหมู่ปัญหา',
    description:
      '`code` เป็นตัวระบุถาวร แก้ไม่ได้หลังสร้าง — รายงานย้อนหลัง กฎ routing ' +
      'และการนำเข้าข้อมูลอ้างถึง code ไม่ใช่ id การเปลี่ยนภายหลังทำให้ของเหล่านั้น ' +
      'ชี้ผิดโดยไม่มีอะไรฟ้อง · `company_id: null` = หมวดระดับกลุ่ม ' +
      'ซึ่งมีแต่ super_admin สร้างได้',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code', 'name_th'],
      properties: {
        code: { type: 'string', example: 'AI_TOOLS', description: 'A–Z, 0–9, _ ยาว 2–40' },
        name_th: { type: 'string', example: 'ຂໍສິດໃຊ້ເຄື່ອງມື AI' },
        company_id: { type: 'number', nullable: true, description: 'null = ระดับกลุ่ม' },
        default_impact: { type: 'string', enum: ['org_wide', 'department', 'individual'] },
        default_urgency: { type: 'string', enum: ['high', 'medium', 'low'] },
        sort_order: { type: 'number', example: 110 },
        is_active: { type: 'boolean', example: true },
      },
    },
  })
  createCategory(
    @CurrentScope() scope: AccessScope,
    @Body()
    body: {
      code: string;
      name_th: string;
      company_id?: number | null;
      default_impact?: string;
      default_urgency?: string;
      sort_order?: number;
      is_active?: boolean;
    },
  ) {
    return this.master.createCategory(scope, body);
  }

  @Patch('categories/:id')
  @ApiOperation({
    summary: 'แก้ไขหมวดหมู่ปัญหา',
    description:
      '**ไม่มี endpoint ลบโดยตั้งใจ** — ปิดด้วย `is_active: false` เท่านั้น · ' +
      'ticket เก่าอ้างถึง `category_id` อยู่ ถ้าลบแถวไป ประวัติจะชี้ไปที่ความว่างเปล่า ' +
      'และรายงานย้อนหลังจะนับหมวดนั้นไม่ได้อีกเลย · ' +
      '`code` แก้ไม่ได้ด้วยเหตุผลเดียวกับตอนสร้าง',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name_th: { type: 'string' },
        default_impact: { type: 'string', enum: ['org_wide', 'department', 'individual'] },
        default_urgency: { type: 'string', enum: ['high', 'medium', 'low'] },
        sort_order: { type: 'number' },
        is_active: { type: 'boolean' },
      },
    },
  })
  updateCategory(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name_th?: string;
      default_impact?: string;
      default_urgency?: string;
      sort_order?: number;
      is_active?: boolean;
    },
  ) {
    return this.master.updateCategory(scope, id, body);
  }


  /* ══════════════════════════════════════════════════════════════════════════
   * การเขียนข้อมูลหลัก
   *
   * **ไม่มี endpoint ลบสักตัวโดยตั้งใจ** — ปิดด้วย `is_active: false` เท่านั้น
   * ticket และรายงานย้อนหลังอ้างถึงแถวเหล่านี้ด้วย id การลบทำให้ประวัติชี้ไป
   * ที่ความว่างเปล่า
   *
   * `company_id: null` = ระดับกลุ่ม ซึ่งมีแต่ super_admin สร้างได้
   * แถวนอกขอบเขตตอบ 404 ไม่ใช่ 403
   * ══════════════════════════════════════════════════════════════════════════ */

  @Post('companies')
  @ApiOperation({
    summary: 'เพิ่มบริษัทในกลุ่ม',
    description: 'เฉพาะ super_admin — การเพิ่มบริษัทเปลี่ยนรูปของทั้งกลุ่ม',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code', 'name_th'],
      properties: {
        code: { type: 'string', example: 'AIDC-NEW' },
        name_th: { type: 'string', example: 'AIDC New Co' },
        name_en: { type: 'string', nullable: true },
        contact_email: { type: 'string', nullable: true },
        is_active: { type: 'boolean' },
      },
    },
  })
  createCompany(
    @CurrentScope() scope: AccessScope,
    @Body()
    body: {
      code: string;
      name_th: string;
      name_en?: string | null;
      contact_email?: string | null;
      is_active?: boolean;
    },
  ) {
    return this.master.createCompany(scope, body);
  }

  @Patch('companies/:id')
  @ApiOperation({ summary: 'แก้ไขบริษัท', description: '`code` แก้ไม่ได้หลังสร้าง' })
  updateCompany(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name_th?: string;
      name_en?: string | null;
      contact_email?: string | null;
      is_active?: boolean;
    },
  ) {
    return this.master.updateCompany(scope, id, body);
  }

  @Post('departments')
  @ApiOperation({
    summary: 'เพิ่มแผนก',
    description: '`company_id` บังคับ — ไม่มีแนวคิดแผนกระดับกลุ่ม',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['company_id', 'name'],
      properties: {
        company_id: { type: 'number', example: 1 },
        name: { type: 'string', example: 'ໄອທີ' },
        is_active: { type: 'boolean' },
      },
    },
  })
  createDepartment(
    @CurrentScope() scope: AccessScope,
    @Body() body: { company_id: number; name: string; is_active?: boolean },
  ) {
    return this.master.createDepartment(scope, body);
  }

  @Patch('departments/:id')
  @ApiOperation({ summary: 'แก้ไขแผนก' })
  updateDepartment(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; is_active?: boolean },
  ) {
    return this.master.updateDepartment(scope, id, body);
  }

  @Post('services')
  @ApiOperation({ summary: 'เพิ่มระบบงานในทะเบียน' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code', 'name_th', 'service_group'],
      properties: {
        code: { type: 'string', example: 'SRV_ERP' },
        name_th: { type: 'string' },
        service_group: {
          type: 'string',
          enum: [
            'core_business',
            'infrastructure',
            'communication',
            'file_storage',
            'endpoint',
            'service_request',
          ],
        },
        service_tier: { type: 'string', enum: ['critical', 'high', 'standard'] },
        company_id: { type: 'number', nullable: true },
        owner_user_id: { type: 'number', nullable: true, description: 'System Owner' },
        is_24x7: { type: 'boolean' },
        is_active: { type: 'boolean' },
      },
    },
  })
  createService(
    @CurrentScope() scope: AccessScope,
    @Body()
    body: {
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
    return this.master.createService(scope, body);
  }

  @Patch('services/:id')
  @ApiOperation({ summary: 'แก้ไขระบบงาน' })
  updateService(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name_th?: string;
      service_group?: string;
      service_tier?: string;
      owner_user_id?: number | null;
      is_24x7?: boolean;
      is_active?: boolean;
    },
  ) {
    return this.master.updateService(scope, id, body);
  }

  @Post('approved-software')
  @ApiOperation({ summary: 'เพิ่มซอฟต์แวร์ที่อนุมัติให้ติดตั้ง' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: 'Google Chrome' },
        version: { type: 'string', nullable: true },
        license_type: { type: 'string', nullable: true, example: 'freeware' },
        note: { type: 'string', nullable: true },
        company_id: { type: 'number', nullable: true },
        is_active: { type: 'boolean' },
      },
    },
  })
  createApprovedSoftware(
    @CurrentScope() scope: AccessScope,
    @Body()
    body: {
      name: string;
      version?: string | null;
      license_type?: string | null;
      note?: string | null;
      company_id?: number | null;
      is_active?: boolean;
    },
  ) {
    return this.master.createApprovedSoftware(scope, body);
  }

  @Patch('approved-software/:id')
  @ApiOperation({ summary: 'แก้ไขซอฟต์แวร์ที่อนุมัติ' })
  updateApprovedSoftware(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name?: string;
      version?: string | null;
      license_type?: string | null;
      note?: string | null;
      is_active?: boolean;
    },
  ) {
    return this.master.updateApprovedSoftware(scope, id, body);
  }

  @Post('holidays')
  @ApiOperation({
    summary: 'เพิ่มวันหยุด',
    description:
      'ตารางวันหยุดว่างมาตลอด (Q-03) ตราบใดที่ยังว่าง เครื่องคำนวณ SLA จะนับ ' +
      'วันหยุดเป็นวันทำการ ทำให้กำหนดเวลาที่ได้เร็วกว่าความจริง',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['holiday_date', 'name'],
      properties: {
        holiday_date: { type: 'string', example: '2026-12-02', description: 'YYYY-MM-DD' },
        name: { type: 'string', example: 'ວັນຊາດ' },
        company_id: { type: 'number', nullable: true, description: 'null = ทั้งกลุ่ม' },
      },
    },
  })
  createHoliday(
    @CurrentScope() scope: AccessScope,
    @Body() body: { holiday_date: string; name: string; company_id?: number | null },
  ) {
    return this.master.createHoliday(scope, body);
  }

  @Patch('holidays/:id')
  @ApiOperation({ summary: 'แก้ไขวันหยุด' })
  updateHoliday(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; holiday_date?: string },
  ) {
    return this.master.updateHoliday(scope, id, body);
  }

  @Patch('business-hours/:id')
  @ApiOperation({
    summary: 'แก้ไขเวลาทำการรายวัน',
    description: 'ไม่มี POST — seed วางไว้ครบ 7 วันต่อบริษัทแล้ว',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        start_time: { type: 'string', example: '08:30' },
        end_time: { type: 'string', example: '17:30' },
        is_working_day: { type: 'boolean' },
      },
    },
  })
  updateBusinessHours(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { start_time?: string; end_time?: string; is_working_day?: boolean },
  ) {
    return this.master.updateBusinessHours(scope, id, body);
  }

  @Post('checklist-templates')
  @ApiOperation({ summary: 'เพิ่มแม่แบบรายการตรวจ' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code', 'name_th'],
      properties: {
        code: { type: 'string', example: 'SOP04_ONBOARD' },
        name_th: { type: 'string' },
        doc_ref: { type: 'string', nullable: true, example: 'AIDC-IT-SOP-001 ກ.1' },
        company_id: { type: 'number', nullable: true },
        is_active: { type: 'boolean' },
      },
    },
  })
  createChecklistTemplate(
    @CurrentScope() scope: AccessScope,
    @Body()
    body: {
      code: string;
      name_th: string;
      doc_ref?: string | null;
      company_id?: number | null;
      is_active?: boolean;
    },
  ) {
    return this.master.createChecklistTemplate(scope, body);
  }

  @Patch('checklist-templates/:id')
  @ApiOperation({
    summary: 'แก้ไขแม่แบบรายการตรวจ',
    description: 'ไม่เลื่อน `version` ให้อัตโนมัติ — ticket เก่าอ้างเวอร์ชันเดิมผ่านสแนปช็อต',
  })
  updateChecklistTemplate(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: { name_th?: string; doc_ref?: string | null; version?: number; is_active?: boolean },
  ) {
    return this.master.updateChecklistTemplate(scope, id, body);
  }

  @Post('checklist-items')
  @ApiOperation({
    summary: 'เพิ่มรายการย่อยในแม่แบบ',
    description: 'คืนแม่แบบทั้งอันพร้อมรายการย่อยที่อัปเดตแล้ว · ไม่ส่ง `sort_order` = ต่อท้ายให้เอง',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['template_id', 'title_th'],
      properties: {
        template_id: { type: 'number' },
        title_th: { type: 'string' },
        description: { type: 'string', nullable: true },
        sort_order: { type: 'number' },
        is_required: { type: 'boolean', description: 'true = บล็อกการปิดงานถ้ายังไม่ติ๊ก' },
        evidence_required: { type: 'boolean', description: 'true = ต้องแนบหลักฐานก่อนติ๊ก' },
      },
    },
  })
  createChecklistItem(
    @CurrentScope() scope: AccessScope,
    @Body()
    body: {
      template_id: number;
      title_th: string;
      description?: string | null;
      sort_order?: number;
      is_required?: boolean;
      evidence_required?: boolean;
    },
  ) {
    return this.master.createChecklistItem(scope, body);
  }

  @Post('catalog-items')
  @ApiOperation({
    summary: 'เพิ่มรายการในแคตตาล็อกบริการ',
    description:
      '`target_mode: duration` ต้องมี `target_minutes` · ' +
      '`requires_approval: true` ต้องมี `approval_chain` — สองข้อนี้ฐานข้อมูลบังคับอยู่',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code', 'name_th'],
      properties: {
        code: { type: 'string', example: 'REQ_PWD_RESET' },
        name_th: { type: 'string' },
        category_id: { type: 'number', nullable: true },
        company_id: { type: 'number', nullable: true },
        default_impact: { type: 'string', enum: ['org_wide', 'department', 'individual'] },
        default_urgency: { type: 'string', enum: ['high', 'medium', 'low'] },
        default_priority: { type: 'string', example: 'P4' },
        target_mode: { type: 'string', enum: ['duration', 'before_date', 'by_date'] },
        target_minutes: { type: 'number', nullable: true, description: 'นาทีทำการ' },
        clock_start_event: {
          type: 'string',
          enum: [
            'on_create',
            'after_identity_verified',
            'after_approval',
            'after_budget_approval',
          ],
        },
        requires_approval: { type: 'boolean' },
        approval_chain: {
          type: 'string',
          nullable: true,
          example: 'line_manager,system_owner',
        },
        checklist_template_id: { type: 'number', nullable: true },
        is_active: { type: 'boolean' },
      },
    },
  })
  createCatalogItem(
    @CurrentScope() scope: AccessScope,
    @Body()
    body: {
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
    return this.master.createCatalogItem(scope, body);
  }

  @Patch('catalog-items/:id')
  @ApiOperation({ summary: 'แก้ไขรายการในแคตตาล็อกบริการ' })
  updateCatalogItem(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
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
    return this.master.updateCatalogItem(scope, id, body);
  }

  @Post('escalation-rules')
  @ApiOperation({
    summary: 'เพิ่มกฎการยกระดับ',
    description:
      'กฎ ES-01…ES-12 เก็บในตารางไม่ hard-code เพราะเอกสาร SLA ทบทวนทุก 12 เดือน · ' +
      '`notify_contact_keys` คั่นด้วย , เช่น `head_of_it,incident_manager`',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code', 'trigger_type', 'notify_contact_keys'],
      properties: {
        code: { type: 'string', example: 'ES_13' },
        trigger_type: { type: 'string', example: 'resolution_breach' },
        notify_contact_keys: { type: 'string', example: 'head_of_it,incident_manager' },
        company_id: { type: 'number', nullable: true },
        priority: { type: 'string', nullable: true, example: 'P1' },
        threshold_minutes: { type: 'number', nullable: true },
        threshold_clock_mode: { type: 'string', example: 'business_hours' },
        notify_roles: { type: 'string', nullable: true },
        repeat_interval_minutes: { type: 'number', nullable: true },
        notify_outside_business_hours: { type: 'boolean' },
        is_active: { type: 'boolean' },
      },
    },
  })
  createEscalationRule(
    @CurrentScope() scope: AccessScope,
    @Body()
    body: {
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
    return this.master.createEscalationRule(scope, body);
  }

  @Patch('escalation-rules/:id')
  @ApiOperation({ summary: 'แก้ไขกฎการยกระดับ' })
  updateEscalationRule(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
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
    return this.master.updateEscalationRule(scope, id, body);
  }

}