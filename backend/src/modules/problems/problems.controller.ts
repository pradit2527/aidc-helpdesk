import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { clampPage, clampPageSize } from '../../common/http/pagination';
import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import { ProblemsService } from './problems.service';

@ApiTags('Problems')
@Controller('problems')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class ProblemsController {
  constructor(private readonly problems: ProblemsService) {}

  @Get()
  @ApiOperation({
    summary: 'ปัญหาที่เป็นต้นเหตุร่วม',
    description:
      '`is_rca_overdue` คำนวณจากฝั่งเซิร์ฟเวอร์ — เหตุ P1 ต้องส่ง RCA ภายใน ' +
      '5 วันทำการตาม SLA 7.2 · `linked_ticket_count` นับเฉพาะใบที่ยังไม่ถูกลบ',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'rca_pending', 'fixed', 'closed'] })
  @ApiQuery({ name: 'service_id', required: false })
  @ApiQuery({ name: 'company_id', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'page_size', required: false, example: 20 })
  list(
    @CurrentScope() scope: AccessScope,
    @Query('status') status?: string,
    @Query('service_id') serviceId?: string,
    @Query('company_id') companyId?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ) {
    scope.require('problem.manage', 'ticket.read');
    return this.problems.list(scope, {
      status,
      service_id: serviceId,
      company_id: companyId,
      page: clampPage(page),
      page_size: clampPageSize(pageSize),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'รายละเอียดปัญหา พร้อม ticket ที่ผูกอยู่ (สูงสุด 50 ใบล่าสุด)' })
  detail(@CurrentScope() scope: AccessScope, @Param('id', ParseIntPipe) id: number) {
    scope.require('problem.manage', 'ticket.read');
    return this.problems.detail(scope, id);
  }
}
