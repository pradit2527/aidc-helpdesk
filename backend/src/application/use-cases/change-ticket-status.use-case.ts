import { Inject, Injectable } from '@nestjs/common';

import { PENDING_REASON, type Priority, type TicketStatus } from '../../common/constants';
import { ConflictError, ForbiddenError, ValidationError } from '../../common/errors/domain-error';
import type { AccessScope } from '../../common/scope';
import { addMinutes, minutesPaused } from '../../common/sla/business-time';
import { SlaConfigRepository } from '../../db/repositories/sla-config.repository';
import { TicketWriteRepository } from '../../db/repositories/ticket-write.repository';
import { TicketRepository } from '../../db/repositories/ticket.repository';
import {
  actorMayTransition,
  allowedTransitionsFrom,
  TicketEntity,
} from '../../domain/ticket/ticket.entity';
import { CLOCK, type Clock } from '../ports/clock.port';

export interface ChangeStatusInput {
  toStatus: TicketStatus;
  /** เหตุผลที่เก็บในประวัติ — บังคับกรณีพัก ยกเลิก และเปิดคืน */
  reason?: string | undefined;
  pendingReason?: string | undefined;
  /** ข้อความถึงผู้แจ้ง — บันทึกเป็นคอมเมนต์สาธารณะ */
  comment?: string | undefined;
  /** บังคับเมื่อ toStatus = resolved */
  resolutionNote?: string | undefined;
  /** ผู้แจ้งให้คะแนนตอนยืนยันปิด (1–5) */
  satisfactionScore?: number | undefined;
}

/*
 * ความยาวขั้นต่ำของข้อความที่เป็นหลักฐาน
 *
 * สั้นกว่านี้อ่านย้อนหลังแล้วไม่รู้ว่าเกิดอะไรขึ้น เช่น "ລໍຖ້າ" หรือ "ແກ້ແລ້ວ"
 * ซึ่งเป็นสิ่งที่คนพิมพ์จริงเมื่อไม่มีขั้นต่ำ และผู้ตรวจจะถือว่าไม่มีบันทึก
 */
const MIN_PENDING_REASON = 10;
const MIN_RESOLUTION_NOTE = 15;
const MIN_CANCEL_REASON = 5;
const MIN_REOPEN_REASON = 10;

/**
 * เปลี่ยนสถานะของเรื่อง
 *
 * งานที่ใช้ปฏิทินอยู่ตรงนี้ ไม่ได้อยู่ใน entity เพราะการคำนวณ "หยุดนาฬิกาไปกี่นาที"
 * ต้องรู้เวลาทำการของบริษัทนั้น ซึ่งเป็นข้อมูลที่อ่านจากฐานข้อมูล
 * entity จึงบอกได้แค่ว่า "รอบนี้ต้องคิดเวลาพักไหม" ส่วนตัวเลขมาจากที่นี่
 *
 * ลำดับการตรวจตั้งใจเรียงแบบนี้
 *   1. อ่านเรื่อง — นอกขอบเขตได้ 404 ก่อนอย่างอื่น
 *   2. สิทธิ์ — คนที่ไม่มีสิทธิ์ต้องไม่ได้เห็นว่าช่องไหนกรอกผิด
 *   3. ข้อมูลที่ต้องกรอก — บอกทุกช่องที่ขาดในครั้งเดียว ไม่ใช่ทีละช่อง
 *   4. รายการตรวจที่บังคับ — ต้องถามฐานข้อมูล จึงทำหลังข้อที่ตรวจได้เลย
 */
