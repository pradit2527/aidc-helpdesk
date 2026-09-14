import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** ตัวตนของผู้ใช้ที่ล็อกอินอยู่ สำหรับส่งให้หน้าต่างแชท Chatwoot */
export class ChatwootIdentityDto {
  @ApiProperty({
    example: 'somchai.k',
    description:
      'ชื่อผู้ใช้ — เป็น identifier ของผู้ติดต่อใน Chatwoot ' +
      'คนเดียวกันเปิดจากเครื่องไหนก็เห็นประวัติแชทเดียวกัน',
  })
  identifier!: string;

  @ApiPropertyOptional({
    example: 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    nullable: true,
    description:
      'HMAC-SHA256 ของ identifier ด้วย CHATWOOT_HMAC_TOKEN (identity validation) · ' +
      'null เมื่อ backend ยังไม่ได้ตั้งค่า',
  })
  identifier_hash!: string | null;

  @ApiProperty({ example: 'ສົມຊາຍ ກິດຕິວັດ' })
  name!: string;

  @ApiPropertyOptional({ example: 'somchai.k@aidctech.com.la', nullable: true })
  email!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { company: 'AIDC-HQ', department: 'ໄອທີ', job_title: 'IT Support', roles: 'end_user' },
    description: 'ให้เจ้าหน้าที่เห็นบริษัท แผนก ตำแหน่ง และบทบาทของผู้ถาม โดยไม่ต้องถามซ้ำ',
  })
  custom_attributes!: Record<string, string>;
}
