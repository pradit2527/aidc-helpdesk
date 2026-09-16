'use client';

import { CheckCircle2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useChangeTicketStatus } from '@/lib/queries/tickets';

/**
 * การกระทำของ "ผู้แจ้ง" ต่อเรื่องที่แก้ไขสำเร็จหรือปิดแล้ว
 *
 * แยกออกมาจากหน้ารายละเอียด เพราะใช้สองที่ — หน้ารายละเอียดเรื่อง และหน้าประวัติการแจ้ง
 * ที่ผู้แจ้งเห็นรายการเรื่องที่แก้ไขสำเร็จแล้วรอตนยืนยัน ถ้าเขียนซ้ำสองชุด
 * วันหนึ่งกฎขั้นต่ำของเหตุผลหรือข้อความยืนยันจะเพี้ยนจากกัน
 *
 * ทั้งสองตัวรับแค่ id ไม่รับ ticket ทั้งก้อน เพราะหน้าประวัติมีเพียง list item
 * ไม่มีรายละเอียดเต็ม และสิ่งเดียวที่คำสั่งต้องใช้จริงคือ id
 *
 * ⚠️ ปุ่มพวกนี้แสดงได้เฉพาะเมื่อ backend บอกว่า can.close_own / can.reopen เป็นจริง
 *    (หน้ารายละเอียด) หรือเมื่อรายการนั้นเป็นเรื่องที่ผู้เรียกแจ้งเอง (หน้าประวัติ
 *    ซึ่งกรอง requester_id=me อยู่แล้ว) — ถ้าเจ้าหน้าที่กด ระบบปฏิเสธคะแนนอยู่ดี
 */

/** ข้อความผิดพลาดจากเซิร์ฟเวอร์ตรง ๆ — "บันทึกไม่สำเร็จ" เฉย ๆ ทำให้ต้องเดาว่าช่องไหนผิด */
export function toastApiError(error: unknown, fallback: string): Record<string, string> | undefined {
  const apiError = error instanceof ApiError ? error : null;
  toast.error(apiError?.message ?? fallback);
  return apiError?.fields;
}

/** ขั้นต่ำของเหตุผลเปิดคืน — ตรงกับ ChangeTicketStatusUseCase ฝั่ง backend */
export const MIN_REOPEN_REASON = 10;

/**
 * ผู้แจ้งยืนยันว่าแก้แล้วจริง พร้อมให้คะแนน (ไม่บังคับ)
 *
 * คะแนนเป็นตัวตั้งของ KPI-4 จึงต้องมาจากผู้แจ้งเท่านั้น — backend ปฏิเสธคะแนน
 * จากคนอื่น และหน้าจอเจ้าหน้าที่ก็ไม่แสดงแผงนี้ (ดู can.close_own ใน tickets.service)
 */
export function CloseOwnTicket({
  ticketId,
  onDone,
}: {
  ticketId: number;
  /** เรียกหลังปิดสำเร็จ — หน้าประวัติใช้พับแผงเก็บ */
  onDone?: () => void;
}): React.JSX.Element {
  const changeStatus = useChangeTicketStatus();
  const [score, setScore] = React.useState<number | null>(null);

  return (
    <div className="space-y-2 rounded border border-hair bg-surface p-3">
      <p className="text-body-sm font-semibold text-ink">ບັນຫາຖືກແກ້ແລ້ວແທ້ບໍ?</p>
      <div className="flex gap-1" role="radiogroup" aria-label="ຄະແນນຄວາມພໍໃຈ">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={score === value}
            onClick={() => setScore(score === value ? null : value)}
            className={cn(
              'tabular grid h-9 flex-1 place-items-center rounded border text-body-sm font-semibold transition-colors',
              score !== null && value <= score
                ? 'border-primary bg-primary-subtle text-primary'
                : 'border-control text-ink-2 hover:border-primary',
            )}
          >
            {value}
          </button>
        ))}
      </div>
      <p className="text-caption text-ink-3">ໃຫ້ຄະແນນ 1–5 (ບໍ່ບັງຄັບ)</p>
      <Button
        className="w-full"
        loading={changeStatus.isPending}
        onClick={() =>
          changeStatus.mutate(
            {
              id: ticketId,
              to_status: 'closed',
              ...(score !== null ? { satisfaction_score: score } : {}),
            },
            {
              onSuccess: () => {
                toast.success('ປິດເລື່ອງແລ້ວ ຂອບໃຈຫຼາຍ');
                onDone?.();
              },
              onError: (error) => void toastApiError(error, 'ປິດເລື່ອງບໍ່ສຳເລັດ'),
            },
          )
        }
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        ຢືນຢັນປິດເລື່ອງ
      </Button>
    </div>
  );
}

/**
 * ผู้แจ้งเปิดเรื่องคืน — ต้องบอกว่ายังพบปัญหาอะไร
 *
 * เปิดคืนได้จากเรื่องที่ "แก้ไขสำเร็จ" ทันที และจากเรื่องที่ "ปิดแล้ว" ภายใน 7 วัน
 * (เกินนั้น backend ปฏิเสธ — หน้าประวัติปิดปุ่มไว้ก่อนพร้อมบอกเหตุผล)
 */
export function ReopenTicket({
  ticketId,
  defaultOpen = false,
  onCancel,
  onDone,
}: {
  ticketId: number;
  /** true = แสดงฟอร์มทันทีโดยไม่ต้องกดปุ่มก่อน — หน้าประวัติมีปุ่มของตัวเองอยู่แล้ว */
  defaultOpen?: boolean;
  onCancel?: () => void;
  onDone?: () => void;
}): React.JSX.Element {
  const changeStatus = useChangeTicketStatus();
  const [open, setOpen] = React.useState(defaultOpen);
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  function close(): void {
    setOpen(false);
    setReason('');
    setError(undefined);
    onCancel?.();
  }

  if (!open) {
    return (
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        ເປີດເລື່ອງຄືນ
      </Button>
    );
  }

  return (
    <form
      className="space-y-2 rounded border border-hair bg-surface p-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        changeStatus.mutate(
          { id: ticketId, to_status: 'in_progress', reason: reason.trim() },
          {
            onSuccess: () => {
              toast.success('ເປີດເລື່ອງຄືນແລ້ວ ທີມງານຈະກວດສອບອີກຄັ້ງ');
              setOpen(false);
              setReason('');
              onDone?.();
            },
            onError: (err) => setError(toastApiError(err, 'ເປີດເລື່ອງຄືນບໍ່ສຳເລັດ')?.reason),
          },
        );
      }}
    >
      <Field
        label="ຍັງພົບບັນຫາຫຍັງ"
        htmlFor={`reopen-reason-${ticketId}`}
        required
        error={error}
        hint={`ຢ່າງໜ້ອຍ ${MIN_REOPEN_REASON} ຕົວອັກສອນ`}
      >
        <Textarea
          id={`reopen-reason-${ticketId}`}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" loading={changeStatus.isPending}>
          ຢືນຢັນເປີດຄືນ
        </Button>
        <Button type="button" variant="ghost" onClick={close} disabled={changeStatus.isPending}>
          ຍົກເລີກ
        </Button>
      </div>
    </form>
  );
}
