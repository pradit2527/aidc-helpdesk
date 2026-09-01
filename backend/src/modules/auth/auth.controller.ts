import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ErrorResponseDto } from '../../common/dto/common.dto';
import { LoginDto, LoginResponseDto, MeResponseDto } from './dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'เข้าสู่ระบบ',
    description: [
      '**token ไม่ได้อยู่ใน response body** — backend ตั้งเป็น cookie 3 ตัว',
      '',
      '```http',
      'Set-Cookie: aidc_at=...;   HttpOnly; Secure; SameSite=Strict; Path=/api/v1',
      'Set-Cookie: aidc_rt=...;   HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth',
      'Set-Cookie: aidc_csrf=...; Secure;   SameSite=Strict; Path=/',
      '```',
      '',
      '`aidc_csrf` ตั้งใจให้ JavaScript อ่านได้ เพื่อส่งกลับมาใน header `X-CSRF-Token`',
      '(double-submit cookie — ป้องกัน CSRF ชั้นที่สองนอกเหนือจาก SameSite)',
      '',
      '**การล็อกบัญชี**: กรอกรหัสผิด 5 ครั้งติด → `423`',
      'นโยบาย 3.2 บังคับว่าการปลดล็อกต้องยืนยันตัวตนกับ Service Desk',
      '**ปลดเองตามเวลาไม่ได้** — ต้องเรียก `POST /users/{id}/unlock`',
    ].join('\n'),
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto, description: 'INVALID_CREDENTIALS' })
  @ApiResponse({ status: 423, type: ErrorResponseDto, description: 'ACCOUNT_LOCKED · ACCOUNT_DISABLED' })
  @ApiResponse({ status: 429, type: ErrorResponseDto, description: 'RATE_LIMITED (10 ครั้ง/นาที/IP)' })
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): LoginResponseDto {
    // TODO: ต่อฐานข้อมูลจริง — ตอนนี้คืนข้อมูลตัวอย่างเพื่อให้เอกสารใช้งานได้
    res.cookie('aidc_csrf', 'demo-csrf-token', { sameSite: 'strict', path: '/' });
    return {
      must_change_password: false,
      user: {
        id: 88,
        username: dto.username,
        full_name: 'ພູວົງ ສີສຸກ',
        email: 'phouvong.s@aidctech.com.la',
        company: { id: 7, code: 'AIDC-LOG', name_th: 'ເອໄອດີຊີ ໂລຈິສຕິກ' },
        department: { id: 22, name: 'ສາງສິນຄ້າ' },
        roles: ['agent'],
        scoped_companies: [
          { id: 7, code: 'AIDC-LOG', name_th: 'ເອໄອດີຊີ ໂລຈິສຕິກ' },
          { id: 2, code: 'AIDC-CON', name_th: 'ເອໄອດີຊີ ຄອນສະຕຣັກຊັນ' },
        ],
        permissions: [
          'ticket.read',
          'ticket.create',
          'ticket.assign',
          'ticket.assign_self',
          'ticket.change_status',
          'ticket.change_priority',
          'ticket.comment',
          'ticket.comment_internal',
          'ticket.set_workaround',
          'service.manage',
          'kb.create',
        ],
      },
    };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth('aidc_at')
  @ApiOperation({
    summary: 'ออกจากระบบ',
    description: 'ลบ cookie ทั้ง 3 ตัว และใส่ `jti` ของ refresh token ลง denylist บน Redis',
  })
  @ApiResponse({ status: 204, description: 'ออกจากระบบเรียบร้อย' })
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie('aidc_at', { path: '/api/v1' });
    res.clearCookie('aidc_rt', { path: '/api/v1/auth' });
    res.clearCookie('aidc_csrf', { path: '/' });
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ต่ออายุ session',
    description: [
      'อ่าน `aidc_rt` จาก cookie แล้วออก cookie ชุดใหม่',
      '',
      'refresh token **หมุนทุกครั้ง** และ `jti` เดิมถูกใส่ denylist (กัน replay)',
      'ฝั่ง frontend เรียกจาก middleware ของ Next.js ก่อน render — ผู้ใช้ไม่เห็นการกะพริบ',
    ].join('\n'),
  })
  @ApiResponse({ status: 200, description: 'ตั้ง cookie ชุดใหม่' })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  refresh(): { ok: boolean } {
    return { ok: true };
  }

  @Get('me')
  @ApiCookieAuth('aidc_at')
  @ApiOperation({
    summary: 'ข้อมูลผู้ใช้ปัจจุบัน',
    description: [
      'คืน `permissions[]` สำหรับซ่อน/แสดง**เมนู**',
      '',
      'สิทธิ์ระดับ ticket แต่ละใบ **ห้ามเดาจากรายการนี้** — ใช้บล็อก `can`',
      'ที่ `GET /tickets/{id}` คืนมาแทน เพราะมีเงื่อนไข "เฉพาะของตน" และ',
      '"เฉพาะบริษัทตน" ที่ผูกกับสถานะ ticket ด้วย (FE-02)',
    ].join('\n'),
  })
  @ApiResponse({ status: 200, type: MeResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  me(): MeResponseDto {
    const { user } = this.login({ username: 'phouvong.s', password: 'x'.repeat(12) }, {
      cookie: () => undefined,
    } as unknown as Response);
    return { ...user, must_change_password: false };
  }
}
