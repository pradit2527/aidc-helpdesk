import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  computePriority,
  type ClockMode,
  type Impact,
  type Priority,
  type Urgency,
} from '../../common/constants';
import type { AccessScope } from '../../common/scope';
import {
  computeDueAt,
  elapsedMinutes,
  nextWorkingInstant,
  slaStatus,
} from '../../common/sla/business-time';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import { SlaConfigRepository } from '../../db/repositories/sla-config.repository';
import { TicketRepository, type TicketRow } from '../../db/repositories/ticket.repository';
import { company, ticket, ticketStatusHistory } from '../../db/schema';
import {
  ChangePriorityDto,
  ChangeStatusDto,
  CreateTicketDto,
  TicketDetailDto,
  TicketListItemDto,
  TicketListResponseDto,
  TicketSlaDto,
} from './dto/ticket.dto';

/**
 * ตรรกะของเรื่องแจ้ง — อ่านและเขียนฐานข้อมูลจริง
 *
 * กติกาสามข้อที่ service นี้บังคับ และห้ามย้ายไปอยู่ที่ controller
 *   1. ระดับความสำคัญมาจากเมทริกซ์ impact × urgency เสมอ ไม่เคยรับจาก client
 *   2. กำหนดเวลาคำนวณจากปฏิทินเวลาทำการของบริษัทนั้น ไม่ใช่บวกชั่วโมงตรง ๆ
 *   3. สถานะ SLA คำนวณตอนอ่านทุกครั้ง ไม่เก็บลงฐานข้อมูล
 *      เพราะมันเปลี่ยนตามเวลาที่ผ่านไปโดยที่ไม่มีใครแตะ ticket เลย
 */
