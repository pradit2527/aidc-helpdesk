import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  clockStartsAfterApproval,
  type Impact,
  type TicketStatus,
  type Urgency,
} from '../../common/constants';
import { ForbiddenError, ValidationError } from '../../common/errors/domain-error';
import type { AccessScope } from '../../common/scope';
import { computeDueAt, nextWorkingInstant } from '../../common/sla/business-time';
import {
  ServiceCatalogRepository,
  type CatalogItemForTicket,
  type PlannedApprovalStep,
} from '../../db/repositories/service-catalog.repository';
import { SlaConfigRepository } from '../../db/repositories/sla-config.repository';
import { resolveTicketType } from '../../domain/ticket/ticket-type-policy';
import { TicketEntity, type NewTicketProps } from '../../domain/ticket/ticket.entity';
import { CLOCK, type Clock } from '../ports/clock.port';
import { TICKET_REPOSITORY, type ITicketRepository } from '../ports/ticket-repository.port';

export interface CreateTicketInput
  extends Omit<NewTicketProps, 'createdBy' | 'companyId' | 'requesterId'> {
  companyId?: number | undefined;
  requesterId?: number | undefined;
  /**
   * คนที่พิมพ์เรื่องนี้เข้ามาเป็นพนักงานในเครือจริงหรือไม่
   *
   * ไม่ระบุ = true — ทางเข้าปกติทุกทางต้องล็อกอินด้วยบัญชีพนักงานก่อนอยู่แล้ว
   * ทางเดียวที่ส่ง false มาคือการยกระดับแชทจาก widget ที่ยังไม่รู้ว่าคนถามเป็นใคร
   * (ดู resolveTicketType ใน domain/ticket/ticket-type-policy.ts)
   */
  submitterIsInternal?: boolean | undefined;
}

export interface CreateTicketResult {
  id: number;
  status: TicketStatus;
  /** true = ชนิดของเรื่องถูกดัดจาก incident เป็น service_request ตามกฎผู้แจ้งภายนอก */
  ticketTypeCoerced: boolean;
  /** จำนวนขั้นอนุมัติที่ถูกสร้างขึ้นพร้อมเรื่อง */
  approvalStepCount: number;
}

/**
 * แจ้งเรื่องใหม่
 *
 * ลำดับที่ทำ และเหตุผลว่าทำไมต้องเรียงแบบนี้
 *   1. ตรวจสิทธิ์ก่อน — ถูกที่สุด และล้มเร็วที่สุด
 *   2. ตัดสินชนิดของเรื่อง — เพราะชนิดเป็นตัวเลือกเครื่องสถานะทั้งเครื่อง
 *   3. ให้ entity ตรวจกฎของตัวเองและคำนวณระดับความสำคัญ
 *   4. อ่านรายการใน catalog เพื่อรู้ว่าต้องอนุมัติไหม และนาฬิกาเริ่มเมื่อไร
 *   5. คำนวณกำหนดเวลา SLA จากระดับที่ entity คำนวณให้ ไม่ใช่จากที่ผู้เรียกส่งมา
 *   6. บันทึกทั้งหมดในทรานแซกชันเดียว
 *
 * ข้อ 5 สำคัญกว่าที่เห็น — ถ้าคำนวณกำหนดเวลาจาก priority ที่ผู้เรียกส่งมา
 * กฎ "ผู้แจ้งกำหนดระดับความสำคัญเองไม่ได้" จะถูกข้ามไปโดยไม่มีใครสังเกต
 * เพราะเรื่องจะยังถูกบันทึกด้วย priority ที่ถูกต้อง แต่ได้กำหนดเวลาของระดับที่ผู้แจ้งเลือก
 */
