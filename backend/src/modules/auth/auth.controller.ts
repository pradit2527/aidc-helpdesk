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
import { AUTH_THROTTLE, THROTTLE } from '../../common/throttle/throttle.config';
import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import {
  chatwootIdentifierHash,
  readChatwootConfig,
} from '../../integrations/chatwoot/chatwoot.config';
import { ChatwootIdentityDto } from '../../integrations/chatwoot/chatwoot.dto';
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
  @Throttle({ [THROTTLE.default]: AUTH_THROTTLE.login })
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
  @Throttle({ [THROTTLE.default]: AUTH_THROTTLE.refresh })
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
    return this.auth.meFor(scope);
  }

  /*
   * แยกจาก /auth/me โดยตั้งใจ
   *
   * /auth/me ถูกเรียกทุกครั้งที่เปิดหน้า และถูกทำให้เร็วที่สุดเท่าที่ทำได้ไปแล้ว
   * ส่วนตัวตนของแชทต้องการเพียงครั้งเดียวหลังหน้าต่างแชทพร้อม — ถ้ารวมไว้
   * ทุกหน้าจะจ่ายค่าคำนวณให้แชท แม้ในเครื่องที่ไม่ได้เปิดใช้แชทเลย
   */
  @Get('chatwoot-identity')
  @UseGuards(ScopeGuard)
  @ApiCookieAuth('cookie')
  @ApiOperation({
    summary: 'ตัวตนสำหรับหน้าต่างแชท Chatwoot',
    description: [
      'ใช้กับ `window.$chatwoot.setUser(identifier, { name, email, identifier_hash })`',
      '',
      '- `identifier` = ชื่อผู้ใช้ — คนเดียวกันเปิดจากเครื่องไหนก็เห็นประวัติแชทเดียวกัน',
      '- `identifier_hash` = HMAC-SHA256 ของ identifier ด้วย `CHATWOOT_HMAC_TOKEN`',
      '  คำนวณที่ backend เท่านั้น เพราะ token ต้องไม่ไปถึงเบราว์เซอร์ · `null` เมื่อยังไม่ได้ตั้งค่า',
      '- `custom_attributes` ให้เจ้าหน้าที่เห็นบริษัท แผนก ตำแหน่ง และบทบาทของผู้ถาม',
    ].join('\n'),
  })
  @ApiEnvelope(ChatwootIdentityDto)
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async chatwootIdentity(@CurrentScope() scope: AccessScope): Promise<ChatwootIdentityDto> {
    const me = await this.auth.meFor(scope);
    const { hmacToken } = readChatwootConfig();

    return {
      identifier: me.username,
      // ไม่ตั้ง token = ส่ง null ไม่ใช่คำนวณด้วยค่าว่าง — HMAC ของ key ว่างคำนวณได้
      // และหน้าตาเหมือนรหัสจริงทุกอย่าง แต่ Chatwoot จะปฏิเสธโดยไม่บอกว่าเพราะอะไร
      identifier_hash: hmacToken ? chatwootIdentifierHash(hmacToken, me.username) : null,
      name: me.full_name,
      email: me.email ?? null,
      custom_attributes: {
        company: me.company.code,
        ...(me.department ? { department: me.department.name } : {}),
        ...(me.job_title ? { job_title: me.job_title } : {}),
        roles: me.roles.join(', '),
      },
    };
  }

  @Post('change-password')
  @HttpCode(204)
  @Throttle({ [THROTTLE.default]: AUTH_THROTTLE.changePassword })
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
