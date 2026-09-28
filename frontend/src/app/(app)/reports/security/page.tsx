'use client';

import { Printer, ShieldCheck } from 'lucide-react';
import * as React from 'react';

import { currentMonth, MonthPicker, monthLabel, monthRange } from '@/components/reports/month-picker';
import { Button } from '@/components/ui/button';
import {
  filterRows,
  ReportSearch,
  ReportSection,
  ResultChip,
  SummaryStrip,
} from '@/components/reports/report-layout';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Alert, BackLink, PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { cn } from '@/lib/cn';
import {
  useSecurityReport,
  type SecurityCheck,
  type SecurityReport,
} from '@/lib/queries/iso-reports';
import { useSession } from '@/lib/session';

/**
 * รายงานความมั่นคงปลอดภัยสารสนเทศ ตามโครง ISO/IEC 27001:2022
 *
 * ทุกส่วนเป็นตารางชุดเดียวกับหน้ารายงานอื่น (DataTable) — บนจอกว้างเป็นตาราง
 * บนมือถือกลายเป็นการ์ดคู่ ป้ายกำกับ–ค่า โดยไม่ต้องปัดซ้ายขวา
 *
 * ⚠️ ส่วนสุดท้าย (ทะเบียนช่องว่าง) สำคัญไม่แพ้ตัวเลข — ผู้ตรวจ ISO ให้น้ำหนักกับองค์กร
 *    ที่รู้ว่าตัวเองขาดอะไร มากกว่ารายงานที่เขียวทุกช่องแต่ไม่มีอะไรรองรับ
 */
export default function SecurityReportPage(): React.JSX.Element {
  const { user } = useSession();
  const allowed = user.security_viewer === true;
  const [month, setMonth] = React.useState(currentMonth);
  const { from, to } = monthRange(month);
  const query = useSecurityReport(from, to, allowed);

  if (!allowed) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href="/reports" label="ກັບໄປສູນລາຍງານ" />
        <Alert tone="warning" title="ບໍ່ມີສິດເປີດລາຍງານນີ້">
          ລາຍງານນີ້ເປີດໄດ້ສະເພາະຫົວໜ້າໄອທີ · CEO · DPO ແລະ ຜູ້ດູແລລະບົບ ຕາມ SOP-10 ຂໍ້ 2
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <BackLink href="/reports" label="ກັບໄປສູນລາຍງານ" />
      </div>
      <div className="print:hidden">
        <PageHeader
          title="ລາຍງານຄວາມໝັ້ນຄົງປອດໄພສາລະສົນເທດ"
          description="ISO/IEC 27001:2022 · §9.1 ການເຝົ້າຕິດຕາມ ວັດຜົນ ແລະ ປະເມີນ"
          actions={
            <div className="flex items-center gap-2">
              <MonthPicker value={month} onChange={setMonth} />
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                ພິມ
              </Button>
            </div>
          }
        />
      </div>

      <QueryBoundary query={query}>
        {query.data && <Report d={query.data} month={month} />}
      </QueryBoundary>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  on_target: 'ຜ່ານເກນທັງໝົດ',
  at_risk: 'ມີຂໍ້ທີ່ຕ້ອງແກ້',
  off_target: 'ຕົກເກນການຄວບຄຸມຫຼັກ',
  no_data: 'ຍັງວັດບໍ່ໄດ້ໃນເດືອນນີ້',
};

/** แถวหนึ่งของตารางตัวเลข — ป้ายกำกับ ค่า และหมายเหตุ */
interface MetricRow {
  label: string;
  value: string;
  note?: string;
  alert?: boolean;
}

const metric = (label: string, value: number | string, note?: string, alert = false): MetricRow => ({
  label,
  value: typeof value === 'number' ? String(value) : value,
  ...(note === undefined ? {} : { note }),
  alert,
});

