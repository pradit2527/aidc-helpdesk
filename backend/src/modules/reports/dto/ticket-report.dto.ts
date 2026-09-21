import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  PRIORITY,
  TICKET_STATUS,
  TICKET_TYPE,
  type Priority,
  type TicketStatus,
  type TicketType,
} from '../../../common/constants';
import {
  RefCategoryDto,
  RefCompanyDto,
  RefNamedDto,
  RefProjectDto,
  RefUserDto,
} from '../../../common/dto/common.dto';

/**
 * รายงานเรื่องแจ้งแบบกรองได้ — GET /reports/tickets
 *
 * ตอบทุกส่วนในคำขอเดียว (ยอดรวม · แยกตามมิติต่าง ๆ · รายการที่ตรงเงื่อนไข)
 * เพราะทุกส่วนใช้ WHERE ชุดเดียวกัน ถ้าแยกเป็นหลาย endpoint หน้าจอต้องส่ง
 * ตัวกรองซ้ำหลายรอบ และเสี่ยงที่ตัวเลขสรุปกับรายการจะมาจากคนละเงื่อนไข
 * โดยที่ไม่มีอะไรฟ้อง
 */

/** ตัวกรองที่ controller แปลงจาก query string แล้ว — ค่าที่แปลงไม่ได้กลายเป็น undefined */
export interface TicketReportFilters {
  companyId?: number | undefined;
  departmentId?: number | undefined;
  /** ว่าง = ทุกสถานะ */
  status: TicketStatus[];
  assigneeId?: number | undefined;
  requesterId?: number | undefined;
  /**
   * เฉพาะเรื่องของโครงการใน Support Hub นี้ (ticket.support_project_id)
   *
   * ⚠️ ทำให้แคบลงภายในขอบเขตของผู้เรียกเท่านั้น ไม่เคยทำให้กว้างขึ้น —
   *    เงื่อนไขขอบเขตบริษัทยังถูกบังคับก่อนเสมอ (ticketScopeWhere)
   */
  projectId?: number | undefined;
  /**
   * เฉพาะเรื่องชนิดนี้ — `incident` หรือ `service_request`
   *
   * กติกาเดียวกับ projectId ทุกข้อ: ทำให้แคบลงภายในขอบเขตเดิมเท่านั้น
   * ค่าที่ไม่รู้จักถือว่าไม่ได้ส่งมา ไม่ตอบ 422
   */
  ticketType?: TicketType | undefined;
  page: number;
  pageSize: number;
}

export class ReportPeriodDto {
  @ApiProperty({ example: '2026-08-31T17:00:00.000Z' }) from!: string;
  @ApiProperty({ example: '2026-09-16T08:12:00.000Z' }) to!: string;
  @ApiProperty({ example: '2026-08-31 → 2026-09-16' }) label!: string;
}

export class TicketReportFiltersDto {
  @ApiPropertyOptional({ example: 7, nullable: true }) company_id!: number | null;
  @ApiPropertyOptional({ example: 22, nullable: true }) department_id!: number | null;
  @ApiProperty({ enum: TICKET_STATUS, isArray: true, example: ['new', 'in_progress'] })
  status!: TicketStatus[];
  @ApiPropertyOptional({ example: 88, nullable: true }) assignee_id!: number | null;
  @ApiPropertyOptional({ example: null, nullable: true }) requester_id!: number | null;
  @ApiPropertyOptional({
    example: 1,
    nullable: true,
    description: 'โครงการใน Support Hub — id ที่อยู่นอกขอบเขตถูกตัดทิ้งเงียบ ๆ เหมือน company_id',
  })
  project_id!: number | null;
  @ApiPropertyOptional({
    enum: TICKET_TYPE,
    nullable: true,
    example: null,
    description: 'ชนิดของเรื่อง — ค่าที่ไม่รู้จักถูกตัดทิ้งเงียบ ๆ เหมือน company_id',
  })
  ticket_type!: TicketType | null;
}

/**
 * ตัวชี้วัดเฉพาะสายเหตุขัดข้อง
 *
 * แยกจากยอดรวมกลางเพราะวัดคนละอย่างกับคำขอบริการโดยสิ้นเชิง —
 * การเอามาเฉลี่ยรวมกันคือการบวกเวลา "กู้ของที่พัง" เข้ากับเวลา "จัดหาของใหม่"
 * ซึ่งตัวเลขที่ได้ไม่ตอบคำถามของใครเลย (หลักเดียวกับที่ KPI-2 ต้องแยกราย priority)
 */
export class IncidentMetricsDto {
  @ApiProperty({ example: 24, description: 'จำนวนเหตุขัดข้องทั้งหมดในเงื่อนไข' })
  total!: number;

