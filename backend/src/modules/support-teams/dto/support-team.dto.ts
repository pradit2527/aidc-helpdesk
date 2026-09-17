import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { RefCompanyDto } from '../../../common/dto/common.dto';

/** ทีมมีสมาชิกได้กี่คน — กันการส่งอาเรย์ยักษ์มาทำให้ทรานแซกชันค้าง */
export const TEAM_MEMBER_LIMIT = 200;

export class SupportTeamMemberDto {
  @ApiProperty({ example: 12 }) id!: number;
  @ApiProperty({ example: 'ກ໋ອຟ ພົມມະຈັນ' }) full_name!: string;
  @ApiProperty({ example: 'it.golf' }) username!: string;

  @ApiProperty({ example: true, description: 'หัวหน้าทีม — มอบหมายงานให้สมาชิกในทีมนี้ได้' })
  is_lead!: boolean;

  @ApiProperty({
    example: 4,
    description: 'จำนวนเรื่องที่ยังอยู่ในมือ (new / assigned / in_progress / pending_user)',
  })
  open_tickets!: number;
}

export class SupportTeamDto {
  @ApiProperty({ example: 1 }) id!: number;
  @ApiProperty({ example: 'it-helpdesk' }) code!: string;
  @ApiProperty({ example: 'ທີມ IT Helpdesk' }) name!: string;
  @ApiProperty({ example: null, nullable: true }) description!: string | null;
  @ApiProperty({ example: true }) is_active!: boolean;

  @ApiProperty({
    type: RefCompanyDto,
    nullable: true,
    description: 'null = ทีมส่วนกลาง ดูแลทุกบริษัทในกลุ่ม',
  })
  company!: RefCompanyDto | null;

  @ApiProperty({ type: [SupportTeamMemberDto], description: 'หัวหน้าขึ้นก่อนเสมอ' })
  members!: SupportTeamMemberDto[];
}

export class SupportTeamCandidateDto {
  @ApiProperty({ example: 12 }) id!: number;
  @ApiProperty({ example: 'ກ໋ອຟ ພົມມະຈັນ' }) full_name!: string;
  @ApiProperty({ example: 'it.golf' }) username!: string;
  @ApiProperty({ type: RefCompanyDto, description: 'บริษัทต้นสังกัด' }) company!: RefCompanyDto;
}

export class CreateSupportTeamDto {
  @ApiProperty({ example: 'ທີມ IT Helpdesk', maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    example: 'it-helpdesk',
    maxLength: 40,
    description:
      'ไม่ส่งมา = สร้างจากชื่อ (a-z 0-9 และ -) · ชื่อที่เป็นภาษาลาวล้วนจะสร้างรหัสไม่ได้ ต้องระบุเอง',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,39}$/, {
    message: 'ໃຊ້ a-z 0-9 ແລະ - ຍາວ 2–40 ຕົວອັກສອນ',
  })
  code?: string;

  @ApiPropertyOptional({ example: 'ດູແລເລື່ອງແຈ້ງທັງໝົດຂອງກຸ່ມ', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description: 'null = ทีมส่วนกลาง (เฉพาะ super_admin) · ต้องเป็นบริษัทในขอบเขตของผู้เรียก',
  })
  @IsOptional()
  @IsInt()
  company_id?: number | null;

  @ApiProperty({
    example: [12],
    type: [Number],
    description: 'ต้องมีอย่างน้อยหนึ่งคน — ทีมที่ไม่มีหัวหน้าคือทีมที่ไม่มีใครมอบหมายงานได้',
  })
  @IsArray()
  @ArrayMaxSize(TEAM_MEMBER_LIMIT)
  @IsInt({ each: true })
  lead_ids!: number[];

  @ApiProperty({
    example: [13, 14, 15, 16],
    type: [Number],
    description: 'หัวหน้าถูกนับเป็นสมาชิกให้อัตโนมัติ ไม่ต้องใส่ซ้ำ',
  })
  @IsArray()
  @ArrayMaxSize(TEAM_MEMBER_LIMIT)
  @IsInt({ each: true })
  member_ids!: number[];
}

export class UpdateSupportTeamDto {
  @ApiPropertyOptional({ example: 'ທີມ IT Helpdesk', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'it-helpdesk', maxLength: 40 })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,39}$/, {
    message: 'ໃຊ້ a-z 0-9 ແລະ - ຍາວ 2–40 ຕົວອັກສອນ',
  })
  code?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  company_id?: number | null;

  @ApiPropertyOptional({
    example: true,
    description: 'ปิดทีม = หัวหน้าทีมนั้นหมดอำนาจมอบหมายทันที (ไม่เกิน 30 วินาทีตามอายุแคชสิทธิ์)',
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    type: [Number],
    description: 'ส่งมา = แทนที่รายชื่อทั้งชุด ไม่ใช่เพิ่มทับของเดิม',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TEAM_MEMBER_LIMIT)
  @IsInt({ each: true })
  lead_ids?: number[];

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TEAM_MEMBER_LIMIT)
  @IsInt({ each: true })
  member_ids?: number[];
}
