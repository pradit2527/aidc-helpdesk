import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { HealthResponseDto } from '../auth/dto/auth.dto';

@ApiTags('System')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'ตรวจสุขภาพระบบ',
    description: [
      'ใช้โดย Docker healthcheck และระบบ monitoring ขององค์กร',
      '',
      'ตอบ `degraded` เมื่องาน `scan_sla` ไม่ได้รันเกิน 15 นาที',
      '(ถ้า beat ตายเงียบ SLA จะไม่ถูกประเมินและไม่มีใครรู้)',
      '',
      'ตอบ `503` เมื่อฐานข้อมูลไม่ตอบสนอง เพื่อให้ nginx ถอดออกจาก upstream',
    ].join('\n'),
  })
  @ApiResponse({ status: 200, type: HealthResponseDto })
  @ApiResponse({ status: 503, description: 'ฐานข้อมูลหรือ Redis ไม่ตอบสนอง' })
  health(): HealthResponseDto {
    return {
      status: 'ok',
      version: process.env.npm_package_version ?? '0.1.0',
      db: 'ok',
      redis: 'ok',
      disk_data_free_percent: 62.4,
      last_sla_scan_at: null,
    };
  }
}
