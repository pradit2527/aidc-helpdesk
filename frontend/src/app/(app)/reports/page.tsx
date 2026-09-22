'use client';

import Link from 'next/link';
import { AlertOctagon, AlertTriangle, ArrowRight, Award, Building2, CheckCircle2, CircleDashed, FileText, Search } from 'lucide-react';
import * as React from 'react';

import { currentMonth, monthLabel, monthRange } from '@/components/reports/month-picker';
import { Card, CardBody } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/lib/format';
import { useServicePerformanceReport, type OverallStatus } from '@/lib/queries/iso-reports';

/**
 * ศูนย์รายงาน — เลือกรายงานจาก "คำถามที่อยากรู้" ไม่ใช่จากชื่อเทคนิค
 *
 * เดิมหน้านี้มีการ์ดสิบใบ (หกใบเป็นรายงานที่ยังไม่ได้ทำ) พร้อมเลขข้อของ ISO ทุกกลุ่ม
 * ผู้ใช้ต้องอ่านทั้งหน้าก่อนรู้ว่าจะกดอะไร — ตอนนี้เหลือสรุปเดือนนี้หนึ่งแถบกับรายงานที่ใช้ได้จริงสี่ใบ
 *
 * การจัดตามมาตรฐาน ISO/IEC 20000-1 ยังอยู่ครบ แต่ย้ายไปอยู่ในตัวรายงานประจำเดือน
 * (หัวเอกสาร หัวข้อตอนพิมพ์ และช่องลงนาม) ซึ่งเป็นที่ที่ผู้ตรวจต้องการเห็นจริง
 */

const REPORTS: {
  href: string;
  question: string;
  title: string;
  body: string;
  who: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    href: '/reports/service-performance',
    question: 'ເດືອນນີ້ບໍລິການໄອທີໄດ້ຕາມເປົ້າບໍ່?',
    title: 'ລາຍງານປະຈຳເດືອນ',
    body: 'ຜ່ານ ຫຼື ບໍ່ຜ່ານເປົ້າ ມີຫຍັງຕ້ອງຈັດການ ທຽບກັບເດືອນກ່ອນ · ພິມເປັນເອກະສານຕາມ ISO ໄດ້',
    who: 'ສຳລັບຜູ້ບໍລິຫານ ແລະ ຫົວໜ້າໄອທີ',
    icon: FileText,
  },
  {
    href: '/reports/team-kpi',
    question: 'ໃຜໃນທີມເຮັດວຽກໄດ້ຕາມເປົ້າ?',
    title: 'KPI ທີມ Support',
    body: 'ຄະແນນລາຍບຸກຄົນ ຈາກການຕອບຮັບ ແລະ ແກ້ໄຂທັນເວລາ ແລະ ຄະແນນທີ່ຜູ້ໃຊ້ໃຫ້',
    who: 'ສຳລັບຫົວໜ້າທີມ',
    icon: Award,
  },
  {
    href: '/reports/sla-compliance',
    question: 'ບໍລິສັດໃດແກ້ໄຂທັນເວລາ?',
    title: 'SLA ແຍກຕາມບໍລິສັດ',
    body: 'ອັດຕາແກ້ໄຂທັນເວລາ ແຍກຕາມບໍລິສັດ ແລະ ລະດັບຄວາມສຳຄັນ ພ້ອມສົ່ງອອກ',
    who: 'ສຳລັບຜູ້ບໍລິຫານ',
    icon: Building2,
  },
  {
    href: '/reports/tickets',
    question: 'ຢາກຊອກເລື່ອງແຈ້ງຕາມເງື່ອນໄຂ?',
    title: 'ລາຍງານເລື່ອງແຈ້ງ',
    body: 'ກັ່ນຕອງຕາມບໍລິສັດ ພະແນກ ສະຖານະ ຊ່ວງເວລາ ຫຼື ລາຍບຸກຄົນ ແລ້ວສົ່ງອອກເປັນ CSV',
    who: 'ສຳລັບທຸກຄົນທີ່ເບິ່ງລາຍງານໄດ້',
    icon: Search,
  },
];

