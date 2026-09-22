'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronRight, Crown, LogOut, Menu, Plus, Search, X } from 'lucide-react';
import * as React from 'react';

import { AssistantLauncher } from '@/components/assistant/assistant-launcher';
import { ChatLauncher } from '@/components/support-chat/chat-launcher';
import { SupportChatRealtime } from '@/components/support-chat/chat-realtime';
import { TicketRealtime } from '@/components/tickets/ticket-realtime';
import { Brand } from '@/components/layout/brand';
import { AssistantChatProvider } from '@/lib/assistant-chat';
import { PreferenceButtons, useT } from '@/components/layout/preference-controls';
import { initials } from '@/lib/format';
import {
  bottomNavItems,
  isActive,
  pageTitleKey,
  primaryRole,
  visibleSections,
} from '@/config/nav';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import type { MessageKey } from '@/config/i18n';
import type { RoleCode } from '@/lib/types';

/** คีย์คำแปลของแต่ละบทบาท — ใช้ร่วมกันทุกที่ที่ต้องแสดงชื่อบทบาท */
const ROLE_LABEL_KEY: Record<RoleCode, MessageKey> = {
  end_user: 'role.end_user',
  support_lead: 'role.support_lead',
  support_agent: 'role.support_agent',
  company_admin: 'role.company_admin',
  manager_viewer: 'role.manager_viewer',
  super_admin: 'role.super_admin',
};

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  const { user } = useSession();
  const t = useT();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const sections = visibleSections(user.roles);
  const bottom = bottomNavItems(user.roles);
  const title = t(pageTitleKey(pathname));

  // ปิดลิ้นชักทุกครั้งที่เปลี่ยนหน้า มิฉะนั้นมันค้างทับเนื้อหาหลังกดเมนู
  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    /* บทสนทนากับผู้ช่วย AI อยู่ระดับ shell — เปลี่ยนหน้าแล้วคุยต่อจากเดิมได้ ออกจากระบบแล้วหาย */
    <AssistantChatProvider>
    <div className="flex min-h-screen">
      <Sidebar sections={sections} pathname={pathname} className="hidden lg:flex" />

      {/* ลิ้นชักบนแท็บเล็ต — เมนูผู้ดูแลมีหลายรายการเกินกว่าจะยัดลง bottom nav 4 ช่อง */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t('action.closeMenu')}
            className="absolute inset-0 bg-ink/40"
            onClick={() => setDrawerOpen(false)}
          />
          <Sidebar
            sections={sections}
            pathname={pathname}
            className="relative flex h-full w-[280px] max-w-[85vw] shadow-dialog"
            onClose={() => setDrawerOpen(false)}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-hair bg-page/95 backdrop-blur print:hidden">
          <div className="flex h-[64px] items-center gap-2 px-4 lg:h-[72px] lg:px-8">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={t('action.openMenu')}
              className="grid h-tap w-tap flex-none place-items-center rounded text-ink-2 hover:bg-subtle lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            {/* บนมือถือ sidebar ถูกซ่อน โลโก้จึงต้องมาอยู่บนแถบบนแทน
                มิฉะนั้นจะไม่เห็นตราสัญลักษณ์เลยตลอดการใช้งานบนมือถือ */}
            <Brand className="lg:hidden" showWordmark={false} />

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-h2">{title}</h1>
            </div>

            <Link
              href="/tickets"
              aria-label={t('action.search')}
              className="grid h-tap w-tap flex-none place-items-center rounded text-ink-2 hover:bg-subtle"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </Link>

            {/* ปุ่มสลับธีมกับภาษาอยู่มุมขวาบน เข้าถึงได้จากทุกหน้าและทุกขนาดจอ
                เดิมอยู่ท้ายแถบเมนู ซึ่งต้องเลื่อนลงไปหา และมือถือไม่มีแถบเมนูให้เลื่อน */}
            <PreferenceButtons />

            <Link
              href="/notifications"
              aria-label={
                user.unread_notifications > 0
                  ? `${t('nav.notifications')} ${user.unread_notifications} ${t('common.unreadNotifications')}`
                  : t('nav.notifications')
              }
              className="relative grid h-tap w-tap flex-none place-items-center rounded text-ink-2 hover:bg-subtle"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {user.unread_notifications > 0 && (
                <span className="tabular absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-p1-solid px-1 text-[10px] font-bold text-white">
                  {user.unread_notifications}
                </span>
              )}
            </Link>

            <Link
              href="/tickets/new"
              className="hidden min-h-tap items-center gap-2 rounded bg-primary px-4 text-body-sm font-semibold text-white hover:bg-primary-hover sm:inline-flex"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('action.newTicket')}
            </Link>
          </div>
        </header>

        <main id="main" className="flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10 print:p-0">
          {children}
        </main>
      </div>

      {/* ปุ่มแจ้งปัญหาแบบลอย — อยู่ในระยะที่นิ้วโป้งเอื้อมถึงบนมือถือ */}
      <Link
        href="/tickets/new"
        aria-label={t('action.newTicket')}
        className="fixed bottom-[76px] right-4 z-40 grid h-14 w-14 print:hidden place-items-center rounded-full bg-primary text-white shadow-dialog sm:hidden"
        /* globals.css ยกปุ่มแชท Chatwoot ขึ้นเหนือปุ่มนี้ โดยหาจาก attribute นี้ */
        data-mobile-fab
      >
        <Plus className="h-6 w-6" aria-hidden="true" />
      </Link>

      {/*
        auto-cols-fr บังคับให้ทุกช่องกว้างเท่ากันและหารความกว้างจอพอดี
        ถ้าใช้ grid-flow-col เฉย ๆ แต่ละช่องจะกว้างตามข้อความข้างใน
        ซึ่งพอดีกับคำลาวสั้น ๆ แต่พอสลับเป็นไทยที่คำยาวกว่า แถบจะกว้าง 690px
        บนจอ 375px แล้วทั้งหน้าเลื่อนซ้ายขวาได้
      */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 print:hidden grid auto-cols-fr grid-flow-col border-t border-hair bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label={t('action.mainMenu')}
        /* globals.css ยกปุ่มแชท Chatwoot ขึ้นเหนือแถบนี้ โดยหาจาก attribute นี้ */
        data-mobile-nav
      >
        {bottom.map((item) => {
          const Icon = item.icon;
          const active = isActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 border-t-2 px-1 text-[11px] font-semibold',
                active ? 'border-primary text-primary' : 'border-transparent text-ink-3',
              )}
            >
              <Icon className="h-[19px] w-[19px] flex-none" aria-hidden="true" />
              <span className="w-full truncate text-center">{t(item.shortKey)}</span>
            </Link>
          );
        })}
      </nav>

      {/* แชทกับทีมไอทีแบบเรียลไทม์ — ตัวรับข้อความวางครั้งเดียวระดับ shell ปุ่มลอยอยู่ทุกหน้า */}
      <SupportChatRealtime />
      {/* สถานะเรื่องแจ้งเปลี่ยนแบบเรียลไทม์ — ต้องอยู่คู่ SupportChatRealtime ที่พาเข้าห้อง user:{id} */}
      <TicketRealtime />
      <ChatLauncher />

      {/* แชทผู้ช่วย AI — แสดงเฉพาะเมื่อ backend เปิดใช้ */}
      <AssistantLauncher />
    </div>
    </AssistantChatProvider>
  );
}

