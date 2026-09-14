import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { ValidationError } from '../../common/errors/domain-error';
import { ApiEnvelope, ErrorResponseDto } from '../../common/http/envelope.dto';
import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import { THROTTLE } from '../../common/throttle/throttle.config';
import { AssistantChatDto, AssistantStatusDto } from './assistant.dto';
import { AssistantService } from './assistant.service';
import type { AssistantEvent } from './assistant.tools';

@ApiTags('Assistant')
@Controller('assistant')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('status')
  @ApiOperation({
    summary: 'ผู้ช่วย AI เปิดใช้อยู่ไหม',
    description: 'หน้าจอใช้ตัดสินว่าจะเปิดช่องพิมพ์หรือแสดงข้อความว่ายังไม่ได้ตั้งค่า',
  })
  @ApiEnvelope(AssistantStatusDto)
  status(): AssistantStatusDto {
    return this.assistant.status;
  }

  @Post('chat')
  // แต่ละคำถามคิดเงินจริง — จำกัดรายผู้ใช้ให้แคบกว่าค่าเริ่มต้นทั้งระบบมาก
  @Throttle({ [THROTTLE.default]: { limit: 20, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'ถามผู้ช่วย AI (สตรีมคำตอบ)',
    description: [
      'ตอบเป็น **Server-Sent Events** ไม่ใช่ซองมาตรฐาน — แต่ละเหตุการณ์มี `data` เป็น JSON ที่มี `type`',
      '',
      '| type | ข้อมูล |',
      '|---|---|',
      '| `delta` | `text` — ข้อความคำตอบทีละช่วง |',
      '| `status` | `text` — ผู้ช่วยกำลังทำอะไร เช่นกำลังค้นหา ticket |',
      '| `ticket_draft` | `draft` — ร่าง ticket ให้ผู้ใช้กดยืนยัน **ยังไม่ได้บันทึก** |',
      '| `error` | `message` — ข้อความสำหรับผู้ใช้ |',
      '| `done` | จบคำตอบ |',
      '',
      'เครื่องมือของผู้ช่วยทำงานด้วยสิทธิ์ของผู้ถามเท่านั้น · ระบบไม่เก็บบทสนทนา ส่งประวัติมาทุกครั้ง',
      'ปิดใช้งานอยู่ตอบ `503 ASSISTANT_DISABLED` · จำกัด 20 คำถามต่อนาทีต่อผู้ใช้',
    ].join('\n'),
  })
  @ApiBody({ type: AssistantChatDto })
  @ApiProduces('text/event-stream')
  @ApiResponse({ status: 200, description: 'text/event-stream' })
  @ApiResponse({ status: 503, type: ErrorResponseDto, description: 'ASSISTANT_DISABLED' })
  async chat(
    @CurrentScope() scope: AccessScope,
    @Body() dto: AssistantChatDto,
    @Res() res: Response,
  ): Promise<void> {
    // ตรวจทุกอย่างที่ตอบเป็นรหัส HTTP ได้ให้เสร็จก่อนส่งหัว SSE — หลังจากนั้นเปลี่ยนรหัสไม่ได้แล้ว
    if (!this.assistant.status.enabled) {
      throw new ServiceUnavailableException({
        error: { code: 'ASSISTANT_DISABLED', message: 'ຜູ້ຊ່ວຍ AI ຍັງບໍ່ໄດ້ເປີດໃຊ້' },
      });
    }
    const last = dto.messages[dto.messages.length - 1];
    if (!last || last.role !== 'user' || last.content.trim().length === 0) {
      throw new ValidationError('VALIDATION_ERROR', 'ຂໍ້ຄວາມສຸດທ້າຍຕ້ອງເປັນຄຳຖາມຂອງຜູ້ໃຊ້', [
        { field: 'messages', message: 'ຂໍ້ຄວາມສຸດທ້າຍຕ້ອງເປັນຄຳຖາມຂອງຜູ້ໃຊ້' },
      ]);
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    // no-transform กันพร็อกซีหรือตัวบีบอัดกักข้อความไว้จนครบก้อน — ผู้ใช้จะเห็นคำตอบโผล่ทีเดียวตอนจบ
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    /*
     * ผู้ใช้ปิดหน้าหรือกดหยุด = ยกเลิกคำขอไป Claude ด้วย
     * ฟังที่ res ไม่ใช่ req — ใน Node รุ่นใหม่ req ส่ง close ทันทีที่อ่าน body จบ
     * ถ้าฟังที่ req ทุกคำถามจะถูกยกเลิกตั้งแต่ก่อนเริ่ม
     */
    const abort = new AbortController();
    res.on('close', () => abort.abort());

    const emit = (event: AssistantEvent): void => {
      if (res.writableEnded || abort.signal.aborted) return;
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    await this.assistant.chat(scope, dto.messages, emit, abort.signal);
    emit({ type: 'done' });
    res.end();
  }
}
