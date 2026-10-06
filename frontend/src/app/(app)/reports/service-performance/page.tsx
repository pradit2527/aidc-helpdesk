'use client';

import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, Printer } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { currentMonth, MonthPicker, monthLabel, monthRange } from '@/components/reports/month-picker';
import {
  filterRows,
  ReportSearch,
  ReportSection,
  ResultChip,
  resultLabel,
  SummaryStrip,
} from '@/components/reports/report-layout';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { type Column } from '@/components/ui/data-table';
import { ReportTable } from '@/components/reports/report-table';
import { BackLink, PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { cn } from '@/lib/cn';
import { formatDateShort, formatNumber, formatPercent } from '@/lib/format';
import { useServicePerformanceReport, type OverallStatus, type ServicePerformanceReport } from '@/lib/queries/iso-reports';

/**
 * รายงานผลการให้บริการประจำเดือน ตามโครง ISO/IEC 20000-1 §8.3.3 · §9.1
 *
 * โครงเดียวกับหน้ารายงานอื่นทุกหน้า: คำตัดสินหนึ่งบรรทัด → ตัวเลขสรุปสี่ตัว → ตารางเรียงลงไป
 *
 * ⚠️ ไม่ใช้แท็บอีกแล้ว ของเดิมซ่อนเนื้อหาไว้ห้าแท็บ ผู้อ่านไม่รู้ว่ายังมีอะไรอยู่ข้างใน
 *    และตอนพิมพ์เป็นเอกสารต้องเขียนโค้ดพิเศษเพื่อคลี่ทุกแท็บออกมา
 */
export default function ServicePerformancePage(): React.JSX.Element {
  const [month, setMonth] = React.useState(currentMonth);
  const { from, to } = monthRange(month);
  const query = useServicePerformanceReport(from, to);

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <BackLink href="/reports" label="ກັບໄປສູນລາຍງານ" />
      </div>
      <div className="print:hidden">
        <PageHeader
          title="ລາຍງານຜົນການໃຫ້ບໍລິການປະຈຳເດືອນ"
          description="ISO/IEC 20000-1 §8.3.3 · §9.1 — ຜ່ານເປົ້າ ຫຼື ບໍ່ ແລະ ມີຫຍັງຕ້ອງຈັດການ"
          actions={
            <div className="flex items-center gap-2">
              <MonthPicker value={month} onChange={setMonth} />
              <Button variant="secondary" onClick={() => window.print()} disabled={!query.data}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                ພິມ
              </Button>
            </div>
          }
        />
      </div>

      <QueryBoundary query={query}>{query.data && <Report d={query.data} month={month} />}</QueryBoundary>
    </div>
  );
}

const VERDICT: Record<OverallStatus, { text: string; cls: string; Icon: typeof CheckCircle2 }> = {
  on_target: { text: 'ຜ່ານເປົ້າໝາຍ', cls: 'text-sla-ok', Icon: CheckCircle2 },
  at_risk: { text: 'ມີບາງຕົວຊີ້ວັດຕ່ຳກວ່າເປົ້າ', cls: 'text-sla-risk', Icon: AlertTriangle },
  off_target: { text: 'ຕ່ຳກວ່າເປົ້າໝາຍ', cls: 'text-sla-breach', Icon: AlertOctagon },
  no_data: { text: 'ຍັງບໍ່ມີຂໍ້ມູນພໍວັດ', cls: 'text-sla-paused', Icon: CircleDashed },
};

const unit = (v: number | null, u: 'percent' | 'minutes' | 'score'): string => {
  if (v === null) return '—';
  if (u === 'percent') return formatPercent(v);
  if (u === 'minutes') return `${formatNumber(v)} ນາທີ`;
  return String(v);
};

