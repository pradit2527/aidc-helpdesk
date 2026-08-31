import Link from 'next/link';
import {
  BookOpen,
  Bell,
  CheckSquare,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Plus,
  User,
} from 'lucide-react';

import { MOCK_USER } from '@/lib/mock';

/**
 * AppShell — Server Component
 *
 * เมนูกรองด้วย permission ครั้งเดียวที่นี่ ไม่กระจาย <Can> ทีละอัน
 * (docs/20-frontend-architecture.md §6)
 *
 * มือถือ: bottom nav 4 ช่อง + ปุ่มแจ้งเรื่องลอย (นิ้วโป้งถึง)
 * เดสก์ท็อป: sidebar ซ้าย
 */

const NAV = [
  { href: '/queue', label: 'คิวงานของฉัน', short: 'คิวงาน', icon: Inbox, badge: 6 },
  { href: '/tickets', label: 'เรื่องทั้งหมด', short: 'ทั้งหมด', icon: ListChecks, badge: null },
  { href: '/approvals', label: 'รออนุมัติ', short: 'อนุมัติ', icon: CheckSquare, badge: 2 },
  { href: '/dashboard', label: 'แดชบอร์ด', short: 'แดชบอร์ด', icon: LayoutDashboard, badge: null },
  { href: '/kb', label: 'คลังความรู้', short: 'ความรู้', icon: BookOpen, badge: null },
];

const BOTTOM_NAV = ['/queue', '/tickets', '/approvals', '/kb'];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar (เดสก์ท็อป) ── */}
      <aside className="sticky top-0 hidden h-screen w-[264px] flex-none flex-col border-r border-hair bg-surface lg:flex">
        <div className="flex h-[72px] items-center gap-3 border-b border-hair px-5">
          <span className="grid h-9 w-9 flex-none place-items-center rounded bg-primary text-[15px] font-bold text-white">
            A
          </span>
          <span className="leading-tight">
            <span className="block text-body-sm font-bold tracking-tight">AIDC Service Desk</span>
            <span className="block text-caption text-ink-3">ศูนย์บริการกลุ่มบริษัท</span>
          </span>
        </div>

        <div className="border-b border-hair px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-subtle text-caption font-semibold text-ink-2">
              ปศ
            </span>
            <span className="min-w-0">
              <span className="block truncate text-body-sm font-semibold">
                {MOCK_USER.full_name}
              </span>
              <span className="block truncate text-caption text-ink-3">
                เจ้าหน้าที่ · {MOCK_USER.scoped_companies.length} บริษัท
              </span>
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3" aria-label="เมนูหลัก">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.href === '/queue';
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex min-h-tap items-center gap-3 border-l-[3px] px-5 text-body-sm transition-colors',
                  active
                    ? 'border-primary bg-primary-subtle font-semibold text-primary-hover'
                    : 'border-transparent text-ink-2 hover:bg-subtle hover:text-ink',
                ].join(' ')}
              >
                <Icon className="h-[18px] w-[18px] flex-none" aria-hidden="true" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge !== null && (
                  <span className="tabular grid h-5 min-w-[22px] place-items-center rounded-full bg-subtle px-1.5 text-caption font-semibold text-ink-2">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-hair px-5 py-4 text-caption leading-relaxed text-ink-3">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-sla-ok" aria-hidden="true" />
            เชื่อมต่อระบบแล้ว
          </div>
          <p className="mt-1">เวลาทำการ จ–ศ 08:30–17:30 น.</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Topbar ── */}
        <header className="sticky top-0 z-30 border-b border-hair bg-page/95 backdrop-blur">
          <div className="flex h-[64px] items-center gap-3 px-4 lg:h-[72px] lg:px-8">
            <span className="grid h-8 w-8 flex-none place-items-center rounded bg-primary text-caption font-bold text-white lg:hidden">
              A
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-h2">คิวงานของฉัน</h1>
            </div>
            <button
              type="button"
              className="relative grid h-tap w-tap flex-none place-items-center rounded text-ink-2 hover:bg-subtle"
              aria-label="การแจ้งเตือน 5 รายการที่ยังไม่อ่าน"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              <span className="absolute right-2 top-2 grid h-4 min-w-4 place-items-center rounded-full bg-p1-solid px-1 text-[10px] font-bold text-white">
                5
              </span>
            </button>
            <Link
              href="/tickets/new"
              className="hidden min-h-tap items-center gap-2 rounded bg-primary px-4 text-body-sm font-semibold text-white hover:bg-primary-hover sm:inline-flex"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              แจ้งเรื่องใหม่
            </Link>
          </div>
        </header>

        <main id="main" className="flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      {/* ── ปุ่มแจ้งเรื่องลอย (มือถือ) — อยู่ในโซนนิ้วโป้ง ── */}
      <Link
        href="/tickets/new"
        aria-label="แจ้งเรื่องใหม่"
        className="fixed bottom-[76px] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-white shadow-dialog sm:hidden"
      >
        <Plus className="h-6 w-6" aria-hidden="true" />
      </Link>

      {/* ── Bottom nav (มือถือ) ── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-flow-col border-t border-hair bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="เมนูหลัก"
      >
        {NAV.filter((n) => BOTTOM_NAV.includes(n.href)).map((item) => {
          const Icon = item.icon;
          const active = item.href === '/queue';
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex min-h-[58px] flex-col items-center justify-center gap-1 border-t-2 px-1 text-[11px] font-semibold',
                active ? 'border-primary text-primary' : 'border-transparent text-ink-3',
              ].join(' ')}
            >
              <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
              {item.short}
            </Link>
          );
        })}
        <button
          type="button"
          className="flex min-h-[58px] flex-col items-center justify-center gap-1 border-t-2 border-transparent px-1 text-[11px] font-semibold text-ink-3"
        >
          <User className="h-[19px] w-[19px]" aria-hidden="true" />
          ฉัน
        </button>
      </nav>
    </div>
  );
}
