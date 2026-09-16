'use client';

import Link from 'next/link';
import { CheckCircle2, Clock, Eye, Inbox, RefreshCw, Star } from 'lucide-react';
import * as React from 'react';

import { PriorityBadge, StatusBadge } from '@/components/common/badges';
import { CloseOwnTicket, ReopenTicket } from '@/components/tickets/owner-actions';
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
 *
 * รวมเรื่องที่ "แก้ไขสำเร็จ" (resolved) ไว้ด้วย ไม่ใช่แค่ที่ปิดแล้ว
 *
 *   เรื่องที่เจ้าหน้าที่แก้เสร็จกำลังรอผู้แจ้ง "ให้คะแนนและยืนยันปิด" และคะแนนนั้น
 *   ให้ได้เฉพาะตอนยืนยันปิดเท่านั้น (backend รับ satisfaction_score เฉพาะ
 *   transition → closed โดยผู้แจ้ง) เดิมหน้านี้ดึงเฉพาะเรื่องที่ปิดแล้ว ปุ่ม
 *   "ให้คะแนน" จึงไม่มีทางกดได้จริงเลย — เรื่องที่ควรให้คะแนนไม่อยู่ในรายการ
 *   ส่วนเรื่องที่อยู่ในรายการก็ปิดไปแล้วและรับคะแนนไม่ได้อีก
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
 * เปิดคืนได้ไหม — กฎเดียวกับ ALLOWED_TRANSITIONS + assertReopenWindow ฝั่ง backend
 *   resolved  เปิดคืนได้ทันที (ยังไม่เคยปิด จึงไม่มีกรอบ 7 วัน)
 *   closed    เฉพาะภายใน 7 วันหลังปิด
 *   cancelled ไม่ได้เลย — ต้องแจ้งเป็นเรื่องใหม่
 */
function reopenState(row: TicketListItem): 'yes' | 'expired' | 'no' {
  if (row.status === 'resolved') return 'yes';
  if (row.status === 'closed') return withinReopenWindow(row.closed_at) ? 'yes' : 'expired';
  return 'no';
}

/** แผงที่กางอยู่ใต้แถว — เปิดได้ทีละอย่าง */
type Panel = 'rate' | 'reopen' | null;
type PanelKind = Exclude<Panel, null>;

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
  const query = useTickets({
    requester_id: 'me',
    status: 'resolved,closed,cancelled',
    page_size: 100,
  });
  const all = query.data?.items ?? [];

  // เรื่องที่รอผู้แจ้งยืนยันขึ้นก่อนเสมอ — มันคืองานที่ต้องทำ ไม่ใช่ประวัติ
  const awaiting = all.filter((r) => r.status === 'resolved');
  const finished = all.filter((r) => r.status !== 'resolved');
  const rows = [...awaiting, ...finished];

  const rated = finished.filter((r) => r.satisfaction_score !== null);
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
          value={String(finished.length)}
          hint={t('history.closedHint')}
        />
        <SummaryCell
          label={t('history.ratedCount')}
          value={`${rated.length} / ${finished.length}`}
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
            {awaiting.length > 0 && (
              <div
                className="panel flex items-start gap-3 border-l-4 border-l-primary p-4"
                role="status"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-body font-semibold text-ink">
                    {t('history.awaitingTitle')}{' '}
                    <span className="tabular text-ink-2">({awaiting.length})</span>
                  </p>
                  <p className="mt-0.5 text-caption text-ink-2">{t('history.awaitingHint')}</p>
                </div>
              </div>
            )}

            {/* จอกว้าง: ตาราง */}
            <div className="panel hidden md:block">
              <div className="tbl-wrap">
                <table className="tbl tbl-sticky">
                  <caption className="sr-only">{t('history.tableCaption')}</caption>
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th className="min-w-[240px]">{t('col.subject')}</th>
                      <th>{t('col.status')}</th>
                      <th>{t('col.priority')}</th>
                      <th>{t('col.handledBy')}</th>
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

            {/* จอแคบ: การ์ด — ตาราง 8 คอลัมน์อ่านไม่ได้บนมือถือ */}
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

/**
 * สถานะของแผงที่กางอยู่ใต้แถว
 *
 * พับเก็บเองเมื่อสถานะเรื่องเปลี่ยน — หลังยืนยันปิด แถวเดิมกลายเป็น "ปิดแล้ว"
 * แผงให้คะแนนที่ยังค้างอยู่จะชวนให้กดซ้ำทั้งที่ backend จะตอบ 409
 */
function usePanel(status: TicketListItem['status']): {
  panel: Panel;
  toggle: (next: PanelKind) => void;
  close: () => void;
} {
  const [panel, setPanel] = React.useState<Panel>(null);
  React.useEffect(() => {
    setPanel(null);
  }, [status]);
  const toggle = React.useCallback(
    (next: PanelKind) => setPanel((prev) => (prev === next ? null : next)),
    [],
  );
  const close = React.useCallback(() => setPanel(null), []);
  return { panel, toggle, close };
}

