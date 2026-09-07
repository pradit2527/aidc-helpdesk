import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import type { AccessScope } from '../../common/scope';
import { SystemService, type SystemInfo } from './system.service';

@ApiTags('Admin')
@Controller('system')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('info')
  @ApiOperation({
    summary: 'ข้อมูลภาพรวมของระบบ',
    description:
      'นับจากฐานข้อมูลจริงตอนเรียกทุกครั้ง · ต้องมีสิทธิ์ system.manage · ' +
      'ไม่แสดงค่าที่ยังไม่มีจริง เช่น เวลาสำรองข้อมูลล่าสุด — ' +
      'ตัวเลขปลอมในหน้าผู้ดูแลทำให้คนเชื่อว่ามีการสำรองข้อมูลอยู่แล้วไม่ไปตั้งค่าจริง',
  })
  info(@CurrentScope() scope: AccessScope): Promise<SystemInfo> {
    scope.require('system.manage');
    return this.system.info();
  }
}
