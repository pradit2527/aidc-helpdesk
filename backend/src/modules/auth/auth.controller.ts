import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { ApiEnvelope, ErrorResponseDto } from '../../common/http/envelope.dto';
import { THROTTLE } from '../../common/throttle/throttle.config';
import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import {
  AuthService,
  COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from './auth.service';
import { ChangePasswordDto, LoginDto, LoginResponseDto, MeResponseDto } from './dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  // กัน password spraying — ลองรหัสยอดนิยมกับผู้ใช้จำนวนมากจนไม่มีบัญชีไหนถูกล็อก
  @Throttle({ [THROTTLE.auth]: { limit: 10, ttl: 300_000 } })
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
  @ApiEnvelope(LoginResponseDto, { status: 200 })
  @ApiResponse({ status: 401, type: ErrorResponseDto, description: 'INVALID_CREDENTIALS' })
  @ApiResponse({
    status: 423,
    type: ErrorResponseDto,
    description: 'ACCOUNT_LOCKED · ACCOUNT_DISABLED',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const { user, tokens, mustChangePassword } = await this.auth.login(dto.username, dto.password);
    setSessionCookies(res, tokens);
    return { must_change_password: mustChangePassword, user };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ [THROTTLE.auth]: { limit: 30, ttl: 300_000 } })
  @ApiOperation({
    summary: 'ต่ออายุ session',
    description:
      'อ่าน `aidc_rt` แล้วออกคุกกี้ชุดใหม่ทั้งสามตัว — เรียกได้เฉพาะเมื่อยังมี refresh cookie อยู่',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, type: ErrorResponseDto, description: 'UNAUTHENTICATED' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const token = req.cookies?.[COOKIE.refresh] as string | undefined;
    if (!token) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'ບໍ່ພົບ refresh token' },
      });
    }
    setSessionCookies(res, await this.auth.refresh(token));
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({
    summary: 'ออกจากระบบ',
    description:
      'ลบคุกกี้ทั้งสามตัว · ไม่ต้องยืนยันตัวตนก่อน เพราะการออกจากระบบต้องสำเร็จเสมอ ' +
      'แม้ session จะหมดอายุไปแล้ว',
  })
  @ApiResponse({ status: 204 })
  logout(@Res({ passthrough: true }) res: Response): void {
    clearSessionCookies(res);
  }

  @Get('me')
  @UseGuards(ScopeGuard)
  @ApiCookieAuth('cookie')
  @ApiOperation({
    summary: 'ข้อมูลผู้ใช้ปัจจุบัน',
    description:
      'คืนบทบาท ขอบเขตบริษัท และรายการสิทธิ์ — frontend ใช้ตัดสินว่าจะแสดงเมนูและปุ่มอะไร',
  })
  @ApiEnvelope(MeResponseDto)
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async me(@CurrentScope() scope: AccessScope): Promise<MeResponseDto> {
    return this.auth.meFor(scope.userId);
  }

  @Post('change-password')
  @HttpCode(204)
  @Throttle({ [THROTTLE.auth]: { limit: 5, ttl: 300_000 } })
  @UseGuards(ScopeGuard)
  @ApiCookieAuth('cookie')
  @ApiOperation({
    summary: 'เปลี่ยนรหัสผ่าน',
    description:
      'สำเร็จแล้วทุกอุปกรณ์ที่ยังค้าง session อยู่จะถูกเตะออก เพราะเหตุผลที่พบบ่อยที่สุด ' +
      'ของการเปลี่ยนรหัสผ่านคือสงสัยว่ารหัสเดิมรั่ว',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, type: ErrorResponseDto, description: 'INVALID_CREDENTIALS' })
  async changePassword(
    @CurrentScope() scope: AccessScope,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(scope.userId, dto.current_password, dto.new_password);
    // โทเคนเดิมใช้ไม่ได้แล้วหลังเพิ่ม token_version จึงต้องล้างคุกกี้ตามไปด้วย
    // มิฉะนั้นผู้ใช้จะค้างอยู่กับคุกกี้ที่ถูกปฏิเสธทุกคำขอ โดยไม่รู้ว่าต้องล็อกอินใหม่
    clearSessionCookies(res);
  }
}
