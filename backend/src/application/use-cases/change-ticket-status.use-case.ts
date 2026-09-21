import { Inject, Injectable } from '@nestjs/common';

import {
  AWAITING_CONFIRMATION_STATUSES,
  WAITING_STATUSES,
  type Priority,
  type TicketStatus,
  type TicketType,
} from '../../common/constants';
import { ConflictError, ForbiddenError, ValidationError } from '../../common/errors/domain-error';
import type { AccessScope } from '../../common/scope';
import { addMinutes, minutesPaused } from '../../common/sla/business-time';
import { SlaConfigRepository } from '../../db/repositories/sla-config.repository';
import { TicketWriteRepository } from '../../db/repositories/ticket-write.repository';
import { TicketRepository } from '../../db/repositories/ticket.repository';
import {
  actorMayTransition,
  allowedTransitionsFrom,
  isReopening,
  TicketEntity,
} from '../../domain/ticket/ticket.entity';
import { CLOCK, type Clock } from '../ports/clock.port';

/**
 * สถานะที่ต้องกรอกเหตุผลว่า "ค้างเพราะอะไร"
 *
 * ทั้งสามเป็นสถานะที่เรื่องหยุดเดินโดยที่ผู้แจ้งมองไม่เห็นว่าเกิดอะไรขึ้น
 * ถ้าไม่บังคับกรอก ประวัติจะมีแต่บรรทัด "เปลี่ยนเป็นรอผู้ขาย" ลอย ๆ
 * ซึ่งอ่านย้อนหลังแล้วตอบผู้ตรวจไม่ได้ว่ารออะไรและรอใคร
 */