@Injectable()
export class ChangeTicketStatusUseCase {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly writes: TicketWriteRepository,
    private readonly slaConfig: SlaConfigRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(scope: AccessScope, id: number, input: ChangeStatusInput): Promise<void> {
    // อ่านก่อนตรวจสิทธิ์โดยตั้งใจ — เรื่องที่อยู่นอกขอบเขตต้องได้ 404
    // ถ้าตรวจสิทธิ์ก่อน ผู้ที่ไม่มีสิทธิ์จะได้ 403 ซึ่งยืนยันว่าเรื่องนั้นมีอยู่จริง
    const row = await this.tickets.findById(scope, id);

    const from = row.status as TicketStatus;
    const to = input.toStatus;
    const isOwner = row.requesterId === scope.userId;
    const reopening = (from === 'resolved' || from === 'closed') && to === 'in_progress';

    const permitted = actorMayTransition(from, to, {
      isOwner,
      canChangeStatus: scope.has('ticket.change_status'),
      canCancel: scope.has('ticket.cancel'),
      canReopen: scope.has('ticket.reopen'),
    });
    // เส้นที่ตารางไม่อนุญาตเลย ปล่อยให้ entity ตอบ 409 พร้อมรายการที่ไปได้ ซึ่งบอกได้มากกว่า
    if (!permitted && allowedTransitionsFrom(from).includes(to)) {
      throw new ForbiddenError('FORBIDDEN', 'ທ່ານບໍ່ມີສິດປ່ຽນສະຖານະນີ້', { from, to });
    }

    const reason = input.reason?.trim() ?? '';
    const comment = input.comment?.trim() ?? '';
    const resolutionNote = input.resolutionNote?.trim() ?? '';
    const score = input.satisfactionScore;

    const issues: { field: string; message: string }[] = [];
    if (to === 'pending_user') {
      if (!input.pendingReason || !(PENDING_REASON as readonly string[]).includes(input.pendingReason)) {
        issues.push({ field: 'pending_reason', message: 'ກະລຸນາເລືອກວ່າລໍຖ້າຫຍັງຢູ່' });
      }
      if (reason.length < MIN_PENDING_REASON) {
        issues.push({
          field: 'reason',
          message: `ກະລຸນາອະທິບາຍວ່າລໍຖ້າຫຍັງ ຢ່າງໜ້ອຍ ${MIN_PENDING_REASON} ຕົວອັກສອນ`,
        });
      }
    }
    if (to === 'resolved' && resolutionNote.length < MIN_RESOLUTION_NOTE) {
      issues.push({
        field: 'resolution_note',
        message: `ກະລຸນາບັນທຶກວິທີແກ້ ຢ່າງໜ້ອຍ ${MIN_RESOLUTION_NOTE} ຕົວອັກສອນ`,
      });
    }
    if (to === 'cancelled' && reason.length < MIN_CANCEL_REASON) {
      issues.push({ field: 'reason', message: 'ກະລຸນາລະບຸເຫດຜົນທີ່ຍົກເລີກ' });
    }
    if (reopening && reason.length < MIN_REOPEN_REASON) {
      issues.push({
        field: 'reason',
        message: `ກະລຸນາບອກວ່າຍັງພົບບັນຫາຫຍັງ ຢ່າງໜ້ອຍ ${MIN_REOPEN_REASON} ຕົວອັກສອນ`,
      });
    }
    if (score !== undefined) {
      /*
       * คะแนนรับจากผู้แจ้งตอนยืนยันปิดเท่านั้น
       *
       * ถ้าเจ้าหน้าที่ใส่แทนได้ CSAT จะกลายเป็นคะแนนที่ทีมให้ตัวเอง
       * KPI-4 ที่รายงานผู้บริหารจะไม่มีความหมายอีกต่อไป
       */
      if (to !== 'closed' || !isOwner) {
        issues.push({
          field: 'satisfaction_score',
          message: 'ຜູ້ແຈ້ງເທົ່ານັ້ນໃຫ້ຄະແນນໄດ້ ຕອນຢືນຢັນປິດເລື່ອງ',
        });
      } else if (!Number.isInteger(score) || score < 1 || score > 5) {
        issues.push({ field: 'satisfaction_score', message: 'ຄະແນນຕ້ອງເປັນ 1 ຫາ 5' });
      }
    }
    if (issues.length > 0) {
      throw new ValidationError('VALIDATION_ERROR', issues[0]!.message, issues);
    }

    if (to === 'resolved') {
      // SOP-04/05 ข้อ 6 — ข้อบังคับต้องครบก่อนบอกผู้แจ้งว่าแก้เสร็จ
      const missing = await this.writes.pendingRequiredChecklist(id);
      if (missing.length > 0) {
        throw new ConflictError(
          'CHECKLIST_INCOMPLETE',
          `ຍັງເຮັດລາຍການກວດທີ່ບັງຄັບບໍ່ຄົບ: ${missing.join(', ')}`,
          { items: missing },
        );
      }
    }

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
      status: from,
      priority: row.priority as Priority,
      resolvedAt: row.resolvedAt,
      // ต้องส่ง closedAt ด้วย มิฉะนั้น entity ไม่รู้ว่าปิดไปนานแค่ไหน
      // แล้วเรื่องที่ปิดไปเป็นเดือนจะเปิดคืนได้ ขัดกับกฎ 7 วัน
      closedAt: row.closedAt,
      pendingReason: row.pendingReason,
      pendingStartedAt: row.pendingStartedAt,
      pendingDurationMinutes: row.pendingDurationMinutes,
      assigneeId: row.assigneeId,
    });

    const now = this.clock.now();

    /*
     * เวลาที่ต้องไม่นับรวม และกำหนดแก้เสร็จใหม่
     *
     * เลิกพัก: นับจากเวลาที่เริ่มพัก · เปิดคืน: นับจากเวลาที่แก้เสร็จ (S-03)
     * คำนวณก่อนเปลี่ยนสถานะ เพราะหลังเปลี่ยนแล้ว entity จะไม่อยู่ในสถานะพักอีก
     *
     * กำหนดแก้เสร็จต้องเลื่อนออกด้วย ไม่ใช่แค่สะสมนาทีไว้ — ทั้งหน้าจอและงานกวาด SLA
     * ตัดสิน "เกินกำหนด" จาก resolution_due_at ตรง ๆ ถ้าไม่เลื่อน เรื่องที่รอผู้แจ้ง
     * ตอบสองวันจะถูกตั้งธงเกินกำหนดทันทีที่เจ้าหน้าที่กลับมาทำต่อ
     */
    let pausedMinutesToAdd = 0;
    let resolutionDueAt: Date | undefined;
    const pausedSince = entity.willResumeFromPending(to)
      ? entity.pendingStartedAt
      : reopening
        ? (row.resolvedAt ?? row.closedAt)
        : null;

    if (pausedSince) {
      const cal = await this.slaConfig.calendarFor(row.companyId);
      const target = await this.slaConfig.targetFor(row.companyId, row.priority as Priority);
      pausedMinutesToAdd = minutesPaused(pausedSince, now, cal, target.clockMode);
      if (to === 'in_progress' && row.resolutionDueAt && pausedMinutesToAdd > 0) {
        resolutionDueAt = addMinutes(row.resolutionDueAt, pausedMinutesToAdd, cal, target.clockMode);
      }
    }

    // entity ตรวจว่าเปลี่ยนจากสถานะนี้ไปสถานะนั้นได้ไหม แล้วอัปเดตตัวเองให้ครบทุกฟิลด์
    entity.changeStatus(to, now, {
      pausedMinutesToAdd,
      pendingReason: input.pendingReason ?? null,
      actorId: scope.userId,
    });

    /*
     * เริ่มงานเรื่องที่ยังไม่มีคนรับ = คนกดคือผู้รับผิดชอบ
     *
     * ไม่งั้นจะมีเรื่อง "กำลังดำเนินการ" ที่ไม่มีเจ้าของ ซึ่งไม่โผล่ในแท็บงานของใครเลย
     * ทำเฉพาะคนที่มีสิทธิ์รับงาน — การอนุมัติที่ปลดเรื่องออกจากพักไม่ถูกนับเป็นคนรับ
     */
    const selfAssigned =
      to === 'in_progress' &&
      row.assigneeId === null &&
      scope.has('ticket.assign_self', 'ticket.assign');

    /*
     * ข้อความถึงผู้แจ้ง
     *
     * พักเพื่อรอผู้แจ้งหรือรอผู้ให้บริการภายนอก ต้องแจ้งผู้แจ้งเสมอ (SLA 5.4)
     * ถ้าเจ้าหน้าที่ไม่ได้พิมพ์ข้อความแยก ใช้เหตุผลที่กรอกเป็นข้อความแจ้ง
     * การเปลี่ยนอื่นแจ้งเฉพาะเมื่อพิมพ์ข้อความมาเอง
     */
    const mustInformRequester =
      to === 'pending_user' && (input.pendingReason === 'user' || input.pendingReason === 'vendor');
    const messageBody = comment || (mustInformRequester ? reason : '');

    await this.tickets.saveStatusChange(entity, {
      from,
      to,
      actorId: scope.userId,
      at: now,
      ...(reason ? { reason } : {}),
      ...(resolutionDueAt ? { resolutionDueAt } : {}),
      ...(to === 'resolved' ? { resolutionNote } : {}),
      ...(score !== undefined ? { satisfactionScore: score } : {}),
      ...(reopening ? { reopened: true } : {}),
      ...(selfAssigned ? { selfAssigned: true } : {}),
      ...(messageBody
        ? {
            publicComment: {
              body: messageBody,
              // ผู้แจ้งเปลี่ยนสถานะเรื่องของตัวเอง ข้อความของเขาไม่ใช่ "การตอบรับ"
              countsAsFirstResponse: row.firstResponseAt === null && !isOwner,
            },
          }
        : {}),
      auditDetail: {
        ...(reason ? { reason } : {}),
        ...(to === 'pending_user' && input.pendingReason ? { pending_reason: input.pendingReason } : {}),
        ...(to === 'resolved' ? { resolution_note: resolutionNote } : {}),
        ...(score !== undefined ? { satisfaction_score: score } : {}),
        ...(resolutionDueAt ? { resolution_due_at: resolutionDueAt.toISOString() } : {}),
        ...(selfAssigned ? { assignee_id: scope.userId } : {}),
      },
    });
  }
}
