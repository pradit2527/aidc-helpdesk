'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import * as React from 'react';

import { StatusBadge } from '@/components/common/badges';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { DefRow } from '@/components/ui/misc';
import { TICKET_TYPE } from '@/config/enums';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMinutes, formatSlaRemaining } from '@/lib/format';
import type { TicketDetail } from '@/lib/types';

/**
 * การ์ดด้านข้างของหน้ารายละเอียดเรื่อง — SLA · เรื่องอื่นของผู้แจ้ง · ประวัติสถานะ
 *
 * ทุกตัวเลขมาจาก backend ตรง ๆ ไม่คำนวณเวลาเองที่นี่ (FE-07) เพราะนาทีทำการหยุดนอกเวลา
 * และ client ไม่รู้ปฏิทินวันหยุดของบริษัท
 */

const BAR_COLOR = {
  on_track: 'bg-sla-ok',
  at_risk: 'bg-sla-risk',
  breached: 'bg-sla-breach-solid',
  paused: 'bg-sla-paused',
} as const;

function slaPolicyLabel(ticket: TicketDetail): string {
  const { sla } = ticket;
  /*
   * คำขอบริการ: ชื่อรายการใน catalog + งบเวลา — เป้าอยู่ที่รายการ ไม่ใช่ที่ระดับ priority
   * incident: ระดับความสำคัญ + ชนิดเรื่อง เพราะเป้าคือตาราง priority ตามเอกสาร SLA
   */
  if (ticket.ticket_type === 'service_request') {
    const name = ticket.catalog_item?.name_th ?? TICKET_TYPE.service_request;
    return typeof sla.budget_minutes === 'number'
      ? `${name} · ${formatMinutes(sla.budget_minutes, sla.remaining_unit)}`
      : name;
  }
  return `${ticket.priority} · ${TICKET_TYPE.incident}`;
}

/** บรรทัดรองใต้ชื่อนโยบาย — บอกสถานะของนาฬิกาเป็นประโยคเดียว */
function slaSubtitle(ticket: TicketDetail): string {
  const { sla } = ticket;
  if (sla.clock_started === false) return 'ຍັງບໍ່ເລີ່ມນັບ — ລໍຖ້າການອະນຸມັດກ່ອນ';
  if (sla.status === 'paused') return 'ຢຸດນັບຢູ່';
  return formatSlaRemaining(sla.remaining_minutes, sla.remaining_unit);
}

export function SlaPanel({ ticket }: { ticket: TicketDetail }): React.JSX.Element {
  const { sla } = ticket;
  const percent = typeof sla.elapsed_percent === 'number' ? sla.elapsed_percent : null;
  const started = sla.clock_started !== false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>SLA</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="text-body font-semibold text-ink">{slaPolicyLabel(ticket)}</p>
        <p
          className={cn(
            'mt-0.5 text-caption',
            sla.status === 'breached' && started ? 'text-sla-breach' : 'text-ink-3',
          )}
        >
          {slaSubtitle(ticket)}
        </p>

        {percent !== null && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="ເວລາທີ່ໃຊ້ໄປຂອງ SLA"
            className="mt-2 h-2 overflow-hidden rounded-full bg-subtle"
          >
            <div
              className={cn('h-full rounded-full', BAR_COLOR[sla.status])}
              // ขั้นต่ำ 3% ให้ยังเห็นแถบตอนเพิ่งเริ่มนับ — ค่าจริงอยู่ใน aria-valuenow
              style={{ width: `${Math.max(percent, 3)}%` }}
            />
          </div>
        )}

        <dl className="mt-3 divide-y divide-hair">
          <DefRow label="ເປີດເມື່ອ">{formatDateTime(ticket.created_at)}</DefRow>
          <DefRow label="ເລີ່ມນັບ SLA">
            {started ? (
              formatDateTime(sla.clock_started_at)
            ) : (
              <span className="text-ink-3">ຍັງບໍ່ເລີ່ມ</span>
            )}
          </DefRow>
          <DefRow label="ຕ້ອງຕອບກັບ">
            <span className="inline-flex items-center justify-end gap-1.5">
              {formatDateTime(sla.response_due_at)}
              {sla.first_response_at ? (
                <CheckCircle2
                  className="h-4 w-4 flex-none text-sla-ok"
                  aria-label={`ຕອບຮັບແລ້ວ ${formatDateTime(sla.first_response_at)}`}
                />
              ) : sla.is_response_breached ? (
                <AlertTriangle
                  className="h-4 w-4 flex-none text-sla-breach"
                  aria-label="ເກີນກຳນົດຕອບຮັບ ແລະ ຍັງບໍ່ໄດ້ຕອບ"
                />
              ) : null}
            </span>
          </DefRow>
          <DefRow label="ຄົບກຳນົດ">{formatDateTime(sla.resolution_due_at)}</DefRow>
          <DefRow label="ຢຸດນັບສະສົມ">
            {sla.pending_duration_minutes ? (
              formatMinutes(sla.pending_duration_minutes, sla.remaining_unit)
            ) : (
              <span className="text-ink-3">0 ນທ.</span>
            )}
          </DefRow>
        </dl>
      </CardBody>
    </Card>
  );
}

