import { Inject, Injectable } from '@nestjs/common';

import type { Priority, TicketStatus } from '../../common/constants';
import { ForbiddenError, ValidationError } from '../../common/errors/domain-error';
import type { AccessScope } from '../../common/scope';
import { SupportTeamRepository } from '../../db/repositories/support-team.repository';
import { TicketRepository } from '../../db/repositories/ticket.repository';
import { decideAssignment, maySelfAssign, TicketEntity } from '../../domain/ticket/ticket.entity';
import { CLOCK, type Clock } from '../ports/clock.port';

export interface AssignTicketInput {
  assigneeId: number;
  /** ข้อความถึงผู้แจ้ง — บันทึกเป็นคอมเมนต์สาธารณะ */
  comment?: string | undefined;
  /** เหตุผลการมอบหมาย — เก็บในประวัติ */
  reason?: string | undefined;
}

/** ผู้รับผิดชอบคนก่อน — ผู้เรียกใช้ส่งสัญญาณให้คิวงานของเขารีเฟรชด้วย */
export interface AssignTicketResult {
  fromAssigneeId: number | null;
  /**
   * สถานะก่อนและหลังการมอบหมาย
   *
   * การมอบหมายเรื่องที่ยังไม่มีใครรับทำให้สถานะขยับจาก new เป็น assigned ด้วย
   * ห้องแชทที่ผูกกับเรื่องนี้ต้องรู้ว่า "ทีมงานรับเรื่องแล้ว" จากตรงนี้เท่านั้น —
   * การมอบหมายซ้ำระหว่างทาง (fromStatus === toStatus) ไม่ใช่ข่าวของผู้ถาม
   */
  fromStatus: TicketStatus;
  toStatus: TicketStatus;
}

/**
 * มอบหมายผู้รับผิดชอบ หรือรับงานเอง
 *
 * สิทธิ์แยกสองระดับ
 *   - รับเอง ใช้ ticket.assign_self (หรือ ticket.assign) — ทีม support ทุกคนถือ
 *     แต่รับได้เฉพาะเรื่องที่ยังไม่มีผู้รับผิดชอบ (maySelfAssign)
 *   - มอบให้คนอื่น ใช้ ticket.assign (บทบาท support_lead ขึ้นไป) **และ** ต้องเป็นผู้ดูแล
 *     หรือเป็นหัวหน้าทีมของคนที่รับ — การโยนงานให้คนอื่นเป็นอำนาจของหัวหน้าทีม
 *     ถ้าให้ทุกคนที่รับงานเองได้โยนงานได้ด้วย เรื่องยาก ๆ จะถูกส่งต่อวนไปเรื่อย ๆ
 *
 * ⚠️ ต้องผ่านสองชั้น: บทบาท (ticket.assign) และข้อมูลทีม (support_team_member.is_lead)
 *    บทบาทบอกว่ามอบหมายเป็นไหม ข้อมูลทีมบอกว่ามอบให้ใครได้
 */