  @ApiPropertyOptional({
    example: 312.5,
    nullable: true,
    description:
      'MTTR — เวลาเฉลี่ยจากเริ่มจับเวลาถึง `resolved` หน่วยเป็น**นาทีทำการ** ' +
      'หักเวลาที่หยุดนับออกแล้ว · null เมื่อยังไม่มีใบไหนถูกแก้เสร็จในช่วงนี้',
  })
  mttr_business_minutes!: number | null;

  @ApiProperty({ example: 18, description: 'ตัวหารของ MTTR — ใบที่มี resolved_at แล้ว' })
  resolved_count!: number;

  @ApiPropertyOptional({
    example: 94.4,
    nullable: true,
    description: 'ในกลุ่มที่จบแล้ว: ไม่เกินกำหนด ÷ จบแล้ว × 100 · null เมื่อตัวหารเป็นศูนย์',
  })
  sla_met_percent!: number | null;

  @ApiProperty({
    example: 3,
    description: 'ผลรวม `reopen_count` ของทุกใบ — ไม่ใช่จำนวนใบที่เคยถูกเปิดคืน',
  })
  reopen_total!: number;

  @ApiProperty({ example: 2, description: 'จำนวนใบที่เคยถูกเปิดคืนอย่างน้อยหนึ่งครั้ง' })
  reopened_tickets!: number;
}

/** รายการที่ถูกขอบ่อยที่สุด — ใช้ตัดสินว่าอะไรควรทำเป็นบริการอัตโนมัติก่อน */
export class TopCatalogItemDto {
  @ApiProperty({ example: 55 }) id!: number;
  @ApiProperty({ example: 'SR-PASSWORD-RESET' }) code!: string;
  @ApiProperty({ example: 'ຣີເຊັດລະຫັດຜ່ານ' }) name_th!: string;
  @ApiProperty({ example: 42 }) count!: number;
}

/** ตัวชี้วัดเฉพาะสายคำขอบริการ */
export class ServiceRequestMetricsDto {
  @ApiProperty({ example: 61 }) total!: number;

  @ApiPropertyOptional({
    example: 1240.0,
    nullable: true,
    description:
      'เวลาเฉลี่ยจาก**จุดเริ่มนาฬิกา fulfillment** ถึง `fulfilled` หน่วยเป็นนาทีทำการ · ' +
      'จุดเริ่มคือเวลาที่อนุมัติครบ (`sla_clock_started_at`) ไม่ใช่เวลาที่เปิดเรื่อง — ' +
      'เวลาที่รอหัวหน้าอนุมัติจึงไม่ถูกนับเป็นเวลาของไอที · null เมื่อยังไม่มีใบที่ส่งมอบ',
  })
  avg_fulfillment_business_minutes!: number | null;

  @ApiProperty({ example: 37, description: 'ตัวหารของเวลาเฉลี่ย — ใบที่ส่งมอบแล้ว' })
  fulfilled_count!: number;

  @ApiProperty({
    example: 5,
    description: 'จำนวนใบที่ค้างอยู่ใน `pending_approval` ณ ตอนนี้ — คอขวดที่ไอทีแก้เองไม่ได้',
  })
  pending_approval_count!: number;

  @ApiProperty({ example: 1, description: 'จำนวนใบที่ถูกปฏิเสธ (`rejected`)' })
  rejected_count!: number;

  @ApiProperty({
    type: [TopCatalogItemDto],
    description: 'รายการที่ถูกขอมากที่สุด เรียงจากมากไปน้อย · สูงสุด 10 รายการ',
  })
  top_catalog_items!: TopCatalogItemDto[];
}

export class TicketReportTotalsDto {
  @ApiProperty({ example: 137 }) total!: number;
  @ApiProperty({ example: 42, description: 'new + assigned + in_progress + pending_user' })
  open!: number;
  @ApiProperty({ example: 18 }) resolved!: number;
  @ApiProperty({ example: 70 }) closed!: number;
  @ApiProperty({ example: 7 }) cancelled!: number;

  @ApiProperty({
    example: 9,
    description:
      'เกินกำหนดแก้ไข — ธง is_resolution_breached · หรือ resolved_at > resolution_due_at · ' +
      'หรือยังเปิดอยู่ (ไม่รวมที่พักนับ) และเลยกำหนดแล้ว · ตัดใบที่มี sla_exclusion_code ออก (SLA ภาคผนวก ก.2)',
  })
  breached!: number;

  @ApiPropertyOptional({
    example: 6.6,
    nullable: true,
    description: 'breached / total × 100 · null เมื่อ total = 0 — ไม่ใช่ 0%',
  })
  breached_percent!: number | null;

