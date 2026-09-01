'use client';

import Link from 'next/link';
import {
  AlertOctagon,
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FolderTree,
  ListChecks,
  Package,
  ScrollText,
  Server,
  ShieldCheck,
  Siren,
  Timer,
  Users,
  Wrench,
} from 'lucide-react';
import * as React from 'react';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, MockNotice, PageHeader } from '@/components/ui/misc';
import { BLOCKING_CONTACT_KEYS, CONTACT_KEY } from '@/config/admin';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { HOLIDAYS, SYSTEM_INFO } from '@/mocks/data';
import {
  ESCALATION_CONTACTS,
  MAINTENANCE_WINDOWS,
  PROBLEMS,
  SERVICES,
} from '@/mocks/admin-data';
import type { ReadinessCheck, RoleCode } from '@/lib/types';

/**
 * ศูนย์ควบคุมของผู้ดูแลระบบ
 *
 * หน้านี้ทำสองอย่างที่หน้าอื่นทำแทนไม่ได้
 *   1. รวมทางเข้าของทุกอย่างที่ตั้งค่าได้ ไว้ที่เดียว
 *   2. บอกว่า "ยังตั้งค่าอะไรไม่ครบ" ก่อนเปิดใช้งานจริง
 *
 * ข้อ 2 สำคัญกว่าข้อ 1 — ค่าที่ยังไม่ได้ตั้งไม่ทำให้ระบบพัง แต่ทำให้
 * กฎบางข้อเงียบไปเฉย ๆ เช่นไม่มีผู้รับแจ้งระดับผู้บริหาร เหตุ P1 ก็ยังเปิดได้
 * รายงานก็ยังออก แต่ไม่มีใครถูกตามตัว ซึ่งจะรู้ตัวก็ต่อเมื่อเกิดเหตุจริงแล้ว
 */

interface AdminLink {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: RoleCode[];
}