@Injectable()
export class TicketsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly tickets: TicketRepository,
    private readonly slaConfig: SlaConfigRepository,
  ) {}

  async list(scope: AccessScope, query: Record<string, string>): Promise<TicketListResponseDto> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(Math.max(1, Number(query.page_size ?? 20)), 100);

    const { rows, total } = await this.tickets.list(scope, {
      companyIds: query.company_id ? query.company_id.split(',').map(Number) : null,
      status: query.status?.split(',') ?? [],
      priority: query.priority?.split(',') ?? [],
      ticketType: query.ticket_type,
      assigneeId: query.assignee_id === 'me' ? scope.userId : undefined,
      requesterId: query.requester_id === 'me' ? scope.userId : undefined,
      unassigned: query.unassigned === 'true',
      q: query.q,
      page,
      pageSize,
    });

    const items = await Promise.all(rows.map((row) => this.toListItem(row)));

    // กรองสถานะ SLA หลังคำนวณ เพราะเป็นค่าที่ไม่ได้เก็บในฐานข้อมูล
    // จึงเขียนเป็นเงื่อนไข WHERE ไม่ได้ — total จึงยังเป็นจำนวนก่อนกรอง
    const wanted = query.sla_status?.split(',');
    const filtered = wanted ? items.filter((i) => wanted.includes(i.sla.status)) : items;

    return {
      items: filtered,
      page,
      page_size: pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async detail(scope: AccessScope, id: number): Promise<TicketDetailDto> {
    return this.toDetail(await this.tickets.findById(scope, id), scope);
  }

  async create(scope: AccessScope, dto: CreateTicketDto): Promise<TicketDetailDto> {
    const companyId = dto.company_id ?? scope.homeCompanyId;
    if (!scope.inScope(companyId)) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: 'ບໍລິສັດທີ່ລະບຸຢູ່ນອກຂອບເຂດສິດຂອງທ່ານ' },
      });
    }

    const requesterId = dto.requester_id ?? scope.userId;
    if (requesterId !== scope.userId) {
      scope.require('ticket.create_for_other');
    }

    // ระดับความสำคัญเป็นผลลัพธ์ ไม่ใช่ค่ารับเข้า (SLA ข้อ 4)
    const priority = computePriority(dto.impact as Impact, dto.urgency as Urgency);
    const target = await this.slaConfig.targetFor(companyId, priority);
    const cal = await this.slaConfig.calendarFor(companyId);

    /**
     * นาฬิกาเริ่มเดินเมื่อไร (SLA 5.3)
     *
     * P1 นับปฏิทิน จึงเริ่มทันทีที่แจ้ง ไม่ว่าตี 3 หรือวันอาทิตย์
     * P2–P4 นับเฉพาะนาทีทำการ ถ้าแจ้งนอกเวลางานต้องเริ่มที่เวลาเปิดทำการถัดไป
     * มิฉะนั้นเรื่องที่แจ้ง 20:00 จะดูเหมือนใช้เวลาไปแล้วหลายชั่วโมงทั้งที่ยังไม่เปิดออฟฟิศ
     */
    const now = new Date();
    const clockStart =
      target.clockMode === 'calendar_24x7' ? now : nextWorkingInstant(now, cal);

    const { responseDueAt, resolutionDueAt } = computeDueAt({
      clockStart,
      responseMinutes: target.responseMinutes,
      resolutionMinutes: target.resolutionMinutes,
      cal,
      mode: target.clockMode,
    });

    const [companyRow] = await this.db
      .select({ code: company.code })
      .from(company)
      .where(eq(company.id, companyId))
      .limit(1);
    if (!companyRow) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: 'ບໍ່ພົບບໍລິສັດທີ່ລະບຸ' },
      });
    }

    const created = await this.db.transaction(async (tx) => {
      const ticketNo = await this.tickets.nextTicketNo(tx, companyId, companyRow.code, now);

      const [row] = await tx
        .insert(ticket)
        .values({
          ticketNo,
          ticketType: dto.ticket_type ?? 'incident',
          companyId,
          departmentId: dto.department_id ?? null,
          categoryId: dto.category_id,
          catalogItemId: dto.catalog_item_id ?? null,
          serviceId: dto.service_id ?? null,
          requesterId,
          createdBy: scope.userId,
          subject: dto.subject,
          description: dto.description,
          channel: dto.channel ?? 'portal',
          sourceDevice: dto.source_device ?? null,
          assetTag: dto.asset_tag ?? null,
          impact: dto.impact,
          urgency: dto.urgency,
          priority,
          status: 'new',
          slaPolicyId: target.policyId,
          slaClockStartedAt: clockStart,
          responseDueAt,
          resolutionDueAt,
        })
        .returning({ id: ticket.id });

      const ticketId = row!.id;

      // แถวแรกของประวัติ ทำให้ไทม์ไลน์เริ่มที่ "ใครแจ้ง" เสมอ ไม่ใช่เริ่มกลางเรื่อง
      await tx.insert(ticketStatusHistory).values({
        ticketId,
        fromStatus: null,
        toStatus: 'new',
        changedBy: scope.userId,
      });

      return ticketId;
    });

    return this.detail(scope, created);
  }

  async changeStatus(
    scope: AccessScope,
    id: number,
    dto: ChangeStatusDto,
  ): Promise<TicketDetailDto> {
    const row = await this.tickets.findById(scope, id);
    scope.require('ticket.change_status');

    const now = new Date();
    const entering = dto.to_status === 'pending_user';
    const leaving = row.status === 'pending_user' && !entering;

    let pausedMinutes = row.pendingDurationMinutes;
    if (leaving && row.pendingStartedAt) {
      // สะสมเวลาที่หยุดนับไว้ แล้วเลื่อนกำหนดปิดงานออกไปเท่ากัน (SLA 5.4)
      const cal = await this.slaConfig.calendarFor(row.companyId);
      const target = await this.slaConfig.targetFor(row.companyId, row.priority as Priority);
      pausedMinutes += minutesPaused(row.pendingStartedAt, now, cal, target.clockMode);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(ticket)
        .set({
          status: dto.to_status,
          pendingReason: entering ? (dto.pending_reason ?? null) : null,
          pendingStartedAt: entering ? now : null,
          pendingDurationMinutes: pausedMinutes,
          resolvedAt: dto.to_status === 'resolved' ? now : row.resolvedAt,
          closedAt: dto.to_status === 'closed' ? now : null,
          closedBy: dto.to_status === 'closed' ? scope.userId : null,
        })
        .where(eq(ticket.id, id));

      await tx.insert(ticketStatusHistory).values({
        ticketId: id,
        fromStatus: row.status,
        toStatus: dto.to_status,
        reason: dto.reason ?? null,
        changedBy: scope.userId,
      });
    });

    return this.detail(scope, id);
  }

  async changePriority(
    scope: AccessScope,
    id: number,
    dto: ChangePriorityDto,
  ): Promise<TicketDetailDto> {
    const row = await this.tickets.findById(scope, id);
    scope.require('ticket.change_priority');

    const impact = (dto.impact ?? row.impact) as Impact;
    const urgency = (dto.urgency ?? row.urgency) as Urgency;
    const priority = computePriority(impact, urgency);

    /**
     * เปลี่ยนระดับกลางทาง = นาฬิกานับใหม่ตามระดับใหม่ ตั้งแต่เวลาที่ปรับ (SLA 5.4)
     * ไม่ใช่คำนวณจาก created_at ใหม่ — เรื่องที่เปิดมา 3 วันแล้วปรับเป็น P1
     * จะกลายเป็นเกินกำหนดตั้งแต่วินาทีที่กดปรับ ทั้งที่เพิ่งรู้ว่ามันร้ายแรง
     */
    const changedAt = new Date();
    const target = await this.slaConfig.targetFor(row.companyId, priority);
    const cal = await this.slaConfig.calendarFor(row.companyId);
    const clockStart =
      target.clockMode === 'calendar_24x7' ? changedAt : nextWorkingInstant(changedAt, cal);

    const { responseDueAt, resolutionDueAt } = computeDueAt({
      clockStart,
      responseMinutes: target.responseMinutes,
      resolutionMinutes: target.resolutionMinutes,
      cal,
      mode: target.clockMode,
      pausedMinutes: row.pendingDurationMinutes,
    });

    await this.db.transaction(async (tx) => {
      await tx
        .update(ticket)
        .set({
          impact,
          urgency,
          priority,
          priorityChangedAt: changedAt,
          slaPolicyId: target.policyId,
          responseDueAt,
          resolutionDueAt,
          isMajorIncident: priority === 'P1' ? true : row.isMajorIncident,
        })
        .where(eq(ticket.id, id));

      // เหตุผลบังคับทุกครั้ง เพื่อให้รายงานรายเดือนตรวจได้ว่าเกณฑ์ใช้ได้จริงไหม
      // to_status เก็บสถานะเดิมไว้เพราะการปรับระดับไม่ได้เปลี่ยนสถานะ
      await tx.insert(ticketStatusHistory).values({
        ticketId: id,
        fromStatus: row.status,
        toStatus: row.status,
        fromPriority: row.priority,
        toPriority: priority,
        reason: dto.reason,
        changedBy: scope.userId,
      });
    });

    return this.detail(scope, id);
  }

  // ── การแปลงแถวเป็น DTO ───────────────────────────────────────────

  private async slaBlock(row: TicketRow): Promise<TicketSlaDto> {
    const priority = row.priority as Priority;
    const target = await this.slaConfig.targetFor(row.companyId, priority);
    const cal = await this.slaConfig.calendarFor(row.companyId);
    const now = new Date();
    const clockStart = row.slaClockStartedAt ?? row.createdAt;

    const status = slaStatus({
      status: row.status,
      clockStart,
      resolutionDueAt: row.resolutionDueAt,
      now,
      cal,
      resolutionMinutes: target.resolutionMinutes,
      mode: target.clockMode,
      pausedMinutes: row.pendingDurationMinutes,
      pendingStartedAt: row.pendingStartedAt,
      workaroundAt: row.workaroundAt,
      exclusionCode: row.slaExclusionCode,
    });

    const used = elapsedMinutes({
      clockStart,
      now,
      cal,
      mode: target.clockMode,
      pausedMinutes: row.pendingDurationMinutes,
      pendingStartedAt: row.pendingStartedAt,
      workaroundAt: row.workaroundAt,
    });

    return {
      policy_id: target.policyId,
      doc_ref: target.docRef ?? undefined,
      doc_version: target.docVersion ?? undefined,
      clock_mode: target.clockMode,
      clock_started_at: clockStart.toISOString(),
      response_due_at: row.responseDueAt?.toISOString() ?? null,
      resolution_due_at: row.resolutionDueAt?.toISOString() ?? null,
      first_response_at: row.firstResponseAt?.toISOString() ?? null,
      status,
      // นาทีที่เหลือ คิดจากเป้าหมายลบเวลาที่ใช้ไป — ติดลบแปลว่าเกินกำหนดแล้ว
      // ระหว่างหยุดนับให้เป็น null เพราะ "เหลืออีกเท่าไร" ไม่มีความหมายตอนโมงหยุด
      remaining_minutes: status === 'paused' ? null : target.resolutionMinutes - used,
      remaining_unit:
        target.clockMode === 'calendar_24x7' ? 'calendar_minutes' : 'business_minutes',
      next_status_report_due_at: null,
      is_response_breached: row.isResponseBreached,
      is_resolution_breached: row.isResolutionBreached,
      paused_at: row.pendingStartedAt?.toISOString() ?? null,
      pending_reason: row.pendingReason as TicketSlaDto['pending_reason'],
      pending_duration_minutes: row.pendingDurationMinutes,
      workaround_at: row.workaroundAt?.toISOString() ?? null,
      exclusion_code: row.slaExclusionCode,
    };
  }

  private async toListItem(row: TicketRow): Promise<TicketListItemDto> {
    return {
      id: row.id,
      ticket_no: row.ticketNo,
      // คอลัมน์เหล่านี้เป็น varchar ที่มี CHECK คุมค่าอยู่แล้วในฐานข้อมูล
      // TypeScript มองเห็นแค่ string จึงต้องบอกชนิดที่แคบกว่าตรงนี้
      ticket_type: row.ticketType as TicketListItemDto['ticket_type'],
      subject: row.subject,
      status: row.status as TicketListItemDto['status'],
      pending_reason: row.pendingReason as TicketListItemDto['pending_reason'],
      priority: row.priority as Priority,
      support_tier: row.supportTier as TicketListItemDto['support_tier'],
      company: { id: row.companyId, code: row.companyCode },
      department: row.departmentId
        ? { id: row.departmentId, name: row.departmentName ?? '' }
        : null,
      category: { id: row.categoryId, name_th: row.categoryName },
      requester: { id: row.requesterId, full_name: row.requesterName },
      assignee: row.assigneeId
        ? { id: row.assigneeId, full_name: row.assigneeName ?? '' }
        : null,
      sla: await this.slaBlock(row),
      reopen_count: row.reopenCount,
      comment_count: 0,
      attachment_count: 0,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private async toDetail(row: TicketRow, scope: AccessScope): Promise<TicketDetailDto> {
    const base = await this.toListItem(row);
    const closed = ['resolved', 'closed', 'cancelled'].includes(row.status);
    const isOwner = row.requesterId === scope.userId;

    /**
     * บล็อก can ประเมินที่นี่ที่เดียว frontend ไม่คำนวณเงื่อนไขเองแม้แต่ข้อเดียว
     * (docs/04-rbac-sla.md §2 สัญญากับ Frontend)
     */
    return {
      ...base,
      description: row.description,
      channel: row.channel as TicketDetailDto['channel'],
      impact: row.impact as TicketDetailDto['impact'],
      urgency: row.urgency as TicketDetailDto['urgency'],
      resolved_at: row.resolvedAt?.toISOString() ?? null,
      resolution_note: row.resolutionNote,
      workaround_note: row.workaroundNote,
      vendor_ref: row.vendorRef,
      is_major_incident: row.isMajorIncident,
      is_security_incident: row.isSecurityIncident,
      satisfaction_score: row.satisfactionScore,
      can: {
        update: !closed && (scope.has('ticket.update') || (isOwner && row.status === 'new')),
        assign: !closed && scope.has('ticket.assign'),
        assign_self: !closed && row.assigneeId === null && scope.has('ticket.assign_self'),
        change_status: !closed && scope.has('ticket.change_status'),
        change_priority: !closed && scope.has('ticket.change_priority'),
        request_priority_review: !closed && scope.has('ticket.request_priority_review'),
        set_workaround:
          !closed && row.ticketType === 'incident' && scope.has('ticket.set_workaround'),
        declare_major_incident: !closed && scope.has('ticket.declare_major_incident'),
        comment: scope.has('ticket.comment') || isOwner,
        comment_internal: scope.has('ticket.comment_internal'),
        attach: !closed && (scope.has('ticket.attach') || isOwner),
        close_own: row.status === 'resolved' && (isOwner || scope.has('ticket.close_own')),
        reopen: ['resolved', 'closed'].includes(row.status) && scope.has('ticket.reopen'),
        cancel: row.status === 'new' && (isOwner || scope.has('ticket.cancel')),
        delete: scope.has('ticket.delete'),
        view_history: scope.has('ticket.view_history') || isOwner,
      },
    };
  }
}

/** นาทีที่หยุดนับระหว่างรอผู้แจ้ง — หน่วยตามโหมดนาฬิกาของระดับนั้น */
function minutesPaused(
  from: Date,
  to: Date,
  cal: Parameters<typeof elapsedMinutes>[0]['cal'],
  mode: ClockMode,
): number {
  return elapsedMinutes({ clockStart: from, now: to, cal, mode });
}
