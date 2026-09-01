/**
 * โครงเมนูทั้งระบบ — แหล่งความจริงเดียวของการนำทาง
 *
 * กรองด้วย role ครั้งเดียวที่นี่ ไม่กระจาย <Can> ทีละปุ่ม
 * (docs/20-frontend-architecture.md §6)
 *
 * ⚠️ การซ่อนเมนูเป็นเรื่องประสบการณ์ผู้ใช้เท่านั้น ไม่ใช่มาตรการความปลอดภัย
 *    ผู้ใช้พิมพ์ URL ตรงได้เสมอ การกันจริงอยู่ที่ backend ทุกเส้นทาง
 *    (docs/04-rbac-sla.md §1.1 ข้อ 6)
 *
 * role ที่เข้าได้ของแต่ละหน้าอ้างจากตารางหน้าจอ 29 หน้าใน
 * docs/21-ui-ux-design.md §1.1 ตรงตัว
 */

import {
  Bell,
  BookOpen,
  Building2,
  CalendarClock,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  FolderTree,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Package,
  ScrollText,
  Server,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Timer,
  User,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import type { MessageKey } from '@/config/i18n';
import type { RoleCode } from '@/lib/types';

/**
 * เมนูเก็บ "คีย์คำแปล" ไม่ใช่ข้อความ
 *
 * ถ้าเก็บข้อความตายตัวไว้ตรงนี้ เมนูจะเป็นภาษาลาวเสมอแม้ผู้ใช้สลับเป็นไทย
 * และจะกลายเป็นจุดเดียวในระบบที่สลับภาษาไม่ได้ ซึ่งสังเกตเห็นทันที
 */
export interface NavItem {
  href: string;
  /** คีย์ของข้อความเต็มบน sidebar */
  labelKey: MessageKey;
  /** คีย์ของข้อความสั้นบน bottom nav มือถือ — ยาวเกิน 2 พยางค์จะล้นช่อง */
  shortKey: MessageKey;
  icon: LucideIcon;
  roles: readonly RoleCode[];
  /** ให้เมนูยังไฮไลต์อยู่เมื่ออยู่ในหน้าลูก เช่น /tickets/1038 */
  matchPrefix?: boolean;
}

export interface NavSection {
  titleKey: MessageKey | null;
  items: readonly NavItem[];
}

const ALL_ROLES = [
  'end_user',
  'agent',
  'company_admin',
  'manager_viewer',
  'super_admin',
] as const satisfies readonly RoleCode[];

const STAFF = ['agent', 'company_admin', 'super_admin'] as const satisfies readonly RoleCode[];

const STAFF_AND_VIEWER = [
  'agent',
  'company_admin',
  'manager_viewer',
  'super_admin',
] as const satisfies readonly RoleCode[];

const ADMIN = ['company_admin', 'super_admin'] as const satisfies readonly RoleCode[];

const SUPER = ['super_admin'] as const satisfies readonly RoleCode[];

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    titleKey: null,
    items: [
      {
        href: '/tickets/my',
        labelKey: 'nav.myTickets',
        shortKey: 'navShort.myTickets',
        icon: ClipboardList,
        roles: ALL_ROLES,
      },
      {
        href: '/queue',
        labelKey: 'nav.queue',
        shortKey: 'navShort.queue',
        icon: Inbox,
        roles: STAFF,
      },
      {
        href: '/tickets',
        labelKey: 'nav.allTickets',
        shortKey: 'navShort.allTickets',
        icon: ListChecks,
        roles: STAFF_AND_VIEWER,
      },
      {
        href: '/approvals',
        labelKey: 'nav.approvals',
        shortKey: 'navShort.approvals',
        icon: CheckSquare,
        roles: ALL_ROLES,
      },
    ],
  },
  {
    titleKey: 'navGroup.overview',
    items: [
      {
        href: '/dashboard',
        labelKey: 'nav.dashboard',
        shortKey: 'navShort.dashboard',
        icon: LayoutDashboard,
        roles: STAFF_AND_VIEWER,
      },
      {
        href: '/reports',
        labelKey: 'nav.reports',
        shortKey: 'navShort.reports',
        icon: FileBarChart,
        roles: STAFF_AND_VIEWER,
        matchPrefix: true,
      },
    ],
  },
  {
    titleKey: 'navGroup.knowledge',
    items: [
      {
        href: '/kb',
        labelKey: 'nav.kb',
        shortKey: 'navShort.kb',
        icon: BookOpen,
        roles: ALL_ROLES,
        matchPrefix: true,
      },
      {
        href: '/notifications',
        labelKey: 'nav.notifications',
        shortKey: 'navShort.notifications',
        icon: Bell,
        roles: ALL_ROLES,
      },
    ],
  },
  {
    titleKey: 'navGroup.admin',
    items: [
      {
        href: '/admin',
        labelKey: 'nav.adminConsole',
        shortKey: 'nav.adminConsole',
        icon: SlidersHorizontal,
        roles: ADMIN,
      },
      {
        href: '/admin/users',
        labelKey: 'nav.users',
        shortKey: 'navShort.users',
        icon: Users,
        roles: ADMIN,
        matchPrefix: true,
      },
      {
        href: '/admin/departments',
        labelKey: 'nav.departments',
        shortKey: 'nav.departments',
        icon: FolderTree,
        roles: ADMIN,
      },
      {
        href: '/admin/categories',
        labelKey: 'nav.categories',
        shortKey: 'nav.categories',
        icon: FolderTree,
        roles: ADMIN,
      },
      {
        href: '/admin/roles',
        labelKey: 'nav.roles',
        shortKey: 'nav.roles',
        icon: ShieldCheck,
        roles: ADMIN,
      },
      {
        href: '/admin/catalog',
        labelKey: 'nav.catalog',
        shortKey: 'nav.catalog',
        icon: Package,
        roles: ADMIN,
      },
      {
        href: '/admin/checklists',
        labelKey: 'nav.checklists',
        shortKey: 'nav.checklists',
        icon: ClipboardCheck,
        roles: ADMIN,
      },
      {
        href: '/admin/services',
        labelKey: 'nav.services',
        shortKey: 'nav.services',
        icon: Server,
        roles: STAFF,
      },
      {
        href: '/admin/problems',
        labelKey: 'nav.problems',
        shortKey: 'nav.problems',
        icon: Wrench,
        roles: STAFF,
      },
      {
        href: '/admin/audit-logs',
        labelKey: 'nav.auditLogs',
        shortKey: 'nav.auditLogs',
        icon: ScrollText,
        roles: ADMIN,
      },
      {
        href: '/admin/sla',
        labelKey: 'nav.sla',
        shortKey: 'nav.sla',
        icon: Timer,
        roles: SUPER,
      },
      {
        href: '/admin/business-hours',
        labelKey: 'nav.businessHours',
        shortKey: 'nav.businessHours',
        icon: CalendarClock,
        roles: SUPER,
      },
      {
        href: '/admin/escalation',
        labelKey: 'nav.escalation',
        shortKey: 'nav.escalation',
        icon: Siren,
        roles: SUPER,
      },
      {
        href: '/admin/software',
        labelKey: 'nav.software',
        shortKey: 'nav.software',
        icon: ListChecks,
        roles: SUPER,
      },
      {
        href: '/admin/companies',
        labelKey: 'nav.companies',
        shortKey: 'nav.companies',
        icon: Building2,
        roles: SUPER,
      },
      {
        href: '/admin/system',
        labelKey: 'nav.system',
        shortKey: 'nav.system',
        icon: Server,
        roles: SUPER,
      },
    ],
  },
];

