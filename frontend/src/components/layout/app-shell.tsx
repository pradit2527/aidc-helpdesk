'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, LogOut, Menu, Plus, Search, X } from 'lucide-react';
import * as React from 'react';

import { Brand } from '@/components/layout/brand';
import { initials } from '@/lib/format';
import {
  bottomNavItems,
  isActive,
  pageTitle,
  primaryRole,
  visibleSections,
} from '@/config/nav';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import type { RoleCode } from '@/lib/types';

const ROLE_LABEL: Record<RoleCode, string> = {
  end_user: 'ຜູ້ແຈ້ງ',
  agent: 'ເຈົ້າໜ້າທີ່ support',
  company_admin: 'ຜູ້ດູແລລະດັບບໍລິສັດ',
  manager_viewer: 'ຜູ້ບໍລິຫານ (ອ່ານຢ່າງດຽວ)',
  super_admin: 'ຜູ້ດູແລລະບົບ',
};

export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  const { user } = useSession();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const sections = visibleSections(user.roles);
  const bottom = bottomNavItems(user.roles);
  const title = pageTitle(pathname);

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
            aria-label="ປິດເມນູ"
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
              aria-label="ເປີດເມນູ"
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
              aria-label="ຄົ້ນຫາເລື່ອງແຈ້ງ"
              className="grid h-tap w-tap flex-none place-items-center rounded text-ink-2 hover:bg-subtle"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </Link>

            <Link
              href="/notifications"
              aria-label={
                user.unread_notifications > 0
                  ? `ການແຈ້ງເຕືອນ ${user.unread_notifications} ລາຍການທີ່ຍັງບໍ່ໄດ້ອ່ານ`
                  : 'ການແຈ້ງເຕືອນ'
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
              ແຈ້ງບັນຫາ
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
        aria-label="ແຈ້ງບັນຫາໃໝ່"
        className="fixed bottom-[76px] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-white shadow-dialog sm:hidden"
      >
        <Plus className="h-6 w-6" aria-hidden="true" />
      </Link>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-flow-col border-t border-hair bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="ເມນູຫຼັກ"
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
                'flex min-h-[58px] flex-col items-center justify-center gap-1 border-t-2 px-1 text-[11px] font-semibold',
                active ? 'border-primary text-primary' : 'border-transparent text-ink-3',
              )}
            >
              <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
              {item.short}
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
  const { user } = useSession();

  return (
    <aside
      className={cn('app-sidebar sticky top-0 h-screen w-[264px] flex-none flex-col', className)}
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
              aria-label="ປິດເມນູ"
              className="absolute right-2 top-2.5 grid h-9 w-9 place-items-center rounded text-[color:var(--side-ink-2)] hover:bg-white/10 hover:text-[color:var(--side-ink)]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        <Link
          href="/profile"
          className="side-hair flex items-center gap-3 border-t px-5 py-3.5 transition-colors hover:bg-white/[0.07]"
        >
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-white/[0.14] text-body-sm font-bold text-[color:var(--side-ink)] ring-1 ring-white/15">
            {initials(user.full_name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-semibold leading-snug text-[color:var(--side-ink)]">
              {user.full_name}
            </span>
            {/* บทบาทของผู้ใช้เอง มาจาก session ไม่ใช่ตัวเลือก
                ผู้ใช้เปลี่ยนบทบาทตัวเองไม่ได้ — ต้องให้ผู้ดูแลมอบให้ผ่านหน้าจัดการผู้ใช้ */}
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="side-role-chip rounded-sm px-1.5 py-0.5 text-caption font-semibold">
                {ROLE_LABEL[primaryRole(user.roles)]}
              </span>
              {user.scoped_companies.length > 0 && (
                <span className="tabular text-caption text-[color:var(--side-ink-3)]">
                  {user.scoped_companies.length} ບໍລິສັດ
                </span>
              )}
            </span>
          </span>
        </Link>

        <p className="side-hair border-t px-5 py-2.5 text-caption text-[color:var(--side-ink-3)]">
          ເວລາເຮັດວຽກ ຈັນ–ສຸກ 08:30–17:30 ນ.
        </p>
      </div>

      <nav className="app-sidebar-nav flex-1 overflow-y-auto py-2" aria-label="ເມນູຫຼັກ">
        {sections.map((section, index) => (
          <div key={section.title ?? `section-${index}`} className="py-1">
            {section.title && (
              <p className="px-5 pb-1 pt-3 text-caption font-semibold uppercase tracking-wide text-[color:var(--side-ink-3)]">
                {section.title}
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
                  <span className="flex-1 truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="side-hair flex-none border-t px-5 py-3">
        <Link
          href="/login"
          className="inline-flex min-h-tap items-center gap-2 text-body-sm text-[color:var(--side-ink-2)] transition-colors hover:text-[color:var(--side-ink)]"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          ອອກຈາກລະບົບ
        </Link>
      </div>
    </aside>
  );
}

export { ROLE_LABEL };
