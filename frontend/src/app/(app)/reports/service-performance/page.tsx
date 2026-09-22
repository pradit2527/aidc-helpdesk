'use client';

import Link from 'next/link';
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, Printer } from 'lucide-react';
import * as React from 'react';

import { PriorityBadge, StatusBadge } from '@/components/common/badges';
import { currentMonth, MonthPicker, monthLabel, monthRange } from '@/components/reports/month-picker';
import { Scorecard, TargetBar, Trend, VerdictChip } from '@/components/reports/target-bar';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { BackLink, PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatMinutes, formatNumber, formatPercent } from '@/lib/format';
import { useSession } from '@/lib/session';
import {
  useServicePerformanceReport,
  type OverallStatus,
  type ServicePerformanceReport,
} from '@/lib/queries/iso-reports';

/**
 * รายงานผลการให้บริการประจำเดือน — ISO/IEC 20000-1:2018 §8.3.3 · §9.1
 *
 * บนจอเรียงแบบ "คำตอบก่อน รายละเอียดทีหลัง"
 *   1. คำตัดสินของเดือน เป็นประโยคเดียวที่อ่านจบแล้วรู้เรื่อง
 *   2. ตัวชี้วัดหลัก 4 ตัว — ชื่อภาษาคน ค่าจริงเทียบเส้นเป้า และเทียบเดือนก่อน
 *   3. สิ่งที่ต้องจัดการ — รายการที่ลงมือได้ทันที ไม่ใช่ตาราง
 *   4. รายละเอียดแยกเป็นแท็บ เปิดดูเฉพาะเรื่องที่สนใจ
 *
 * ตอนพิมพ์ (บันทึกเป็น PDF) ทุกแท็บถูกพิมพ์เรียงกันพร้อมหัวข้อและข้อของมาตรฐาน
 * และมีช่องลงนาม — เป็นเอกสารครบตาม §7.5 โดยไม่ต้องรกหน้าจอด้วยเลขข้อทุกบรรทัด
 */

const STATUS: Record<OverallStatus, { title: string; cls: string; Icon: typeof CheckCircle2 }> = {
  on_target: { title: 'ເດືອນນີ້ຜ່ານເປົ້າໝາຍ', cls: 'border-sla-ok bg-sla-ok-bg text-sla-ok', Icon: CheckCircle2 },
  at_risk: { title: 'ເດືອນນີ້ມີບາງຕົວຊີ້ວັດຕ່ຳກວ່າເປົ້າ', cls: 'border-sla-risk bg-sla-risk-bg text-sla-risk', Icon: AlertTriangle },
  off_target: { title: 'ເດືອນນີ້ຕ່ຳກວ່າເປົ້າໝາຍ', cls: 'border-sla-breach bg-sla-breach-bg text-sla-breach', Icon: AlertOctagon },
  no_data: { title: 'ຍັງບໍ່ມີຂໍ້ມູນພໍທີ່ຈະວັດ', cls: 'border-hair bg-sla-paused-bg text-sla-paused', Icon: CircleDashed },
};

/** ชื่อตัวชี้วัดที่คนทั่วไปอ่านเข้าใจ พร้อมคำอธิบายว่านับอะไร — รหัส KPI-x แสดงตัวเล็กไว้อ้างอิงเท่านั้น */
const KPI_TEXT: Record<string, { name: string; hint: string }> = {
  'KPI-1': { name: 'ແກ້ໄຂທັນເວລາ', hint: 'ເລື່ອງທີ່ປິດໃນເດືອນນີ້ ແລະ ແກ້ເສັດກ່ອນກຳນົດ' },
  'KPI-3': { name: 'ແກ້ໄດ້ໃນຄັ້ງດຽວ', hint: 'ເຫດຂັດຂ້ອງທີ່ທີມດ່ານໜ້າແກ້ເອງ ບໍ່ໂອນ ບໍ່ລໍຖ້າ ບໍ່ຖືກເປີດຄືນ' },
  'KPI-4': { name: 'ຄວາມພໍໃຈຂອງຜູ້ໃຊ້', hint: 'ຄະແນນສະເລ່ຍ 1–5 ທີ່ຜູ້ໃຊ້ໃຫ້ຕອນປິດເລື່ອງ' },
  'KPI-5': { name: 'ເລື່ອງຄ້າງທີ່ເກີນກຳນົດ', hint: 'ສ່ວນຂອງເລື່ອງທີ່ຍັງເປີດຢູ່ ທີ່ເລີຍກຳນົດແລ້ວ' },
  'KPI-6': { name: 'ລະບົບສຳຄັນພ້ອມໃຊ້', hint: 'ເວລາທີ່ລະບົບລະດັບ critical ໃຊ້ງານໄດ້' },
  'KPI-7': { name: 'ເຫດທີ່ເກີດຊ້ຳ', hint: 'ເຫດທີ່ມີສາເຫດດຽວກັບເຫດກ່ອນໜ້າ ພາຍໃນ 90 ມື້' },
};

