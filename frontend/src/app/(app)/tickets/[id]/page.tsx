'use client';

import { notFound } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Paperclip,
  Send,
  ShieldAlert,
  UserPlus,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PriorityBadge, SlaBadge, StatusBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select, Textarea } from '@/components/ui/field';
import { Alert, Avatar, BackLink, DefRow, Tabs } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { CHANNEL, PENDING_REASON, TICKET_STATUS, TICKET_TYPE } from '@/config/enums';
import { cn } from '@/lib/cn';
import { formatDateTime, formatFileSize, formatRelative } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useTicket } from '@/lib/queries/tickets';
import type { TicketDetail } from '@/lib/types';

type DetailTab = 'conversation' | 'approvals' | 'checklist' | 'history';

/**
 * รายละเอียดเรื่อง — หน้าที่ทุก role เข้าได้แต่เห็นปุ่มไม่เหมือนกัน
 *
 * ปุ่มทุกอันซ่อน/แสดงจากบล็อก `can` ที่ backend ส่งมา
 * frontend ไม่ประเมินเงื่อนไข "เฉพาะของตน" หรือ "เฉพาะบริษัทตน" เองแม้แต่ข้อเดียว
 * ถ้าเริ่มคำนวณเอง กติกาจะแตกเป็นสองชุดที่เพี้ยนจากกันทันทีที่ข้อใดข้อหนึ่งเปลี่ยน
 */
export default function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.JSX.Element {
  const { id } = React.use(params);
  const query = useTicket(Number(id));

  /*
   * เรื่องที่อยู่นอกขอบเขตได้ 404 จากเซิร์ฟเวอร์ ไม่ใช่ 403
   *
   * เหตุความปลอดภัย (SOP-10) ก็ได้ 404 เหมือนกันเมื่อผู้เรียกไม่ใช่ผู้เกี่ยวข้อง
   * ทำให้แยกไม่ออกว่า "ไม่มีเรื่องนี้" กับ "มีแต่ดูไม่ได้" ซึ่งเป็นสิ่งที่ตั้งใจ
   */
  if (query.isError && query.error instanceof ApiError && query.error.status === 404) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/queue" label="ກັບໄປຄິວວຽກ" />
      <QueryBoundary query={query}>
        {query.data && <TicketDetailView ticket={query.data} />}
      </QueryBoundary>
    </div>
  );
}