function Report({ d, month }: { d: ServicePerformanceReport; month: string }): React.JSX.Element {
  const verdict = VERDICT[d.summary.status];
  const k1 = d.kpi.items.find((k) => k.code === 'KPI-1') ?? null;
  const prev = new Map(d.kpi_previous.items.map((k) => [k.code, k.value]));
  const created = d.volume.created.incident + d.volume.created.service_request;
  const resolved = d.volume.resolved.incident + d.volume.resolved.service_request;
  const openNow = d.volume.backlog.reduce((s, r) => s + r.open, 0);
  const overdueNow = d.volume.backlog.reduce((s, r) => s + r.overdue, 0);
  const [term, setTerm] = React.useState('');

  /* คำเดียวกรองได้ทุกตารางในหน้า — ค้นชื่อบริษัท เลขที่เรื่อง หรือชื่อตัวชี้วัดก็ได้ */
  const kpis = filterRows(d.kpi.items, term, (k) => `${k.code} ${k.name}`);
  const priorities = filterRows(d.sla_by_priority, term, (p) => p.priority);
  const companies = filterRows(d.volume.by_company, term, (r) => r.company.code);
  const backlog = filterRows(d.volume.backlog, term, (r) => r.priority);
  const majors = filterRows(d.major_incidents, term, (r) => `${r.ticket_no} ${r.subject} ${r.company_code} ${r.priority}`);
  const breaches = filterRows(d.breaches.resolution_p1_p2, term, (r) => `${r.ticket_no} ${r.subject} ${r.company_code} ${r.assignee_name ?? ''}`);
  const services = filterRows(d.availability, term, (r) => `${r.service.code} ${r.service.name_th} ${r.tier}`);
  const found =
    kpis.length + priorities.length + companies.length + backlog.length + majors.length + breaches.length + services.length;

  return (
    <div className="flex flex-col gap-4">
      <header className="hidden print:block">
        <h1 className="text-h2">ລາຍງານຜົນການໃຫ້ບໍລິການປະຈຳເດືອນ</h1>
        <p className="text-body-sm text-ink-2">
          ເອກະສານເລກທີ {d.document.report_no} · ເດືອນ {monthLabel(month)}
          {d.document.sla_policy && ` · ອີງ ${d.document.sla_policy.doc_ref} ${d.document.sla_policy.doc_version}`}
        </p>
      </header>

      <section
        className={cn(
          'rounded border p-4 print-break-avoid',
          d.summary.status === 'off_target' && 'border-danger bg-danger-subtle',
          d.summary.status === 'at_risk' && 'border-warning bg-warning-subtle',
          (d.summary.status === 'on_target' || d.summary.status === 'no_data') && 'border-hair bg-surface',
        )}
      >
        <div className="flex items-start gap-3">
          <verdict.Icon className={cn('mt-0.5 h-6 w-6 flex-none', verdict.cls)} aria-hidden="true" />
          <div>
            <p className="text-h3">{verdict.text}</p>
            <p className="text-body-sm text-ink-2">
              ເອກະສານເລກທີ {d.document.report_no}
              {d.summary.failing.length > 0 && <> · ຕົກເປົ້າ {d.summary.failing.join(' · ')}</>}
              {d.summary.p1_resolution_breaches > 0 && (
                <> · ເຫດ P1 ເກີນກຳນົດ {d.summary.p1_resolution_breaches} ໃບ</>
              )}
            </p>
          </div>
        </div>
      </section>

      <SummaryStrip
        items={[
          {
            label: 'ແກ້ໄຂທັນເວລາ',
            value: k1?.value == null ? '—' : formatPercent(k1.value),
            sub: `ເປົ້າ ${k1?.target ?? 95}%`,
            tone: k1?.meets_target === false ? 'bad' : k1?.meets_target ? 'good' : 'neutral',
          },
          {
            label: 'ຄວາມພໍໃຈຜູ້ໃຊ້',
            value: d.csat.avg === null ? '—' : `${d.csat.avg.toFixed(1)} / 5`,
            sub: `ເປົ້າ ${d.csat.target} · ${d.csat.rated} ຄະແນນ`,
            tone: d.csat.avg === null ? 'neutral' : d.csat.avg < d.csat.target ? 'bad' : 'good',
          },
          {
            label: 'ເລື່ອງໃໝ່ເດືອນນີ້',
            value: formatNumber(created),
            sub: `ແກ້ໄຂແລ້ວ ${formatNumber(resolved)} · ປິດ ${formatNumber(d.volume.closed)}`,
          },
          {
            label: 'ຄ້າງເກີນກຳນົດ',
            value: formatNumber(overdueNow),
            sub: `ຈາກທີ່ຄ້າງທັງໝົດ ${formatNumber(openNow)}`,
            tone: overdueNow > 0 ? 'bad' : 'good',
          },
        ]}
      />

      <ReportSearch value={term} onChange={setTerm} count={found} />

      <ReportSection title="ຕົວຊີ້ວັດຫຼັກ" clause="§9.1 · ທຽບເປົ້າ ແລະ ເດືອນກ່ອນ">
        <ReportTable
          columns={kpiColumns(prev)}
          rows={kpis}
          rowKey={(k) => k.code}
          caption="ຕົວຊີ້ວັດຫຼັກທຽບເປົ້າໝາຍ"
        />
      </ReportSection>

      <ReportSection title="SLA ແຍກຕາມລະດັບຄວາມສຳຄັນ" clause="§8.3.3">
        <ReportTable
          columns={PRIORITY_COLUMNS}
          rows={priorities}
          rowKey={(p) => p.priority}
          caption="ຜົນ SLA ແຍກຕາມລະດັບຄວາມສຳຄັນ"
        />
      </ReportSection>

      <ReportSection title="ປະລິມານວຽກແຍກຕາມບໍລິສັດ" clause="§8.6.1 · §8.6.2">
        <ReportTable
          columns={COMPANY_COLUMNS}
          rows={companies}
          rowKey={(r) => r.company.id}
          emptyTitle="ບໍ່ມີເລື່ອງໃນເດືອນນີ້"
          caption="ປະລິມານວຽກແຍກຕາມບໍລິສັດ"
        />
      </ReportSection>

      <ReportSection title="ເລື່ອງທີ່ຄ້າງຢູ່" clause="§8.6.1 · ນັບ ณ ຕອນນີ້ ບໍ່ແມ່ນສິ້ນເດືອນ">
        <ReportTable
          columns={BACKLOG_COLUMNS}
          rows={backlog}
          rowKey={(r) => r.priority}
          emptyTitle="ບໍ່ມີເລື່ອງຄ້າງ"
          caption="ເລື່ອງທີ່ຄ້າງຢູ່ແຍກຕາມລະດັບ"
        />
      </ReportSection>

      <ReportSection
        title="ເຫດຮ້າຍແຮງ ແລະ ເຫດຄວາມປອດໄພ"
        clause="§8.6.1 · ISO/IEC 27001 A.5.24–5.28"
      >
        <ReportTable
          columns={MAJOR_COLUMNS}
          rows={majors}
          rowKey={(r) => r.id}
          emptyTitle="ບໍ່ມີເຫດຮ້າຍແຮງໃນເດືອນນີ້"
          caption="ເຫດຮ້າຍແຮງ ແລະ ເຫດຄວາມປອດໄພ"
        />
      </ReportSection>

      <ReportSection
        title="ເລື່ອງ P1–P2 ທີ່ເກີນກຳນົດແກ້ໄຂ"
        clause="§8.3.3"
        hint={`ຕອບຮັບຊ້າກວ່າກຳນົດ ${d.breaches.response_breached} ໃບ`}
      >
        <ReportTable
          columns={BREACH_COLUMNS}
          rows={breaches}
          rowKey={(r) => r.id}
          emptyTitle="ບໍ່ມີເລື່ອງ P1–P2 ເກີນກຳນົດ"
          caption="ເລື່ອງ P1–P2 ທີ່ເກີນກຳນົດແກ້ໄຂ"
        />
      </ReportSection>

      <ReportSection title="ຄວາມພ້ອມໃຊ້ງານຂອງລະບົບ" clause="§8.7.1">
        <ReportTable
          columns={AVAILABILITY_COLUMNS}
          rows={services}
          rowKey={(r) => r.service.id}
          emptyTitle="ຍັງບໍ່ໄດ້ບັນທຶກເຫດຂັດຂ້ອງຂອງລະບົບໃດ"
          caption="ຄວາມພ້ອມໃຊ້ງານແຍກຕາມລະບົບ"
        />
      </ReportSection>

      <ReportSection title="Problem ແລະ ການວິເຄາະສາເຫດ" clause="§8.6.3">
        <ReportTable
          columns={METRIC_COLUMNS}
          rows={[
            { label: 'ເປີດໃໝ່ເດືອນນີ້', value: formatNumber(d.problems.opened) },
            { label: 'ປິດແລ້ວ', value: formatNumber(d.problems.closed) },
            { label: 'ຍັງເປີດຄ້າງ', value: formatNumber(d.problems.open_now) },
            {
              label: 'RCA ເກີນກຳນົດ',
              value: formatNumber(d.problems.rca_overdue),
              alert: d.problems.rca_overdue > 0,
            },
            {
              label: 'ອັດຕາຕອບແບບສອບຖາມຄວາມພໍໃຈ',
              value: d.csat.response_rate_percent === null ? '—' : formatPercent(d.csat.response_rate_percent),
              note: `ປິດເລື່ອງ ${formatNumber(d.csat.closed)} · ໃຫ້ຄະແນນ ${formatNumber(d.csat.rated)}`,
            },
          ]}
          rowKey={(r) => r.label}
          caption="Problem ແລະ ຄວາມພໍໃຈ"
        />
      </ReportSection>

      {d.improvement.sip_required && (
        <Card className="print-break-avoid">
          <CardBody>
            <h2 className="text-h3">ຕ້ອງມີແຜນປັບປຸງການບໍລິການ (SIP)</h2>
            <p className="mt-1 text-body-sm text-ink-2">
              ຍ້ອນຕົວຊີ້ວັດ {d.improvement.failing.join(' · ')} ຕ່ຳກວ່າເປົ້າ — ISO/IEC 20000-1 §10.2
              ກຳນົດໃຫ້ບັນທຶກສາເຫດ ມາດຕະການແກ້ໄຂ ແລະ ຜູ້ຮັບຜິດຊອບ
            </p>
          </CardBody>
        </Card>
      )}

      <section className="hidden print:block print-break-avoid">
        <div className="mt-8 grid grid-cols-2 gap-8">
          <SignBox role="ຜູ້ຈັດທຳ" title="ຫົວໜ້າໄອທີ" />
          <SignBox role="ຜູ້ອະນຸມັດ" title="ຜູ້ບໍລິຫານ" />
        </div>
      </section>
    </div>
  );
}

