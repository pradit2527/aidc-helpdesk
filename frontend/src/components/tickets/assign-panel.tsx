'use client';

import { ArrowDown, UserCog } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { toastApiError } from '@/components/tickets/owner-actions';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Avatar } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { cn } from '@/lib/cn';
import { useAssignTicket, useTicketAssignees, type TicketAssignee } from '@/lib/queries/tickets';
import type { TicketDetail } from '@/lib/types';

/**
 * มอบหมายเรื่องให้คนในทีม — ของหัวหน้าทีมและผู้ดูแล
 *
 * แสดงเมื่อ backend ส่ง can.assign มาเป็นจริงเท่านั้น หน้าจอไม่ได้ตัดสินเอง
 * ว่าใครเป็นหัวหน้าทีม และไม่ได้กรองรายชื่อเองด้วย — GET /tickets/{id}/assignees
 * คืนเฉพาะคนที่ผู้เรียกมอบหมายให้ได้จริงมาแล้ว ถ้าหน้าจอกรองซ้ำ กติกาจะแตกเป็น
 * สองชุดที่เพี้ยนจากกันทันทีที่ฝั่งใดฝั่งหนึ่งเปลี่ยน
 *
 * ⚠️ ปุ่ม "ຮັບວຽກນີ້" (can.assign_self) เป็นคนละเรื่องกับแผงนี้ และยังอยู่ที่เดิม
 *    คนที่ทำได้ทั้งสองอย่างเห็นปุ่มรับงานก่อน เพราะรับงานเองคือสิ่งที่ทำบ่อยกว่ามาก
 */

/** ขั้นต่ำของเหตุผลตอนเปลี่ยนตัวผู้รับผิดชอบ — ตรงกับที่ backend ตรวจ */
export const MIN_ASSIGN_REASON = 5;

