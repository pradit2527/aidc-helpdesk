import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import { MasterDataService } from './master-data.service';

/**
 * ข้อมูลหลักสำหรับหน้าผู้ดูแล — อ่านอย่างเดียว
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
      'บางหน้าต้องการรายการแบนสำหรับตัวเลือกในฟอร์ม บางหน้าต้องการต้นไม้',
  })
  categories(@CurrentScope() scope: AccessScope) {
    // ทุกคนที่แจ้งเรื่องได้ต้องเห็นหมวดหมู่ ไม่งั้นเลือกตอนแจ้งไม่ได้
    scope.require('ticket.create', 'category.manage');
    return this.master.categories(scope);
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
}