@Injectable()
export class AssignTicketUseCase {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly teams: SupportTeamRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    scope: AccessScope,
    id: number,
    input: AssignTicketInput,
  ): Promise<AssignTicketResult> {
    // อ่านก่อนตรวจสิทธิ์โดยตั้งใจ — เรื่องที่อยู่นอกขอบเขตต้องได้ 404 ไม่ใช่ 403
    const row = await this.tickets.findById(scope, id);

    const self = input.assigneeId === scope.userId;
    if (self) scope.require('ticket.assign_self', 'ticket.assign');
    else scope.require('ticket.assign');

    /*
     * ทีม support กดรับได้เฉพาะเรื่องที่ยังว่าง — ตอบเรื่องนี้ก่อนตรวจสถานะเรื่อง
     * เพราะเป็นความผิดของผู้สั่ง (ไม่มีอำนาจดึงงาน) ไม่ใช่ของสถานะเรื่อง
     */
    if (
      self &&
      !maySelfAssign(
        {
          userId: scope.userId,
          canAssign: scope.has('ticket.assign'),
          isAdminLevel: scope.isAdminLevel,
          ledTeamIds: [...scope.ledTeamIds],
        },
        row.assigneeId,
      )
    ) {
      throw new ForbiddenError(
        'ALREADY_ASSIGNED',
        'ເລື່ອງນີ້ມີຜູ້ຮັບຜິດຊອບແລ້ວ — ສະເພາະຫົວໜ້າທີມ ຫຼື ຜູ້ດູແລ ຈຶ່ງດຶງວຽກກັບມາໄດ້',
        { ticketId: row.id, assigneeId: row.assigneeId },
      );
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
      status: row.status as TicketStatus,
      priority: row.priority as Priority,
      pendingDurationMinutes: row.pendingDurationMinutes,
      assigneeId: row.assigneeId,
    });

    // entity ตรวจสถานะและการมอบให้คนเดิมซ้ำก่อน ไม่ต้องไปถามฐานข้อมูลถ้าผิดตั้งแต่ต้น
    const change = entity.assignTo(input.assigneeId);

    /*
     * สองคิวรีนี้ไม่พึ่งผลของกัน จึงยิงพร้อมกัน
     *
     * ทีมของผู้รับต้องถามก็ต่อเมื่อผู้สั่งเป็น "หัวหน้าทีม" จริง ๆ เท่านั้น
     * รับงานเองและผู้ดูแลระดับบริษัทไม่ต้องใช้ค่านี้เลย จึงไม่เสียรอบเครือข่ายเพิ่ม
     * ในสองเส้นทางที่พบบ่อยที่สุด
     */
    const needsTeamCheck = !self && !scope.isAdminLevel && scope.isTeamLead;
    const [eligible, assigneeTeamIds] = await Promise.all([
      this.tickets.assignableUsers(row.companyId),
      needsTeamCheck ? this.teams.activeTeamIdsOf(input.assigneeId) : Promise.resolve<number[]>([]),
    ]);

    const decision = decideAssignment(
      {
        userId: scope.userId,
        canAssign: scope.has('ticket.assign'),
        isAdminLevel: scope.isAdminLevel,
        ledTeamIds: [...scope.ledTeamIds],
      },
      { userId: input.assigneeId, teamIds: assigneeTeamIds },
    );

    /*
     * "ไม่ใช่หัวหน้าทีม" ตอบก่อนเรื่องอื่นเสมอ
     *
     * เป็นความผิดของผู้สั่ง ไม่ใช่ของค่าที่ส่งมา — และการตอบ "คนนี้รับเรื่องไม่ได้"
     * ให้คนที่มอบหมายไม่ได้ตั้งแต่ต้น เท่ากับบอกใบ้ว่าใครอยู่บริษัทไหน
     */
    if (!decision.allowed && decision.code === 'NOT_TEAM_LEAD') {
      throw new ForbiddenError(
        'NOT_TEAM_LEAD',
        'ສະເພາະຫົວໜ້າທີມ ຫຼື ຜູ້ດູແລ ຈຶ່ງມອບໝາຍໃຫ້ຄົນອື່ນໄດ້',
        { ticketId: row.id, assigneeId: input.assigneeId },
      );
    }

    /*
     * ผู้รับต้องทำงานกับเรื่องของบริษัทนี้ได้จริง
     *
     * ตรวจที่ฝั่งเซิร์ฟเวอร์เสมอ แม้หน้าจอจะแสดงเฉพาะคนที่มีสิทธิ์อยู่แล้ว
     * เพราะ id ส่งมาจากเบราว์เซอร์ แก้เป็นเลขใครก็ได้ — รวมถึงพนักงานบริษัทอื่น
     * ที่จะได้รับมอบหมายเรื่องที่ตัวเองเปิดดูไม่ได้
     */
    if (!eligible.some((u) => u.id === input.assigneeId)) {
      throw new ValidationError('ASSIGNEE_NOT_ELIGIBLE', 'ຜູ້ນີ້ຮັບເລື່ອງຂອງບໍລິສັດນີ້ບໍ່ໄດ້', [
        { field: 'assignee_id', message: 'ເລືອກເຈົ້າໜ້າທີ່ທີ່ດູແລບໍລິສັດນີ້' },
      ]);
    }

    // หัวหน้าทีมจริง แต่เลือกคนนอกทีมตัวเอง — ผิดที่ค่าที่ส่งมา จึงเป็น 422 รายฟิลด์
    if (!decision.allowed) {
      throw new ValidationError('ASSIGNEE_NOT_IN_TEAM', 'ຜູ້ນີ້ບໍ່ໄດ້ຢູ່ໃນທີມຂອງທ່ານ', [
        { field: 'assignee_id', message: 'ເລືອກໄດ້ສະເພາະສະມາຊິກໃນທີມທີ່ທ່ານເປັນຫົວໜ້າ' },
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

    return {
      fromAssigneeId: change.fromAssigneeId,
      fromStatus: change.fromStatus,
      toStatus: change.toStatus,
    };
  }
}