export function RequesterTicketsPanel({
  ticket,
}: {
  ticket: TicketDetail;
}): React.JSX.Element | null {
  const others = ticket.requester_tickets ?? [];
  // ผู้แจ้งเปิดดูเรื่องของตัวเอง หรือผู้แจ้งไม่มีเรื่องอื่นเลย — การ์ดว่างไม่มีประโยชน์
  if (others.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ເລື່ອງອື່ນຂອງຜູ້ແຈ້ງ</CardTitle>
      </CardHeader>
      <CardBody>
        <ul className="space-y-2">
          {others.map((other) => (
            <li key={other.id}>
              <Link
                href={`/tickets/${other.id}`}
                className="block rounded text-body-sm text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                title={`${other.ticket_no} · ${TICKET_TYPE[other.ticket_type]}`}
              >
                <span className="tabular mr-1.5 text-caption text-ink-3">{other.ticket_no}</span>
                {other.subject}
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/**
 * แถวเดียวของประวัติเก็บได้ทั้งการเปลี่ยนสถานะ การเปลี่ยนผู้รับผิดชอบ และการเปลี่ยนระดับ
 * ความสำคัญ อย่างใดอย่างหนึ่งหรือหลายอย่างพร้อมกัน — ประกอบเป็นบรรทัดหมายเหตุทีละท่อน
 * แทนการเดาว่ามีแค่การเปลี่ยนสถานะเสมอ
 */
function historyNotes(entry: TicketDetail['history'][number]): string[] {
  const notes: string[] = [];
  const from = entry.from_assignee?.full_name;
  const to = entry.to_assignee?.full_name;
  if (to) notes.push(from ? `ຜູ້ຮັບຜິດຊອບ: ${from} → ${to}` : `ມອບໝາຍໃຫ້ ${to}`);
  if (entry.to_priority) {
    notes.push(
      entry.from_priority
        ? `ລະດັບ: ${entry.from_priority} → ${entry.to_priority}`
        : `ກຳນົດລະດັບເປັນ ${entry.to_priority}`,
    );
  }
  if (entry.reason) notes.push(entry.reason);
  return notes;
}

export function HistoryPanel({ ticket }: { ticket: TicketDetail }): React.JSX.Element | null {
  // ผู้เรียกที่ไม่มีสิทธิ์ดูประวัติได้อาร์เรย์ว่างจาก backend — ไม่วาดการ์ดเปล่า ๆ
  if (ticket.history.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ປະຫວັດສະຖານະ</CardTitle>
      </CardHeader>
      <CardBody>
        <ol className="relative space-y-4 border-l-2 border-hair pl-4">
          {[...ticket.history].reverse().map((entry) => {
            const notes = historyNotes(entry);
            // สถานะเดิมซ้ำ (เช่นเปลี่ยนแค่ผู้รับผิดชอบ) วาดป้ายเดียว ไม่ใช่ "มอบหมายแล้ว → มอบหมายแล้ว"
            const changedStatus = entry.from_status !== null && entry.from_status !== entry.to_status;
            return (
              <li key={entry.id} className="relative">
                <span
                  className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary"
                  aria-hidden="true"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {changedStatus && entry.from_status && (
                    <>
                      <StatusBadge status={entry.from_status} />
                      <span className="text-ink-3" aria-label="ເປັນ">
                        →
                      </span>
                    </>
                  )}
                  <StatusBadge status={entry.to_status} />
                </div>
                {notes.map((note, i) => (
                  <p key={i} className="mt-1 text-body-sm text-ink-2">
                    {note}
                  </p>
                ))}
                <p className="mt-0.5 text-caption text-ink-3">
                  {entry.changed_by?.full_name ?? 'ລະບົບ'} ·{' '}
                  <time dateTime={entry.changed_at}>{formatDateTime(entry.changed_at)}</time>
                </p>
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}
