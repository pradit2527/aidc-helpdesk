import { applyDecorators, SetMetadata, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * ซองมาตรฐานที่ทุก endpoint ตอบกลับ
 *
 *   { "success": true,  "data": {...}, "error": null, "meta": {...} }
 *   { "success": false, "data": null,  "error": {...}, "meta": {...} }
 *
 * ทำไมต้องมีซอง ทั้งที่ HTTP status บอกผลอยู่แล้ว
 *   เพื่อให้ฝั่งเรียกเขียนโค้ดจัดการผลลัพธ์ได้ชุดเดียวใช้ได้ทุก endpoint
 *   ไม่ต้องจำว่า endpoint ไหนคืน array ตรง ๆ endpoint ไหนคืน object ห่อ
 *   ความไม่สม่ำเสมอแบบนั้นคือที่มาของบั๊ก "undefined is not a function" ฝั่ง frontend
 *
 * ราคาที่จ่ายคือ payload ใหญ่ขึ้นเล็กน้อยและต้อง .data ทุกครั้ง
 * ซึ่งถูกซ่อนไว้ในฟังก์ชัน request() ตัวเดียวฝั่ง frontend แล้ว
 */

export class ResponseMetaDto {
  @ApiProperty({
    example: '0b6b6f1e-1f2a-4c1e-9a1b-2f0b6c9d3a55',
    description: 'ตรงกับ header X-Request-Id และกับทุกบรรทัด log ของคำขอนี้ ใช้แจ้งปัญหา',
  })
  request_id!: string;

  @ApiPropertyOptional({ example: 1, description: 'มีเฉพาะ endpoint ที่แบ่งหน้า' })
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  page_size?: number;

  @ApiPropertyOptional({ example: 137 })
  total?: number;

  @ApiPropertyOptional({ example: 7 })
  total_pages?: number;
}

export class ErrorDetailDto {
  @ApiProperty({ example: 'subject' }) field!: string;
  @ApiProperty({ example: 'ກະລຸນາລະບຸຫົວຂໍ້' }) message!: string;
}

export class ErrorBodyDto {
  @ApiProperty({
    example: 'VALIDATION_ERROR',
    description: 'รหัสคงที่สำหรับให้ frontend ตัดสินใจ — ตารางเต็มใน docs/03-api-spec.md §6',
  })
  code!: string;

  @ApiProperty({
    example: 'ຂໍ້ມູນບໍ່ຖືກຕ້ອງ',
    description: 'ข้อความภาษาลาวที่แสดงผู้ใช้ได้ทันที ไม่มีรายละเอียดภายในระบบปนมา',
  })
  message!: string;

  @ApiPropertyOptional({ type: [ErrorDetailDto], description: 'ข้อผิดพลาดรายฟิลด์ สำหรับไฮไลต์ในฟอร์ม' })
  details?: ErrorDetailDto[];
}

export class ErrorResponseDto {
  @ApiProperty({ example: false }) success!: false;

  /*
   * ต้องระบุ type ให้ชัด — ถ้าปล่อยให้ Swagger เดาจากชนิด `null`
   * มันจะมองว่าเป็น type ที่ยังไม่รู้จักแล้วโยน
   * "A circular dependency has been detected" ทำให้แอปบูตไม่ขึ้น
   */
  @ApiProperty({
    type: 'object',
    additionalProperties: false,
    nullable: true,
    example: null,
    description: 'เป็น null เสมอเมื่อเกิดข้อผิดพลาด',
  })
  data!: null;

  @ApiProperty({ type: ErrorBodyDto }) error!: ErrorBodyDto;
  @ApiProperty({ type: ResponseMetaDto }) meta!: ResponseMetaDto;
}

/** รูปร่างจริงที่ interceptor ประกอบขึ้น */
export interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: ErrorDetailDto[] } | null;
  meta: ResponseMetaDto;
}

/*
 * ── การประกาศ schema ให้ Swagger ────────────────────────────────────────
 *
 * ตัว interceptor ห่อ response ตอน runtime แต่ Swagger อ่านจาก decorator
 * ถ้าไม่ประกาศให้ตรง เอกสารจะบอกว่า endpoint คืน TicketDto ตรง ๆ
 * ทั้งที่จริงคืน { success, data: TicketDto, ... } — เอกสารที่โกหกแย่กว่าไม่มีเอกสาร
 */

/** ประกาศว่า endpoint นี้คืนซองที่ห่อ `model` ไว้ */
export function ApiEnvelope<T extends Type<unknown>>(
  model: T,
  options: { status?: number; description?: string } = {},
) {
  return applyDecorators(
    ApiExtraModels(ResponseMetaDto, model),
    ApiResponse({
      status: options.status ?? 200,
      ...(options.description ? { description: options.description } : {}),
      schema: {
        type: 'object',
        required: ['success', 'data', 'error', 'meta'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { $ref: getSchemaPath(model) },
          error: { type: 'object', nullable: true, example: null },
          meta: { $ref: getSchemaPath(ResponseMetaDto) },
        },
      },
    }),
  );
}

/** ประกาศว่า endpoint นี้คืนซองที่ data เป็นอาร์เรย์ของ `model` พร้อมข้อมูลแบ่งหน้าใน meta */
export function ApiEnvelopePage<T extends Type<unknown>>(
  model: T,
  options: { description?: string } = {},
) {
  return applyDecorators(
    ApiExtraModels(ResponseMetaDto, model),
    ApiResponse({
      status: 200,
      ...(options.description ? { description: options.description } : {}),
      schema: {
        type: 'object',
        required: ['success', 'data', 'error', 'meta'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          error: { type: 'object', nullable: true, example: null },
          meta: { $ref: getSchemaPath(ResponseMetaDto) },
        },
      },
    }),
  );
}

/**
 * บอกให้ interceptor ปล่อย response ผ่านไปตรง ๆ ไม่ต้องห่อ
 *
 * ใช้กับ endpoint ที่ผู้บริโภคไม่ใช่ frontend ของเรา เช่น liveness probe
 * ที่ Kubernetes หรือ load balancer เรียก — พวกนั้นมีสัญญาของตัวเองอยู่แล้ว
 */
export const NO_ENVELOPE = 'no_envelope';
export const NoEnvelope = (): MethodDecorator & ClassDecorator =>
  SetMetadata(NO_ENVELOPE, true);
