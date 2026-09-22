import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { ErrorResponseDto, NoEnvelope } from '../../common/http/envelope.dto';
import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import { THROTTLE } from '../../common/throttle/throttle.config';
import { CHAT_MAX_FILE_BYTES } from './chat-file-type';
import {
  ChatInboxQueryDto,
  ConvertChatToTicketDto,
  ConvertChatToTicketResponseDto,
  RateChatDto,
  SendChatFileDto,
  SendChatMessageDto,
  SendChatMessageResponseDto,
  SupportChatSummaryDto,
  SupportChatThreadDto,
} from './support-chat.dto';
import { SupportChatService, type UploadedChatFile } from './support-chat.service';

/** ข้อความแชทต่อนาทีต่อผู้ใช้ — พิมพ์เร็วแค่ไหนก็ไม่ถึง แต่ตัดสคริปต์ที่ยิงรัว */
const MESSAGE_THROTTLE = { [THROTTLE.default]: { limit: 40, ttl: seconds(60) } };

/**
 * รับไฟล์เดียวต่อข้อความ จำกัดขนาดที่ระดับ middleware
 * ไม่งั้นไฟล์ 2 GB ถูกอ่านเข้าหน่วยความจำจนหมดก่อนถูกปฏิเสธ
 */
const FILE_UPLOAD = FileInterceptor('file', {
  limits: { fileSize: CHAT_MAX_FILE_BYTES, files: 1 },
});

const FILE_BODY_SCHEMA = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: {
      file: { type: 'string', format: 'binary', description: 'รูป เสียง PDF zip หรือข้อความล้วน ≤ 20 MB' },
      body: { type: 'string', description: 'ข้อความประกอบ (ไม่บังคับ)' },
    },
  },
};

