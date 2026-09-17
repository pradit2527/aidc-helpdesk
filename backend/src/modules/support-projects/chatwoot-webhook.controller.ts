import { createHash, timingSafeEqual } from 'node:crypto';

import {
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';

import { NoEnvelope } from '../../common/http/envelope.dto';
import { THROTTLE } from '../../common/throttle/throttle.config';
import { readChatwootWidgetConfig } from '../../integrations/chatwoot/chatwoot-widget.config';
import { ChatwootSyncService } from '../support-chat/chatwoot-sync.service';

/**
 * Chatwoot ยิงมาจาก IP เดียวเสมอ ถ้าใช้โควตาเริ่มต้น (300/นาที ต่อ IP)
 * ช่วงที่มีคนคุยพร้อมกันหลายห้องจะชน 429 แล้วสัญญาณหาย
 * ตัวดึงเป็นระยะรับไว้ได้ก็จริง แต่ผู้ใช้จะรู้สึกว่าแชทช้าลงเป็นพัก ๆ
 */
const WEBHOOK_THROTTLE = { [THROTTLE.default]: { limit: 1200, ttl: seconds(60) } };

/** เทียบความลับแบบไม่เผยความยาว — hash ก่อนแล้วค่อยเทียบ ทำให้สองฝั่งยาวเท่ากันเสมอ */
function secretEquals(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

/** เอาเฉพาะเลขที่ใช้เป็น "คำใบ้" — เนื้อข้อความใน payload ไม่ถูกแตะเลย */
function readHint(body: unknown): { inboxId: number | null; conversationId: number | null } {
  const payload = (body ?? {}) as Record<string, unknown>;
  const conversation = (payload.conversation ?? {}) as Record<string, unknown>;

  const toId = (value: unknown): number | null => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  return {
    inboxId: toId(payload.inbox_id) ?? toId(conversation.inbox_id),
    conversationId: toId(conversation.id) ?? toId(payload.id),
  };
}

/**
 * ทางเร่งของ AIDC Support Hub — Chatwoot บอกว่า "มีอะไรขยับในบทสนทนานี้"
 *
 * ⚠️ ไม่มี ScopeGuard บน controller นี้โดยตั้งใจ (ไม่ยืนยันตัวตนด้วยคุกกี้ และไม่ตรวจ CSRF)
 *    Chatwoot ไม่มีคุกกี้ของเราและส่ง header ของเราไม่ได้ ตัวที่กั้นคือ token ใน query
 *    ซึ่งเทียบแบบคงเวลา และ endpoint นี้ไม่รับคำสั่งใด ๆ จาก payload เลย
 *
 * ⚠️ **ไม่เชื่อเนื้อหาใน payload แม้แต่ตัวอักษรเดียว**
 *    ใช้แค่เลข inbox กับเลขบทสนทนาเป็นคำใบ้ว่า "ไปดูที่ไหน" แล้วไปอ่านของจริง
 *    จาก Chatwoot ด้วย token ของเราเอง — ถ้าเชื่อ payload ใครก็ยิง webhook
 *    ใส่ข้อความปลอมเข้ากล่องแชทในนามผู้เข้าชมคนไหนก็ได้ (ถ้าเดา token ถูก)
 *
 * ⚠️ ตอบเร็วเสมอ ไม่รอผลการซิงก์ — Chatwoot มี timeout ของมันเอง
 *    webhook ที่ตอบช้าจะถูกมองว่าล้มเหลวแล้วถูกปิดทิ้งในที่สุด
 */
@ApiTags('Support projects')
@Controller('integrations/chatwoot')
export class ChatwootWebhookController {
  private readonly widget = readChatwootWidgetConfig();

  constructor(private readonly sync: ChatwootSyncService) {}

  @Post('events')
  @HttpCode(200)
  @NoEnvelope()
  @Throttle(WEBHOOK_THROTTLE)
  @ApiOperation({
    summary: 'รับสัญญาณจาก Chatwoot (ทางเร่งของการซิงก์ widget)',
    description: [
      '**ไม่ใช้คุกกี้ ไม่ตรวจ CSRF** — ผู้เรียกคือเซิร์ฟเวอร์ Chatwoot ไม่ใช่เบราว์เซอร์ของผู้ใช้',
      'ตัวที่กั้นคือ `?token=` ที่ต้องตรงกับ `CHATWOOT_WEBHOOK_TOKEN` (เทียบแบบคงเวลา)',
      '',
      '| สถานะ | เมื่อไร |',
      '|---|---|',
      '| `200 {"ok":true}` | token ตรง — รับเรื่องแล้ว ยังไม่ได้ซิงก์เสร็จ |',
      '| `401` | token ไม่ตรง |',
      '| `404` | ยังไม่ได้ตั้ง `CHATWOOT_WEBHOOK_TOKEN` (ปิดฟีเจอร์นี้อยู่) |',
      '',
      '**payload ถูกใช้แค่เป็นคำใบ้** — อ่านเฉพาะ `conversation.id` / `inbox_id` / `id`',
      'แล้วไปดึงของจริงจาก Chatwoot ด้วย token ของเราเอง เนื้อข้อความใน payload ไม่ถูกนำเข้าเลย',
      '',
      'inbox ที่ไม่ตรงกับโครงการใด และ inbox ชนิด API ที่ใช้ซิงก์แชทภายใน ถูกเพิกเฉย',
      '',
      'ทางนี้เป็นแค่ตัวเร่ง — แหล่งความจริงคือรอบดึงทุก `CHATWOOT_WIDGET_POLL_MS`',
      'ถ้า webhook หายไปหนึ่งครั้ง ข้อความยังมาถึงในรอบถัดไปเสมอ',
    ].join('\n'),
  })
  @ApiQuery({ name: 'token', required: true, description: '⚠️ ความลับ — ตรงกับ CHATWOOT_WEBHOOK_TOKEN' })
  @ApiResponse({ status: 200, description: '`{ "ok": true }`' })
  events(@Query('token') token: string | undefined, @Body() body: unknown): { ok: true } {
    const expected = this.widget.webhookToken;
    // ยังไม่ได้ตั้งค่า = ไม่มี endpoint นี้อยู่ ไม่ใช่ "มีแต่เข้าไม่ได้"
    if (!expected) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'ບໍ່ພົບເສັ້ນທາງນີ້' } });

    if (!token || !secretEquals(token, expected)) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHENTICATED', message: 'token ບໍ່ຖືກຕ້ອງ' },
      });
    }

    const { inboxId, conversationId } = readHint(body);
    // ไม่รอผล — ตอบ Chatwoot ก่อน แล้วค่อยไปซิงก์
    if (inboxId !== null) this.sync.kickWidgetInbox(inboxId, conversationId);
    return { ok: true };
  }
}
