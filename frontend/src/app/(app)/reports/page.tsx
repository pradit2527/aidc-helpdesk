'use client';

import Link from 'next/link';
import {
  AlertOctagon,
  AlertTriangle,
  Award,
  Building2,
  CheckCircle2,
  CircleDashed,
  FileText,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import * as React from 'react';

import { currentMonth, monthLabel, monthRange } from '@/components/reports/month-picker';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/lib/format';
import { useServicePerformanceReport, type OverallStatus } from '@/lib/queries/iso-reports';
import { useSession } from '@/lib/session';

/**
 * ศูนย์รายงาน — ค้นหาและเลือกรายงาน
 *
 * หน้านี้ไม่ใช่เมนูอีกต่อไป: รายงานทุกตัวอยู่ในแถบเมนูซ้ายแล้ว (ดูหมวด "ລາຍງານ" ใน config/nav.ts)
 * สิ่งที่หน้านี้ทำคือสองอย่างที่เมนูทำไม่ได้ — สรุปเดือนนี้บรรทัดเดียว และค้นหารายงานด้วยคำ
 *
 * ⚠️ ค้นด้วยคำภาษาลาว ไทย และอังกฤษได้ทั้งหมด (keywords) เพราะผู้ใช้จำชื่อรายงาน
 *    เป็นคนละภาษากับที่หน้าจอแสดงอยู่บ่อย เช่นพิมพ์ "27001" หรือ "ความปลอดภัย" หรือ "security"
 */

type ReportGroup = 'service' | 'security' | 'data';

const GROUP_LABEL: Record<ReportGroup, string> = {
  service: 'ຄຸນນະພາບບໍລິການ',
  security: 'ຄວາມປອດໄພ',
  data: 'ຂໍ້ມູນດິບ',
};

const REPORTS: {
  href: string;
  title: string;
  question: string;
  body: string;
  who: string;
  group: ReportGroup;
  icon: React.ComponentType<{ className?: string }>;
  /** คำที่ผู้ใช้อาจพิมพ์หา — รวมภาษาไทยและอังกฤษ ไม่ได้แสดงบนหน้าจอ */
  keywords: string;
  /** true = ເປີດໄດ້ສະເພາະຜູ້ທີ່ເຫັນເຫດຄວາມປອດໄພ (SOP-10 ຂໍ້ 2) */
  securityOnly?: boolean;
}[] = [
  {
    href: '/reports/service-performance',
    title: 'ລາຍງານປະຈຳເດືອນ',
    question: 'ເດືອນນີ້ບໍລິການໄອທີໄດ້ຕາມເປົ້າບໍ່?',
    body: 'ຜ່ານ ຫຼື ບໍ່ຜ່ານເປົ້າ · ມີຫຍັງຕ້ອງຈັດການ · ທຽບເດືອນກ່ອນ · ພິມເປັນເອກະສານ ISO ໄດ້',
    who: 'ຜູ້ບໍລິຫານ ແລະ ຫົວໜ້າໄອທີ',
    group: 'service',
    icon: FileText,
    keywords: 'monthly service performance iso 20000 รายงานประจำเดือน ผลการให้บริการ kpi sla',
  },
  {
    href: '/reports/team-kpi',
    title: 'KPI ທີມ Support',
    question: 'ໃຜໃນທີມເຮັດວຽກໄດ້ຕາມເປົ້າ?',
    body: 'ຄະແນນລາຍບຸກຄົນຈາກການຕອບຮັບ ການແກ້ໄຂທັນເວລາ ແລະ ຄະແນນທີ່ຜູ້ໃຊ້ໃຫ້',
    who: 'ຫົວໜ້າທີມ',
    group: 'service',
    icon: Award,
    keywords: 'kpi team support รายบุคคล คะแนน ทีม csat',
  },
  {
    href: '/reports/sla-compliance',
    title: 'SLA ແຍກຕາມບໍລິສັດ',
    question: 'ບໍລິສັດໃດແກ້ໄຂທັນເວລາ?',
    body: 'ອັດຕາແກ້ໄຂທັນເວລາ ແຍກຕາມບໍລິສັດ ແລະ ລະດັບຄວາມສຳຄັນ ພ້ອມສົ່ງອອກ',
    who: 'ຜູ້ບໍລິຫານ',
    group: 'service',
    icon: Building2,
    keywords: 'sla compliance company บริษัท ตรงเวลา ระดับความสำคัญ',
  },
  {
    href: '/reports/security',
    title: 'ຄວາມໝັ້ນຄົງປອດໄພ (ISO 27001)',
    question: 'ດ້ານຄວາມປອດໄພເປັນແນວໃດ?',
    body: 'ເຫດການດ້ານຄວາມປອດໄພ · ການຄວບຄຸມການເຂົ້າເຖິງ · ຮ່ອງຮອຍການກວດສອບ · ຊ່ອງວ່າງຂອງຫຼັກຖານ',
    who: 'ຫົວໜ້າໄອທີ · CEO · DPO',
    group: 'security',
    icon: ShieldCheck,
    keywords: 'security iso 27001 ความปลอดภัย สิทธิ์ access audit ตรวจสอบ incident',
  },
  {
    href: '/reports/tickets',
    title: 'ລາຍງານເລື່ອງແຈ້ງ',
    question: 'ຢາກຊອກເລື່ອງແຈ້ງຕາມເງື່ອນໄຂ?',
    body: 'ກັ່ນຕອງຕາມບໍລິສັດ ພະແນກ ສະຖານະ ຊ່ວງເວລາ ຫຼື ລາຍບຸກຄົນ ແລ້ວສົ່ງອອກເປັນ CSV',
    who: 'ທຸກຄົນທີ່ເບິ່ງລາຍງານໄດ້',
    group: 'data',
    icon: Search,
    keywords: 'ticket report csv export รายงานเรื่องแจ้ง ค้นหา กรอง',
  },
];

const VERDICT: Record<OverallStatus, { text: string; cls: string; Icon: typeof CheckCircle2 }> = {
  on_target: { text: 'ຜ່ານເປົ້າໝາຍ', cls: 'text-sla-ok', Icon: CheckCircle2 },
  at_risk: { text: 'ມີບາງຕົວຊີ້ວັດຕ່ຳກວ່າເປົ້າ', cls: 'text-sla-risk', Icon: AlertTriangle },
  off_target: { text: 'ຕ່ຳກວ່າເປົ້າໝາຍ', cls: 'text-sla-breach', Icon: AlertOctagon },
  no_data: { text: 'ຍັງບໍ່ມີຂໍ້ມູນພໍວັດ', cls: 'text-sla-paused', Icon: CircleDashed },
};

export default function ReportsPage(): React.JSX.Element {
  const { user } = useSession();
  const [term, setTerm] = React.useState('');

  const allowed = React.useMemo(
    () => REPORTS.filter((r) => !r.securityOnly || user.security_viewer === true),
    [user.security_viewer],
  );

  const q = term.trim().toLowerCase();
  const shown = q === ''
    ? allowed
    : allowed.filter((r) =>
        `${r.title} ${r.question} ${r.body} ${r.who} ${r.keywords} ${GROUP_LABEL[r.group]}`
          .toLowerCase()
          .includes(q),
      );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="ສູນລາຍງານ" description="ຄົ້ນຫາລາຍງານ ຫຼື ເລືອກຈາກເມນູ ລາຍງານ ທາງຊ້າຍ" />

      <MonthGlance />

      <div className="flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
            aria-hidden="true"
          />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="ຄົ້ນຫາລາຍງານ..."
            aria-label="ຄົ້ນຫາລາຍງານ"
            className="pl-9 pr-9"
          />
          {term !== '' && (
            <button
              type="button"
              onClick={() => setTerm('')}
              aria-label="ລ້າງຄຳຄົ້ນຫາ"
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-ink-3 hover:bg-subtle hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {q !== '' && (
          <p className="text-caption text-ink-3" role="status" aria-live="polite">
            ພົບ {shown.length} ລາຍງານ ຈາກ {allowed.length}
          </p>
        )}
      </div>

      {shown.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-body-sm text-ink-2">
            ບໍ່ພົບລາຍງານທີ່ກົງກັບ “{term}” — ລອງພິມຊື່ອື່ນ ເຊັ່ນ SLA, KPI ຫຼື ຄວາມປອດໄພ
          </CardBody>
        </Card>
      ) : (
        /*
         * กริดไอคอน — ปุ่มใหญ่พอกดด้วยนิ้ว อ่านจบในสองบรรทัด
         *
         * ⚠️ ไม่ใส่คำอธิบายยาวในไทล์โดยตั้งใจ ของเดิมเป็นการ์ดข้อความสี่บรรทัด
         *    ผู้ใช้ต้องอ่านทั้งหน้าก่อนรู้ว่าจะกดอะไร คำอธิบายย้ายไปเป็น tooltip (title)
         *    และยังค้นหาเจอผ่านช่องค้นหาเหมือนเดิม
         */
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((r) => (
            <li key={r.href}>
              <Link
                href={r.href}
                title={`${r.question} — ${r.body}`}
                className="group flex h-full flex-col items-center gap-2 rounded-lg border border-hair bg-surface p-4 text-center transition-colors hover:border-primary hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="grid h-14 w-14 place-items-center rounded-xl bg-primary-subtle text-primary transition-transform group-hover:scale-105">
                  <r.icon className="h-7 w-7" />
                </span>
                <span className="text-body-sm font-semibold text-ink group-hover:text-primary">
                  {r.title}
                </span>
                <span className="mt-auto rounded-full bg-subtle px-2 py-0.5 text-caption text-ink-3">
                  {GROUP_LABEL[r.group]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** สรุปเดือนนี้แถบเดียว — ข้อมูลชุดเดียวกับรายงานประจำเดือน (react-query ใช้แคชร่วมกัน) */
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
          <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
            <div className="flex items-center gap-2">
              <verdict.Icon className={cn('h-5 w-5 flex-none', verdict.cls)} aria-hidden="true" />
              <div>
                <p className="text-caption text-ink-3">{monthLabel(month)}</p>
                <p className={cn('text-body-sm font-semibold', verdict.cls)}>{verdict.text}</p>
              </div>
            </div>
            <dl className="flex flex-1 flex-wrap gap-x-6 gap-y-3">
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

function Glance({
  label,
  value,
  sub,
  bad = false,
}: {
  label: string;
  value: string;
  sub: string;
  bad?: boolean;
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-caption text-ink-3">{label}</dt>
      <dd className={cn('tabular text-body font-semibold', bad ? 'text-sla-breach' : 'text-ink')}>
        {value}
      </dd>
      <dd className="text-caption text-ink-3">{sub}</dd>
    </div>
  );
}
