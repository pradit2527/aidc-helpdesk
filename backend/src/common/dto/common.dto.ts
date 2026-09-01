import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO กลางที่ทุก endpoint ใช้ร่วมกัน
 *
 * class เหล่านี้เป็น "แหล่งกำเนิด" ของ OpenAPI — สิ่งที่ประกาศที่นี่
 * คือสิ่งที่ frontend เห็นใน openapi.json และ gen เป็น TypeScript type
 */

export class ErrorDetailDto {
  @ApiProperty({ example: 'subject' })
  field!: string;

  @ApiProperty({ example: 'ກະລຸນາລະບຸຫົວຂໍ້' })
  message!: string;
}

export class ErrorBodyDto {
  @ApiProperty({
    example: 'VALIDATION_ERROR',
    description: 'รหัสคงที่สำหรับให้ frontend ตัดสินใจ — ตารางเต็มใน docs/03-api-spec.md §6',
  })
  code!: string;

  @ApiProperty({
    example: 'ຂໍ້ມູນບໍ່ຖືກຕ້ອງ',
    description: 'ข้อความที่แสดงผู้ใช้ได้ทันที (ภาษาลาว)',
  })
  message!: string;

  @ApiPropertyOptional({ type: [ErrorDetailDto] })
  details?: ErrorDetailDto[];

  @ApiProperty({
    example: '01J9X2K7M4N8Q3',
    description: 'ตรงกับ request_id ใน log ฝั่ง server ใช้สืบหาปัญหา',
  })
  request_id!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;
}

export class PageMetaDto {
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) page_size!: number;
  @ApiProperty({ example: 137 }) total!: number;
  @ApiProperty({ example: 7 }) total_pages!: number;
}

export class RefCompanyDto {
  @ApiProperty({ example: 7 }) id!: number;
  @ApiProperty({ example: 'AIDC-LOG' }) code!: string;
  @ApiPropertyOptional({ example: 'ເອໄອດີຊີ ໂລຈິສຕິກ' }) name_th?: string;
}

export class RefUserDto {
  @ApiProperty({ example: 88 }) id!: number;
  @ApiProperty({ example: 'ພູວົງ ສີສຸກ' }) full_name!: string;
}

export class RefNamedDto {
  @ApiProperty({ example: 22 }) id!: number;
  @ApiProperty({ example: 'ສາງສິນຄ້າ' }) name!: string;
}

export class RefCategoryDto {
  @ApiProperty({ example: 79 }) id!: number;
  @ApiProperty({ example: 'ເຄື່ອງສະແກນບາໂຄດ/ເຄື່ອງພິມສະຫຼາກ' }) name_th!: string;
  @ApiPropertyOptional({ example: 'ລະບົບຂົນສົ່ງ' }) parent_name_th?: string;
}
