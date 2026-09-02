import { Injectable } from '@nestjs/common';

import type { Impact, Priority, TicketStatus, Urgency } from '../../common/constants';
import type { AccessScope } from '../../common/scope';
import { elapsedMinutes, slaStatus } from '../../common/sla/business-time';
import { CreateTicketUseCase } from '../../application/use-cases/create-ticket.use-case';
import { ChangeTicketStatusUseCase } from '../../application/use-cases/change-ticket-status.use-case';
import { ReassessTicketPriorityUseCase } from '../../application/use-cases/reassess-ticket-priority.use-case';
import { SlaConfigRepository } from '../../db/repositories/sla-config.repository';
import { TicketRepository, type TicketRow } from '../../db/repositories/ticket.repository';
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
 * ตัวประสานของโดเมนเรื่องแจ้ง
 *
 * หน้าที่หลังแยกชั้นแล้วเหลือสองอย่าง
 *   1. เรียก use case ที่เหมาะกับคำสั่งที่เข้ามา
 *   2. แปลงแถวจากฐานข้อมูลเป็น DTO ที่ frontend ใช้ได้
 *
 * กฎธุรกิจย้ายไปอยู่ที่ TicketEntity แล้ว และการเขียนฐานข้อมูลย้ายไปอยู่ที่
 * TicketRepository — เดิม service นี้เรียก this.db เขียนตาราง ticket ตรง ๆ
 * ซึ่งข้ามด่านขอบเขตสิทธิ์ที่ repository บังคับอยู่
 *
 * สถานะ SLA ยังคำนวณตอนอ่านทุกครั้ง ไม่เก็บลงฐานข้อมูล
 * เพราะมันเปลี่ยนตามเวลาที่ผ่านไปโดยที่ไม่มีใครแตะ ticket เลย
 */
@Injectable()
export class TicketsService {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly slaConfig: SlaConfigRepository,
    private readonly createTicket: CreateTicketUseCase,
    private readonly changeTicketStatus: ChangeTicketStatusUseCase,
    private readonly reassessPriority: ReassessTicketPriorityUseCase,
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
    const id = await this.createTicket.execute(scope, {
      companyId: dto.company_id,
      requesterId: dto.requester_id,
      categoryId: dto.category_id,
      subject: dto.subject,
      description: dto.description,
      impact: dto.impact as Impact,
      urgency: dto.urgency as Urgency,
      ...(dto.ticket_type ? { ticketType: dto.ticket_type } : {}),
      ...(dto.channel ? { channel: dto.channel } : {}),
      ...(dto.department_id !== undefined ? { departmentId: dto.department_id } : {}),
      ...(dto.catalog_item_id !== undefined ? { catalogItemId: dto.catalog_item_id } : {}),
      ...(dto.service_id !== undefined ? { serviceId: dto.service_id } : {}),
      ...(dto.source_device !== undefined ? { sourceDevice: dto.source_device } : {}),
      ...(dto.asset_tag !== undefined ? { assetTag: dto.asset_tag } : {}),
    });
    return this.detail(scope, id);
  }

  async changeStatus(
    scope: AccessScope,
    id: number,
    dto: ChangeStatusDto,
  ): Promise<TicketDetailDto> {
    await this.changeTicketStatus.execute(scope, id, {
      toStatus: dto.to_status as TicketStatus,
      reason: dto.reason,
      pendingReason: dto.pending_reason,
    });
    return this.detail(scope, id);
  }

  async changePriority(
    scope: AccessScope,
    id: number,
    dto: ChangePriorityDto,
  ): Promise<TicketDetailDto> {
    await this.reassessPriority.execute(scope, id, {
      impact: dto.impact as Impact | undefined,
      urgency: dto.urgency as Urgency | undefined,
      reason: dto.reason,
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
