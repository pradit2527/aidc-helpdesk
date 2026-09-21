import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
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
import { ApiEnvelope, ApiEnvelopePage, ErrorResponseDto } from '../../common/http/envelope.dto';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import type { AccessScope } from '../../common/scope';
import {
  AssignTicketDto,
  ChangePriorityDto,
  ChangeStatusDto,
  CreateTicketDto,
  LinkTicketDto,
  TicketAssigneeDto,
  TicketDetailDto,
  TicketListItemDto,
  // รูปร่างที่ service คืนมา — EnvelopeInterceptor จะแยก items ไปไว้ที่ data
  // และแยกตัวเลขแบ่งหน้าไปไว้ที่ meta ก่อนส่งออก
  TicketListResponseDto,
} from './dto/ticket.dto';
import { TicketsService } from './tickets.service';

@ApiTags('Tickets')
@Controller('tickets')
@UseGuards(ScopeGuard)
/*
 * ต้องประกาศให้ Swagger รู้ว่า endpoint กลุ่มนี้ต้องยืนยันตัวตน
 *
 * ScopeGuard บังคับอยู่แล้วในโค้ด แต่ Swagger อ่านจาก decorator เท่านั้น
 * ถ้าไม่ประกาศ เอกสารจะแสดงว่าเรียกได้เลยโดยไม่ต้องล็อกอิน ทั้งที่ของจริงตอบ 401
 * คนที่มาต่อ API จะเสียเวลาไล่หาว่าทำไมถูกปฏิเสธ — เอกสารที่บอกผิด
 * แย่กว่าไม่มีเอกสาร เพราะมันทำให้คนเชื่อในสิ่งที่ไม่จริง
 *
 * ใส่ที่ระดับ class เพื่อให้ครอบทุก endpoint ในนี้ และไม่ต้องไล่ใส่ทีละตัว
 * ซึ่งเป็นวิธีที่ทำให้ลืมได้อีกในอนาคต
 */