function TicketDetailView({ ticket }: { ticket: TicketDetail }): React.JSX.Element {
  const [tab, setTab] = React.useState<DetailTab>('conversation');

  const tabs = [
    { key: 'conversation' as const, label: 'ການສົນທະນາ', count: ticket.comments.length },
    ...(ticket.approvals.length > 0
      ? [{ key: 'approvals' as const, label: 'ການອະນຸມັດ', count: ticket.approvals.length }]
      : []),
    ...(ticket.checklist.length > 0
      ? [{ key: 'checklist' as const, label: 'ລາຍການກວດ', count: ticket.checklist.length }]
      : []),
    { key: 'history' as const, label: 'ປະຫວັດ', count: ticket.history.length },
  ];

  return (
    <>
      {ticket.is_security_incident && (
        <Alert tone="danger" title="ເຫດຄວາມປອດໄພ — ຈຳກັດການເບິ່ງເຫັນ">
          ເລື່ອງນີ້ເຫັນໄດ້ສະເພາະຜູ້ແຈ້ງ ຜູ້ຮັບຜິດຊອບ ຫົວໜ້າໄອທີ ຜູ້ບໍລິຫານສູງສຸດ ແລະ DPO ເທົ່ານັ້ນ
          (SOP-10 ຂໍ້ 2)
        </Alert>
      )}

      {ticket.is_major_incident && !ticket.is_security_incident && (
        <Alert tone="warning" title="ເຫດຮ້າຍແຮງ (Major Incident)">
          ແຈ້ງຫົວໜ້າໄອທີ ແລະ ທີມ On-call ແລ້ວ ຕ້ອງລາຍງານສະຖານະທຸກ 1 ຊົ່ວໂມງຈົນກວ່າຈະຄືນບໍລິການ
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardBody>
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular text-caption text-ink-3">{ticket.ticket_no}</span>
                <span className="text-caption text-ink-3" aria-hidden="true">
                  ·
                </span>
                <span className="text-caption text-ink-3">{TICKET_TYPE[ticket.ticket_type]}</span>
              </div>

              <h1 className="mt-1 text-h1 leading-snug">{ticket.subject}</h1>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={ticket.status} pendingReason={ticket.pending_reason} />
                <PriorityBadge priority={ticket.priority} />
                <SlaBadge
                  status={ticket.sla.status}
                  remainingMinutes={ticket.sla.remaining_minutes}
                  remainingUnit={ticket.sla.remaining_unit}
                />
              </div>

              <p className="mt-4 whitespace-pre-wrap text-body text-ink-2">{ticket.description}</p>

              {ticket.sla.workaround_at && (
                <div className="mt-4 rounded border border-sla-risk/30 bg-sla-risk-bg px-4 py-3">
                  <p className="text-body-sm font-semibold">
                    ມີທາງແກ້ຊົ່ວຄາວແລ້ວ — ໂມງ SLA ຂອງການແກ້ໄຂຢຸດນັບຕັ້ງແຕ່{' '}
                    {formatDateTime(ticket.sla.workaround_at)}
                  </p>
                  <p className="mt-1 text-body-sm text-ink-2">{ticket.workaround_note}</p>
                  <p className="mt-1 text-caption text-ink-3">
                    ການແກ້ຖາວອນຕິດຕາມຕໍ່ໃນຮູບແບບ Problem
                  </p>
                </div>
              )}

              {ticket.resolution_note && (
                <div className="mt-4 rounded border border-sla-ok/30 bg-sla-ok-bg px-4 py-3">
                  <p className="text-body-sm font-semibold">ສະຫຼຸບການແກ້ໄຂ</p>
                  <p className="mt-1 text-body-sm text-ink-2">{ticket.resolution_note}</p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <div className="px-4 pt-1 lg:px-5">
              <Tabs tabs={tabs} value={tab} onChange={setTab} label="ສ່ວນຂອງລາຍລະອຽດເລື່ອງ" />
            </div>
            <CardBody>
              {tab === 'conversation' && <Conversation ticket={ticket} />}
              {tab === 'approvals' && <Approvals ticket={ticket} />}
              {tab === 'checklist' && <Checklist ticket={ticket} />}
              {tab === 'history' && <History ticket={ticket} />}
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <ActionPanel ticket={ticket} />
          <DetailsPanel ticket={ticket} />
        </div>
      </div>
    </>
  );
}

function Conversation({ ticket }: { ticket: TicketDetail }): React.JSX.Element {
  const [body, setBody] = React.useState('');
  const [internal, setInternal] = React.useState(false);

  function send(event: React.FormEvent): void {
    event.preventDefault();
    if (body.trim().length === 0) return;
    toast.success(internal ? 'ບັນທຶກຄອມເມັນພາຍໃນແລ້ວ' : 'ສົ່ງຄອມເມັນໃຫ້ຜູ້ແຈ້ງແລ້ວ');
    setBody('');
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {ticket.comments.map((comment) => (
          <li
            key={comment.id}
            className={cn(
              'rounded-lg border px-4 py-3',
              comment.is_internal
                ? // คอมเมนต์ภายในต้องต่างจากสาธารณะแบบเห็นได้ทันที
                  // ถ้าดูเหมือนกัน จะมีคนพิมพ์ข้อความภายในลงช่องสาธารณะสักวัน
                  'border-dashed border-sla-risk/40 bg-sla-risk-bg/40'
                : 'border-hair bg-surface',
            )}
          >
            <div className="flex items-start gap-3">
              <Avatar name={comment.author.full_name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body-sm font-semibold">{comment.author.full_name}</span>
                  {comment.is_internal && (
                    <span className="inline-flex items-center gap-1 rounded-sm bg-sla-risk-bg px-1.5 py-0.5 text-[11px] font-semibold text-sla-risk">
                      <Lock className="h-3 w-3" aria-hidden="true" />
                      ພາຍໃນ — ຜູ້ແຈ້ງບໍ່ເຫັນ
                    </span>
                  )}
                  <time
                    className="ml-auto text-caption text-ink-3"
                    dateTime={comment.created_at}
                    title={formatDateTime(comment.created_at)}
                  >
                    {formatRelative(comment.created_at)}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-body-sm text-ink-2">{comment.body}</p>
                {comment.attachments.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {comment.attachments.map((file) => (
                      <li key={file.id}>
                        <a
                          href="#"
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded border border-hair px-2.5 text-caption text-ink-2 hover:border-primary hover:text-primary"
                        >
                          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                          {file.file_name}
                          <span className="tabular text-ink-3">
                            ({formatFileSize(file.file_size)})
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {ticket.can.comment && (
        <form onSubmit={send} className="border-t border-hair pt-4">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder={internal ? 'ບັນທຶກພາຍໃນທີມ ຜູ້ແຈ້ງຈະບໍ່ເຫັນ' : 'ຂຽນຕອບຜູ້ແຈ້ງ'}
            aria-label="ຂໍ້ຄວາມຄອມເມັນ"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            {ticket.can.comment_internal && (
              <label className="inline-flex min-h-tap items-center gap-2 text-body-sm text-ink-2">
                <input
                  type="checkbox"
                  checked={internal}
                  onChange={(e) => setInternal(e.target.checked)}
                  className="h-4 w-4 rounded border-control"
                />
                ບັນທຶກເປັນຄອມເມັນພາຍໃນ
              </label>
            )}
            <Button type="submit" disabled={body.trim().length === 0} className="ml-auto">
              <Send className="h-4 w-4" aria-hidden="true" />
              ສົ່ງ
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Approvals({ ticket }: { ticket: TicketDetail }): React.JSX.Element {
  const STATUS_LABEL = {
    pending: 'ລໍຖ້າພິຈາລະນາ',
    approved: 'ອະນຸມັດແລ້ວ',
    rejected: 'ປະຕິເສດ',
    skipped: 'ຂ້າມ',
  } as const;

  return (
    <div className="space-y-3">
      <p className="text-body-sm text-ink-2">
        ຂັ້ນຖັດໄປເປີດໃຫ້ພິຈາລະນາໄດ້ເມື່ອຂັ້ນກ່ອນໜ້າອະນຸມັດແລ້ວເທົ່ານັ້ນ
        ແລະ ຂະນະທີ່ຍັງມີຂັ້ນລໍຖ້າຢູ່ ໂມງ SLA ຈະຢຸດນັບ
      </p>

      <ol className="space-y-2">
        {ticket.approvals.map((step) => (
          <li
            key={step.id}
            className="flex flex-wrap items-center gap-3 rounded border border-hair px-4 py-3"
          >
            <span className="tabular grid h-8 w-8 flex-none place-items-center rounded-full bg-subtle text-body-sm font-semibold">
              {step.seq}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body-sm font-semibold">{step.approver.full_name}</span>
              {step.comment && <span className="block text-caption text-ink-2">{step.comment}</span>}
            </span>
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-caption font-semibold',
                step.status === 'approved' && 'bg-sla-ok-bg text-sla-ok',
                step.status === 'pending' && 'bg-st-pending-bg text-st-pending-fg',
                step.status === 'rejected' && 'bg-sla-breach-bg text-sla-breach',
                step.status === 'skipped' && 'bg-subtle text-ink-3',
              )}
            >
              {STATUS_LABEL[step.status]}
            </span>
            {step.decided_at && (
              <span className="text-caption text-ink-3">{formatDateTime(step.decided_at)}</span>
            )}
          </li>
        ))}
      </ol>

      <Alert tone="info" title="ຜູ້ຂໍອະນຸມັດຄຳຂໍຂອງຕົນເອງບໍ່ໄດ້">
        ປຸ່ມອະນຸມັດຈະປາກົດສະເພາະຜູ້ທີ່ຖືກລະບຸເປັນຜູ້ອະນຸມັດຂອງຂັ້ນນັ້ນ
        ແລະ ຕ້ອງບໍ່ແມ່ນຜູ້ແຈ້ງເລື່ອງ
      </Alert>
    </div>
  );
}

function Checklist({ ticket }: { ticket: TicketDetail }): React.JSX.Element {
  const done = ticket.checklist.filter((i) => i.is_done).length;

  return (
    <div className="space-y-3">
      <p className="tabular text-body-sm text-ink-2">
        ເຮັດແລ້ວ {done} / {ticket.checklist.length} ລາຍການ
      </p>
      <ul className="space-y-2">
        {ticket.checklist.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-3 rounded border border-hair px-4 py-3"
          >
            <input
              type="checkbox"
              checked={item.is_done}
              readOnly
              aria-label={item.title}
              className="mt-1 h-4 w-4 flex-none rounded border-control"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-body-sm text-ink">{item.title}</span>
              <span className="mt-0.5 flex flex-wrap gap-x-3 text-caption text-ink-3">
                {item.is_required && <span>ບັງຄັບ</span>}
                {item.evidence_required && <span>ຕ້ອງແນບຫຼັກຖານ</span>}
                {item.done_by && (
                  <span>
                    {item.done_by.full_name} · {formatDateTime(item.done_at)}
                  </span>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function History({ ticket }: { ticket: TicketDetail }): React.JSX.Element {
  /*
   * แถวหนึ่งของประวัติเก็บทั้งการเปลี่ยนสถานะและการเปลี่ยนระดับความสำคัญ
   * และอาจมีอย่างใดอย่างหนึ่งหรือทั้งคู่ จึงประกอบข้อความเป็นท่อน ๆ
   * แล้วค่อยต่อกัน แทนการเดาว่ามีแค่ฟิลด์เดียวเสมอ
   */
  const changes = (entry: TicketDetail['history'][number]): string[] => {
    const parts: string[] = [];
    if (entry.to_status) {
      const to = TICKET_STATUS[entry.to_status]?.label ?? entry.to_status;
      const from = entry.from_status ? (TICKET_STATUS[entry.from_status]?.label ?? entry.from_status) : null;
      parts.push(from ? `ປ່ຽນສະຖານະຈາກ “${from}” ເປັນ “${to}”` : `ເປີດເລື່ອງດ້ວຍສະຖານະ “${to}”`);
    }
    if (entry.to_priority) {
      parts.push(
        entry.from_priority
          ? `ປ່ຽນລະດັບຈາກ ${entry.from_priority} ເປັນ ${entry.to_priority}`
          : `ກຳນົດລະດັບເປັນ ${entry.to_priority}`,
      );
    }
    return parts;
  };

  return (
    <ol className="space-y-3">
      {[...ticket.history].reverse().map((entry) => (
        <li key={entry.id} className="flex gap-3 border-l-2 border-hair pl-4">
          <div className="min-w-0 flex-1">
            <p className="text-body-sm text-ink">
              <span className="font-semibold">{entry.changed_by?.full_name ?? 'ລະບົບ'}</span>{' '}
              {changes(entry).join(' · ') || 'ແກ້ໄຂເລື່ອງ'}
            </p>
            {entry.reason && (
              <p className="mt-0.5 text-caption text-ink-2">ເຫດຜົນ: {entry.reason}</p>
            )}
            <time className="text-caption text-ink-3" dateTime={entry.changed_at}>
              {formatDateTime(entry.changed_at)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ActionPanel({ ticket }: { ticket: TicketDetail }): React.JSX.Element {
  const can = ticket.can;
  const nothingAvailable = !Object.values(can).some(Boolean);

  return (
    <Card>
      <CardHeader>
        <CardTitle>ການດຳເນີນການ</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {nothingAvailable && (
          <p className="text-body-sm text-ink-3">ເລື່ອງນີ້ຈົບແລ້ວ ບໍ່ມີການດຳເນີນການທີ່ເຮັດໄດ້</p>
        )}

        {can.assign_self && (
          <Button className="w-full" onClick={() => toast.success('ຮັບວຽກນີ້ແລ້ວ')}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            ຮັບວຽກນີ້
          </Button>
        )}

        {can.change_status && (
          <Field label="ປ່ຽນສະຖານະ" htmlFor="status-change">
            <Select
              defaultValue={ticket.status}
              onChange={(e) => toast.success(`ປ່ຽນສະຖານະເປັນ ${TICKET_STATUS[e.target.value as keyof typeof TICKET_STATUS].label}`)}
            >
              {Object.entries(TICKET_STATUS).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {can.change_priority && (
          <p className="rounded border border-hair bg-subtle px-3 py-2 text-caption text-ink-2">
            ການປ່ຽນລະດັບຄວາມສຳຄັນຕ້ອງລະບຸເຫດຜົນທຸກຄັ້ງ ແລະ ໂມງ SLA
            ຈະນັບໃໝ່ຕາມລະດັບໃໝ່ຕັ້ງແຕ່ເວລາທີ່ປ່ຽນ
          </p>
        )}

        {can.set_workaround && !ticket.sla.workaround_at && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => toast.info('ຕ້ອງເປີດ Problem ຄູ່ກັນ ຈຶ່ງບັນທຶກທາງແກ້ຊົ່ວຄາວໄດ້')}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ບັນທຶກທາງແກ້ຊົ່ວຄາວ
          </Button>
        )}

        {can.declare_major_incident && !ticket.is_major_incident && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => toast.warning('ຈະແຈ້ງຫົວໜ້າໄອທີ ແລະ ທີມ On-call ທັນທີ')}
          >
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            ປະກາດເປັນເຫດຮ້າຍແຮງ
          </Button>
        )}

        {can.request_priority_review && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => toast.info('ຕ້ອງລະບຸເຫດຜົນທາງທຸລະກິດ ເຈົ້າໜ້າທີ່ຈະພິຈາລະນາ')}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            ຂໍທົບທວນລະດັບຄວາມສຳຄັນ
          </Button>
        )}

        {can.close_own && (
          <Button className="w-full" onClick={() => toast.success('ປິດເລື່ອງແລ້ວ ຂອບໃຈຫຼາຍ')}>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ຢືນຢັນປິດເລື່ອງ
          </Button>
        )}

        {can.reopen && (
          <Button variant="secondary" className="w-full" onClick={() => toast.info('ເປີດເລື່ອງຄືນແລ້ວ')}>
            ເປີດເລື່ອງຄືນ
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

function DetailsPanel({ ticket }: { ticket: TicketDetail }): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>ຂໍ້ມູນເລື່ອງ</CardTitle>
      </CardHeader>
      <CardBody>
        <dl className="divide-y divide-hair">
          <DefRow label="ຜູ້ແຈ້ງ">{ticket.requester.full_name}</DefRow>
          <DefRow label="ຜູ້ຮັບຜິດຊອບ">
            {ticket.assignee?.full_name ?? <span className="text-ink-3">ຍັງບໍ່ມີ</span>}
          </DefRow>
          <DefRow label="ບໍລິສັດ">{ticket.company.code}</DefRow>
          <DefRow label="ພະແນກ">{ticket.department?.name ?? '—'}</DefRow>
          <DefRow label="ໝວດໝູ່">{ticket.category.name_th}</DefRow>
          <DefRow label="ຊ່ອງທາງແຈ້ງ">{CHANNEL[ticket.channel]}</DefRow>
          <DefRow label="ລະດັບການສະໜັບສະໜູນ">Tier {ticket.support_tier}</DefRow>
          {ticket.vendor_ref && <DefRow label="ເລກອ້າງອີງຜູ້ໃຫ້ບໍລິການ">{ticket.vendor_ref}</DefRow>}
          {ticket.pending_reason && (
            <DefRow label="ລໍຖ້າຫຍັງຢູ່">{PENDING_REASON[ticket.pending_reason]}</DefRow>
          )}
          <DefRow label="ແຈ້ງເມື່ອ">{formatDateTime(ticket.created_at)}</DefRow>
          <DefRow label="ຄົບກຳນົດຕອບຮັບ">{formatDateTime(ticket.sla.response_due_at)}</DefRow>
          <DefRow label="ຕອບຮັບຄັ້ງທຳອິດ">
            {ticket.sla.first_response_at ? (
              formatDateTime(ticket.sla.first_response_at)
            ) : (
              <span className="text-sla-risk">ຍັງບໍ່ໄດ້ຕອບຮັບ</span>
            )}
          </DefRow>
          {ticket.resolved_at && (
            <DefRow label="ແກ້ໄຂເມື່ອ">{formatDateTime(ticket.resolved_at)}</DefRow>
          )}
          {ticket.reopen_count > 0 && (
            <DefRow label="ເປີດຄືນມາແລ້ວ">{ticket.reopen_count} ຄັ້ງ</DefRow>
          )}
          {ticket.satisfaction_score !== null && (
            <DefRow label="ຄະແນນຄວາມພໍໃຈ">{ticket.satisfaction_score} / 5</DefRow>
          )}
        </dl>
      </CardBody>
    </Card>
  );
}