const PAUSE_STATUSES_NEEDING_REASON: readonly TicketStatus[] = [
  ...WAITING_STATUSES,
  // นาฬิกาไม่หยุดตอนรอผู้ขาย แต่ผู้แจ้งก็ยังต้องรู้ว่ารออะไรอยู่ดี
  'pending_vendor',
];

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

  /**
   * @returns สถานะก่อนและหลัง — ผู้เรียกใช้ตัดสินว่าต้องบอกใครบ้างหลังเขียนสำเร็จ
   *          (ห้องแชทที่ผูกกับเรื่องนี้ได้ข้อความเฉพาะตอนที่สถานะเปลี่ยนจริง)
   */
  async execute(
    scope: AccessScope,
    id: number,
    input: ChangeStatusInput,
  ): Promise<{ from: TicketStatus; to: TicketStatus }> {
    // อ่านก่อนตรวจสิทธิ์โดยตั้งใจ — เรื่องที่อยู่นอกขอบเขตต้องได้ 404
    // ถ้าตรวจสิทธิ์ก่อน ผู้ที่ไม่มีสิทธิ์จะได้ 403 ซึ่งยืนยันว่าเรื่องนั้นมีอยู่จริง
    const row = await this.tickets.findById(scope, id);

    const from = row.status as TicketStatus;
    const to = input.toStatus;
    const ticketType = (row.ticketType ?? 'incident') as TicketType;
    const isOwner = row.requesterId === scope.userId;
    const reopening = isReopening(from, to);

    const permitted = actorMayTransition(
      from,
      to,
      {
        isOwner,
        canChangeStatus: scope.has('ticket.change_status'),
        canCancel: scope.has('ticket.cancel'),
        canReopen: scope.has('ticket.reopen'),
      },
      ticketType,
    );
    // เส้นที่ตารางไม่อนุญาตเลย ปล่อยให้ entity ตอบ 409 พร้อมรายการที่ไปได้ ซึ่งบอกได้มากกว่า
    if (!permitted && allowedTransitionsFrom(from, ticketType).includes(to)) {
      throw new ForbiddenError('FORBIDDEN', 'ທ່ານບໍ່ມີສິດປ່ຽນສະຖານະນີ້', { from, to });
    }

    const reason = input.reason?.trim() ?? '';
    const comment = input.comment?.trim() ?? '';
    const resolutionNote = input.resolutionNote?.trim() ?? '';
    const score = input.satisfactionScore;

    const issues: { field: string; message: string }[] = [];
    /*
     * ⚠️ ไม่บังคับ pending_reason อีกต่อไป
     *    เดิมบังคับให้เลือกจาก enum 3 ค่า เพราะสถานะเดียว (pending_user)
     *    ต้องแบกความหมายทั้งสามแบบ ตอนนี้สถานะบอกเองแล้วว่ารออะไร
     *    สิ่งที่ยังบังคับคือ "reason" ซึ่งเป็นคำอธิบายที่ผู้ตรวจอ่านได้จริง
     */
    if (PAUSE_STATUSES_NEEDING_REASON.includes(to) && reason.length < MIN_PENDING_REASON) {
      issues.push({
        field: 'reason',
        message: `ກະລຸນາອະທິບາຍວ່າລໍຖ້າຫຍັງ ຢ່າງໜ້ອຍ ${MIN_PENDING_REASON} ຕົວອັກສອນ`,
      });
    }
    /*
     * บันทึกวิธีแก้บังคับเฉพาะ resolved (เหตุขัดข้อง) ตามที่ SA ระบุ
     * fulfilled (คำขอบริการที่ส่งมอบแล้ว) รับ resolution_note ได้แต่ไม่บังคับ —
     * รายการส่วนใหญ่มี checklist ตาม SOP คุมอยู่แล้วว่าทำอะไรครบบ้าง
     */
    if (to === 'resolved' && resolutionNote.length < MIN_RESOLUTION_NOTE) {
      issues.push({
        field: 'resolution_note',
        message: `ກະລຸນາບັນທຶກວິທີແກ້ ຢ່າງໜ້ອຍ ${MIN_RESOLUTION_NOTE} ຕົວອັກສອນ`,
      });
    }
    if (to === 'cancelled' && reason.length < MIN_CANCEL_REASON) {
      issues.push({ field: 'reason', message: 'ກະລຸນາລະບຸເຫດຜົນທີ່ຍົກເລີກ' });
    }
    /*
     * ปฏิเสธคำขอต้องมีเหตุผลเสมอ — กติกาเดียวกับ ck_approval_reject_needs_comment
     *
     * ปกติ rejected มาจาก ApprovalsService ซึ่งบังคับ comment อยู่แล้ว
     * ข้อนี้กันเส้นทางอื่นที่เรียก use case นี้ตรง ๆ ไม่ให้ปฏิเสธเงียบ ๆ ได้
     */
    if (to === 'rejected' && reason.length < MIN_CANCEL_REASON) {
      issues.push({ field: 'reason', message: 'ກະລຸນາລະບຸເຫດຜົນທີ່ບໍ່ອະນຸມັດ' });
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

    /*
     * SOP-04/05 ข้อ 6 — ข้อบังคับต้องครบก่อนบอกผู้แจ้งว่างานเสร็จ
     *
     * ⚠️ ต้องครอบ fulfilled ด้วย ไม่ใช่แค่ resolved
     *    checklist ตาม SOP (ONBOARDING / OFFBOARDING) ผูกกับรายการใน
     *    service catalog ทั้งคู่ ซึ่งแปลว่ามันอยู่บนเรื่องชนิดคำขอบริการเสมอ
     *    และคำขอบริการไม่เดินผ่าน resolved อีกต่อไป — ถ้าเช็คแค่ resolved
     *    ด่านนี้จะกลายเป็นด่านที่ไม่มีใครเดินผ่านเลย ปิดงาน onboarding ได้
     *    โดยไม่ต้องติ๊กอะไรสักข้อ ทั้งที่เป็นข้อบังคับที่ผู้ตรวจ ISO ถามหา
     */
    if ((AWAITING_CONFIRMATION_STATUSES as readonly string[]).includes(to)) {
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
      // ต้องส่งเข้าไป มิฉะนั้น entity จะใช้ตารางสถานะของ incident กับทุกใบ
      ticketType,
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
    /*
     * จุดตั้งต้นของช่วงที่หยุดนับ
     *
     * ปกติอ่านจาก pending_started_at ซึ่งถูกตั้งไว้ตอนเข้าสถานะพักทุกแบบ
     * ยกเว้นการเปิดคืนจาก closed — closed ไม่ใช่สถานะพัก จึงไม่มีค่านั้น
     * ต้องนับจาก resolved_at (เวลาที่งานเสร็จจริง) ถ้าไม่มีค่อยใช้ closed_at
     */
    const pausedSince = entity.willResumeClock(to)
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
     *
     * เดิมตัดสินจาก pending_reason เป็น 'user' หรือ 'vendor' — ตอนนี้อ่านจาก
     * สถานะตรง ๆ ซึ่งเป็นค่าเดียวกันแต่ไม่มีทางกรอกผิด
     * pending_approval ไม่อยู่ในนี้: ผู้แจ้งเป็นคนยื่นคำขอเอง เขารู้อยู่แล้วว่า
     * ต้องผ่านการอนุมัติ และคนที่ต้องถูกเตือนคือผู้อนุมัติ ไม่ใช่ผู้แจ้ง
     */
    const mustInformRequester = to === 'pending_user' || to === 'pending_vendor';
    const messageBody = comment || (mustInformRequester ? reason : '');

    await this.tickets.saveStatusChange(entity, {
      from,
      to,
      actorId: scope.userId,
      at: now,
      ...(reason ? { reason } : {}),
      ...(resolutionDueAt ? { resolutionDueAt } : {}),
      // fulfilled บันทึกได้ถ้าส่งมา แต่ไม่บังคับ — เขียนเฉพาะตอนมีข้อความจริง
      ...(to === 'resolved' || (to === 'fulfilled' && resolutionNote)
        ? { resolutionNote }
        : {}),
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
        ...(to === 'pending_user' && input.pendingReason
          ? { pending_reason: input.pendingReason }
          : {}),
        ...(resolutionNote ? { resolution_note: resolutionNote } : {}),
        ...(score !== undefined ? { satisfaction_score: score } : {}),
        ...(resolutionDueAt ? { resolution_due_at: resolutionDueAt.toISOString() } : {}),
        ...(selfAssigned ? { assignee_id: scope.userId } : {}),
      },
    });

    return { from, to };
  }
}
