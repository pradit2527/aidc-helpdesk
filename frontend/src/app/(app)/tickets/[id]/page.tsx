'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Lock,
  Paperclip,
  Send,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  UserPlus,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PriorityBadge, SlaBadge, StatusBadge } from '@/components/common/badges';
import { AssignPanel } from '@/components/tickets/assign-panel';
import {
  HistoryPanel,
  RequesterTicketsPanel,
  SlaPanel,
} from '@/components/tickets/detail-side-panels';
import {
  CloseOwnTicket,
  MIN_REOPEN_REASON,
  ReopenTicket,
  toastApiError,
} from '@/components/tickets/owner-actions';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, Avatar, BackLink, DefRow, Tabs } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import {
  CHANNEL,
  PENDING_REASON,
  TICKET_TYPE,
  isDoneStatus,
  statusLabel,
  type TicketStatus,
} from '@/config/enums';
import { cn } from '@/lib/cn';
import { formatDateTime, formatFileSize, formatRelative } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useDecideApproval } from '@/lib/queries/operations';
import {
  useAddComment,
  useAssignTicket,
  useChangeTicketStatus,
  useLinkTicket,
  useTicket,
  useTicketSearch,
} from '@/lib/queries/tickets';
import { useSession } from '@/lib/session';
import type { ApprovalStep, TicketDetail } from '@/lib/types';
import { useDebounced } from '@/lib/use-debounced';
import { useTicketChat } from '@/lib/ws';

