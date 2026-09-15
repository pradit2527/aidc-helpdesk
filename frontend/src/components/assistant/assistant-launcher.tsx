'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Maximize2, RotateCcw, X } from 'lucide-react';
import * as React from 'react';

import { AssistantConversation } from '@/components/assistant/assistant-conversation';
import { useT } from '@/components/layout/preference-controls';
import { useAssistantStatus } from '@/lib/assistant';
import { useAssistantChat } from '@/lib/assistant-chat';
import { cn } from '@/lib/cn';

/**
 * ปุ่มแชทผู้ช่วย AI ลอยมุมขวาล่าง — มีทุกหน้าหลังล็อกอิน
 *
 * ตำแหน่งหลบของที่ลอยอยู่แล้วในแต่ละขนาดจอ (ดู AppShell):
 *   - จอมือถือ (< sm)  ปุ่มแจ้งปัญหาลอยอยู่ที่ bottom 76px → วางเหนือขึ้นไป
 *   - แท็บเล็ต (< lg)  แถบเมนูล่างสูง ~58px → วางเหนือแถบ
 *   - จอใหญ่           ไม่มีอะไรลอย → มุมขวาล่างปกติ
 *
 * ปุ่มแชทของ Chatwoot (เมื่อเปิดใช้) อยู่มุมขวาสุดที่ระดับเดียวกัน
 * ปุ่มนี้จึงขยับไปทางซ้ายให้พ้นกัน แทนที่จะซ้อนทับจนกดอันล่างไม่ได้
 */
export function AssistantLauncher(): React.JSX.Element | null {
  const pathname = usePathname();
  const t = useT();
  const status = useAssistantStatus();
  const { busy, entries, reset } = useAssistantChat();
  const [open, setOpen] = React.useState(false);

  /*
   * แสดงเฉพาะเมื่อ backend ยืนยันว่าเปิดใช้ AI แล้ว
   *
   * ระบบใช้ Chatwoot เป็นช่องแชทหลักกับทีมไอที ปุ่ม AI ที่พิมพ์อะไรไม่ได้
   * วางข้างปุ่มแชท Chatwoot มีแต่ทำให้ผู้ใช้กดผิดปุ่มแล้วคิดว่าแชทเสีย
   */
  const enabled = status.data?.enabled === true;

  // Esc ปิดแผง — ผู้ใช้คีย์บอร์ดต้องออกจากแผงที่บังเนื้อหาได้โดยไม่ต้องหาปุ่มปิด
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // หน้า /assistant คือหน้าต่างแชทเต็มจออยู่แล้ว ปุ่มลอยซ้ำจะเปิดบทสนทนาเดียวกันซ้อนตัวเอง
  if (!enabled || pathname === '/assistant') return null;

  const title = t('nav.assistant');

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label={title}
          className={cn(
            'fixed inset-0 z-50 flex flex-col overflow-hidden bg-page',
            'sm:inset-auto sm:bottom-[148px] sm:right-4 sm:h-[min(620px,calc(100dvh-180px))] sm:w-[400px] sm:rounded-lg sm:border sm:border-hair sm:shadow-dialog',
            'lg:bottom-[92px] lg:right-6 lg:h-[min(640px,calc(100dvh-120px))]',
          )}
        >
          <header className="flex flex-none items-center gap-2 border-b border-hair bg-surface px-3 py-2">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-subtle text-primary">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="min-w-0 flex-1 truncate text-body-sm font-semibold text-ink">{title}</h2>
            <button
              type="button"
              onClick={reset}
              disabled={entries.length === 0}
              aria-label="ເລີ່ມບົດສົນທະນາໃໝ່"
              title="ເລີ່ມບົດສົນທະນາໃໝ່"
              className="grid h-tap w-tap place-items-center rounded text-ink-2 hover:bg-subtle disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
            <Link
              href="/assistant"
              onClick={() => setOpen(false)}
              aria-label="ເປີດເຕັມໜ້າ"
              title="ເປີດເຕັມໜ້າ"
              className="hidden h-tap w-tap place-items-center rounded text-ink-2 hover:bg-subtle sm:grid"
            >
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('action.closeMenu')}
              className="grid h-tap w-tap place-items-center rounded text-ink-2 hover:bg-subtle"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <div className="min-h-0 flex-1">
            <AssistantConversation disabled={false} autoFocus />
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={title}
        title={title}
        className={cn(
          'fixed z-40 h-14 w-14 place-items-center rounded-full border border-primary/40 bg-surface text-primary shadow-dialog hover:bg-subtle',
          'bottom-[144px] sm:bottom-[76px] lg:bottom-6',
          // ข้างปุ่มแชทกับทีมไอทีซึ่งอยู่มุมขวาสุดเสมอ
          'right-[92px] lg:right-[100px]',
          // บนมือถือแผงเต็มจอมีปุ่มปิดของตัวเอง ปุ่มลอยจะบังช่องพิมพ์ จึงซ่อนระหว่างเปิด
          open ? 'hidden sm:grid' : 'grid',
        )}
      >
        {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Bot className="h-6 w-6" aria-hidden="true" />}
        {!open && busy && (
          <span
            className="absolute right-1 top-1 h-3 w-3 animate-pulse rounded-full bg-primary"
            aria-hidden="true"
          />
        )}
      </button>
    </>
  );
}
