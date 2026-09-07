import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import { clampPage, clampPageSize } from '../../common/http/pagination';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'รายชื่อผู้ใช้ในขอบเขต',
    description:
      'ค้นด้วย `q` ได้ทั้งชื่อ ชื่อผู้ใช้ และรหัสพนักงาน · ' +
      '`company_id` ที่อยู่นอกขอบเขตจะถูกตัดทิ้งเงียบ ๆ ไม่ตอบ 403 ' +
      'เพราะการตอบ 403 ยืนยันว่าบริษัทนั้นมีอยู่จริง',
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'company_id', required: false })
  @ApiQuery({ name: 'is_active', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'page_size', required: false, example: 20 })
  list(
    @CurrentScope() scope: AccessScope,
    @Query('q') q?: string,
    @Query('company_id') companyId?: string,
    @Query('is_active') isActive?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ) {
    scope.require('user.read');
    // คืนรูป PagedResult ตรง ๆ — EnvelopeInterceptor แตกเป็น data + meta ให้เอง
    return this.users.list(scope, {
      q,
      company_id: companyId,
      is_active: isActive,
      page: clampPage(page),
      page_size: clampPageSize(pageSize),
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'รายละเอียดผู้ใช้ พร้อมบทบาทและขอบเขตบริษัท',
    description:
      'บทบาทที่หมดอายุแล้วยังคืนมาด้วยแต่ติดธง `is_expired` — ' +
      'ผู้ดูแลต้องเห็นว่าเคยให้สิทธิ์อะไรไว้ ไม่ใช่ให้มันหายไปเฉย ๆ',
  })
  detail(@CurrentScope() scope: AccessScope, @Param('id', ParseIntPipe) id: number) {
    scope.require('user.read');
    return this.users.detail(scope, id);
  }
}
