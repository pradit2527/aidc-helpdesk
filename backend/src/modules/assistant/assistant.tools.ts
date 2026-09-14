import type Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { computePriority, IMPACT, URGENCY, type Impact, type Urgency } from '../../common/constants';
import { DomainError } from '../../common/errors/domain-error';
import type { AccessScope } from '../../common/scope';
import { KbService } from '../kb/kb.service';
import { MasterDataService } from '../master-data/master-data.service';
import { TicketsService } from '../tickets/tickets.service';

/** ร่าง ticket ที่ส่งให้หน้าจอแสดงพร้อมปุ่มยืนยัน — ยังไม่ได้บันทึกอะไร */
export interface AssistantTicketDraft {
  subject: string;
  description: string;
  category_id: number;
  category_name: string;
  impact: Impact;
  urgency: Urgency;
  priority: string;
}

/** เหตุการณ์ที่ส่งไปหน้าจอผ่าน SSE ระหว่างที่ผู้ช่วยตอบ */
export type AssistantEvent =
  | { type: 'delta'; text: string }
  | { type: 'status'; text: string }
  | { type: 'ticket_draft'; draft: AssistantTicketDraft }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type EmitAssistantEvent = (event: AssistantEvent) => void;

/*
 * สถานะที่ถือว่า "ยังไม่จบ" — resolved รวมอยู่ด้วยเพราะยังรอผู้แจ้งยืนยันปิด
 * ผู้ใช้ที่ถามว่า "เรื่องที่แจ้งไว้ถึงไหนแล้ว" ต้องเห็นเรื่องที่รอตัวเองยืนยันด้วย
 */
const OPEN_STATUSES = 'new,assigned,in_progress,pending_user,resolved';
const CLOSED_STATUSES = 'closed,cancelled';

/**
 * เครื่องมือที่ผู้ช่วยเรียกได้
 *
 * ลำดับและข้อความต้องคงที่ — tools อยู่หน้าสุดของ prompt ที่ถูกแคช
 * การสลับลำดับหรือแก้คำอธิบายทำให้แคชของทุกบทสนทนาหายพร้อมกัน
 */
export const ASSISTANT_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'list_my_tickets',
    description:
      'List the support tickets the current user reported, most recently updated first (up to 10). ' +
      'Use it when the user asks about their tickets or their progress, and before preparing a new ticket to avoid duplicates.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'open = not closed or cancelled yet (includes resolved tickets waiting for confirmation)',
        },
      },
      required: ['filter'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_ticket',
    description:
      'Get one ticket by its ticket number (for example AIDC-HQ-202609-0012): status, priority, category, assignee, ' +
      'SLA due times, resolution note and the latest public replies from the IT team. ' +
      'Returns nothing for tickets the current user is not allowed to see.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        ticket_no: { type: 'string', description: 'The ticket number exactly as the user gave it' },
      },
      required: ['ticket_no'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_help_articles',
    description:
      'Search the company knowledge base of published help articles and return the best matches with an excerpt. ' +
      'Use it before giving generic steps for company-specific systems, devices or procedures.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'A few keywords in the language the articles are likely written in (Lao, Thai or English)',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'draft_ticket',
    description:
      'Prepare a support ticket draft and show it to the user with a confirm button. Nothing is saved until the user ' +
      'presses confirm, so never claim the ticket was created. Use a category code from <ticket_categories>.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Short summary of the problem, 10 to 200 characters, in the user\'s language',
        },
        description: {
          type: 'string',
          description: 'What happened, since when, what the user already tried, and who is affected',
        },
        category_code: { type: 'string', description: 'A code from <ticket_categories>' },
        impact: { type: 'string', enum: [...IMPACT] },
        urgency: { type: 'string', enum: [...URGENCY] },
      },
      required: ['subject', 'description', 'category_code', 'impact', 'urgency'],
      additionalProperties: false,
    },
  },
];

/** ข้อมูลที่ผู้ช่วยส่งมาใช้ไม่ได้ — ส่งข้อความกลับให้โมเดลแก้เอง ไม่ใช่ข้อผิดพลาดของระบบ */
class ToolInputError extends Error {}