type DetailTab = 'conversation' | 'approvals' | 'checklist';

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
  /*
   * เรื่องที่จอดรออนุมัติเปิดมาที่แท็บอนุมัติเลย
   *
   * สิ่งเดียวที่เกิดขึ้นต่อได้กับเรื่องในสถานะนี้คือมีคนกดอนุมัติ การเปิดมาที่
   * แท็บสนทนาแปลว่าผู้อนุมัติที่ตามลิงก์จากอีเมลมาต้องหาแท็บเองก่อนทุกครั้ง
   */
  const [tab, setTab] = React.useState<DetailTab>(() =>
    isAwaitingApproval(ticket) && ticket.approvals.length > 0 ? 'approvals' : 'conversation',
  );
  const approvalStep = currentApprovalStep(ticket);
  useTicketChat(ticket.id);

  const tabs = [
    { key: 'conversation' as const, label: 'ການສົນທະນາ', count: ticket.comments.length },
    ...(ticket.approvals.length > 0
      ? [{ key: 'approvals' as const, label: 'ການອະນຸມັດ', count: ticket.approvals.length }]
      : []),
    ...(ticket.checklist.length > 0
      ? [{ key: 'checklist' as const, label: 'ລາຍການກວດ', count: ticket.checklist.length }]
      : []),
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

      {/* เรื่องที่จอดรออนุมัติ ไม่มีใครในทีมไอทีทำอะไรได้จนกว่าจะผ่านขั้นนี้ — ต้องเห็นตั้งแต่บนสุด */}
      {isAwaitingApproval(ticket) && (
        <Alert
          tone="warning"
          title={
            approvalStep
              ? `ລໍຖ້າ ${approvalStep.approver.full_name} ອະນຸມັດ`
              : 'ລໍຖ້າການອະນຸມັດ'
          }
        >
          ທີມງານຈະເລີ່ມດຳເນີນການໄດ້ຫຼັງຜ່ານການອະນຸມັດ ແລະ ຂະນະນີ້ໂມງ SLA ຢຸດນັບຢູ່
        </Alert>
      )}

      {ticket.status === 'rejected' && (
        <Alert tone="danger" title="ຄຳຂໍນີ້ບໍ່ໄດ້ຮັບການອະນຸມັດ">
          {ticket.approvals.find((s) => s.status === 'rejected')?.comment ??
            'ຜູ້ພິຈາລະນາບໍ່ອະນຸມັດຄຳຂໍນີ້'}{' '}
          — ຖ້າຍັງຕ້ອງການບໍລິການນີ້ ໃຫ້ຍື່ນຄຳຂໍໃໝ່ພ້ອມຂໍ້ມູນເພີ່ມເຕີມ
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

              <RelatedTicket ticket={ticket} />

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
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <ActionPanel ticket={ticket} />
          <DetailsPanel ticket={ticket} />
          <SlaPanel ticket={ticket} />
          <RequesterTicketsPanel ticket={ticket} />
          <HistoryPanel ticket={ticket} />
        </div>
      </div>
    </>
  );
}

/**
 * เรื่องที่ผูกไว้ + ทางผูกเรื่องใหม่
 *
 * ผูกได้ใบเดียวโดยตั้งใจ ไม่มีมุมมองกราฟ — คำถามที่เจ้าหน้าที่ถามจริงตอนเปิดเรื่องคือ
 * "ใบนี้มันใบเดียวกับที่เพิ่งแก้ไปเมื่อวานหรือเปล่า" ซึ่งลิงก์เดียวตอบได้ครบ
 *
 * ปุ่มผูกยึด can.update จาก backend — ผู้แจ้งทั่วไปผูกเรื่องข้ามกันไม่ได้
 */
function RelatedTicket({ ticket }: { ticket: TicketDetail }): React.JSX.Element | null {
  const [picking, setPicking] = React.useState(false);
  const linkTicket = useLinkTicket();
  const related = ticket.related_ticket ?? null;
  const canLink = ticket.can.update;

  // ไม่มีอะไรผูกไว้ และผู้ใช้คนนี้ก็ผูกไม่ได้ — ไม่ต้องกินที่บนหน้าจอเลย
  if (!related && !canLink) return null;

  return (
    <div className="mt-3">
      {related && !picking ? (
        <div className="flex flex-wrap items-center gap-2 rounded border border-hair bg-subtle px-3 py-2">
          <Link2 className="h-4 w-4 flex-none text-ink-3" aria-hidden="true" />
          <span className="text-caption text-ink-3">ຜູກກັບ</span>
          <Link
            href={`/tickets/${related.id}`}
            className="group flex min-w-0 flex-wrap items-center gap-2"
          >
            <span className="tabular text-caption font-semibold text-ink-2">{related.ticket_no}</span>
            <span className="min-w-0 truncate text-body-sm font-semibold text-ink group-hover:text-primary">
              {related.subject}
            </span>
          </Link>
          <StatusBadge status={related.status} />
          <span className="rounded-sm border border-hair bg-surface px-1.5 py-0.5 text-caption text-ink-2">
            {TICKET_TYPE[related.ticket_type]}
          </span>
          {canLink && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setPicking(true)}
            >
              ປ່ຽນ
            </Button>
          )}
        </div>
      ) : picking ? (
        <TicketLinkPicker
          ticket={ticket}
          pending={linkTicket.isPending}
          onCancel={() => setPicking(false)}
          onPick={(id) =>
            linkTicket.mutate(
              { id: ticket.id, related_ticket_id: id },
              {
                onSuccess: () => {
                  toast.success('ຜູກເລື່ອງແລ້ວ');
                  setPicking(false);
                },
                onError: (error) => void toastApiError(error, 'ຜູກເລື່ອງບໍ່ສຳເລັດ'),
              },
            )
          }
        />
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setPicking(true)}>
          <Link2 className="h-4 w-4" aria-hidden="true" />
          ຜູກກັບ Ticket ອື່ນ
        </Button>
      )}
    </div>
  );
}

