'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, LogOut, Menu, Plus, Search, X } from 'lucide-react';
import * as React from 'react';

import { Brand } from '@/components/layout/brand';
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
  agent: 'role.agent',
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
        <header className="sticky top-0 z-30 border-b border-hair bg-page/95 backdrop-blur">
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

        <main id="main" className="flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      {/* ปุ่มแจ้งปัญหาแบบลอย — อยู่ในระยะที่นิ้วโป้งเอื้อมถึงบนมือถือ */}
      <Link
        href="/tickets/new"
        aria-label={t('action.newTicket')}
        className="fixed bottom-[76px] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-white shadow-dialog sm:hidden"
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
        className="fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col border-t border-hair bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label={t('action.mainMenu')}
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
    </div>
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
        'app-sidebar sticky top-0 h-screen w-[264px] flex-none flex-col overflow-y-auto',
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
          <Link
            href="/profile"
            className="flex items-center gap-3 rounded bg-white/[0.06] px-3 py-3 transition-colors hover:bg-white/[0.1]"
          >
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-white/[0.14] text-body-sm font-bold text-[color:var(--side-ink)] ring-1 ring-white/15">
              {initials(user.full_name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm font-semibold leading-snug text-[color:var(--side-ink)]">
                {user.full_name}
              </span>
              {/* บทบาทของผู้ใช้เอง มาจาก session ไม่ใช่ตัวเลือก
                  ผู้ใช้เปลี่ยนบทบาทตัวเองไม่ได้ — ต้องให้ผู้ดูแลมอบผ่านหน้าจัดการผู้ใช้ */}
              <span className="side-role-chip mt-1 inline-block rounded-sm px-1.5 py-0.5 text-caption font-semibold">
                {t(ROLE_LABEL_KEY[primaryRole(user.roles)])}
              </span>
            </span>
          </Link>
        </div>
      </div>

      <nav className="flex-1 py-2" aria-label={t('action.mainMenu')}>
        {sections.map((section, index) => (
          <div key={section.titleKey ?? `section-${index}`} className="py-1">
            {section.titleKey && (
              <p className="px-5 pb-1 pt-3 text-caption font-semibold uppercase tracking-wide text-[color:var(--side-ink-3)]">
                {t(section.titleKey)}
              </p>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className="side-link"
                >
                  <Icon className="h-[18px] w-[18px] flex-none" aria-hidden="true" />
                  <span className="flex-1 truncate">{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="side-hair flex-none border-t px-5 py-1">
        {/*
          ต้องเป็นปุ่มที่เรียก POST /auth/logout ไม่ใช่ลิงก์ไป /login

          ลิงก์เปลี่ยนแค่หน้าที่เห็น คุกกี้ยังอยู่ครบ ผู้ใช้ที่กด "ออกจากระบบ"
          บนเครื่องที่ใช้ร่วมกันจะยังล็อกอินอยู่จริง แค่พิมพ์ URL ก็กลับเข้าได้
        */}
        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex min-h-tap items-center gap-2 text-body-sm text-[color:var(--side-ink-2)] transition-colors hover:text-[color:var(--side-ink)]"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t('action.logout')}
        </button>
      </div>
    </aside>
  );
}

export { ROLE_LABEL_KEY };