// ── คอลัมน์ของแต่ละตาราง ────────────────────────────────────────────

// ป้ายผลกับ `text` ของคอลัมน์ต้องมาจากที่เดียวกัน — ไม่งั้นไฟล์ส่งออกพูดคนละคำกับหน้าจอ
type KpiItem = ServicePerformanceReport['kpi']['items'][number];
type MajorIncident = ServicePerformanceReport['major_incidents'][number];

function kpiStatus(k: KpiItem): 'pass' | 'fail' | 'no_data' {
  return k.meets_target === null ? 'no_data' : k.meets_target ? 'pass' : 'fail';
}

function majorStatus(r: MajorIncident): 'pass' | 'fail' | 'no_data' {
  return r.breached ? 'fail' : r.resolved_at ? 'pass' : 'no_data';
}

const MAJOR_LABELS = { pass: 'ທັນເວລາ', fail: 'ເກີນກຳນົດ', noData: 'ຍັງເປີດຢູ່' };

function ratioText(percent: number | null, met: number, of: number): string {
  return `${percent === null ? '—' : formatPercent(percent)} (${met}/${of})`;
}

function kpiColumns(prev: Map<string, number | null>): Column<ServicePerformanceReport['kpi']['items'][number]>[] {
  return [
    {
      key: 'code',
      header: 'ລະຫັດ',
      width: '10%',
      cellClassName: 'whitespace-nowrap',
      render: (k) => <span className="tabular font-semibold text-ink">{k.code}</span>,
    },
    { key: 'name', header: 'ຕົວຊີ້ວັດ', render: (k) => <span className="text-ink">{k.name}</span> },
    {
      key: 'value',
      header: 'ຜົນເດືອນນີ້',
      align: 'right',
      render: (k) => <span className="tabular font-semibold text-ink">{unit(k.value, k.unit)}</span>,
    },
    {
      key: 'target',
      header: 'ເປົ້າ',
      align: 'right',
      hideBelow: 'xl',
      render: (k) => <span className="tabular text-ink-2">{unit(k.target, k.unit)}</span>,
    },
    {
      key: 'delta',
      header: 'ທຽບເດືອນກ່ອນ',
      align: 'right',
      hideBelow: 'xl',
      render: (k) => {
        const before = prev.get(k.code);
        if (k.value === null || before === null || before === undefined) {
          return <span className="text-ink-3">—</span>;
        }
        const delta = +(k.value - before).toFixed(1);
        if (delta === 0) return <span className="tabular text-ink-3">0</span>;
        const better = k.direction === 'higher' ? delta > 0 : delta < 0;
        return (
          <span className={cn('tabular', better ? 'text-sla-ok' : 'text-sla-breach')}>
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        );
      },
    },
    {
      key: 'meets',
      header: 'ຜົນປະເມີນ',
      width: '12%',
      text: (k) => resultLabel(kpiStatus(k)),
      render: (k) => (
        <ResultChip status={kpiStatus(k)} />
      ),
    },
  ];
}

