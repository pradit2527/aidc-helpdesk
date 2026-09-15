'use client';

import Link from 'next/link';
import { MessageSquare, Paperclip, RotateCcw, UserRound } from 'lucide-react';
import * as React from 'react';

import { PriorityBadge, PriorityMeter, SlaBadge, StatusBadge } from '@/components/common/badges';
import { DataTable, EmptyState, type Column } from '@/components/ui/data-table';
import { Avatar } from '@/components/ui/misc';
import { PRIORITY, TICKET_TYPE } from '@/config/enums';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { TicketListItem } from '@/lib/types';

/**
 * รายการเรื่องแจ้ง ใช้ร่วมกันใน /queue, /tickets และ /tickets/my
 *
 * เดสก์ท็อปแสดงเป็นตาราง มือถือแสดงเป็นการ์ด — ไม่ใช่ตารางที่เลื่อนซ้ายขวา
 * ข้อมูลหลักต้องอ่านได้จบในหน้าจอเดียวโดยไม่ต้องเลื่อนแนวนอน (กฎ M-2)
 */
export function TicketList({
  tickets,
  emptyTitle = 'ບໍ່ມີເລື່ອງໃນລາຍການນີ້',
  emptyHint,
  emptyAction,
}: {
  tickets: TicketListItem[];
  emptyTitle?: string | undefined;
  emptyHint?: string | undefined;
  emptyAction?: React.ReactNode | undefined;
}): React.JSX.Element {
  if (tickets.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />;
  }

  return (
    <>
      <div className="flex flex-col gap-3 lg:hidden">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </div>
      <div className="hidden lg:block">
        <TicketTable tickets={tickets} />
      </div>
    </>
  );
}