  @ApiPropertyOptional({
    example: 4.3,
    nullable: true,
    description: 'คะแนนความพอใจเฉลี่ย 1–5 · null เมื่อยังไม่มีใบไหนถูกประเมิน',
  })
  avg_satisfaction!: number | null;

  @ApiProperty({ example: 31, description: 'จำนวนใบที่มีคะแนน — ต้องอ่านคู่กับค่าเฉลี่ยเสมอ' })
  rated!: number;
}

export class TicketReportStatusRowDto {
  @ApiProperty({ enum: TICKET_STATUS, example: 'in_progress' }) status!: TicketStatus;
  @ApiProperty({ example: 12 }) count!: number;
}

export class TicketReportPriorityRowDto {
  @ApiProperty({ enum: PRIORITY, example: 'P2' }) priority!: Priority;
  @ApiProperty({ example: 12 }) count!: number;
}

/** ตัวเลขชุดเดียวกันที่ใช้กับทุกมิติ (ผู้รับผิดชอบ · บริษัท · แผนก) */
export class TicketReportRollupDto {
  @ApiProperty({ example: 40 }) total!: number;
  @ApiProperty({ example: 9 }) open!: number;
  @ApiProperty({ example: 28, description: 'resolved + closed' }) done!: number;
  @ApiProperty({ example: 3 }) breached!: number;
  @ApiPropertyOptional({
    example: 92.9,
    nullable: true,
    description: 'ในกลุ่ม done: ไม่เกินกำหนด / done × 100 · null เมื่อ done = 0',
  })
  met_percent!: number | null;
}

export class TicketReportAssigneeRowDto extends TicketReportRollupDto {
  @ApiPropertyOptional({
    type: RefUserDto,
    nullable: true,
    description: 'null = แถวของเรื่องที่ยังไม่มีผู้รับผิดชอบ — ต้องมีเพื่อให้ยอดรวมทุกแถวเท่ากับ totals.total',
  })
  assignee!: RefUserDto | null;
}

export class TicketReportCompanyRowDto extends TicketReportRollupDto {
  @ApiProperty({ type: RefCompanyDto }) company!: RefCompanyDto;
}

export class TicketReportDepartmentRowDto extends TicketReportRollupDto {
  @ApiProperty({ type: RefCompanyDto }) company!: RefCompanyDto;
  @ApiPropertyOptional({ type: RefNamedDto, nullable: true, description: 'null = ไม่ระบุแผนก' })
  department!: RefNamedDto | null;
}

export class TicketReportProjectRowDto extends TicketReportRollupDto {
  @ApiPropertyOptional({
    type: RefProjectDto,
    nullable: true,
    description:
      'null = แถวของเรื่องที่ไม่ได้มาจากโครงการใน Support Hub (แจ้งในระบบตามปกติ) — ' +
      'ต้องมีเพื่อให้ยอดรวมทุกแถวเท่ากับ totals.total',
  })
  project!: RefProjectDto | null;
}

/**
 * แถวรายการในรายงาน — รูปย่อของ TicketListItemDto
 *
 * ไม่มีบล็อก sla แบบเต็ม (นาทีทำการที่เหลือ) เพราะการคำนวณต้องอ่านปฏิทินและ
 * นโยบายของแต่ละบริษัท ซึ่งไม่คุ้มสำหรับหน้ารายงานที่ต้องการแค่ "ทันหรือเกิน"
 * ฟิลด์ที่มีชื่อเดียวกับ TicketListItemDto มีความหมายเดียวกันทุกตัว
 */