@ApiTags('Support chat')
@Controller('support-chat')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class SupportChatController {
  constructor(private readonly chats: SupportChatService) {}

  @Get('mine')
  @ApiOperation({
    summary: 'ห้องแชทของฉันกับทีมไอที',
    description:
      'ห้องที่เปิดอยู่ ถ้าไม่มีคืนห้องล่าสุดที่ปิดไปแล้ว · `null` ถ้ายังไม่เคยคุย\n\n' +
      'ข้อความใหม่มาทาง WebSocket `/api/v1/ws` event `chat:message` หลังส่ง `chat:subscribe`',
  })
  @ApiResponse({ status: 200, type: SupportChatThreadDto })
  mine(@CurrentScope() scope: AccessScope): Promise<SupportChatThreadDto | null> {
    return this.chats.mine(scope);
  }

  @Post('mine/messages')
  @HttpCode(201)
  @Throttle(MESSAGE_THROTTLE)
  @ApiOperation({
    summary: 'ส่งข้อความหาทีมไอที',
    description: 'ยังไม่มีห้องที่เปิดอยู่ ระบบเปิดห้องใหม่ให้อัตโนมัติ — หนึ่งคนมีห้องที่เปิดได้ครั้งละห้องเดียว',
  })
  @ApiBody({ type: SendChatMessageDto })
  @ApiResponse({ status: 201, type: SendChatMessageResponseDto })
  sendMine(
    @CurrentScope() scope: AccessScope,
    @Body() dto: SendChatMessageDto,
  ): Promise<SendChatMessageResponseDto> {
    return this.chats.sendMine(scope, dto);
  }

  @Post('mine/attachments')
  @HttpCode(201)
  @Throttle(MESSAGE_THROTTLE)
  @UseInterceptors(FILE_UPLOAD)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'ส่งรูป เสียง หรือไฟล์หาทีมไอที',
    description:
      'multipart ช่อง `file` (หนึ่งไฟล์) และ `body` (ไม่บังคับ) · ≤ 20 MB · ' +
      'ตรวจชนิดจากเนื้อไฟล์จริง: รูป (png jpg gif webp) · เสียง (webm ogg m4a wav mp3) · PDF · zip · ข้อความล้วน',
  })
  @ApiBody(FILE_BODY_SCHEMA)
  @ApiResponse({ status: 201, type: SendChatMessageResponseDto })
  @ApiResponse({ status: 422, type: ErrorResponseDto, description: 'UNSUPPORTED_FILE_TYPE · FILE_TOO_LARGE' })
  sendMineFile(
    @CurrentScope() scope: AccessScope,
    @UploadedFile() file: UploadedChatFile | undefined,
    @Body() dto: SendChatFileDto,
  ): Promise<SendChatMessageResponseDto> {
    return this.chats.sendMineFile(scope, file, dto.body);
  }

  @Get('inbox')
  @ApiOperation({
    summary: 'กล่องแชทของทีมไอที',
    description: [
      'ต้องมีสิทธิ์ `ticket.change_status` · เห็นเฉพาะบริษัทในขอบเขต · เรียงตามข้อความล่าสุด',
      '',
      'รวมสองแหล่งไว้ในกล่องเดียว แยกด้วย `origin`',
      '- `helpdesk` — พนักงานกดแชทในระบบ · `requester` คือบัญชีจริง · `contact` เป็น null',
      '- `widget` — ผู้เข้าชมเว็บเปิดจาก widget ของ Chatwoot · `project` บอกว่ามาจากเว็บไหน',
      '  `requester` ยังไม่เคยเป็น null (ใช้ `id: 0` เมื่อไม่รู้ว่าเป็นใคร)',
      '',
      '⚠️ `contact.verified` = Chatwoot ยืนยันตัวตนด้วย HMAC แล้ว',
      'อีเมลที่ `verified: false` มาจากฟอร์มก่อนแชทซึ่งผู้เข้าชมพิมพ์เองได้ ห้ามถือเป็นตัวตน',
      '',
      'กรองเพิ่มได้ด้วย `project_id` และ `origin`',
    ].join('\n'),
  })
  @ApiResponse({ status: 200, type: [SupportChatSummaryDto] })
  @ApiResponse({ status: 403, type: ErrorResponseDto })
  inbox(
    @CurrentScope() scope: AccessScope,
    @Query() query: ChatInboxQueryDto,
  ): Promise<SupportChatSummaryDto[]> {
    return this.chats.inbox(scope, query.status ?? 'open', {
      ...(query.project_id !== undefined ? { projectId: query.project_id } : {}),
      ...(query.origin !== undefined ? { origin: query.origin } : {}),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'ข้อความทั้งหมดในห้อง', description: 'เจ้าของห้อง หรือทีมไอทีในขอบเขตบริษัทนั้น · อื่น ๆ ได้ 404' })
  @ApiResponse({ status: 200, type: SupportChatThreadDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  detail(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SupportChatThreadDto> {
    return this.chats.detail(scope, id);
  }

  @Post(':id/messages')
  @HttpCode(201)
  @Throttle(MESSAGE_THROTTLE)
  @ApiOperation({
    summary: 'ตอบในห้องแชท',
    description: 'ทีมไอทีคนแรกที่ตอบเป็นผู้รับผิดชอบห้องอัตโนมัติ · ห้องที่ปิดแล้วได้ 409 `CHAT_CLOSED`',
  })
  @ApiBody({ type: SendChatMessageDto })
  @ApiResponse({ status: 201, type: SendChatMessageResponseDto })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'CHAT_CLOSED' })
  send(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendChatMessageDto,
  ): Promise<SendChatMessageResponseDto> {
    return this.chats.send(scope, id, dto);
  }

  @Post(':id/attachments')
  @HttpCode(201)
  @Throttle(MESSAGE_THROTTLE)
  @UseInterceptors(FILE_UPLOAD)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'ส่งรูป เสียง หรือไฟล์ในห้องแชท',
    description: 'เงื่อนไขไฟล์เดียวกับ `POST /support-chat/mine/attachments` · ห้องที่ปิดแล้วได้ 409',
  })
  @ApiBody(FILE_BODY_SCHEMA)
  @ApiResponse({ status: 201, type: SendChatMessageResponseDto })
  sendFile(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: UploadedChatFile | undefined,
    @Body() dto: SendChatFileDto,
  ): Promise<SendChatMessageResponseDto> {
    return this.chats.sendFile(scope, id, file, dto.body);
  }

  @Get(':id/messages/:messageId/file')
  @NoEnvelope()
  @ApiOperation({
    summary: 'เปิดไฟล์ในแชท',
    description:
      'เจ้าของห้อง หรือทีมไอทีในขอบเขตเท่านั้น · รูปและเสียงส่งแบบ inline เพื่อแสดงในแชท ' +
      'ไฟล์อื่นบังคับดาวน์โหลด · ทุกไฟล์มี `Content-Security-Policy: sandbox` กันสคริปต์ในไฟล์ทำงาน',
  })
  @ApiResponse({ status: 200, description: 'เนื้อไฟล์ดิบ' })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  async file(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.chats.readFile(scope, id, messageId);

    /*
     * รูปกับเสียงต้อง inline ไม่งั้นแสดงในแชทไม่ได้ — ปลอดภัยเพราะรายการอนุญาตมีแต่รูปแบบ raster
     * (ไม่มี SVG) และเสียง ซึ่งเบราว์เซอร์ไม่รันสคริปต์ ส่วนไฟล์อื่นบังคับดาวน์โหลดเหมือนไฟล์แนบ ticket
     *
     * sandbox + nosniff เป็นด่านซ้อน — ถ้าวันหนึ่งรายการอนุญาตหลุดชนิดที่รันสคริปต์ได้เข้ามา
     * เบราว์เซอร์จะเปิดไฟล์นั้นแบบไม่มีสิทธิ์ใด ๆ ในโดเมนเรา
     */
    const inline = file.kind === 'image' || file.kind === 'audio';
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Length', String(file.buffer.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    // ไฟล์ในข้อความไม่เปลี่ยนแล้ว — เก็บในเบราว์เซอร์ของผู้ใช้คนนั้นได้ แต่ห้าม proxy กลางทางเก็บ
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    res.end(file.buffer);
  }

  @Post(':id/read')
  @HttpCode(204)
  @ApiOperation({ summary: 'ทำเครื่องหมายว่าอ่านแล้ว (ฝั่งของผู้เรียก)' })
  @ApiResponse({ status: 204 })
  async read(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.chats.markRead(scope, id);
  }

  @Post(':id/ticket')
  @HttpCode(201)
  @ApiOperation({
    summary: 'ยกระดับแชทเป็นเรื่องแจ้ง',
    description: [
      'ทีมไอทีเท่านั้น (สิทธิ์ `ticket.change_status` และห้องต้องอยู่ในขอบเขตบริษัทของผู้เรียก) —',
      'ด่านเดียวกับ `POST /support-chat/{id}/close`',
      '',
      'สร้างเรื่องจากบทสนทนาในห้องนี้ แล้วผูกกันสองทาง',
      '`chat.ticket_id` ชี้มาที่เรื่อง และเรื่องจำโครงการของห้องไว้ในตัวเอง',
      '(ใช้กรองรายงานด้วย `GET /reports/tickets?project_id=`)',
      '',
      '**ค่าตั้งต้นเมื่อไม่ส่งมา**',
      '- `category_id` — `default_category` ของโครงการที่ห้องนี้สังกัด · ไม่มีทั้งคู่ → `422`',
      '- `description` — บทสนทนาที่ถอดให้เอง มีเวลากำกับ ติดป้าย `ທີມໄອທີ` / `ຜູ້ເຂົ້າຊົມ` / `ຜູ້ແຈ້ງ`',
      '  ตัดข้อความระบบออก ยาวไม่เกิน 4000 ตัวอักษร แล้วบอกว่าที่เหลืออ่านได้ที่ห้องแชท',
      '- `impact` / `urgency` — `individual` / `medium` (ระบบคำนวณ `priority` เอง ส่งมาตรง ๆ ไม่ได้)',
      '',
      '**ผู้แจ้งของเรื่องที่ได้**',
      '- ห้องของพนักงาน หรือห้องจาก widget ที่ Chatwoot ยืนยันตัวตนแล้วและจับคู่บัญชีได้ → บัญชีนั้น',
      '- ห้องจาก widget ที่ยังไม่รู้ว่าเป็นใคร → **เจ้าหน้าที่ที่กด** เป็นทั้งผู้แจ้งและผู้สร้าง',
      '  ระบบไม่สร้างบัญชีให้ผู้เข้าชม และไม่ยืมบัญชีใครมาเป็นผู้แจ้ง',
      '  ตัวตนเท่าที่รู้อยู่ใน `contact_snapshot` ของคำตอบ (ไม่ได้ถูกเขียนลงแถวของ ticket)',
      '',
      'ไม่มีการมอบหมายผู้รับผิดชอบอัตโนมัติ — เรื่องเข้าคิวที่ยังไม่มีคนรับ แล้วมอบหมายตามปกติ',
      '',
      'หลังจากนี้ ทุกครั้งที่เรื่องเปลี่ยนสถานะ ห้องนี้จะได้ข้อความของระบบภาษาลาวหนึ่งข้อความ',
      'และถ้าห้องมาจาก widget ที่ยังซิงก์อยู่ ข้อความนั้นถูกส่งถึงผู้เข้าชมผ่าน Chatwoot ด้วย',
    ].join('\n'),
  })
  @ApiBody({ type: ConvertChatToTicketDto })
  @ApiResponse({ status: 201, type: ConvertChatToTicketResponseDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto, description: 'FORBIDDEN' })
  @ApiResponse({ status: 404, type: ErrorResponseDto, description: 'ห้องที่เข้าไม่ได้ตอบ 404 ไม่ใช่ 403' })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'CHAT_ALREADY_LINKED' })
  @ApiResponse({ status: 422, type: ErrorResponseDto, description: 'VALIDATION_ERROR' })
  convertToTicket(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConvertChatToTicketDto,
  ): Promise<ConvertChatToTicketResponseDto> {
    return this.chats.convertToTicket(scope, id, dto);
  }

  @Post(':id/rating')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ให้คะแนนความพึงพอใจจากห้องแชท',
    description: [
      'ผู้ถามเจ้าของห้องเท่านั้น และต้องเป็นผู้แจ้งของเรื่องที่ห้องนี้ยกระดับไป',
      '',
      '- เรื่องแก้เสร็จ/ส่งมอบแล้ว (`resolved` / `fulfilled`) → เรื่องปิดพร้อมคะแนน (เหมือนยืนยันปิดบนหน้าเรื่อง)',
      '- เรื่องปิดแล้วไม่เกิน 7 วัน → เก็บคะแนนอย่างเดียว',
      '',
      'ให้ได้ครั้งเดียว · ลงข้อความระบบในห้องให้ทีมไอทีเห็นคะแนน · คืนห้องทั้งห้องที่อัปเดตแล้ว',
    ].join('\n'),
  })
  @ApiBody({ type: RateChatDto })
  @ApiResponse({ status: 200, type: SupportChatThreadDto })
  @ApiResponse({ status: 403, type: ErrorResponseDto, description: 'FORBIDDEN — ไม่ใช่ผู้แจ้ง' })
  @ApiResponse({ status: 409, type: ErrorResponseDto, description: 'ALREADY_RATED · RATING_UNAVAILABLE' })
  rate(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RateChatDto,
  ): Promise<SupportChatThreadDto> {
    return this.chats.rate(scope, id, dto);
  }

  @Post(':id/close')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ปิดห้องแชท',
    description: 'ทีมไอทีเท่านั้น · ผู้ใช้พิมพ์มาใหม่หลังปิด ระบบเปิดห้องใหม่ให้เอง',
  })
  @ApiResponse({ status: 200, type: SupportChatSummaryDto })
  close(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SupportChatSummaryDto> {
    return this.chats.close(scope, id);
  }
}