export function AssignPanel({ ticket }: { ticket: TicketDetail }): React.JSX.Element {
  /*
   * พับไว้ก่อนเฉพาะเมื่อมีปุ่มรับงานเองอยู่ด้วย
   *
   * ถ้ามีแต่แผงนี้อย่างเดียว (หัวหน้าที่ไม่ได้รับงานเอง เช่นเรื่องนอกทีมตน)
   * การบังคับให้กดเปิดอีกทีคือขั้นตอนที่ไม่ได้ให้อะไรเลย
   */
  const collapsible = ticket.can.assign_self;
  const [open, setOpen] = React.useState(!collapsible);
  const panelId = `assign-panel-${ticket.id}`;

  if (!collapsible) return <AssignForm ticket={ticket} />;

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <UserCog className="h-4 w-4" aria-hidden="true" />
        ມອບໝາຍໃຫ້ທີມງານ
      </Button>
      {open && (
        <div id={panelId}>
          <AssignForm ticket={ticket} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function AssignForm({
  ticket,
  onDone,
}: {
  ticket: TicketDetail;
  /** เรียกหลังมอบหมายสำเร็จ — ตัวที่พับได้ใช้เก็บแผงกลับ */
  onDone?: (() => void) | undefined;
}): React.JSX.Element {
  const query = useTicketAssignees(ticket.id, true);
  const assign = useAssignTicket();

  const [selected, setSelected] = React.useState<number | null>(null);
  const [comment, setComment] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  /*
   * เปลี่ยนตัวผู้รับผิดชอบต้องบอกเหตุผล — ต่างจากการมอบหมายครั้งแรก
   *
   * เรื่องที่ถูกโยนจากคนหนึ่งไปอีกคนโดยไม่มีบันทึกว่าทำไม คือสิ่งที่ผู้แจ้ง
   * กับหัวหน้าตามย้อนหลังไม่ได้ ส่วนการมอบหมายครั้งแรกไม่มีอะไรให้อธิบาย
   */
  const reassigning = ticket.assignee !== null;
  const currentId = ticket.assignee?.id ?? null;

  const people = query.data ?? [];
  const selectable = people.filter((p) => p.id !== currentId);

  /*
   * ป้าย "ວ່າງທີ່ສຸດ" ติดเฉพาะตอนที่มีความต่างจริง
   *
   * ถ้าทุกคนงานค้างเท่ากัน การติดป้ายให้ทุกคนไม่ได้ช่วยเลือก มีแต่รกสายตา
   * และทำให้ป้ายนี้ถูกมองข้ามตอนที่มันมีความหมายจริง
   */
  const loads = selectable.map((p) => p.open_tickets);
  const lightestLoad =
    loads.length > 1 && Math.min(...loads) < Math.max(...loads) ? Math.min(...loads) : null;

  function clearError(key: string): void {
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (assign.isPending) return;

    const trimmedReason = reason.trim();
    const found: Record<string, string> = {};
    if (selected === null) found.assignee_id = 'ກະລຸນາເລືອກຜູ້ຮັບຜິດຊອບກ່ອນ';
    if (reassigning && trimmedReason.length < MIN_ASSIGN_REASON) {
      found.reason = `ກະລຸນາລະບຸເຫດຜົນຢ່າງໜ້ອຍ ${MIN_ASSIGN_REASON} ຕົວອັກສອນ`;
    }
    if (Object.keys(found).length > 0 || selected === null) {
      setErrors(found);
      return;
    }

    const trimmedComment = comment.trim();
    assign.mutate(
      {
        id: ticket.id,
        assignee_id: selected,
        ...(trimmedComment ? { comment: trimmedComment } : {}),
        ...(trimmedReason ? { reason: trimmedReason } : {}),
      },
      {
        onSuccess: (updated) => {
          toast.success(`ມອບໝາຍໃຫ້ ${updated.assignee?.full_name ?? 'ຜູ້ຮັບຜິດຊອບໃໝ່'} ແລ້ວ`);
          setSelected(null);
          setComment('');
          setReason('');
          setErrors({});
          onDone?.();
        },
        onError: (error) => setErrors(toastApiError(error, 'ມອບໝາຍວຽກບໍ່ສຳເລັດ') ?? {}),
      },
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-3 rounded border border-hair bg-surface p-3"
    >
      <QueryBoundary query={query} loadingLabel="ກຳລັງໂຫຼດລາຍຊື່ທີມງານ">
        {people.length === 0 ? (
          <p className="text-body-sm text-ink-2">
            ຍັງບໍ່ມີສະມາຊິກໃນທີມ — ໃຫ້ຜູ້ດູແລເພີ່ມທີ່ ຕັ້ງຄ່າ › ທີມງານ
          </p>
        ) : (
          <>
            {/*
              fieldset + input[type=radio] จริง ไม่ใช่ div ที่ทำท่าเป็นตัวเลือก
              คีย์บอร์ดจึงเลื่อนด้วยลูกศรและข้ามคนที่ถูกปิดไว้ได้เองตามพฤติกรรมมาตรฐาน
            */}
            <fieldset
              className="min-w-0"
              aria-describedby={errors.assignee_id ? `assign-error-${ticket.id}` : undefined}
            >
              <legend className="mb-1.5 text-label text-ink">
                ເລືອກຜູ້ຮັບຜິດຊອບ{' '}
                <span className="text-sla-breach" aria-hidden="true">
                  *
                </span>
                <span className="sr-only">(ຈຳເປັນ)</span>
              </legend>

              <div className="space-y-2">
                {people.map((person) => (
                  <AssigneeOption
                    key={person.id}
                    person={person}
                    name={`assignee-${ticket.id}`}
                    checked={selected === person.id}
                    isCurrent={person.id === currentId}
                    isLightest={
                      person.id !== currentId &&
                      lightestLoad !== null &&
                      person.open_tickets === lightestLoad
                    }
                    onSelect={() => {
                      setSelected(person.id);
                      clearError('assignee_id');
                    }}
                  />
                ))}
              </div>

              {/* มีแต่ผู้รับผิดชอบคนปัจจุบันในรายการ — บอกให้รู้ว่าไม่ใช่รายการที่โหลดไม่ครบ */}
              {selectable.length === 0 && (
                <p className="mt-1.5 text-caption text-ink-3">
                  ຍັງບໍ່ມີຄົນອື່ນໃນທີມທີ່ມອບໝາຍໃຫ້ໄດ້
                </p>
              )}

              {errors.assignee_id && (
                <p
                  id={`assign-error-${ticket.id}`}
                  role="alert"
                  className="mt-1.5 text-caption text-sla-breach"
                >
                  {errors.assignee_id}
                </p>
              )}
            </fieldset>

            {reassigning && (
              <Field
                label="ເຫດຜົນທີ່ປ່ຽນຜູ້ຮັບຜິດຊອບ"
                htmlFor={`assign-reason-${ticket.id}`}
                required
                error={errors.reason}
                hint={`ຢ່າງໜ້ອຍ ${MIN_ASSIGN_REASON} ຕົວອັກສອນ · ບັນທຶກໃນປະຫວັດ`}
              >
                <Textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    clearError('reason');
                  }}
                />
              </Field>
            )}

            <Field
              label="ຂໍ້ຄວາມເຖິງຜູ້ແຈ້ງ (ບໍ່ບັງຄັບ)"
              htmlFor={`assign-comment-${ticket.id}`}
              error={errors.comment}
              hint="ຖ້າພິມ ລະບົບສ້າງຄອມເມັນທີ່ຜູ້ແຈ້ງເຫັນໃຫ້"
            >
              <Textarea
                rows={2}
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                  clearError('comment');
                }}
              />
            </Field>

            <Button type="submit" className="w-full" loading={assign.isPending}>
              {reassigning ? 'ປ່ຽນຜູ້ຮັບຜິດຊອບ' : 'ມອບໝາຍ'}
            </Button>
          </>
        )}
      </QueryBoundary>
    </form>
  );
}