const SECTIONS: { title: string; note?: string; links: AdminLink[] }[] = [
  {
    title: 'ຄົນ ແລະ ສິດ',
    links: [
      { href: '/admin/users', label: 'ຈັດການຜູ້ໃຊ້', description: 'ສ້າງ ປິດການໃຊ້ງານ ຣີເຊັດລະຫັດ ແລະ ມອບບົດບາດ', icon: Users, roles: ['company_admin', 'super_admin'] },
      { href: '/admin/roles', label: 'ບົດບາດ ແລະ ສິດ', description: 'ເມທຣິກ 53 ສິດ ຕໍ່ 5 ບົດບາດ', icon: ShieldCheck, roles: ['company_admin', 'super_admin'] },
      { href: '/admin/departments', label: 'ຈັດການພະແນກ', description: 'ໂຄງສ້າງພະແນກຂອງແຕ່ລະບໍລິສັດ', icon: FolderTree, roles: ['company_admin', 'super_admin'] },
      { href: '/admin/companies', label: 'ຈັດການບໍລິສັດ', description: 'ຂໍ້ມູນ 7 ບໍລິສັດໃນກຸ່ມ', icon: Building2, roles: ['super_admin'] },
    ],
  },
  {
    title: 'ກົດຂອງການໃຫ້ບໍລິການ',
    note: 'ຄ່າໃນກຸ່ມນີ້ຜູກກັບເອກະສານ AIDC-IT-SLA-001 ການແກ້ຕ້ອງຜ່ານການອະນຸມັດເອກະສານກ່ອນ',
    links: [
      { href: '/admin/sla', label: 'ຕັ້ງຄ່າ SLA', description: 'ເປົ້າໝາຍເວລາຕອບຮັບ ແລະ ແກ້ໄຂ ຕໍ່ລະດັບ', icon: Timer, roles: ['super_admin'] },
      { href: '/admin/business-hours', label: 'ເວລາເຮັດວຽກ ແລະ ວັນພັກ', description: 'ຖານການຄຳນວນນາທີເຮັດວຽກຂອງ P2–P4', icon: CalendarClock, roles: ['super_admin'] },
      { href: '/admin/escalation', label: 'ກົດຍົກລະດັບ ແລະ ຜູ້ຮັບແຈ້ງ', description: 'ES-01…ES-12 ແລະ ຜູ້ຮັບແຈ້ງແຕ່ລະລະດັບ', icon: Siren, roles: ['super_admin'] },
      { href: '/admin/categories', label: 'ໝວດໝູ່ບັນຫາ', description: 'ຄ່າຕັ້ງຕົ້ນທີ່ລະບົບເຕີມໃຫ້ຕອນແຈ້ງເລື່ອງ', icon: FolderTree, roles: ['company_admin', 'super_admin'] },
    ],
  },
  {
    title: 'ບໍລິການ ແລະ ຂັ້ນຕອນ',
    links: [
      { href: '/admin/catalog', label: 'ແຄັດຕາລັອກບໍລິການ', description: 'ຄຳຂໍບໍລິການ ພ້ອມເປົ້າໝາຍເວລາລາຍລາຍການ', icon: Package, roles: ['company_admin', 'super_admin'] },
      { href: '/admin/checklists', label: 'ແມ່ແບບລາຍການກວດ', description: 'ຂັ້ນຕອນຮັບພະນັກງານໃໝ່ ແລະ ລາອອກ ຕາມ SOP', icon: ClipboardCheck, roles: ['company_admin', 'super_admin'] },
      { href: '/admin/services', label: 'ທະບຽນລະບົບງານ', description: 'ລະບົບງານ ເຫດຂັດຂ້ອງ ແລະ ໜ້າຕ່າງບຳລຸງຮັກສາ', icon: Server, roles: ['agent', 'company_admin', 'super_admin'] },
      { href: '/admin/problems', label: 'Problem ແລະ RCA', description: 'ສາເຫດຮາກ ແລະ ການປ້ອງກັນການເກີດຊ້ຳ', icon: Wrench, roles: ['agent', 'company_admin', 'super_admin'] },
    ],
  },
  {
    title: 'ລະບົບ',
    links: [
      { href: '/admin/software', label: 'ຊອບແວທີ່ອະນຸມັດ', description: 'ບັນຊີຊອບແວທີ່ຕິດຕັ້ງໄດ້ ແລະ ທີ່ຫ້າມ', icon: ListChecks, roles: ['super_admin'] },
      { href: '/admin/audit-logs', label: 'ບັນທຶກການໃຊ້ງານ', description: 'ຮ່ອງຮອຍທຸກການກະທຳ ເພີ່ມໄດ້ຢ່າງດຽວ', icon: ScrollText, roles: ['company_admin', 'super_admin'] },
      { href: '/admin/system', label: 'ຂໍ້ມູນລະບົບ', description: 'ເວີຊັນ ຈຳນວນຂໍ້ມູນ ແລະ ສະຖານະການສຳຮອງ', icon: Server, roles: ['super_admin'] },
    ],
  },
];

/**
 * ประเมินความพร้อมจากข้อมูลจริง ไม่ใช่รายการที่ติ๊กเอง
 * ถ้าให้ติ๊กเอง จะมีคนติ๊กครบก่อนแล้วค่อยหาว่าทำไมแจ้งเตือนไม่ออก
 */