const PRIORITY_COLUMNS: Column<ServicePerformanceReport['sla_by_priority'][number]>[] = [
  {
    key: 'priority',
    header: 'ລະດັບ',
    width: '10%',
    render: (p) => <span className="tabular font-semibold text-ink">{p.priority}</span>,
  },
  {
    key: 'total',
    header: 'ຈຳນວນເລື່ອງ',
    align: 'right',
    render: (p) => <span className="tabular">{formatNumber(p.resolution.eligible + p.resolution.excluded)}</span>,
  },
  {
    key: 'response',
    header: 'ຕອບຮັບທັນ',
    align: 'right',
    sortValue: (p) => p.response.percent,
    text: (p) => ratioText(p.response.percent, p.response.met, p.response.eligible),
    render: (p) => <Ratio percent={p.response.percent} met={p.response.met} of={p.response.eligible} />,
  },
  {
    key: 'resolution',
    header: 'ແກ້ໄຂທັນ',
    align: 'right',
    sortValue: (p) => p.resolution.percent,
    text: (p) => ratioText(p.resolution.percent, p.resolution.met, p.resolution.eligible),
    render: (p) => <Ratio percent={p.resolution.percent} met={p.resolution.met} of={p.resolution.eligible} />,
  },
  {
    key: 'target',
    header: 'ກຳນົດແກ້ໄຂ',
    align: 'right',
    hideBelow: 'xl',
    render: (p) => (
      <span className="tabular text-ink-2">
        {p.resolution_target_minutes === null ? '—' : `${formatNumber(p.resolution_target_minutes)} ນາທີ`}
      </span>
    ),
  },
];

