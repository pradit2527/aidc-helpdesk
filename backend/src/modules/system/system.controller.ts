import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import type { AccessScope } from '../../common/scope';
import { SystemService, type SystemInfo } from './system.service';

@ApiTags('Admin')
@Controller()
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('admin/readiness')
  @ApiOperation({
    summary: 'ความพร้อมใช้งานจริงของระบบ',
    description:
      'ทุกข้อนับจากฐานข้อมูลจริง ไม่มีข้อไหนคืน ok จากค่าคงที่ในโค้ด · ' +
      '`blocked` = ทำให้ระบบทำงานผิดแบบเงียบ ๆ ถ้าเปิดใช้จริง ' +
      '(เช่น ปฏิทินวันหยุดว่างทำให้ SLA นับวันหยุดเป็นวันทำการ) · ' +
      '`ref` ชี้ไปที่ข้อค้างที่ต้องให้องค์กรตอบ',
  })
  readiness(@CurrentScope() scope: AccessScope) {
    scope.require('system.manage');
    return this.system.readiness();
  }

  @Get('system/info')
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
