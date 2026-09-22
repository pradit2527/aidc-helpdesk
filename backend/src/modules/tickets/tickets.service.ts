import { Injectable } from '@nestjs/common';

import type { Impact, Priority, TicketStatus, TicketType, Urgency } from '../../common/constants';
import type { AccessScope } from '../../common/scope';
import { elapsedMinutes, minutesBetween, slaStatus } from '../../common/sla/business-time';
import { AssignTicketUseCase } from '../../application/use-cases/assign-ticket.use-case';
import { CreateTicketUseCase } from '../../application/use-cases/create-ticket.use-case';
import { SuperworkService } from '../../integrations/superwork/superwork.service';
import { MasterDataService } from '../master-data/master-data.service';
import { IncidentAlertService } from '../notifications/incident-alert.service';
import { RealtimeGateway, type TicketUpdateKind } from '../realtime/realtime.gateway';
import { ChangeTicketStatusUseCase } from '../../application/use-cases/change-ticket-status.use-case';
import { ReassessTicketPriorityUseCase } from '../../application/use-cases/reassess-ticket-priority.use-case';
import { ServiceCatalogRepository } from '../../db/repositories/service-catalog.repository';
import { SlaConfigRepository } from '../../db/repositories/sla-config.repository';
import { SupportProjectRepository } from '../../db/repositories/support-project.repository';
import { TicketDetailRepository } from '../../db/repositories/ticket-detail.repository';
import { TicketRepository, type TicketRow } from '../../db/repositories/ticket.repository';
import { TicketWriteRepository } from '../../db/repositories/ticket-write.repository';
import { SupportTeamRepository } from '../../db/repositories/support-team.repository';
import { TicketChatNotifier } from '../support-chat/ticket-chat-notifier.service';
import {
  actorMayTransition,
  allowedTransitionsFrom,
  isWithinReopenWindow,
  mayAssignToOthers,
} from '../../domain/ticket/ticket.entity';
import { ForbiddenError, ValidationError } from '../../common/errors/domain-error';
import {
  AssignTicketDto,
  ChangePriorityDto,
  ChangeStatusDto,
  CreateTicketDto,
  LinkTicketDto,
  TicketAssigneeDto,
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
/**
 * จำนวนแถวสูงสุดที่ดึงมาคำนวณเมื่อกรองด้วยสถานะ SLA
 *
 * ตั้งไว้เพื่อไม่ให้คำขอเดียวดึงทั้งตารางขึ้นมาในหน่วยความจำ
 * ค่านี้กว้างพอสำหรับจำนวนเรื่องที่ยังเปิดอยู่ของทั้งกลุ่มบริษัท
 * แต่ถ้าวันหนึ่งเกิน ผลลัพธ์จะไม่ครบโดยไม่มีอะไรฟ้อง — จุดนั้นคือเวลาที่ต้อง
 * ย้ายไปเก็บสถานะ SLA ลงคอลัมน์แล้วกรองใน SQL แทน
 */
const SLA_FILTER_SCAN_CAP = 500;

@Injectable()
export class TicketsService {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly details: TicketDetailRepository,
    private readonly slaConfig: SlaConfigRepository,
    private readonly catalog: ServiceCatalogRepository,
    private readonly createTicket: CreateTicketUseCase,
    private readonly changeTicketStatus: ChangeTicketStatusUseCase,
    private readonly reassessPriority: ReassessTicketPriorityUseCase,
    private readonly assignTicket: AssignTicketUseCase,
    private readonly writes: TicketWriteRepository,
    private readonly superwork: SuperworkService,
    private readonly realtime: RealtimeGateway,
    private readonly master: MasterDataService,
    private readonly teams: SupportTeamRepository,
    private readonly projects: SupportProjectRepository,
    private readonly chatNotifier: TicketChatNotifier,
    private readonly alerts: IncidentAlertService,
  ) {}

  async list(scope: AccessScope, query: Record<string, string>): Promise<TicketListResponseDto> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(Math.max(1, Number(query.page_size ?? 20)), 100);

    const baseFilter = {
      companyIds: query.company_id ? query.company_id.split(',').map(Number) : null,
      status: query.status?.split(',') ?? [],
      priority: query.priority?.split(',') ?? [],
      ticketType: query.ticket_type,
      assigneeId: query.assignee_id === 'me' ? scope.userId : undefined,
      requesterId: query.requester_id === 'me' ? scope.userId : undefined,
      unassigned: query.unassigned === 'true',
      // ค่าที่แปลงเป็นจำนวนเต็มบวกไม่ได้ ถือว่าไม่ได้ส่งมา — กติกาเดียวกับรายงาน
      projectId: positiveInt(query.project_id),
      q: query.q,
      // รับเฉพาะค่าที่รู้จัก ค่าอื่นถือว่าไม่ได้ส่ง — ไม่เอาข้อความจาก query ไปต่อเป็น ORDER BY
      sort:
        query.sort === '-assigned_at'
          ? ('assigned' as const)
          : query.sort === '-created_at'
            ? ('created' as const)
            : ('updated' as const),
    };

    const wanted = query.sla_status?.split(',').filter(Boolean);

    /*
     * สถานะ SLA คำนวณตอนอ่าน ไม่ได้เก็บในฐานข้อมูล จึงเขียนเป็น WHERE ไม่ได้
     *
     * เดิมกรอง "หลัง" แบ่งหน้าแล้ว ซึ่งผิดสองทาง
     *   1. total เป็นจำนวนก่อนกรอง ตัวเลขบนหน้าจอจึงไม่ตรงกับที่เห็น
     *   2. แต่ละหน้าคืนน้อยกว่า page_size ทั้งที่ยังมีรายการที่ตรงเงื่อนไข
     *      อยู่ในหน้าถัดไป ผู้ใช้จึงเห็นเหมือนข้อมูลหาย
     *
     * แก้ด้วยการดึงมาให้ครบก่อนแล้วค่อยกรองและแบ่งหน้าเอง
     *
     * ⚠️ มีเพดานที่ SLA_FILTER_SCAN_CAP เพื่อไม่ให้ดึงทั้งตารางขึ้นมา
     *    ทางแก้ที่ถูกต้องระยะยาวคือให้งานกวาด SLA เขียนสถานะลงคอลัมน์
     *    แล้วกรองใน SQL ตรง ๆ ซึ่งทำได้เมื่อ JOBS_ENABLED=true และมี Redis
     */
    if (wanted?.length) {
      const { rows } = await this.tickets.list(scope, {
        ...baseFilter,
        page: 1,
        pageSize: SLA_FILTER_SCAN_CAP,
      });

      const all = await Promise.all(rows.map((row) => this.toListItem(row)));
      const matched = all.filter((i) => wanted.includes(i.sla.status));
      const start = (page - 1) * pageSize;

      return {
        items: matched.slice(start, start + pageSize),
        page,
        page_size: pageSize,
        total: matched.length,
        total_pages: Math.max(1, Math.ceil(matched.length / pageSize)),
      };
    }

    const { rows, total } = await this.tickets.list(scope, { ...baseFilter, page, pageSize });
    const items = await Promise.all(rows.map((row) => this.toListItem(row)));

    return {
      items,
      page,
      page_size: pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async detail(scope: AccessScope, id: number): Promise<TicketDetailDto> {
    // ต้องผ่าน findById ก่อนเสมอ เพราะเป็นที่เดียวที่บังคับขอบเขตสิทธิ์
    // เรื่องนอกขอบเขตจะได้ 404 ตั้งแต่บรรทัดนี้ ก่อนแตะข้อมูลลูกใด ๆ
    const row = await this.tickets.findById(scope, id);
    const base = await this.toDetail(row, scope);

    /*
     * ผู้แจ้งเห็นคอมเมนต์ภายในไม่ได้ (US-02 AC-3)
     *
     * ตัดสินจากสิทธิ์ ไม่ใช่จากบทบาท — เจ้าหน้าที่ที่เข้ามาดูเรื่องของตัวเอง
     * ในฐานะผู้แจ้งก็ยังควรเห็น เพราะเขามีสิทธิ์อ่านคอมเมนต์ภายในอยู่แล้ว
     * การตัดสินจาก "เป็นผู้แจ้งหรือไม่" จะซ่อนข้อมูลจากคนที่มีสิทธิ์เห็น
     */
    const canSeeInternal = scope.has('ticket.comment_internal', 'ticket.assign');

    const isOwner = row.requesterId === scope.userId;
    const [comments, history, checklist, approvals, catalogItem, requesterTickets] =
      await Promise.all([
        this.details.comments(row.id, canSeeInternal),
        base.can.view_history ? this.details.history(row.id) : Promise.resolve([]),
        this.details.checklist(row.id),
        this.details.approvals(row.id),
        row.catalogItemId === null
          ? Promise.resolve(null)
          : this.catalog.summaryById(row.catalogItemId),
        /*
         * เรื่องอื่นของผู้แจ้งคนเดียวกัน — ผ่าน list() เพื่อให้ได้ตัวกรองขอบเขตสิทธิ์ชุดเดียว
         * กับหน้ารายการ (เหตุความปลอดภัย · บริษัทอื่น) ไม่เขียนเงื่อนไขซ้ำที่นี่
         * ผู้แจ้งดูเรื่องของตัวเองอยู่แล้ว การ์ดนี้จึงไม่มีความหมายสำหรับเขา ข้ามการยิงคิวรีเลย
         * ขอ 6 ใบเพราะใบปัจจุบันอาจติดมาด้วย ตัดออกแล้วเหลือ 5
         */
        isOwner
          ? Promise.resolve({ rows: [] as TicketRow[], total: 0 })
          : this.tickets.list(scope, {
              requesterId: row.requesterId,
              sort: 'created',
              page: 1,
              pageSize: 6,
            }),
      ]);

    /*
     * ไฟล์แนบของคอมเมนต์ต้องดึงหลังรู้ว่าคอมเมนต์ไหนรอดจากการกรองแล้ว
     *
     * ถ้าดึงพร้อมกันข้างบน จะต้องดึงของคอมเมนต์ภายในมาด้วย แล้วค่อยกรองทิ้ง
     * ทีหลัง ซึ่งเท่ากับอ่านข้อมูลที่ผู้เรียกไม่มีสิทธิ์เห็นขึ้นมาก่อน
     */
    const attachments = await this.details.commentAttachments(comments.map((c) => c.id));
    const filesByComment = new Map<number, { id: number; file_name: string; file_size: number }[]>();
    for (const a of attachments) {
      if (a.commentId === null) continue;
      const list = filesByComment.get(a.commentId);
      const file = { id: a.id, file_name: a.fileName, file_size: a.fileSize };
      if (list) list.push(file);
      else filesByComment.set(a.commentId, [file]);
    }

    return {
      ...base,
      catalog_item: catalogItem
        ? { id: catalogItem.id, code: catalogItem.code, name_th: catalogItem.nameTh }
        : null,
      requester_tickets: requesterTickets.rows
        .filter((r) => r.id !== row.id)
        .slice(0, 5)
        .map((r) => ({
          id: r.id,
          ticket_no: r.ticketNo,
          subject: r.subject,
          status: r.status as TicketStatus,
          ticket_type: r.ticketType as TicketType,
        })),
      comments: comments.map((c) => ({
        id: c.id,
        body: c.body,
        is_internal: c.isInternal,
        is_system: c.isSystem,
        created_at: c.createdAt.toISOString(),
        author: c.authorId ? { id: c.authorId, full_name: c.authorName ?? '' } : null,
        /* ต้องเป็นอาเรย์ว่างเสมอเมื่อไม่มีไฟล์ ห้ามเป็น undefined —
           หน้าจออ่าน .length ตรง ๆ ตามสัญญาที่ประกาศไว้ในชนิดข้อมูล */
        attachments: filesByComment.get(c.id) ?? [],
      })),
      history: history.map((h) => ({
        id: h.id,
        from_status: h.fromStatus,
        to_status: h.toStatus,
        from_priority: h.fromPriority,
        to_priority: h.toPriority,
        from_assignee: h.fromAssigneeId
          ? { id: h.fromAssigneeId, full_name: h.fromAssigneeName ?? '' }
          : null,
        to_assignee: h.toAssigneeId
          ? { id: h.toAssigneeId, full_name: h.toAssigneeName ?? '' }
          : null,
        reason: h.reason,
        changed_at: h.changedAt.toISOString(),
        changed_by: h.changedBy ? { id: h.changedBy, full_name: h.actorName ?? '' } : null,
      })),
      checklist: checklist.map((c) => ({
        id: c.id,
        title: c.title,
        is_required: c.isRequired,
        evidence_required: c.evidenceRequired,
        is_done: c.isDone,
        done_at: c.doneAt?.toISOString() ?? null,
        done_by_name: c.doneByName,
        note: c.note,
      })),
      approvals: approvals.map((a) => ({
        id: a.id,
        seq: a.seq,
        approver_type: a.approverType,
        approver_name: a.approverName,
        /*
         * null = ยังหาตัวผู้อนุมัติไม่ได้ (เช่นยังไม่ได้ตั้งผู้ติดต่อ head_of_it / tier2_group)
         * หน้าจอต้องรับค่า null ได้ — เคยทำให้หน้ารายละเอียดพังทั้งหน้า
         */
        approver: a.approverId === null ? null : { id: a.approverId, full_name: a.approverName ?? '' },
        /*
         * กติกาเดียวกับ POST /approvals/{id}/decide: ต้องเป็นผู้อนุมัติของขั้นนี้ ขั้นนี้ต้องเป็นขั้นที่เปิดอยู่
         * (ขั้นแรกสุดที่ยังรอ) และห้ามอนุมัติคำขอของตัวเอง — endpoint ยังตรวจซ้ำเสมอ
         */
        can_decide:
          a.status === 'pending' &&
          a.approverId === scope.userId &&
          row.requesterId !== scope.userId &&
          a.id === approvals.find((x) => x.status === 'pending')?.id,
        status: a.status,
        comment: a.comment,
        requested_at: a.requestedAt?.toISOString() ?? null,
        decided_at: a.decidedAt?.toISOString() ?? null,
        decided_by_name: a.deciderName,
        due_at: a.dueAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * แจ้งเรื่องใหม่
   *
   * @param options ข้อเท็จจริงที่ **เซิร์ฟเวอร์รู้เอง** ไม่ได้มาจากเนื้อคำขอ
   *        ต้องไม่ย้ายไปอยู่ใน CreateTicketDto เด็ดขาด — ดูคอมเมนต์ที่จุดเรียก
   *        ใน SupportChatService.convertToTicket
   */
  async create(
    scope: AccessScope,
    dto: CreateTicketDto,
    options: { submitterIsInternal?: boolean } = {},
  ): Promise<TicketDetailDto> {
    // หมวดหลักที่มีหมวดย่อยใช้แจ้งตรง ๆ ไม่ได้ — รายงานรายหมวดย่อยจะนับขาด
    await this.master.assertCategoryUsableForTicket(scope, dto.category_id);
    await this.assertProjectInReach(scope, dto.project_id);

    const { id } = await this.createTicket.execute(scope, {
      companyId: dto.company_id,
      requesterId: dto.requester_id,
      categoryId: dto.category_id,
      subject: dto.subject,
      description: dto.description,
      impact: dto.impact as Impact,
      urgency: dto.urgency as Urgency,
      ...(dto.ticket_type ? { ticketType: dto.ticket_type } : {}),
      /*
       * ทางนี้เป็นพนักงานในเครือเสมอ — ต้องล็อกอินก่อนถึงจะเรียกได้
       *
       * ส่งค่าให้ชัดแทนที่จะพึ่งค่าตั้งต้น เพื่อให้เห็นว่ากฎ "เหตุขัดข้อง
       * เป็นของพนักงานเท่านั้น" ถูกประเมินที่ทางเข้านี้ด้วย ไม่ใช่แค่ทางแชท
       * วันนี้เป็น no-op (ไม่มีทางที่ค่าจะเป็น false) แต่ถ้าวันหนึ่งมีทางเข้า
       * แบบไม่ต้องล็อกอินเพิ่มเข้ามา กฎจะถูกบังคับอยู่แล้วโดยไม่ต้องไปตามแก้
       */
      submitterIsInternal: options.submitterIsInternal ?? true,
      ...(dto.channel ? { channel: dto.channel } : {}),
      ...(dto.department_id !== undefined ? { departmentId: dto.department_id } : {}),
      ...(dto.catalog_item_id !== undefined ? { catalogItemId: dto.catalog_item_id } : {}),
      ...(dto.service_id !== undefined ? { serviceId: dto.service_id } : {}),
      ...(dto.source_device !== undefined ? { sourceDevice: dto.source_device } : {}),
      ...(dto.asset_tag !== undefined ? { assetTag: dto.asset_tag } : {}),
      ...(dto.project_id !== undefined ? { supportProjectId: dto.project_id } : {}),
    });

    const ticket = await this.detail(scope, id);

    /*
     * เหตุร้ายแรง (P1) ต้องถึงหัวหน้าไอทีทันที ไม่รอให้ใครเปิดหน้าจอมาเห็น
     *
     * ES-01 / SLA 6.2 — "เหตุ P1 ทุกกรณี ทันที นอกเวลาทำการก็ส่ง"
     * ธง is_major_incident ถูกตั้งตั้งแต่ตอนสร้างโดย TicketEntity อยู่แล้ว
     * (P1 คือเหตุร้ายแรงตามนิยาม) — ก่อนหน้านี้ไม่มีอะไรทำอะไรกับธงนั้นเลย
     *
     * ไม่ await ด้วยเหตุผลเดียวกับ Super Work: ผู้ใช้กดแจ้งเรื่องเพื่อขอ
     * ความช่วยเหลือ การแจ้งเตือนที่ช้าหรือล้มต้องไม่ทำให้การแจ้งเรื่องช้าหรือล้มตาม
     */
    if (ticket.is_major_incident) {
      void this.alerts.majorIncidentDeclared({
        ticketId: ticket.id,
        ticketNo: ticket.ticket_no,
        companyId: ticket.company.id,
        subject: ticket.subject,
        priority: ticket.priority,
      });
    }

    /*
     * ส่งขึ้นบอร์ด Super Work แบบไม่รอผล
     *
     * ไม่ await โดยตั้งใจ — ผู้ใช้กดแจ้งเรื่องเพื่อขอความช่วยเหลือ ไม่ใช่เพื่อ
     * ลงบอร์ดโครงการ ถ้า Super Work ช้าหรือล่ม การแจ้งเรื่องต้องไม่ช้าหรือล้มตาม
     * ตัว service กลืนข้อผิดพลาดทั้งหมดลง log อยู่แล้ว
     */
    this.superwork.mirrorTicketInBackground(ticket);

    return ticket;
  }

  async changeStatus(
    scope: AccessScope,
    id: number,
    dto: ChangeStatusDto,
  ): Promise<TicketDetailDto> {
    const transition = await this.changeTicketStatus.execute(scope, id, {
      toStatus: dto.to_status as TicketStatus,
      reason: dto.reason,
      pendingReason: dto.pending_reason,
      comment: dto.comment,
      resolutionNote: dto.resolution_note,
      satisfactionScore: dto.satisfaction_score,
    });
    const ticket = await this.detail(scope, id);
    this.afterStatusChange(ticket, scope.userId, transition, {
      reason: dto.reason,
      resolutionNote: dto.resolution_note,
    });
    return ticket;
  }

  /**
   * ผลข้างเคียงที่ต้องเกิด "ทุกครั้ง" ที่สถานะของเรื่องเปลี่ยน
   *
   * ⚠️ ทางเข้าที่เปลี่ยนสถานะไม่ได้มีแค่ POST /tickets/{id}/status
   *    ApprovalsService.decide() ก็เปลี่ยนสถานะเหมือนกัน (อนุมัติครบ → assigned,
   *    ปฏิเสธ → rejected) และเดิมมันเรียก ChangeTicketStatusUseCase ตรง ๆ
   *    ซึ่งเขียนฐานข้อมูลครบทุกตาราง แต่ **ไม่เคยยิงสัญญาณให้ใครเลย** —
   *    หน้าที่เปิดเรื่องนั้นค้างอยู่ไม่รีเฟรช และห้องแชทของผู้เข้าชมเงียบสนิท
   *    ทั้งที่เรื่องของเขาเพิ่งถูกอนุมัติหรือถูกปฏิเสธ
   *
   *    รวมไว้ที่เมท็อดเดียวแล้วให้ทุกทางเข้าเรียกตัวนี้ แทนที่จะคัดลอกสองบรรทัดนั้น
   *    ไปวางในแต่ละที่ — ผลข้างเคียงที่ถูกคัดลอกคือผลข้างเคียงที่วันหนึ่งจะตกหล่น
   *
   * ไม่ await อะไรเลยโดยตั้งใจ ทั้งสองอย่างเป็นการบอกกล่าว ไม่ใช่การบันทึก
   * ถ้าล้มเหลวต้องไม่ทำให้คำสั่งที่เขียนฐานข้อมูลสำเร็จไปแล้วดูเหมือนล้มเหลว
   */
  afterStatusChange(
    ticket: TicketDetailDto,
    actorId: number,
    transition: { from: TicketStatus; to: TicketStatus },
    detail: { reason?: string | undefined; resolutionNote?: string | undefined } = {},
  ): void {
    this.announce(ticket, actorId, 'status');
    /*
     * ห้องแชทที่ยกระดับมาเป็นเรื่องนี้ได้ข้อความบอกความคืบหน้าด้วย
     *
     * ผู้เข้าชมเว็บไม่มีบัญชีใน Helpdesk เขาเปิดหน้าเรื่องไม่ได้เลย
     * ห้องแชทคือทางเดียวที่เขาจะรู้ว่าเรื่องของตัวเองไปถึงไหนแล้ว
     */
    this.chatNotifier.ticketStatusChanged({
      ticketId: ticket.id,
      ...transition,
      detail,
    });
  }

  async changePriority(
    scope: AccessScope,
    id: number,
    dto: ChangePriorityDto,
  ): Promise<TicketDetailDto> {
    const before = await this.tickets.findById(scope, id);
    await this.reassessPriority.execute(scope, id, {
      impact: dto.impact as Impact | undefined,
      urgency: dto.urgency as Urgency | undefined,
      reason: dto.reason,
    });
    const ticket = await this.detail(scope, id);
    this.announce(ticket, scope.userId, 'priority');

    /*
     * ยกระดับขึ้นมาเป็น P1 = เหตุร้ายแรงเพิ่งเกิดในสายตาของระบบ ต้องแจ้งเหมือน
     * ตอนแจ้งเรื่องใหม่ที่เป็น P1 ตั้งแต่ต้น
     *
     * เทียบกับค่าก่อนหน้าเพื่อไม่ยิงซ้ำตอนทบทวนระดับของเรื่องที่เป็น P1 อยู่แล้ว
     * (ดัชนีกันซ้ำในตาราง notification กันอีกชั้นอยู่แล้ว แต่การไม่ยิงเลย
     *  ประหยัดกว่าการยิงแล้วให้ฐานข้อมูลปฏิเสธ)
     */
    if (ticket.priority === 'P1' && before.priority !== 'P1') {
      void this.alerts.majorIncidentDeclared({
        ticketId: ticket.id,
        ticketNo: ticket.ticket_no,
        companyId: ticket.company.id,
        subject: ticket.subject,
        priority: ticket.priority,
      });
    }

    return ticket;
  }

  /** มอบหมายผู้รับผิดชอบ หรือรับงานเอง (POST /tickets/{id}/assign) */
  async assign(scope: AccessScope, id: number, dto: AssignTicketDto): Promise<TicketDetailDto> {
    const { fromAssigneeId, fromStatus, toStatus } = await this.assignTicket.execute(scope, id, {
      assigneeId: dto.assignee_id,
      comment: dto.comment,
      reason: dto.reason,
    });
    const ticket = await this.detail(scope, id);
    // ผู้รับผิดชอบคนเดิมต้องได้สัญญาณด้วย คิวงานของเขาเพิ่งหายไปหนึ่งเรื่อง
    this.announce(ticket, scope.userId, 'assign', fromAssigneeId);
    /*
     * การรับเรื่องครั้งแรกทำให้สถานะขยับ new → assigned ซึ่งเป็นข่าวของผู้ถาม
     * การย้ายมือระหว่างทาง (สถานะเท่าเดิม) ไม่ใช่ — notifier กรองให้เองจาก from/to
     */
    this.chatNotifier.ticketStatusChanged({ ticketId: ticket.id, from: fromStatus, to: toStatus });
    return ticket;
  }

  /**
   * แจ้งหน้าจอทุกคนที่เกี่ยวกับเรื่องนี้ให้ดึงใหม่ — เรียกหลังเขียนสำเร็จเท่านั้น
   *
   * ใช้ค่าจาก detail ที่อ่านหลังเขียน ผู้รับผิดชอบคนใหม่ (กรณีมอบหมาย) จึงได้สัญญาณด้วย
   */
  private announce(
    ticket: TicketDetailDto,
    actorId: number,
    kind: TicketUpdateKind,
    previousAssigneeId: number | null = null,
  ): void {
    this.realtime.ticketUpdated({
      ticketId: ticket.id,
      ticketNo: ticket.ticket_no,
      status: ticket.status,
      companyId: ticket.company.id,
      requesterId: ticket.requester.id,
      assigneeId: ticket.assignee?.id ?? null,
      previousAssigneeId,
      isSecurityIncident: ticket.is_security_incident,
      actorId,
      kind,
    });
  }

  /**
   * ผู้ที่มอบหมายเรื่องนี้ให้ได้ (GET /tickets/{id}/assignees)
   *
   * ผูกกับเรื่อง ไม่ใช่รายชื่อผู้ใช้ทั่วไป เพราะคำตอบขึ้นกับบริษัทของเรื่อง —
   * เจ้าหน้าที่ที่ดูแลบริษัท ก. รับเรื่องของบริษัท ข. ไม่ได้ ถ้าให้หน้าจอกรองเอง
   * จากรายชื่อทั้งหมด กติกาขอบเขตจะต้องถูกเขียนซ้ำอีกชุดที่ฝั่ง frontend
   *
   * ⚠️ คืนเฉพาะคนที่ผู้เรียก "มอบหมายให้ได้จริง" ไม่ใช่ทุกคนที่มีสิทธิ์รับเรื่อง
   *    รายการนี้คือสิ่งที่หน้าจอเอาไปทำเป็นตัวเลือก ถ้ากว้างกว่าที่คำสั่งจริงยอมรับ
   *    ผู้ใช้จะเลือกชื่อที่ถูกปฏิเสธทุกครั้งที่กด — กติกาต้องเป็นชุดเดียวกัน
   *
   *   - หัวหน้าทีม → สมาชิกในทีมที่ตนเป็นหัวหน้า ∩ คนที่รับเรื่องนี้ได้ (+ ตัวเอง)
   *                  ใช้กับหัวหน้าที่เป็นผู้ดูแลด้วย — เจ้าของระบบสั่งให้หัวหน้าทีมเห็น
   *                  "ลูกทีมของตัวเอง" ไม่ใช่ทุกบัญชีที่รับเรื่องได้ (รวมบัญชีเดโม/ผู้ดูแลอื่น)
   *   - ผู้ดูแลที่ไม่ได้เป็นหัวหน้าทีมไหน → คนที่อยู่ในทีมใดทีมหนึ่ง ∩ คนที่รับเรื่องนี้ได้
   *                  ถ้ายังไม่มีใครถูกจัดเข้าทีมเลย ถอยไปแสดงทุกคนที่รับเรื่องได้
   *                  ไม่งั้นบริษัทที่ยังไม่ตั้งทีมจะมอบหมายใครไม่ได้เลย
   *   - คนอื่น    → ตัวเองคนเดียว (สำหรับปุ่ม "รับงานเอง")
   *
   *   รายการนี้ "แคบกว่า" สิ่งที่คำสั่งมอบหมายยอมรับได้สำหรับผู้ดูแล (ผู้ดูแลยังมอบให้ใคร
   *   ก็ได้ที่รับเรื่องได้ผ่าน API) แต่ไม่มีวันกว้างกว่า จึงไม่มีตัวเลือกที่กดแล้วถูกปฏิเสธ
   */
  async assignees(scope: AccessScope, id: number): Promise<TicketAssigneeDto[]> {
    const row = await this.tickets.findById(scope, id);
    scope.require('ticket.assign', 'ticket.assign_self');

    const eligible = await this.tickets.assignableUsers(row.companyId);

    const mayAssignOthers = mayAssignToOthers({
      canAssign: scope.has('ticket.assign'),
      isAdminLevel: scope.isAdminLevel,
      ledTeamIds: [...scope.ledTeamIds],
    });

    const visible = mayAssignOthers
      ? eligible
      : eligible.filter((u) => u.id === scope.userId);

    /*
     * ทีมของทุกคนในรายการ และจำนวนงานค้างของทุกคน อ่านคนละคิวรีแต่ยิงพร้อมกัน
     * ทั้งคู่ต้องรู้รายชื่อก่อน จึงยิงหลัง assignableUsers ไม่ใช่พร้อมกับมัน
     */
    const ids = visible.map((u) => u.id);
    const [teamsByUser, openCounts] = await Promise.all([
      this.teams.activeTeamsOfUsers(ids),
      this.tickets.openTicketCounts(ids),
    ]);

    const ledTeamIds = scope.ledTeamIds;
    // เป็นหัวหน้าทีม = เห็นเฉพาะทีมตัวเอง ไม่ว่าจะถือสิทธิ์ผู้ดูแลด้วยหรือไม่
    const restrictToMyTeams = mayAssignOthers && ledTeamIds.size > 0;
    // ผู้ดูแลที่ไม่ได้นำทีมไหน: แสดงเฉพาะคนที่ถูกจัดเข้าทีมแล้ว — ถ้ามีอย่างน้อยหนึ่งคน
    const restrictToTeamMembers =
      mayAssignOthers &&
      !restrictToMyTeams &&
      visible.some((u) => u.id !== scope.userId && (teamsByUser.get(u.id) ?? []).length > 0);

    const items: TicketAssigneeDto[] = [];
    for (const user of visible) {
      const teams = teamsByUser.get(user.id) ?? [];
      /*
       * ทีมที่แสดง = ทีมที่ทำให้คนนี้อยู่ในรายการ
       *
       * หัวหน้าทีมเห็นชื่อทีมของตัวเองกำกับ ส่วนผู้ดูแลเห็นทีมแรกของคนนั้น
       * (ตามลำดับชื่อ) เพื่อให้พอแยกออกว่าใครอยู่ฝั่งไหนโดยไม่ต้องเปิดหน้าทีม
       */
      const viaMyTeam = teams.find((t) => ledTeamIds.has(t.teamId));
      const shown = viaMyTeam ?? teams[0];

      // หัวหน้าทีมมอบให้คนนอกทีมตัวเองไม่ได้ — ตัวเองยังอยู่เสมอ เพราะรับงานเองได้
      if (restrictToMyTeams && !viaMyTeam && user.id !== scope.userId) continue;
      if (restrictToTeamMembers && teams.length === 0 && user.id !== scope.userId) continue;

      items.push({
        id: user.id,
        full_name: user.fullName,
        is_me: user.id === scope.userId,
        is_lead: shown?.isLead ?? false,
        team: shown ? { id: shown.teamId, name: shown.teamName } : null,
        open_tickets: openCounts.get(user.id) ?? 0,
      });
    }

    // ตัวเองบนสุด แล้วคนที่งานน้อยที่สุดก่อน — ชื่อเรียงมาจาก assignableUsers อยู่แล้ว
    return items.sort(
      (a, b) => Number(b.is_me) - Number(a.is_me) || a.open_tickets - b.open_tickets,
    );
  }

  /**
   * ผูกเรื่องสองใบเข้าด้วยกัน (POST /tickets/{id}/link)
   *
   * กรณีใช้งานจริงที่ SA ยกมา: โน้ตบุ๊กพัง (เหตุขัดข้อง) แล้วเปิดคำขอเบิกเครื่อง
   * ทดแทน (คำขอบริการ) — สองใบนี้ต้องเดินคนละ SLA และปิดคนละเวลา
   * แต่คนอ่านต้องกระโดดไปมาได้
   *
   * ⚠️ ทั้งสองใบต้องผ่าน findById ก่อน ไม่ใช่ใบเดียว
   *    findById เป็นที่เดียวที่บังคับขอบเขตสิทธิ์ ถ้าตรวจแค่ใบต้นทาง ผู้เรียก
   *    จะผูกเรื่องของตัวเองเข้ากับเรื่องที่เขาไม่มีสิทธิ์เห็นได้ แล้วชิปบนหน้าจอ
   *    จะเปิดเผยเลขที่และหัวข้อของใบนั้นให้เขาอ่าน — เป็นการรั่วข้อมูลข้ามบริษัท
   *    ผ่านช่องที่ดูไม่เหมือนช่องอ่านข้อมูล
   */
  async link(scope: AccessScope, id: number, dto: LinkTicketDto): Promise<TicketDetailDto> {
    const row = await this.tickets.findById(scope, id);
    scope.require('ticket.change_status');

    if (dto.related_ticket_id === id) {
      throw new ValidationError('VALIDATION_ERROR', 'ຜູກເລື່ອງກັບຕົວມັນເອງບໍ່ໄດ້', [
        { field: 'related_ticket_id', message: 'ກະລຸນາເລືອກເລື່ອງອື່ນ' },
      ]);
    }

    // 404 ถ้าอยู่นอกขอบเขต — กติกาเดียวกับการเปิดเรื่องนั้นตรง ๆ
    const other = await this.tickets.findById(scope, dto.related_ticket_id);

    /*
     * ข้ามบริษัทผูกกันไม่ได้
     *
     * ผู้ดูแลหลายบริษัทเห็นทั้งสองใบได้จริง จึงผ่าน findById ทั้งคู่ — ด่านนี้
     * จึงไม่ซ้ำซ้อนกับด่านบน มันกันคนละเรื่องกัน: รายงานรายบริษัทต้องรวมยอด
     * ได้โดยไม่มีเรื่องของบริษัทอื่นโผล่มาในชิป และผู้ใช้ปลายทางที่เห็นบริษัทเดียว
     * จะเห็นชิปที่กดแล้วได้ 404 ทุกครั้ง
     */
    if (other.companyId !== row.companyId) {
      throw new ValidationError('VALIDATION_ERROR', 'ຜູກເລື່ອງຂ້າມບໍລິສັດບໍ່ໄດ້', [
        { field: 'related_ticket_id', message: 'ຕ້ອງເປັນເລື່ອງຂອງບໍລິສັດດຽວກັນ' },
      ]);
    }

    await this.tickets.linkTickets({
      ticketId: id,
      relatedTicketId: other.id,
      actorId: scope.userId,
      companyId: row.companyId,
      at: new Date(),
    });

    return this.detail(scope, id);
  }

  /**
   * โครงการที่ผู้เรียกอ้างถึงต้องมีอยู่จริงและอยู่ในขอบเขตของเขา
   *
   * ⚠️ ตรวจฝั่งเซิร์ฟเวอร์เสมอ — id มาจากเบราว์เซอร์ ถ้าไม่ตรวจ ผู้ใช้บริษัท ก.
   *    จะติดป้ายเรื่องของตัวเองด้วยโครงการของบริษัท ข. แล้วรายงานรายโครงการ
   *    ของอีกบริษัทจะมีเรื่องที่ไม่ใช่ของเขาปนอยู่
   *
   * โครงการส่วนกลาง (company_id เป็น null) ใช้ได้ทุกคน — กติกาเดียวกับทีมและหมวดหมู่
   */
  private async assertProjectInReach(
    scope: AccessScope,
    projectId: number | undefined,
  ): Promise<void> {
    if (projectId === undefined) return;

    const project = await this.projects.byId(projectId);
    if (!project || !(project.companyId === null || scope.inScope(project.companyId))) {
      throw new ValidationError('VALIDATION_ERROR', 'ໂຄງການນີ້ບໍ່ຢູ່ໃນຂອບເຂດທີ່ທ່ານເຫັນໄດ້', [
        { field: 'project_id', message: 'ກະລຸນາເລືອກໂຄງການໃນຂອບເຂດຂອງທ່ານ' },
      ]);
    }
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

    /*
     * งบเวลาของ resolution
     *
     * incident ใช้เป้าตาราง priority ตามเดิมทุกประการ ส่วนคำขอบริการเป้าอยู่ที่รายการ
     * ใน catalog (รีเซ็ตรหัสผ่าน 30 นาที ขณะที่ P4 คือ 5 วัน) ตาราง priority จึงบอกงบ
     * ที่แท้จริงไม่ได้ — ถอดจากกำหนดเสร็จที่บันทึกไว้แล้วแทน: due = เริ่ม + งบ + เวลาที่หยุด
     * ไม่ต้องถามฐานข้อมูลเพิ่มต่อหนึ่งแถวในรายการ
     */
    const clockStarted = row.slaClockStartedAt !== null || row.ticketType !== 'service_request';
    const budget =
      row.ticketType === 'service_request'
        ? row.slaClockStartedAt !== null && row.resolutionDueAt !== null
          ? Math.max(
              0,
              minutesBetween(row.slaClockStartedAt, row.resolutionDueAt, cal, target.clockMode) -
                row.pendingDurationMinutes,
            )
          : null
        : target.resolutionMinutes;
    const remaining = budget === null ? null : budget - used;

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
      remaining_minutes: status === 'paused' ? null : remaining,
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
      budget_minutes: budget,
      // เกินกำหนดแล้วแถบเต็ม 100 ไม่ว่าเวลาที่ใช้จะคำนวณออกมาเท่าไร — ใช้ธง breach เป็นตัวตัดสิน
      // เหมือนงานกวาด SLA (ค่าสองตัวนี้ไม่ตรงกันได้เมื่อ due ถูกเลื่อนหลังพัก)
      elapsed_percent: !clockStarted || budget === null || budget <= 0
        ? null
        : status === 'breached'
          ? 100
          : Math.min(100, Math.max(0, Math.round((used / budget) * 100))),
      clock_started: clockStarted,
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
      /*
       * สองฟิลด์นี้มีความหมายเฉพาะกับเรื่องที่ปิดแล้ว
       *
       * หน้าประวัติการแจ้งต้องใช้ทั้งคู่ — วันที่ปิดเพื่อเรียงและบอกว่ายัง
       * เปิดซ้ำได้ไหม (ภายใน 7 วัน) ส่วนคะแนนเพื่อบอกว่าเคยประเมินหรือยัง
       * ถ้าไม่คืนมาในรายการ หน้าจอต้องยิงรายละเอียดทีละใบเพื่อรู้แค่สองค่านี้
       */
      closed_at: row.closedAt?.toISOString() ?? null,
      satisfaction_score: row.satisfactionScore,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  /**
   * แปลงแถวเป็นรายละเอียด "ไม่รวมข้อมูลลูก"
   *
   * คอมเมนต์ ประวัติ รายการตรวจ และการอนุมัติถูกประกอบที่ detail()
   * เพราะแต่ละอย่างมีกฎการมองเห็นของตัวเอง เช่น คอมเมนต์ภายในต้องกรอง
   * ตามสิทธิ์ผู้เรียก การรวมไว้ที่นี่จะทำให้ต้องส่ง scope ลงไปทุกชั้น
   */
  private async toDetail(
    row: TicketRow,
    scope: AccessScope,
  ): Promise<
    Omit<
      TicketDetailDto,
      'comments' | 'history' | 'checklist' | 'approvals' | 'catalog_item' | 'requester_tickets'
    >
  > {
    const base = await this.toListItem(row);
    /*
     * "จบแล้ว" สำหรับการเปิด/ปิดปุ่มแก้ไข
     *
     * fulfilled และ rejected ต้องอยู่ในรายการนี้ด้วย มิฉะนั้นคำขอที่ส่งมอบแล้ว
     * หรือถูกปฏิเสธไปแล้วจะยังมีปุ่มแก้ไข มอบหมาย และแนบไฟล์ขึ้นให้กด
     */
    const closed = ['resolved', 'fulfilled', 'closed', 'cancelled', 'rejected'].includes(
      row.status,
    );
    const isOwner = row.requesterId === scope.userId;
    const status = row.status as TicketStatus;
    const ticketType = (row.ticketType ?? 'incident') as TicketType;
    const related =
      row.relatedTicketId === null ? null : await this.tickets.relatedSummary(row.relatedTicketId);

    /*
     * สถานะที่ผู้เรียกคนนี้ไปต่อได้ — ใช้ actorMayTransition ตัวเดียวกับ use case
     *
     * ช่วงเปิดคืน 7 วันตรวจที่นี่ด้วย ไม่งั้นเรื่องที่ปิดไปนานแล้วจะมีปุ่ม
     * "เปิดคืน" ที่กดแล้วได้ข้อความปฏิเสธทุกครั้ง
     */
    const actor = {
      isOwner,
      canChangeStatus: scope.has('ticket.change_status'),
      canCancel: scope.has('ticket.cancel'),
      canReopen: scope.has('ticket.reopen'),
    };
    const now = new Date();
    const availableTransitions = allowedTransitionsFrom(status, ticketType).filter(
      (to) =>
        actorMayTransition(status, to, actor, ticketType) &&
        !(status === 'closed' && !isWithinReopenWindow(row.closedAt, now)),
    );

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
      related_ticket:
        related === null
          ? null
          : {
              id: related.id,
              ticket_no: related.ticketNo,
              subject: related.subject,
              status: related.status as TicketStatus,
              ticket_type: related.ticketType as TicketType,
            },
      can: {
        update: !closed && (scope.has('ticket.update') || (isOwner && row.status === 'new')),
        /*
         * ปุ่ม "มอบหมายให้คนอื่น" ขึ้นเฉพาะผู้ดูแล หรือหัวหน้าทีม
         *
         * ⚠️ ค่านี้ต้องไม่ยิงคิวรีเพิ่มต่อหนึ่งคำขอ — รายชื่อทีมที่เป็นหัวหน้า
         *    ถูกอ่านมาพร้อมสิทธิ์ใน ScopeService แล้ว (จำไว้ ~30 วินาทีต่อคน)
         *    ถ้าถามฐานข้อมูลตรงนี้ ทุกครั้งที่เปิดเรื่องจะจ่ายเพิ่มอีกหนึ่งรอบ
         */
        assign:
          !closed &&
          mayAssignToOthers({
            canAssign: scope.has('ticket.assign'),
            isAdminLevel: scope.isAdminLevel,
            ledTeamIds: [...scope.ledTeamIds],
          }),
        assign_self: !closed && row.assigneeId === null && scope.has('ticket.assign_self'),
        /*
         * เจ้าหน้าที่ยังมีงานกับเรื่องที่ "แก้แล้ว" และ "ปิดแล้ว" — ปิดแทนผู้แจ้งที่เงียบไป
         * หรือเปิดคืนเมื่อพบว่ายังไม่หาย จึงผูกกับรายการสถานะที่ไปต่อได้จริง
         * ไม่ใช่ธง closed ที่นับ resolved เป็นจบแล้ว
         *
         * เดิมช่องเปลี่ยนสถานะหายไปทันทีที่เรื่องเป็น resolved หน้าจอจึงไปหยิบ
         * แผงให้คะแนนของผู้แจ้งมาแสดงให้เจ้าหน้าที่แทน (ดู close_own ด้านล่าง)
         */
        change_status: scope.has('ticket.change_status') && availableTransitions.length > 0,
        change_priority: !closed && scope.has('ticket.change_priority'),
        request_priority_review: !closed && scope.has('ticket.request_priority_review'),
        set_workaround:
          !closed && row.ticketType === 'incident' && scope.has('ticket.set_workaround'),
        declare_major_incident: !closed && scope.has('ticket.declare_major_incident'),
        comment: scope.has('ticket.comment') || isOwner,
        comment_internal: scope.has('ticket.comment_internal'),
        attach: !closed && (scope.has('ticket.attach') || isOwner),
        // สามข้อนี้อ่านจากรายการเดียวกับปุ่มเปลี่ยนสถานะ — เดิมคำนวณแยก
        // และบอกว่าผู้แจ้งยกเลิกหรือเปิดคืนได้ ทั้งที่คำสั่งจริงปฏิเสธทุกครั้ง
        /*
         * close_own กับ reopen เป็นปุ่มของผู้แจ้งเท่านั้น (docs/22-component-spec.md ตารางปุ่ม)
         *
         * คะแนนความพอใจที่มากับการยืนยันปิดคือ KPI-4 — ถ้าเจ้าหน้าที่เห็นแผงให้คะแนนด้วย
         * ทีมจะให้คะแนนตัวเองได้ และตัวเลขที่รายงานผู้บริหารจะไม่มีความหมาย
         * (use case ปฏิเสธคะแนนจากคนที่ไม่ใช่ผู้แจ้งอยู่แล้ว แต่ปุ่มไม่ควรโผล่ให้กดตั้งแต่แรก)
         * เจ้าหน้าที่ปิดเรื่องหรือเปิดคืนผ่าน change_status ซึ่งมีสองปลายทางนี้ให้อยู่แล้ว
         */
        /*
         * ยืนยันปิดเรื่องที่งานเสร็จแล้ว — resolved (เหตุขัดข้อง) หรือ fulfilled (คำขอบริการ)
         * สองค่านี้คือ "เสร็จ" ของคนละสาย เรื่องหนึ่งใบเจอได้แค่ค่าเดียวเสมอ
         */
        close_own:
          isOwner &&
          (status === 'resolved' || status === 'fulfilled') &&
          availableTransitions.includes('closed'),
        reopen:
          isOwner &&
          (status === 'resolved' || status === 'fulfilled' || status === 'closed') &&
          availableTransitions.includes('in_progress'),
        cancel: availableTransitions.includes('cancelled'),
        delete: scope.has('ticket.delete'),
        view_history: scope.has('ticket.view_history') || isOwner,
      },
      available_transitions: [...availableTransitions],
    };
  }

  /**
   * เพิ่มคอมเมนต์ (POST /tickets/{id}/comments)
   *
   * ⚠️ คอมเมนต์ภายในเขียนได้เฉพาะผู้ที่มีสิทธิ์ ticket.comment_internal
   *    ผู้แจ้งที่ส่ง is_internal=true มาต้องไม่ได้คอมเมนต์ภายใน — ถ้ายอมให้ตั้ง
   *    ผู้แจ้งจะเขียนคอมเมนต์ที่ตัวเองมองไม่เห็นอีกต่อไป ซึ่งอ่านแล้วเหมือน
   *    ข้อความหายไป และยังทำให้เกิดข้อความที่ผู้แจ้งเขียนแต่อยู่ในโซนภายใน
   *    ซึ่งขัดกับความหมายของฟิลด์นี้
   *
   * เวลาตอบรับครั้งแรกถูกบันทึกที่นี่ที่เดียวในระบบ — เป็นตัวตั้งของ KPI-2
   */
  async addComment(
    scope: AccessScope,
    id: number,
    input: { body: string; is_internal?: boolean },
  ) {
    const row = await this.tickets.findById(scope, id);

    const isOwner = row.requesterId === scope.userId;
    if (!scope.has('ticket.comment') && !isOwner) {
      throw new ForbiddenError('FORBIDDEN', 'ທ່ານບໍ່ມີສິດສະແດງຄວາມເຫັນໃນເລື່ອງນີ້');
    }

    const body = input.body?.trim() ?? '';
    if (body.length === 0) {
      throw new ValidationError('VALIDATION_ERROR', 'ຂໍ້ຄວາມຫວ່າງເປົ່າ', [
        { field: 'body', message: 'ກະລຸນາພິມຂໍ້ຄວາມ' },
      ]);
    }

    const wantsInternal = input.is_internal === true;
    if (wantsInternal && !scope.has('ticket.comment_internal')) {
      throw new ForbiddenError('FORBIDDEN', 'ທ່ານບໍ່ມີສິດຂຽນຄຳເຫັນພາຍໃນ');
    }

    /*
     * นับเป็นการตอบรับครั้งแรกเมื่อครบสามข้อพร้อมกัน
     *   1. ยังไม่เคยมีการตอบรับ
     *   2. ไม่ใช่คอมเมนต์ภายใน — ผู้แจ้งต้องเห็นจึงจะนับว่าได้รับการตอบ
     *   3. ผู้เขียนไม่ใช่ผู้แจ้งเอง — ผู้แจ้งพิมพ์เพิ่มเองไม่ใช่การตอบรับ
     */
    const isFirstResponse = row.firstResponseAt === null && !wantsInternal && !isOwner;

    const created = await this.writes.addComment({
      ticketId: id,
      authorId: scope.userId,
      body,
      isInternal: wantsInternal,
      isFirstResponse,
      now: new Date(),
    });

    const commentDto = await this.writes.commentById(created!.id);

    // คอมเมนต์ใหม่ขึ้นทันทีบนหน้าที่เปิดเรื่องนี้อยู่
    // ⚠️ เฉพาะคอมเมนต์สาธารณะ — ห้องนี้มีผู้แจ้งอยู่ด้วย คอมเมนต์ภายในห้ามส่งเข้ามาเด็ดขาด
    if (!wantsInternal) {
      this.realtime.broadcastComment(id, { ...commentDto, attachments: [] });
    }
    // สัญญาณรีเฟรชส่งทั้งคอมเมนต์สาธารณะและภายใน — ไม่มีเนื้อหาติดไป (ดู ticketUpdated)
    // การตอบรับครั้งแรกเปลี่ยนช่อง "ตอบรับครั้งแรก" บนหน้าของผู้แจ้งด้วย
    this.realtime.ticketUpdated({
      ticketId: row.id,
      ticketNo: row.ticketNo,
      status: row.status,
      companyId: row.companyId,
      requesterId: row.requesterId,
      assigneeId: row.assigneeId,
      isSecurityIncident: row.isSecurityIncident,
      actorId: scope.userId,
      kind: 'comment',
    });

    return {
      ...commentDto,
      counted_as_first_response: isFirstResponse,
    };
  }

  /**
   * ติ๊กรายการตรวจ (PATCH /checklist-items/{id})
   *
   * ตรวจขอบเขตผ่านเรื่องที่ข้อนี้สังกัด ไม่ใช่ตรวจที่ตัวข้อ —
   * ตาราง ticket_checklist_item ไม่มี company_id ให้กรอง
   */
  async setChecklistItem(
    scope: AccessScope,
    itemId: number,
    input: { is_done?: boolean; note?: string | null; attachment_id?: number | null },
  ) {
    const ticketId = await this.writes.ticketIdOfChecklistItem(itemId);
    // โยน 404 ให้เองถ้าเรื่องอยู่นอกขอบเขต
    await this.tickets.findById(scope, ticketId);
    scope.require('checklist.update', 'ticket.update');

    const result = await this.writes.setChecklistItem({
      itemId,
      userId: scope.userId,
      ...(input.is_done !== undefined ? { isDone: input.is_done } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.attachment_id !== undefined ? { attachmentId: input.attachment_id } : {}),
      now: new Date(),
    });

    return {
      id: itemId,
      ticket_id: result.ticketId,
      // หน้าจอใช้ค่านี้เปิด/ปิดปุ่ม "แก้ไขเสร็จแล้ว" — ข้อบังคับที่ยังไม่ครบ
      // กันการเปลี่ยนสถานะเป็น resolved ตาม SOP-04/05 ข้อ 6
      all_required_done: result.all_required_done,
    };
  }

}

/**
 * ตัดรายละเอียดของเรื่องให้เหลือรูป "รายการ"
 *
 * ใช้โดยเส้นทางที่สร้างเรื่องแล้วต้องคืนเรื่องนั้นในรูปเดียวกับ `GET /tickets`
 * (ตอนนี้คือการยกระดับแชทเป็นเรื่อง) — ไม่ประกาศ DTO ของเรื่องขึ้นมาอีกชุด
 * ซึ่งวันหนึ่งจะเพี้ยนจากของจริงโดยไม่มีอะไรฟ้อง
 *
 * ⚠️ คืน object ใหม่ ไม่ใช่ส่ง detail ต่อไปทั้งก้อน — TicketDetailDto สืบทอดจาก
 *    TicketListItemDto ตัวตรวจชนิดจึงไม่บ่น แต่คำตอบจะมีคอมเมนต์ ประวัติ และบล็อก can
 *    ติดไปด้วย ซึ่งไม่ได้ประกาศไว้ในสัญญาของ endpoint นั้น
 */
export function toTicketListItem(detail: TicketDetailDto): TicketListItemDto {
  return {
    id: detail.id,
    ticket_no: detail.ticket_no,
    ticket_type: detail.ticket_type,
    subject: detail.subject,
    status: detail.status,
    pending_reason: detail.pending_reason ?? null,
    priority: detail.priority,
    support_tier: detail.support_tier,
    company: detail.company,
    department: detail.department ?? null,
    category: detail.category,
    requester: detail.requester,
    assignee: detail.assignee ?? null,
    sla: detail.sla,
    reopen_count: detail.reopen_count,
    comment_count: detail.comment_count,
    attachment_count: detail.attachment_count,
    closed_at: detail.closed_at,
    satisfaction_score: detail.satisfaction_score,
    created_at: detail.created_at,
    updated_at: detail.updated_at,
  };
}

/**
 * แปลง id จาก query string — รับเฉพาะจำนวนเต็มบวก ค่าอื่นถือว่าไม่ได้ส่ง
 *
 * ไม่ตอบ 422 เพราะ id ที่ "ไม่ถูกต้อง" กับ id ที่ "อยู่นอกขอบเขต" ต้องได้ผลเหมือนกัน
 * (รายการเปล่า) — กติกาเดียวกับ ReportsController
 */
function positiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