type TabKey = 'priority' | 'volume' | 'major' | 'systems' | 'all';
const TABS: { key: TabKey; label: string; clause: string }[] = [
  { key: 'priority', label: 'ຕາມລະດັບຄວາມສຳຄັນ', clause: '§8.3.3' },
  { key: 'volume', label: 'ປະລິມານວຽກ', clause: '§8.6.1 · §8.6.2' },
  { key: 'major', label: 'ເຫດຮ້າຍແຮງ', clause: '§8.6.1 · ISO/IEC 27001 A.5.24–5.28' },
  { key: 'systems', label: 'ລະບົບ ແລະ Problem', clause: '§8.7.1 · §8.6.3' },
  { key: 'all', label: 'ຕົວຊີ້ວັດທັງໝົດ', clause: 'SLA 7.1 · §9.1' },
];

const pct = (v: number) => formatPercent(v);

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
          title="ລາຍງານປະຈຳເດືອນ"
          description="ສະຫຼຸບວ່າເດືອນນີ້ບໍລິການໄອທີໄດ້ຕາມເປົ້າໝາຍບໍ່ ແລະ ມີຫຍັງຕ້ອງຈັດການ"
          actions={
            <>
              <MonthPicker value={month} onChange={setMonth} />
              <Button variant="secondary" onClick={() => window.print()} disabled={!query.data}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                ພິມ / PDF
              </Button>
            </>
          }
        />
      </div>

      <QueryBoundary query={query}>{query.data && <Report d={query.data} month={month} />}</QueryBoundary>
    </div>
  );
}