/** ค้นเรื่องด้วยเลขที่หรือหัวข้อแล้วเลือกมาผูก — รายการมาจาก GET /tickets ที่กรองขอบเขตให้แล้ว */
function TicketLinkPicker({
  ticket,
  pending,
  onCancel,
  onPick,
}: {
  ticket: TicketDetail;
  pending: boolean;
  onCancel: () => void;
  onPick: (id: number) => void;
}): React.JSX.Element {
  const [q, setQ] = React.useState('');
  const term = useDebounced(q, 300);
  const results = useTicketSearch(term, ticket.id);
  const rows = results.data ?? [];

  return (
    <div className="space-y-2 rounded border border-hair bg-surface p-3">
      <Field
        label="ຄົ້ນຫາ Ticket ທີ່ຈະຜູກ"
        htmlFor="link-ticket-search"
        hint="ພິມເລກທີ Ticket ຫຼື ຄຳໃນຫົວຂໍ້ ຢ່າງໜ້ອຍ 2 ຕົວອັກສອນ"
      >
        <Input
          id="link-ticket-search"
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ເຊັ່ນ INC-2026-0042"
        />
      </Field>

      {term.trim().length >= 2 && (
        <ul className="max-h-64 space-y-1 overflow-y-auto" aria-label="ຜົນການຄົ້ນຫາ">
          {results.isPending && (
            <li className="px-2 py-1.5 text-caption text-ink-3" role="status">
              ກຳລັງຄົ້ນຫາ...
            </li>
          )}
          {results.isSuccess && rows.length === 0 && (
            <li className="px-2 py-1.5 text-caption text-ink-3">ບໍ່ພົບ Ticket ທີ່ຕົງກັບຄຳຄົ້ນ</li>
          )}
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => onPick(row.id)}
                className="flex w-full flex-wrap items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-subtle disabled:opacity-60"
              >
                <span className="tabular flex-none text-caption font-semibold text-ink-2">
                  {row.ticket_no}
                </span>
                <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{row.subject}</span>
                <StatusBadge status={row.status} pendingReason={row.pending_reason} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          ຍົກເລີກ
        </Button>
      </div>
    </div>
  );
}

function Conversation({ ticket }: { ticket: TicketDetail }): React.JSX.Element {
  const [body, setBody] = React.useState('');
  const [internal, setInternal] = React.useState(false);
  const addComment = useAddComment(ticket.id);

  function send(event: React.FormEvent): void {
    event.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length === 0 || addComment.isPending) return;
    addComment.mutate(
      { body: trimmed, is_internal: internal },
      {
        onSuccess: () => {
          toast.success(internal ? 'ບັນທຶກຄອມເມັນພາຍໃນແລ້ວ' : 'ສົ່ງຄອມເມັນໃຫ້ຜູ້ແຈ້ງແລ້ວ');
          setBody('');
        },
        onError: (error) => {
          toast.error(error instanceof ApiError ? error.message : 'ສົ່ງຄອມເມັນບໍ່ສຳເລັດ');
        },
      },
    );
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
            <Button
              type="submit"
              disabled={body.trim().length === 0 || addComment.isPending}
              className="ml-auto"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              ສົ່ງ
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

const APPROVAL_STEP_LABEL = {
  pending: 'ລໍຖ້າພິຈາລະນາ',
  approved: 'ອະນຸມັດແລ້ວ',
  rejected: 'ປະຕິເສດ',
  skipped: 'ຂ້າມ',
} as const;

/**
 * เรื่องนี้กำลังจอดรออนุมัติอยู่ไหม
 *
 * รับสองรูปโดยตั้งใจ — `pending_approval` คือสถานะเฉพาะที่เพิ่มเข้ามาในรอบนี้
 * ส่วน `pending_user` + pending_reason='approval' คือวิธีเดิมที่ยังมีเรื่องค้างอยู่
 * ในฐานข้อมูลจริง ถ้ารับแบบเดียว เรื่องที่ค้างจากก่อน migration จะไม่มีปุ่มอนุมัติ
 * ให้ใครกดได้เลย และต้องไปแก้ในฐานข้อมูลมือ
 */
function isAwaitingApproval(ticket: TicketDetail): boolean {
  if (ticket.status === 'pending_approval') return true;
  return ticket.status === 'pending_user' && ticket.pending_reason === 'approval';
}

/** ขั้นที่กำลังเปิดให้พิจารณาอยู่ — ขั้นแรกสุดที่ยังไม่ตัดสิน */
function currentApprovalStep(ticket: TicketDetail): ApprovalStep | null {
  return [...ticket.approvals].sort((a, b) => a.seq - b.seq).find((s) => s.status === 'pending') ?? null;
}

function Approvals({ ticket }: { ticket: TicketDetail }): React.JSX.Element {
  const { user } = useSession();
  const step = currentApprovalStep(ticket);
  const waiting = isAwaitingApproval(ticket);

  /*
   * ใครเห็นปุ่มอนุมัติ — ยึด can_decide ที่ backend ส่งมาก่อนเสมอ
   *
   * ถ้า API ยังไม่ส่งช่องนั้น ถอยไปเทียบ id ของผู้อนุมัติกับผู้ใช้ในเซสชัน
   * ซึ่งเป็นการตัดสิน "จะวาดปุ่มไหม" เท่านั้น ไม่ใช่การให้สิทธิ์ —
   * POST /approvals/{id}/decide ตรวจซ้ำและปฏิเสธคนที่ไม่ใช่ผู้อนุมัติของขั้นนั้นอยู่แล้ว
   */
  const canDecide = step !== null && waiting && (step.can_decide ?? step.approver.id === user.id);

  return (
    <div className="space-y-3">
      <p className="text-body-sm text-ink-2">
        ຂັ້ນຖັດໄປເປີດໃຫ້ພິຈາລະນາໄດ້ເມື່ອຂັ້ນກ່ອນໜ້າອະນຸມັດແລ້ວເທົ່ານັ້ນ
        ແລະ ຂະນະທີ່ຍັງມີຂັ້ນລໍຖ້າຢູ່ ໂມງ SLA ຈະຢຸດນັບ
      </p>

      {/* ผู้ที่ไม่ใช่ผู้อนุมัติต้องรู้ว่า "รออยู่ที่ใคร" ไม่ใช่เห็นแค่ป้ายสถานะเฉย ๆ */}
      {waiting && step && !canDecide && (
        <Alert tone="warning" title={`ລໍຖ້າ ${step.approver.full_name} ພິຈາລະນາ`}>
          ຂັ້ນທີ {step.seq} ຈາກທັງໝົດ {ticket.approvals.length} ຂັ້ນ ·
          ທີມງານຈະເລີ່ມດຳເນີນການໄດ້ຫຼັງຜ່ານການອະນຸມັດຄົບທຸກຂັ້ນ
        </Alert>
      )}

      <ol className="space-y-2">
        {ticket.approvals.map((entry) => (
          <li
            key={entry.id}
            className={cn(
              'flex flex-wrap items-center gap-3 rounded border px-4 py-3',
              entry.id === step?.id && waiting ? 'border-st-pending-fg/40 bg-st-pending-bg/40' : 'border-hair',
            )}
          >
            <span className="tabular grid h-8 w-8 flex-none place-items-center rounded-full bg-subtle text-body-sm font-semibold">
              {entry.seq}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body-sm font-semibold">{entry.approver.full_name}</span>
              {entry.comment && <span className="block text-caption text-ink-2">{entry.comment}</span>}
            </span>
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-caption font-semibold',
                entry.status === 'approved' && 'bg-sla-ok-bg text-sla-ok',
                entry.status === 'pending' && 'bg-st-pending-bg text-st-pending-fg',
                entry.status === 'rejected' && 'bg-st-rejected-bg text-st-rejected-fg',
                entry.status === 'skipped' && 'bg-subtle text-ink-3',
              )}
            >
              {APPROVAL_STEP_LABEL[entry.status]}
            </span>
            {entry.decided_at && (
              <span className="text-caption text-ink-3">{formatDateTime(entry.decided_at)}</span>
            )}
          </li>
        ))}
      </ol>

      {canDecide && step && <ApprovalDecision step={step} />}

      <Alert tone="info" title="ຜູ້ຂໍອະນຸມັດຄຳຂໍຂອງຕົນເອງບໍ່ໄດ້">
        ປຸ່ມອະນຸມັດຈະປາກົດສະເພາະຜູ້ທີ່ຖືກລະບຸເປັນຜູ້ອະນຸມັດຂອງຂັ້ນນັ້ນ
        ແລະ ຕ້ອງບໍ່ແມ່ນຜູ້ແຈ້ງເລື່ອງ
      </Alert>
    </div>
  );
}