export class TicketReportItemDto {
  @ApiProperty({ example: 1042 }) id!: number;
  @ApiProperty({ example: 'AIDC-LOG-202609-0042' }) ticket_no!: string;
  @ApiProperty({ enum: TICKET_TYPE, example: 'incident' }) ticket_type!: TicketType;
  @ApiProperty({ example: 'ເຄື່ອງສະແກນບາໂຄດສາງ 2 ອ່ານບໍ່ຕິດ' }) subject!: string;
  @ApiProperty({ enum: TICKET_STATUS, example: 'in_progress' }) status!: TicketStatus;
  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description: 'เหตุผลย่อยของการพัก ใช้กับ `pending_user` เท่านั้น · ข้อความอิสระ',
  })
  pending_reason!: string | null;
  @ApiProperty({ enum: PRIORITY, example: 'P2' }) priority!: Priority;
  @ApiProperty({ type: RefCompanyDto }) company!: RefCompanyDto;
  @ApiPropertyOptional({ type: RefNamedDto, nullable: true }) department!: RefNamedDto | null;
  @ApiProperty({ type: RefCategoryDto }) category!: RefCategoryDto;

  @ApiPropertyOptional({
    type: RefProjectDto,
    nullable: true,
    description:
      'เว็บของกลุ่มที่เรื่องนี้มาจาก (AIDC Support Hub) · null = แจ้งในระบบตามปกติ · ' +
      'ตรงกับตัวกรอง `project_id`',
  })
  support_project!: RefProjectDto | null;

  @ApiProperty({ type: RefUserDto }) requester!: RefUserDto;
  @ApiPropertyOptional({ type: RefUserDto, nullable: true }) assignee!: RefUserDto | null;
  @ApiProperty({ example: '2026-09-07T02:30:00.000Z' }) created_at!: string;
  @ApiPropertyOptional({ example: null, nullable: true }) resolution_due_at!: string | null;
  @ApiPropertyOptional({ example: null, nullable: true }) resolved_at!: string | null;
  @ApiPropertyOptional({ example: null, nullable: true }) closed_at!: string | null;

  @ApiProperty({
    example: false,
    description: 'เกินกำหนดแก้ไขตามนิยามเดียวกับ totals.breached — คำนวณตอนอ่าน',
  })
  is_resolution_breached!: boolean;

  @ApiPropertyOptional({ example: null, nullable: true }) sla_exclusion_code!: string | null;
  @ApiPropertyOptional({ example: null, nullable: true }) satisfaction_score!: number | null;
  @ApiProperty({ example: 0 }) reopen_count!: number;
  @ApiProperty({ example: '2026-09-07T04:00:00.000Z' }) updated_at!: string;
}

export class TicketReportListDto {
  @ApiProperty({ type: [TicketReportItemDto] }) items!: TicketReportItemDto[];
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) page_size!: number;
  @ApiProperty({ example: 137 }) total!: number;
  @ApiProperty({ example: 7 }) total_pages!: number;
}

export class TicketReportDto {
  @ApiProperty({ type: ReportPeriodDto }) period!: ReportPeriodDto;
  @ApiProperty({ type: TicketReportFiltersDto, description: 'ตัวกรองที่ระบบใช้จริงหลังแปลงค่า' })
  filters!: TicketReportFiltersDto;
  @ApiProperty({ type: TicketReportTotalsDto }) totals!: TicketReportTotalsDto;
  @ApiProperty({ type: [TicketReportStatusRowDto], description: 'ครบทั้ง 7 สถานะเสมอ · ที่ไม่มีเป็น 0' })
  by_status!: TicketReportStatusRowDto[];
  @ApiProperty({ type: [TicketReportPriorityRowDto], description: 'ครบ P1–P4 เสมอ · ที่ไม่มีเป็น 0' })
  by_priority!: TicketReportPriorityRowDto[];
  @ApiProperty({ type: [TicketReportAssigneeRowDto], description: 'เรียงตามจำนวนมากไปน้อย' })
  by_assignee!: TicketReportAssigneeRowDto[];
  @ApiProperty({ type: [TicketReportCompanyRowDto], description: 'เฉพาะบริษัทที่มีเรื่องในเงื่อนไข' })
  by_company!: TicketReportCompanyRowDto[];
  @ApiProperty({ type: [TicketReportDepartmentRowDto] })
  by_department!: TicketReportDepartmentRowDto[];

  @ApiProperty({
    type: [TicketReportProjectRowDto],
    description:
      'แยกตามเว็บของกลุ่มที่เรื่องมาจาก · แถว `project: null` คือเรื่องที่แจ้งในระบบตามปกติ · ' +
      'เรียงตามจำนวนมากไปน้อย',
  })
  by_project!: TicketReportProjectRowDto[];

  @ApiProperty({
    type: IncidentMetricsDto,
    description:
      'ตัวชี้วัดของเหตุขัดข้องในเงื่อนไขเดียวกัน — คำนวณจากเฉพาะใบที่ `ticket_type = incident` ' +
      'เสมอ ไม่ว่าจะส่งตัวกรอง `ticket_type` มาหรือไม่',
  })
  incident_metrics!: IncidentMetricsDto;

  @ApiProperty({
    type: ServiceRequestMetricsDto,
    description:
      'ตัวชี้วัดของคำขอบริการในเงื่อนไขเดียวกัน — คำนวณจากเฉพาะใบที่ ' +
      '`ticket_type = service_request` เสมอ',
  })
  service_request_metrics!: ServiceRequestMetricsDto;

  @ApiProperty({
    type: TicketReportListDto,
    description: 'รายการที่ตรงเงื่อนไข เรียงจากแจ้งล่าสุด · tickets.total เท่ากับ totals.total เสมอ',
  })
  tickets!: TicketReportListDto;
}
