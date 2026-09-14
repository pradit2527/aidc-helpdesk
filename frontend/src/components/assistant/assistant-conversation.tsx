'use client';

import Link from 'next/link';
import { Bot, Loader2, Send, Square } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PriorityBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { useAssistantChat, type DraftCard } from '@/lib/assistant-chat';
import { cn } from '@/lib/cn';
import { useCreateTicket } from '@/lib/queries/tickets';

/** ตัวอย่างคำถามตอนยังไม่ได้คุย — ช่วยให้คนไม่รู้ว่าถามอะไรได้บ้างเริ่มได้ในคลิกเดียว */
const SUGGESTIONS = [
  'ເຊື່ອມຕໍ່ Wi-Fi ບໍ່ໄດ້ ຕ້ອງເຮັດແນວໃດ',
  'ປຣິ້ນເຕີບໍ່ອອກເອກະສານ',
  'ເລື່ອງທີ່ຂ້ອຍແຈ້ງໄວ້ເຖິງໃສແລ້ວ',
  'ລືມລະຫັດຜ່ານອີເມວ',
];

/**
 * หน้าต่างสนทนากับผู้ช่วย AI — รายการข้อความ + ช่องพิมพ์
 *
 * ใช้ทั้งในหน้า /assistant และแผงแชทลอย ความสูงมาจากกล่องที่ห่อ (h-full)
 * รายการข้อความเลื่อนในตัวเอง ช่องพิมพ์จึงติดล่างเสมอไม่ว่าคุยยาวแค่ไหน
 */
export function AssistantConversation({
  disabled,
  autoFocus = false,
}: {
  disabled: boolean;
  autoFocus?: boolean;
}): React.JSX.Element {
  const { entries, busy, activity, send, stop, patchDraft } = useAssistantChat();
  const [input, setInput] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  /*
   * เลื่อนกล่องข้อความลงล่างสุดเมื่อมีข้อความใหม่
   * เลื่อนเฉพาะกล่องนี้ ไม่ใช้ scrollIntoView ซึ่งเลื่อนทั้งหน้าที่อยู่ข้างหลังแผงแชทไปด้วย
   */
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, activity]);

  const submit = (text: string): void => {
    if (!text.trim() || busy || disabled) return;
    setInput('');
    void send(text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-6 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-subtle text-primary">
              <Bot className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="max-w-md text-body-sm text-ink-2">
              ພິມຄຳຖາມໄດ້ເລີຍ ຫຼື ເລືອກຕົວຢ່າງດ້ານລຸ່ມ · ຢ່າພິມລະຫັດຜ່ານ ຫຼື ລະຫັດ OTP ລົງໃນແຊັດ
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy || disabled}
                  onClick={() => submit(s)}
                  className="min-h-tap rounded-full border border-hair px-3 text-body-sm text-ink-2 hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-4" aria-live="polite">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={cn('flex flex-col gap-2', entry.role === 'user' ? 'items-end' : 'items-start')}
              >
                {(entry.text || entry.role === 'user') && (
                  <div
                    className={cn(
                      'max-w-[88%] whitespace-pre-wrap break-words rounded-lg px-4 py-3 text-body-sm',
                      entry.role === 'user'
                        ? 'bg-primary text-white'
                        : entry.failed
                          ? 'border border-sla-breach/30 bg-sla-breach-bg text-sla-breach'
                          : 'border border-hair bg-surface text-ink',
                    )}
                  >
                    {entry.text}
                  </div>
                )}
                {entry.drafts.map((card, index) => (
                  <DraftTicketCard
                    key={index}
                    card={card}
                    onCreated={(ticket) => patchDraft(entry.id, index, { state: 'created', ticket })}
                    onDismiss={() => patchDraft(entry.id, index, { state: 'dismissed' })}
                  />
                ))}
              </li>
            ))}
            {activity && (
              <li className="flex items-center gap-2 text-caption text-ink-3" role="status">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                {activity}
              </li>
            )}
          </ol>
        )}
      </div>

      <form
        className="flex flex-none items-end gap-2 border-t border-hair bg-surface p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่ · ไม่ส่งระหว่างผสมตัวอักษรของแป้นพิมพ์ภาษา
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit(input);
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="ພິມຄຳຖາມ... (Enter ເພື່ອສົ່ງ)"
          aria-label="ຄຳຖາມເຖິງຜູ້ຊ່ວຍ AI"
          disabled={disabled}
          autoFocus={autoFocus}
          className="flex-1"
        />
        {busy ? (
          <Button type="button" variant="secondary" onClick={stop}>
            <Square className="h-4 w-4" aria-hidden="true" />
            ຢຸດ
          </Button>
        ) : (
          <Button type="submit" disabled={disabled || input.trim().length === 0}>
            <Send className="h-4 w-4" aria-hidden="true" />
            ສົ່ງ
          </Button>
        )}
      </form>
    </div>
  );
}

/**
 * ร่าง ticket ที่ผู้ช่วยเตรียมให้
 *
 * ⚠️ บันทึกเมื่อผู้ใช้กดยืนยันเท่านั้น — ผ่าน POST /tickets เส้นเดียวกับฟอร์มแจ้งเรื่อง
 *    กฎการตรวจข้อมูลและการคำนวณระดับความสำคัญจึงเป็นชุดเดียวกันทุกประการ
 */
function DraftTicketCard({
  card,
  onCreated,
  onDismiss,
}: {
  card: DraftCard;
  onCreated: (ticket: { id: number; no: string }) => void;
  onDismiss: () => void;
}): React.JSX.Element | null {
  const create = useCreateTicket();
  const { draft } = card;

  if (card.state === 'dismissed') return null;

  const confirm = async (): Promise<void> => {
    try {
      const ticket = await create.mutateAsync({
        ticket_type: 'incident',
        subject: draft.subject,
        description: draft.description,
        category_id: draft.category_id,
        impact: draft.impact,
        urgency: draft.urgency,
        channel: 'portal',
      });
      onCreated({ id: ticket.id, no: ticket.ticket_no });
      toast.success(`ສ້າງ Ticket ${ticket.ticket_no} ແລ້ວ`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ສ້າງ Ticket ບໍ່ສຳເລັດ');
    }
  };

  return (
    <div className="w-full max-w-[88%] rounded-lg border border-primary/40 bg-subtle px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption font-semibold text-ink-2">ຮ່າງ Ticket</span>
        <PriorityBadge priority={draft.priority} />
        <span className="text-caption text-ink-3">{draft.category_name}</span>
      </div>
      <p className="mt-2 text-body-sm font-semibold text-ink">{draft.subject}</p>
      <p className="mt-1 whitespace-pre-wrap text-body-sm text-ink-2">{draft.description}</p>

      {card.state === 'created' && card.ticket ? (
        <p className="mt-3 text-body-sm text-sla-ok">
          ສ້າງແລ້ວ —{' '}
          <Link href={`/tickets/${card.ticket.id}`} className="font-semibold underline">
            {card.ticket.no}
          </Link>
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void confirm()} disabled={create.isPending}>
            {create.isPending ? 'ກຳລັງສ້າງ...' : 'ຢືນຢັນສ້າງ Ticket'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss} disabled={create.isPending}>
            ບໍ່ສ້າງ
          </Button>
        </div>
      )}
    </div>
  );
}