/**
 * ตัวรันเครื่องมือของผู้ช่วย
 *
 * ⚠️ ทุกเครื่องมือทำงานด้วย AccessScope ของผู้ใช้ที่กำลังคุย ไม่ใช่สิทธิ์ของระบบ
 *    ผู้ช่วยจึงเห็นได้เท่าที่ผู้ใช้คนนั้นเห็นในหน้าจอปกติ — ถ้าใช้สิทธิ์กว้างกว่า
 *    ใครก็ถาม AI ให้เปิดดู ticket ของคนอื่นได้ด้วยประโยคเดียว
 */
@Injectable()
export class AssistantToolbox {
  private readonly logger = new Logger(AssistantToolbox.name);

  constructor(
    private readonly tickets: TicketsService,
    private readonly kb: KbService,
    private readonly masterData: MasterDataService,
  ) {}

  async run(
    scope: AccessScope,
    block: Anthropic.Beta.BetaToolUseBlock,
    emit: EmitAssistantEvent,
  ): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
    const input = (block.input ?? {}) as Record<string, unknown>;
    try {
      const content = await this.dispatch(scope, block.name, input, emit);
      return { type: 'tool_result', tool_use_id: block.id, content };
    } catch (error) {
      if (error instanceof ToolInputError) {
        return { type: 'tool_result', tool_use_id: block.id, content: error.message, is_error: true };
      }
      if (error instanceof NotFoundException || (error instanceof DomainError && error.kind === 'not_found')) {
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: 'Not found, or not visible to this user.',
          is_error: true,
        };
      }
      this.logger.error(`เครื่องมือ ${block.name} ล้มเหลว: ${error instanceof Error ? error.message : String(error)}`);
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: 'The lookup failed on the server. Tell the user you could not check right now and suggest trying again later.',
        is_error: true,
      };
    }
  }

  private async dispatch(
    scope: AccessScope,
    name: string,
    input: Record<string, unknown>,
    emit: EmitAssistantEvent,
  ): Promise<string> {
    switch (name) {
      case 'list_my_tickets':
        emit({ type: 'status', text: 'ກຳລັງເບິ່ງລາຍການ Ticket ຂອງທ່ານ...' });
        return this.listMyTickets(scope, String(input.filter ?? 'open'));
      case 'get_ticket':
        emit({ type: 'status', text: 'ກຳລັງກວດສະຖານະ Ticket...' });
        return this.getTicket(scope, String(input.ticket_no ?? ''));
      case 'search_help_articles':
        emit({ type: 'status', text: 'ກຳລັງຄົ້ນຫາຄູ່ມື...' });
        return this.searchArticles(scope, String(input.query ?? ''));
      case 'draft_ticket':
        emit({ type: 'status', text: 'ກຳລັງກຽມຮ່າງ Ticket...' });
        return this.draftTicket(scope, input, emit);
      default:
        throw new ToolInputError(`Unknown tool "${name}".`);
    }
  }

  private async listMyTickets(scope: AccessScope, filter: string): Promise<string> {
    const status = filter === 'open' ? OPEN_STATUSES : filter === 'closed' ? CLOSED_STATUSES : undefined;
    const page = await this.tickets.list(scope, {
      requester_id: 'me',
      page: '1',
      page_size: '10',
      ...(status ? { status } : {}),
    });

    if (page.items.length === 0) return 'The user has no tickets matching this filter.';

    return JSON.stringify(
      page.items.map((t) => ({
        ticket_no: t.ticket_no,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        sla_status: t.sla.status,
        assignee: t.assignee?.full_name ?? null,
        updated_at: t.updated_at,
      })),
    );
  }

  private async getTicket(scope: AccessScope, ticketNo: string): Promise<string> {
    const wanted = ticketNo.trim();
    if (wanted.length < 3) throw new ToolInputError('Ask the user for the full ticket number.');

    const page = await this.tickets.list(scope, { q: wanted, page: '1', page_size: '10' });
    const match = page.items.find((t) => t.ticket_no.toLowerCase() === wanted.toLowerCase());
    if (!match) return `No ticket numbered ${wanted} is visible to this user.`;

    /*
     * ผู้ใช้ที่ไม่ใช่เจ้าหน้าที่ถามได้เฉพาะเรื่องที่ตัวเองแจ้ง
     *
     * กฎการมองเห็นของรายการยังกว้างกว่านี้สำหรับบางบทบาท (เห็นทั้งบริษัท)
     * ผู้ช่วยต้องไม่กลายเป็นทางลัดให้ไล่ถามสถานะเรื่องของเพื่อนร่วมงาน
     */
    const isStaff = scope.has('ticket.change_status');
    if (!isStaff && match.requester.id !== scope.userId) {
      return `No ticket numbered ${wanted} is visible to this user.`;
    }

    const detail = await this.tickets.detail(scope, match.id);
    const publicReplies = detail.comments
      .filter((c) => !c.is_internal && !c.is_system)
      .slice(-3)
      .map((c) => ({
        from: c.author?.full_name ?? 'system',
        at: c.created_at,
        text: c.body.length > 600 ? `${c.body.slice(0, 600)}…` : c.body,
      }));

    return JSON.stringify({
      ticket_no: detail.ticket_no,
      subject: detail.subject,
      status: detail.status,
      pending_reason: detail.pending_reason ?? null,
      priority: detail.priority,
      category: detail.category.name_th,
      assignee: detail.assignee?.full_name ?? null,
      created_at: detail.created_at,
      sla: {
        status: detail.sla.status,
        response_due_at: detail.sla.response_due_at ?? null,
        resolution_due_at: detail.sla.resolution_due_at ?? null,
      },
      resolution_note: detail.resolution_note,
      latest_public_replies: publicReplies,
    });
  }

  private async searchArticles(scope: AccessScope, query: string): Promise<string> {
    const q = query.trim();
    if (q.length < 2) throw new ToolInputError('Use at least one meaningful keyword.');

    const result = await this.kb.list(scope, { q, status: 'published', page: 1, page_size: 3 });
    const items = result.items as { id: number; title: string; summary: string | null }[];
    if (items.length === 0) return 'No published help article matches. Give general guidance instead.';

    const articles = await Promise.all(
      items.map(async (item) => {
        const detail = (await this.kb.detail(scope, item.id)) as { body_markdown?: string | null };
        const body = detail.body_markdown ?? '';
        return {
          title: item.title,
          summary: item.summary,
          excerpt: body.length > 1500 ? `${body.slice(0, 1500)}…` : body,
        };
      }),
    );
    return JSON.stringify(articles);
  }

  private async draftTicket(
    scope: AccessScope,
    input: Record<string, unknown>,
    emit: EmitAssistantEvent,
  ): Promise<string> {
    const subject = String(input.subject ?? '').trim();
    const description = String(input.description ?? '').trim();
    const code = String(input.category_code ?? '').trim().toLowerCase();
    const impact = String(input.impact ?? '') as Impact;
    const urgency = String(input.urgency ?? '') as Urgency;

    // ขอบเขตเดียวกับ POST /tickets — ร่างที่ผ่านตรงนี้ต้องกดยืนยันแล้วบันทึกได้จริง
    if (subject.length < 10 || subject.length > 200) {
      throw new ToolInputError('subject must be 10 to 200 characters. Rewrite it and call draft_ticket again.');
    }
    if (description.length < 10) {
      throw new ToolInputError('description is too short. Include what happened and since when.');
    }
    if (!IMPACT.includes(impact) || !URGENCY.includes(urgency)) {
      throw new ToolInputError('impact or urgency is not a valid value.');
    }

    const categories = await this.masterData.categories(scope, true);
    const category = categories.find((c) => c.code.toLowerCase() === code);
    if (!category) {
      throw new ToolInputError(
        `Unknown category_code "${code}". Use one of: ${categories.map((c) => c.code).join(', ')}.`,
      );
    }

    const priority = computePriority(impact, urgency);
    emit({
      type: 'ticket_draft',
      draft: {
        subject,
        description,
        category_id: category.id,
        category_name: category.name_th,
        impact,
        urgency,
        priority,
      },
    });

    return `Draft shown to the user with priority ${priority}. It is NOT created yet — ask the user to review it and press the confirm button below your message.`;
  }
}
