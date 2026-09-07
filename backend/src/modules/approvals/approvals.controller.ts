import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { clampPage, clampPageSize } from '../../common/http/pagination';
import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import { ApprovalsService } from './approvals.service';

@ApiTags('Approvals')
@Controller('approvals')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @ApiOperation({
    summary: 'คำขออนุมัติ',
    description:
      '`assignee=me` คืนเฉพาะใบที่ถึงคิวของฉันจริง — ขั้นก่อนหน้าต้องอนุมัติครบแล้ว ' +
      'จึงจะปรากฏ ป้องกันการอนุมัติข้ามขั้นตาม SOP-03 · ' +
      'ถ้าไม่ระบุ `assignee` จะเห็นทุกใบในขอบเขต ซึ่งต้องมีสิทธิ์ `approval.read`',
  })
  @ApiQuery({ name: 'assignee', required: false, enum: ['me'] })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'approved', 'rejected', 'cancelled', 'expired'],
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'page_size', required: false, example: 20 })
  list(
    @CurrentScope() scope: AccessScope,
    @Query('assignee') assignee?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ) {
    /*
     * คิวของตัวเองไม่ต้องมีสิทธิ์พิเศษ — ผู้อนุมัติส่วนใหญ่เป็นหัวหน้าสายงาน
     * ที่ไม่ได้อยู่ในทีมไอที จึงไม่มีสิทธิ์ approval.read ติดตัวมา
     * แต่การดูคิวของ "ทุกคน" คือการเห็นว่าใครขออะไรอยู่ ซึ่งต้องมีสิทธิ์
     */
    if (assignee !== 'me') scope.require('approval.read', 'approval.manage');

    return this.approvals.list(scope, {
      assignee,
      status,
      page: clampPage(page),
      page_size: clampPageSize(pageSize),
    });
  }
}
