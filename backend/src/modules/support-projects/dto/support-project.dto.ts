import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { RefCompanyDto, RefNamedDto } from '../../../common/dto/common.dto';
import { SUPPORT_PROJECT_LOCALES } from '../../../db/schema/support-project';

/** รูปแบบรหัสโครงการ — ตรงกับ check constraint ck_support_project_code_format */
export const SUPPORT_PROJECT_CODE_PATTERN = /^[A-Z0-9_]{2,40}$/;

export class SupportProjectChatwootDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 1,
    description: 'เลข inbox ชนิด Website ใน Chatwoot · null = ยังไม่ได้ผูก',
  })
  inbox_id!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'kLm7...',
    description:
      'token ของ widget — **เปิดเผยได้** Chatwoot ออกแบบให้ token นี้อยู่ในสคริปต์ที่ทุกหน้าเว็บโหลด',
  })
  website_token!: string | null;
}

export class SupportProjectDto {
  @ApiProperty({ example: 1 }) id!: number;
  @ApiProperty({ example: 'ILP' }) code!: string;
  @ApiProperty({ example: 'ILP' }) name!: string;

  @ApiProperty({ type: String, nullable: true, example: 'https://ilp.aidclaos.com' })
  website_url!: string | null;

  @ApiProperty({ enum: SUPPORT_PROJECT_LOCALES, example: 'lo' })
  locale!: 'lo' | 'th' | 'en';

  @ApiProperty({ example: true }) is_active!: boolean;

  @ApiProperty({
    type: RefCompanyDto,
    nullable: true,
    description: 'null = โครงการส่วนกลาง ใช้ร่วมทั้งกลุ่ม',
  })
  company!: RefCompanyDto | null;

  @ApiProperty({ type: RefNamedDto, nullable: true, description: 'หมวดหมู่ตั้งต้นเมื่อยกระดับเป็น ticket' })
  default_category!: RefNamedDto | null;

  @ApiProperty({ type: RefNamedDto, nullable: true })
  team!: RefNamedDto | null;

  @ApiProperty({ type: SupportProjectChatwootDto })
  chatwoot!: SupportProjectChatwootDto;

  @ApiProperty({ example: 3, description: 'จำนวนแชทของโครงการนี้ที่ยังเปิดอยู่' })
  open_chats!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '/api/v1/integrations/chatwoot/events',
    description:
      'เส้นทางที่ต้องใส่ใน Chatwoot → Settings → Integrations → Webhooks (ยังไม่รวมโฮสต์และ `?token=`) · ' +
      'null = ยังไม่ได้ตั้ง CHATWOOT_WEBHOOK_TOKEN จึงยังใช้ทาง webhook ไม่ได้',
  })
  webhook_url_hint!: string | null;

  @ApiProperty({ example: '2026-09-17T03:20:00.000Z' }) created_at!: string;
}

export class ChatwootInboxDto {
  @ApiProperty({ example: 1 }) id!: number;
  @ApiProperty({ example: 'AIDC Helpdesk & Support' }) name!: string;

  @ApiProperty({ example: 'Channel::WebWidget', description: 'มีเฉพาะ widget ของเว็บเท่านั้นในรายการนี้' })
  channel_type!: string;

  @ApiProperty({ type: String, nullable: true, example: 'https://aidc-helpdesk.vercel.app' })
  website_url!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'token สาธารณะของ widget' })
  website_token!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'ILP',
    description: 'รหัสโครงการที่ผูก inbox นี้อยู่แล้ว · null = ยังว่าง',
  })
  linked_project_code!: string | null;
}

/** ผลของ GET /public/support-projects/{code} — ไม่ผ่านซองมาตรฐาน */
export class PublicSupportProjectDto {
  @ApiProperty({ example: 'ILP' }) code!: string;
  @ApiProperty({ example: 'ILP' }) name!: string;
  @ApiProperty({ enum: SUPPORT_PROJECT_LOCALES, example: 'lo' }) locale!: 'lo' | 'th' | 'en';

  @ApiProperty({
    description: 'ค่าที่สคริปต์ฝังต้องใช้เรียก widget ของ Chatwoot',
    example: { base_url: 'http://helpdesk.aidclaos.com', website_token: 'kLm7...' },
  })
  chatwoot!: { base_url: string; website_token: string };
}

export class ChatwootWebhookAckDto {
  @ApiProperty({ example: true, description: 'รับเรื่องแล้ว — ไม่ได้แปลว่าซิงก์เสร็จ' })
  ok!: boolean;
}

export class CreateSupportProjectDto {
  @ApiProperty({
    example: 'ILP',
    maxLength: 40,
    description: 'ตัวพิมพ์ใหญ่ ตัวเลข และ _ ยาว 2–40 ตัวอักษร · สคริปต์ฝังใช้ค่านี้เรียกหาตัวเอง',
  })
  @IsString()
  @Matches(SUPPORT_PROJECT_CODE_PATTERN, { message: 'ໃຊ້ A-Z 0-9 ແລະ _ ຍາວ 2–40 ຕົວອັກສອນ' })
  code!: string;

  @ApiProperty({ example: 'ILP', maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'https://ilp.aidclaos.com', maxLength: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website_url?: string | null;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description: 'null = โครงการส่วนกลาง (เฉพาะ super_admin) · ต้องเป็นบริษัทในขอบเขตของผู้เรียก',
  })
  @IsOptional()
  @IsInt()
  company_id?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'หมวดหมู่ ticket ที่ต้องอยู่ในขอบเขตของผู้เรียก' })
  @IsOptional()
  @IsInt()
  default_category_id?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'ทีมสนับสนุนที่ต้องอยู่ในขอบเขตของผู้เรียก' })
  @IsOptional()
  @IsInt()
  team_id?: number | null;

  @ApiPropertyOptional({
    example: 1,
    nullable: true,
    description: 'เลข inbox จาก `GET /support-projects/chatwoot-inboxes` · ผูกซ้ำกับโครงการอื่นไม่ได้ (409)',
  })
  @IsOptional()
  @IsInt()
  chatwoot_inbox_id?: number | null;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  chatwoot_website_token?: string | null;

  @ApiPropertyOptional({ enum: SUPPORT_PROJECT_LOCALES, default: 'lo' })
  @IsOptional()
  @IsIn([...SUPPORT_PROJECT_LOCALES])
  locale?: 'lo' | 'th' | 'en';

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateSupportProjectDto {
  @ApiPropertyOptional({ example: 'ILP', maxLength: 40 })
  @IsOptional()
  @IsString()
  @Matches(SUPPORT_PROJECT_CODE_PATTERN, { message: 'ໃຊ້ A-Z 0-9 ແລະ _ ຍາວ 2–40 ຕົວອັກສອນ' })
  code?: string;

  @ApiPropertyOptional({ example: 'ILP', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website_url?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  company_id?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  default_category_id?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  team_id?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  chatwoot_inbox_id?: number | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  chatwoot_website_token?: string | null;

  @ApiPropertyOptional({ enum: SUPPORT_PROJECT_LOCALES })
  @IsOptional()
  @IsIn([...SUPPORT_PROJECT_LOCALES])
  locale?: 'lo' | 'th' | 'en';

  @ApiPropertyOptional({
    description: 'false = ปิดโครงการ · รอบค้นหาบทสนทนาใหม่ข้ามโครงการที่ปิดทันที',
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