function RowActions({
  row,
  panel,
  onToggle,
}: {
  row: TicketListItem;
  panel: Panel;
  onToggle: (next: PanelKind) => void;
}): React.JSX.Element {
  const t = useT();
  const reopen = reopenState(row);
  const awaiting = row.status === 'resolved';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button asChild variant="secondary" size="sm">
        <Link href={`/tickets/${row.id}`} aria-label={`${t('action.view')} ${row.ticket_no}`}>
          <Eye className="h-4 w-4" aria-hidden="true" />
          <span className="md:hidden">{t('action.view')}</span>
        </Link>
      </Button>

      {/*
       * ให้คะแนนได้เฉพาะเรื่องที่ "แก้ไขสำเร็จ" และเป็นการยืนยันปิดไปในคราวเดียว
       * เรื่องที่ปิดแล้วโดยไม่มีคะแนนไม่มีปุ่มนี้ — backend ไม่รับคะแนนย้อนหลัง
       * การโชว์ปุ่มที่กดแล้วถูกปฏิเสธทุกครั้งแย่กว่าไม่มีปุ่ม
       */}
      {awaiting && (
        <Button
          size="sm"
          variant={panel === 'rate' ? 'secondary' : 'primary'}
          aria-expanded={panel === 'rate'}
          onClick={() => onToggle('rate')}
        >
          <Star className="h-4 w-4" aria-hidden="true" />
          {t('action.rateAndClose')}
        </Button>
      )}

      {/*
       * ปุ่มเปิดซ้ำถูกปิดเมื่อพ้น 7 วัน พร้อมบอกเหตุผลผ่าน title
       * ไม่ซ่อนปุ่มทิ้ง เพราะผู้ใช้ที่เคยเห็นปุ่มนี้ในเรื่องอื่นจะนึกว่าระบบพัง
       * ยกเว้นเรื่องที่ยกเลิก ซึ่งไม่มีทางเปิดคืนได้เลยจึงไม่มีปุ่ม
       */}
      {reopen !== 'no' && (
        <Button
          variant="secondary"
          size="sm"
          disabled={reopen === 'expired'}
          title={reopen === 'expired' ? t('history.reopenExpired') : undefined}
          aria-expanded={panel === 'reopen'}
          onClick={() => onToggle('reopen')}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('action.reopen')}
        </Button>
      )}
    </div>
  );
}

/** แผงที่กางใต้แถว — ใช้คอมโพเนนต์ตัวเดียวกับหน้ารายละเอียด กฎจึงตรงกันเสมอ */
function OwnerPanel({
  row,
  panel,
  onClose,
}: {
  row: TicketListItem;
  panel: Panel;
  onClose: () => void;
}): React.JSX.Element | null {
  if (panel === 'rate') return <CloseOwnTicket ticketId={row.id} onDone={onClose} />;
  if (panel === 'reopen') {
    return <ReopenTicket ticketId={row.id} defaultOpen onCancel={onClose} onDone={onClose} />;
  }
  return null;
}

/** ช่อง "วันที่ปิด" — เรื่องที่ยังรอผู้แจ้งยืนยันไม่มีวันปิด แสดงว่ารออะไรแทนขีดเปล่า */
function ClosedAtCell({ row }: { row: TicketListItem }): React.JSX.Element {
  const t = useT();
  if (row.status === 'resolved') {
    return <span className="font-semibold text-primary">{t('history.awaitingCell')}</span>;
  }
  return <>{row.closed_at ? formatDateTime(row.closed_at) : '—'}</>;
}

function HistoryRow({ row }: { row: TicketListItem }): React.JSX.Element {
  const { panel, toggle, close } = usePanel(row.status);

  return (
    <>
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
          <StatusBadge status={row.status} className="min-w-max" />
        </td>
        <td>
          <PriorityBadge priority={row.priority} withMeter={false} />
        </td>
        <td className="whitespace-nowrap text-body-sm">{row.assignee?.full_name ?? '—'}</td>
        <td className="tabular whitespace-nowrap text-caption">
          <ClosedAtCell row={row} />
        </td>
        <td>
          <CsatStars score={row.satisfaction_score} />
        </td>
        <td>
          <RowActions row={row} panel={panel} onToggle={toggle} />
        </td>
      </tr>
      {panel && (
        <tr className="bg-subtle">
          <td colSpan={8}>
            <div className="max-w-md py-1">
              <OwnerPanel row={row} panel={panel} onClose={close} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function HistoryCard({ row }: { row: TicketListItem }): React.JSX.Element {
  const t = useT();
  const { panel, toggle, close } = usePanel(row.status);

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
      <div className="mt-2">
        <StatusBadge status={row.status} />
      </div>
      <div className="rule-in mt-3 flex items-center justify-between gap-3 pt-3">
        <span className="tabular text-caption text-ink-2">
          {t('col.closedAt')} <ClosedAtCell row={row} />
        </span>
        <CsatStars score={row.satisfaction_score} />
      </div>
      <div className="mt-3">
        <RowActions row={row} panel={panel} onToggle={toggle} />
      </div>
      {panel && (
        <div className="mt-3">
          <OwnerPanel row={row} panel={panel} onClose={close} />
        </div>
      )}
    </li>
  );
}