function Report({ d, month }: { d: ServicePerformanceReport; month: string }): React.JSX.Element {
  const { user } = useSession();
  const [tab, setTab] = React.useState<TabKey>('priority');

  const kpi = (code: string) => d.kpi.items.find((k) => k.code === code) ?? null;
  const prev = (code: string) => d.kpi_previous.items.find((k) => k.code === code)?.value ?? null;
  const kpi1 = kpi('KPI-1');
  const kpi5 = kpi('KPI-5');

  const respMet = d.sla_by_priority.reduce((s, r) => s + r.response.met, 0);
  const respAll = d.sla_by_priority.reduce((s, r) => s + r.response.eligible, 0);
  const responsePct = respAll === 0 ? null : Math.round((respMet / respAll) * 1000) / 10;

  const openNow = d.volume.backlog.reduce((s, r) => s + r.open, 0);
  const overdueNow = d.volume.backlog.reduce((s, r) => s + r.overdue, 0);
  const created = d.volume.created.incident + d.volume.created.service_request;
  const resolved = d.volume.resolved.incident + d.volume.resolved.service_request;

  const status = STATUS[d.summary.status];
  const reasons = verdictReasons(d, kpi1?.value ?? null);
  const scope = user.scoped_companies.map((c) => c.code).join(' · ') || 'ທຸກບໍລິສັດ';

  return (
    <article className="flex flex-col gap-5">
      {/* หัวเอกสารสำหรับพิมพ์เท่านั้น — บนจอหัวหน้าอยู่ที่แถบบนแล้ว */}
      <header className="hidden print:block">
        <p className="text-caption text-ink-3">Service Performance Report · ISO/IEC 20000-1:2018 §8.3.3 · §9.1</p>
        <h2 className="text-h2">ລາຍງານຜົນການໃຫ້ບໍລິການໄອທີ ປະຈຳເດືອນ {monthLabel(month)}</h2>
      </header>

      {/* ── 1. คำตัดสินของเดือน ─────────────────────────────── */}
      <section className={cn('rounded-lg border-l-4 px-5 py-4 print-break-avoid', status.cls)}>
        <div className="flex items-start gap-3">
          <status.Icon className="mt-0.5 h-6 w-6 flex-none" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-h2">{status.title}</h2>
            {reasons.length > 0 && (
              <ul className="mt-1 grid gap-0.5 text-body text-ink">
                {reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="mt-3 text-caption text-ink-2">
          {monthLabel(month)} · {scope} · ເລກທີ {d.document.report_no}
          {d.document.sla_policy && ` · ວັດຕາມ ${d.document.sla_policy.doc_ref} v${d.document.sla_policy.doc_version}`}
        </p>
      </section>

      {/* ── 2. ตัวชี้วัดหลัก ────────────────────────────────── */}
      <section aria-label="ຕົວຊີ້ວັດຫຼັກ" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print-break-avoid">
        <Scorecard
          title="ແກ້ໄຂທັນເວລາ"
          hint="ເລື່ອງທີ່ປິດ ແລະ ແກ້ເສັດກ່ອນກຳນົດ"
          value={kpi1?.value ?? null}
          target={kpi1?.target ?? 95}
          format={pct}
          prev={prev('KPI-1')}
          basis={kpi1 ? `ຈາກ ${formatNumber(kpi1.denominator)} ເລື່ອງທີ່ປິດ` : undefined}
        />
        <Scorecard
          title="ຕອບຮັບທັນເວລາ"
          hint="ເລື່ອງໃໝ່ທີ່ທີມຕອບຜູ້ແຈ້ງກ່ອນກຳນົດ"
          value={responsePct}
          target={95}
          format={pct}
          basis={`${formatNumber(respMet)} ຈາກ ${formatNumber(respAll)} ເລື່ອງ`}
        />
        <Scorecard
          title="ຄວາມພໍໃຈຂອງຜູ້ໃຊ້"
          hint="ຄະແນນສະເລ່ຍທີ່ຜູ້ໃຊ້ໃຫ້ (1–5)"
          value={d.csat.avg}
          target={d.csat.target}
          min={1}
          max={5}
          format={(v) => `${v.toFixed(1)} / 5`}
          prev={prev('KPI-4')}
          basis={`${formatNumber(d.csat.rated)} ຄະແນນ`}
        />
        <Scorecard
          title="ເລື່ອງຄ້າງທີ່ເກີນກຳນົດ"
          hint="ຈາກເລື່ອງທີ່ຍັງເປີດຢູ່ຕອນນີ້ — ຍິ່ງໜ້ອຍຍິ່ງດີ"
          value={kpi5?.value ?? null}
          target={kpi5?.target ?? 5}
          direction="lower"
          format={pct}
          basis={`${formatNumber(overdueNow)} ຈາກ ${formatNumber(openNow)} ເລື່ອງ`}
        />
      </section>

      {/* ── 3. สิ่งที่ต้องจัดการ ────────────────────────────── */}
      <ActionList d={d} overdueNow={overdueNow} />

      {/* ── 4. รายละเอียด ───────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div role="tablist" aria-label="ລາຍລະອຽດ" className="flex gap-1 overflow-x-auto border-b border-hair print:hidden">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`panel-${t.key}`}
              onClick={() => setTab(t.key)}
              className={cn(
                '-mb-px min-h-tap whitespace-nowrap border-b-2 px-3 text-body-sm font-semibold',
                tab === t.key ? 'border-primary text-primary' : 'border-transparent text-ink-3 hover:text-ink',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Panel tab="priority" active={tab}>
          <PriorityDetail d={d} goal={kpi1?.target ?? 95} />
        </Panel>
        <Panel tab="volume" active={tab}>
          <VolumeDetail d={d} created={created} resolved={resolved} openNow={openNow} overdueNow={overdueNow} />
        </Panel>
        <Panel tab="major" active={tab}>
          <MajorDetail d={d} />
        </Panel>
        <Panel tab="systems" active={tab}>
          <SystemsDetail d={d} />
        </Panel>
        <Panel tab="all" active={tab}>
          <AllKpis d={d} />
        </Panel>
      </section>

      {/* ── ลงนาม — พิมพ์เท่านั้น ────────────────────────────── */}
      <section className="hidden print:block print-break-avoid">
        <h3 className="mb-2 text-h3">ການທົບທວນ ແລະ ອະນຸມັດ <span className="text-caption text-ink-3">§7.5 · §9.3</span></h3>
        <div className="grid grid-cols-3 gap-4">
          <SignBox role="ຜູ້ຈັດທຳ" title="ຫົວໜ້າທີມ Helpdesk" />
          <SignBox role="ຜູ້ທົບທວນ" title="ຫົວໜ້າໄອທີ" />
          <SignBox role="ຜູ້ອະນຸມັດ" title="ຜູ້ບໍລິຫານ" />
        </div>
        <p className="mt-3 text-caption text-ink-3">
          ອອກລາຍງານເມື່ອ {formatDateTime(d.document.generated_at)} ໂດຍ {user.full_name}
        </p>
      </section>
    </article>
  );
}

/** เหตุผลของคำตัดสินเป็นประโยคธรรมดา — ไม่มีรหัส KPI */
function verdictReasons(d: ServicePerformanceReport, kpi1: number | null): string[] {
  const out: string[] = [];
  if (d.summary.failing.includes('KPI-1') && kpi1 !== null) {
    out.push(`ແກ້ໄຂທັນເວລາພຽງ ${formatPercent(kpi1)} — ເປົ້າແມ່ນ 95%`);
  }
  if (d.summary.p1_resolution_breaches > 0) {
    out.push(`ມີເຫດ P1 (ວິກິດ) ເກີນກຳນົດແກ້ໄຂ ${d.summary.p1_resolution_breaches} ເລື່ອງ — P1 ຕ້ອງທັນທຸກເລື່ອງ`);
  }
  for (const code of d.summary.failing) {
    if (code === 'KPI-1') continue;
    const k = d.kpi.items.find((x) => x.code === code);
    const text = KPI_TEXT[code];
    if (k && text && k.value !== null) {
      const unit = k.unit === 'percent' ? '%' : k.unit === 'score' ? ' / 5' : '';
      out.push(`${text.name} ${k.value}${unit} — ເປົ້າ ${k.direction === 'higher' ? '≥' : '≤'} ${k.target}${unit}`);
    }
  }
  if (out.length === 0 && d.summary.status === 'on_target') out.push('ທຸກຕົວຊີ້ວັດທີ່ວັດໄດ້ຢູ່ໃນເປົ້າໝາຍ');
  return out;
}

// ── สิ่งที่ต้องจัดการ ──────────────────────────────────────────────────

function ActionList({ d, overdueNow }: { d: ServicePerformanceReport; overdueNow: number }): React.JSX.Element {
  const p12 = d.breaches.resolution_p1_p2;
  const failingSystems = d.availability.filter((s) => s.meets_target === false);
  const items: React.ReactNode[] = [];

  if (d.improvement.sip_required) {
    const names = d.improvement.failing.map((c) => KPI_TEXT[c]?.name ?? c).join(', ');
    items.push(
      <ActionRow key="sip" tone="breach" title="ຈັດທຳແຜນປັບປຸງບໍລິການ (SIP)">
        ເພາະ {names} ຕ່ຳກວ່າເປົ້າ — ລະບຸສາເຫດ ມາດຕະການ ຜູ້ຮັບຜິດຊອບ ແລະ ກຳນົດເສັດ
      </ActionRow>,
    );
  }
  if (p12.length > 0) {
    items.push(
      <ActionRow key="p12" tone="breach" title={`ເລື່ອງ P1 / P2 ທີ່ເກີນກຳນົດແກ້ໄຂ ${p12.length} ເລື່ອງ`}>
        <ul className="mt-1 grid gap-1">
          {p12.slice(0, 5).map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <PriorityBadge priority={t.priority} withMeter={false} />
              <Link href={`/tickets/${t.id}`} className="font-mono text-caption font-semibold text-primary hover:underline">
                {t.ticket_no}
              </Link>
              <span className="min-w-0 truncate text-body-sm text-ink">{t.subject}</span>
              <span className="text-caption text-ink-3">· {t.assignee_name ?? 'ຍັງບໍ່ມີຜູ້ຮັບຜິດຊອບ'}</span>
            </li>
          ))}
          {p12.length > 5 && <li className="text-caption text-ink-3">ແລະ ອີກ {p12.length - 5} ເລື່ອງ — ເບິ່ງແທັບ "ເຫດຮ້າຍແຮງ"</li>}
        </ul>
      </ActionRow>,
    );
  }
  if (overdueNow > 0) {
    items.push(
      <ActionRow key="overdue" tone="risk" title={`ເລື່ອງທີ່ຍັງເປີດ ແລະ ເກີນກຳນົດແລ້ວ ${overdueNow} ເລື່ອງ`}>
        ໃຫ້ຫົວໜ້າທີມທົບທວນ ແລະ ມອບໝາຍຄືນໃນຄິວວຽກ
      </ActionRow>,
    );
  }
  if (d.problems.rca_overdue > 0) {
    items.push(
      <ActionRow key="rca" tone="risk" title={`ລາຍງານສາເຫດຮາກ (RCA) ເກີນກຳນົດ ${d.problems.rca_overdue} ເລື່ອງ`}>
        RCA ຂອງເຫດ P1 ຕ້ອງສົ່ງພາຍໃນ 5 ມື້ເຮັດວຽກ
      </ActionRow>,
    );
  }
  if (failingSystems.length > 0) {
    items.push(
      <ActionRow key="sys" tone="risk" title={`ລະບົບທີ່ພ້ອມໃຊ້ຕ່ຳກວ່າເປົ້າ ${failingSystems.length} ລະບົບ`}>
        {failingSystems.map((s) => s.service.name_th).join(', ')}
      </ActionRow>,
    );
  }

  return (
    <Card className="print-break-avoid">
      <CardBody className="grid gap-3">
        <h3 className="text-h3">ສິ່ງທີ່ຕ້ອງຈັດການ</h3>
        {items.length === 0 ? (
          <p className="inline-flex items-center gap-2 text-body-sm text-sla-ok">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ບໍ່ມີຫຍັງຕ້ອງຈັດການດ່ວນໃນເດືອນນີ້
          </p>
        ) : (
          <ul className="grid gap-2">{items}</ul>
        )}
      </CardBody>
    </Card>
  );
}

function ActionRow({
  tone,
  title,
  children,
}: {
  tone: 'breach' | 'risk';
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <li className={cn('rounded border-l-4 bg-subtle px-3 py-2', tone === 'breach' ? 'border-sla-breach' : 'border-sla-risk')}>
      <p className="text-body-sm font-semibold text-ink">{title}</p>
      <div className="text-body-sm text-ink-2">{children}</div>
    </li>
  );
}

// ── แท็บรายละเอียด ────────────────────────────────────────────────────

function Panel({ tab, active, children }: { tab: TabKey; active: TabKey; children: React.ReactNode }): React.JSX.Element {
  const meta = TABS.find((t) => t.key === tab)!;
  return (
    <div
      role="tabpanel"
      id={`panel-${tab}`}
      aria-labelledby={`tab-${tab}`}
      // ซ่อนบนจอเมื่อไม่ได้เลือก แต่พิมพ์ทุกแท็บเสมอ
      className={cn(active !== tab && 'hidden', 'print:block print-break-avoid')}
    >
      <h3 className="mb-3 hidden text-h3 print:block">
        {meta.label} <span className="text-caption text-ink-3">{meta.clause}</span>
      </h3>
      {children}
    </div>
  );
}

function PriorityDetail({ d, goal }: { d: ServicePerformanceReport; goal: number }): React.JSX.Element {
  return (
    <div className="grid gap-3">
      {d.sla_by_priority.map((r) => {
        const unit = r.clock_mode === 'calendar_24x7' ? 'calendar_minutes' : 'business_minutes';
        // เป้าของ P1 คือทันทุกเรื่อง ระดับอื่นใช้เป้าเดียวกับ "แก้ไขทันเวลา"
        const target = r.priority === 'P1' ? 100 : goal;
        return (
          <Card key={r.priority}>
            <CardBody className="grid gap-4 sm:grid-cols-[140px_1fr_1fr] sm:items-center">
              <div>
                <PriorityBadge priority={r.priority} withMeter={false} />
                <p className="mt-1 text-caption text-ink-3">ເປົ້າ {target}% ຂອງເລື່ອງ</p>
              </div>
              <RatioBar
                title="ຕອບຮັບທັນ"
                sub={`ພາຍໃນ ${formatMinutes(r.response_target_minutes, unit)}`}
                met={r.response.met}
                of={r.response.eligible}
                percent={r.response.percent}
                target={target}
              />
              <RatioBar
                title="ແກ້ໄຂທັນ"
                sub={`ພາຍໃນ ${formatMinutes(r.resolution_target_minutes, unit)}`}
                met={r.resolution.met}
                of={r.resolution.eligible}
                percent={r.resolution.percent}
                target={target}
              />
            </CardBody>
          </Card>
        );
      })}
      <p className="text-caption text-ink-3">
        ຕອບຮັບ: ເລື່ອງທີ່ແຈ້ງເຂົ້າໃນເດືອນນີ້ ແລະ ຮູ້ຜົນແລ້ວ · ແກ້ໄຂ: ເລື່ອງທີ່ແກ້ເສັດໃນເດືອນນີ້ · ເລື່ອງທີ່ມີເຫດຍົກເວັ້ນ SLA ບໍ່ນັບ
      </p>
    </div>
  );
}

function RatioBar({
  title,
  sub,
  met,
  of,
  percent,
  target,
}: {
  title: string;
  sub: string;
  met: number;
  of: number;
  percent: number | null;
  target: number;
}): React.JSX.Element {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body-sm font-semibold text-ink">
          {title} <span className="font-normal text-ink-3">{sub}</span>
        </span>
        <span className="tabular text-body-sm">
          {percent === null ? (
            <span className="text-ink-3">ຍັງບໍ່ມີເລື່ອງ</span>
          ) : (
            <>
              <b className={percent >= target ? 'text-sla-ok' : 'text-sla-breach'}>{formatPercent(percent)}</b>
              <span className="ml-1 text-caption text-ink-3">
                {met} ຈາກ {of}
              </span>
            </>
          )}
        </span>
      </div>
      <TargetBar value={percent} target={target} label={`${title} ${percent ?? '—'}% ເປົ້າ ${target}%`} />
    </div>
  );
}

