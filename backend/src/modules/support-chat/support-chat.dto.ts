import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { IMPACT, URGENCY, type Impact, type Urgency } from '../../common/constants';
import { SUPPORT_CHAT_ORIGIN } from '../../db/schema/support-chat';
import { TicketListItemDto } from '../tickets/dto/ticket.dto';
import { SUBJECT_MAX_LENGTH } from './chat-ticket';

export const SUPPORT_CHAT_MAX_BODY = 4000;

export class SendChatMessageDto {
  @ApiProperty({ example: 'ເຊື່ອມຕໍ່ Wi-Fi ບໍ່ໄດ້ຕັ້ງແຕ່ເຊົ້າ', maxLength: SUPPORT_CHAT_MAX_BODY })
  @IsString()
  @MinLength(1)
  @MaxLength(SUPPORT_CHAT_MAX_BODY)
  body!: string;
}

/** ช่องข้อความที่ส่งมาพร้อมไฟล์ใน multipart — ไม่บังคับ ส่งรูปหรือเสียงอย่างเดียวได้ */
export class SendChatFileDto {
  @ApiPropertyOptional({ example: 'ຮູບໜ້າຈໍ error', maxLength: SUPPORT_CHAT_MAX_BODY })
  @IsOptional()
  @IsString()
  @MaxLength(SUPPORT_CHAT_MAX_BODY)
  body?: string;
}

export class ChatInboxQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'closed'], default: 'open' })
  @IsOptional()
  @IsIn(['open', 'closed'])
  status?: 'open' | 'closed';

  @ApiPropertyOptional({
    example: 1,
    description: 'เฉพาะแชทของโครงการนี้ (id จาก `GET /support-projects`)',
  })
  @IsOptional()
  @IsInt()
  project_id?: number;

  @ApiPropertyOptional({
    enum: SUPPORT_CHAT_ORIGIN,
    description: '`helpdesk` = พนักงานเปิดในระบบ · `widget` = ผู้เข้าชมเว็บเปิดจาก widget',
  })
  @IsOptional()
  @IsIn([...SUPPORT_CHAT_ORIGIN])
  origin?: 'helpdesk' | 'widget';
}

export class ChatPersonDto {
  @ApiProperty({ example: 12 }) id!: number;
  @ApiProperty({ example: 'ນັດທະພົນ ສຸກເກສົມ' }) full_name!: string;
}

export class ChatRequesterDto extends ChatPersonDto {
  @ApiProperty({ nullable: true, type: String, example: 'ບັນຊີ' }) department!: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'ພະນັກງານບັນຊີ' }) job_title!: string | null;
}

export class ChatCompanyDto {
  @ApiProperty({ example: 1 }) id!: number;
  @ApiProperty({ example: 'HQ' }) code!: string;
}

export class ChatProjectDto {
  @ApiProperty({ example: 1 }) id!: number;
  @ApiProperty({ example: 'ILP' }) code!: string;
  @ApiProperty({ example: 'ILP' }) name!: string;
}

/**
 * ตัวตนของผู้เข้าชมเว็บ — มีเฉพาะแชทที่มาจาก widget
 *
 * ⚠️ `verified` คือสิ่งเดียวที่บอกว่าเชื่อ `email` ได้ไหม
 *    false = ผู้เข้าชมพิมพ์เองในฟอร์มก่อนแชท ซึ่งพิมพ์อีเมลของใครก็ได้
 *    true  = ระบบต้นทางเซ็นรับรองมาแล้วด้วย HMAC ของ inbox
 *    หน้าจอไม่ควรแสดงอีเมลที่ยังไม่ยืนยันในลักษณะที่ทำให้เข้าใจว่าเป็นตัวตนจริง
 */
export class ChatContactDto {
  @ApiProperty({ nullable: true, type: String, example: 'ນາງ ສົມໃຈ' }) name!: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'somjai@example.com' }) email!: string | null;
  @ApiProperty({ nullable: true, type: String, example: '+8562055550000' }) phone!: string | null;

  @ApiProperty({
    example: false,
    description: 'Chatwoot ยืนยันตัวตนด้วย HMAC แล้ว — เชื่อ `email` ได้เฉพาะเมื่อเป็น true',
  })
  verified!: boolean;
}

export class ChatAttachmentDto {
  @ApiProperty({ enum: ['image', 'audio', 'file'], description: 'image/audio แสดงในแชท · file เป็นลิงก์ดาวน์โหลด' })
  kind!: 'image' | 'audio' | 'file';