const METRIC_COLUMNS: Column<MetricRow>[] = [
  {
    key: 'label',
    header: 'ຕົວຊີ້ວັດ',
    render: (r) => <span className="font-medium text-ink">{r.label}</span>,
  },
  {
    key: 'value',
    header: 'ຄ່າ',
    align: 'right',
    width: '22%',
    cellClassName: 'whitespace-nowrap',
    render: (r) => (
      <span className={cn('tabular font-semibold', r.alert ? 'text-sla-breach' : 'text-ink')}>
        {r.value}
      </span>
    ),
  },
  {
    key: 'note',
    header: 'ໝາຍເຫດ',
    hideBelow: 'xl',
    render: (r) => <span className="text-ink-2">{r.note ?? '—'}</span>,
  },
];

function MetricTable({ rows, caption }: { rows: MetricRow[]; caption: string }): React.JSX.Element {
  return <DataTable striped columns={METRIC_COLUMNS} rows={rows} rowKey={(r) => r.label} caption={caption} />;
}

const CHECK_COLUMNS: Column<SecurityCheck>[] = [
  {
    key: 'code',
    header: 'ລະຫັດ',
    width: '10%',
    cellClassName: 'whitespace-nowrap',
    render: (c) => <span className="tabular font-semibold text-ink">{c.code}</span>,
  },
  {
    key: 'control',
    header: 'ຂໍ້ຄວບຄຸມ',
    hideBelow: 'xl',
    cellClassName: 'whitespace-nowrap',
    render: (c) => <span className="text-ink-2">{c.control}</span>,
  },
  { key: 'title', header: 'ຫົວຂໍ້', render: (c) => <span className="text-ink">{c.title}</span> },
  {
    key: 'status',
    header: 'ຜົນ',
    width: '12%',
    render: (c) => <ResultChip status={c.status} />,
  },
  {
    key: 'detail',
    header: 'ຕົວເລກທີ່ໃຊ້ຕັດສິນ',
    render: (c) => <span className="text-ink-2">{c.detail}</span>,
  },
];

const BREAKDOWN_COLUMNS: Column<{ code: string; name: string; count: number }>[] = [
  { key: 'name', header: 'ໝວດໝູ່', render: (r) => <span className="text-ink">{r.name}</span> },
  {
    key: 'code',
    header: 'ລະຫັດ',
    hideBelow: 'xl',
    cellClassName: 'whitespace-nowrap',
    render: (r) => <span className="tabular text-ink-3">{r.code}</span>,
  },
  {
    key: 'count',
    header: 'ຈຳນວນ',
    align: 'right',
    width: '18%',
    render: (r) => <span className="tabular font-semibold text-ink">{r.count}</span>,
  },
];

const ACTION_COLUMNS: Column<{ action: string; count: number }>[] = [
  {
    key: 'action',
    header: 'ການກະທຳ',
    render: (r) => <span className="tabular text-ink">{r.action}</span>,
  },
  {
    key: 'count',
    header: 'ຈຳນວນ',
    align: 'right',
    width: '18%',
    render: (r) => <span className="tabular font-semibold text-ink">{r.count}</span>,
  },
];

const GAP_COLUMNS: Column<SecurityReport['evidence_gaps'][number]>[] = [
  {
    key: 'control',
    header: 'ຂໍ້ຄວບຄຸມ',
    width: '14%',
    cellClassName: 'whitespace-nowrap',
    render: (g) => <span className="tabular text-ink-2">{g.control}</span>,
  },
  { key: 'title', header: 'ຫົວຂໍ້', render: (g) => <span className="font-medium text-ink">{g.title}</span> },
  { key: 'missing', header: 'ສິ່ງທີ່ຍັງບໍ່ມີ', render: (g) => <span className="text-ink-2">{g.missing}</span> },
  {
    key: 'action',
    header: 'ສິ່ງທີ່ຕ້ອງເຮັດ',
    hideBelow: 'xl',
    render: (g) => <span className="text-ink-2">{g.action}</span>,
  },
];

