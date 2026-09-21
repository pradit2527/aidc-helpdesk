import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { TICKET_STATUS, TICKET_TYPE, type TicketStatus, type TicketType } from '../../common/constants';
import { ApiEnvelope } from '../../common/http/envelope.dto';
import { clampPage, clampPageSize } from '../../common/http/pagination';
import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import { TicketReportDto } from './dto/ticket-report.dto';
import { ReportsService } from './reports.service';

/**
 * แปลง id จาก query string — รับเฉพาะจำนวนเต็มบวก ค่าอื่นถือว่าไม่ได้ส่ง
 *
 * ไม่ตอบ 422 เพราะ id ที่ "ไม่ถูกต้อง" กับ id ที่ "อยู่นอกขอบเขต" ต้องได้ผลเหมือนกัน
 * (รายงานเปล่า) — ถ้าแยกคำตอบ ผู้เรียกจะเดาได้ว่าเลขไหนมีอยู่จริง
 */
function parseId(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** คั่นด้วยจุลภาค · ค่าที่ไม่ใช่สถานะจริงถูกตัดทิ้ง ไม่ส่งต่อไปฐานข้อมูล */
function parseStatuses(raw: string | undefined): TicketStatus[] {
  if (!raw) return [];
  const known = new Set<string>(TICKET_STATUS);
  const wanted = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => known.has(s));
  return [...new Set(wanted)] as TicketStatus[];
}

/**
 * ชนิดของเรื่อง — ค่าที่ไม่รู้จักถือว่าไม่ได้ส่งมา
 *
 * กติกาเดียวกับ parseId ทุกข้อ: ไม่ตอบ 422 เพราะ "ค่าผิด" กับ "ไม่ได้กรอง"
 * ต้องได้ผลเหมือนกัน คือรายงานของทุกชนิด ไม่ใช่ข้อความผิดพลาด
 */
function parseTicketType(raw: string | undefined): TicketType | undefined {
  if (!raw) return undefined;
  return (TICKET_TYPE as readonly string[]).includes(raw) ? (raw as TicketType) : undefined;
}

