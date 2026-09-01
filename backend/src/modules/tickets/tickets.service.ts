import { Injectable } from '@nestjs/common';

import { computePriority, type Impact, type Urgency } from '../../common/constants';
import {
  ChangePriorityDto,
  ChangeStatusDto,
  CreateTicketDto,
  TicketDetailDto,
  TicketListResponseDto,
} from './dto/ticket.dto';
import { MOCK_TICKETS, mockDetail } from './tickets.fixtures';

/**
 * ⚠️ ยังเป็นข้อมูลตัวอย่าง — ยังไม่ต่อฐานข้อมูล
 *
 * จุดประสงค์ตอนนี้คือให้ API doc ที่ /api/v1/docs แสดงรูปร่างข้อมูลจริง
 * และให้ frontend เริ่มต่อได้ทันทีโดยไม่ต้องรอ Drizzle schema กับ migration
 *
 * เมื่อชั้นฐานข้อมูลพร้อม จะแทน service นี้ด้วยตัวที่เรียก ScopedRepository
 * โดย **สัญญาใน DTO ไม่เปลี่ยน** — frontend จึงไม่ต้องแก้อะไร
 */
@Injectable()
export class TicketsService {
  list(query: Record<string, string>): TicketListResponseDto {
    let items = [...MOCK_TICKETS];

    if (query.status) {
      const wanted = query.status.split(',');
      items = items.filter((t) => wanted.includes(t.status));
    }
    if (query.priority) {
      const wanted = query.priority.split(',');
      items = items.filter((t) => wanted.includes(t.priority));
    }
    if (query.ticket_type) {
      items = items.filter((t) => t.ticket_type === query.ticket_type);
    }
    if (query.sla_status) {
      const wanted = query.sla_status.split(',');
      items = items.filter((t) => wanted.includes(t.sla.status));
    }

    const page = Number(query.page ?? 1);
    const pageSize = Math.min(Number(query.page_size ?? 20), 100);
    const start = (page - 1) * pageSize;

    return {
      items: items.slice(start, start + pageSize),
      page,
      page_size: pageSize,
      total: items.length,
      total_pages: Math.max(1, Math.ceil(items.length / pageSize)),
    };
  }

  create(dto: CreateTicketDto): TicketDetailDto {
    // จุดสำคัญ: ระดับความสำคัญมาจากเมทริกซ์เสมอ ไม่ได้มาจากสิ่งที่ผู้แจ้งส่งมา
    const priority = computePriority(dto.impact as Impact, dto.urgency as Urgency);
    const base = mockDetail();
    return {
      ...base,
      subject: dto.subject,
      description: dto.description,
      ticket_type: dto.ticket_type ?? 'incident',
      impact: dto.impact,
      urgency: dto.urgency,
      priority,
      status: 'new',
      assignee: null,
      // P1 นับต่อเนื่อง 24x7 ส่วน P2-P4 นับเฉพาะเวลาทำการ (SLA 5.4)
      sla: {
        ...base.sla,
        clock_mode: priority === 'P1' ? 'calendar_24x7' : 'business_hours',
        remaining_unit: priority === 'P1' ? 'calendar_minutes' : 'business_minutes',
      },
    };
  }

  detail(id: number): TicketDetailDto {
    const found = MOCK_TICKETS.find((t) => t.id === id);
    const base = mockDetail();
    return found ? { ...base, ...found, can: base.can } : base;
  }

  changeStatus(id: number, dto: ChangeStatusDto): TicketDetailDto {
    const t = this.detail(id);
    return {
      ...t,
      status: dto.to_status,
      pending_reason: dto.pending_reason ?? null,
      sla: {
        ...t.sla,
        status: dto.to_status === 'pending_user' ? 'paused' : t.sla.status,
        pending_reason: dto.pending_reason ?? null,
      },
    };
  }

  changePriority(id: number, dto: ChangePriorityDto): TicketDetailDto {
    const t = this.detail(id);
    const impact = (dto.impact ?? t.impact) as Impact;
    const urgency = (dto.urgency ?? t.urgency) as Urgency;
    const priority = computePriority(impact, urgency);
    return {
      ...t,
      impact,
      urgency,
      priority,
      // P1 นับต่อเนื่อง 24x7 ส่วน P2-P4 นับเฉพาะเวลาทำการ (SLA 5.4)
      sla: {
        ...t.sla,
        clock_mode: priority === 'P1' ? 'calendar_24x7' : 'business_hours',
        remaining_unit: priority === 'P1' ? 'calendar_minutes' : 'business_minutes',
      },
    };
  }
}
