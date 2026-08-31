import { Paperclip, MessageSquare, RotateCcw } from 'lucide-react';

import { PriorityBadge, SlaBadge, StatusBadge } from '@/components/common/badges';
import { PRIORITY, TICKET_TYPE } from '@/config/enums';
import { MOCK_TICKETS, QUEUE_TABS, type TicketListItem } from '@/lib/mock';

export const metadata = { title: 'คิวงานของฉัน' };

/**
 * คิวงานเจ้าหน้าที่
 *
 * เดสก์ท็อป = ตาราง · มือถือ = การ์ด (กฎ M-3 ห้าม scroll แนวนอนกับข้อมูลหลัก)
 *
 * หน้าจริงจะเป็น Client Component เพราะต้อง poll ทุก 60 วินาที + bulk action
 * ตอนนี้ยังเป็น Server Component เพราะข้อมูลเป็น mock
 */
export default function QueuePage() {
  return (
    <div className="flex flex-col gap-5">
      {/* ── แท็บ ── */}
      <div className="flex flex-wrap items-center gap-2">
        {QUEUE_TABS.map((tab, i) => {
          const active = i === 0;
          const danger = tab.key === 'breached';
          return (
            <button
              key={tab.key}
              type="button"
              aria-pressed={active}
              className={[
                'inline-flex min-h-tap items-center gap-2 rounded-full px-4 text-body-sm font-semibold transition-colors',
                active
                  ? 'bg-primary text-white'
                  : danger
                    ? 'bg-p1-bg text-p1-fg'
                    : 'border border-hair bg-surface text-ink-2 hover:bg-subtle',
              ].join(' ')}
            >
              {tab.label}
              <span className="tabular opacity-90">{tab.count}</span>
            </button>
          );
        })}
        <span className="ml-auto text-caption text-ink-3">อัปเดตล่าสุด 12:31 น.</span>
      </div>

      {/* ── ตาราง (md ขึ้นไป) ── */}
      <div className="hidden overflow-hidden rounded border border-hair bg-surface shadow-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <caption className="sr-only">
              รายการเรื่องที่แจ้งในคิวงานของฉัน {MOCK_TICKETS.length} รายการ
            </caption>
            <thead>
              <tr className="border-b border-hair bg-subtle text-left text-caption text-ink-3">
                <th scope="col" className="px-4 py-3 font-semibold">เลขที่</th>
                <th scope="col" className="min-w-[280px] px-4 py-3 font-semibold">เรื่อง</th>
                <th scope="col" className="px-4 py-3 font-semibold">ประเภท</th>
                <th scope="col" className="px-4 py-3 font-semibold">สถานะ</th>
                <th scope="col" className="px-4 py-3 font-semibold">ระดับ</th>
                <th scope="col" className="min-w-[190px] px-4 py-3 font-semibold">เวลาตามข้อตกลง</th>
                <th scope="col" className="px-4 py-3 font-semibold">ผู้รับผิดชอบ</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_TICKETS.map((t) => (
                <tr
                  key={t.id}
                  className={`border-b border-hair last:border-0 hover:bg-subtle ${PRIORITY[t.priority].railClass}`}
                >
                  <td className="tabular whitespace-nowrap px-4 py-3 font-semibold text-ink-2">
                    {t.ticket_no.slice(-7)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium leading-snug">{t.subject}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-3">
                      <span>
                        {t.category.name_th}
                        {t.department ? ` · ${t.department.name}` : ''}
                      </span>
                      {t.comment_count > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" aria-hidden="true" />
                          {t.comment_count}
                        </span>
                      )}
                      {t.attachment_count > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Paperclip className="h-3 w-3" aria-hidden="true" />
                          {t.attachment_count}
                        </span>
                      )}
                      {t.reopen_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-p2-fg">
                          <RotateCcw className="h-3 w-3" aria-hidden="true" />
                          เปิดซ้ำ {t.reopen_count}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-subtle px-2.5 py-0.5 text-caption text-ink-2">
                      {TICKET_TYPE[t.ticket_type]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} pendingReason={t.pending_reason} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <SlaBadge
                      status={t.sla.status}
                      remainingMinutes={t.sla.remaining_minutes}
                      remainingUnit={t.sla.remaining_unit}
                      dueAt={t.sla.resolution_due_at}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {t.assignee ? (
                      t.assignee.full_name
                    ) : (
                      <span className="inline-flex items-center gap-2 text-ink-3">
                        —
                        <button
                          type="button"
                          className="min-h-9 rounded border border-control px-2.5 text-caption font-semibold text-ink hover:bg-subtle"
                        >
                          รับงาน
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── การ์ด (มือถือ) ── */}
      <ul className="flex flex-col gap-3 md:hidden">
        {MOCK_TICKETS.map((t) => (
          <li key={t.id}>
            <article
              className={`rounded border border-hair bg-surface p-4 shadow-card ${PRIORITY[t.priority].railClass}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="tabular text-caption font-semibold text-ink-3">
                  {t.ticket_no}
                </span>
                <PriorityBadge priority={t.priority} withMeter={false} />
              </div>
              <h2 className="mt-2 text-body font-medium leading-snug">{t.subject}</h2>
              <p className="mt-1 text-caption text-ink-3">
                {t.category.name_th}
                {t.department ? ` · ${t.department.name}` : ''}
              </p>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                <StatusBadge status={t.status} pendingReason={t.pending_reason} />
                <SlaBadge
                  status={t.sla.status}
                  remainingMinutes={t.sla.remaining_minutes}
                  remainingUnit={t.sla.remaining_unit}
                />
              </div>
              <p className="mt-3 border-t border-hair pt-2 text-caption text-ink-3">
                {t.assignee ? `ผู้รับผิดชอบ ${t.assignee.full_name}` : 'ยังไม่มีผู้รับผิดชอบ'}
                {' · อัปเดต '}
                {t.updated_at}
              </p>
            </article>
          </li>
        ))}
      </ul>

      <p className="flex items-start gap-2 text-caption leading-relaxed text-ink-3">
        <span aria-hidden="true">ⓘ</span>
        <span>
          ขอบเขตการมองเห็น: คุณเห็นเรื่องของบริษัทที่ดูแลเท่านั้น (AIDC-LOG, AIDC-CON) ·
          เวลาที่แสดงเป็น<strong className="font-semibold text-ink-2">นาทีทำการ</strong>
          จ–ศ 08:30–17:30 ยกเว้นระดับ P1 ที่นับต่อเนื่อง 24 ชั่วโมง
        </span>
      </p>
    </div>
  );
}
