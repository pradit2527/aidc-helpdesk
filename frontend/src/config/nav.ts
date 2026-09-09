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
  Clock,
  Gauge,
  Inbox,
  Layers,
  Plus,
  SlidersHorizontal,
  User,
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

const STAFF_AND_VIEWER = [
  'agent',
  'company_admin',
  'manager_viewer',
  'super_admin',
] as const satisfies readonly RoleCode[];

/*
 * พนักงานทั่วไปเท่านั้น — เมนูติดตาม/ประวัติเป็นมุมมอง "เรื่องที่ฉันแจ้ง"
 * เจ้าหน้าที่ไม่ต้องใช้ เพราะมีคิวงานที่ครอบคลุมกว่าอยู่แล้ว
 */
const EMPLOYEE_ONLY = ['end_user'] as const satisfies readonly RoleCode[];

/*
 * ใครเปิดหน้าตั้งค่าได้บ้าง
 *
 * ⚠️ "เปิดดูได้" ไม่เท่ากับ "แก้ได้" — agent เปิดดูได้เพื่อใช้อ้างอิงระหว่าง
 *    ทำงาน (เช่นดูเวลาทำการหรือกฎยกระดับ) แต่ทุกช่องถูกปิดไว้
 *    การตัดสินว่าแก้ได้ไหมอยู่ที่ permission ฝั่ง backend ไม่ใช่ที่เมนูนี้
 */
const SETTINGS_VIEWERS = [
  'agent',
  'company_admin',
  'super_admin',
] as const satisfies readonly RoleCode[];

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    titleKey: null,
    items: [
      /*
       * ── พนักงานทั่วไป: 3 เมนู ──
       *
       * ต้นแบบแยกงานของพนักงานเป็นสามอย่างชัด ๆ คือ "แจ้ง" "ติดตามที่ยังไม่ปิด"
       * และ "ประวัติที่ปิดแล้ว" — ไม่ใช่รายการเดียวที่มีตัวกรองสถานะ
       * เพราะสองสถานะนี้ผู้ใช้มาด้วยเจตนาคนละอย่าง คนที่มาติดตามอยากรู้ว่า
       * "อีกนานไหม" ส่วนคนที่เปิดประวัติอยากหาเรื่องเก่าเพื่ออ้างอิงหรือเปิดซ้ำ
       */
      {
        href: '/tickets/new',
        labelKey: 'nav.newTicket',
        shortKey: 'navShort.newTicket',
        icon: Plus,
        roles: ALL_ROLES,
      },
      {
        href: '/tickets/my',
        labelKey: 'nav.track',
        shortKey: 'navShort.track',
        icon: Inbox,
        roles: EMPLOYEE_ONLY,
      },
      {
        href: '/tickets/history',
        labelKey: 'nav.history',
        shortKey: 'navShort.history',
        icon: Clock,
        roles: EMPLOYEE_ONLY,
      },

      /*
       * ── เจ้าหน้าที่: 5 เมนู ──
       * คิวของฉัน · ทั้งหมดในขอบเขต · แดชบอร์ด · แจ้งเรื่อง · ตั้งค่าระบบ
       */
      {
        href: '/queue',
        labelKey: 'nav.myQueue',
        shortKey: 'navShort.myQueue',
        icon: Inbox,
        roles: STAFF_AND_VIEWER,
      },
      {
        href: '/tickets',
        labelKey: 'nav.allTickets',
        shortKey: 'navShort.allTickets',
        icon: Layers,
        roles: STAFF_AND_VIEWER,
      },
      {
        href: '/dashboard',
        labelKey: 'nav.dashboard',
        shortKey: 'navShort.dashboard',
        icon: Gauge,
        roles: STAFF_AND_VIEWER,
      },
      /*
       * ตั้งค่าระบบเป็น "หน้าเดียว 10 แท็บ" ตามต้นแบบ ไม่ใช่ 16 หน้าแยกกัน
       *
       * matchPrefix เพื่อให้เมนูยังไฮไลต์อยู่เมื่อสลับแท็บ (/admin?tab=sla)
       * และเมื่ออยู่ในหน้าลูกที่ยังไม่ได้ยุบ เช่น /admin/users/12
       */
      {
        href: '/admin',
        labelKey: 'nav.settings',
        shortKey: 'navShort.settings',
        icon: SlidersHorizontal,
        roles: SETTINGS_VIEWERS,
        matchPrefix: true,
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
  end_user: ['/tickets/new', '/tickets/my', '/tickets/history', '/profile'],
  agent: ['/queue', '/tickets', '/tickets/new', '/admin'],
  company_admin: ['/queue', '/tickets', '/dashboard', '/admin'],
  manager_viewer: ['/queue', '/tickets', '/dashboard', '/profile'],
  super_admin: ['/queue', '/tickets', '/dashboard', '/admin'],
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
