import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { clampPage, clampPageSize } from '../../common/http/pagination';
import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /*
   * ไม่มี endpoint ไหนในคอนโทรลเลอร์นี้รับ user_id จากผู้เรียก
   * ทุกอันอ่านจาก scope.userId ที่ ScopeGuard ถอดจากคุกกี้มาให้
   * — การแจ้งเตือนของคนอื่นเป็นข้อมูลส่วนบุคคล
   */

  @Get()
  @ApiOperation({
    summary: 'การแจ้งเตือนในระบบของฉัน',
    description:
      'เฉพาะช่องทาง `in_app` · `meta.unread` นับจากทั้งหมด ไม่ใช่จากหน้าปัจจุบัน ' +
      'จึงใช้เป็นตัวเลขบนกระดิ่งได้ตรง ๆ',
  })
  @ApiQuery({ name: 'unread_only', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'page_size', required: false, example: 20 })
  list(
    @CurrentScope() scope: AccessScope,
    @Query('unread_only') unreadOnly?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ) {
    // ไม่ต้องมีสิทธิ์พิเศษ — ทุกคนที่ล็อกอินได้ต้องอ่านการแจ้งเตือนของตัวเองได้
    return this.notifications.list(scope, {
      unread_only: unreadOnly,
      page: clampPage(page),
      page_size: clampPageSize(pageSize),
    });
  }

  @Get('channels')
  @ApiOperation({ summary: 'ช่องทางรับการแจ้งเตือนของฉัน' })
  channels(@CurrentScope() scope: AccessScope) {
    return this.notifications.channels(scope);
  }

  @Post('read')
  @ApiOperation({
    summary: 'ทำเครื่องหมายว่าอ่านแล้ว',
    description: 'ส่ง `ids` เพื่อระบุรายการ หรือ `all: true` เพื่อทำทั้งหมด',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'number' }, example: [1, 2] },
        all: { type: 'boolean', example: false },
      },
    },
  })
  markRead(@CurrentScope() scope: AccessScope, @Body() body: { ids?: number[]; all?: boolean }) {
    if (body.all === true) return this.notifications.markAllRead(scope);

    /*
     * กรองให้เหลือเฉพาะจำนวนเต็มบวก
     * ค่าที่ไม่ใช่ตัวเลขทำให้ inArray สร้าง SQL ที่ไดรเวอร์ปฏิเสธ
     * แล้วผู้ใช้จะเห็น 500 ทั้งที่ความจริงคือคำขอไม่ถูกต้อง
     */
    const ids = (body.ids ?? []).filter((n) => Number.isInteger(n) && n > 0);
    return this.notifications.markRead(scope, ids);
  }

  @Put('channels')
  @ApiOperation({
    summary: 'ตั้งค่าช่องทางรับการแจ้งเตือนของฉัน',
    description:
      '`is_verified` ตั้งจาก endpoint นี้ไม่ได้ — LINE ต้องผ่านการผูกบัญชีจริงก่อน ' +
      'มิฉะนั้นงานส่งแจ้งเตือนจะส่งไปยังปลายทางที่ไม่มีอยู่แล้วล้มเหลวเงียบ ๆ',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['channels'],
      properties: {
        channels: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              channel: { type: 'string', enum: ['in_app', 'email', 'teams', 'line', 'webpush'] },
              is_enabled: { type: 'boolean' },
              destination: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  })
  setChannels(
    @CurrentScope() scope: AccessScope,
    @Body() body: { channels?: { channel: string; is_enabled: boolean; destination?: string | null }[] },
  ) {
    return this.notifications.setChannels(scope, body.channels ?? []);
  }
}