function buildChecks(): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];

  const haveKeys = new Set(
    ESCALATION_CONTACTS.filter((c) => c.is_active).map((c) => c.contact_key),
  );
  const missingKeys = BLOCKING_CONTACT_KEYS.filter((k) => !haveKeys.has(k));
  checks.push({
    key: 'escalation-contacts',
    label: 'ຜູ້ຮັບແຈ້ງລະດັບຜູ້ບໍລິຫານ',
    detail:
      missingKeys.length > 0
        ? `ຍັງບໍ່ໄດ້ກຳນົດ ${missingKeys.map((k) => CONTACT_KEY[k]).join(' · ')} — ກົດ ES-01, ES-02, ES-03, ES-06, ES-07, ES-10, ES-11 ສົ່ງແຈ້ງເຕືອນບໍ່ໄດ້`
        : 'ກຳນົດຜູ້ຮັບແຈ້ງຄົບທຸກລະດັບແລ້ວ',
    status: missingKeys.length > 0 ? 'blocking' : 'ok',
    href: '/admin/escalation',
    ref: missingKeys.length > 0 ? 'Q-07' : null,
  });

  checks.push({
    key: 'holidays',
    label: 'ປະຕິທິນວັນພັກ',
    detail:
      HOLIDAYS.length === 0
        ? 'ຍັງບໍ່ມີວັນພັກໃນລະບົບ — ລະບົບຈະນັບວັນພັກທຸກມື້ເປັນມື້ເຮັດວຽກ ກຳນົດເວລາ P2–P4 ຈຶ່ງສັ້ນກວ່າຄວາມຈິງ'
        : `ມີວັນພັກ ${HOLIDAYS.length} ມື້`,
    status: HOLIDAYS.length === 0 ? 'blocking' : 'ok',
    href: '/admin/business-hours',
    ref: HOLIDAYS.length === 0 ? 'Q-03' : null,
  });

  checks.push({
    key: 'backup',
    label: 'ການສຳຮອງຂໍ້ມູນນອກສະຖານທີ່',
    detail:
      SYSTEM_INFO.last_backup_at === null
        ? 'ຍັງບໍ່ໄດ້ກຳນົດປາຍທາງສຳຮອງ ແລະ ຍັງບໍ່ເຄີຍທົດສອບການກູ້ຄືນ'
        : `ສຳຮອງຫຼ້າສຸດ ${formatDate(SYSTEM_INFO.last_backup_at)}`,
    status: SYSTEM_INFO.last_backup_at === null ? 'blocking' : 'ok',
    href: '/admin/system',
    ref: null,
  });

  const ownerless = SERVICES.filter((s) => s.is_active && s.owner === null);
  checks.push({
    key: 'service-owner',
    label: 'ເຈົ້າຂອງລະບົບງານ',
    detail:
      ownerless.length > 0
        ? `ຍັງບໍ່ມີເຈົ້າຂອງ ${ownerless.length} ລະບົບ (${ownerless.map((s) => s.code).join(', ')}) — ບໍ່ຮູ້ວ່າຈະຕາມໃຜເມື່ອລະບົບລົ້ມ`
        : 'ທຸກລະບົບງານມີເຈົ້າຂອງແລ້ວ',
    status: ownerless.length > 0 ? 'warning' : 'ok',
    href: '/admin/services',
    ref: null,
  });

  const unnotified = MAINTENANCE_WINDOWS.filter((w) => w.notified_at === null);
  checks.push({
    key: 'maintenance-notice',
    label: 'ການແຈ້ງລ່ວງໜ້າກ່ອນປິດປັບປຸງ',
    detail:
      unnotified.length > 0
        ? `ມີ ${unnotified.length} ໜ້າຕ່າງທີ່ຍັງບໍ່ໄດ້ແຈ້ງຜູ້ຮັບບໍລິການ — ຖ້າບໍ່ແຈ້ງລ່ວງໜ້າ 3 ມື້ເຮັດວຽກ ຈະນັບເປັນ Downtime`
        : 'ແຈ້ງລ່ວງໜ້າຄົບທຸກໜ້າຕ່າງແລ້ວ',
    status: unnotified.length > 0 ? 'warning' : 'ok',
    href: '/admin/services',
    ref: null,
  });

  const rcaPending = PROBLEMS.filter((p) => p.status === 'rca_pending');
  checks.push({
    key: 'rca',
    label: 'RCA ທີ່ຍັງບໍ່ໄດ້ສົ່ງ',
    detail:
      rcaPending.length > 0
        ? `ຄ້າງ ${rcaPending.length} ລາຍການ — ຕ້ອງສົ່ງພາຍໃນ 5 ມື້ເຮັດວຽກຫຼັງເຫດ P1`
        : 'ບໍ່ມີ RCA ຄ້າງ',
    status: rcaPending.length > 0 ? 'warning' : 'ok',
    href: '/admin/problems',
    ref: null,
  });

  return checks;
}

