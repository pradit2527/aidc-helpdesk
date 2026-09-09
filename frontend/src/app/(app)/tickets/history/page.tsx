'use client';

import Link from 'next/link';
import { Clock, Eye, Inbox, RefreshCw, Star } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PriorityBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { useT } from '@/components/layout/preference-controls';
import { formatDateTime } from '@/lib/format';
import { useTickets } from '@/lib/queries/tickets';
import type { TicketListItem } from '@/lib/types';

/**
 * ประวัติการแจ้ง (prototype v2 · historyView)
 *
 * แยกจากหน้า "ติดตามเรื่องที่แจ้ง" โดยตั้งใจ ไม่ใช่แค่แท็บสถานะในหน้าเดียว
 * เพราะผู้ใช้มาสองหน้านี้ด้วยเจตนาคนละอย่าง — คนที่มาติดตามอยากรู้ว่า
 * "อีกนานไหม" ส่วนคนที่เปิดประวัติมาหาเรื่องเก่าเพื่ออ้างอิงหรือเปิดซ้ำ
 * การรวมเป็นหน้าเดียวทำให้ทั้งสองงานต้องผ่านตัวกรองก่อนเสมอ
 */

/** เปิดเรื่องซ้ำได้ภายในกี่วันหลังปิด — ตรงกับ REOPEN_WINDOW_DAYS ฝั่ง backend */
const REOPEN_WINDOW_DAYS = 7;

function withinReopenWindow(closedAt: string | null): boolean {
  if (!closedAt) return false;
  const closed = new Date(closedAt).getTime();
  if (Number.isNaN(closed)) return false;
  return Date.now() - closed <= REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * ดาวคะแนนความพึงพอใจ
 *
 * ⚠️ ต้องมีข้อความกำกับเสมอ ไม่ใช่ดาวเปล่า ๆ
 *    ผู้ใช้โปรแกรมอ่านหน้าจอได้ยินแค่ "รูปภาพ" ถ้าไม่มี aria-label
 *    และคนตาบอดสีแยกดาวเต็มกับดาวว่างจากสีอย่างเดียวไม่ได้
 */
function CsatStars({ score }: { score: number | null }): React.JSX.Element {
  const t = useT();
  if (score === null) {
    return <span className="text-caption text-ink-3">{t('history.notRated')}</span>;
  }
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${t('history.score')} ${score} / 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className="h-3.5 w-3.5"
          aria-hidden="true"
          {...(n <= score
            ? { fill: 'currentColor', style: { color: 'var(--primary)' } }
            : { style: { color: 'var(--border-control)' } })}
        />
      ))}
      <span className="tabular ml-1 text-caption text-ink-2">{score}</span>
    </span>
  );
}

function SummaryCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}): React.JSX.Element {
  return (
    <div className="panel p-4">
      <div className="eyebrow">{label}</div>
      <div className="display-sm tabular mt-1.5 truncate">{value}</div>
      <div className="mt-0.5 text-caption leading-snug text-ink-3">{hint}</div>
    </div>
  );
}

