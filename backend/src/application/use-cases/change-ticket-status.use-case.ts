import { Inject, Injectable } from '@nestjs/common';

import type { Priority, TicketStatus } from '../../common/constants';
import type { AccessScope } from '../../common/scope';
import { minutesPaused } from '../../common/sla/business-time';
import { SlaConfigRepository } from '../../db/repositories/sla-config.repository';
import { TicketRepository } from '../../db/repositories/ticket.repository';
import { TicketEntity } from '../../domain/ticket/ticket.entity';
import { CLOCK, type Clock } from '../ports/clock.port';

export interface ChangeStatusInput {
  toStatus: TicketStatus;
  reason?: string | undefined;
  pendingReason?: string | undefined;
}

/**
 * เปลี่ยนสถานะของเรื่อง
 *
 * งานที่ใช้ปฏิทินอยู่ตรงนี้ ไม่ได้อยู่ใน entity เพราะการคำนวณ "หยุดนาฬิกาไปกี่นาที"
 * ต้องรู้เวลาทำการของบริษัทนั้น ซึ่งเป็นข้อมูลที่อ่านจากฐานข้อมูล
 * entity จึงบอกได้แค่ว่า "รอบนี้ต้องคิดเวลาพักไหม" ส่วนตัวเลขมาจากที่นี่
 *
 * การแบ่งแบบนี้ทำให้กฎ "เลิกพักแล้วต้องบวกเวลาคืน" อยู่ใน entity ที่เทสต์ได้
 * โดยไม่ต้องมีฐานข้อมูล ส่วนสิ่งที่ต้องพึ่งข้อมูลจริงก็ยังอยู่นอกโดเมนตามเดิม
 */
@Injectable()
export class ChangeTicketStatusUseCase {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly slaConfig: SlaConfigRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(scope: AccessScope, id: number, input: ChangeStatusInput): Promise<void> {
    // อ่านก่อนตรวจสิทธิ์โดยตั้งใจ — เรื่องที่อยู่นอกขอบเขตต้องได้ 404
    // ถ้าตรวจสิทธิ์ก่อน ผู้ที่ไม่มีสิทธิ์จะได้ 403 ซึ่งยืนยันว่าเรื่องนั้นมีอยู่จริง
    const row = await this.tickets.findById(scope, id);
    scope.require('ticket.change_status');

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
      resolvedAt: row.resolvedAt,
      pendingStartedAt: row.pendingStartedAt,
      pendingDurationMinutes: row.pendingDurationMinutes,
    });

    const now = this.clock.now();

    // คำนวณเวลาพักก่อนเปลี่ยนสถานะ เพราะหลังเปลี่ยนแล้ว entity จะไม่อยู่ในสถานะพักอีก
    let pausedMinutesToAdd = 0;
    if (entity.willResumeFromPending(input.toStatus) && entity.pendingStartedAt) {
      const cal = await this.slaConfig.calendarFor(entity.companyId);
      const target = await this.slaConfig.targetFor(entity.companyId, entity.priority);
      pausedMinutesToAdd = minutesPaused(entity.pendingStartedAt, now, cal, target.clockMode);
    }

    // entity ตรวจว่าเปลี่ยนจากสถานะนี้ไปสถานะนั้นได้ไหม แล้วอัปเดตตัวเองให้ครบทุกฟิลด์
    entity.changeStatus(input.toStatus, now, {
      pausedMinutesToAdd,
      pendingReason: input.pendingReason ?? null,
      actorId: scope.userId,
    });

    await this.tickets.saveStatusChange(entity, {
      from: row.status,
      to: input.toStatus,
      actorId: scope.userId,
      ...(input.reason ? { reason: input.reason } : {}),
    });
  }
}