const STATUS_META = {
  blocking: { icon: AlertOctagon, className: 'text-sla-breach', label: 'ບລັອກການເປີດໃຊ້ງານ' },
  warning: { icon: AlertTriangle, className: 'text-sla-risk', label: 'ຄວນແກ້ໄຂ' },
  ok: { icon: CheckCircle2, className: 'text-sla-ok', label: 'ພ້ອມແລ້ວ' },
} as const;

export default function AdminHomePage(): React.JSX.Element {
  const { user } = useSession();
  const checks = React.useMemo(buildChecks, []);
  const blocking = checks.filter((c) => c.status === 'blocking');
  const warnings = checks.filter((c) => c.status === 'warning');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="ສູນຄວບຄຸມຜູ້ດູແລລະບົບ"
        description="ທຸກສິ່ງທີ່ຕັ້ງຄ່າໄດ້ໃນລະບົບ ລວມຢູ່ໜ້ານີ້ບ່ອນດຽວ"
      />

      <MockNotice endpoint="GET /admin/readiness" />

      {blocking.length > 0 && (
        <Alert
          tone="danger"
          title={`ຍັງຕັ້ງຄ່າບໍ່ຄົບ ${blocking.length} ຢ່າງ ທີ່ບລັອກການເປີດໃຊ້ງານຈິງ`}
        >
          ລະບົບຍັງເຮັດວຽກໄດ້ປົກກະຕິ ແຕ່ກົດບາງຂໍ້ຈະງຽບໄປເສີຍ ໆ —
          ຈະຮູ້ຕົວກໍ່ຕໍ່ເມື່ອເກີດເຫດຈິງແລ້ວບໍ່ມີໃຜຖືກຕາມຕົວ
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ຄວາມພ້ອມກ່ອນເປີດໃຊ້ງານ</CardTitle>
          <span className="tabular text-caption text-ink-2">
            ບລັອກ {blocking.length} · ຄວນແກ້ {warnings.length} · ພ້ອມ{' '}
            {checks.length - blocking.length - warnings.length} / {checks.length}
          </span>
        </CardHeader>
        <CardBody className="p-0">
          <ul className="divide-y divide-hair">
            {checks.map((check) => {
              const meta = STATUS_META[check.status];
              const Icon = meta.icon;
              return (
                <li key={check.key}>
                  <Link
                    href={check.href}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-subtle lg:px-5"
                  >
                    <Icon
                      className={cn('mt-0.5 h-5 w-5 flex-none', meta.className)}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="text-body-sm font-semibold text-ink">{check.label}</span>
                        {check.ref && (
                          <span className="rounded-sm bg-sla-breach-bg px-1.5 text-caption font-semibold text-sla-breach">
                            {check.ref}
                          </span>
                        )}
                        <span className={cn('ml-auto flex-none text-caption', meta.className)}>
                          {meta.label}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-caption leading-relaxed text-ink-2">
                        {check.detail}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      {SECTIONS.map((section) => {
        const links = section.links.filter((l) => l.roles.some((r) => user.roles.includes(r)));
        if (links.length === 0) return null;

        return (
          <section key={section.title}>
            <h2 className="text-h3">{section.title}</h2>
            {section.note && <p className="mt-1 text-body-sm text-ink-2">{section.note}</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {links.map((link) => {
                const Icon = link.icon;
                return (
                  <Link key={link.href} href={link.href} className="block h-full">
                    <Card className="h-full transition-colors hover:border-primary">
                      <CardBody>
                        <span className="grid h-9 w-9 place-items-center rounded bg-primary-subtle text-primary">
                          <Icon className="h-5 w-5" />
                        </span>
                        <p className="mt-3 text-body font-semibold text-ink">{link.label}</p>
                        <p className="mt-1 text-body-sm text-ink-2">{link.description}</p>
                      </CardBody>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