const COMPANY_COLUMNS: Column<ServicePerformanceReport['volume']['by_company'][number]>[] = [
  { key: 'company', header: 'ບໍລິສັດ', render: (r) => <span className="text-ink">{r.company.code}</span> },
  {
    key: 'created',
    header: 'ເລື່ອງໃໝ່',
    align: 'right',
    render: (r) => <span className="tabular">{formatNumber(r.created)}</span>,
  },
  {
    key: 'done',
    header: 'ແກ້ໄຂແລ້ວ',
    align: 'right',
    render: (r) => <span className="tabular">{formatNumber(r.done)}</span>,
  },
  {
    key: 'sla',
    header: 'ແກ້ໄຂທັນເວລາ',
    align: 'right',
    render: (r) => (
      <span className={cn('tabular', r.sla_met_percent !== null && r.sla_met_percent < 95 && 'text-sla-breach')}>
        {r.sla_met_percent === null ? '—' : formatPercent(r.sla_met_percent)}
      </span>
    ),
  },
  {
    key: 'csat',
    header: 'ຄວາມພໍໃຈ',
    align: 'right',
    sortValue: (r) => r.csat_avg,
    hideBelow: 'xl',
    render: (r) => (
      <span className="tabular text-ink-2">
        {r.csat_avg === null ? '—' : `${r.csat_avg.toFixed(1)} (${r.csat_count})`}
      </span>
    ),
  },
];