/**
 * อนุมัติ / ไม่อนุมัติ ขั้นที่เปิดอยู่ — ใช้ endpoint เดียวกับหน้า "ລໍຖ້າອະນຸມັດ"
 *
 * ผู้อนุมัติหลายคนไม่ได้เป็น agent จึงไม่มีคิวงานให้เข้า และมักเข้ามาทางลิงก์ในอีเมล
 * ซึ่งพามาที่หน้านี้ ถ้าปุ่มอยู่แต่ในหน้าคิวอนุมัติ คนกลุ่มนั้นต้องเดาเองว่าต้องไปไหนต่อ
 *
 * เหตุผลบังคับเมื่อไม่อนุมัติ — ผู้ขอต้องรู้ว่าทำไมถึงถูกปฏิเสธ ไม่งั้นจะยื่นซ้ำแบบเดิม
 */
function ApprovalDecision({ step }: { step: ApprovalStep }): React.JSX.Element {
  const decide = useDecideApproval();
  const [comment, setComment] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  function submit(decision: 'approved' | 'rejected'): void {
    const trimmed = comment.trim();
    if (decision === 'rejected' && trimmed.length === 0) {
      setError('ການບໍ່ອະນຸມັດຕ້ອງລະບຸເຫດຜົນ');
      requestAnimationFrame(() => document.getElementById(`approval-comment-${step.id}`)?.focus());
      return;
    }
    setError(undefined);
    decide.mutate(
      { id: step.id, decision, comment: trimmed || undefined },
      {
        onSuccess: (r) => {
          setComment('');
          toast.success(
            r.status === 'rejected'
              ? 'ບັນທຶກການບໍ່ອະນຸມັດແລ້ວ'
              : r.next_seq !== null
                ? `ອະນຸມັດຂັ້ນນີ້ແລ້ວ ສົ່ງຕໍ່ຂັ້ນທີ ${r.next_seq}`
                : 'ອະນຸມັດຄົບທຸກຂັ້ນແລ້ວ ໂມງ SLA ເລີ່ມນັບຕໍ່',
          );
        },
        onError: (err) => void toastApiError(err, 'ບັນທຶກຜົນການພິຈາລະນາບໍ່ສຳເລັດ'),
      },
    );
  }

  return (
    <div className="space-y-3 rounded border border-primary/30 bg-primary-subtle px-4 py-3">
      <p className="text-body-sm font-semibold text-ink">ທ່ານເປັນຜູ້ພິຈາລະນາຂັ້ນທີ {step.seq}</p>
      <Field
        label="ຄວາມເຫັນ"
        htmlFor={`approval-comment-${step.id}`}
        error={error}
        hint="ບັງຄັບເມື່ອບໍ່ອະນຸມັດ · ຜູ້ຂໍຈະເຫັນຂໍ້ຄວາມນີ້"
      >
        <Textarea
          id={`approval-comment-${step.id}`}
          rows={2}
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setError(undefined);
          }}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button className="flex-1" loading={decide.isPending} onClick={() => submit('approved')}>
          <ThumbsUp className="h-4 w-4" aria-hidden="true" />
          ອະນຸມັດ
        </Button>
        <Button
          variant="danger"
          className="flex-1"
          disabled={decide.isPending}
          onClick={() => submit('rejected')}
        >
          <ThumbsDown className="h-4 w-4" aria-hidden="true" />
          ບໍ່ອະນຸມັດ
        </Button>
      </div>
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

