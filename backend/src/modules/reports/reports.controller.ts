import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('kpi')
  @ApiOperation({
    summary: 'KPI-1…KPI-7 เทียบเป้าหมาย (SLA 7.1)',
    description:
      '`value: null` แปลว่าตัวหารเป็นศูนย์ — ยังไม่มีข้อมูลพอวัด ไม่ใช่ 0% หรือ 100% · ' +
      'KPI-2 อยู่แยกใน `kpi2_first_response` เพราะแยกราย priority เสมอ ' +
      '(P1 นับนาทีปฏิทิน P2–P4 นับนาทีทำการ เฉลี่ยรวมกันไม่ได้) · ' +
      '`sip_required: true` เมื่อมี KPI ตกเป้า ซึ่ง SLA 7.3 บังคับให้ทำ Service Improvement Plan',
  })
  @ApiQuery({ name: 'from', required: false, description: 'ISO 8601 · ค่าเริ่มต้น = ต้นเดือนปัจจุบัน' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO 8601 · ค่าเริ่มต้น = ตอนนี้' })
  kpi(@CurrentScope() scope: AccessScope, @Query('from') from?: string, @Query('to') to?: string) {
    scope.require('report.view', 'report.export');
    return this.reports.kpi(scope, this.reports.resolvePeriod(from, to));
  }

  @Get('sla-compliance')
  @ApiOperation({
    summary: 'KPI-1 แยกตามบริษัท × ระดับความสำคัญ',
    description:
      'ticket ที่มี `sla_exclusion_code` ถูกตัดออกจากตัวหารแล้ว ไม่ใช่นับเป็นผ่าน ' +
      '(SLA ภาคผนวก ก.2) · `compliance_percent: null` = ไม่มีเรื่องปิดในช่องนั้น',
  })
  @ApiQuery({ name: 'from', required: false, description: 'ISO 8601' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO 8601' })
  slaCompliance(
    @CurrentScope() scope: AccessScope,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    scope.require('report.view', 'report.export');
    return this.reports.slaCompliance(scope, this.reports.resolvePeriod(from, to));
  }
}
