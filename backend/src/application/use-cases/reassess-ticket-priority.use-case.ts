import { Inject, Injectable } from '@nestjs/common';

import type { Impact, Priority, TicketStatus, Urgency } from '../../common/constants';
import type { AccessScope } from '../../common/scope';
import { computeDueAt, nextWorkingInstant } from '../../common/sla/business-time';
import { SlaConfigRepository } from '../../db/repositories/sla-config.repository';
import { TicketRepository } from '../../db/repositories/ticket.repository';
import { TicketEntity } from '../../domain/ticket/ticket.entity';
import { CLOCK, type Clock } from '../ports/clock.port';

export interface ReassessPriorityInput {
  impact?: Impact | undefined;
  urgency?: Urgency | undefined;
  /** บังคับกรอกเสมอ — รายงานรายเดือนใช้ตรวจว่าเกณฑ์ระดับความสำคัญใช้ได้จริงไหม */
  reason: string;
}

/**
 * ทบทวนระดับความสำคัญ
 *
 * นาฬิกานับใหม่ตามระดับใหม่ โดยเริ่มที่ "เวลาที่ปรับ" ไม่ใช่ "เวลาที่แจ้ง" (SLA 5.4)
 *
 * ถ้านับจากเวลาที่แจ้ง เรื่องที่เปิดมาสามวันแล้วเพิ่งรู้ว่าร้ายแรงจะกลายเป็น
 * เกินกำหนดตั้งแต่วินาทีที่กดปรับ ทั้งที่ทีมยังไม่มีโอกาสทำอะไรตามระดับใหม่เลย
 * ตัวเลขแบบนั้นทำให้รายงาน SLA อ่านแล้วไม่มีความหมาย และทำให้คนเลี่ยงที่จะปรับระดับ
 * ทั้งที่การปรับระดับให้ตรงความจริงคือสิ่งที่ระบบต้องการ
 */
@Injectable()
export class ReassessTicketPriorityUseCase {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly slaConfig: SlaConfigRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(scope: AccessScope, id: number, input: ReassessPriorityInput): Promise<void> {
    const row = await this.tickets.findById(scope, id);
    scope.require('ticket.change_priority');

    const entity = TicketEntity.rehydrate({
      id: row.id,
      companyId: row.companyId,
      categoryId: row.categoryId,
      requesterId: row.requesterId,
      createdBy: row.requesterId,
      subject: row.subject,
      description: '',
      impact: row.impact as Impact,
      urgency: row.urgency as Urgency,
      status: row.status as TicketStatus,
      priority: row.priority as Priority,
      isMajorIncident: row.isMajorIncident,
      pendingDurationMinutes: row.pendingDurationMinutes,
    });

    const changedAt = this.clock.now();

    // entity ปฏิเสธเองถ้าเรื่องปิดไปแล้ว และคำนวณระดับใหม่จาก impact × urgency
    const { from, to } = entity.reassess(
      input.impact ?? entity.impact,
      input.urgency ?? entity.urgency,
      changedAt,
    );

    const target = await this.slaConfig.targetFor(entity.companyId, to);
    const cal = await this.slaConfig.calendarFor(entity.companyId);
    const clockStart =
      target.clockMode === 'calendar_24x7' ? changedAt : nextWorkingInstant(changedAt, cal);

    const { responseDueAt, resolutionDueAt } = computeDueAt({
      clockStart,
      responseMinutes: target.responseMinutes,
      resolutionMinutes: target.resolutionMinutes,
      cal,
      mode: target.clockMode,
      // บวกเวลาที่เคยพักรอผู้แจ้งกลับเข้าไป ไม่งั้นเรื่องที่เคยรอผู้ใช้ตอบ
      // จะเสียเปรียบจากเวลาที่ทีมควบคุมไม่ได้
      pausedMinutes: entity.pendingDurationMinutes,
    });

    await this.tickets.savePriorityChange(entity, {
      fromPriority: from,
      toPriority: to,
      actorId: scope.userId,
      reason: input.reason,
      sla: { policyId: target.policyId, responseDueAt, resolutionDueAt },
    });
  }
}
