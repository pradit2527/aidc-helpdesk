import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  CHANNEL,
  IMPACT,
  PENDING_REASON,
  PRIORITY,
  SLA_EXCLUSION_CODE,
  SLA_STATUS,
  SOURCE_DEVICE,
  TICKET_STATUS,
  TICKET_TYPE,
  URGENCY,
  type Channel,
  type Impact,
  type PendingReason,
  type Priority,
  type SlaStatus,
  type TicketStatus,
  type TicketType,
  type Urgency,
} from '../../../common/constants';
import {
  RefCategoryDto,
  RefCompanyDto,
  RefNamedDto,
  RefUserDto,
} from '../../../common/dto/common.dto';

// ══════════════════════ สร้างเรื่องใหม่ ══════════════════════

export class CreateTicketDto {
  @ApiPropertyOptional({
    enum: TICKET_TYPE,
    default: 'incident',
    description: 'Tier 1 บังคับเลือกตาม SOP-01 ข้อ 2 — แยกเหตุขัดข้องออกจากคำขอบริการ',
  })
  @IsOptional()
  @IsIn(TICKET_TYPE)
  ticket_type?: TicketType;

  @ApiProperty({ example: 'ເຄື່ອງສະແກນບາໂຄດສາງ 2 ອ່ານບໍ່ຕິດ', maxLength: 255 })
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  subject!: string;

  @ApiProperty({
    example: 'ເຄື່ອງສະແກນ 3 ໜ່ວຍທີ່ໂຊນຮັບສິນຄ້າສາງ 2 ອ່ານບໍ່ຕິດຕັ້ງແຕ່ເຊົ້າ ມີລົດລໍຖ້າ 4 ຄັນ',
  })
  @IsString()
  @MinLength(10)
  description!: string;

  @ApiProperty({ example: 79 })
  @IsInt()
  category_id!: number;

  @ApiProperty({
    enum: IMPACT,
    example: 'department',
    description: 'ผู้แจ้งตอบคำถาม "ปัญหานี้กระทบใครบ้าง"',
  })
  @IsIn(IMPACT)
  impact!: Impact;

  @ApiProperty({
    enum: URGENCY,
    example: 'high',
    description: 'ผู้แจ้งตอบคำถาม "เร่งด่วนแค่ไหน"',
  })
  @IsIn(URGENCY)
  urgency!: Urgency;

  @ApiPropertyOptional({
    example: 7,
    description: 'ค่าเริ่มต้น = บริษัทของผู้เรียก · ระบุได้เฉพาะเมื่ออยู่ในขอบเขตสิทธิ์',
  })
  @IsOptional()
  @IsInt()
  company_id?: number;

  @ApiPropertyOptional({ example: 22 })
  @IsOptional()
  @IsInt()
  department_id?: number;

  @ApiPropertyOptional({ example: 14, description: 'ระบบงานที่เกี่ยวข้อง — จำเป็นต่อ KPI Uptime' })
  @IsOptional()
  @IsInt()
  service_id?: number;

  @ApiPropertyOptional({
    example: 145,
    description: 'ค่าเริ่มต้น = ผู้เรียก · ระบุคนอื่นได้เฉพาะผู้ที่มีสิทธิ์ ticket.create_for_other',
  })
  @IsOptional()
  @IsInt()
  requester_id?: number;

  @ApiPropertyOptional({
    example: 55,
    description: 'บังคับเมื่อ ticket_type = service_request — กำหนดเป้าหมายเวลารายรายการ',
  })
  @IsOptional()
  @IsInt()
  catalog_item_id?: number;

  @ApiPropertyOptional({ enum: CHANNEL, default: 'portal' })
  @IsOptional()
  @IsIn(CHANNEL)
  channel?: Channel;

  @ApiPropertyOptional({ enum: SOURCE_DEVICE, example: 'mobile_web' })
  @IsOptional()
  @IsIn(SOURCE_DEVICE)
  source_device?: string;

  @ApiPropertyOptional({ example: 'SCN-LOG-0031', description: 'หมายเลขทรัพย์สิน (ข้อความอิสระ)' })
  @IsOptional()
  @IsString()
  asset_tag?: string;

  @ApiPropertyOptional({ type: [Number], example: [9012, 9013] })
  @IsOptional()
  @IsArray()
  attachment_ids?: number[];
}

// ══════════════════════ บล็อก SLA ══════════════════════

