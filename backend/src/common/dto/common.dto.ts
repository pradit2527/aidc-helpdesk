import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO กลางที่ทุก endpoint ใช้ร่วมกัน
 *
 * class เหล่านี้เป็น "แหล่งกำเนิด" ของ OpenAPI — สิ่งที่ประกาศที่นี่
 * คือสิ่งที่ frontend เห็นใน openapi.json และ gen เป็น TypeScript type
 */

/*
 * ErrorDetailDto / ErrorBodyDto / ErrorResponseDto ย้ายไปอยู่ที่ common/http/envelope.dto.ts
 * เพราะเป็นส่วนหนึ่งของซองมาตรฐาน ไม่ใช่ DTO ของโดเมนใดโดเมนหนึ่ง
 * ส่งต่อชื่อเดิมไว้เพื่อไม่ให้ import เดิมพัง
 */
export {
  ErrorBodyDto,
  ErrorDetailDto,
  ErrorResponseDto,
  ResponseMetaDto,
} from '../http/envelope.dto';

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
