'use client';

import { Ticket, TicketPlus, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { PriorityBadge } from '@/components/common/badges';
import { toastApiError } from '@/components/tickets/owner-actions';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { IMPACT_OPTIONS, URGENCY_OPTIONS, previewPriority } from '@/config/enums';
import { ApiError } from '@/lib/api';
import { useActiveCategories } from '@/lib/queries/master-data';
import {
  ATTACHMENT_LABEL,
  useConvertChatToTicket,
  type SupportChatMessage,
  type SupportChatThread,
} from '@/lib/queries/support-chat';
import { useSupportProjects } from '@/lib/queries/support-projects';
import type { TicketCategory, TicketListItem } from '@/lib/types';

/**
 * ยกแชทเป็น Ticket
 *
 * แชทกับ Ticket ทำคนละหน้าที่ — แชทคือการคุย Ticket คือหลักฐานที่นับเวลา SLA
 * เรื่องที่คุยจบในสองบรรทัดไม่ต้องมีใบ แต่เรื่องที่ต้องตามต่อข้ามวันต้องมี
 * เจ้าหน้าที่เป็นคนตัดสินตรงนั้น ระบบจึงไม่ยกให้เองอัตโนมัติ
 *
 * ⚠️ ยกเป็น Ticket แล้วแชทไม่ปิด
 *    ผู้ใช้ที่กำลังพิมพ์อยู่ไม่ควรโดนตัดบทสนทนาเพราะเจ้าหน้าที่กดปุ่มในระบบหลังบ้าน
 *    ช่องพิมพ์จึงทำงานต่อตามปกติ และสถานะของใบจะไหลกลับเข้ามาในแชทเป็นข้อความระบบ
 */

/** ตรงกับที่ backend รับ — ตรวจฝั่งหน้าจอเพื่อบอกเร็ว ไม่ใช่เพื่อกัน */
const SUBJECT_MIN = 5;
const SUBJECT_MAX = 200;

/** ตัดหัวข้อที่เดาให้พออ่านในบรรทัดเดียว — ยาวกว่านี้ผู้ใช้ต้องเลื่อนอ่านในช่องกรอก */
const SUBJECT_GUESS_MAX = 120;

/**
 * เพดานความยาวของบทสนทนาที่แนบไปเป็นรายละเอียด
 *
 * ห้องที่คุยกันมาทั้งวันยาวเกินกว่าที่ช่องรายละเอียดจะรับไหว และคนอ่านใบก็ไม่ได้
 * ต้องการทุกบรรทัด — เก็บช่วงต้นซึ่งเป็นตอนที่ผู้แจ้งเล่าอาการไว้ แล้วบอกตรง ๆ
 * ว่าตัดออก พร้อมชี้ว่าบทสนทนาเต็มยังอยู่ในกล่องแชท
 *
 * ตัวเลขเดียวกับที่ backend ใช้ตอนถอดบทสนทนาเอง สองทางจึงได้ผลยาวเท่ากัน
 */
const TRANSCRIPT_MAX = 4000;

const transcriptTime = new Intl.DateTimeFormat('lo-LA', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * หมวดหมู่ปลายกิ่งที่ยังเปิดใช้เท่านั้น
 *
 * เหตุผลเดียวกับในหน้าตั้งค่าโครงการ — หมวดที่มีลูกเป็นแค่หัวข้อจัดกลุ่ม
 * เลือกไปแล้วกฎ SLA ที่ผูกกับหมวดปลายกิ่งจะไม่ถูกใช้
 */
function leafCategories(categories: readonly TicketCategory[]): { id: number; label: string }[] {
  const hasChild = new Set(
    categories.map((c) => c.parent_id).filter((id): id is number => id !== null),
  );
  const nameById = new Map(categories.map((c) => [c.id, c.name_th]));

  return categories
    .filter((c) => c.is_active && !hasChild.has(c.id))
    .map((c) => {
      const parent = c.parent_id === null ? null : nameById.get(c.parent_id);
      return { id: c.id, label: parent ? `${parent} › ${c.name_th}` : c.name_th };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'lo'));
}

/** เดาหัวข้อจากสิ่งแรกที่ผู้แจ้งพิมพ์ — เดาผิดก็แก้ได้ แต่ส่วนใหญ่ประโยคแรกคือปัญหา */
function guessSubject(messages: readonly SupportChatMessage[]): string {
  const first = messages.find((m) => !m.is_system && !m.from_staff && m.body.trim() !== '');
  const text = (first?.body ?? '').replace(/\s+/g, ' ').trim();
  return text.length > SUBJECT_GUESS_MAX ? `${text.slice(0, SUBJECT_GUESS_MAX - 1)}…` : text;
}

/**
 * บทสนทนาที่จะกลายเป็นรายละเอียดของใบ
 *
 * ข้อความที่มีแต่ไฟล์แนบเขียนเป็นป้ายบอกชนิดไฟล์ ไม่ใช่บรรทัดว่าง — คนอ่านใบ
 * ต้องรู้ว่าตรงนั้นมีรูปหน้าจออยู่ แล้วกลับไปเปิดดูในแชทได้
 */
function buildTranscript(chat: SupportChatThread): string {
  const lines = chat.messages
    .filter((m) => !m.is_system)
    .map((m) => {
      const who = m.from_staff ? 'ທີມໄອທີ' : (m.sender?.full_name ?? chat.requester.full_name);
      const body =
        m.body.trim() || (m.attachment ? `[${ATTACHMENT_LABEL[m.attachment.kind]}]` : '');
      return `[${transcriptTime.format(new Date(m.created_at))}] ${who}: ${body}`;
    });

  const head = `— ບົດສົນທະນາຈາກແຊັດ #${chat.id} —`;
  const body = lines.join('\n');
  const trimmed =
    body.length > TRANSCRIPT_MAX
      ? `${body.slice(0, TRANSCRIPT_MAX)}\n… (ຕັດສ່ວນທີ່ຍາວເກີນອອກ — ບົດສົນທະນາເຕັມຢູ່ໃນກ່ອງແຊັດ)`
      : body;

  return lines.length === 0 ? `${head}\n(ຍັງບໍ່ມີຂໍ້ຄວາມໃນແຊັດນີ້)` : `${head}\n${trimmed}`;
}

/**
 * ปุ่มยกเป็น Ticket / ลิงก์ไปใบที่ผูกไว้แล้ว — อันเดียวกันคนละสถานะ
 *
 * ห้องหนึ่งผูกได้ใบเดียว พอผูกแล้วสิ่งที่เจ้าหน้าที่ต้องการคือ "ไปดูใบนั้น"
 * ไม่ใช่ปุ่มสร้างซ้ำ จึงสลับเป็นลิงก์ไปเลย ไม่ใช่ปุ่มที่กดแล้วได้ 409
 *
 * ⚠️ วางไว้ในหัวห้องแชทเท่านั้น — ตัวคอมโพเนนต์เก็บเลขที่ใบที่เพิ่งสร้างไว้เอง
 *    ผู้เรียกต้องใส่ key={chat.id} มิฉะนั้นเลขที่ของห้องก่อนหน้าจะค้างข้ามห้อง
 */
export function ChatTicketAction({
  chat,
  canConvert,
}: {
  chat: SupportChatThread;
  /** ใช้สิทธิ์ชุดเดียวกับปุ่มปิดแชท — backend ตัดสินซ้ำทุกคำขออยู่แล้ว */
  canConvert: boolean;
}): React.JSX.Element | null {
  const [open, setOpen] = React.useState(false);
  /* เลขที่ใบมีเฉพาะตอนที่เพิ่งสร้างจากหน้าจอนี้ — ห้องที่โหลดมามีแค่ id ของใบ */
  const [created, setCreated] = React.useState<TicketListItem | null>(null);

  const ticketId = chat.ticket_id ?? created?.id ?? null;

  if (ticketId !== null) {
    return (
      <Button asChild variant="secondary" size="sm">
        <Link href={`/tickets/${ticketId}`}>
          <Ticket className="h-4 w-4" aria-hidden="true" />
          {created ? `Ticket ${created.ticket_no}` : 'ເປີດ Ticket ທີ່ຜູກໄວ້'}
        </Link>
      </Button>
    );
  }

  if (!canConvert) return null;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <TicketPlus className="h-4 w-4" aria-hidden="true" />
        ຍົກເປັນ Ticket
      </Button>
      {open && (
        <ConvertDialog chat={chat} onClose={() => setOpen(false)} onConverted={setCreated} />
      )}
    </>
  );
}

interface FormValues {
  subject: string;
  category_id: string;
  impact: string;
  urgency: string;
  description: string;
}

/**
 * กล่องยกเป็น Ticket
 *
 * เจ้าหน้าที่กำลังคุยอยู่กลางคัน กล่องนี้จึงต้องกดจบได้ในไม่กี่วินาที — ทุกช่อง
 * เติมค่าให้ล่วงหน้าแล้ว สิ่งเดียวที่ต้องอ่านจริง ๆ คือหัวข้อ ส่วนบทสนทนาที่จะ
 * แนบไปพับเก็บไว้ ใครอยากแก้ค่อยกางออก
 */
function ConvertDialog({
  chat,
  onClose,
  onConverted,
}: {
  chat: SupportChatThread;
  onClose: () => void;
  onConverted: (ticket: TicketListItem) => void;
}): React.JSX.Element {
  const convert = useConvertChatToTicket(chat.id);
  const categories = useActiveCategories();
  const projects = useSupportProjects();

  const [values, setValues] = React.useState<FormValues>(() => ({
    subject: guessSubject(chat.messages),
    category_id: '',
    impact: 'individual',
    urgency: 'medium',
    description: buildTranscript(chat),
  }));
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const subjectRef = React.useRef<HTMLInputElement | null>(null);
  /* เติมหมวดตั้งต้นของโครงการได้ครั้งเดียว — หลังจากนั้นเป็นของผู้ใช้แล้ว */
  const prefilled = React.useRef(false);

  const saving = convert.isPending;
  const categoryOptions = React.useMemo(
    () => leafCategories(categories.data ?? []),
    [categories.data],
  );

  React.useEffect(() => {
    window.setTimeout(() => subjectRef.current?.focus(), 0);
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]): void => {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  /** เลือกหมวดแล้วดึงค่าตั้งต้นของหมวดนั้นมาด้วย เหมือนฟอร์มเปิดเรื่องใหม่ */
  const pickCategory = React.useCallback(
    (id: string): void => {
      const category = (categories.data ?? []).find((c) => String(c.id) === id);
      setValues((v) => ({
        ...v,
        category_id: id,
        ...(category ? { impact: category.default_impact, urgency: category.default_urgency } : {}),
      }));
    },
    [categories.data],
  );

  /*
   * หมวดตั้งต้นของโครงการอยู่ในรายการโครงการ ไม่ได้ติดมากับห้องแชท
   * (ห้องส่งมาแค่ id/รหัส/ชื่อ) — รายการนี้ถูกดึงไว้แล้วตั้งแต่เปิดกล่องแชท
   * จึงมักมาถึงก่อนผู้ใช้จะอ่านหัวข้อจบ ไม่ใช่การรอเพิ่ม
   */
  const projectCategoryId = React.useMemo(() => {
    if (!chat.project) return null;
    const project = (projects.data ?? []).find((p) => p.id === chat.project?.id);
    return project?.default_category?.id ?? null;
  }, [projects.data, chat.project]);

  // หมวดที่ถูกปิดไปแล้วหรือมีหมวดย่อยจะไม่อยู่ในตัวเลือก — เติมไปก็กลายเป็นค่าที่เลือกไม่ได้
  const prefillCategoryId =
    projectCategoryId !== null && categoryOptions.some((o) => o.id === projectCategoryId)
      ? projectCategoryId
      : null;

  /*
   * ไม่มีหมวดตั้งต้นให้พึ่ง = ต้องเลือกเอง
   * backend ตอบ 422 ถ้าไม่ได้ทั้งค่าที่ส่งมาและค่าตั้งต้นของโครงการ — บอกตั้งแต่ตอนกรอก
   * ดีกว่าปล่อยให้กดสร้างแล้วเด้งกลับมาพร้อมข้อความที่อ่านแล้วไม่รู้ว่าต้องไปแก้ตรงไหน
   */
  const categoryRequired = projectCategoryId === null;

  React.useEffect(() => {
    if (prefilled.current || prefillCategoryId === null) return;
    prefilled.current = true;
    pickCategory(String(prefillCategoryId));
  }, [prefillCategoryId, pickCategory]);

  const priority = previewPriority(values.impact, values.urgency);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    const subject = values.subject.trim();
    if (subject.length < SUBJECT_MIN) {
      setFieldErrors({ subject: `ຫົວຂໍ້ຕ້ອງຍາວຢ່າງໜ້ອຍ ${SUBJECT_MIN} ຕົວອັກສອນ` });
      subjectRef.current?.focus();
      return;
    }
    if (categoryRequired && values.category_id === '') {
      setFieldErrors({ category_id: 'ກະລຸນາເລືອກໝວດໝູ່ຂອງເລື່ອງນີ້' });
      return;
    }

    const description = values.description.trim();
    try {
      const result = await convert.mutateAsync({
        subject,
        ...(description ? { description } : {}),
        ...(values.category_id ? { category_id: Number(values.category_id) } : {}),
        impact: values.impact,
        urgency: values.urgency,
      });
      toast.success(`ຍົກເປັນ Ticket ${result.ticket.ticket_no} ແລ້ວ — ແຊັດຍັງເປີດຢູ່ຄືເກົ່າ`);
      onConverted(result.ticket);
      onClose();
    } catch (err) {
      setFieldErrors(toastApiError(err, 'ຍົກເປັນ Ticket ບໍ່ສຳເລັດ') ?? {});
      // ห้องถูกยกไปแล้วโดยคนอื่น — กล่องนี้ทำอะไรต่อไม่ได้ ปิดไปให้เห็นลิงก์ของใบที่มีอยู่
      if (err instanceof ApiError && err.status === 409) onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="convert-chat-title"
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-lg border border-hair bg-surface shadow-dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-hair px-5 py-4">
          <div className="min-w-0">
            <h2 id="convert-chat-title" className="text-h3 font-semibold text-ink">
              ຍົກເປັນ Ticket
            </h2>
            <p className="mt-0.5 text-caption text-ink-3">
              ແຊັດກັບ {chat.requester.full_name} — ສ້າງແລ້ວແຊັດຍັງເປີດຢູ່ ຕອບຕໍ່ໄດ້ຕາມປົກກະຕິ
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving} type="button">
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">ປິດ</span>
          </Button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <Field
              label="ຫົວຂໍ້"
              htmlFor="convert-subject"
              required
              error={fieldErrors.subject}
              hint="ເຕີມໃຫ້ຈາກຂໍ້ຄວາມທຳອິດຂອງຜູ້ແຈ້ງ — ແກ້ໄດ້ຕາມໃຈ"
            >
              <Input
                ref={subjectRef}
                value={values.subject}
                onChange={(e) => set('subject', e.target.value)}
                maxLength={SUBJECT_MAX}
                disabled={saving}
                placeholder="ສະຫຼຸບບັນຫາໃນແຖວດຽວ"
              />
            </Field>

            <Field
              label="ໝວດໝູ່"
              htmlFor="convert-category"
              required={categoryRequired}
              error={fieldErrors.category_id}
              hint={
                categoryRequired
                  ? 'ບໍ່ມີໝວດຕັ້ງຕົ້ນໃຫ້ໃຊ້ — ເລືອກເອງກ່ອນສ້າງ'
                  : `ເຕີມໃຫ້ຈາກຄ່າຕັ້ງຕົ້ນຂອງໂຄງການ ${chat.project?.code ?? ''}`
              }
            >
              <Select
                value={values.category_id}
                onChange={(e) => {
                  prefilled.current = true;
                  pickCategory(e.target.value);
                }}
                disabled={saving}
              >
                <option value="">{categoryRequired ? '— ເລືອກໝວດໝູ່ —' : '— ໃຊ້ຄ່າຕັ້ງຕົ້ນຂອງໂຄງການ —'}</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ຜົນກະທົບ" htmlFor="convert-impact" error={fieldErrors.impact}>
                <Select
                  value={values.impact}
                  onChange={(e) => set('impact', e.target.value)}
                  disabled={saving}
                >
                  {IMPACT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="ຄວາມຮີບດ່ວນ" htmlFor="convert-urgency" error={fieldErrors.urgency}>
                <Select
                  value={values.urgency}
                  onChange={(e) => set('urgency', e.target.value)}
                  disabled={saving}
                >
                  {URGENCY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* ระดับที่แสดงเป็นตัวอย่างเท่านั้น ค่าจริงยึดจากที่ backend ส่งกลับ — เหมือนฟอร์มเปิดเรื่องใหม่ */}
            {priority && (
              <div className="flex flex-wrap items-center gap-2 rounded border border-primary/30 bg-primary-subtle px-3 py-2">
                <span className="text-caption text-ink-2">ລະດັບທີ່ຄຳນວນໄດ້</span>
                <PriorityBadge priority={priority} withMeter={false} />
              </div>
            )}

            {/*
              บทสนทนาที่จะแนบ — พับไว้โดยตั้งใจ
              เจ้าหน้าที่เพิ่งอ่านมันจบไปเมื่อกี้ทั้งห้อง การบังคับให้อ่านซ้ำก่อนกดปุ่ม
              คือการเพิ่มขั้นตอนโดยไม่เพิ่มความถูกต้อง แต่คนที่อยากตัดหรือเพิ่มบริบท
              ต้องทำได้ในที่เดียวกัน ไม่ใช่ไปแก้ทีหลังในใบ
            */}
            <details className="rounded border border-hair">
              <summary className="min-h-tap cursor-pointer list-none px-3 py-2 text-body-sm font-semibold text-ink">
                ເບິ່ງຂໍ້ຄວາມທີ່ຈະແນບເປັນລາຍລະອຽດ
              </summary>
              <div className="border-t border-hair px-3 py-3">
                <label htmlFor="convert-description" className="sr-only">
                  ລາຍລະອຽດຂອງ Ticket
                </label>
                {/* ห้ามลดขนาดตัวอักษรของช่องกรอกลงต่ำกว่า 16px — iOS จะซูมหน้าเองตอนโฟกัส (ดู field.tsx) */}
                <Textarea
                  id="convert-description"
                  rows={8}
                  value={values.description}
                  onChange={(e) => set('description', e.target.value)}
                  disabled={saving}
                />
                {fieldErrors.description && (
                  <p className="mt-1 text-caption text-sla-breach" role="alert">
                    {fieldErrors.description}
                  </p>
                )}
                <p className="mt-1 text-caption text-ink-3">
                  ບົດສົນທະນານີ້ຈະກາຍເປັນລາຍລະອຽດຂອງ Ticket — ລຶບໃຫ້ວ່າງໄດ້
                  ລະບົບຈະປະກອບໃຫ້ເອງ
                </p>
              </div>
            </details>
          </div>

          <div className="flex justify-end gap-2 border-t border-hair px-5 py-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              ຍົກເລີກ
            </Button>
            <Button type="submit" loading={saving}>
              <TicketPlus className="h-4 w-4" aria-hidden="true" />
              ສ້າງ Ticket
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