export class TicketSlaDto {
  @ApiPropertyOptional({ example: 2 }) policy_id?: number;
  @ApiPropertyOptional({ example: 'AIDC-IT-SLA-001' }) doc_ref?: string;
  @ApiPropertyOptional({ example: '1.1' }) doc_version?: string;

  @ApiProperty({
    enum: ['business_hours', 'calendar_24x7'],
    example: 'business_hours',
    description: 'P1 นับต่อเนื่อง 24×7 · P2–P4 นับเฉพาะเวลาทำการ (SLA 5.4)',
  })
  clock_mode!: string;

  @ApiPropertyOptional({ example: '2026-08-31T09:15:00+07:00' })
  clock_started_at?: string | null;

  @ApiPropertyOptional({ example: '2026-08-31T09:45:00+07:00' })
  response_due_at?: string | null;

  @ApiPropertyOptional({ example: '2026-08-31T17:15:00+07:00' })
  resolution_due_at?: string | null;

  @ApiPropertyOptional({ example: null }) first_response_at?: string | null;

  @ApiProperty({ enum: SLA_STATUS, example: 'at_risk' })
  status!: SlaStatus;

  @ApiPropertyOptional({ example: 42 })
  remaining_minutes?: number | null;

  @ApiProperty({
    enum: ['business_minutes', 'calendar_minutes'],
    example: 'business_minutes',
    description:
      'สำคัญ: frontend ต้องไม่ทำนาฬิกานับถอยหลัง เพราะนาทีทำการหยุดนอกเวลาทำการ (FE-07)',
  })
  remaining_unit!: string;

  @ApiPropertyOptional({ example: '2026-08-31T13:15:00+07:00' })
  next_status_report_due_at?: string | null;

  @ApiProperty({ example: false }) is_response_breached!: boolean;
  @ApiProperty({ example: false }) is_resolution_breached!: boolean;

  @ApiPropertyOptional({ example: null, description: 'เวลาที่เข้าสถานะรอผู้แจ้งครั้งล่าสุด' })
  paused_at?: string | null;

  @ApiPropertyOptional({ enum: PENDING_REASON, example: null })
  pending_reason?: PendingReason | null;

  @ApiProperty({ example: 0 }) pending_duration_minutes!: number;

  @ApiPropertyOptional({ example: null, description: 'หยุดนับ resolution ของ incident (SLA 5.4)' })
  workaround_at?: string | null;

  @ApiPropertyOptional({ enum: SLA_EXCLUSION_CODE, example: null })
  exclusion_code?: string | null;
}

// ══════════════════════ บล็อก can ══════════════════════

export class TicketCanDto {
  @ApiProperty({ example: true }) update!: boolean;
  @ApiProperty({ example: false }) assign!: boolean;
  @ApiProperty({ example: false }) claim!: boolean;
  @ApiProperty({ example: false }) change_status!: boolean;
  @ApiProperty({ example: false }) change_priority!: boolean;
  @ApiProperty({ example: true }) request_priority_review!: boolean;
  @ApiProperty({ example: true }) comment!: boolean;
  @ApiProperty({ example: false }) comment_internal!: boolean;
  @ApiProperty({ example: true }) attach!: boolean;
  @ApiProperty({ example: false }) close!: boolean;
  @ApiProperty({ example: false }) reopen!: boolean;
  @ApiProperty({ example: true }) cancel!: boolean;
  @ApiProperty({ example: false }) set_workaround!: boolean;
  @ApiProperty({ example: false }) change_tier!: boolean;
  @ApiProperty({ example: false }) delete!: boolean;
}

// ══════════════════════ รายการและรายละเอียด ══════════════════════

export class TicketListItemDto {
  @ApiProperty({ example: 1042 }) id!: number;
  @ApiProperty({ example: 'AIDC-LOG-202608-0042' }) ticket_no!: string;
  @ApiProperty({ enum: TICKET_TYPE, example: 'incident' }) ticket_type!: TicketType;
  @ApiProperty({ example: 'ເຄື່ອງສະແກນບາໂຄດສາງ 2 ອ່ານບໍ່ຕິດ' }) subject!: string;
  @ApiProperty({ enum: TICKET_STATUS, example: 'in_progress' }) status!: TicketStatus;
  @ApiPropertyOptional({ enum: PENDING_REASON, example: null })
  pending_reason?: PendingReason | null;

  @ApiProperty({
    enum: PRIORITY,
    example: 'P2',
    description: 'ระบบคำนวณจาก impact × urgency — ส่งค่านี้มาตอนสร้างไม่ได้',
  })
  priority!: Priority;