/**
 * bottom nav มือถือ 4 ช่องต่อ role (docs/21-ui-ux-design.md §1.2)
 *
 * ต้องเป็น 4 ช่องพอดี ช่องที่ 5 ทำให้เป้าแตะแคบกว่า 44px บนจอ 375px
 * ช่อง "ຂ້ອຍ" (โปรไฟล์) ถูกเติมเป็นช่องสุดท้ายเสมอในบาง role จึงเหลือ 3 ช่องแรก
 */
export const BOTTOM_NAV: Record<RoleCode, readonly string[]> = {
  end_user: ['/tickets/my', '/kb', '/notifications', '/profile'],
  agent: ['/queue', '/tickets', '/kb', '/notifications'],
  company_admin: ['/dashboard', '/tickets', '/admin/users', '/notifications'],
  manager_viewer: ['/dashboard', '/reports', '/tickets', '/profile'],
  super_admin: ['/dashboard', '/tickets', '/admin/users', '/notifications'],
};

/** หน้าแรกหลังเข้าสู่ระบบ ต่างกันตาม role (หน้าจอ #3 ทางเข้าตามบทบาท) */
export const LANDING_BY_ROLE: Record<RoleCode, string> = {
  end_user: '/tickets/my',
  agent: '/queue',
  company_admin: '/dashboard',
  manager_viewer: '/dashboard',
  super_admin: '/dashboard',
};