  @ApiProperty({ example: 'voice-message.webm' }) name!: string;
  @ApiProperty({ example: 'audio/webm', description: 'ตรวจจากเนื้อไฟล์จริง' }) mime_type!: string;
  @ApiProperty({ example: 48213 }) size!: number;

  @ApiProperty({
    example: '/support-chat/12/messages/345/file',
    description: 'ต่อท้าย base URL ของ API — ต้องเป็นคนในห้องจึงเปิดได้',
  })
  path!: string;
}

export class ChatLastMessageDto {
  @ApiProperty({ description: 'ตัดเหลือ 140 ตัวอักษร · ข้อความที่มีแต่ไฟล์แสดงเป็นป้าย เช่น "ຮູບພາບ"' })
  body!: string;

  @ApiProperty() from_staff!: boolean;
  @ApiProperty() is_system!: boolean;

  @ApiProperty({ enum: ['image', 'audio', 'file'], nullable: true })
  attachment_kind!: 'image' | 'audio' | 'file' | null;
}

export class SupportChatMessageDto {
  @ApiProperty() id!: number;
  @ApiProperty() chat_id!: number;
  @ApiProperty({ description: 'ว่างได้เมื่อข้อความเป็นไฟล์อย่างเดียว' }) body!: string;
  @ApiProperty({ description: 'ข้อความของระบบ เช่น "ทีมไอทีปิดแชทแล้ว"' }) is_system!: boolean;
  @ApiProperty({ description: 'true = ทีมไอทีเป็นคนส่ง' }) from_staff!: boolean;

  @ApiProperty({
    type: ChatPersonDto,
    nullable: true,
    description: 'ข้อความจากผู้เข้าชมเว็บและจากเจ้าหน้าที่ฝั่ง Chatwoot ใช้ `id: 0` (ไม่มีบัญชีใน Helpdesk)',
  })
  sender!: ChatPersonDto | null;
  @ApiProperty({ type: ChatAttachmentDto, nullable: true }) attachment!: ChatAttachmentDto | null;
  @ApiProperty({ example: '2026-09-14T08:12:00.000Z' }) created_at!: string;
}

export class SupportChatSummaryDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: ['open', 'closed'] }) status!: 'open' | 'closed';

  @ApiProperty({
    enum: SUPPORT_CHAT_ORIGIN,
    description: '`helpdesk` = พนักงานเปิดในระบบ · `widget` = ผู้เข้าชมเว็บเปิดจาก widget ของ Chatwoot',
  })
  origin!: 'helpdesk' | 'widget';

  @ApiProperty({
    type: ChatProjectDto,
    nullable: true,
    description: 'เว็บที่แชทนี้มาจาก · null สำหรับแชทที่เปิดในระบบเอง',
  })
  project!: ChatProjectDto | null;

  @ApiProperty({
    type: ChatContactDto,
    nullable: true,
    description: 'ไม่ใช่ null เฉพาะแชทจาก widget',
  })
  contact!: ChatContactDto | null;

  @ApiProperty({ type: ChatCompanyDto }) company!: ChatCompanyDto;

  @ApiProperty({
    type: ChatRequesterDto,
    description:
      'ไม่เคยเป็น null — แชทจาก widget ที่ยังไม่รู้ว่าเป็นใคร ใช้ `id: 0` กับชื่อจาก `contact.name` ' +
      'หรือ "ຜູ້ເຂົ້າຊົມເວັບ" · ถ้า Chatwoot ยืนยันตัวตนแล้วและอีเมลตรงกับบัญชีในระบบ จะเป็นบัญชีจริง',
  })
  requester!: ChatRequesterDto;
  @ApiProperty({ type: ChatPersonDto, nullable: true }) assignee!: ChatPersonDto | null;
  @ApiProperty({ nullable: true, type: Number }) ticket_id!: number | null;
  @ApiProperty() last_message_at!: string;
  @ApiProperty({ type: ChatLastMessageDto, nullable: true }) last_message!: ChatLastMessageDto | null;
  @ApiProperty({ description: 'มีข้อความจากอีกฝ่ายที่ผู้เรียกยังไม่ได้อ่าน' }) unread!: boolean;
  @ApiProperty() created_at!: string;
  @ApiProperty({ nullable: true, type: String }) closed_at!: string | null;
}

