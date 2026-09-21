import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiEnvelope, ErrorResponseDto } from '../../common/http/envelope.dto';
import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import {
  ChatwootInboxDto,
  CreateSupportProjectDto,
  SupportProjectDto,
  UpdateSupportProjectDto,
} from './dto/support-project.dto';
import { SupportProjectsService } from './support-projects.service';

@ApiTags('Support projects')
@Controller('support-projects')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class SupportProjectsController {
  constructor(private readonly projects: SupportProjectsService) {}

  @Get()
  @ApiOperation({
    summary: 'รายการโครงการสนับสนุน',
    description: [
      '**หนึ่งเว็บแอปของกลุ่ม = หนึ่ง inbox ชนิด Website ใน Chatwoot = หนึ่งโครงการ**',
      'บทสนทนาที่ผู้เข้าชมเริ่มจาก widget ไหน ถูกติดป้ายด้วยโครงการนั้นในกล่องแชท',
      '',
      '**ใครเห็น** — ผู้ที่เปิดกล่องแชทได้ (`ticket.change_status`) หรือ `user.assign_role`',
      'เห็นโครงการของบริษัทในขอบเขตตน บวกโครงการส่วนกลาง (`company: null`)',
      '',
      '`chatwoot.website_token` **ไม่ใช่ความลับ** — Chatwoot ออกแบบให้อยู่ในสคริปต์ที่ทุกหน้าเว็บโหลด',
      'ส่วน `hmac_token` ของ inbox เป็นความลับ และไม่เคยออกมาทาง API นี้เลย',
      '',
      '`webhook_url_hint` เป็น path เปล่า ๆ ไม่มีโฮสต์และไม่มี `?token=`',
      'ผู้ดูแลต้องต่อโฮสต์และ token เองตอนวางลง Chatwoot',
    ].join('\n'),
  })
  @ApiResponse({ status: 200, type: [SupportProjectDto] })
  @ApiResponse({ status: 403, type: ErrorResponseDto, description: 'FORBIDDEN' })
  list(@CurrentScope() scope: AccessScope): Promise<SupportProjectDto[]> {
    return this.projects.list(scope);
  }

  @Get('chatwoot-inboxes')
  @ApiOperation({
    summary: 'inbox ชนิด Website ที่มีอยู่ใน Chatwoot',
    description: [
      'ต้องมีสิทธิ์ `user.assign_role`',
      '',
      'อ่านจาก Chatwoot ตรง ๆ (`GET /inboxes`) แบบอ่านอย่างเดียว แล้วคัดเฉพาะ',
      '`Channel::WebWidget` — inbox ชนิด API ที่ใช้ซิงก์แชทภายในไม่อยู่ในรายการนี้',
      '',
      '`linked_project_code` บอกว่า inbox ใบนั้นถูกผูกกับโครงการไหนอยู่แล้ว',
      'หนึ่ง inbox ผูกได้กับโครงการเดียวเท่านั้น',
      '',
      '**503** เมื่อยังไม่ได้ตั้งค่า Chatwoot หรือติดต่อไม่ได้ในตอนนี้',
    ].join('\n'),
  })
  @ApiResponse({ status: 200, type: [ChatwootInboxDto] })
  @ApiResponse({
    status: 503,
    type: ErrorResponseDto,
    description: 'CHATWOOT_NOT_CONFIGURED · CHATWOOT_UNREACHABLE',
  })
  chatwootInboxes(@CurrentScope() scope: AccessScope): Promise<ChatwootInboxDto[]> {
    return this.projects.chatwootInboxes(scope);
  }

  @Post()
  @ApiOperation({
    summary: 'สร้างโครงการ',
    description: [
      'ต้องมีสิทธิ์ `user.assign_role`',
      '',
      '- `code` ตัวพิมพ์ใหญ่ ตัวเลข และ `_` — สคริปต์ฝังใช้ค่านี้เรียก `GET /public/support-projects/{code}`',
      '- `company_id: null` (โครงการส่วนกลาง) เฉพาะ `super_admin`',
      '- `default_category_id` / `team_id` ต้องมีอยู่จริงและอยู่ในขอบเขตของผู้เรียก (`422`)',
      '- `code` ซ้ำ หรือ `chatwoot_inbox_id` ที่ถูกผูกไว้แล้ว → `409` พร้อม field error',
    ].join('\n'),
  })
  @ApiBody({ type: CreateSupportProjectDto })
  @ApiEnvelope(SupportProjectDto, { status: 201 })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'DUPLICATE_SUPPORT_PROJECT' })
  @ApiResponse({ status: 422, type: ErrorResponseDto, description: 'VALIDATION_ERROR' })
  create(
    @CurrentScope() scope: AccessScope,
    @Body() dto: CreateSupportProjectDto,
  ): Promise<SupportProjectDto> {
    return this.projects.create(scope, dto);
  }

  @Post(':id/chatwoot-inbox')
  @HttpCode(201)
  @ApiOperation({
    summary: 'สร้าง inbox ใหม่ใน Chatwoot ให้โครงการนี้',
    description: [
      'ต้องมีสิทธิ์ `user.assign_role` และโครงการต้องอยู่ในขอบเขตบริษัทของผู้เรียก',
      '',
      'สร้าง inbox ชนิด Website (widget) ใน Chatwoot จากชื่อ ที่อยู่เว็บ และภาษาของโครงการ',
      'แล้วบันทึก `chatwoot.inbox_id` กับ `chatwoot.website_token` ลงโครงการให้ในคำขอเดียว',
      '',
      '⚠️ **เขียนลงระบบ Chatwoot ที่ทีมใช้งานอยู่จริง** — inbox ที่สร้างโผล่ในแอปของ',
      'เจ้าหน้าที่ทันที และลบทิ้งจากที่นี่ไม่ได้ ต้องเข้าไปลบในแอปของ Chatwoot เอง',
      '',
      '**สร้างใหม่อย่างเดียว ไม่ผูกซ้ำ** — โครงการที่มี inbox อยู่แล้วได้ `409 ALREADY_LINKED`',
      'การเปลี่ยนไปใช้ inbox ที่มีอยู่แล้วยังทำผ่าน `PATCH /support-projects/{id}` เหมือนเดิม',
      '',
      '`website_url` ของโครงการเป็นค่าที่ Chatwoot บังคับ — ยังไม่ได้กรอกจะได้ `422`',
      '',
      'คำตอบคือโครงการที่อัปเดตแล้ว (`SupportProjectDto`) รูปเดียวกับ `GET /support-projects`',
    ].join('\n'),
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiEnvelope(SupportProjectDto, { status: 201 })
  @ApiResponse({ status: 403, type: ErrorResponseDto, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'ALREADY_LINKED' })
  @ApiResponse({ status: 422, type: ErrorResponseDto, description: 'VALIDATION_ERROR — ยังไม่ได้ตั้ง website_url' })
  @ApiResponse({
    status: 503,
    type: ErrorResponseDto,
    description: 'CHATWOOT_NOT_CONFIGURED · CHATWOOT_UNREACHABLE',
  })
  createChatwootInbox(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SupportProjectDto> {
    return this.projects.createChatwootInbox(scope, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'แก้ไขโครงการ',
    description: [
      'ต้องมีสิทธิ์ `user.assign_role` และโครงการต้องอยู่ในขอบเขตบริษัทของผู้เรียก',
      '',
      '- `is_active: false` = ปิดโครงการ · รอบค้นหาบทสนทนาใหม่ข้ามทันที และ',
      '  `GET /public/support-projects/{code}` ตอบ `404` ทันทีเช่นกัน',
      '- ส่ง `chatwoot_inbox_id: null` เพื่อเลิกผูก inbox — แชทที่นำเข้ามาแล้วยังอยู่ครบ',
      '- ไม่ลบโครงการทิ้ง เพราะแชทเก่าอ้างถึงโครงการที่เคยมีอยู่',
    ].join('\n'),
  })
  @ApiParam({ name: 'id', example: 1 })
  @ApiBody({ type: UpdateSupportProjectDto })
  @ApiEnvelope(SupportProjectDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'DUPLICATE_SUPPORT_PROJECT' })
  @ApiResponse({ status: 422, type: ErrorResponseDto, description: 'VALIDATION_ERROR' })
  update(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupportProjectDto,
  ): Promise<SupportProjectDto> {
    return this.projects.update(scope, id, dto);
  }
}