function ActionPanel({ ticket }: { ticket: TicketDetail }): React.JSX.Element {
  const can = ticket.can;
  const { user } = useSession();
  const assign = useAssignTicket();
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
          <Button
            className="w-full"
            loading={assign.isPending}
            onClick={() =>
              assign.mutate(
                { id: ticket.id, assignee_id: user.id },
                {
                  onSuccess: () => toast.success('ຮັບວຽກນີ້ແລ້ວ'),
                  onError: (error) => void toastApiError(error, 'ຮັບວຽກບໍ່ສຳເລັດ'),
                },
              )
            }
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            ຮັບວຽກນີ້
          </Button>
        )}

        {/*
          มอบหมายให้คนอื่น — backend ส่ง can.assign มาเป็นจริงเฉพาะหัวหน้าทีมกับผู้ดูแล
          คนที่รับงานเองได้ด้วยจะเห็นปุ่มรับงานก่อน แล้วแผงนี้พับอยู่ข้างล่าง
        */}
        {can.assign && <AssignPanel ticket={ticket} />}

        {can.change_status && <StatusChanger ticket={ticket} />}

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

        {/*
          แผงให้คะแนนและปุ่มเปิดคืนเป็นของผู้แจ้ง — backend ส่ง close_own / reopen มาให้
          เฉพาะผู้แจ้งอยู่แล้ว หน้านี้จึงไม่ต้องเดาเองจาก change_status อีก
          (เดิมเดาว่า "ไม่มีช่องเปลี่ยนสถานะ = เป็นผู้แจ้ง" แล้วเจ้าหน้าที่เลยเห็นแผงให้คะแนน
          ตอนเรื่องเป็น resolved เพราะช่องเปลี่ยนสถานะหายไปพอดี)
          เจ้าหน้าที่ปิดเรื่องหรือเปิดคืนผ่านช่องเปลี่ยนสถานะด้านบน
        */}
        {can.close_own && <CloseOwnTicket ticketId={ticket.id} />}
        {can.reopen && <ReopenTicket ticketId={ticket.id} />}
      </CardBody>
    </Card>
  );
}