export class SupportChatThreadDto extends SupportChatSummaryDto {
  @ApiProperty({ type: [SupportChatMessageDto], description: 'เก่าไปใหม่ สูงสุด 300 ข้อความล่าสุด' })
  messages!: SupportChatMessageDto[];
}

export class SendChatMessageResponseDto {
  @ApiProperty({ type: SupportChatSummaryDto }) chat!: SupportChatSummaryDto;
  @ApiProperty({ type: SupportChatMessageDto }) message!: SupportChatMessageDto;
}

// ══════════════════════ ยกระดับแชทเป็นเรื่องแจ้ง ══════════════════════

export class ConvertChatToTicketDto {
  @ApiProperty({
    example: 'ເຂົ້າລະບົບ ILP ບໍ່ໄດ້ ຂຶ້ນວ່າລະຫັດຜິດ',
    minLength: 5,
    maxLength: SUBJECT_MAX_LENGTH,
    description: 'หัวข้อของเรื่อง — เจ้าหน้าที่สรุปเองจากบทสนทนา',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(SUBJECT_MAX_LENGTH)
  subject!: string;

  @ApiPropertyOptional({
    description:
      'ไม่ส่ง = ระบบถอดบทสนทนาในห้องให้เอง (มีเวลากำกับ · ติดป้ายผู้พูด · ตัดข้อความระบบออก · ' +
      `ยาวไม่เกิน ${SUPPORT_CHAT_MAX_BODY} ตัวอักษร แล้วบอกว่าที่เหลืออ่านได้ที่ห้องแชท)`,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @ApiPropertyOptional({
    example: 79,
    description:
      'ไม่ส่ง = ใช้ `default_category` ของโครงการที่ห้องนี้สังกัด · ' +
      'ถ้าโครงการไม่ได้ตั้งไว้และไม่ส่งมาด้วย จะได้ `422` ให้เลือกหมวดหมู่เอง',
  })
  @IsOptional()
  @IsInt()
  category_id?: number;

  @ApiPropertyOptional({ enum: IMPACT, default: 'individual' })
  @IsOptional()
  @IsIn(IMPACT)
  impact?: Impact;

  @ApiPropertyOptional({ enum: URGENCY, default: 'medium' })
  @IsOptional()
  @IsIn(URGENCY)
  urgency?: Urgency;
}

/**
 * ตัวตนของผู้เข้าชม ณ เวลาที่ยกระดับเป็นเรื่อง
 *
 * ⚠️ อยู่ใน **คำตอบเท่านั้น** ไม่ได้ถูกเขียนลงแถวของ ticket
 *    ห้องจาก widget ที่ยังไม่ผูกกับบัญชีใด ไม่มีคนใน Helpdesk ให้ตั้งเป็นผู้แจ้ง
 *    ระบบจึงใช้เจ้าหน้าที่ที่กดเป็นทั้งผู้แจ้งและผู้สร้าง — ค่านี้มีไว้ให้หน้าจอ
 *    บอกได้ว่า "คนที่ถามจริง ๆ คือใคร" โดยไม่ต้องเดาจากชื่อผู้แจ้งในตั๋ว
 */
export class ChatContactSnapshotDto {
  @ApiProperty({ nullable: true, type: String, example: 'ນາງ ສົມໃຈ' }) name!: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'somjai@example.com' }) email!: string | null;
  @ApiProperty({ nullable: true, type: String, example: '+8562055550000' }) phone!: string | null;
}

export class ConvertChatToTicketResponseDto {
  @ApiProperty({ type: SupportChatSummaryDto, description: 'ห้องเดิม พร้อม `ticket_id` ที่ผูกแล้ว' })
  chat!: SupportChatSummaryDto;

  @ApiProperty({
    type: TicketListItemDto,
    description: 'รูปเดียวกับแถวใน `GET /tickets` ทุกฟิลด์ — ไม่ใช่ DTO ชุดใหม่',
  })
  ticket!: TicketListItemDto;

  @ApiProperty({
    type: ChatContactSnapshotDto,
    nullable: true,
    description:
      'null เมื่อห้องนี้ไม่ได้มาจาก widget (ผู้แจ้งเป็นพนักงานที่มีบัญชีอยู่แล้ว) ' +
      'หรือผู้เข้าชมไม่ได้ฝากชื่อ อีเมล และเบอร์ไว้เลยสักช่อง — ไม่มีก้อนที่ว่างทั้งสามช่อง',
  })
  contact_snapshot!: ChatContactSnapshotDto | null;
}