const BACKLOG_COLUMNS: Column<ServicePerformanceReport['volume']['backlog'][number]>[] = [
  {
    key: 'priority',
    header: 'ລະດັບ',
    width: '20%',
    render: (r) => <span className="tabular font-semibold text-ink">{r.priority}</span>,
  },
  {
    key: 'open',
    header: 'ຄ້າງຢູ່',
    align: 'right',
    render: (r) => <span className="tabular">{formatNumber(r.open)}</span>,
  },
  {
    key: 'overdue',
    header: 'ໃນນັ້ນເກີນກຳນົດ',
    align: 'right',
    render: (r) => (
      <span className={cn('tabular font-semibold', r.overdue > 0 ? 'text-sla-breach' : 'text-ink')}>
        {formatNumber(r.overdue)}
      </span>
    ),
  },
];

const MAJOR_COLUMNS: Column<ServicePerformanceReport['major_incidents'][number]>[] = [
  {
    key: 'ticket',
    header: 'ເລກທີ',
    cellClassName: 'whitespace-nowrap',
    render: (r) => (
      <Link href={`/tickets/${r.id}`} className="tabular font-medium text-primary hover:underline">
        {r.ticket_no}
      </Link>
    ),
  },
  { key: 'subject', header: 'ຫົວຂໍ້', render: (r) => <span className="text-ink">{r.subject}</span> },
  {
    key: 'priority',
    header: 'ລະດັບ',
    render: (r) => (
      <span className="tabular">
        {r.priority}
        {r.is_security_incident && <span className="ml-1 text-caption text-sla-breach">ຄວາມປອດໄພ</span>}
      </span>
    ),
  },
  { key: 'company', header: 'ບໍລິສັດ', hideBelow: 'xl', render: (r) => <span className="text-ink-2">{r.company_code}</span> },
  {
    key: 'created',
    header: 'ເປີດເມື່ອ',
    hideBelow: 'xl',
    sortValue: (r) => Date.parse(r.created_at),
    cellClassName: 'whitespace-nowrap',
    render: (r) => <span className="tabular text-ink-2">{formatDateShort(r.created_at)}</span>,
  },
  {
    key: 'result',
    header: 'ຜົນ',
    text: (r) => resultLabel(majorStatus(r), MAJOR_LABELS),
    render: (r) => <ResultChip status={majorStatus(r)} labels={MAJOR_LABELS} />,
  },
];