@ApiTags('Reports')
@Controller('reports')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('kpi')
  @ApiOperation({
    summary: 'KPI-1…KPI-7 เทียบเป้าหมาย (SLA 7.1)',
    description:
      '`value: null` แปลว่าตัวหารเป็นศูนย์ — ยังไม่มีข้อมูลพอวัด ไม่ใช่ 0% หรือ 100% · ' +
      'KPI-2 อยู่แยกใน `kpi2_first_response` เพราะแยกราย priority เสมอ ' +
      '(P1 นับนาทีปฏิทิน P2–P4 นับนาทีทำการ เฉลี่ยรวมกันไม่ได้) · ' +
      '`sip_required: true` เมื่อมี KPI ตกเป้า ซึ่ง SLA 7.3 บังคับให้ทำ Service Improvement Plan',
  })
  @ApiQuery({ name: 'from', required: false, description: 'ISO 8601 · ค่าเริ่มต้น = ต้นเดือนปัจจุบัน' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO 8601 · ค่าเริ่มต้น = ตอนนี้' })
  kpi(@CurrentScope() scope: AccessScope, @Query('from') from?: string, @Query('to') to?: string) {
    scope.require('report.view', 'report.export');
    return this.reports.kpi(scope, this.reports.resolvePeriod(from, to));
  }

  @Get('sla-compliance')
  @ApiOperation({
    summary: 'KPI-1 แยกตามบริษัท × ระดับความสำคัญ',
    description:
      'ticket ที่มี `sla_exclusion_code` ถูกตัดออกจากตัวหารแล้ว ไม่ใช่นับเป็นผ่าน ' +
      '(SLA ภาคผนวก ก.2) · `compliance_percent: null` = ไม่มีเรื่องปิดในช่องนั้น',
  })
  @ApiQuery({ name: 'from', required: false, description: 'ISO 8601' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO 8601' })
  slaCompliance(
    @CurrentScope() scope: AccessScope,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    scope.require('report.view', 'report.export');
    return this.reports.slaCompliance(scope, this.reports.resolvePeriod(from, to));
  }

  @Get('tickets')
  @ApiOperation({
    summary: 'รายงานเรื่องแจ้ง กรองตาม บริษัท / แผนก / สถานะ / รายบุคคล',
    description: [
      'คืนยอดรวม แยกตามสถานะ ระดับ ผู้รับผิดชอบ บริษัท แผนก และรายการเรื่องที่ตรงเงื่อนไข **ในคำขอเดียว** — ทุกส่วนใช้เงื่อนไขชุดเดียวกัน',
      '',
      '- ช่วงเวลาตัดจาก `created_at` (เรื่องที่แจ้งเข้ามาในช่วงนั้น) · ค่าเริ่มต้น = ต้นเดือนปัจจุบันถึงตอนนี้',
      '- ใช้ขอบเขตเดียวกับ `GET /tickets` ทุกข้อ (row-level scoping): บริษัทตาม user_role_scope · ',
      '  `company_id` ที่อยู่นอกขอบเขตถูก **ตัดทิ้งเงียบ ๆ** แล้วได้รายงานเปล่า ไม่ตอบ 403 (US-07 AC-2) · ',
      '  เรื่องที่ตั้งธงเหตุความปลอดภัยเห็นเฉพาะผู้เกี่ยวข้อง (SOP-10 ข้อ 2)',
      '- ไม่ระบุ `company_id` = ทุกบริษัทในขอบเขตของผู้เรียก · super_admin = ทั้งกลุ่ม',
      '- `breached` = เกินกำหนดแก้ไข: ธง `is_resolution_breached` · หรือ `resolved_at > resolution_due_at` · ',
      '  หรือยังเปิดอยู่ (ไม่รวม pending_user ที่หยุดนับ) และเลยกำหนดแล้ว · ตัดใบที่มี `sla_exclusion_code` ออก (SLA ภาคผนวก ก.2)',
      '- `met_percent` ของแต่ละมิติคิดเฉพาะกลุ่ม resolved + closed · ตัวหารเป็นศูนย์คืน `null` ไม่ใช่ 0 หรือ 100',
      '- `assignee_id` กับ `requester_id` ระบุพร้อมกันได้ (AND) · `tickets.total` เท่ากับ `totals.total` เสมอ',
      '- `project_id` = เว็บของกลุ่มที่เรื่องมาจาก (AIDC Support Hub) · แถวแต่ละใบมี `support_project` กำกับ',
      '  และมีสรุป `by_project` ที่แถว `project: null` คือเรื่องที่แจ้งในระบบตามปกติ · ',
      '  ตัวกรองนี้ทำให้ผลแคบลงภายในขอบเขตเดิมเท่านั้น ไม่เคยทำให้กว้างขึ้น',
      '- `ticket_type` = กรองเฉพาะเหตุขัดข้องหรือคำขอบริการ · กติกาเดียวกับ `project_id`',
      '- `incident_metrics` และ `service_request_metrics` คิดจาก **ชนิดของตัวเองเสมอ** ',
      '  ไม่ว่าจะส่ง `ticket_type` มาหรือไม่ — กรอง `ticket_type=incident` แล้ว ',
      '  `service_request_metrics` จะเป็นศูนย์ทั้งก้อน ไม่ใช่กลายเป็นตัวเลขของเหตุขัดข้อง',
      '- ต้องมีสิทธิ์ `report.view` หรือ `report.export`',
    ].join('\n'),
  })
  @ApiQuery({ name: 'company_id', required: false, type: Number, description: 'ต้องอยู่ในขอบเขตของผู้เรียก' })
  @ApiQuery({ name: 'department_id', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: TICKET_STATUS,
    isArray: true,
    description: 'คั่นด้วยจุลภาค เช่น `new,in_progress` · ไม่ระบุ = ทุกสถานะ',
  })
  @ApiQuery({ name: 'assignee_id', required: false, type: Number, description: 'ผู้รับผิดชอบ' })
  @ApiQuery({ name: 'requester_id', required: false, type: Number, description: 'ผู้แจ้ง' })
  @ApiQuery({
    name: 'project_id',
    required: false,
    type: Number,
    description:
      'โครงการใน Support Hub (id จาก `GET /support-projects`) — เฉพาะเรื่องที่มาจากเว็บนั้น · ' +
      'id ที่อยู่นอกขอบเขตถูกตัดทิ้งเงียบ ๆ แล้วได้รายงานเปล่า เหมือน `company_id`',
  })
  @ApiQuery({
    name: 'ticket_type',
    required: false,
    enum: TICKET_TYPE,
    description:
      'เฉพาะเหตุขัดข้อง หรือเฉพาะคำขอบริการ · ไม่ระบุ = ทั้งสองชนิด · ' +
      'ค่าที่ไม่รู้จักถูกตัดทิ้งเงียบ ๆ เหมือน `company_id`',
  })
  @ApiQuery({ name: 'from', required: false, description: 'ISO 8601 · ค่าเริ่มต้น = ต้นเดือนปัจจุบัน' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO 8601 · ค่าเริ่มต้น = ตอนนี้' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'ของส่วน tickets' })
  @ApiQuery({ name: 'page_size', required: false, type: Number, example: 20, description: 'สูงสุด 100' })
  @ApiEnvelope(TicketReportDto)
  ticketReport(
    @CurrentScope() scope: AccessScope,
    @Query('company_id') companyId?: string,
    @Query('department_id') departmentId?: string,
    @Query('status') status?: string,
    @Query('assignee_id') assigneeId?: string,
    @Query('requester_id') requesterId?: string,
    @Query('project_id') projectId?: string,
    @Query('ticket_type') ticketType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ): Promise<TicketReportDto> {
    scope.require('report.view', 'report.export');
    return this.reports.ticketReport(
      scope,
      {
        companyId: parseId(companyId),
        departmentId: parseId(departmentId),
        status: parseStatuses(status),
        assigneeId: parseId(assigneeId),
        requesterId: parseId(requesterId),
        projectId: parseId(projectId),
        ticketType: parseTicketType(ticketType),
        page: clampPage(page),
        pageSize: clampPageSize(pageSize),
      },
      this.reports.resolvePeriod(from, to),
    );
  }
}
