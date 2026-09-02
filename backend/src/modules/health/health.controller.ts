import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';

import { NoEnvelope } from '../../common/http/envelope.dto';
import { HealthService } from './health.service';

/**
 * จุดตรวจสุขภาพสามระดับ ที่มีผู้บริโภคต่างกันและต้องแยกกันจริง
 *
 *   /livez  — โปรเซสยังทำงานอยู่ไหม        ผู้บริโภค: ตัวจัดการคอนเทนเนอร์
 *   /readyz — พร้อมรับ traffic หรือยัง      ผู้บริโภค: load balancer
 *   /health — รายละเอียดทุกองค์ประกอบ       ผู้บริโภค: คนและระบบ monitoring
 *
 * ⚠️ /livez ต้องไม่แตะฐานข้อมูล
 *    ถ้า liveness ตรวจฐานข้อมูลด้วย พอฐานข้อมูลล่ม ตัวจัดการคอนเทนเนอร์จะ
 *    รีสตาร์ททุก pod วนไปเรื่อย ๆ ทำให้ตอนฐานข้อมูลกลับมา ไม่มี pod ไหน
 *    อยู่นานพอจะอุ่นเครื่องเสร็จ — กลายเป็นทำให้เหตุขัดข้องยาวขึ้นแทนที่จะสั้นลง
 */
@ApiTags('System')
@Controller()
@SkipThrottle()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('livez')
  @NoEnvelope()
  @ApiOperation({
    summary: 'โปรเซสยังมีชีวิตอยู่ไหม',
    description:
      'ตอบ 200 เสมอถ้าโปรเซสยังรับคำขอได้ **ไม่ตรวจฐานข้อมูลโดยตั้งใจ** — ' +
      'การรีสตาร์ทแก้ปัญหาฐานข้อมูลล่มไม่ได้ มีแต่จะทำให้แย่ลง',
  })
  @ApiResponse({ status: 200, schema: { example: { status: 'alive' } } })
  livez(): { status: 'alive' } {
    return { status: 'alive' };
  }

  @Get('readyz')
  @NoEnvelope()
  @ApiOperation({
    summary: 'พร้อมรับ traffic หรือยัง',
    description:
      'ตอบ 503 เมื่อฐานข้อมูลไม่ตอบสนอง เพื่อให้ load balancer ถอดเครื่องนี้ออกจาก upstream ' +
      'ชั่วคราวแทนที่จะส่งผู้ใช้เข้ามาเจอหน้า error',
  })
  @ApiResponse({ status: 200, schema: { example: { status: 'ready' } } })
  @ApiResponse({ status: 503, schema: { example: { status: 'not_ready' } } })
  async readyz(@Res({ passthrough: true }) res: Response): Promise<{ status: string }> {
    const ready = await this.health.isReady();
    if (!ready) {
      res.status(503);
      return { status: 'not_ready' };
    }
    return { status: 'ready' };
  }

  @Get('health')
  @HttpCode(200)
  @ApiOperation({
    summary: 'รายละเอียดสุขภาพระบบ',
    description: [
      'ตรวจฐานข้อมูล Redis และงานประเมิน SLA พร้อมกัน แล้วรายงานผลแยกรายองค์ประกอบ',
      '',
      '| สถานะ | ความหมาย |',
      '|---|---|',
      '| `ok` | ทุกอย่างปกติ |',
      '| `degraded` | ยังใช้งานได้แต่มีบางอย่างผิดปกติ เช่น Redis ล่ม หรืองาน SLA ค้าง |',
      '| `down` | ฐานข้อมูลไม่ตอบสนอง |',
      '',
      'Redis ล่มถือเป็น `degraded` ไม่ใช่ `down` เพราะทุกอย่างยังอ่านจากฐานข้อมูลได้',
    ].join('\n'),
  })
  @ApiResponse({ status: 200 })
  async health_(): Promise<unknown> {
    return this.health.report();
  }
}