  @ApiProperty({ example: 1, minimum: 1, maximum: 3 }) support_tier!: number;
  @ApiProperty({ type: RefCompanyDto }) company!: RefCompanyDto;
  @ApiPropertyOptional({ type: RefNamedDto }) department?: RefNamedDto | null;
  @ApiProperty({ type: RefCategoryDto }) category!: RefCategoryDto;
  @ApiProperty({ type: RefUserDto }) requester!: RefUserDto;
  @ApiPropertyOptional({ type: RefUserDto }) assignee?: RefUserDto | null;
  @ApiProperty({ type: TicketSlaDto }) sla!: TicketSlaDto;
  @ApiProperty({ example: 0 }) reopen_count!: number;
  @ApiProperty({ example: 3 }) comment_count!: number;
  @ApiProperty({ example: 2 }) attachment_count!: number;
  @ApiProperty({ example: '2026-08-31T09:15:00+07:00' }) created_at!: string;
  @ApiProperty({ example: '2026-08-31T11:02:00+07:00' }) updated_at!: string;
}

export class TicketListResponseDto {
  @ApiProperty({ type: [TicketListItemDto] }) items!: TicketListItemDto[];
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) page_size!: number;
  @ApiProperty({ example: 7 }) total!: number;
  @ApiProperty({ example: 1 }) total_pages!: number;
}

export class TicketDetailDto extends TicketListItemDto {
  @ApiProperty({ example: 'ເຄື່ອງສະແກນ 3 ໜ່ວຍທີ່ໂຊນຮັບສິນຄ້າສາງ 2 ອ່ານບໍ່ຕິດ...' })
  description!: string;

  @ApiProperty({ enum: IMPACT, example: 'department' }) impact!: Impact;
  @ApiProperty({ enum: URGENCY, example: 'high' }) urgency!: Urgency;
  @ApiProperty({ enum: CHANNEL, example: 'portal' }) channel!: Channel;

  @ApiProperty({
    type: TicketCanDto,
    description:
      'สิทธิ์ระดับ ticket ที่ backend คำนวณให้แล้ว — frontend ใช้ซ่อน/แสดงปุ่มโดยไม่ต้องเขียนกฎ RBAC ซ้ำ (FE-02)',
  })
  can!: TicketCanDto;
}

// ══════════════════════ เปลี่ยนสถานะ ══════════════════════

export class ChangeStatusDto {
  @ApiProperty({ enum: TICKET_STATUS, example: 'pending_user' })
  @IsIn(TICKET_STATUS)
  to_status!: TicketStatus;

  @ApiPropertyOptional({
    enum: PENDING_REASON,
    example: 'vendor',
    description: 'บังคับเมื่อ to_status = pending_user',
  })
  @IsOptional()
  @IsIn(PENDING_REASON)
  pending_reason?: PendingReason;

  @ApiPropertyOptional({
    example: 'ລໍຖ້າອາໄຫຼ່ຫົວອ່ານຈາກຜູ້ຈຳໜ່າຍ ກຳນົດສົ່ງ 3 ກັນຍາ',
    description: 'บังคับเมื่อ cancelled / pending_user / reopen',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description:
      'ถ้าระบุ ระบบสร้างคอมเมนต์สาธารณะให้ · บังคับเมื่อ pending_reason เป็น user หรือ vendor',
  })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: 'บังคับเมื่อ to_status = resolved' })
  @IsOptional()
  @IsString()
  resolution_note?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 5,
    description: 'รับได้เมื่อ to_status = closed โดยผู้แจ้ง (FE-04)',
  })
  @IsOptional()
  @IsInt()
  satisfaction_score?: number;

  @ApiPropertyOptional({ description: 'บทความ KB ที่ใช้แก้ปัญหา — รับเมื่อ resolved (FE-05)' })
  @IsOptional()
  @IsInt()
  resolved_by_kb_id?: number;
}

export class ChangePriorityDto {
  @ApiPropertyOptional({ enum: IMPACT })
  @IsOptional()
  @IsIn(IMPACT)
  impact?: Impact;

  @ApiPropertyOptional({ enum: URGENCY })
  @IsOptional()
  @IsIn(URGENCY)
  urgency?: Urgency;

  @ApiProperty({
    example: 'ກະທົບທັງສາງ ຮັບສິນຄ້າບໍ່ໄດ້ເລີຍຕັ້ງແຕ່ 11:00',
    description: 'บังคับทุกครั้ง — บันทึกใน ticket_status_history (SLA 5.4)',
  })
  @IsString()
  @MinLength(10)
  reason!: string;
}
