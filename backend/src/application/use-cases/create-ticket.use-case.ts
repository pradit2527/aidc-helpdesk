import { Inject, Injectable } from '@nestjs/common';

import type { Impact, Urgency } from '../../common/constants';
import { ForbiddenError, ValidationError } from '../../common/errors/domain-error';
import type { AccessScope } from '../../common/scope';
import { computeDueAt, nextWorkingInstant } from '../../common/sla/business-time';
import { SlaConfigRepository } from '../../db/repositories/sla-config.repository';
import { TicketEntity, type NewTicketProps } from '../../domain/ticket/ticket.entity';
import { CLOCK, type Clock } from '../ports/clock.port';
import { TICKET_REPOSITORY, type ITicketRepository } from '../ports/ticket-repository.port';

export interface CreateTicketInput extends Omit<NewTicketProps, 'createdBy' | 'companyId' | 'requesterId'> {
  companyId?: number | undefined;
  requesterId?: number | undefined;
}

/**
 * แจ้งเรื่องใหม่
 *
 * ลำดับที่ทำ และเหตุผลว่าทำไมต้องเรียงแบบนี้
 *   1. ตรวจสิทธิ์ก่อน — ถูกที่สุด และล้มเร็วที่สุด
 *   2. ให้ entity ตรวจกฎของตัวเองและคำนวณระดับความสำคัญ
 *   3. คำนวณกำหนดเวลา SLA จากระดับที่ entity คำนวณให้ ไม่ใช่จากที่ผู้เรียกส่งมา
 *   4. บันทึกทั้งหมดในทรานแซกชันเดียว
 *
 * ข้อ 3 สำคัญกว่าที่เห็น — ถ้าคำนวณกำหนดเวลาจาก priority ที่ผู้เรียกส่งมา
 * กฎ "ผู้แจ้งกำหนดระดับความสำคัญเองไม่ได้" จะถูกข้ามไปโดยไม่มีใครสังเกต
 * เพราะเรื่องจะยังถูกบันทึกด้วย priority ที่ถูกต้อง แต่ได้กำหนดเวลาของระดับที่ผู้แจ้งเลือก
 */
@Injectable()
export class CreateTicketUseCase {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: ITicketRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly slaConfig: SlaConfigRepository,
  ) {}

  async execute(scope: AccessScope, input: CreateTicketInput): Promise<number> {
    const companyId = input.companyId ?? scope.homeCompanyId;

    if (!scope.inScope(companyId)) {
      throw new ValidationError('COMPANY_OUT_OF_SCOPE', 'ບໍລິສັດທີ່ລະບຸຢູ່ນອກຂອບເຂດສິດຂອງທ່ານ', [
        { field: 'company_id', message: 'ບໍລິສັດນີ້ຢູ່ນອກຂອບເຂດສິດຂອງທ່ານ' },
      ]);
    }

    const requesterId = input.requesterId ?? scope.userId;
    if (requesterId !== scope.userId && !scope.has('ticket.create_for_other')) {
      throw new ForbiddenError(
        'TICKET_CREATE_FOR_OTHER_FORBIDDEN',
        'ທ່ານບໍ່ມີສິດແຈ້ງເລື່ອງແທນຜູ້ອື່ນ',
      );
    }

    // entity เป็นผู้คำนวณระดับความสำคัญและตรวจกฎของตัวเอง
    const entity = TicketEntity.create({
      ...input,
      companyId,
      requesterId,
      createdBy: scope.userId,
    });

    const sla = await this.resolveSla(entity, companyId);
    return this.tickets.create(entity, sla, scope.userId);
  }

  /**
   * หากำหนดเวลาตอบสนองและแก้ไข
   *
   * นาฬิกาเริ่มเดินเมื่อไรขึ้นกับโหมด (SLA ข้อ 5.3)
   *   P1 นับปฏิทิน เริ่มทันทีที่แจ้ง ไม่ว่าตี 3 หรือวันอาทิตย์
   *   P2–P4 นับเฉพาะนาทีทำการ ถ้าแจ้งนอกเวลางานต้องเลื่อนไปเริ่มที่เวลาเปิดถัดไป
   *
   * ถ้าไม่เลื่อน เรื่องที่แจ้งสองทุ่มวันศุกร์จะดูเหมือนใช้เวลาไปแล้วสองวันครึ่ง
   * ตั้งแต่ก่อนมีใครเห็นมันเสียอีก
   */
  private async resolveSla(
    entity: TicketEntity,
    companyId: number,
  ): Promise<{
    policyId: number | null;
    clockStartedAt: Date;
    responseDueAt: Date | null;
    resolutionDueAt: Date | null;
  }> {
    const target = await this.slaConfig.targetFor(companyId, entity.priority);
    const cal = await this.slaConfig.calendarFor(companyId);

    const now = this.clock.now();
    const clockStartedAt =
      target.clockMode === 'calendar_24x7' ? now : nextWorkingInstant(now, cal);

    const { responseDueAt, resolutionDueAt } = computeDueAt({
      clockStart: clockStartedAt,
      responseMinutes: target.responseMinutes,
      resolutionMinutes: target.resolutionMinutes,
      cal,
      mode: target.clockMode,
    });

    return { policyId: target.policyId, clockStartedAt, responseDueAt, resolutionDueAt };
  }
}

/** ชนิดที่ controller ใช้แปลง DTO เข้ามา — แยกไว้ให้ import ได้โดยไม่ลาก use case ทั้งก้อน */
export type { Impact, Urgency };
