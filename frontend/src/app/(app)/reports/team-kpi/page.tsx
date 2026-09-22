'use client';

import { Crown, Download, LayoutGrid, Printer, Rows3 } from 'lucide-react';
import * as React from 'react';

import { currentMonth, MonthPicker, monthLabel, monthRange } from '@/components/reports/month-picker';
import { TargetBar } from '@/components/reports/target-bar';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
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
  const [view, setView] = React.useState<'cards' | 'table'>('cards');
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
  const ranked = d.rows.filter((r) => r.enough_data);
  const pending = d.rows.filter((r) => !r.enough_data);

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
        <h3 className="text-h3">ລາຍບຸກຄົນ</h3>
        <div role="group" aria-label="ຮູບແບບການສະແດງ" className="inline-flex rounded border border-control p-0.5">
          <ViewButton active={view === 'cards'} onClick={() => onView('cards')} icon={LayoutGrid} label="ບັດ" />
          <ViewButton active={view === 'table'} onClick={() => onView('table')} icon={Rows3} label="ຕາຕະລາງ" />
        </div>
      </div>

      {d.rows.length === 0 ? (
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
        <PeopleTable d={d} />
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
  return (
    <Card>
      <CardBody className="grid gap-5 md:grid-cols-[180px_1fr] md:items-center">
        <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-1">
          <p className="text-caption text-ink-3">ຄະແນນທີມ</p>
          <p className={cn('tabular text-display leading-none', scoreTone(t.score))}>{t.score ?? '—'}</p>
          <p className="text-caption text-ink-3">
            ຈາກ 100 · ແກ້ໄຂ {t.resolved} ເລື່ອງ
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricBar title="ຕອບຮັບທັນ" value={t.response.percent} target={d.rules.targets.response_met_percent} detail={`${t.response.met} ຈາກ ${t.response.eligible}`} />
          <MetricBar title="ແກ້ໄຂທັນ" value={t.resolution.percent} target={d.rules.targets.resolution_met_percent} detail={`${t.resolution.met} ຈາກ ${t.resolution.eligible}`} />
          <MetricBar title="ຄວາມພໍໃຈ" value={t.csat.avg} target={d.rules.targets.csat_avg} min={1} max={5} score detail={`${t.csat.count} ຄະແນນ`} />
        </div>
      </CardBody>
    </Card>
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

function PeopleTable({ d }: { d: TeamKpiReport }): React.JSX.Element {
  const t = d.rules.targets;
  return (
    <Card>
      <CardBody className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-body-sm">
            <thead>
              <tr className="border-b border-hair bg-subtle text-caption text-ink-2">
                <th scope="col" className="px-3 py-2 text-left font-semibold">ເຈົ້າໜ້າທີ່</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">ຄະແນນ</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">ຕອບຮັບທັນ (≥{t.response_met_percent}%)</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">ແກ້ໄຂທັນ (≥{t.resolution_met_percent}%)</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">ຄວາມພໍໃຈ (≥{t.csat_avg})</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">ແກ້ໄຂແລ້ວ</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">ຄ້າງ (ເກີນ)</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.user.id} className={cn('border-b border-hair last:border-0', !r.enough_data && 'text-ink-3')}>
                  <td className="px-3 py-2 font-medium text-ink">
                    {r.user.full_name}
                    {!r.enough_data && <span className="ml-2 text-caption font-normal text-ink-3">ຂໍ້ມູນໜ້ອຍ</span>}
                  </td>
                  <td className={cn('tabular px-3 py-2 text-right font-semibold', r.enough_data && scoreTone(r.score))}>{r.score ?? '—'}</td>
                  <td className="tabular px-3 py-2 text-right">{cell(r.response.percent, r.meets.response, formatPercent)}</td>
                  <td className="tabular px-3 py-2 text-right">{cell(r.resolution.percent, r.meets.resolution, formatPercent)}</td>
                  <td className="tabular px-3 py-2 text-right">{cell(r.csat.avg, r.meets.csat, (v) => v.toFixed(1))}</td>
                  <td className="tabular px-3 py-2 text-right">{r.resolved}</td>
                  <td className="tabular px-3 py-2 text-right">
                    {r.open_now}
                    {r.overdue_now > 0 && <span className="ml-1 text-sla-breach">({r.overdue_now})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