const VERDICT: Record<OverallStatus, { text: string; cls: string; Icon: typeof CheckCircle2 }> = {
  on_target: { text: 'ຜ່ານເປົ້າໝາຍ', cls: 'text-sla-ok', Icon: CheckCircle2 },
  at_risk: { text: 'ມີບາງຕົວຊີ້ວັດຕ່ຳກວ່າເປົ້າ', cls: 'text-sla-risk', Icon: AlertTriangle },
  off_target: { text: 'ຕ່ຳກວ່າເປົ້າໝາຍ', cls: 'text-sla-breach', Icon: AlertOctagon },
  no_data: { text: 'ຍັງບໍ່ມີຂໍ້ມູນພໍວັດ', cls: 'text-sla-paused', Icon: CircleDashed },
};

export default function ReportsPage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="ລາຍງານ" description="ເລືອກລາຍງານຕາມສິ່ງທີ່ຢາກຮູ້" />
      <MonthGlance />
      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href} className="group block">
            <Card className="h-full transition-colors group-hover:border-primary">
              <CardBody className="flex h-full flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-primary-subtle text-primary">
                    <r.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-h3 text-ink">{r.question}</p>
                    <p className="mt-0.5 text-body-sm font-semibold text-primary">{r.title}</p>
                  </div>
                  <ArrowRight
                    className="mt-1 h-5 w-5 flex-none text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-body-sm text-ink-2">{r.body}</p>
                <p className="mt-auto text-caption text-ink-3">{r.who}</p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** สรุปเดือนนี้บรรทัดเดียว — ข้อมูลชุดเดียวกับรายงานประจำเดือน (react-query ใช้แคชร่วมกัน) */
function MonthGlance(): React.JSX.Element {
  const month = currentMonth();
  const { from, to } = monthRange(month);
  const query = useServicePerformanceReport(from, to);
  const d = query.data;
  const kpi1 = d?.kpi.items.find((k) => k.code === 'KPI-1') ?? null;
  const verdict = d ? VERDICT[d.summary.status] : null;

  return (
    <QueryBoundary query={query}>
      {d && verdict && (
        <Card>
          <CardBody className="grid gap-4 lg:grid-cols-[1.2fr_2fr] lg:items-center">
            <div className="flex items-center gap-3">
              <verdict.Icon className={cn('h-8 w-8 flex-none', verdict.cls)} aria-hidden="true" />
              <div>
                <p className="text-caption text-ink-3">{monthLabel(month)} (ເດືອນນີ້)</p>
                <p className={cn('text-h2', verdict.cls)}>{verdict.text}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Glance
                label="ແກ້ໄຂທັນເວລາ"
                value={kpi1?.value == null ? '—' : formatPercent(kpi1.value)}
                bad={kpi1?.meets_target === false}
                sub={`ເປົ້າ ${kpi1?.target ?? 95}%`}
              />
              <Glance
                label="ຄວາມພໍໃຈ"
                value={d.csat.avg === null ? '—' : `${d.csat.avg.toFixed(1)} / 5`}
                bad={d.csat.avg !== null && d.csat.avg < d.csat.target}
                sub={`ເປົ້າ ${d.csat.target}`}
              />
              <Glance
                label="ເລື່ອງໃໝ່"
                value={formatNumber(d.volume.created.incident + d.volume.created.service_request)}
                sub={`ແກ້ໄຂແລ້ວ ${formatNumber(d.volume.resolved.incident + d.volume.resolved.service_request)}`}
              />
              <Glance
                label="ຄ້າງເກີນກຳນົດ"
                value={formatNumber(d.volume.backlog.reduce((s, r) => s + r.overdue, 0))}
                bad={d.volume.backlog.some((r) => r.overdue > 0)}
                sub={`ຈາກ ${formatNumber(d.volume.backlog.reduce((s, r) => s + r.open, 0))} ທີ່ຄ້າງ`}
              />
            </dl>
          </CardBody>
        </Card>
      )}
    </QueryBoundary>
  );
}

function Glance({ label, value, sub, bad = false }: { label: string; value: string; sub: string; bad?: boolean }): React.JSX.Element {
  return (
    <div>
      <dt className="text-caption text-ink-3">{label}</dt>
      <dd className={cn('tabular text-h2', bad ? 'text-sla-breach' : 'text-ink')}>{value}</dd>
      <dd className="text-caption text-ink-3">{sub}</dd>
    </div>
  );
}