/** role ที่ "แรงที่สุด" ที่ผู้ใช้ถืออยู่ ใช้เลือกหน้าแรกและ bottom nav */
const ROLE_RANK: RoleCode[] = [
  'super_admin',
  'company_admin',
  'agent',
  'manager_viewer',
  'end_user',
];

export function primaryRole(roles: readonly RoleCode[]): RoleCode {
  return ROLE_RANK.find((r) => roles.includes(r)) ?? 'end_user';
}

export function landingPath(roles: readonly RoleCode[]): string {
  return LANDING_BY_ROLE[primaryRole(roles)];
}

export function visibleSections(roles: readonly RoleCode[]): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.some((r) => roles.includes(r))),
  })).filter((section) => section.items.length > 0);
}

export function bottomNavItems(roles: readonly RoleCode[]): NavItem[] {
  const wanted = BOTTOM_NAV[primaryRole(roles)];
  const all = NAV_SECTIONS.flatMap((s) => s.items);
  return wanted
    .map(
      (href) =>
        all.find((i) => i.href === href) ??
        ({
          href: '/profile',
          labelKey: 'nav.profile',
          shortKey: 'navShort.profile',
          icon: User,
          roles: ALL_ROLES,
        } satisfies NavItem),
    )
    .filter((item) => item.roles.some((r) => roles.includes(r)) || item.href === '/profile');
}

/** ใช้ตัดสินว่าเมนูไหนควรไฮไลต์จาก pathname ปัจจุบัน */
export function isActive(item: Pick<NavItem, 'href' | 'matchPrefix'>, pathname: string): boolean {
  if (pathname === item.href) return true;
  if (item.matchPrefix && pathname.startsWith(item.href + '/')) return true;
  return false;
}

/**
 * หัวข้อหน้าเป็น "คีย์คำแปล" ไม่ใช่ข้อความ
 *
 * ก่อนหน้านี้เก็บเป็นข้อความลาวตายตัว ผลคือแถบบนกับหัวเรื่องยังเป็นลาว
 * ทั้งที่เมนูข้าง ๆ เปลี่ยนเป็นไทยแล้ว ซึ่งเห็นได้ทันทีว่าแปลไม่ครบ
 */
export const PAGE_TITLE_KEYS: Record<string, MessageKey> = {
  '/tickets/my': 'nav.myTickets',
  '/tickets': 'nav.allTickets',
  '/tickets/new': 'page.newTicket',
  '/queue': 'nav.queue',
  '/approvals': 'nav.approvals',
  '/dashboard': 'nav.dashboard',
  '/reports': 'nav.reports',
  '/reports/sla-compliance': 'page.slaReport',
  '/kb': 'nav.kb',
  '/kb/new': 'page.newArticle',
  '/notifications': 'nav.notifications',
  '/profile': 'page.profile',
  '/change-password': 'page.changePassword',
  '/admin': 'page.adminConsole',
  '/admin/users': 'nav.users',
  '/admin/users/import': 'page.importUsers',
  '/admin/departments': 'nav.departments',
  '/admin/categories': 'nav.categories',
  '/admin/roles': 'nav.roles',
  '/admin/audit-logs': 'nav.auditLogs',
  '/admin/sla': 'nav.sla',
  '/admin/business-hours': 'nav.businessHours',
  '/admin/escalation': 'nav.escalation',
  '/admin/catalog': 'nav.catalog',
  '/admin/checklists': 'nav.checklists',
  '/admin/services': 'nav.services',
  '/admin/problems': 'nav.problems',
  '/admin/software': 'nav.software',
  '/admin/companies': 'nav.companies',
  '/admin/system': 'nav.system',
};

export function pageTitleKey(pathname: string): MessageKey {
  const exact = PAGE_TITLE_KEYS[pathname];
  if (exact) return exact;
  if (/^\/tickets\/\d+$/.test(pathname)) return 'page.ticketDetail';
  if (/^\/kb\/\d+$/.test(pathname)) return 'page.kbArticle';
  if (/^\/kb\/\d+\/edit$/.test(pathname)) return 'page.kbEdit';
  if (/^\/admin\/users\/\d+$/.test(pathname)) return 'page.userDetail';
  return 'page.fallback';
}
