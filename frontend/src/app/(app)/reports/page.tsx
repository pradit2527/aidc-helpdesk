'use client';

import Link from 'next/link';
import {
  BarChart3,
  CalendarClock,
  FileWarning,
  Gauge,
  KeyRound,
  RefreshCcw,
  Repeat,
  TrendingUp,
  Users,
} from 'lucide-react';
import * as React from 'react';

import { Card, CardBody } from '@/components/ui/card';
import { MockNotice, PageHeader } from '@/components/ui/misc';

/**
 * ศูนย์รายงาน — รวมรายงานตาม docs/04-rbac-sla.md §5.2
 *
 * รายงานที่มาจากเอกสารควบคุมกับที่ทีมเพิ่มเองแยกกลุ่มกันชัดเจน
 * เพราะสองกลุ่มนี้แก้ได้ไม่เหมือนกัน — กลุ่มแรกผูกกับเอกสารที่ CEO อนุมัติ
 */
const CONTROLLED_REPORTS = [
  {
    href: '/reports/sla-compliance',
    title: 'ລາຍງານ SLA ລາຍເດືອນ',
    description: '%SLA ແຍກຕາມບໍລິສັດ × ລະດັບ ພ້ອມສົ່ງອອກ',
    meta: 'ລາຍເດືອນ · ຜູ້ບໍລິຫານ · SLA 7.2',
    icon: Gauge,
    ready: true,
  },
  {
    href: '/reports/aged-backlog',
    title: 'ລາຍງານເລື່ອງຄ້າງ ແລະ ເກີນກຳນົດ',
    description: 'ລາຍການທີ່ເກີນກຳນົດ ພ້ອມຈຳນວນມື້ທີ່ຄ້າງ',
    meta: 'ລາຍອາທິດ · SLA 7.1',
    icon: FileWarning,
    ready: false,
  },
  {
    href: '/reports/rca',
    title: 'ລາຍງານ RCA',
    description: 'ສາເຫດຮາກ ຜົນກະທົບ ແລະ ມາດຕະການປ້ອງກັນການເກີດຊ້ຳ',
    meta: 'ພາຍໃນ 5 ມື້ເຮັດວຽກຫຼັງເຫດ P1 · SLA 7.2',
    icon: FileWarning,
    ready: false,
  },
  {
    href: '/reports/uptime',
    title: 'ລາຍງານຄວາມພ້ອມໃຊ້ງານ',
    description: 'ຕໍ່ລະບົບ ແລະ ຕໍ່ tier ທຽບກັບເປົ້າໝາຍ',
    meta: 'ລາຍເດືອນ · SLA 5.2',
    icon: TrendingUp,
    ready: false,
  },
  {
    href: '/reports/access-expiry',
    title: 'ລາຍງານສິດທີ່ໃກ້ໝົດອາຍຸ',
    description: 'ບົດບາດ ແລະ ສິດຊົ່ວຄາວທີ່ໃກ້ໝົດອາຍຸ',
    meta: 'ລາຍອາທິດ · SOP-03 ຂໍ້ 6',
    icon: KeyRound,
    ready: false,
  },
];

const TEAM_REPORTS = [
  {
    href: '/reports/workload',
    title: 'ພາລະວຽກຂອງເຈົ້າໜ້າທີ່',
    description: 'ເປີດ / ປິດ / ເກີນກຳນົດ ແຍກຕາມຜູ້ຮັບຜິດຊອບ',
    meta: 'ລາຍອາທິດ',
    icon: Users,
    ready: false,
  },
  {
    href: '/reports/category-trend',
    title: 'ແນວໂນ້ມໝວດໝູ່',
    description: 'ໝວດໝູ່ທີ່ແຈ້ງເຂົ້າຫຼາຍ 10 ອັນດັບ',
    meta: 'ລາຍເດືອນ',
    icon: BarChart3,
    ready: false,
  },
  {
    href: '/reports/reopen-rate',
    title: 'ອັດຕາການເປີດເລື່ອງຄືນ',
    description: '% ເລື່ອງທີ່ຖືກເປີດຄືນຫຼັງປິດໄປແລ້ວ',
    meta: 'ລາຍເດືອນ',
    icon: Repeat,
    ready: false,
  },
  {
    href: '/reports/response-time',
    title: 'ເວລາຕອບຮັບຄັ້ງທຳອິດ',
    description: 'ແຍກຕາມລະດັບສະເໝີ ເພາະ P1 ນັບປະຕິທິນ P2–P4 ນັບເວລາເຮັດວຽກ',
    meta: 'ລາຍເດືອນ · KPI-2',
    icon: CalendarClock,
    ready: false,
  },
];

export default function ReportsPage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="ສູນລາຍງານ" description="ລາຍງານທັງໝົດທີ່ລະບົບອອກໃຫ້ໄດ້" />

      <MockNotice endpoint="GET /reports/*" />

      <section>
        <h2 className="mb-2 text-h3">ລາຍງານຕາມເອກະສານຄວບຄຸມ</h2>
        <p className="mb-3 text-body-sm text-ink-2">
          ຄ່າ ແລະ ຮູບແບບຂອງລາຍງານກຸ່ມນີ້ຜູກກັບ AIDC-IT-SLA-001 ການແກ້ຕ້ອງຜ່ານການອະນຸມັດເອກະສານກ່ອນ
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {CONTROLLED_REPORTS.map((report) => (
            <ReportCard key={report.href} {...report} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-h3">ລາຍງານທີ່ທີມເພີ່ມເອງ</h2>
        <p className="mb-3 text-body-sm text-ink-2">
          ບໍ່ໄດ້ມາຈາກເອກະສານຄວບຄຸມ ປັບປ່ຽນໄດ້ຕາມການໃຊ້ງານຈິງ
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {TEAM_REPORTS.map((report) => (
            <ReportCard key={report.href} {...report} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ReportCard({
  href,
  title,
  description,
  meta,
  icon: Icon,
  ready,
}: {
  href: string;
  title: string;
  description: string;
  meta: string;
  icon: React.ComponentType<{ className?: string }>;
  ready: boolean;
}): React.JSX.Element {
  const inner = (
    <CardBody className="flex h-full flex-col">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded bg-primary-subtle text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold text-ink">{title}</span>
          <span className="mt-0.5 block text-body-sm text-ink-2">{description}</span>
        </span>
      </div>
      <p className="mt-3 text-caption text-ink-3">{meta}</p>
      {!ready && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-caption text-ink-3">
          <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
          ຢູ່ໃນແຜນພັດທະນາ
        </p>
      )}
    </CardBody>
  );

  if (!ready) {
    return (
      <Card className="h-full opacity-70" aria-disabled="true">
        {inner}
      </Card>
    );
  }

  return (
    <Link href={href} className="block h-full">
      <Card className="h-full transition-colors hover:border-primary">{inner}</Card>
    </Link>
  );
}
