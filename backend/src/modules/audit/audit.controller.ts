import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { clampPage, clampPageSize } from '../../common/http/pagination';
import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@Controller('audit-logs')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({
    summary: 'ร่องรอยการใช้งาน',
    description:
      'เรียงจากใหม่ไปเก่า · กรองได้ตามการกระทำ ชนิดข้อมูล ผู้กระทำ และช่วงเวลา ' +
      '· ต้องมีสิทธิ์ `audit.read` ซึ่งไม่ได้แจกให้บทบาททั่วไป',
  })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'entity_type', required: false })
  @ApiQuery({ name: 'entity_id', required: false })
  @ApiQuery({ name: 'actor_id', required: false })
  @ApiQuery({ name: 'company_id', required: false })
  @ApiQuery({ name: 'date_from', required: false, description: 'ISO 8601' })
  @ApiQuery({ name: 'date_to', required: false, description: 'ISO 8601' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'page_size', required: false, example: 20 })
  list(
    @CurrentScope() scope: AccessScope,
    @Query('action') action?: string,
    @Query('entity_type') entityType?: string,
    @Query('entity_id') entityId?: string,
    @Query('actor_id') actorId?: string,
    @Query('company_id') companyId?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ) {
    scope.require('audit.read');
    return this.audit.list(scope, {
      action,
      entity_type: entityType,
      entity_id: entityId,
      actor_id: actorId,
      company_id: companyId,
      date_from: dateFrom,
      date_to: dateTo,
      page: clampPage(page),
      page_size: clampPageSize(pageSize),
    });
  }

  @Get('facets')
  @ApiOperation({ summary: 'ค่าที่มีจริงในข้อมูล สำหรับเติมตัวเลือกในฟอร์มค้นหา' })
  facets(@CurrentScope() scope: AccessScope) {
    scope.require('audit.read');
    return this.audit.facets(scope);
  }
}