export default function TicketHistoryPage(): React.JSX.Element {
  const t = useT();
  const query = useTickets({ requester_id: 'me', status: 'closed,cancelled', page_size: 100 });
  const rows = query.data?.items ?? [];

  const rated = rows.filter((r) => r.satisfaction_score !== null);
  /*
   * คะแนนเฉลี่ยคิดจากใบที่ประเมินแล้วเท่านั้น
   *
   * ถ้าเอาใบที่ยังไม่ประเมินมาคิดเป็น 0 ค่าเฉลี่ยจะต่ำลงตามจำนวนคนที่
   * ไม่ตอบแบบสอบถาม ซึ่งเป็นคนละเรื่องกับคุณภาพบริการ
   */
  const avg =
    rated.length > 0
      ? (
          rated.reduce((sum, r) => sum + (r.satisfaction_score ?? 0), 0) / rated.length
        ).toFixed(1)
      : '—';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('nav.history')} description={t('history.description')} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCell
          label={t('history.closedCount')}
          value={String(rows.length)}
          hint={t('history.closedHint')}
        />
        <SummaryCell
          label={t('history.ratedCount')}
          value={`${rated.length} / ${rows.length}`}
          hint={t('history.ratedHint')}
        />
        <SummaryCell label={t('history.avgScore')} value={avg} hint={t('history.avgHint')} />
        <SummaryCell
          label={t('history.reopenWindow')}
          value={`${REOPEN_WINDOW_DAYS} ${t('unit.days')}`}
          hint={t('history.reopenHint')}
        />
      </section>

      <QueryBoundary query={query}>
        {rows.length === 0 ? (
          <div className="panel p-10 text-center">
            <div className="hair-all mx-auto grid h-11 w-11 place-items-center text-ink-3">
              <Clock className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="display-md mt-4">{t('history.emptyTitle')}</h3>
            <p className="lede mx-auto mt-2">{t('history.emptyHint')}</p>
            <div className="mt-5">
              <Button asChild variant="secondary" size="sm">
                <Link href="/tickets/my">
                  <Inbox className="h-4 w-4" aria-hidden="true" />
                  {t('history.goToOpen')}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* จอกว้าง: ตาราง */}
            <div className="panel hidden md:block">
              <div className="tbl-wrap">
                <table className="tbl tbl-sticky">
                  <caption className="sr-only">{t('history.tableCaption')}</caption>
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th className="min-w-[260px]">{t('col.subject')}</th>
                      <th>{t('col.priority')}</th>
                      <th>{t('col.closedBy')}</th>
                      <th>{t('col.closedAt')}</th>
                      <th>{t('col.score')}</th>
                      <th>{t('col.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <HistoryRow key={row.id} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* จอแคบ: การ์ด — ตาราง 7 คอลัมน์อ่านไม่ได้บนมือถือ */}
            <ul className="flex flex-col gap-px border border-hair bg-hair md:hidden">
              {rows.map((row) => (
                <HistoryCard key={row.id} row={row} />
              ))}
            </ul>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}

function RowActions({ row }: { row: TicketListItem }): React.JSX.Element {
  const t = useT();
  const canReopen = withinReopenWindow(row.closed_at);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button asChild variant="secondary" size="sm">
        <Link href={`/tickets/${row.id}`} aria-label={`${t('action.view')} ${row.ticket_no}`}>
          <Eye className="h-4 w-4" aria-hidden="true" />
          <span className="md:hidden">{t('action.view')}</span>
        </Link>
      </Button>

      {row.satisfaction_score === null && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => toast.info(t('history.rateSoon'))}
        >
          <Star className="h-4 w-4" aria-hidden="true" />
          {t('action.rate')}
        </Button>
      )}

      {/*
       * ปุ่มเปิดซ้ำถูกปิดเมื่อพ้น 7 วัน พร้อมบอกเหตุผลผ่าน title
       * ไม่ซ่อนปุ่มทิ้ง เพราะผู้ใช้ที่เคยเห็นปุ่มนี้ในเรื่องอื่นจะนึกว่าระบบพัง
       */}
      <Button
        variant="secondary"
        size="sm"
        disabled={!canReopen}
        title={canReopen ? undefined : t('history.reopenExpired')}
        onClick={() => toast.info(t('history.reopenSoon'))}
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {t('action.reopen')}
      </Button>
    </div>
  );
}

function HistoryRow({ row }: { row: TicketListItem }): React.JSX.Element {
  return (
    <tr>
      <td className="tabular whitespace-nowrap text-caption font-semibold text-ink-2">
        {row.ticket_no}
      </td>
      <td>
        <div className="cell-title font-medium leading-snug">{row.subject}</div>
        <div className="mt-1 max-w-[320px] truncate text-caption text-ink-3">
          {[row.category.name_th, row.department?.name].filter(Boolean).join(' · ')}
        </div>
      </td>
      <td>
        <PriorityBadge priority={row.priority} withMeter={false} />
      </td>
      <td className="whitespace-nowrap text-body-sm">{row.assignee?.full_name ?? '—'}</td>
      <td className="tabular whitespace-nowrap text-caption">
        {row.closed_at ? formatDateTime(row.closed_at) : '—'}
      </td>
      <td>
        <CsatStars score={row.satisfaction_score} />
      </td>
      <td>
        <RowActions row={row} />
      </td>
    </tr>
  );
}

function HistoryCard({ row }: { row: TicketListItem }): React.JSX.Element {
  const t = useT();
  return (
    <li className="bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow tabular">{row.ticket_no}</span>
        <PriorityBadge priority={row.priority} withMeter={false} />
      </div>
      <div className="mt-2 text-body font-semibold leading-snug">{row.subject}</div>
      <div className="mt-1 text-caption text-ink-3">
        {[row.category.name_th, row.assignee?.full_name].filter(Boolean).join(' · ')}
      </div>
      <div className="rule-in mt-3 flex items-center justify-between gap-3 pt-3">
        <span className="tabular text-caption text-ink-2">
          {t('col.closedAt')} {row.closed_at ? formatDateTime(row.closed_at) : '—'}
        </span>
        <CsatStars score={row.satisfaction_score} />
      </div>
      <div className="mt-3">
        <RowActions row={row} />
      </div>
    </li>
  );
}
