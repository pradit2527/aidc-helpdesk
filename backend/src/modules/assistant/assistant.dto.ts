import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** จำนวนข้อความย้อนหลังที่ส่งมาได้ต่อคำขอ — ยาวกว่านี้ค่าใช้จ่ายโตตามทุกคำถาม */
export const ASSISTANT_MAX_TURNS = 30;
export const ASSISTANT_MAX_MESSAGE_LENGTH = 4000;

export class AssistantTurnDto {
  @ApiProperty({ enum: ['user', 'assistant'], example: 'user' })
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty({ example: 'ເຊື່ອມຕໍ່ Wi-Fi ບໍ່ໄດ້ຕັ້ງແຕ່ເຊົ້າ', maxLength: ASSISTANT_MAX_MESSAGE_LENGTH })
  @IsString()
  @MinLength(1)
  @MaxLength(ASSISTANT_MAX_MESSAGE_LENGTH)
  content!: string;
}

export class AssistantChatDto {
  @ApiProperty({
    type: [AssistantTurnDto],
    description:
      'บทสนทนาทั้งหมดตั้งแต่ต้น ข้อความสุดท้ายต้องเป็นของผู้ใช้ — ' +
      'ระบบไม่เก็บบทสนทนาไว้ฝั่งเซิร์ฟเวอร์ หน้าจอส่งมาใหม่ทุกครั้ง',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ASSISTANT_MAX_TURNS)
  @ValidateNested({ each: true })
  @Type(() => AssistantTurnDto)
  messages!: AssistantTurnDto[];
}

export class AssistantStatusDto {
  @ApiProperty({ example: true }) enabled!: boolean;
  @ApiProperty({ example: 'claude-opus-5' }) model!: string;
}
