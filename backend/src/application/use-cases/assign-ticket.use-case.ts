import { Inject, Injectable } from '@nestjs/common';

import type { Priority, TicketStatus } from '../../common/constants';
import { ValidationError } from '../../common/errors/domain-error';
import type { AccessScope } from '../../common/scope';
import { TicketRepository } from '../../db/repositories/ticket.repository';
import { TicketEntity } from '../../domain/ticket/ticket.entity';
import { CLOCK, type Clock } from '../ports/clock.port';

export interface AssignTicketInput {
  assigneeId: number;
  /** ข้อความถึงผู้แจ้ง — บันทึกเป็นคอมเมนต์สาธารณะ */
  comment?: string | undefined;
  /** เหตุผลการมอบหมาย — เก็บในประวัติ */
  reason?: string | undefined;
}

/**
 * มอบหมายผู้รับผิดชอบ หรือรับงานเอง
 *
 * สิทธิ์แยกสองระดับ
 *   - รับเอง ใช้ ticket.assign_self (หรือ ticket.assign)
 *   - มอบให้คนอื่น ใช้ ticket.assign เท่านั้น — การโยนงานให้คนอื่นเป็นอำนาจของหัวหน้าทีม
 *     ถ้าให้ทุกคนที่รับงานเองได้โยนงานได้ด้วย เรื่องยาก ๆ จะถูกส่งต่อวนไปเรื่อย ๆ
 */
@Injectable()
export class AssignTicketUseCase {
  constructor(
    private readonly tickets: TicketRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(scope: AccessScope, id: number, input: AssignTicketInput): Promise<void> {
    // อ่านก่อนตรวจสิทธิ์โดยตั้งใจ — เรื่องที่อยู่นอกขอบเขตต้องได้ 404 ไม่ใช่ 403
    const row = await this.tickets.findById(scope, id);

    const self = input.assigneeId === scope.userId;
    if (self) scope.require('ticket.assign_self', 'ticket.assign');
    else scope.require('ticket.assign');

    const entity = TicketEntity.rehydrate({
      id: row.id,
      companyId: row.companyId,
      categoryId: row.categoryId,
      requesterId: row.requesterId,
      createdBy: row.requesterId,
      subject: row.subject,
      description: '',
      impact: row.impact as TicketEntity['impact'],
      urgency: row.urgency as TicketEntity['urgency'],
      status: row.status as TicketStatus,
      priority: row.priority as Priority,
      pendingDurationMinutes: row.pendingDurationMinutes,
      assigneeId: row.assigneeId,
    });

    // entity ตรวจสถานะและการมอบให้คนเดิมซ้ำก่อน ไม่ต้องไปถามฐานข้อมูลถ้าผิดตั้งแต่ต้น
    const change = entity.assignTo(input.assigneeId);

    /*
     * ผู้รับต้องทำงานกับเรื่องของบริษัทนี้ได้จริง
     *
     * ตรวจที่ฝั่งเซิร์ฟเวอร์เสมอ แม้หน้าจอจะแสดงเฉพาะคนที่มีสิทธิ์อยู่แล้ว
     * เพราะ id ส่งมาจากเบราว์เซอร์ แก้เป็นเลขใครก็ได้ — รวมถึงพนักงานบริษัทอื่น
     * ที่จะได้รับมอบหมายเรื่องที่ตัวเองเปิดดูไม่ได้
     */
    const eligible = await this.tickets.assignableUsers(row.companyId);
    if (!eligible.some((u) => u.id === input.assigneeId)) {
      throw new ValidationError('ASSIGNEE_NOT_ELIGIBLE', 'ຜູ້ນີ້ຮັບເລື່ອງຂອງບໍລິສັດນີ້ບໍ່ໄດ້', [
        { field: 'assignee_id', message: 'ເລືອກເຈົ້າໜ້າທີ່ທີ່ດູແລບໍລິສັດນີ້' },
      ]);
    }

    const comment = input.comment?.trim() ?? '';
    const reason = input.reason?.trim() ?? '';

    await this.tickets.saveAssignment({
      ticketId: row.id,
      companyId: row.companyId,
      actorId: scope.userId,
      at: this.clock.now(),
      fromAssigneeId: change.fromAssigneeId,
      toAssigneeId: input.assigneeId,
      fromStatus: change.fromStatus,
      toStatus: change.toStatus,
      ...(reason ? { reason } : {}),
      ...(comment
        ? {
            publicComment: {
              body: comment,
              // กติกาเดียวกับ addComment (SLA 5.1) — ข้อความสาธารณะจากคนที่ไม่ใช่ผู้แจ้ง
              countsAsFirstResponse:
                row.firstResponseAt === null && row.requesterId !== scope.userId,
            },
          }
        : {}),
    });
  }
}