function TicketCard({ ticket }: { ticket: TicketListItem }): React.JSX.Element {
  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className={cn(
        'block rounded-lg border border-hair bg-surface p-4 shadow-card transition-colors hover:border-control',
        PRIORITY[ticket.priority].railClass,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="tabular text-caption text-ink-3">{ticket.ticket_no}</span>
        <StatusBadge status={ticket.status} pendingReason={ticket.pending_reason} />
      </div>

      <p className="mt-1.5 text-body font-semibold leading-snug text-ink">{ticket.subject}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-2">
        <span>{TICKET_TYPE[ticket.ticket_type]}</span>
        <span aria-hidden="true">·</span>
        <span>{ticket.category.name_th}</span>
        <span aria-hidden="true">·</span>
        <span>{ticket.company.code}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <PriorityBadge priority={ticket.priority} />
        <SlaBadge
          status={ticket.sla.status}
          remainingMinutes={ticket.sla.remaining_minutes}
          remainingUnit={ticket.sla.remaining_unit}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hair pt-2 text-caption text-ink-3">
        <span>{ticket.assignee ? ticket.assignee.full_name : 'ຍັງບໍ່ມີຜູ້ຮັບຜິດຊອບ'}</span>
        <span className="ml-auto flex items-center gap-2">
          <TicketCounters ticket={ticket} />
          <span>{formatRelative(ticket.updated_at)}</span>
        </span>
      </div>
    </Link>
  );
}

function TicketCounters({ ticket }: { ticket: TicketListItem }): React.JSX.Element {
  return (
    <>
      {ticket.comment_count > 0 && (
        <span className="inline-flex items-center gap-1" title={`${ticket.comment_count} ຄອມເມັນ`}>
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="tabular">{ticket.comment_count}</span>
        </span>
      )}
      {ticket.attachment_count > 0 && (
        <span className="inline-flex items-center gap-1" title={`${ticket.attachment_count} ໄຟລ໌ແນບ`}>
          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="tabular">{ticket.attachment_count}</span>
        </span>
      )}
      {ticket.reopen_count > 0 && (
        <span
          className="inline-flex items-center gap-1 text-sla-risk"
          title={`ເປີດຄືນມາແລ້ວ ${ticket.reopen_count} ຄັ້ງ`}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="tabular">{ticket.reopen_count}</span>
        </span>
      )}
    </>
  );
}

/**
 * ตารางเรื่องแจ้งบนเดสก์ท็อป
 *
 * จัดความกว้างด้วยหลักเดียว: คอลัมน์ "เลขที่/หัวข้อ" รับพื้นที่ที่เหลือทั้งหมด (width 100%)
 * ส่วนคอลัมน์อื่นหดพอดีเนื้อหาและอยู่บรรทัดเดียว (width 1% + nowrap)
 *
 * เดิมหัวข้อถูกจำกัดไว้ 420px ตารางแบบ auto จึงเอาที่ว่างที่เหลือไปแจกให้คอลัมน์อื่น
 * ผู้รับผิดชอบกับบริษัทเลยห่างกันเป็นช่องโหว่ใหญ่ ขณะที่ป้าย SLA ถูกบีบจนตัดสามบรรทัด
 *
 * ⚠️ max-w-0 ในช่องหัวข้อจำเป็น — ถ้าไม่มี หัวข้อยาว ๆ ที่ตัดด้วย truncate ยังนับความกว้างเต็ม
 *    ของข้อความ แล้วดันตารางให้กว้างเกินกล่องจนต้องเลื่อนแนวนอน
 */
function TicketTable({ tickets }: { tickets: TicketListItem[] }): React.JSX.Element {
  const columns: Column<TicketListItem>[] = [
    {
      key: 'ticket_no',
      header: 'ເລກທີ່ / ຫົວຂໍ້',
      width: '100%',
      cellClassName: 'max-w-0',
      render: (t) => (
        <Link href={`/tickets/${t.id}`} className="group block min-w-0" title={t.subject}>
          <span className="tabular block text-caption text-ink-3">{t.ticket_no}</span>
          <span className="block truncate text-body-sm font-semibold text-ink group-hover:text-primary">
            {t.subject}
          </span>
        </Link>
      ),
    },
    {
      key: 'priority',
      header: 'ລະດັບ',
      width: '1%',
      cellClassName: 'whitespace-nowrap',
      render: (t) => (
        <span className="inline-flex items-center gap-2">
          <PriorityMeter priority={t.priority} />
          <span className="tabular text-body-sm font-semibold">{t.priority}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'ສະຖານະ',
      width: '1%',
      cellClassName: 'whitespace-nowrap',
      /*
       * min-w-max กันป้ายแตกเป็นสองบรรทัด (ไอคอนบน ข้อความล่าง)
       * คอลัมน์ที่ width 1% หดเหลือความกว้างต่ำสุด ซึ่งป้ายแบบ flex-wrap ยอมตัดบรรทัดให้พอดี
       * whitespace-nowrap ที่ช่องไม่ช่วย เพราะไม่ได้ห้าม flex item ขึ้นแถวใหม่
       */
      render: (t) => <StatusBadge status={t.status} pendingReason={t.pending_reason} className="min-w-max" />,
    },
    {
      // ป้ายแบบย่อบรรทัดเดียว — ข้อความเต็มอยู่ใน tooltip (ดู SlaBadge compact)
      key: 'sla',
      header: 'SLA',
      width: '1%',
      cellClassName: 'whitespace-nowrap',
      render: (t) => (
        <SlaBadge
          compact
          status={t.sla.status}
          remainingMinutes={t.sla.remaining_minutes}
          remainingUnit={t.sla.remaining_unit}
        />
      ),
    },
    {
      key: 'assignee',
      header: 'ຜູ້ຮັບຜິດຊອບ',
      hideBelow: 'xl',
      width: '1%',
      cellClassName: 'whitespace-nowrap',
      render: (t) =>
        t.assignee ? (
          <span className="flex w-[168px] items-center gap-2" title={t.assignee.full_name}>
            <Avatar name={t.assignee.full_name} size="sm" />
            <span className="min-w-0 truncate text-body-sm text-ink">{t.assignee.full_name}</span>
          </span>
        ) : (
          <span className="flex w-[168px] items-center gap-2">
            {/* วงประ = ช่องที่ยังว่าง อ่านออกว่า "ยังไม่มีคนรับ" โดยไม่ต้องอ่านตัวอักษร */}
            <span
              aria-hidden="true"
              className="grid h-7 w-7 flex-none place-items-center rounded-full border border-dashed border-control text-ink-3"
            >
              <UserRound className="h-3.5 w-3.5" />
            </span>
            <span className="text-body-sm text-ink-3">ຍັງບໍ່ມີ</span>
          </span>
        ),
    },
    {
      key: 'company',
      header: 'ບໍລິສັດ',
      hideBelow: 'xl',
      width: '1%',
      cellClassName: 'whitespace-nowrap',
      render: (t) => (
        <span className="inline-flex rounded-sm border border-hair bg-subtle px-1.5 py-0.5 text-caption font-semibold text-ink-2">
          {t.company.code}
        </span>
      ),
    },
    {
      key: 'updated',
      header: 'ອັບເດດ',
      align: 'right',
      width: '1%',
      cellClassName: 'whitespace-nowrap',
      render: (t) => (
        <span className="inline-flex items-center gap-2 text-caption text-ink-3">
          <TicketCounters ticket={t} />
          <time dateTime={t.updated_at} title={formatDateTime(t.updated_at)}>
            {formatRelative(t.updated_at)}
          </time>
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={tickets}
      rowKey={(t) => t.id}
      caption="ລາຍການເລື່ອງແຈ້ງ"
    />
  );
}