/**
 * ความยาวขั้นต่ำของเหตุผล แยกตามปลายทาง
 *
 * ⚠️ ตัวเลขทุกตัวลอกจาก ChangeTicketStatusUseCase ฝั่ง backend ตรง ๆ
 *    (MIN_PENDING_REASON=10 · MIN_CANCEL_REASON=5 ซึ่งใช้กับทั้ง cancelled และ rejected)
 *    ถ้าฝั่งนี้ตั้งสูงกว่า ผู้ใช้จะถูกบังคับเกินจำเป็น ถ้าตั้งต่ำกว่า จะกดบันทึกแล้วเด้ง 422
 *
 * pending_vendor ต้องมีเหตุผลด้วย แม้นาฬิกาจะไม่หยุด — ผู้แจ้งยังต้องรู้ว่ารออะไรอยู่
 */
const MIN_REASON: Partial<Record<TicketStatus, number>> = {
  pending_user: 10,
  pending_vendor: 10,
  pending_approval: 10,
  cancelled: 5,
  rejected: 5,
};
const MIN_RESOLUTION_NOTE = 15;

/**
 * เปลี่ยนสถานะของเจ้าหน้าที่ — บันทึกจริงผ่าน POST /tickets/{id}/status
 *
 * ตัวเลือกมาจาก available_transitions ที่ backend คำนวณด้วยกฎชุดเดียวกับตอนบันทึก
 * เดิมแสดงทั้ง 7 สถานะแล้วไม่ได้บันทึกอะไรเลย สถานะบนหน้าผู้แจ้งจึงไม่เคยเปลี่ยน
 *
 * ช่องที่ต้องกรอกเปลี่ยนตามปลายทาง — พักต้องบอกว่ารออะไร แก้เสร็จต้องบันทึกวิธีแก้
 * ยกเลิกและเปิดคืนต้องมีเหตุผล (ขั้นต่ำตรงกับ ChangeTicketStatusUseCase)
 */
