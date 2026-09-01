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
  ClipboardList,
  FileBarChart,
  FolderTree,
  Inbox,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Server,
  ShieldCheck,
  Timer,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { RoleCode } from '@/lib/types';

export interface NavItem {
  href: string;
  /** ข้อความเต็มบน sidebar */
  label: string;
  /** ข้อความสั้นบน bottom nav มือถือ — ยาวเกิน 2 พยางค์จะล้นช่อง */
  short: string;
  icon: LucideIcon;
  roles: readonly RoleCode[];
  /** ให้เมนูยังไฮไลต์อยู่เมื่ออยู่ในหน้าลูก เช่น /tickets/1038 */
  matchPrefix?: boolean;
}

export interface NavSection {
  title: string | null;
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
    title: null,
    items: [
      {
        href: '/tickets/my',
        label: 'ເລື່ອງຂອງຂ້ອຍ',
        short: 'ຂອງຂ້ອຍ',
        icon: ClipboardList,
        roles: ALL_ROLES,
      },
      {
        href: '/queue',
        label: 'ຄິວວຽກຂອງຂ້ອຍ',
        short: 'ຄິວວຽກ',
        icon: Inbox,
        roles: STAFF,
      },
      {
        href: '/tickets',
        label: 'ເລື່ອງທັງໝົດ',
        short: 'ທັງໝົດ',
        icon: ListChecks,
        roles: STAFF_AND_VIEWER,
      },
      {
        href: '/approvals',
        label: 'ລໍຖ້າອະນຸມັດ',
        short: 'ອະນຸມັດ',
        icon: CheckSquare,
        roles: ALL_ROLES,
      },
    ],
  },
  {
    title: 'ພາບລວມ',
    items: [
      {
        href: '/dashboard',
        label: 'ແດຊບອດ',
        short: 'ແດຊບອດ',
        icon: LayoutDashboard,
        roles: STAFF_AND_VIEWER,
      },
      {
        href: '/reports',
        label: 'ສູນລາຍງານ',
        short: 'ລາຍງານ',
        icon: FileBarChart,
        roles: STAFF_AND_VIEWER,
        matchPrefix: true,
      },
    ],
  },
  {
    title: 'ຄວາມຮູ້',
    items: [
      {
        href: '/kb',
        label: 'ຄັງຄວາມຮູ້',
        short: 'ຄວາມຮູ້',
        icon: BookOpen,
        roles: ALL_ROLES,
        matchPrefix: true,
      },
      {
        href: '/notifications',
        label: 'ການແຈ້ງເຕືອນ',
        short: 'ແຈ້ງເຕືອນ',
        icon: Bell,
        roles: ALL_ROLES,
      },
    ],
  },
  {
    title: 'ຜູ້ດູແລ',
    items: [
      {
        href: '/admin/users',
        label: 'ຈັດການຜູ້ໃຊ້',
        short: 'ຜູ້ໃຊ້',
        icon: Users,
        roles: ADMIN,
        matchPrefix: true,
      },
      {
        href: '/admin/departments',
        label: 'ຈັດການພະແນກ',
        short: 'ພະແນກ',
        icon: FolderTree,
        roles: ADMIN,
      },
      {
        href: '/admin/categories',
        label: 'ໝວດໝູ່ບັນຫາ',
        short: 'ໝວດໝູ່',
        icon: FolderTree,
        roles: ADMIN,
      },
      {
        href: '/admin/roles',
        label: 'ບົດບາດ ແລະ ສິດ',
        short: 'ສິດ',
        icon: ShieldCheck,
        roles: ADMIN,
      },
      {
        href: '/admin/audit-logs',
        label: 'ບັນທຶກການໃຊ້ງານ',
        short: 'ບັນທຶກ',
        icon: ScrollText,
        roles: ADMIN,
      },
      {
        href: '/admin/sla',
        label: 'ຕັ້ງຄ່າ SLA',
        short: 'SLA',
        icon: Timer,
        roles: SUPER,
      },
      {
        href: '/admin/business-hours',
        label: 'ເວລາເຮັດວຽກ ແລະ ວັນພັກ',
        short: 'ເວລາ',
        icon: CalendarClock,
        roles: SUPER,
      },
      {
        href: '/admin/companies',
        label: 'ຈັດການບໍລິສັດ',
        short: 'ບໍລິສັດ',
        icon: Building2,
        roles: SUPER,
      },
      {
        href: '/admin/system',
        label: 'ຂໍ້ມູນລະບົບ',
        short: 'ລະບົບ',
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
          label: 'ໂປຣໄຟລ໌ຂອງຂ້ອຍ',
          short: 'ຂ້ອຍ',
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

/** ชื่อหน้าใช้เป็นหัวข้อบน topbar และ <title> */
export const PAGE_TITLES: Record<string, string> = {
  '/tickets/my': 'ເລື່ອງຂອງຂ້ອຍ',
  '/tickets': 'ເລື່ອງທັງໝົດ',
  '/tickets/new': 'ແຈ້ງບັນຫາ',
  '/queue': 'ຄິວວຽກຂອງຂ້ອຍ',
  '/approvals': 'ລໍຖ້າອະນຸມັດ',
  '/dashboard': 'ແດຊບອດ',
  '/reports': 'ສູນລາຍງານ',
  '/reports/sla-compliance': 'ລາຍງານ SLA ລາຍເດືອນ',
  '/kb': 'ຄັງຄວາມຮູ້',
  '/kb/new': 'ຂຽນບົດຄວາມໃໝ່',
  '/notifications': 'ການແຈ້ງເຕືອນ',
  '/profile': 'ໂປຣໄຟລ໌ ແລະ ການຕັ້ງຄ່າ',
  '/change-password': 'ປ່ຽນລະຫັດຜ່ານ',
  '/admin/users': 'ຈັດການຜູ້ໃຊ້',
  '/admin/users/import': 'ນຳເຂົ້າຜູ້ໃຊ້ຈາກໄຟລ໌',
  '/admin/departments': 'ຈັດການພະແນກ',
  '/admin/categories': 'ໝວດໝູ່ບັນຫາ',
  '/admin/roles': 'ບົດບາດ ແລະ ສິດ',
  '/admin/audit-logs': 'ບັນທຶກການໃຊ້ງານ',
  '/admin/sla': 'ຕັ້ງຄ່າ SLA',
  '/admin/business-hours': 'ເວລາເຮັດວຽກ ແລະ ວັນພັກ',
  '/admin/companies': 'ຈັດການບໍລິສັດ',
  '/admin/system': 'ຂໍ້ມູນລະບົບ',
};

export function pageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (/^\/tickets\/\d+$/.test(pathname)) return 'ລາຍລະອຽດເລື່ອງ';
  if (/^\/kb\/\d+$/.test(pathname)) return 'ບົດຄວາມ';
  if (/^\/kb\/\d+\/edit$/.test(pathname)) return 'ແກ້ໄຂບົດຄວາມ';
  if (/^\/admin\/users\/\d+$/.test(pathname)) return 'ລາຍລະອຽດຜູ້ໃຊ້';
  return 'AIDC Service Desk';
}