@ApiCookieAuth('cookie')
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
  @ApiQuery({
    name: 'project_id',
    required: false,
    type: Number,
    description:
      'เฉพาะเรื่องของโครงการใน Support Hub นี้ (id จาก `GET /support-projects`) · ' +
      'ทำให้แคบลงภายในขอบเขตเดิมเท่านั้น ไม่เคยทำให้กว้างขึ้น · id นอกขอบเขตได้รายการว่าง',
  })
  @ApiQuery({ name: 'q', required: false, description: 'ค้นจากเลขที่ หัวข้อ หรือรายละเอียด' })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['-updated_at', '-created_at', '-assigned_at'],
    description:
      'ใหม่สุดอยู่บนเสมอ · `-updated_at` แก้ไขล่าสุด (ค่าเริ่มต้น) · `-created_at` แจ้งเข้ามาล่าสุด · ' +
      '`-assigned_at` ถูกมอบหมายให้ผู้รับผิดชอบคนปัจจุบันล่าสุด (คิวงานของฉัน) · ค่าอื่นถูกเพิกเฉย',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'page_size', required: false, type: Number, example: 20 })
  @ApiEnvelopePage(TicketListItemDto, {
    description: 'รายการอยู่ที่ data · ตัวเลขแบ่งหน้าอยู่ที่ meta',
  })
  list(
    @CurrentScope() scope: AccessScope,
    @Query() query: Record<string, string>,
  ): Promise<TicketListResponseDto> {
    return this.tickets.list(scope, query);
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
  @ApiEnvelope(TicketDetailDto, { status: 201 })
  @ApiResponse({ status: 422, type: ErrorResponseDto, description: 'ข้อมูลไม่ผ่านการตรวจสอบ' })
  create(
    @CurrentScope() scope: AccessScope,
    @Body() dto: CreateTicketDto,
  ): Promise<TicketDetailDto> {
    return this.tickets.create(scope, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'รายละเอียดเรื่อง',
    description: [
      'คืนบล็อก **`can`** ที่ backend ประเมินสิทธิ์ระดับ ticket ให้แล้ว',
      'frontend ใช้ซ่อน/แสดงปุ่มโดยไม่ต้องเขียนกฎ RBAC ซ้ำอีกชุด (FE-02)',
      '',
      '**`available_transitions`** คือสถานะที่ผู้เรียกคนนี้เปลี่ยนไปได้จากสถานะปัจจุบัน',
      'ใช้กฎชุดเดียวกับที่ `POST /tickets/{id}/status` ตัดสินจริง',
      '',
      'ไม่พบข้อมูล **หรือ** อยู่นอกขอบเขต ตอบ `404` เหมือนกัน',
      'เพื่อไม่ยืนยันว่า id นี้มีอยู่จริงในบริษัทอื่น',
    ].join('\n'),
  })
  @ApiParam({ name: 'id', example: 1042 })
  @ApiEnvelope(TicketDetailDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  detail(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TicketDetailDto> {
    return this.tickets.detail(scope, id);
  }

  @Post(':id/status')
  @ApiOperation({
    summary: 'เปลี่ยนสถานะ',
    description: [
      'ต้องเป็น transition ที่อนุญาตใน state machine 7 สถานะ',
      '',
      '**ใครทำอะไรได้**',
      '- เจ้าหน้าที่ (`ticket.change_status`) — ทุกเส้นที่ตารางอนุญาต · ยกเลิกต้องมี `ticket.cancel` ด้วย',
      '- ผู้แจ้ง — ยืนยันปิดเรื่องที่แก้แล้ว · เปิดคืน (`ticket.reopen`) · ถอนเรื่องที่ยังเป็น `new`',
      '',
      '**กฎที่ระบบบังคับ**',
      '- `pending_user` ต้องระบุ `pending_reason` และ `reason` ≥ 10 ตัวอักษร',
      '  เหตุผล `user` / `vendor` ส่งข้อความถึงผู้แจ้งเสมอ — ใช้ `comment` ถ้ามี ไม่มีใช้ `reason` (SLA 5.4)',
      '- `resolved` ต้องมี `resolution_note` ≥ 15 ตัวอักษร และ checklist ที่บังคับต้องครบ',
      '  มิฉะนั้นตอบ `409 CHECKLIST_INCOMPLETE`',
      '- `cancelled` ต้องมี `reason` · เปิดคืนต้องมี `reason` ≥ 10 ตัวอักษร และนับเพิ่ม `reopen_count`',
      '- `satisfaction_score` (1–5) รับเฉพาะผู้แจ้งตอนยืนยันปิด',
      '- ออกจาก `pending_user` หรือเปิดคืน ระบบเลื่อน `resolution_due_at` ออกไปเท่าเวลาที่หยุดนับ',
      '- เริ่มงานเรื่องที่ยังไม่มีผู้รับผิดชอบ ผู้กดถูกตั้งเป็นผู้รับผิดชอบ',
      '- ทุกครั้งเขียน `ticket_status_history` และ `audit_log` ในทรานแซกชันเดียวกัน',
    ].join('\n'),
  })
  @ApiParam({ name: 'id', example: 1042 })
  @ApiBody({ type: ChangeStatusDto })
  @ApiEnvelope(TicketDetailDto)
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'TICKET_INVALID_TRANSITION · CHECKLIST_INCOMPLETE · TICKET_REOPEN_WINDOW_EXPIRED',
  })
  changeStatus(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeStatusDto,
  ): Promise<TicketDetailDto> {
    return this.tickets.changeStatus(scope, id, dto);
  }

  @Get(':id/assignees')
  @ApiOperation({
    summary: 'ผู้ที่มอบหมายเรื่องนี้ให้ได้',
    description: [
      'คืนเฉพาะคนที่ผู้เรียก **มอบหมายให้ได้จริง** ไม่ใช่ทุกคนที่มีสิทธิ์รับเรื่อง —',
      'กติกาชุดเดียวกับที่ `POST /tickets/{id}/assign` ตัดสิน จึงไม่มีชื่อที่เลือกแล้วถูกปฏิเสธ',
      '',
      '| ผู้เรียก | เห็นใคร |',
      '|---|---|',
      '| `user.assign_role` (company_admin / super_admin) | ทุกคนที่รับเรื่องของบริษัทนี้ได้ |',
      '| หัวหน้าทีม (`is_lead` ในทีมที่เปิดใช้งาน) | สมาชิกในทีมของตน ∩ คนที่รับเรื่องนี้ได้ + ตัวเอง |',
      '| เจ้าหน้าที่อื่น | ตัวเองคนเดียว (สำหรับปุ่ม "รับงานเอง") |',
      '',
      'ต้องมีสิทธิ์ `ticket.assign` หรือ `ticket.assign_self`',
      '',
      '- `is_me` ผู้เรียกเอง — อยู่บนสุดเสมอ จากนั้นเรียงคนที่งานค้างน้อยที่สุดก่อน',
      '- `team` ทีมที่ทำให้คนนี้อยู่ในรายการ · `null` = ยังไม่ได้อยู่ทีมใด',
      '- `is_lead` เป็นหัวหน้าของทีมที่แสดงในช่อง `team`',
      '- `open_tickets` เรื่องที่ยังอยู่ในมือ (`new` / `assigned` / `in_progress` / `pending_user`)',
      '  นับข้ามบริษัท เพราะเป็นภาระจริงของคนคนนั้น',
    ].join('\n'),
  })
  @ApiParam({ name: 'id', example: 1042 })
  @ApiResponse({ status: 200, type: [TicketAssigneeDto] })
  assignees(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TicketAssigneeDto[]> {
    return this.tickets.assignees(scope, id);
  }

  @Post(':id/assign')
  @ApiOperation({
    summary: 'มอบหมายผู้รับผิดชอบ หรือรับงานเอง',
    description: [
      '- รับเอง (`assignee_id` = ตัวเอง) ต้องมี `ticket.assign_self` — กติกาเดิม ไม่เปลี่ยน',
      '- **มอบให้คนอื่น** ต้องมี `ticket.assign` **และ** อย่างใดอย่างหนึ่ง',
      '  - ระดับผู้ดูแล (`user.assign_role`) → มอบให้ใครก็ได้ที่รับเรื่องของบริษัทนี้ได้',
      '  - เป็นหัวหน้าทีม (`is_lead` ในทีมที่เปิดใช้งาน) → มอบให้สมาชิกในทีมของตนเท่านั้น',
      '',
      '  มิฉะนั้นตอบ `403 NOT_TEAM_LEAD` · เป็นหัวหน้าจริงแต่เลือกคนนอกทีม ตอบ',
      '  `422 ASSIGNEE_NOT_IN_TEAM` (field `assignee_id`)',
      '',
      '  ⚠️ `ticket.assign` อย่างเดียวไม่พอแล้ว — เจ้าหน้าที่ทุกคนถือสิทธิ์นี้อยู่',
      '  ตัวที่แยกหัวหน้าออกจากลูกทีมคือข้อมูลทีม ไม่ใช่ role หรือ permission ใหม่',
      '',
      '- ผู้รับต้องอยู่ในรายการ `GET /tickets/{id}/assignees` มิฉะนั้นตอบ `422 ASSIGNEE_NOT_ELIGIBLE`',
      '- เรื่องที่เป็น `new` ขยับเป็น `assigned` ในคำสั่งเดียวกัน สถานะอื่นคงเดิม',
      '- เรื่องที่แก้แล้ว / ปิดแล้ว / ยกเลิกแล้ว ตอบ `409 TICKET_NOT_ASSIGNABLE`',
      '- `comment` ถ้าระบุ เป็นข้อความสาธารณะถึงผู้แจ้ง และนับเป็นการตอบรับครั้งแรก (SLA 5.1)',
      '- เปลี่ยนมือ (ไม่ใช่รับครั้งแรก) นับเพิ่ม `assignee_change_count` ซึ่งเป็นตัวตั้งของ KPI-3',
    ].join('\n'),
  })
  @ApiParam({ name: 'id', example: 1042 })
  @ApiBody({ type: AssignTicketDto })
  @ApiEnvelope(TicketDetailDto)
  @ApiResponse({ status: 403, type: ErrorResponseDto, description: 'NOT_TEAM_LEAD' })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'TICKET_NOT_ASSIGNABLE · TICKET_ASSIGNEE_UNCHANGED',
  })
  @ApiResponse({
    status: 422,
    type: ErrorResponseDto,
    description: 'ASSIGNEE_NOT_ELIGIBLE · ASSIGNEE_NOT_IN_TEAM',
  })
  assign(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTicketDto,
  ): Promise<TicketDetailDto> {
    return this.tickets.assign(scope, id, dto);
  }

  @Post(':id/link')
  @ApiOperation({
    summary: 'ผูกเรื่องนี้กับอีกใบหนึ่ง',
    description: [
      'ใช้กับคู่เรื่องที่เกิดจากเหตุเดียวกันแต่ต้องเดินคนละ SLA — ตัวอย่างของ SA คือ',
      'โน้ตบุ๊กพัง (`incident`) แล้วเปิดคำขอเบิกเครื่องทดแทน (`service_request`)',
      '',
      '- **ผูกสองทางเสมอ** — เปิดใบไหนก็เห็นอีกใบใน `related_ticket`',
      '- เฟส 1 ผูกได้ **ใบเดียวต่อเรื่อง** เรียกซ้ำด้วย id ใหม่จะทับของเดิม',
      '- ทั้งสองใบต้องอยู่ **บริษัทเดียวกัน** และอยู่ในขอบเขตของผู้เรียกทั้งคู่',
      '  ใบที่อยู่นอกขอบเขตตอบ `404` เหมือนตอนเปิดดูมันตรง ๆ',
      '- ต้องมีสิทธิ์ `ticket.change_status` (เจ้าหน้าที่เท่านั้น — ผู้แจ้งผูกเองไม่ได้)',
    ].join('\n'),
  })
  @ApiParam({ name: 'id', example: 1042 })
  @ApiBody({ type: LinkTicketDto })
  @ApiEnvelope(TicketDetailDto)
  @ApiResponse({ status: 404, type: ErrorResponseDto, description: 'NOT_FOUND — ใบใดใบหนึ่งอยู่นอกขอบเขต' })
  @ApiResponse({
    status: 422,
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR — ผูกกับตัวเอง หรือคนละบริษัท',
  })
  link(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LinkTicketDto,
  ): Promise<TicketDetailDto> {
    return this.tickets.link(scope, id, dto);
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
  @ApiEnvelope(TicketDetailDto)
  changePriority(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangePriorityDto,
  ): Promise<TicketDetailDto> {
    return this.tickets.changePriority(scope, id, dto);
  }

  @Post(':id/comments')
  @ApiOperation({
    summary: 'เพิ่มความเห็นในเรื่อง',
    description:
      '`is_internal: true` ต้องมีสิทธิ์ `ticket.comment_internal` — ผู้แจ้งตั้งเองไม่ได้ · ' +
      'ความเห็นสาธารณะครั้งแรกจากคนที่ไม่ใช่ผู้แจ้ง จะถูกบันทึกเป็น ' +
      '`first_response_at` ซึ่งเป็นตัวตั้งของ KPI-2 · ' +
      '`counted_as_first_response` ในคำตอบบอกว่ารอบนี้ถูกนับหรือไม่',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['body'],
      properties: {
        body: { type: 'string' },
        is_internal: { type: 'boolean', example: false },
      },
    },
  })
  addComment(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { body: string; is_internal?: boolean },
  ) {
    return this.tickets.addComment(scope, id, body);
  }
}