const BREACH_COLUMNS: Column<ServicePerformanceReport['breaches']['resolution_p1_p2'][number]>[] = [
  {
    key: 'ticket',
    header: 'ເລກທີ',
    cellClassName: 'whitespace-nowrap',
    render: (r) => (
      <Link href={`/tickets/${r.id}`} className="tabular font-medium text-primary hover:underline">
        {r.ticket_no}
      </Link>
    ),
  },
  { key: 'subject', header: 'ຫົວຂໍ້', render: (r) => <span className="text-ink">{r.subject}</span> },
  { key: 'priority', header: 'ລະດັບ', render: (r) => <span className="tabular">{r.priority}</span> },
  {
    key: 'assignee',
    header: 'ຜູ້ຮັບຜິດຊອບ',
    hideBelow: 'xl',
    render: (r) => <span className="text-ink-2">{r.assignee_name ?? 'ຍັງບໍ່ມີ'}</span>,
  },
  {
    key: 'due',
    header: 'ກຳນົດແກ້ໄຂ',
    hideBelow: 'xl',
    sortValue: (r) => (r.due_at ? Date.parse(r.due_at) : null),
    cellClassName: 'whitespace-nowrap',
    render: (r) => <span className="tabular text-sla-breach">{r.due_at ? formatDateShort(r.due_at) : '—'}</span>,
  },
];

const AVAILABILITY_COLUMNS: Column<ServicePerformanceReport['availability'][number]>[] = [
  { key: 'service', header: 'ລະບົບ', render: (r) => <span className="text-ink">{r.service.name_th}</span> },
  { key: 'tier', header: 'ຊັ້ນບໍລິການ', hideBelow: 'xl', render: (r) => <span className="text-ink-2">{r.tier}</span> },
  {
    key: 'outages',
    header: 'ຄັ້ງທີ່ຂັດຂ້ອງ',
    align: 'right',
    render: (r) => <span className="tabular">{formatNumber(r.outages)}</span>,
  },
  {
    key: 'down',
    header: 'ເວລາທີ່ໃຊ້ບໍ່ໄດ້',
    align: 'right',
    render: (r) => <span className="tabular">{formatNumber(r.down_minutes)} ນາທີ</span>,
  },
  {
    key: 'uptime',
    header: 'ພ້ອມໃຊ້ງານ',
    align: 'right',
    render: (r) => (
      <span className={cn('tabular font-semibold', r.meets_target === false && 'text-sla-breach')}>
        {r.uptime_percent === null ? '—' : `${r.uptime_percent}%`}
      </span>
    ),
  },
  {
    key: 'target',
    header: 'ເປົ້າ',
    align: 'right',
    hideBelow: 'xl',
    render: (r) => <span className="tabular text-ink-2">{r.target_percent === null ? '—' : `${r.target_percent}%`}</span>,
  },
];

interface MetricRow {
  label: string;
  value: string;
  note?: string;
  alert?: boolean;
}

const METRIC_COLUMNS: Column<MetricRow>[] = [
  { key: 'label', header: 'ຕົວຊີ້ວັດ', render: (r) => <span className="font-medium text-ink">{r.label}</span> },
  {
    key: 'value',
    header: 'ຄ່າ',
    align: 'right',
    width: '22%',
    render: (r) => (
      <span className={cn('tabular font-semibold', r.alert ? 'text-sla-breach' : 'text-ink')}>{r.value}</span>
    ),
  },
  { key: 'note', header: 'ໝາຍເຫດ', hideBelow: 'xl', render: (r) => <span className="text-ink-2">{r.note ?? '—'}</span> },
];

function Ratio({ percent, met, of }: { percent: number | null; met: number; of: number }): React.JSX.Element {
  return (
    <span className="tabular">
      <span className={cn('font-semibold', percent !== null && percent < 95 && 'text-sla-breach')}>
        {percent === null ? '—' : formatPercent(percent)}
      </span>
      <span className="ml-1 text-caption text-ink-3">
        ({met}/{of})
      </span>
    </span>
  );
}

function SignBox({ role, title }: { role: string; title: string }): React.JSX.Element {
  return (
    <div>
      <p className="text-caption text-ink-2">{role}</p>
      <div className="mt-10 border-t border-ink-3" />
      <p className="mt-1 text-caption text-ink-2">{title}</p>
      <p className="text-caption text-ink-3">ວັນທີ ____ / ____ / ______</p>
    </div>
  );
}
