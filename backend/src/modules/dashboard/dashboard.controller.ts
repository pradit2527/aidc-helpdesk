import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import type { AccessScope } from '../../common/scope';
import { DashboardService, type DashboardSummary } from './dashboard.service';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'ตัวเลขสรุปหน้าแดชบอร์ด',
    description:
      'ทุกคิวรีกรองตามขอบเขตบริษัทของผู้เรียกเสมอ — ตัวเลขสรุปที่ไม่กรองขอบเขต ' +
      'บอกได้ว่าบริษัทอื่นมีงานค้างเท่าไร ซึ่งเป็นข้อมูลที่ไม่ควรข้ามบริษัท\n\n' +
      '`sla_compliance_percent` คืน `null` เมื่อยังไม่มีเรื่องปิดในเดือนนี้ ' +
      'ไม่ใช่ 100 เพราะ 100% จากตัวหารศูนย์ทำให้เข้าใจผิดว่าทีมทำได้ครบทุกเรื่อง',
  })
  summary(@CurrentScope() scope: AccessScope): Promise<DashboardSummary> {
    scope.require('dashboard.view');
    return this.dashboard.summary(scope);
  }
}