@Injectable()
export class CreateTicketUseCase {
  private readonly logger = new Logger('CreateTicket');

  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: ITicketRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly slaConfig: SlaConfigRepository,
    private readonly catalog: ServiceCatalogRepository,
  ) {}

  async execute(scope: AccessScope, input: CreateTicketInput): Promise<CreateTicketResult> {
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

    /*
     * ชนิดของเรื่องถูกตัดสินที่นี่ที่เดียว ทั้งสองทางเข้าใช้ฟังก์ชันเดียวกัน
     *
     * ต้องทำก่อนสร้าง entity เพราะ entity ใช้ชนิดเลือกตารางสถานะของตัวเอง
     * ถ้าดัดทีหลัง เรื่องจะถูกสร้างด้วยตารางของ incident แล้วค่อยเปลี่ยนชนิด
     * ซึ่งทำให้มันอยู่ในสถานะที่ตารางใหม่ไม่รู้จัก
     */
    const typeDecision = resolveTicketType(input.ticketType, {
      isInternalAccount: input.submitterIsInternal ?? true,
    });

    if (typeDecision.coerced) {
      // ไม่ log ชื่อหรือข้อความของผู้เข้าชม — บรรทัดนี้ไปอยู่ในระบบเก็บ log กลาง
      this.logger.log(
        `ดัดชนิดเรื่องเป็น service_request: ผู้แจ้งไม่ใช่บัญชีพนักงานในเครือ (บริษัท ${companyId})`,
      );
    }

    /*
     * ── คำขอบริการทุกใบต้องผูกกับรายการใน catalog (G-14) ──
     *
     * CHECK `ck_ticket_service_request_needs_catalog` บังคับข้อนี้ถึงระดับฐานข้อมูล
     * ปกติผู้แจ้งเลือกรายการมาเองจากฟอร์ม แต่เรื่องที่ **ถูกดัดชนิด** ไม่มีใครเลือกให้
     * — ผู้เข้าชมเว็บภายนอกเล่าปัญหาในแชท เจ้าหน้าที่กดยกระดับ แล้วระบบดัดเป็น
     * คำขอบริการตามกฎ ถ้าไม่เติมรายการให้ การบันทึกจะล้มด้วย error ของฐานข้อมูล
     * ที่ผู้ใช้อ่านไม่รู้เรื่อง และช่องทาง Support Hub จะพังทั้งช่องทาง
     *
     * เติมด้วยรายการ "อื่น ๆ (ລະບຸເອງ)" ซึ่งมีไว้สำหรับกรณีนี้พอดี
     */
    let catalogItemId = input.catalogItemId ?? null;
    let catalogItem = catalogItemId != null ? await this.catalog.byId(catalogItemId) : null;

    if (typeDecision.ticketType === 'service_request' && catalogItem === null) {
      catalogItem = await this.catalog.unlistedRequestItem(companyId);
      if (catalogItem === null) {
        /*
         * ล้มด้วยข้อความที่บอกวิธีแก้ ดีกว่าปล่อยให้ CHECK ของฐานข้อมูลล้ม
         *
         * และดีกว่าการ "ถอยไปเป็นเหตุขัดข้องแทน" ซึ่งจะเป็นการข้ามกฎความปลอดภัย
         * เงียบ ๆ ทุกครั้งที่ข้อมูลตั้งค่าไม่ครบ
         */
        throw new ValidationError(
          'CATALOG_ITEM_REQUIRED',
          'ຄຳຂໍບໍລິການຕ້ອງຜູກກັບລາຍການໃນ catalog',
          [
            {
              field: 'catalog_item_id',
              message:
                `ຍັງບໍ່ໄດ້ຕັ້ງລາຍການ "${ServiceCatalogRepository.UNLISTED_REQUEST_CODE}" ` +
                'ໃນລະບົບ — ກະລຸນາແຈ້ງຜູ້ດູແລ ຫຼື ເລືອກລາຍການເອງ',
            },
          ],
        );
      }
      catalogItemId = catalogItem.id;
    }

    // entity เป็นผู้คำนวณระดับความสำคัญและตรวจกฎของตัวเอง
    const entity = TicketEntity.create({
      ...input,
      ticketType: typeDecision.ticketType,
      catalogItemId,
      companyId,
      requesterId,
      createdBy: scope.userId,
    });

    /*
     * ต้องอนุมัติก่อนไหม
     *
     * เฉพาะคำขอบริการเท่านั้น — เหตุขัดข้องไม่มีขั้นอนุมัติในเครื่องสถานะของมันเลย
     * ถ้าปล่อยให้เหตุขัดข้องที่เผลอผูก catalog item เข้ามาแตกขั้นอนุมัติด้วย
     * มันจะพยายามไปสถานะ pending_approval ซึ่งตารางของ incident ปฏิเสธ
     */
    const approvals: PlannedApprovalStep[] =
      typeDecision.ticketType === 'service_request' && catalogItem?.requiresApproval
        ? await this.catalog.planApprovals({
            chain: catalogItem.approvalChain,
            companyId,
            requesterId,
          })
        : [];

    /*
     * สายอนุมัติที่ตั้งไว้ว่า "ต้องอนุมัติ" แต่แตกเป็นขั้นไม่ได้เลย
     *
     * เกิดเมื่อ approval_chain มีแต่ค่าที่ไม่รู้จัก — ปล่อยเรื่องไปสถานะ
     * pending_approval ไม่ได้เด็ดขาด เพราะจะไม่มีใบอนุมัติให้ใครกด
     * เรื่องจะค้างตลอดกาลโดยไม่มีอะไรฟ้อง เดินหน้าแบบไม่ต้องอนุมัติแทน
     * แล้วเขียน log ให้ผู้ดูแลเห็นว่าข้อมูลตั้งค่าผิด
     */
    if (catalogItem?.requiresApproval && approvals.length === 0) {
      this.logger.warn(
        `รายการ catalog ${catalogItem.code} ตั้ง requires_approval ไว้ ` +
          `แต่ approval_chain (${catalogItem.approvalChain ?? 'ว่าง'}) ไม่มีชนิดผู้อนุมัติที่ถูกต้องเลย — ` +
          'เรื่องนี้จึงไม่ถูกส่งเข้าขั้นอนุมัติ กรุณาแก้ข้อมูลตั้งค่า',
      );
    }

    if (approvals.length > 0) {
      // ตารางสถานะของคำขอบริการเป็นผู้อนุญาตเส้น new → pending_approval
      entity.changeStatus('pending_approval', this.clock.now(), {
        actorId: scope.userId,
      });
    }

    const sla = await this.resolveSla(entity, companyId, catalogItem, approvals.length > 0);
    const id = await this.tickets.create(entity, sla, scope.userId, {
      approvals,
      initialStatus: 'new',
    });

    return {
      id,
      status: entity.status,
      ticketTypeCoerced: typeDecision.coerced,
      approvalStepCount: approvals.length,
    };
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
   *
   * ── เป้าหมายของคำขอบริการมาจากรายการใน catalog ไม่ใช่ตาราง priority ──
   *
   * "รีเซ็ตรหัสผ่าน" มีเป้า 30 นาทีทำการ ส่วน P4 ในตารางมาตรฐานคือ 2,700 นาที
   * ต่างกัน 90 เท่า — ใช้ตารางเดียวแทนกันไม่ได้ (เหตุผลที่ตาราง
   * service_catalog_item มีคอลัมน์ target_minutes ตั้งแต่แรก)
   *
   * ⚠️ กำหนด "ตอบรับ" ยังใช้ตารางมาตรฐานเสมอ ทุกชนิดทุกรายการ
   *    การตอบรับคือการบอกผู้แจ้งว่ามีคนเห็นเรื่องแล้ว ซึ่งเร็วเท่ากันหมด
   *    ไม่ขึ้นกับว่าสิ่งที่ขอจะใช้เวลาทำนานแค่ไหน
   */
  private async resolveSla(
    entity: TicketEntity,
    companyId: number,
    catalogItem: CatalogItemForTicket | null,
    awaitingApproval: boolean,
  ): Promise<{
    policyId: number | null;
    clockStartedAt: Date | null;
    responseDueAt: Date | null;
    resolutionDueAt: Date | null;
  }> {
    const target = await this.slaConfig.targetFor(companyId, entity.priority);
    const cal = await this.slaConfig.calendarFor(companyId);

    const now = this.clock.now();
    const startedAt = target.clockMode === 'calendar_24x7' ? now : nextWorkingInstant(now, cal);

    const resolutionMinutes =
      catalogItem?.targetMode === 'duration' && catalogItem.targetMinutes !== null
        ? catalogItem.targetMinutes
        : target.resolutionMinutes;

    const { responseDueAt, resolutionDueAt } = computeDueAt({
      clockStart: startedAt,
      responseMinutes: target.responseMinutes,
      resolutionMinutes,
      cal,
      mode: target.clockMode,
    });

    /*
     * นาฬิกา fulfillment ยังไม่เริ่ม ถ้าเรื่องนี้ต้องรออนุมัติก่อน
     *
     * ข้อกำหนดจาก SA: "SLA fulfillment เริ่มนับหลังอนุมัติ ไม่ใช่ตอนเปิดเรื่อง —
     * ป้องกันไอทีโดนนับเวลาทั้งที่ยังรอหัวหน้าอนุมัติ"
     *
     * ปล่อยทั้ง sla_clock_started_at และ resolution_due_at เป็น null ไว้ก่อน
     * แล้วให้ ApprovalsService เติมทั้งคู่ตอนที่ขั้นสุดท้ายผ่าน ค่า null ที่นี่
     * อ่านตรงตัวว่า "ยังไม่เริ่มจับเวลา" ซึ่งงานกวาด SLA ข้ามให้เองอยู่แล้ว
     * (เงื่อนไข resolution_due_at IS NOT NULL)
     *
     * ⚠️ ดูจาก clock_start_event ของรายการ ไม่ใช่ดูแค่ว่ามีขั้นอนุมัติอยู่
     *    รายการที่ตั้ง on_create ทั้งที่ต้องอนุมัติ คือรายการที่องค์กรตั้งใจ
     *    ให้เริ่มจับเวลาตั้งแต่ยื่น การเดาแทนเจ้าของนโยบายไม่ใช่หน้าที่โค้ด
     */
    const clockGated = awaitingApproval && clockStartsAfterApproval(catalogItem?.clockStartEvent);

    return {
      policyId: target.policyId,
      clockStartedAt: clockGated ? null : startedAt,
      // ตอบรับยังต้องเกิดเสมอ แม้เรื่องจะยังรออนุมัติอยู่
      responseDueAt,
      resolutionDueAt: clockGated ? null : resolutionDueAt,
    };
  }
}

/** ชนิดที่ controller ใช้แปลง DTO เข้ามา — แยกไว้ให้ import ได้โดยไม่ลาก use case ทั้งก้อน */
export type { Impact, Urgency };
