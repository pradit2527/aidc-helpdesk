import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  CHANNEL,
  PRIORITY,
  SLA_STATUS,
  TICKET_STATUS,
  TICKET_TYPE,
} from '../../common/constants';
import { ErrorResponseDto } from '../../common/dto/common.dto';
import {
  ChangePriorityDto,
  ChangeStatusDto,
  CreateTicketDto,
  TicketDetailDto,
  TicketListResponseDto,
} from './dto/ticket.dto';
import { TicketsService } from './tickets.service';

@ApiTags('Tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @ApiOperation({
    summary: 'รายการเรื่องที่แจ้ง',
    description: [
      'คืนเฉพาะเรื่องที่อยู่ในขอบเขตของผู้เรียกเสมอ (row-level scoping)',
      '',
      '- `end_user` เห็นเฉพาะเรื่องที่ตนแจ้ง',
      '- `agent` / `company_admin` / `manager_viewer` เห็นตามบริษัทที่ได้รับสิทธิ์',
      '- `company_id` ที่อยู่นอกขอบเขตจะถูก **ตัดทิ้งเงียบ ๆ** ไม่ตอบ error',
      '  (ป้องกันการเดาว่าบริษัทนั้นมีข้อมูลเท่าไร — US-07 AC-2)',
      '- เรื่องที่ตั้งธงเหตุความปลอดภัยใช้ขอบเขตแคบกว่าบริษัท (SOP-10 ข้อ 2)',
    ].join('\n'),
  })
  @ApiQuery({ name: 'status', required: false, enum: TICKET_STATUS, isArray: true })
  @ApiQuery({ name: 'priority', required: false, enum: PRIORITY, isArray: true })
  @ApiQuery({ name: 'ticket_type', required: false, enum: TICKET_TYPE })
  @ApiQuery({ name: 'sla_status', required: false, enum: SLA_STATUS, isArray: true })
  @ApiQuery({ name: 'channel', required: false, enum: CHANNEL })
  @ApiQuery({ name: 'company_id', required: false, type: Number })
  @ApiQuery({ name: 'assignee_id', required: false, type: Number })
  @ApiQuery({ name: 'q', required: false, description: 'ค้นจากเลขที่ หัวข้อ หรือรายละเอียด' })
  @ApiQuery({ name: 'sort', required: false, example: '-priority,resolution_due_at' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'page_size', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, type: TicketListResponseDto })
  list(@Query() query: Record<string, string>): TicketListResponseDto {
    return this.tickets.list(query);
  }

  @Post()
  @ApiOperation({
    summary: 'แจ้งเรื่องใหม่',
    description: [
      '**ผู้แจ้งไม่ได้ส่งระดับความสำคัญมาเอง** — ส่ง `impact` และ `urgency`',
      'แล้วระบบคำนวณ `priority` (P1–P4) จากเมทริกซ์ตาม AIDC-IT-SLA-001 ข้อ 4',
      '',
      '| ผลกระทบ \\ ความเร่งด่วน | เร่งด่วนมาก | ปานกลาง | ไม่เร่งด่วน |',
      '|---|---|---|---|',
      '| ทั้งองค์กร | **P1** | **P2** | **P3** |',
      '| ทั้งแผนก | **P2** | **P3** | **P3** |',
      '| รายบุคคล | **P3** | **P3** | **P4** |',
      '',
      'ถ้าส่ง `priority` มาโดยตรงจะตอบ `422`',
      '',
      'รองรับ header `Idempotency-Key` กันการกดส่งซ้ำบนมือถือ',
    ].join('\n'),
  })
  @ApiBody({ type: CreateTicketDto })
  @ApiResponse({ status: 201, type: TicketDetailDto })
  @ApiResponse({ status: 422, type: ErrorResponseDto, description: 'ข้อมูลไม่ผ่านการตรวจสอบ' })
  create(@Body() dto: CreateTicketDto): TicketDetailDto {
    return this.tickets.create(dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'รายละเอียดเรื่อง',
    description: [
      'คืนบล็อก **`can`** ที่ backend ประเมินสิทธิ์ระดับ ticket ให้แล้ว',
      'frontend ใช้ซ่อน/แสดงปุ่มโดยไม่ต้องเขียนกฎ RBAC ซ้ำอีกชุด (FE-02)',
      '',
      'ไม่พบข้อมูล **หรือ** อยู่นอกขอบเขต ตอบ `404` เหมือนกัน',
      'เพื่อไม่ยืนยันว่า id นี้มีอยู่จริงในบริษัทอื่น',
    ].join('\n'),
  })
  @ApiParam({ name: 'id', example: 1042 })
  @ApiResponse({ status: 200, type: TicketDetailDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  detail(@Param('id', ParseIntPipe) id: number): TicketDetailDto {
    return this.tickets.detail(id);
  }

  @Post(':id/status')
  @ApiOperation({
    summary: 'เปลี่ยนสถานะ',
    description: [
      'ต้องเป็น transition ที่อนุญาตใน state machine 7 สถานะ',
      '',
      '**กฎที่ระบบบังคับ**',
      '- `pending_user` ต้องระบุ `pending_reason` เสมอ',
      '- `pending_reason = vendor` ต้องมีคอมเมนต์สาธารณะแจ้งผู้รับบริการก่อน',
      '  จึงจะหยุดนับเวลาได้ (SLA 5.4)',
      '- `resolved` ต้องมี `resolution_note` และ checklist ที่บังคับต้องครบ',
      '  มิฉะนั้นตอบ `409 CHECKLIST_INCOMPLETE`',
      '- ออกจาก `pending_user` ระบบเลื่อน `resolution_due_at` ออกไปเท่าเวลาที่หยุด',
    ].join('\n'),
  })
  @ApiParam({ name: 'id', example: 1042 })
  @ApiBody({ type: ChangeStatusDto })
  @ApiResponse({ status: 200, type: TicketDetailDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'INVALID_STATE_TRANSITION · CHECKLIST_INCOMPLETE · APPROVAL_PENDING',
  })
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeStatusDto,
  ): TicketDetailDto {
    return this.tickets.changeStatus(id, dto);
  }

  @Post(':id/priority')
  @ApiOperation({
    summary: 'ทบทวนระดับความสำคัญ',
    description: [
      '**กำหนดเวลาถูกคำนวณใหม่จากเวลาที่ปรับ ไม่ใช่จากเวลาที่สร้างเรื่อง**',
      '',
      'AIDC-IT-SLA-001 ข้อ 5.4 ระบุว่า *"ให้นับเวลาตามระดับใหม่ตั้งแต่เวลาที่ปรับ"*',
      'ถ้านับจาก `created_at` เรื่องที่เพิ่งยกระดับเป็น P1 จะกลายเป็นเกินกำหนดทันที',
      '',
      'ยกระดับเป็น P1 → ตั้งเป็นเหตุขัดข้องร้ายแรงและแจ้ง Head of IT ทันทีแม้นอกเวลาทำการ',
    ].join('\n'),
  })
  @ApiParam({ name: 'id', example: 1042 })
  @ApiBody({ type: ChangePriorityDto })
  @ApiResponse({ status: 200, type: TicketDetailDto })
  changePriority(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangePriorityDto,
  ): TicketDetailDto {
    return this.tickets.changePriority(id, dto);
  }
}