function StatusChanger({ ticket }: { ticket: TicketDetail }): React.JSX.Element | null {
  const changeStatus = useChangeTicketStatus();
  const [to, setTo] = React.useState<TicketStatus | ''>('');
  const [reason, setReason] = React.useState('');
  const [resolution, setResolution] = React.useState('');
  const [comment, setComment] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // มีคนอื่นเปลี่ยนสถานะไปก่อน — ตัวเลือกเดิมอาจใช้ไม่ได้แล้ว เริ่มใหม่จากสถานะล่าสุด
  React.useEffect(() => {
    setTo('');
    setErrors({});
  }, [ticket.status]);

  const options = ticket.available_transitions ?? [];
  if (options.length === 0) return null;

  /*
   * เปิดเรื่องคืน — จากเรื่องที่ทีมงานทำจบแล้วหรือปิดไปแล้ว กลับมาดำเนินการต่อ
   *
   * incident จบที่ resolved ส่วน service_request จบที่ fulfilled จึงถามผ่าน isDoneStatus
   * ไม่ใช่เทียบกับ 'resolved' ตรง ๆ ซึ่งจะทำให้คำขอบริการที่ส่งมอบแล้วขอเหตุผล
   * สั้นกว่าที่ backend บังคับ แล้วผู้ใช้โดนปฏิเสธตอนกดบันทึกโดยไม่มีอะไรเตือนก่อน
   */
  const reopening = (isDoneStatus(ticket.status) || ticket.status === 'closed') && to === 'in_progress';
  const minReason = reopening ? MIN_REOPEN_REASON : to ? (MIN_REASON[to] ?? 0) : 0;
  /*
   * ช่องสรุปงานโผล่ทั้ง resolved และ fulfilled แต่ "บังคับ" เฉพาะ resolved
   *
   * ตรงกับ backend: fulfilled รับ resolution_note ได้แต่ไม่บังคับ เพราะคำขอบริการ
   * ส่วนใหญ่มี checklist ตาม SOP คุมอยู่แล้วว่าทำอะไรครบบ้าง
   * ถ้าฝั่งนี้บังคับด้วย เจ้าหน้าที่จะติดอยู่หน้าฟอร์มทั้งที่เซิร์ฟเวอร์ยอมรับ
   */
  const showResolutionNote = to !== '' && isDoneStatus(to);
  const resolutionRequired = to === 'resolved';
  const reasonLabel = reopening
    ? 'ຍັງພົບບັນຫາຫຍັງ'
    : to === 'cancelled'
      ? 'ເຫດຜົນທີ່ຍົກເລີກ'
      : to === 'rejected'
        ? 'ເຫດຜົນທີ່ບໍ່ອະນຸມັດ'
        : 'ລໍຖ້າຫຍັງ ແລະ ຄາດວ່າຈະໄດ້ເມື່ອໃດ';

  function reset(): void {
    setTo('');
    setReason('');
    setResolution('');
    setComment('');
    setErrors({});
  }

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (!to || changeStatus.isPending) return;

    changeStatus.mutate(
      {
        id: ticket.id,
        to_status: to,
        ...(minReason > 0 ? { reason: reason.trim() } : {}),
        // fulfilled ส่งเฉพาะตอนที่พิมพ์จริง — ส่งสตริงว่างไปไม่มีความหมายในประวัติ
        ...(showResolutionNote && (resolutionRequired || resolution.trim())
          ? { resolution_note: resolution.trim() }
          : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      },
      {
        onSuccess: (updated) => {
          toast.success(`ປ່ຽນສະຖານະເປັນ “${statusLabel(updated.status)}” ແລ້ວ`);
          reset();
        },
        onError: (error) => setErrors(toastApiError(error, 'ປ່ຽນສະຖານະບໍ່ສຳເລັດ') ?? {}),
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="ປ່ຽນສະຖານະ" htmlFor="status-change" error={errors.to_status}>
        <Select
          value={to}
          onChange={(e) => {
            setTo(e.target.value as TicketStatus | '');
            setErrors({});
          }}
        >
          <option value="">— ປັດຈຸບັນ: {statusLabel(ticket.status)} —</option>
          {options.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </Select>
      </Field>

      {/*
        เดิมมีช่อง "ລໍຖ້າຈາກໃຜ" ให้เลือกจาก 3 ค่า (ผู้แจ้ง / ผู้ขาย / อนุมัติ) — ถอดออกแล้ว

        ตอนนั้นจำเป็นเพราะสถานะเดียว (pending_user) ต้องแบกความหมายทั้งสามแบบ
        ตอนนี้แต่ละแบบเป็นสถานะของตัวเอง การถามซ้ำจึงเปิดช่องให้เลือกขัดกันเอง
        เช่นสถานะ "ລໍຖ້າຜູ້ແຈ້ງ" คู่กับเหตุผล "ລໍຖ້າອະນຸມັດ" ซึ่งอ่านย้อนหลังแล้วไม่รู้ว่าอันไหนจริง
        backend ก็ถอด CHECK ที่บังคับคอลัมน์นี้ออกแล้วเช่นกัน สิ่งที่ยังบังคับคือ reason ด้านล่าง
      */}
      {minReason > 0 && (
        <Field
          label={reasonLabel}
          htmlFor="status-reason"
          required
          error={errors.reason}
          hint={`ຢ່າງໜ້ອຍ ${minReason} ຕົວອັກສອນ · ບັນທຶກໃນປະຫວັດ`}
        >
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}

      {showResolutionNote && (
        <Field
          // คำขอบริการไม่มี "วิธีแก้ไข" เพราะไม่มีปัญหาให้แก้ — มีแต่สิ่งที่ส่งมอบ
          label={to === 'fulfilled' ? 'ສິ່ງທີ່ສົ່ງມອບ' : 'ວິທີແກ້ໄຂ'}
          htmlFor="resolution-note"
          required={resolutionRequired}
          error={errors.resolution_note}
          hint={
            resolutionRequired
              ? `ຢ່າງໜ້ອຍ ${MIN_RESOLUTION_NOTE} ຕົວອັກສອນ · ຜູ້ແຈ້ງຈະເຫັນ`
              : 'ບໍ່ບັງຄັບ · ຖ້າພິມ ຜູ້ແຈ້ງຈະເຫັນ'
          }
        >
          <Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} />
        </Field>
      )}

      {to && (
        <>
          <Field
            label="ຂໍ້ຄວາມເຖິງຜູ້ແຈ້ງ (ບໍ່ບັງຄັບ)"
            htmlFor="status-comment"
            hint="ຖ້າພິມ ລະບົບສ້າງຄອມເມັນທີ່ຜູ້ແຈ້ງເຫັນໃຫ້"
          >
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" loading={changeStatus.isPending}>
              ບັນທຶກສະຖານະ
            </Button>
            <Button type="button" variant="ghost" onClick={reset} disabled={changeStatus.isPending}>
              ຍົກເລີກ
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

/*
 * CloseOwnTicket กับ ReopenTicket (ปุ่มของผู้แจ้ง) ย้ายไป components/tickets/owner-actions.tsx
 * เพราะหน้าประวัติการแจ้งใช้ตัวเดียวกัน — ผู้แจ้งให้คะแนนและยืนยันปิดจากหน้านั้นได้ด้วย
 */

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
          {/*
            ເຫດຜົນຍ່ອຍເປັນຂໍ້ຄວາມອິດສະຫຼະແລ້ວ — ແປໄດ້ກໍ່ແປ ແປບໍ່ໄດ້ກໍ່ສະແດງຕາມທີ່ມາ
            ກົດດຽວກັບ StatusBadge ໃນ components/common/badges.tsx
          */}
          {ticket.pending_reason && (
            <DefRow label="ລໍຖ້າຫຍັງຢູ່">
              {ticket.pending_reason in PENDING_REASON
                ? PENDING_REASON[ticket.pending_reason as keyof typeof PENDING_REASON]
                : ticket.pending_reason}
            </DefRow>
          )}
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