/**
 * ตัวเลือกหนึ่งคน
 *
 * ภาระงานบอกด้วยตัวเลขและป้าย "ວ່າງທີ່ສຸດ" ที่มีทั้งไอคอนและข้อความ
 * ไม่ใช่สีอย่างเดียว — หน้านี้ต้องอ่านรู้เรื่องในโหมด grayscale เช่นเดียวกับป้ายอื่น
 */
function AssigneeOption({
  person,
  name,
  checked,
  isCurrent,
  isLightest,
  onSelect,
}: {
  person: TicketAssignee;
  name: string;
  checked: boolean;
  isCurrent: boolean;
  isLightest: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <label
      className={cn(
        'flex min-h-tap items-start gap-2.5 rounded border px-3 py-2.5 transition-colors',
        isCurrent
          ? 'cursor-not-allowed border-hair bg-subtle'
          : checked
            ? 'cursor-pointer border-primary bg-primary-subtle'
            : 'cursor-pointer border-hair hover:border-primary',
      )}
    >
      <input
        type="radio"
        name={name}
        value={person.id}
        checked={checked}
        disabled={isCurrent}
        onChange={onSelect}
        className="mt-1.5 h-4 w-4 flex-none border-control"
      />
      <Avatar name={person.full_name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="text-body-sm font-semibold text-ink">{person.full_name}</span>
          {person.is_me && (
            <span className="rounded-sm bg-primary-subtle px-1.5 text-[11px] font-semibold text-primary">
              ຂ້ອຍ
            </span>
          )}
          {person.is_lead && (
            <span className="rounded-sm bg-subtle px-1.5 text-[11px] font-semibold text-ink-2">
              ຫົວໜ້າທີມ
            </span>
          )}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-ink-3">
          <span className="truncate">{person.team?.name ?? 'ບໍ່ສັງກັດທີມ'}</span>
          <span className="tabular">ວຽກຄ້າງ {person.open_tickets}</span>
          {isLightest && (
            <span className="inline-flex items-center gap-0.5 font-semibold text-ink-2">
              <ArrowDown className="h-3 w-3" aria-hidden="true" />
              ວ່າງທີ່ສຸດ
            </span>
          )}
        </span>
      </span>
      {isCurrent && <span className="flex-none text-caption text-ink-3">ຮັບຜິດຊອບຢູ່</span>}
    </label>
  );
}
