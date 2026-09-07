import { Body, Controller, Param, ParseIntPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AccessScope } from '../../common/scope';
import { CurrentScope, ScopeGuard } from '../../common/scope.guard';
import { TicketsService } from './tickets.service';

/**
 * รายการตรวจของเรื่อง
 *
 * แยก controller ออกมาเพราะ path เป็น /checklist-items/{id} ไม่ได้ซ้อนใต้
 * /tickets/{id} — สเปกออกแบบไว้แบบนี้เพราะ id ของข้อเป็นเอกลักษณ์อยู่แล้ว
 * การบังคับให้ส่ง ticket id มาด้วยจึงเป็นข้อมูลซ้ำที่ขัดกันเองได้
 * (docs/03-api-spec.md §2.8)
 */
@ApiTags('Tickets')
@Controller('checklist-items')
@UseGuards(ScopeGuard)
@ApiCookieAuth('cookie')
export class ChecklistController {
  constructor(private readonly tickets: TicketsService) {}

  @Patch(':id')
  @ApiOperation({
    summary: 'ติ๊กรายการตรวจ',
    description:
      'ข้อที่ `evidence_required` ต้องมี `attachment_id` ก่อนจึงติ๊กเสร็จได้ ' +
      '(422 EVIDENCE_REQUIRED) — บังคับที่ระดับฐานข้อมูลด้วย จึงข้ามผ่าน API ไม่ได้ · ' +
      '`all_required_done` ในคำตอบบอกว่าข้อบังคับครบหรือยัง ซึ่งเป็นเงื่อนไข ' +
      'ของการเปลี่ยนสถานะเป็น resolved ตาม SOP-04/05 ข้อ 6',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        is_done: { type: 'boolean' },
        note: { type: 'string', nullable: true },
        attachment_id: { type: 'number', nullable: true },
      },
    },
  })
  update(
    @CurrentScope() scope: AccessScope,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { is_done?: boolean; note?: string | null; attachment_id?: number | null },
  ) {
    return this.tickets.setChecklistItem(scope, id, body);
  }
}
