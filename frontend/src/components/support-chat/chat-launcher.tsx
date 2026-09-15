'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Headphones, Maximize2, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { CHAT_MESSAGE_EVENT } from '@/components/support-chat/chat-realtime';
import { MyChat } from '@/components/support-chat/my-chat';
import { messagePreview, useChatInbox, useMyChat } from '@/lib/queries/support-chat';
import { cn } from '@/lib/cn';
import { useCan, useSession } from '@/lib/session';
import type { ChatMessageEvent } from '@/lib/ws';

/** หน้าที่เป็นแชทเต็มจออยู่แล้ว — ไม่ต้องมีปุ่มลอยซ้อน */
const FULL_CHAT_PATHS = ['/chats', '/assistant'];

const BUTTON_POSITION = 'fixed z-40 bottom-[144px] right-4 sm:bottom-[76px] lg:bottom-6 lg:right-6';

/**
 * ปุ่มแชทกับทีมไอที มุมขวาล่างทุกหน้า
 *
 * - พนักงานทั่วไป: เปิดแผงคุยกับทีมไอทีได้ทันที
 * - ทีมไอที: ไปกล่องแชท พร้อมตัวเลขห้องที่ยังไม่ได้อ่าน
 *
 * ตำแหน่งหลบปุ่มแจ้งปัญหาลอย (จอมือถือ) และแถบเมนูล่าง (แท็บเล็ต) แบบเดียวกับที่เคยทำให้ Chatwoot
 */
export function ChatLauncher(): React.JSX.Element | null {
  const isStaff = useCan('ticket.change_status');
  return isStaff ? <StaffChatButton /> : <EmployeeChatLauncher />;
}

function EmployeeChatLauncher(): React.JSX.Element | null {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const chat = useMyChat();
  const unread = chat.data?.unread ?? false;
  const hidden = FULL_CHAT_PATHS.includes(pathname);

  // ทีมไอทีตอบมาระหว่างที่แผงปิดอยู่ — แจ้งเตือนมุมจอ กดแล้วเปิดแผง
  React.useEffect(() => {
    const onMessage = (e: Event): void => {
      const { message } = (e as CustomEvent<ChatMessageEvent>).detail;
      if (open || hidden || !message.from_staff) return;
      toast(`${message.sender?.full_name ?? 'ທີມໄອທີ'} ຕອບແຊັດ`, {
        description: messagePreview(message),
        action: { label: 'ເປີດ', onClick: () => setOpen(true) },
      });
    };
    window.addEventListener(CHAT_MESSAGE_EVENT, onMessage);
    return () => window.removeEventListener(CHAT_MESSAGE_EVENT, onMessage);
  }, [open, hidden]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // เปลี่ยนไปหน้าแชทเต็มจอ — ปิดแผงลอยที่ค้างอยู่
  React.useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  if (hidden) return null;

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label="ແຊັດກັບທີມໄອທີ"
          className={cn(
            'fixed inset-0 z-50 flex flex-col overflow-hidden bg-page',
            'sm:inset-auto sm:bottom-[148px] sm:right-4 sm:h-[min(560px,calc(100dvh-180px))] sm:w-[380px] sm:rounded-lg sm:border sm:border-hair sm:shadow-dialog',
            'lg:bottom-[92px] lg:right-6 lg:h-[min(580px,calc(100dvh-120px))]',
          )}
        >
          <header className="flex flex-none items-center gap-2 border-b border-hair bg-surface px-3 py-2">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-primary-subtle text-primary">
              <Headphones className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-body-sm font-semibold text-ink">ແຊັດກັບທີມໄອທີ</h2>
              <p className="truncate text-caption text-ink-3">ຕອບໃນເວລາເຮັດການ ຈັນ–ສຸກ 08:30–17:30</p>
            </div>
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
              aria-label="ປິດແຊັດ"
              className="grid h-tap w-tap place-items-center rounded text-ink-2 hover:bg-subtle"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>
          <div className="min-h-0 flex-1">
            <MyChat active={open} autoFocus />
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={unread ? 'ແຊັດກັບທີມໄອທີ — ມີຂໍ້ຄວາມໃໝ່' : 'ແຊັດກັບທີມໄອທີ'}
        title="ແຊັດກັບທີມໄອທີ"
        className={cn(
          BUTTON_POSITION,
          'h-14 w-14 place-items-center rounded-full bg-primary text-[color:var(--on-accent)] shadow-dialog hover:bg-primary-hover',
          open ? 'hidden sm:grid' : 'grid',
        )}
      >
        {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Headphones className="h-6 w-6" aria-hidden="true" />}
        {!open && unread && (
          <span
            className="absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-sla-breach-solid"
            aria-hidden="true"
          />
        )}
      </button>
    </>
  );
}

function StaffChatButton(): React.JSX.Element | null {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useSession();
  const inbox = useChatInbox('open');
  const unreadCount = (inbox.data ?? []).filter((chat) => chat.unread).length;
  const onInbox = pathname === '/chats';

  // ข้อความใหม่จากผู้ใช้ระหว่างอยู่หน้าอื่น — แจ้งเตือน กดแล้วไปกล่องแชท
  React.useEffect(() => {
    const onMessage = (e: Event): void => {
      const { message, chat_id } = (e as CustomEvent<ChatMessageEvent>).detail;
      if (onInbox || message.is_system || message.from_staff || message.sender?.id === user.id) return;
      toast(`ແຊັດໃໝ່ຈາກ ${message.sender?.full_name ?? 'ຜູ້ໃຊ້'}`, {
        description: messagePreview(message),
        action: { label: 'ຕອບ', onClick: () => router.push(`/chats?id=${chat_id}`) },
      });
    };
    window.addEventListener(CHAT_MESSAGE_EVENT, onMessage);
    return () => window.removeEventListener(CHAT_MESSAGE_EVENT, onMessage);
  }, [onInbox, router, user.id]);

  if (onInbox) return null;

  return (
    <Link
      href="/chats"
      aria-label={unreadCount > 0 ? `ກ່ອງແຊັດ — ${unreadCount} ຫ້ອງຍັງບໍ່ໄດ້ອ່ານ` : 'ກ່ອງແຊັດ'}
      title="ກ່ອງແຊັດ"
      className={cn(
        BUTTON_POSITION,
        'grid h-14 w-14 place-items-center rounded-full bg-primary text-[color:var(--on-accent)] shadow-dialog hover:bg-primary-hover',
      )}
    >
      <Headphones className="h-6 w-6" aria-hidden="true" />
      {unreadCount > 0 && (
        <span className="tabular absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-surface bg-sla-breach-solid px-1 text-[11px] font-bold text-white">
          {unreadCount}
        </span>
      )}
    </Link>
  );
}