function Sidebar({
  sections,
  pathname,
  className,
  onClose,
}: {
  sections: ReturnType<typeof visibleSections>;
  pathname: string;
  className?: string | undefined;
  onClose?: (() => void) | undefined;
}): React.JSX.Element {
  const { user, signOut } = useSession();
  const t = useT();

  return (
    <aside
      /*
        ให้ทั้งแถบเลื่อนเป็นชิ้นเดียว ไม่ใช่บีบเฉพาะรายการเมนูให้เลื่อนในกล่องเตี้ย ๆ
        เมนูฝั่งผู้ดูแลมี 19 รายการ ซึ่งยาวกว่าความสูงจอเสมอ การให้กล่องเมนูเลื่อนเอง
        ทำให้เห็นทีละ 6-7 รายการและไม่รู้ว่ายังมีอะไรอยู่ข้างล่างอีก
      */
      className={cn(
        'app-sidebar sticky top-0 h-screen w-[264px] flex-none flex-col overflow-y-auto print:hidden',
        className,
      )}
    >
      <div className="app-sidebar-head flex-none">
        <div className={cn('flex h-[76px] items-center px-5', onClose && 'pr-14')}>
          <Brand className="min-w-0 flex-1" tone="dark" size="lg" />
          {onClose && (
            /* วางทับมุมขวาบนแทนที่จะกินคอลัมน์ในแถว
               เพราะลิ้นชักแคบกว่าแถบเมนูปกติ ถ้าเบียดในแถวเดียวกัน
               ชื่อระบบจะถูกตัดเหลือ "AIDC Service …" */
            <button
              type="button"
              onClick={onClose}
              aria-label={t('action.closeMenu')}
              className="absolute right-2 top-2.5 grid h-9 w-9 place-items-center rounded text-[color:var(--side-ink-2)] hover:bg-white/10 hover:text-[color:var(--side-ink)]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* เว้นช่องว่างคั่นสองบล็อกแทนการใช้เส้นคั่นชิด ๆ
            ตราสัญลักษณ์กับตัวตนของผู้ใช้เป็นคนละเรื่องกัน จึงไม่ควรติดกันเป็นก้อนเดียว */}
        <div className="px-3 pb-3 pt-1">
          <Link href="/profile" className="side-user-card group">
            <span className="side-avatar grid h-10 w-10 flex-none place-items-center rounded-full text-body-sm font-bold">
              {initials(user.full_name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm font-semibold leading-snug text-[color:var(--side-ink)]">
                {user.full_name}
              </span>
              <span className="mt-1 flex min-w-0 items-center gap-1.5">
                {/* บทบาทของผู้ใช้เอง มาจาก session ไม่ใช่ตัวเลือก
                    ผู้ใช้เปลี่ยนบทบาทตัวเองไม่ได้ — ต้องให้ผู้ดูแลมอบผ่านหน้าจัดการผู้ใช้ */}
                <span className="side-role-chip inline-flex flex-none items-center rounded-full px-2 py-px text-[11px] font-semibold leading-5">
                  {t(ROLE_LABEL_KEY[primaryRole(user.roles)])}
                </span>
                {/*
                  หัวหน้าทีมไม่ใช่บทบาทในตาราง role แต่เป็นสิ่งที่เปลี่ยนสิ่งที่ผู้ใช้ทำได้จริง
                  (มอบหมายงานให้คนในทีม) จึงต้องเห็นว่าตัวเองถืออยู่

                  เป็นไอคอนอย่างเดียวเพราะการ์ดกว้างแค่ 264px และมีป้ายบทบาท
                  กับรหัสบริษัทอยู่แล้ว การใส่ข้อความเต็มจะดันรหัสบริษัทตกบรรทัด
                  ข้อความเต็มอยู่ใน title และใน sr-only สำหรับโปรแกรมอ่านหน้าจอ
                */}
                {user.led_teams.length > 0 && (
                  <span
                    className="side-role-chip inline-flex flex-none items-center rounded-full px-1.5 py-px leading-5"
                    title={t('role.teamLead')}
                  >
                    <Crown className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only">{t('role.teamLead')}</span>
                  </span>
                )}
                {/* บริษัทต้นสังกัด — พนักงาน 7 บริษัทใช้ระบบเดียวกัน ต้องรู้ว่ากำลังแจ้งในนามบริษัทไหน */}
                <span className="truncate text-caption text-[color:var(--side-ink-3)]">{user.company.code}</span>
              </span>
            </span>
            <ChevronRight
              className="h-4 w-4 flex-none text-[color:var(--side-ink-3)] transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>

      {/*
        เมนูเป็นเม็ดยาลอยบนพื้นแถบ ไม่ห่อด้วยแผงกรอบอีกชั้น
        nav กินพื้นที่ว่างที่เหลือ เมนูจึงอยู่ชิดบน และปุ่มออกจากระบบอยู่ล่างสุดเสมอ
      */}
      <nav className="flex-1 px-3 pb-3 pt-3" aria-label={t('action.mainMenu')}>
        {sections.map((section, index) => (
          <div key={section.titleKey ?? `section-${index}`} className={cn(index > 0 && 'mt-4')}>
            {section.titleKey && (
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--side-ink-3)]">
                {t(section.titleKey)}
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item, pathname);
                return (
                  <li key={item.href}>
                    <Link href={item.href} aria-current={active ? 'page' : undefined} className="side-link">
                      <span className="side-link-icon">
                        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                      </span>
                      {/* เว้นขวาให้จุดบอกหน้าปัจจุบัน ไม่ให้ชื่อเมนูยาววิ่งทับ */}
                      <span className="flex-1 truncate pr-3">{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="side-hair flex-none border-t px-3 py-2">
        {/*
          ต้องเป็นปุ่มที่เรียก POST /auth/logout ไม่ใช่ลิงก์ไป /login

          ลิงก์เปลี่ยนแค่หน้าที่เห็น คุกกี้ยังอยู่ครบ ผู้ใช้ที่กด "ออกจากระบบ"
          บนเครื่องที่ใช้ร่วมกันจะยังล็อกอินอยู่จริง แค่พิมพ์ URL ก็กลับเข้าได้
        */}
        <button
          type="button"
          onClick={() => void signOut()}
          className="side-link w-full text-left hover:bg-sla-breach-bg hover:text-sla-breach"
        >
          <span className="side-link-icon">
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </span>
          {t('action.logout')}
        </button>
      </div>
    </aside>
  );
}

export { ROLE_LABEL_KEY };
