'use client';

import { Crown, Download, LayoutGrid, Printer, Rows3 } from 'lucide-react';
import * as React from 'react';

import { currentMonth, MonthPicker, monthLabel, monthRange } from '@/components/reports/month-picker';
import { filterRows, ReportSearch, SummaryStrip } from '@/components/reports/report-layout';
import { TargetBar } from '@/components/reports/target-bar';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Select } from '@/components/ui/field';
import { Alert, BackLink, PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { cn } from '@/lib/cn';
import { formatPercent } from '@/lib/format';
import { useTeamKpiReport, type TeamKpiMetrics, type TeamKpiReport, type TeamKpiRow } from '@/lib/queries/iso-reports';

/**
 * KPI ของทีมสนับสนุน — อิง SLA (ตอบรับ · แก้ไข) และคะแนนที่ผู้ใช้ให้ (ISO/IEC 20000-1 §7.2)
 *
 * แสดงเป็นการ์ดรายคน: คะแนนรวมตัวใหญ่ + สามแถบเทียบเส้นเป้า อ่านจบในการ์ดเดียว
 * ตารางยังมีให้สลับดูเมื่ออยากเทียบหลายคนพร้อมกัน — แต่ไม่ใช่มุมมองแรก
 *
 * เป้าหมาย น้ำหนัก และเกณฑ์ตัวอย่างขั้นต่ำมาจาก API (rules) ไม่ได้ฝังไว้ที่หน้าจอ
 */
export default function TeamKpiPage(): React.JSX.Element {
  const [month, setMonth] = React.useState(currentMonth);
  const [teamId, setTeamId] = React.useState('');
  // ตารางเป็นค่าเริ่มต้น: หน้ารายงานทุกหน้าในระบบเริ่มด้วยตารางเหมือนกันหมด
  const [view, setView] = React.useState<'cards' | 'table'>('table');
  const { from, to } = monthRange(month);
  const query = useTeamKpiReport(from, to, teamId);
  const d = query.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <BackLink href="/reports" label="ກັບໄປສູນລາຍງານ" />
      </div>
      <div className="print:hidden">
        <PageHeader
          title="KPI ທີມ Support"
          description="ໃຜເຮັດວຽກໄດ້ຕາມເປົ້າ — ອີງຕາມ SLA ແລະ ຄະແນນທີ່ຜູ້ໃຊ້ໃຫ້"
          actions={
            <>
              <MonthPicker value={month} onChange={setMonth} />
              {d && d.visibility === 'team' && d.teams.length > 0 && (
                <Select
                  id="team-filter"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  aria-label="ເລືອກທີມ"
                  className="w-auto"
                >
                  <option value="">ທຸກຄົນ</option>
                  {d.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
              <Button variant="secondary" onClick={() => d && downloadCsv(d, month)} disabled={!d}>
                <Download className="h-4 w-4" aria-hidden="true" />
                CSV
              </Button>
              <Button variant="secondary" onClick={() => window.print()} disabled={!d}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                ພິມ
              </Button>
            </>
          }
        />
      </div>

      <QueryBoundary query={query}>{d && <Content d={d} month={month} view={view} onView={setView} />}</QueryBoundary>
    </div>
  );
}

function Content({
  d,
  month,
  view,
  onView,
}: {
  d: TeamKpiReport;
  month: string;
  view: 'cards' | 'table';
  onView: (v: 'cards' | 'table') => void;
}): React.JSX.Element {
  const team = d.selected_team_id ? d.teams.find((x) => x.id === d.selected_team_id)?.name : null;
  const [term, setTerm] = React.useState('');
  /* ค้นด้วยชื่อเจ้าหน้าที่หรือชื่อทีม — ทีมใหญ่มีสิบกว่าคน การกวาดตาหาชื่อช้ากว่าพิมพ์ */
  const rows = filterRows(d.rows, term, (r) => `${r.user.full_name} ${r.teams.map((t) => t.name).join(' ')}`);
  const ranked = rows.filter((r) => r.enough_data);
  const pending = rows.filter((r) => !r.enough_data);

  return (
    <>
      <div className="hidden print:block">
        <p className="text-caption text-ink-3">KPI ທີມ Support · ISO/IEC 20000-1 §7.2</p>
        <h2 className="text-h2">
          ຜົນງານທີມ Support ເດືອນ {monthLabel(month)}
          {team ? ` · ${team}` : ''}
        </h2>
      </div>

      {d.visibility === 'self' ? (
        <Alert tone="info" title="ສະແດງສະເພາະຜົນງານຂອງທ່ານ">
          ຕົວເລກຂອງເພື່ອນຮ່ວມທີມເຫັນໄດ້ສະເພາະຫົວໜ້າທີມ ຜູ້ດູແລ ແລະ ຜູ້ບໍລິຫານ
        </Alert>
      ) : (
        <TeamSummary d={d} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-h3">ລາຍບຸກຄົນ</h3>
          <ReportSearch
            value={term}
            onChange={setTerm}
            placeholder="ຄົ້ນຫາຊື່ເຈົ້າໜ້າທີ່..."
            count={rows.length}
          />
        </div>
        <div role="group" aria-label="ຮູບແບບການສະແດງ" className="inline-flex rounded border border-control p-0.5">
          <ViewButton active={view === 'cards'} onClick={() => onView('cards')} icon={LayoutGrid} label="ບັດ" />
          <ViewButton active={view === 'table'} onClick={() => onView('table')} icon={Rows3} label="ຕາຕະລາງ" />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-hair px-4 py-6 text-body-sm text-ink-3">ບໍ່ມີຂໍ້ມູນໃນເດືອນນີ້</p>
      ) : view === 'cards' ? (
        <div className="grid gap-5">
          {ranked.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {ranked.map((r, i) => (
                <PersonCard key={r.user.id} r={r} rank={i + 1} d={d} />
              ))}
            </div>
          )}
          {pending.length > 0 && (
            <div className="grid gap-2">
              <p className="text-body-sm text-ink-2">
                ຍັງບໍ່ຈັດອັນດັບ — ແກ້ໄຂແລ້ວບໍ່ເຖິງ {d.rules.min_sample} ເລື່ອງໃນເດືອນນີ້ ຕົວເລກຍັງບໍ່ພໍທີ່ຈະສະຫຼຸບ
              </p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {pending.map((r) => (
                  <PersonCard key={r.user.id} r={r} rank={null} d={d} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <PeopleTable d={d} rows={rows} />
      )}

      <details className="rounded-lg border border-hair bg-surface px-4 py-3 print:hidden">
        <summary className="cursor-pointer text-body-sm font-semibold text-ink">ຄະແນນຄິດໄລ່ແນວໃດ?</summary>
        <ul className="mt-3 grid gap-1.5 text-body-sm text-ink-2">
          <li>
            <b className="text-ink">ຕອບຮັບທັນ</b> — ເລື່ອງໃໝ່ໃນເດືອນນີ້ ທີ່ຕອບຜູ້ແຈ້ງກ່ອນກຳນົດ (ເປົ້າ ≥{' '}
            {d.rules.targets.response_met_percent}%)
          </li>
          <li>
            <b className="text-ink">ແກ້ໄຂທັນ</b> — ເລື່ອງທີ່ແກ້ເສັດໃນເດືອນນີ້ ກ່ອນກຳນົດ (ເປົ້າ ≥{' '}
            {d.rules.targets.resolution_met_percent}%) · ເລື່ອງທີ່ມີເຫດຍົກເວັ້ນ SLA ບໍ່ນັບ
          </li>
          <li>
            <b className="text-ink">ຄວາມພໍໃຈ</b> — ຄະແນນ 1–5 ທີ່ຜູ້ໃຊ້ໃຫ້ຕອນປິດເລື່ອງ (ເປົ້າ ≥ {d.rules.targets.csat_avg})
          </li>
          <li>
            <b className="text-ink">ຄະແນນລວມ 100</b> = ແກ້ໄຂທັນ {d.rules.weights.resolution}% + ຕອບຮັບທັນ{' '}
            {d.rules.weights.response}% + ຄວາມພໍໃຈ {d.rules.weights.csat}% · ສ່ວນທີ່ຍັງບໍ່ມີຂໍ້ມູນບໍ່ນັບເປັນ 0
          </li>
          <li>ນັບຕາມຜູ້ຮັບຜິດຊອບປັດຈຸບັນ — ເລື່ອງທີ່ຖືກໂອນ ຜົນງານຕົກກັບຄົນສຸດທ້າຍ</li>
        </ul>
      </details>
    </>
  );
}

function TeamSummary({ d }: { d: TeamKpiReport }): React.JSX.Element {
  const t = d.totals;
  const tone = (meets: boolean | null): 'good' | 'bad' | 'neutral' =>
    meets === null ? 'neutral' : meets ? 'good' : 'bad';

  return (
    <SummaryStrip
      items={[
        {
          label: 'ຄະແນນທີມ',
          value: t.score === null ? '—' : String(t.score),
          sub: `ຈາກ 100 · ແກ້ໄຂ ${t.resolved} ເລື່ອງ`,
          tone: t.score === null ? 'neutral' : t.score >= 80 ? 'good' : t.score >= 60 ? 'warn' : 'bad',
        },
        {
          label: `ຕອບຮັບທັນ (ເປົ້າ ≥ ${d.rules.targets.response_met_percent}%)`,
          value: t.response.percent === null ? '—' : formatPercent(t.response.percent),
          sub: `${t.response.met} ຈາກ ${t.response.eligible} ເລື່ອງ`,
          tone: tone(t.meets.response),
        },
        {
          label: `ແກ້ໄຂທັນ (ເປົ້າ ≥ ${d.rules.targets.resolution_met_percent}%)`,
          value: t.resolution.percent === null ? '—' : formatPercent(t.resolution.percent),
          sub: `${t.resolution.met} ຈາກ ${t.resolution.eligible} ເລື່ອງ`,
          tone: tone(t.meets.resolution),
        },
        {
          label: `ຄວາມພໍໃຈ (ເປົ້າ ≥ ${d.rules.targets.csat_avg})`,
          value: t.csat.avg === null ? '—' : t.csat.avg.toFixed(1),
          sub: `${t.csat.count} ຄະແນນ`,
          tone: tone(t.meets.csat),
        },
      ]}
    />
  );
}

function PersonCard({ r, rank, d }: { r: TeamKpiRow; rank: number | null; d: TeamKpiReport }): React.JSX.Element {
  const lead = r.teams.some((t) => t.is_lead);
  return (
    <Card className={cn('print-break-avoid', !r.enough_data && 'bg-subtle')}>
      <CardBody className="grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-semibold text-ink">
              {rank !== null && <span className="tabular text-caption text-ink-3">#{rank}</span>}
              <span className="truncate">{r.user.full_name}</span>
              {lead && <Crown className="h-3.5 w-3.5 flex-none text-primary" aria-label="ຫົວໜ້າທີມ" />}
            </p>
            <p className="truncate text-caption text-ink-3">{r.teams.map((t) => t.name).join(' · ') || 'ບໍ່ໄດ້ຢູ່ໃນທີມ'}</p>
          </div>
          <div className="flex-none text-right">
            {r.enough_data ? (
              <>
                <p className={cn('tabular text-h2 leading-none', scoreTone(r.score))}>{r.score ?? '—'}</p>
                <p className="text-caption text-ink-3">ຄະແນນ</p>
              </>
            ) : (
              <span className="rounded-full bg-surface px-2 py-0.5 text-caption text-ink-3">ຂໍ້ມູນໜ້ອຍ</span>
            )}
          </div>
        </div>

        <div className="grid gap-3">
          <MetricBar title="ຕອບຮັບທັນ" value={r.response.percent} target={d.rules.targets.response_met_percent} detail={`${r.response.met} ຈາກ ${r.response.eligible}`} />
          <MetricBar title="ແກ້ໄຂທັນ" value={r.resolution.percent} target={d.rules.targets.resolution_met_percent} detail={`${r.resolution.met} ຈາກ ${r.resolution.eligible}`} />
          <MetricBar
            title="ຄວາມພໍໃຈ"
            value={r.csat.avg}
            target={d.rules.targets.csat_avg}
            min={1}
            max={5}
            score
            detail={r.csat.count === 0 ? 'ຍັງບໍ່ມີຄະແນນ' : `${r.csat.count} ຄະແນນ${r.csat.low > 0 ? ` · ຕ່ຳ ${r.csat.low}` : ''}`}
          />
        </div>

        <p className="border-t border-hair pt-3 text-caption text-ink-2">
          ແກ້ໄຂແລ້ວ <b className="tabular text-ink">{r.resolved}</b> ເລື່ອງ · ຄ້າງ <b className="tabular text-ink">{r.open_now}</b>
          {r.overdue_now > 0 && <span className="font-semibold text-sla-breach"> (ເກີນກຳນົດ {r.overdue_now})</span>}
          {r.reopen_percent !== null && r.reopen_percent > 0 && ` · ຖືກເປີດຄືນ ${formatPercent(r.reopen_percent)}`}
        </p>
      </CardBody>
    </Card>
  );
}

/** หนึ่งตัวชี้วัด: ชื่อ · ค่า · ฐาน · แถบเทียบเป้า */
function MetricBar({
  title,
  value,
  target,
  detail,
  min = 0,
  max = 100,
  score = false,
}: {
  title: string;
  value: number | null;
  target: number;
  detail: string;
  min?: number;
  max?: number;
  score?: boolean;
}): React.JSX.Element {
  const fmt = (v: number) => (score ? v.toFixed(1) : formatPercent(v));
  const ok = value === null ? null : value >= target;
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body-sm text-ink">{title}</span>
        <span className="tabular text-body-sm">
          <b className={cn(ok === true && 'text-sla-ok', ok === false && 'text-sla-breach', ok === null && 'text-ink-3')}>
            {value === null ? '—' : fmt(value)}
          </b>
          <span className="ml-1 text-caption text-ink-3">{detail}</span>
        </span>
      </div>
      <TargetBar
        value={value}
        target={target}
        min={min}
        max={max}
        label={`${title} ${value === null ? 'ຍັງບໍ່ມີຂໍ້ມູນ' : fmt(value)} ເປົ້າ ${fmt(target)}`}
      />
    </div>
  );
}

function PeopleTable({ d, rows }: { d: TeamKpiReport; rows: TeamKpiRow[] }): React.JSX.Element {
  const t = d.rules.targets;
  const columns: Column<TeamKpiRow>[] = [
    {
      key: 'name',
      header: 'ເຈົ້າໜ້າທີ່',
      render: (r) => (
        <span className={cn('font-medium', r.enough_data ? 'text-ink' : 'text-ink-3')}>
          {r.user.full_name}
          {!r.enough_data && <span className="ml-2 text-caption font-normal text-ink-3">ຂໍ້ມູນໜ້ອຍ</span>}
        </span>
      ),
    },
    {
      key: 'score',
      header: 'ຄະແນນ',
      align: 'right',
      width: '10%',
      render: (r) => (
        <span className={cn('tabular font-semibold', r.enough_data && scoreTone(r.score))}>
          {r.score ?? '—'}
        </span>
      ),
    },
    {
      key: 'response',
      header: `ຕອບຮັບທັນ (≥${t.response_met_percent}%)`,
      align: 'right',
      render: (r) => cell(r.response.percent, r.meets.response, formatPercent),
    },
    {
      key: 'resolution',
      header: `ແກ້ໄຂທັນ (≥${t.resolution_met_percent}%)`,
      align: 'right',
      render: (r) => cell(r.resolution.percent, r.meets.resolution, formatPercent),
    },
    {
      key: 'csat',
      header: `ຄວາມພໍໃຈ (≥${t.csat_avg})`,
      align: 'right',
      render: (r) => cell(r.csat.avg, r.meets.csat, (v) => v.toFixed(1)),
    },
    {
      key: 'resolved',
      header: 'ແກ້ໄຂແລ້ວ',
      align: 'right',
      hideBelow: 'xl',
      render: (r) => <span className="tabular">{r.resolved}</span>,
    },
    {
      key: 'open',
      header: 'ຄ້າງ (ເກີນກຳນົດ)',
      align: 'right',
      hideBelow: 'xl',
      render: (r) => (
        <span className="tabular">
          {r.open_now}
          {r.overdue_now > 0 && <span className="ml-1 text-sla-breach">({r.overdue_now})</span>}
        </span>
      ),
    },
  ];

  return (
    <Card>
      <CardBody>
        <DataTable
          striped
          columns={columns}
          rows={rows}
          rowKey={(r) => r.user.id}
          emptyTitle="ບໍ່ມີຂໍ້ມູນໃນເດືອນນີ້"
          caption="ຄະແນນ KPI ລາຍບຸກຄົນ"
        />
      </CardBody>
    </Card>
  );
}

function cell(value: number | null, meets: boolean | null, fmt: (v: number) => string): React.ReactNode {
  if (value === null) return <span className="text-ink-3">—</span>;
  return <span className={meets ? 'text-sla-ok' : 'text-sla-breach'}>{fmt(value)}</span>;
}

function ViewButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[36px] items-center gap-1.5 rounded px-3 text-body-sm font-semibold',
        active ? 'bg-primary text-white' : 'text-ink-2 hover:bg-subtle',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function scoreTone(score: number | null): string {
  if (score === null) return 'text-ink-3';
  if (score >= 90) return 'text-sla-ok';
  if (score >= 70) return 'text-sla-risk';
  return 'text-sla-breach';
}

/** ส่งออก CSV — มี BOM เพื่อให้ Excel อ่านอักษรลาวได้ถูก */
function downloadCsv(d: TeamKpiReport, month: string): void {
  const header = [
    'name',
    'teams',
    'score',
    'enough_data',
    'resolved',
    'response_percent',
    'response_met',
    'response_eligible',
    'resolution_percent',
    'resolution_met',
    'resolution_eligible',
    'csat_avg',
    'csat_count',
    'csat_low',
    'reopen_percent',
    'open_now',
    'overdue_now',
  ];
  const q = (v: string | number | boolean | null): string => {
    const s = v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const line = (m: TeamKpiMetrics, name: string, teams: string): string =>
    [
      name,
      teams,
      m.score,
      m.enough_data,
      m.resolved,
      m.response.percent,
      m.response.met,
      m.response.eligible,
      m.resolution.percent,
      m.resolution.met,
      m.resolution.eligible,
      m.csat.avg,
      m.csat.count,
      m.csat.low,
      m.reopen_percent,
      m.open_now,
      m.overdue_now,
    ]
      .map(q)
      .join(',');

  const body = [header.join(','), ...d.rows.map((r) => line(r, r.user.full_name, r.teams.map((t) => t.name).join(' · ')))];
  if (d.visibility === 'team') body.push(line(d.totals, 'TOTAL', ''));

  const blob = new Blob(['﻿' + body.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `team-kpi-${month}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
