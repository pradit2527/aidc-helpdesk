'use client';

import { Star } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useRateChat, type ChatLinkedTicket } from '@/lib/queries/support-chat';

const SCORE_LABEL: Record<number, string> = {
  1: 'ບໍ່ພໍໃຈຫຼາຍ',
  2: 'ບໍ່ພໍໃຈ',
  3: 'ພໍໃຊ້ໄດ້',
  4: 'ພໍໃຈ',
  5: 'ພໍໃຈຫຼາຍ',
};

/**
 * การ์ดให้คะแนนในห้องแชท — ขึ้นเมื่อเรื่องที่ยกระดับจากแชทนี้แก้เสร็จแล้ว
 *
 * กดดาวครั้งเดียวคือส่งเลย (ผู้ใช้ขอให้ "กดให้คะแนนได้เลยในแชท") คะแนนลงที่เรื่อง
 * คอลัมน์เดียวกับปุ่มยืนยันปิดบนหน้าเรื่อง จึงนับเข้า KPI เหมือนกันทุกประการ
 *
 * เรื่องที่ยังรอยืนยัน การกดดาว = ยืนยันว่าแก้แล้ว เรื่องจะปิดไปพร้อมกัน
 * การ์ดบอกไว้ตรง ๆ และมีทางไปเปิดเรื่องคืนสำหรับคนที่ยังมีปัญหา
 */
export function ChatRatingCard({
  chatId,
  ticket,
}: {
  chatId: number;
  ticket: ChatLinkedTicket;
}): React.JSX.Element {
  const rate = useRateChat(chatId);
  const [hover, setHover] = React.useState<number | null>(null);
  const awaitingConfirm = ticket.status === 'resolved' || ticket.status === 'fulfilled';

  const submit = (score: number): void => {
    rate.mutate(score, {
      onSuccess: () => toast.success('ຂອບໃຈທີ່ໃຫ້ຄະແນນ'),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : 'ສົ່ງຄະແນນບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່'),
    });
  };

  return (
    <section className="space-y-2 bg-primary-subtle px-4 py-3" aria-label="ໃຫ້ຄະແນນການບໍລິການ">
      <div>
        <p className="text-body-sm font-semibold text-ink">
          {awaitingConfirm ? 'ບັນຫາຂອງທ່ານແກ້ໄຂແລ້ວ' : 'ເລື່ອງນີ້ປິດແລ້ວ'} — ພໍໃຈກັບການບໍລິການບໍ?
        </p>
        <p className="text-caption text-ink-3">
          ເລື່ອງ{' '}
          <Link href={`/tickets/${ticket.id}`} className="tabular text-primary hover:underline">
            {ticket.ticket_no}
          </Link>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="flex gap-1"
          role="radiogroup"
          aria-label="ຄະແນນຄວາມພໍໃຈ 1 ຫາ 5"
          onMouseLeave={() => setHover(null)}
        >
          {[1, 2, 3, 4, 5].map((value) => {
            const lit = hover !== null && value <= hover;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={false}
                aria-label={`${value} — ${SCORE_LABEL[value]}`}
                disabled={rate.isPending}
                onMouseEnter={() => setHover(value)}
                onFocus={() => setHover(value)}
                onBlur={() => setHover(null)}
                onClick={() => submit(value)}
                className={cn(
                  'grid h-9 w-9 place-items-center rounded transition-transform',
                  'hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
                  'disabled:cursor-wait disabled:opacity-60',
                )}
              >
                <Star
                  className="h-7 w-7"
                  aria-hidden="true"
                  {...(lit
                    ? { fill: 'currentColor', style: { color: 'var(--primary)' } }
                    : { style: { color: 'var(--border-control)' } })}
                />
              </button>
            );
          })}
        </div>
        <span className="text-caption font-medium text-ink-2" aria-live="polite">
          {rate.isPending ? 'ກຳລັງສົ່ງ...' : hover !== null ? SCORE_LABEL[hover] : 'ກົດດາວເພື່ອໃຫ້ຄະແນນ'}
        </span>
      </div>

      {awaitingConfirm && (
        <p className="text-caption text-ink-3">
          ການໃຫ້ຄະແນນຖືວ່າຢືນຢັນວ່າແກ້ແລ້ວ ແລະ ປິດເລື່ອງ · ຍັງມີບັນຫາ?{' '}
          <Link href={`/tickets/${ticket.id}`} className="text-primary hover:underline">
            ເປີດເລື່ອງຄືນ
          </Link>
        </p>
      )}
    </section>
  );
}
