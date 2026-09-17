import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ErrorResponseDto, NoEnvelope } from '../../common/http/envelope.dto';
import { PublicSupportProjectDto } from './dto/support-project.dto';
import { SupportProjectsService } from './support-projects.service';

/**
 * ค่าที่สคริปต์ฝังในหน้าเว็บของแต่ละระบบต้องใช้ — เปิดสาธารณะ
 *
 * ⚠️ ไม่มี ScopeGuard บน controller นี้โดยตั้งใจ
 *    ScopeGuard คือที่เดียวที่ตรวจทั้งคุกกี้และ CSRF การไม่ใส่จึงเท่ากับ
 *    "ไม่ยืนยันตัวตน และไม่ตรวจ CSRF" ซึ่งเป็นสิ่งที่ endpoint นี้ต้องการพอดี
 *    — เป็น GET ที่ไม่เปลี่ยนสถานะอะไรเลย และคนเรียกคือเบราว์เซอร์ของผู้เข้าชม
 *      ที่ยังไม่มีบัญชีในระบบเรา
 *
 * ⚠️ ข้อมูลที่จ่ายออกไปต้องเป็นสิ่งที่ "อยู่ในหน้าเว็บอยู่แล้ว" เท่านั้น
 *    คือที่อยู่ Chatwoot กับ website token ของ widget ห้ามเพิ่มฟิลด์อื่นเข้ามาที่นี่
 *    โดยไม่ถามตัวเองก่อนว่า "ยอมให้คนทั้งอินเทอร์เน็ตอ่านค่านี้ได้ไหม"
 */
@ApiTags('Support projects')
@Controller('public/support-projects')
export class PublicSupportProjectsController {
  constructor(private readonly projects: SupportProjectsService) {}

  @Get(':code')
  @NoEnvelope()
  @ApiOperation({
    summary: 'ค่าตั้งของ widget สำหรับสคริปต์ฝัง (สาธารณะ)',
    description: [
      '**ไม่ต้องล็อกอิน ไม่ต้องมี CSRF token** — เรียกจากหน้าเว็บของระบบใดก็ได้',
      '',
      'คืนเฉพาะโครงการที่ `is_active` และผูก inbox พร้อม website token แล้ว',
      '',
      '⚠️ "ไม่มีรหัสนี้" · "ปิดอยู่" · "ยังไม่ได้ผูก inbox" ตอบ `404` เหมือนกันทุกประการ',
      'ถ้าตอบต่างกัน ใครก็ไล่ยิงรหัสเพื่อดูว่ากลุ่มบริษัทมีระบบอะไรอยู่บ้าง',
      '',
      '| header | ค่า |',
      '|---|---|',
      '| `Access-Control-Allow-Origin` | `*` |',
      '| `Cache-Control` | `public, max-age=300` |',
      '',
      '**ไม่ห่อซองมาตรฐาน** — ตอบเป็น object ตรง ๆ ตามที่เขียนไว้ด้านล่าง',
      '(ผลลัพธ์ที่ผิดพลาดยังเป็นซองมาตรฐานเหมือน endpoint อื่น)',
    ].join('\n'),
  })
  @ApiParam({ name: 'code', example: 'ILP', description: 'รหัสโครงการ ตัวพิมพ์เล็กก็ได้ ระบบแปลงให้' })
  @ApiResponse({ status: 200, type: PublicSupportProjectDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async byCode(
    @Param('code') code: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicSupportProjectDto> {
    /*
     * ตั้ง header ก่อนค้นหา เพื่อให้ผลลัพธ์ 404 มี CORS header ติดไปด้วย
     * มิฉะนั้นเบราว์เซอร์จะบล็อกการอ่านผลตั้งแต่ชั้น CORS แล้วสคริปต์ฝัง
     * จะเห็นเป็น "network error" แทนที่จะรู้ว่า "รหัสโครงการผิด"
     */
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'public, max-age=300');
    /*
     * helmet ตั้ง Cross-Origin-Resource-Policy: same-origin ให้ทุกคำขอ ซึ่งถูกต้องสำหรับ
     * ทั้งระบบ แต่ผิดสำหรับเส้นทางนี้เส้นทางเดียว — ทรัพยากรนี้ตั้งใจให้เว็บอื่นอ่าน
     * ทับเฉพาะที่นี่ ไม่แตะค่าตั้งของ helmet ที่ main.ts เพื่อไม่ให้กระทบ endpoint อื่น
     */
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return this.projects.publicByCode(code);
  }
}
