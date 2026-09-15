import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
  @ApiProperty({ type: ChatPersonDto, nullable: true }) sender!: ChatPersonDto | null;
  @ApiProperty({ type: ChatAttachmentDto, nullable: true }) attachment!: ChatAttachmentDto | null;
  @ApiProperty({ example: '2026-09-14T08:12:00.000Z' }) created_at!: string;
}

export class SupportChatSummaryDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: ['open', 'closed'] }) status!: 'open' | 'closed';
  @ApiProperty({ type: ChatCompanyDto }) company!: ChatCompanyDto;
  @ApiProperty({ type: ChatRequesterDto }) requester!: ChatRequesterDto;
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