function VolumeDetail({
  d,
  created,
  resolved,
  openNow,
  overdueNow,
}: {
  d: ServicePerformanceReport;
  created: number;
  resolved: number;
  openNow: number;
  overdueNow: number;
}): React.JSX.Element {
  const maxBacklog = Math.max(1, ...d.volume.backlog.map((b) => b.open));
  const maxCat = Math.max(1, ...d.volume.top_categories.map((c) => c.count));

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Figure label="ເລື່ອງໃໝ່" value={created} sub={`ເຫດຂັດຂ້ອງ ${d.volume.created.incident} · ຄຳຂໍ ${d.volume.created.service_request}`} />
        <Figure label="ແກ້ໄຂແລ້ວ" value={resolved} sub={`ເຫດຂັດຂ້ອງ ${d.volume.resolved.incident} · ຄຳຂໍ ${d.volume.resolved.service_request}`} />
        <Figure label="ປິດເລື່ອງ" value={d.volume.closed} />
        <Figure label="ຍັງຄ້າງຢູ່" value={openNow} sub={`ເກີນກຳນົດ ${overdueNow}`} alert={overdueNow > 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody className="grid gap-3">
            <h4 className="text-body-sm font-semibold">ເລື່ອງທີ່ຍັງຄ້າງ ແຍກຕາມລະດັບ</h4>
            {d.volume.backlog.map((b) => (
              <div key={b.priority} className="grid grid-cols-[72px_1fr_auto] items-center gap-3">
                <PriorityBadge priority={b.priority} withMeter={false} />
                <div className="h-2.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${b.open ? Math.max((b.open / maxBacklog) * 100, 3) : 0}%`, background: `var(--${b.priority.toLowerCase()}-solid)` }}
                  />
                </div>
                <span className="tabular text-body-sm">
                  {b.open}
                  {b.overdue > 0 && <span className="ml-1 text-caption text-sla-breach">(ເກີນ {b.overdue})</span>}
                </span>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid gap-3">
            <h4 className="text-body-sm font-semibold">ແຈ້ງເຂົ້າຫຼາຍທີ່ສຸດ</h4>
            {d.volume.top_categories.length === 0 ? (
              <p className="text-body-sm text-ink-3">ຍັງບໍ່ມີເລື່ອງໃນເດືອນນີ້</p>
            ) : (
              d.volume.top_categories.map((c) => (
                <div key={c.name} className="grid gap-1">
                  <div className="flex justify-between gap-3 text-body-sm">
                    <span className="min-w-0 truncate" title={c.name}>
                      {c.name}
                    </span>
                    <span className="tabular font-semibold">{c.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max((c.count / maxCat) * 100, 3)}%` }} />
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      {d.volume.by_company.length > 0 && (
        <Card>
          <CardBody className="grid gap-3">
            <h4 className="text-body-sm font-semibold">ແຍກຕາມບໍລິສັດ</h4>
            <div className="grid gap-3">
              {d.volume.by_company.map((r) => (
                <div key={r.company.id} className="grid gap-2 sm:grid-cols-[110px_1fr_140px] sm:items-center">
                  <span className="font-semibold">{r.company.code}</span>
                  <div className="grid gap-1">
                    <span className="text-caption text-ink-3">
                      ເລື່ອງໃໝ່ {r.created} · ແກ້ໄຂແລ້ວ {r.done} · ທັນເວລາ {r.sla_met_percent === null ? '—' : formatPercent(r.sla_met_percent)}
                    </span>
                    <TargetBar value={r.sla_met_percent} target={95} label={`${r.company.code} ທັນເວລາ ${r.sla_met_percent ?? '—'}%`} />
                  </div>
                  <span className="text-caption text-ink-2 sm:text-right">
                    ຄວາມພໍໃຈ {r.csat_avg === null ? '—' : `${r.csat_avg.toFixed(1)} / 5`}
                  </span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function MajorDetail({ d }: { d: ServicePerformanceReport }): React.JSX.Element {
  const p34 = d.breaches.resolution_p3_p4;
  return (
    <div className="grid gap-4">
      <Card>
        <CardBody className="grid gap-3">
          <h4 className="text-body-sm font-semibold">ເຫດຮ້າຍແຮງ ແລະ ເຫດຄວາມປອດໄພ</h4>
          {d.major_incidents.length === 0 ? (
            <p className="text-body-sm text-ink-3">ບໍ່ມີໃນເດືອນນີ້</p>
          ) : (
            <ul className="divide-y divide-hair">
              {d.major_incidents.map((r) => (
                <li key={r.id} className="grid gap-1 py-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={r.priority} withMeter={false} />
                      <Link href={`/tickets/${r.id}`} className="font-mono text-caption font-semibold text-primary hover:underline">
                        {r.ticket_no}
                      </Link>
                      {r.is_security_incident && (
                        <span className="rounded-full bg-sla-breach-bg px-2 text-caption font-semibold text-sla-breach">ຄວາມປອດໄພ</span>
                      )}
                      <span className="text-caption text-ink-3">{r.company_code}</span>
                    </div>
                    <p className="truncate text-body-sm text-ink">{r.subject}</p>
                    <p className="text-caption text-ink-3">
                      ເປີດ {formatDateTime(r.created_at)}
                      {r.resolved_at ? ` · ແກ້ໄຂ ${formatDateTime(r.resolved_at)}` : ''} ·{' '}
                      {r.problem
                        ? r.problem.rca_submitted_at
                          ? `RCA ສົ່ງແລ້ວ ${formatDate(r.problem.rca_submitted_at)}`
                          : `RCA ກຳນົດ ${formatDate(r.problem.rca_due_at)}`
                        : 'ຍັງບໍ່ໄດ້ເປີດ Problem'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!r.resolved_at && <StatusBadge status={r.status} />}
                    <VerdictChip meets={r.resolved_at || r.breached ? !r.breached : null} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-3">
          <h4 className="text-body-sm font-semibold">ເກີນກຳນົດ SLA</h4>
          <div className="grid gap-3 sm:grid-cols-4">
            <Figure label="ຕອບຮັບຊ້າ" value={d.breaches.response_breached} alert={d.breaches.response_breached > 0} />
            <Figure label="ແກ້ໄຂຊ້າ P1 · P2" value={d.breaches.resolution_p1_p2.length} alert={d.breaches.resolution_p1_p2.length > 0} />
            {p34.map((r) => (
              <Figure key={r.priority} label={`ແກ້ໄຂຊ້າ ${r.priority}`} value={r.count} alert={r.count > 0} />
            ))}
          </div>
          {d.breaches.resolution_p1_p2.length > 0 && (
            <ul className="divide-y divide-hair">
              {d.breaches.resolution_p1_p2.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-body-sm">
                  <PriorityBadge priority={t.priority} withMeter={false} />
                  <Link href={`/tickets/${t.id}`} className="font-mono text-caption font-semibold text-primary hover:underline">
                    {t.ticket_no}
                  </Link>
                  <span className="min-w-0 flex-1 truncate">{t.subject}</span>
                  <span className="text-caption text-ink-3">
                    {t.assignee_name ?? 'ຍັງບໍ່ມີຜູ້ຮັບຜິດຊອບ'} · ກຳນົດ {formatDateTime(t.due_at)}
                  </span>
                  {!t.resolved_at && <StatusBadge status={t.status} />}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function SystemsDetail({ d }: { d: ServicePerformanceReport }): React.JSX.Element {
  const withDowntime = d.availability.filter((s) => s.down_minutes > 0);
  const clean = d.availability.length - withDowntime.length;
  return (
    <div className="grid gap-4">
      <Card>
        <CardBody className="grid gap-3">
          <h4 className="text-body-sm font-semibold">ຄວາມພ້ອມໃຊ້ງານຂອງລະບົບ</h4>
          {withDowntime.length === 0 ? (
            <p className="inline-flex items-center gap-2 text-body-sm text-sla-ok">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              ທຸກລະບົບ ({d.availability.length}) ບໍ່ມີການຢຸດທີ່ບໍ່ໄດ້ວາງແຜນ
            </p>
          ) : (
            <>
              {withDowntime.map((s) => (
                <div key={s.service.id} className="grid gap-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-body-sm">
                    <span>
                      {s.service.name_th} <span className="text-caption text-ink-3">· {s.tier}</span>
                    </span>
                    <span className="tabular">
                      <b className={s.meets_target ? 'text-sla-ok' : 'text-sla-breach'}>
                        {s.uptime_percent === null ? '—' : `${s.uptime_percent.toFixed(2)}%`}
                      </b>
                      <span className="ml-1 text-caption text-ink-3">
                        ຢຸດ {s.outages} ຄັ້ງ · {formatMinutes(s.down_minutes, 'calendar_minutes')}
                      </span>
                    </span>
                  </div>
                  <TargetBar
                    value={s.uptime_percent}
                    target={s.target_percent ?? 99}
                    min={95}
                    max={100}
                    targetLabel={s.target_percent === null ? undefined : `ເປົ້າ ${s.target_percent}%`}
                    label={`${s.service.name_th} ${s.uptime_percent ?? '—'}%`}
                  />
                </div>
              ))}
              {clean > 0 && <p className="text-caption text-ink-3">ອີກ {clean} ລະບົບບໍ່ມີການຢຸດ (100%)</p>}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-3">
          <h4 className="text-body-sm font-semibold">Problem ແລະ ການວິເຄາະສາເຫດຮາກ</h4>
          <div className="grid gap-3 sm:grid-cols-4">
            <Figure label="ເປີດໃໝ່" value={d.problems.opened} />
            <Figure label="ປິດແລ້ວ" value={d.problems.closed} />
            <Figure label="ຍັງເປີດຢູ່" value={d.problems.open_now} />
            <Figure label="RCA ເກີນກຳນົດ" value={d.problems.rca_overdue} alert={d.problems.rca_overdue > 0} />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function AllKpis({ d }: { d: ServicePerformanceReport }): React.JSX.Element {
  return (
    <Card>
      <CardBody className="grid gap-4">
        {d.kpi.items.map((k) => {
          const text = KPI_TEXT[k.code] ?? { name: k.name, hint: '' };
          const unit = k.unit === 'percent' ? '%' : k.unit === 'score' ? ' / 5' : '';
          const fmt = (v: number) => (k.unit === 'score' ? `${v.toFixed(1)}${unit}` : `${v}${unit}`);
          const prev = d.kpi_previous.items.find((x) => x.code === k.code)?.value ?? null;
          const isScore = k.unit === 'score';
          return (
            <div key={k.code} className="grid gap-2 border-b border-hair pb-4 last:border-0 last:pb-0 sm:grid-cols-[1fr_260px] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body-sm font-semibold">{text.name}</span>
                  <VerdictChip meets={k.meets_target} />
                </div>
                <p className="text-caption text-ink-3">
                  {text.hint} · ຖານ {formatNumber(k.denominator)} · {k.code}
                </p>
                <Trend value={k.value} prev={prev} direction={k.direction} format={fmt} />
              </div>
              <div className="grid gap-1">
                <span className="tabular text-right text-h3">{k.value === null ? '—' : fmt(k.value)}</span>
                <TargetBar
                  value={k.value}
                  target={k.target}
                  min={isScore ? 1 : 0}
                  max={isScore ? 5 : 100}
                  direction={k.direction}
                  targetLabel={`ເປົ້າ ${k.direction === 'higher' ? '≥' : '≤'} ${fmt(k.target)}`}
                  label={`${text.name} ${k.value ?? '—'}`}
                />
              </div>
            </div>
          );
        })}
        <p className="text-caption text-ink-3">
          ເວລາຕອບຮັບຄັ້ງທຳອິດສະເລ່ຍແຍກຕາມລະດັບ ຢູ່ໃນແທັບ "ຕາມລະດັບຄວາມສຳຄັນ" · ເລື່ອງຄ້າງທີ່ເກີນກຳນົດວັດ ຕອນອອກລາຍງານ
        </p>
      </CardBody>
    </Card>
  );
}

function Figure({ label, value, sub, alert = false }: { label: string; value: number; sub?: string; alert?: boolean }): React.JSX.Element {
  return (
    <div className="rounded border border-hair bg-surface px-3 py-2">
      <p className="text-caption text-ink-3">{label}</p>
      <p className={cn('tabular text-h3', alert && 'text-sla-breach')}>{formatNumber(value)}</p>
      {sub && <p className="text-caption text-ink-3">{sub}</p>}
    </div>
  );
}

function SignBox({ role, title }: { role: string; title: string }): React.JSX.Element {
  return (
    <div className="grid gap-3 rounded border border-hair p-3 text-body-sm">
      <div>
        <p className="font-semibold">{role}</p>
        <p className="text-caption text-ink-3">{title}</p>
      </div>
      <p className="border-b border-dashed border-control pb-5 text-caption text-ink-3">ຊື່ ແລະ ລາຍເຊັນ</p>
      <p className="border-b border-dashed border-control pb-1 text-caption text-ink-3">ວັນທີ</p>
    </div>
  );
}