function Report({ d, month }: { d: SecurityReport; month: string }): React.JSX.Element {
  const off = d.summary.status === 'off_target';
  const risk = d.summary.status === 'at_risk';
  const [term, setTerm] = React.useState('');

  /* กรองทุกตารางด้วยคำเดียวกัน — ผู้ใช้ไม่รู้ว่าคำที่หาอยู่ตารางไหน */
  const checks = filterRows(d.summary.checks, term, (c) => `${c.code} ${c.title} ${c.control} ${c.detail}`);
  const categories = filterRows(d.incidents.by_category, term, (r) => `${r.code} ${r.name}`);
  const kinds = filterRows(d.access.requests_by_kind, term, (r) => `${r.code} ${r.name}`);
  const actions = filterRows(d.audit.by_action, term, (r) => r.action);
  const gaps = filterRows(d.evidence_gaps, term, (g) => `${g.control} ${g.title} ${g.missing} ${g.action}`);
  const found = checks.length + categories.length + kinds.length + actions.length + gaps.length;

  return (
    <div className="flex flex-col gap-4">
      {/* หัวเอกสารสำหรับฉบับพิมพ์ — บนจอมี PageHeader อยู่แล้ว */}
      <header className="hidden print:block">
        <h1 className="text-h2">ລາຍງານຄວາມໝັ້ນຄົງປອດໄພສາລະສົນເທດ</h1>
        <p className="text-body-sm text-ink-2">
          {d.document.standard} · ເອກະສານເລກທີ {d.document.report_no} · ເດືອນ {monthLabel(month)}
        </p>
      </header>

      <section
        className={cn(
          'rounded border p-4 print-break-avoid',
          off && 'border-danger bg-danger-subtle',
          risk && 'border-warning bg-warning-subtle',
          !off && !risk && 'border-hair bg-surface',
        )}
      >
        <div className="flex items-start gap-3">
          <ShieldCheck
            className={cn('mt-0.5 h-6 w-6', off ? 'text-danger' : risk ? 'text-warning' : 'text-success')}
            aria-hidden="true"
          />
          <div>
            <p className="text-h3">{STATUS_LABEL[d.summary.status] ?? d.summary.status}</p>
            <p className="text-body-sm text-ink-2">
              ເອກະສານເລກທີ {d.document.report_no} · ກວດ {d.summary.checks.length} ຂໍ້
              {d.summary.failing.length > 0 && <> · ຕົກ {d.summary.failing.join(' · ')}</>}
            </p>
          </div>
        </div>
      </section>

      {/*
        สี่ตัวเลขที่ผู้บริหารต้องรู้ก่อน ที่เหลืออยู่ในตารางข้างล่าง
        ไม่เพิ่มช่องที่ห้าเด็ดขาด — หน้าเดิมมีสิบกว่ากล่องแล้วไม่มีใครอ่านจบ
      */}
      <SummaryStrip
        items={[
          {
            label: 'ເຫດການດ້ານຄວາມປອດໄພ',
            value: String(d.incidents.total),
            sub: `ເດືອນກ່ອນ ${d.incidents.previous_total}`,
            tone: d.incidents.total > d.incidents.previous_total ? 'warn' : 'neutral',
          },
          {
            label: 'ເກີນກຳນົດແກ້ໄຂ',
            value: String(d.incidents.resolution_breached),
            sub: `ຍັງເປີດຄ້າງ ${d.incidents.still_open}`,
            tone: d.incidents.resolution_breached > 0 ? 'bad' : 'good',
          },
          {
            label: 'ສິດໝົດອາຍຸແຕ່ຍັງຄ້າງ',
            value: String(d.access.grants_expired_still_present),
            sub: `ຄຳຂໍລໍຖ້າອະນຸມັດ ${d.access.approvals_pending}`,
            tone: d.access.grants_expired_still_present > 0 ? 'bad' : 'good',
          },
          {
            label: 'ຄວາມຄົບຂອງຮ່ອງຮອຍ',
            value: percent(d.audit.coverage_percent),
            sub: `${d.audit.status_changes_audited} ຈາກ ${d.audit.status_changes} ຄັ້ງ`,
            tone: (d.audit.coverage_percent ?? 100) < 100 ? 'warn' : 'good',
          },
        ]}
      />

      <ReportSearch value={term} onChange={setTerm} count={found} />

      <ReportSection title="ຜົນການກວດຕາມຂໍ້ຄວບຄຸມ" clause="ISO/IEC 27001:2022 ພາກຜະໜວກ A">
          <DataTable
            striped
            columns={CHECK_COLUMNS}
            rows={checks}
            rowKey={(c) => c.code}
            caption="ຜົນການກວດຕາມຂໍ້ຄວບຄຸມ ISO/IEC 27001"
          />
      </ReportSection>

      <ReportSection title="ເຫດການດ້ານຄວາມປອດໄພ" clause="A.5.24–A.5.27 · ນັບຈາກໝວດໝູ່ກຸ່ມ SECURITY">
          <MetricTable
            caption="ຕົວເລກເຫດການດ້ານຄວາມປອດໄພ"
            rows={[
              metric('ຈຳນວນເດືອນນີ້', d.incidents.total, `ເດືອນກ່ອນ ${d.incidents.previous_total}`),
              metric('ລະດັບ P1', d.incidents.p1, undefined, d.incidents.p1 > 0),
              metric('ເກີນກຳນົດແກ້ໄຂ', d.incidents.resolution_breached, undefined, d.incidents.resolution_breached > 0),
              metric('ຍັງເປີດຄ້າງ', d.incidents.still_open, undefined, d.incidents.still_open > 0),
              metric('ຖືກເປີດເລື່ອງຄືນ', d.incidents.reopened, undefined, d.incidents.reopened > 0),
              metric('ຕອບຮັບທັນເວລາ', percent(d.incidents.response_met_percent), 'ເປົ້າ 100%'),
              metric('ສະເລ່ຍເວລາຕອບຮັບ', minutes(d.incidents.avg_minutes_to_response)),
              metric('ສະເລ່ຍເວລາແກ້ໄຂ', minutes(d.incidents.avg_minutes_to_resolve)),
            ]}
          />
          <h3 className="mb-2 mt-4 text-body-sm font-semibold text-ink">ແຍກຕາມໝວດໝູ່</h3>
          <DataTable
            striped
            columns={BREAKDOWN_COLUMNS}
            rows={categories}
            rowKey={(r) => r.code}
            emptyTitle="ບໍ່ມີເຫດການດ້ານຄວາມປອດໄພໃນເດືອນນີ້"
            caption="ເຫດການດ້ານຄວາມປອດໄພແຍກຕາມໝວດໝູ່"
          />
      </ReportSection>

      <ReportSection title="ການຄວບຄຸມການເຂົ້າເຖິງ ແລະ ສິດ" clause="A.5.15 · A.5.16 · A.5.18">
          <MetricTable
            caption="ຕົວເລກການຄວບຄຸມການເຂົ້າເຖິງ"
            rows={[
              metric('ຄຳຂໍສິດເດືອນນີ້', d.access.requests_total),
              metric('ຕັດສິນແລ້ວ', d.access.approvals_decided, `ປະຕິເສດ ${d.access.approvals_rejected}`),
              metric(
                'ຄ້າງລໍຖ້າອະນຸມັດ',
                d.access.approvals_pending,
                `ເກີນ ${d.targets.approval_pending_days} ມື້ ${d.access.approvals_pending_over_target}`,
                d.access.approvals_pending_over_target > 0,
              ),
              metric('ສະເລ່ຍເວລາອະນຸມັດ', hours(d.access.avg_approval_hours)),
              metric(
                'ສິດໝົດອາຍຸແຕ່ຍັງຄ້າງ',
                d.access.grants_expired_still_present,
                `ມີກຳນົດສິ້ນສຸດ ${d.access.grants_with_expiry} ຈາກ ${d.access.grants_total}`,
                d.access.grants_expired_still_present > 0,
              ),
              metric(
                'ບັນຊີຜູ້ດູແລທີ່ໃຊ້ງານຢູ່',
                d.access.admin_accounts,
                `ບັນຊີໃຊ້ງານທັງໝົດ ${d.access.active_accounts}`,
              ),
              metric(
                `ບໍ່ໄດ້ເຂົ້າລະບົບເກີນ ${d.targets.dormant_account_days} ມື້`,
                d.access.dormant_accounts,
                `ບໍ່ເຄີຍເຂົ້າເລີຍ ${d.access.never_logged_in}`,
                d.access.dormant_accounts > 0,
              ),
              metric('ບັນຊີຖືກລັອກ', d.access.locked_accounts, undefined, d.access.locked_accounts > 0),
              metric(
                'ຄຳຂໍປິດສິດພະນັກງານລາອອກ',
                d.access.offboarding_total,
                `ດຳເນີນການແລ້ວ ${d.access.offboarding_done}`,
              ),
            ]}
          />
          <h3 className="mb-2 mt-4 text-body-sm font-semibold text-ink">ຄຳຂໍແຍກຕາມປະເພດ</h3>
          <DataTable
            striped
            columns={BREAKDOWN_COLUMNS}
            rows={kinds}
            rowKey={(r) => r.code}
            emptyTitle="ບໍ່ມີຄຳຂໍກ່ຽວກັບສິດໃນເດືອນນີ້"
            caption="ຄຳຂໍສິດແຍກຕາມປະເພດ"
          />
      </ReportSection>

      <ReportSection title="ຮ່ອງຮອຍການກວດສອບ" clause="A.5.28 ການເກັບຫຼັກຖານ · A.8.15 ການບັນທຶກເຫດການ">
          <MetricTable
            caption="ຕົວເລກຮ່ອງຮອຍການກວດສອບ"
            rows={[
              metric('ລາຍການທີ່ບັນທຶກເດືອນນີ້', d.audit.entries),
              metric(
                'ຄວາມຄົບຂອງຮ່ອງຮອຍ',
                percent(d.audit.coverage_percent),
                `${d.audit.status_changes_audited} ຈາກ ${d.audit.status_changes} ຄັ້ງ`,
                (d.audit.coverage_percent ?? 100) < 100,
              ),
              metric(
                'ລາຍການທີ່ມີ IP ຜູ້ກະທຳ',
                d.audit.entries_with_origin,
                'ຍັງບໍ່ໄດ້ບັນທຶກ IP ເລີຍ — ເບິ່ງທະບຽນຊ່ອງວ່າງ',
                d.audit.entries_with_origin === 0,
              ),
              metric(
                'ທະບຽນເລີ່ມບັນທຶກເມື່ອ',
                d.audit.first_entry_at === null ? '—' : d.audit.first_entry_at.slice(0, 10),
              ),
            ]}
          />
          <h3 className="mb-2 mt-4 text-body-sm font-semibold text-ink">ແຍກຕາມການກະທຳ</h3>
          <DataTable
            striped
            columns={ACTION_COLUMNS}
            rows={actions}
            rowKey={(r) => r.action}
            emptyTitle="ບໍ່ມີລາຍການໃນເດືອນນີ້"
            caption="ຮ່ອງຮອຍການກວດສອບແຍກຕາມການກະທຳ"
          />
      </ReportSection>

      <ReportSection
        title="ທະບຽນຊ່ອງວ່າງຂອງຫຼັກຖານ"
        hint="ຂໍ້ທີ່ລະບົບຍັງບໍ່ໄດ້ບັນທຶກຂໍ້ມູນ — ບອກໄວ້ຊັດເຈນແທນທີ່ຈະສະແດງເປັນສູນ"
      >
          <DataTable
            striped
            columns={GAP_COLUMNS}
            rows={gaps}
            rowKey={(g) => `${g.control}-${g.title}`}
            caption="ທະບຽນຊ່ອງວ່າງຂອງຫຼັກຖານ"
          />
      </ReportSection>

      <section className="hidden print:block print-break-avoid">
        <div className="mt-8 grid grid-cols-2 gap-8">
          <SignBox role="ຜູ້ຈັດທຳ" title="ຫົວໜ້າໄອທີ" />
          <SignBox role="ຜູ້ທົບທວນ" title="DPO / ຜູ້ບໍລິຫານ" />
        </div>
      </section>
    </div>
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

/** null = ວັດບໍ່ໄດ້ ບໍ່ແມ່ນສູນ */
const percent = (v: number | null): string => (v === null ? '—' : `${v}%`);
const minutes = (v: number | null): string => (v === null ? '—' : `${v} ນາທີ`);
const hours = (v: number | null): string => (v === null ? '—' : `${v} ຊົ່ວໂມງ`);
