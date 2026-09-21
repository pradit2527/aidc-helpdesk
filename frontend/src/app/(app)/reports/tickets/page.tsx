'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertOctagon,
  Archive,
  CheckCircle2,
  Download,
  Inbox,
  Layers,
  RefreshCw,
  Search,
  Star,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import * as React from 'react';

import { PriorityBadge, PriorityMeter, SlaBadge, StatusBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { DataTable, Pagination, type Column } from '@/components/ui/data-table';
import { Field, Input, Select } from '@/components/ui/field';
import { Alert, Avatar, PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import {
  PRIORITY,
  STATUS_ORDER,
  TICKET_STATUS,
  TICKET_TYPE,
  TYPE_STATUSES,
  isWaitingStatus,
  statusLabel,
  type Priority,
  type SlaStatus,
  type TicketStatus,
} from '@/config/enums';
import { cn } from '@/lib/cn';
import {
  TIMEZONE,
  formatDateShort,
  formatDateTime,
  formatMinutes,
  formatNumber,
  formatPercent,
} from '@/lib/format';
import { useCompanies, useDepartments } from '@/lib/queries/master-data';
import { useUser, useUsers } from '@/lib/queries/operations';
import {
  useTicketReport,
  type TicketReport,
  type TicketReportAssigneeRow,
  type TicketReportCompanyRow,
  type TicketReportDepartmentRow,
  type TicketReportItem,
  type TicketReportParams,
} from '@/lib/queries/reports';
import { useSupportProjects } from '@/lib/queries/support-projects';
import { useCan, useSession } from '@/lib/session';
import { useDebounced } from '@/lib/use-debounced';

/**
 * รายงานเรื่องแจ้งแบบกรองได้ — บริษัท / แผนก / สถานะ / รายบุคคล / ช่วงเวลา
 *
 * สถานะตัวกรองทั้งหมดอยู่ใน query string ไม่ใช่ useState
 * ผู้บริหารส่งลิงก์รายงาน "แผนกคลังสินค้า เดือนที่แล้ว" ให้กันได้
 * และกด refresh แล้วได้หน้าเดิม ไม่ใช่กลับไปค่าเริ่มต้นทุกครั้ง
 *
 * ตัวเลขทุกตัวมาจาก GET /reports/tickets คำขอเดียว ซึ่งใช้ WHERE ก้อนเดียวกัน
 * ทั้งการ์ดสรุป ตารางแยกมิติ และรายการ — ยอดในการ์ดจึงเท่ากับผลรวมของตารางเสมอ
 */

const PAGE_SIZE = 20;

/** เป้า SLA ตาม AIDC-IT-SLA-001 ข้อ 7.1 (KPI-1) — ใช้ระบายสี % ทันเวลาเท่านั้น */
const TARGET_PERCENT = 95;

const PRIORITY_ORDER: readonly Priority[] = ['P1', 'P2', 'P3', 'P4'];

type PersonRole = 'assignee' | 'requester';
type TypeFilter = '' | keyof typeof TICKET_TYPE;

/** ตัวกรองที่อ่านจาก URL — ค่าว่างแปลว่า "ไม่กรอง" ทุกช่อง */
interface Filters {
  company: string;
  department: string;
  /** id ของโครงการที่รับซัพพอร์ต — ว่าง = ทุกโครงการ */
  project: string;
  /** ประเภทเรื่อง — ว่าง = ทั้งสองประเภท */
  type: TypeFilter;
  status: TicketStatus[];
  person: string;
  personRole: PersonRole;
  /** YYYY-MM-DD ตามเวลาเวียงจันทน์ */
  from: string;
  to: string;
  page: number;
}

// ── วันที่ตามเวลาเวียงจันทน์ ──────────────────────────────────────────
//
// ตัดวันด้วยโซนเวลาของสำนักงาน ไม่ใช่ของเครื่องผู้ใช้ — ผู้บริหารที่เปิดดูจาก
// ต่างประเทศต้องเห็นตัวเลข "เดือนนี้" ชุดเดียวกับทีมที่นั่งอยู่ในเวียงจันทน์
// ลาวไม่มี daylight saving จึงใช้ +07:00 ตายตัวได้

const VIENTIANE_OFFSET = '+07:00';

function ymdInVientiane(date: Date): string {
  // en-CA ให้รูป YYYY-MM-DD ตรง ๆ ไม่ต้องประกอบเอง
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function ymdFromUtc(y: number, monthIndex: number, d: number): string {
  return new Date(Date.UTC(y, monthIndex, d)).toISOString().slice(0, 10);
}

function splitYmd(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

function isYmd(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function startOfDayIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00.000${VIENTIANE_OFFSET}`).toISOString();
}

function endOfDayIso(ymd: string): string {
  return new Date(`${ymd}T23:59:59.999${VIENTIANE_OFFSET}`).toISOString();
}

interface Preset {
  key: string;
  label: string;
  range: (today: string) => { from: string; to: string };
}

/** ค่าเริ่มต้นของรายงาน — เดือนปัจจุบัน ตรงกับค่าเริ่มต้นฝั่ง backend */
const THIS_MONTH: Preset = {
  key: 'this_month',
  label: 'ເດືອນນີ້',
  range: (today) => {
    const [y, m] = splitYmd(today);
    return { from: ymdFromUtc(y, m - 1, 1), to: today };
  },
};

const PRESETS: readonly Preset[] = [
  THIS_MONTH,
  {
    key: 'last_month',
    label: 'ເດືອນກ່ອນ',
    range: (today) => {
      const [y, m] = splitYmd(today);
      // วันที่ 0 ของเดือนนี้ = วันสุดท้ายของเดือนก่อน Date จัดการ 28/30/31 ให้เอง
      return { from: ymdFromUtc(y, m - 2, 1), to: ymdFromUtc(y, m - 1, 0) };
    },
  },
  {
    key: 'last_30_days',
    label: '30 ມື້ຫຼ້າສຸດ',
    range: (today) => {
      const [y, m, d] = splitYmd(today);
      return { from: ymdFromUtc(y, m - 1, d - 29), to: today };
    },
  },
  {
    key: 'this_year',
    label: 'ປີນີ້',
    range: (today) => {
      const [y] = splitYmd(today);
      return { from: ymdFromUtc(y, 0, 1), to: today };
    },
  },
];

// ── หน้า ────────────────────────────────────────────────────────────────

export default function TicketReportPage(): React.JSX.Element {
  /*
   * useSearchParams ต้องอยู่ใต้ Suspense — ตอน next build หน้าที่ prerender
   * แบบ static จะล้มด้วย "Missing Suspense boundary with useSearchParams"
   * ถ้าไม่มี ส่วนที่รออยู่คือแค่ค่าจาก URL จึงแสดงข้อความสั้น ๆ พอ
   */
  return (
    <React.Suspense
      fallback={
        <div
          className="flex min-h-32 items-center justify-center gap-3 text-body-sm text-muted"
          role="status"
          aria-live="polite"
        >
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          ກຳລັງໂຫຼດຂໍ້ມູນ...
        </div>
      }
    >
      <TicketReportContent />
    </React.Suspense>
  );
}

function TicketReportContent(): React.JSX.Element {
  const { user } = useSession();
  const canView = useCan('report.view', 'report.export');
  const canExport = useCan('report.export');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const companies = useCompanies();
  const departments = useDepartments();
  const projects = useSupportProjects();

  /*
   * "ทั้งองค์กร" เสนอให้เฉพาะคนที่ขอบเขตกว้างกว่าหนึ่งบริษัท
   *
   * super_admin เห็นทุกบริษัทโดยไม่มี user_role_scope · คนอื่นดูจาก scoped_companies
   * ใน session ซึ่งเป็นชุดเดียวกับที่ backend ใช้ตัดสิน — ถ้าเสนอตัวเลือกนี้ให้
   * ผู้ดูแลระดับบริษัท เขาจะเห็น "ทั้งองค์กร" แต่ได้ตัวเลขของบริษัทตัวเองบริษัทเดียว
   * ซึ่งเป็นรายงานที่โกหกด้วยหัวข้อของมันเอง
   */
  const isSuperAdmin = user.roles.includes('super_admin');
  const allowAllCompanies = isSuperAdmin || user.scoped_companies.length > 1;
  const defaultCompany = allowAllCompanies ? '' : String(user.company.id);
  const allLabel = isSuperAdmin ? 'ທັງອົງກອນ' : 'ທຸກບໍລິສັດໃນຂອບເຂດ';

  // วันนี้ตามเวลาเวียงจันทน์ — คำนวณครั้งเดียวต่อการเปิดหน้า พอสำหรับรายงาน
  const today = React.useMemo(() => ymdInVientiane(new Date()), []);
  const defaultRange = React.useMemo(() => THIS_MONTH.range(today), [today]);

  const filters = React.useMemo<Filters>(() => {
    const status = (searchParams.get('status') ?? '')
      .split(',')
      .filter((s): s is TicketStatus => s in TICKET_STATUS);
    const role = searchParams.get('person_role');
    const rawType = searchParams.get('type');
    const type: TypeFilter = rawType === 'incident' || rawType === 'service_request' ? rawType : '';
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const page = Number(searchParams.get('page') ?? 1);
    return {
      company: searchParams.get('company') ?? defaultCompany,
      department: searchParams.get('department') ?? '',
      project: searchParams.get('project') ?? '',
      type,
      /*
       * สถานะที่ไม่ได้อยู่ในประเภทที่กรอง เลือกไว้ก็ได้ผลลัพธ์ศูนย์เสมอ
       *
       * เกิดได้จริงจากลิงก์ที่ส่งต่อกัน — เลือก "ສົ່ງມອບແລ້ວ" ไว้แล้วสลับไป
       * เหตุขัดข้อง ถ้าไม่ตัดออก รายงานจะว่างเปล่าโดยที่ชิปที่ทำให้ว่างหายไป
       * จากแถบตัวกรองแล้ว (เพราะชิปวาดตามประเภท) ผู้ใช้จึงหาไม่เจอว่าเพราะอะไร
       */
      status: [...new Set(status)].filter(
        (s) => type === '' || TYPE_STATUSES[type].includes(s),
      ),
      person: searchParams.get('person') ?? '',
      personRole: role === 'requester' ? 'requester' : 'assignee',
      from: isYmd(from) ? from : defaultRange.from,
      to: isYmd(to) ? to : defaultRange.to,
      page: Number.isInteger(page) && page > 0 ? page : 1,
    };
  }, [searchParams, defaultCompany, defaultRange]);

  /**
   * เขียนตัวกรองกลับลง URL — เก็บเฉพาะค่าที่ต่างจากค่าเริ่มต้น ลิงก์จึงสั้น
   * เปลี่ยนตัวกรองใด ๆ กลับไปหน้า 1 เสมอ ยกเว้นตอนกดเปลี่ยนหน้าเอง
   */
  const update = React.useCallback(
    (patch: Partial<Filters>) => {
      const next: Filters = { ...filters, ...patch, page: patch.page ?? 1 };
      const q = new URLSearchParams();
      if (next.company !== defaultCompany) q.set('company', next.company);
      if (next.department) q.set('department', next.department);
      if (next.project) q.set('project', next.project);
      if (next.type) q.set('type', next.type);
      if (next.status.length > 0) q.set('status', next.status.join(','));
      if (next.person) {
        q.set('person', next.person);
        q.set('person_role', next.personRole);
      }
      if (next.from !== defaultRange.from) q.set('from', next.from);
      if (next.to !== defaultRange.to) q.set('to', next.to);
      if (next.page > 1) q.set('page', String(next.page));
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filters, defaultCompany, defaultRange, pathname, router],
  );

  const params: TicketReportParams = {
    company_id: filters.company ? Number(filters.company) : undefined,
    department_id: filters.department ? Number(filters.department) : undefined,
    project_id: filters.project ? Number(filters.project) : undefined,
    ticket_type: filters.type || undefined,
    status: filters.status.length > 0 ? filters.status.join(',') : undefined,
    assignee_id:
      filters.person && filters.personRole === 'assignee' ? Number(filters.person) : undefined,
    requester_id:
      filters.person && filters.personRole === 'requester' ? Number(filters.person) : undefined,
    from: startOfDayIso(filters.from),
    to: endOfDayIso(filters.to),
    page: filters.page,
    page_size: PAGE_SIZE,
  };

  const query = useTicketReport(params);
  const report = query.data;

  const companyOptions = companies.data ?? [];
  const departmentOptions = (departments.data ?? [])
    .filter((d) => filters.company && String(d.company.id) === filters.company)
    .sort((a, b) => a.name.localeCompare(b.name));
  /*
   * องค์กรที่ยังไม่ได้เปิดใช้ Support Hub ไม่มีโครงการสักอัน และ API รุ่นที่ยังไม่มี
   * endpoint นี้ตอบ 403/404 ทันที — ทั้งสองกรณีต้องได้รายงานหน้าตาเดิม
   * ไม่ใช่ตัวกรองเปล่า ๆ หรือข้อความผิดพลาดคาหน้า (แบบเดียวกับกล่องแชท)
   */
  const projectOptions = projects.isError ? [] : (projects.data ?? []);

  const selectedCompany = companyOptions.find((c) => String(c.id) === filters.company);
  const selectedDepartment = departmentOptions.find((d) => String(d.id) === filters.department);
  const selectedProject = projectOptions.find((p) => String(p.id) === filters.project);

  const activePreset = PRESETS.find((p) => {
    const r = p.range(today);
    return r.from === filters.from && r.to === filters.to;
  });

  /* ชิปที่แสดงจริง — กรองประเภทไว้แล้วก็ไม่ต้องเสนอสถานะที่ประเภทนั้นไม่มีวันเป็น */
  const statusChoices = filters.type === '' ? STATUS_ORDER : TYPE_STATUSES[filters.type];

  function toggleStatus(status: TicketStatus): void {
    const has = filters.status.includes(status);
    update({
      status: has
        ? filters.status.filter((s) => s !== status)
        : STATUS_ORDER.filter((s) => s === status || filters.status.includes(s)),
    });
  }

  function changeType(type: TypeFilter): void {
    // สถานะที่ค้างอยู่อาจใช้กับประเภทใหม่ไม่ได้ — ตัดออกพร้อมกัน ไม่ปล่อยให้รายงานว่างเปล่าเงียบ ๆ
    update({
      type,
      status: type === '' ? filters.status : filters.status.filter((s) => TYPE_STATUSES[type].includes(s)),
    });
  }

  const hasCustomFilter =
    filters.company !== defaultCompany ||
    filters.department !== '' ||
    filters.project !== '' ||
    filters.type !== '' ||
    filters.status.length > 0 ||
    filters.person !== '' ||
    filters.from !== defaultRange.from ||
    filters.to !== defaultRange.to;

  if (!canView) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="ລາຍງານເລື່ອງແຈ້ງ" />
        <Alert tone="warning" title="ທ່ານບໍ່ມີສິດເບິ່ງລາຍງານ">
          ຕ້ອງມີສິດ report.view — ຕິດຕໍ່ຜູ້ດູແລລະບົບຖ້າຕ້ອງໃຊ້ໜ້ານີ້
        </Alert>
      </div>
    );
  }

  const orgLabel = selectedCompany
    ? selectedDepartment
      ? `${selectedCompany.code} · ${selectedDepartment.name}`
      : selectedCompany.code
    : allLabel;
  // ขอบเขตต้องอ่านออกจากหัวรายงานเสมอ — ลิงก์ที่ส่งต่อกันต้องบอกตัวเองได้ว่าเป็นรายงานของอะไร
  const projectLabel = selectedProject ? `${orgLabel} · ໂຄງການ ${selectedProject.code}` : orgLabel;
  // ประเภทที่กรองต้องอยู่ในหัวรายงานด้วย — ตัวเลข MTTR ของ "เหตุขัดข้อง" กับของ
  // "ทุกประเภท" เป็นคนละตัวเลข ลิงก์ที่ส่งต่อกันต้องบอกได้เองว่าเป็นอันไหน
  const scopeLabel = filters.type ? `${projectLabel} · ${TICKET_TYPE[filters.type]}` : projectLabel;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ລາຍງານເລື່ອງແຈ້ງ"
        description={`${scopeLabel} · ${formatDateShort(filters.from)} – ${formatDateShort(filters.to)} · ນັບຈາກວັນທີ່ແຈ້ງ`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/reports">ລາຍງານອື່ນ</Link>
            </Button>
            {canExport && (
              <Button
                variant="secondary"
                disabled={!report}
                onClick={() => report && downloadCsv(report, filters)}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                ດາວໂຫຼດ CSV
              </Button>
            )}
          </>
        }
      />

      {/* ── แถบตัวกรอง ── */}
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="ຂອບເຂດ" htmlFor="report-company">
              <Select
                value={filters.company}
                onChange={(e) =>
                  update({
                    company: e.target.value,
                    department: '',
                    // ผู้แจ้งสังกัดบริษัทเดียว เปลี่ยนบริษัทแล้วคนเดิมไม่มีเรื่องในนั้นแน่
                    // ส่วนผู้รับผิดชอบดูแลข้ามบริษัทได้ จึงคงไว้
                    person: filters.personRole === 'requester' ? '' : filters.person,
                  })
                }
              >
                {allowAllCompanies && <option value="">{allLabel}</option>}
                {companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                    {c.name_th ? ` — ${c.name_th}` : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="ພະແນກ"
              htmlFor="report-department"
              hint={!filters.company ? 'ເລືອກບໍລິສັດກ່ອນ ຈຶ່ງເລືອກພະແນກໄດ້' : undefined}
            >
              <Select
                value={filters.department}
                disabled={!filters.company}
                onChange={(e) => update({ department: e.target.value })}
              >
                <option value="">ທຸກພະແນກ</option>
                {departmentOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="ຈາກວັນທີ" htmlFor="report-from">
              <Input
                type="date"
                value={filters.from}
                max={filters.to}
                onChange={(e) => isYmd(e.target.value) && update({ from: e.target.value })}
              />
            </Field>
            <Field label="ຖິງວັນທີ" htmlFor="report-to">
              <Input
                type="date"
                value={filters.to}
                min={filters.from}
                max={today}
                onChange={(e) => isYmd(e.target.value) && update({ to: e.target.value })}
              />
            </Field>

            {/*
              ตัวกรองโครงการโผล่เฉพาะองค์กรที่เปิดใช้ Support Hub แล้วจริง ๆ
              วางไว้ท้ายสุดเพื่อไม่ให้ช่อง "ຈາກວັນທີ – ຖິງວັນທີ" ถูกแยกคนละแถว
              ซึ่งทำให้เทียบช่วงเวลาที่เลือกไว้ยากขึ้นโดยไม่จำเป็น
            */}
            {projectOptions.length > 0 && (
              <Field
                label="ໂຄງການ"
                htmlFor="report-project"
                hint="ເລື່ອງທີ່ຍົກມາຈາກແຊັດຂອງເວັບທີ່ຮັບຊັບພອດ"
              >
                <Select
                  value={filters.project}
                  onChange={(e) => update({ project: e.target.value })}
                >
                  <option value="">ທຸກໂຄງການ</option>
                  {projectOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          {/*
            ตัวกรองประเภท — ปุ่มไม่ใช่ dropdown เพราะมีแค่สามทางเลือก และการสลับไปมา
            ระหว่าง "เหตุขัดข้อง" กับ "คำขอบริการ" เป็นสิ่งที่ผู้บริหารทำบ่อยตอนอ่านรายงาน
            วางไว้เหนือชิปสถานะ เพราะมันเปลี่ยนว่ามีชิปอะไรให้เลือกบ้าง
          */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="ກັ່ນຕອງຕາມປະເພດເລື່ອງ">
            <span className="text-caption text-ink-3">ປະເພດ:</span>
            {(
              [
                ['', 'ທຸກປະເພດ'],
                ['incident', TICKET_TYPE.incident],
                ['service_request', TICKET_TYPE.service_request],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key || 'all'}
                type="button"
                size="sm"
                variant={filters.type === key ? 'primary' : 'secondary'}
                aria-pressed={filters.type === key}
                onClick={() => changeType(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="ຊ່ວງເວລາດ່ວນ">
            <span className="text-caption text-ink-3">ຊ່ວງເວລາ:</span>
            {PRESETS.map((p) => (
              <Button
                key={p.key}
                type="button"
                size="sm"
                variant={activePreset?.key === p.key ? 'primary' : 'secondary'}
                aria-pressed={activePreset?.key === p.key}
                onClick={() => update(p.range(today))}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <StatusChips
            choices={statusChoices}
            selected={filters.status}
            onToggle={toggleStatus}
            onClear={() => update({ status: [] })}
          />

          <PersonFilter
            person={filters.person}
            role={filters.personRole}
            companyId={filters.company ? Number(filters.company) : undefined}
            onChange={(person, role) => update({ person, personRole: role })}
          />

          {hasCustomFilter && (
            <div className="flex items-center gap-2 border-t border-hair pt-3">
              <span className="text-caption text-ink-3">ໃຊ້ຕົວກັ່ນຕອງຢູ່</span>
              <Button variant="ghost" size="sm" onClick={() => router.replace(pathname, { scroll: false })}>
                <X className="h-4 w-4" aria-hidden="true" />
                ລ້າງທັງໝົດ
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <QueryBoundary query={query} loadingLabel="ກຳລັງສ້າງລາຍງານ">
        {report && (
          <ReportContent
            report={report}
            filters={filters}
            onPageChange={(page) => update({ page })}
          />
        )}
      </QueryBoundary>
    </div>
  );
}

// ── ชิปสถานะ ──────────────────────────────────────────────────────────

/**
 * เลือกได้หลายสถานะพร้อมกัน — ชิปคือ StatusBadge ตัวเดียวกับที่ใช้ทั่วระบบ
 * ผู้ใช้จึงจำสี+ไอคอนชุดเดียว ไม่ต้องเรียนรู้ป้ายชุดใหม่สำหรับหน้ารายงาน
 * ชิปที่ไม่ได้เลือกจางลงแต่ยังอ่านออก และมี aria-pressed ให้โปรแกรมอ่านหน้าจอ
 */
function StatusChips({
  choices,
  selected,
  onToggle,
  onClear,
}: {
  /** สถานะที่เสนอให้เลือก — แคบลงตามประเภทที่กรองอยู่ */
  choices: readonly TicketStatus[];
  selected: TicketStatus[];
  onToggle: (status: TicketStatus) => void;
  onClear: () => void;
}): React.JSX.Element {
  const none = selected.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="ກັ່ນຕອງຕາມສະຖານະ">
      <span className="text-caption text-ink-3">ສະຖານະ:</span>
      <button
        type="button"
        aria-pressed={none}
        onClick={onClear}
        className={cn(
          'inline-flex min-h-[36px] items-center rounded-full border px-3 text-caption font-semibold transition-colors',
          none
            ? 'border-primary bg-primary-subtle text-primary'
            : 'border-control bg-surface text-ink-2 hover:bg-subtle',
        )}
      >
        ທຸກສະຖານະ
      </button>
      {choices.map((status) => {
        const active = selected.includes(status);
        return (
          <button
            key={status}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(status)}
            className={cn(
              'inline-flex min-h-[36px] items-center rounded-full transition-opacity',
              active ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : 'opacity-60 hover:opacity-100',
            )}
          >
            <StatusBadge status={status} />
          </button>
        );
      })}
    </div>
  );
}

// ── ตัวกรองรายบุคคล ───────────────────────────────────────────────────

/**
 * เลือกคนหนึ่งคน แล้วบอกว่าจะดูในฐานะ "ผู้รับผิดชอบ" หรือ "ผู้แจ้ง"
 *
 * URL เก็บแค่ id — ชื่อของคนที่เลือกอยู่แล้วดึงจาก GET /users/{id} ตอนเปิดหน้า
 * ถ้าเก็บชื่อลง URL ด้วย ลิงก์จะยาวและชื่อจะค้างแม้คนนั้นเปลี่ยนชื่อไปแล้ว
 *
 * ผู้แจ้งค้นเฉพาะในบริษัทที่เลือก (พนักงานสังกัดบริษัทเดียว) ส่วนผู้รับผิดชอบ
 * ค้นทั้งขอบเขต — เจ้าหน้าที่จากส่วนกลางรับเรื่องของหลายบริษัทได้
 */
function PersonFilter({
  person,
  role,
  companyId,
  onChange,
}: {
  person: string;
  role: PersonRole;
  companyId: number | undefined;
  onChange: (person: string, role: PersonRole) => void;
}): React.JSX.Element {
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const selectedId = Number(person);
  const selected = useUser(Number.isFinite(selectedId) ? selectedId : 0);

  return (
    <div className="flex flex-col gap-2 border-t border-hair pt-4 sm:flex-row sm:items-start sm:gap-3">
      <div role="group" aria-label="ບົດບາດຂອງບຸກຄົນ" className="flex flex-none gap-1">
        {(
          [
            ['assignee', 'ຜູ້ຮັບຜິດຊອບ'],
            ['requester', 'ຜູ້ແຈ້ງ'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={role === key ? 'primary' : 'secondary'}
            aria-pressed={role === key}
            onClick={() => onChange(person, key)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="relative min-w-0 flex-1">
        {person ? (
          <div className="flex min-h-[36px] items-center gap-2 rounded border border-control bg-subtle px-3">
            <Avatar name={selected.data?.full_name ?? '?'} size="sm" />
            <span className="min-w-0 flex-1 truncate text-body-sm font-semibold">
              {selected.data?.full_name ?? `#${person}`}
            </span>
            <button
              type="button"
              aria-label="ລ້າງບຸກຄົນທີ່ເລືອກ"
              onClick={() => onChange('', role)}
              className="grid h-8 w-8 flex-none place-items-center rounded text-ink-2 hover:bg-surface hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder={
                role === 'assignee' ? 'ຄົ້ນຫາຜູ້ຮັບຜິດຊອບ — ຊື່ ຫຼື ລະຫັດພະນັກງານ' : 'ຄົ້ນຫາຜູ້ແຈ້ງ — ຊື່ ຫຼື ລະຫັດພະນັກງານ'
              }
              aria-label="ຄົ້ນຫາບຸກຄົນ"
              className="pl-9"
            />
            {/* mount รายการเฉพาะตอนเปิด — คิวรีผู้ใช้จึงยิงเมื่อผู้ใช้ตั้งใจค้นเท่านั้น */}
            {open && (
              <PersonSearchList
                q={q}
                companyId={role === 'requester' ? companyId : undefined}
                onPick={(id) => {
                  onChange(String(id), role);
                  setQ('');
                  setOpen(false);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PersonSearchList({
  q,
  companyId,
  onPick,
}: {
  q: string;
  companyId: number | undefined;
  onPick: (id: number) => void;
}): React.JSX.Element {
  const debounced = useDebounced(q, 300);
  const users = useUsers({ q: debounced || undefined, company_id: companyId });
  const items = users.data?.items ?? [];

  return (
    <ul
      role="listbox"
      aria-label="ຜົນການຄົ້ນຫາບຸກຄົນ"
      className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-hair bg-surface p-1 shadow-dialog"
    >
      {users.isPending && (
        <li className="px-3 py-2 text-caption text-ink-3" role="status">
          ກຳລັງຄົ້ນຫາ...
        </li>
      )}
      {users.isSuccess && items.length === 0 && (
        <li className="px-3 py-2 text-caption text-ink-3">ບໍ່ພົບຜູ້ໃຊ້ທີ່ຕົງກັບຄຳຄົ້ນ</li>
      )}
      {items.map((u) => (
        <li key={u.id} role="option" aria-selected={false}>
          <button
            type="button"
            // mousedown มาก่อน blur ของช่องค้น — ถ้าใช้ onClick รายการจะปิดไปก่อนคลิกถึง
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(u.id)}
            className="flex w-full items-center gap-3 rounded px-3 py-2 text-left hover:bg-subtle"
          >
            <Avatar name={u.full_name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm font-semibold text-ink">{u.full_name}</span>
              <span className="block truncate text-caption text-ink-3">
                {u.company.code}
                {u.department ? ` · ${u.department.name}` : ''}
                {u.employee_code ? ` · ${u.employee_code}` : ''}
              </span>
            </span>
          </button>
        </li>
      ))}
      {users.isSuccess && users.data.total > items.length && (
        <li className="px-3 py-2 text-caption text-ink-3">
          ສະແດງ {items.length} ຈາກ {users.data.total} ຄົນ — ພິມເພີ່ມເພື່ອຄົ້ນໃຫ້ແຄບລົງ
        </li>
      )}
    </ul>
  );
}

// ── เนื้อหารายงาน ─────────────────────────────────────────────────────

/**
 * แยกออกมาเพื่อให้ `report` เป็นค่าที่มีแน่นอน — เหตุผลเดียวกับ DashboardContent
 */
function ReportContent({
  report,
  filters,
  onPageChange,
}: {
  report: TicketReport;
  filters: Filters;
  onPageChange: (page: number) => void;
}): React.JSX.Element {
  const t = report.totals;
  const showCompanies = report.by_company.length > 1;
  const showDepartments = report.by_department.length > 1;
  const showProject = report.tickets.items.some((i) => i.support_project);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="ທັງໝົດ" value={formatNumber(t.total)} icon={Layers} hint="ເລື່ອງທີ່ແຈ້ງໃນຊ່ວງເວລານີ້" />
        <StatCard label="ຍັງເປີດຢູ່" value={formatNumber(t.open)} icon={Inbox} hint="ຍັງບໍ່ທັນຈົບ — ລວມທຸກສະຖານະທີ່ລໍຖ້າ" />
        {/* incident นับเป็น resolved · service_request นับเป็น fulfilled — ทั้งคู่คือ "ทีมงานทำจบแล้ว รอผู้แจ้งยืนยัน" */}
        <StatCard label="ເຮັດສຳເລັດແລ້ວ" value={formatNumber(t.resolved)} tone="ok" icon={CheckCircle2} hint="ແກ້ໄຂ / ສົ່ງມອບແລ້ວ ລໍຖ້າຜູ້ແຈ້ງຢືນຢັນປິດ" />
        <StatCard label="ປິດແລ້ວ" value={formatNumber(t.closed)} icon={Archive} />
        <StatCard label="ຍົກເລີກ" value={formatNumber(t.cancelled)} icon={XCircle} />
        <StatCard
          label="ເກີນກຳນົດ SLA"
          value={formatNumber(t.breached)}
          {...(t.breached > 0 ? { tone: 'breach' as const } : {})}
          icon={AlertOctagon}
          hint={
            t.breached_percent === null
              ? 'ຍັງບໍ່ມີເລື່ອງໃຫ້ວັດ'
              : `${formatPercent(t.breached_percent)} ຂອງທັງໝົດ · ຕັດເລື່ອງທີ່ມີເຫດຍົກເວັ້ນອອກແລ້ວ`
          }
        />
        <StatCard
          label="ຄະແນນຄວາມພໍໃຈສະເລ່ຍ"
          value={t.avg_satisfaction === null ? '—' : t.avg_satisfaction.toFixed(2)}
          {...(t.avg_satisfaction === null ? {} : { tone: t.avg_satisfaction >= 4.2 ? ('ok' as const) : ('risk' as const) })}
          icon={Star}
          hint={t.rated === 0 ? 'ຍັງບໍ່ມີໃຜໃຫ້ຄະແນນ' : `ຈາກ ${formatNumber(t.rated)} ຄົນທີ່ໃຫ້ຄະແນນ · ເປົ້າ ≥ 4.2`}
        />
        <StatCard
          label="ຜູ້ຮັບຜິດຊອບ"
          value={formatNumber(report.by_assignee.filter((r) => r.assignee !== null).length)}
          icon={UserRound}
          hint={
            report.by_assignee.some((r) => r.assignee === null)
              ? `ຍັງບໍ່ມີຜູ້ຮັບຜິດຊອບ ${formatNumber(report.by_assignee.find((r) => r.assignee === null)?.total ?? 0)} ເລື່ອງ`
              : 'ທຸກເລື່ອງມີຜູ້ຮັບຜິດຊອບແລ້ວ'
          }
        />
      </div>

      <TypeKpis report={report} type={filters.type} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ແຍກຕາມສະຖານະ</CardTitle>
          </CardHeader>
          <CardBody>
            <BreakdownBars
              rows={report.by_status.map((r) => ({
                key: r.status,
                label: <StatusBadge status={r.status} />,
                count: r.count,
              }))}
              total={t.total}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ແຍກຕາມລະດັບຄວາມສຳຄັນ</CardTitle>
          </CardHeader>
          <CardBody>
            <BreakdownBars
              rows={PRIORITY_ORDER.map((p) => ({
                key: p,
                label: <PriorityBadge priority={p} />,
                count: report.by_priority.find((r) => r.priority === p)?.count ?? 0,
                color: `var(--${p.toLowerCase()}-solid)`,
              }))}
              total={t.total}
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ແຍກຕາມຜູ້ຮັບຜິດຊອບ</CardTitle>
          <span className="text-caption text-ink-3">% ທັນ SLA ຄິດສະເພາະເລື່ອງທີ່ແກ້ໄຂ/ປິດແລ້ວ · ເປົ້າ ≥ {TARGET_PERCENT}%</span>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable
            columns={assigneeColumns}
            rows={report.by_assignee}
            rowKey={(r) => r.assignee?.id ?? 'unassigned'}
            caption="ຈຳນວນເລື່ອງແຍກຕາມຜູ້ຮັບຜິດຊອບ"
            emptyTitle="ບໍ່ມີເລື່ອງໃນເງື່ອນໄຂນີ້"
          />
        </CardBody>
      </Card>

      {(showCompanies || showDepartments) && (
        <div className={cn('grid gap-4', showCompanies && showDepartments && 'xl:grid-cols-2')}>
          {showCompanies && (
            <Card>
              <CardHeader>
                <CardTitle>ແຍກຕາມບໍລິສັດ</CardTitle>
              </CardHeader>
              <CardBody className="p-0">
                <DataTable
                  columns={companyColumns}
                  rows={report.by_company}
                  rowKey={(r) => r.company.id}
                  caption="ຈຳນວນເລື່ອງແຍກຕາມບໍລິສັດ"
                />
              </CardBody>
            </Card>
          )}
          {showDepartments && (
            <Card>
              <CardHeader>
                <CardTitle>ແຍກຕາມພະແນກ</CardTitle>
              </CardHeader>
              <CardBody className="p-0">
                <DataTable
                  columns={departmentColumns(showCompanies)}
                  rows={report.by_department}
                  rowKey={(r) => `${r.company.id}-${r.department?.id ?? 'none'}`}
                  caption="ຈຳນວນເລື່ອງແຍກຕາມພະແນກ"
                />
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ລາຍການເລື່ອງທີ່ຕົງເງື່ອນໄຂ</CardTitle>
          <span className="tabular text-caption text-ink-3">{formatNumber(report.tickets.total)} ເລື່ອງ · ໃໝ່ສຸດກ່ອນ</span>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable
            columns={ticketColumns(showProject)}
            rows={report.tickets.items}
            rowKey={(r) => r.id}
            caption="ລາຍການເລື່ອງແຈ້ງໃນລາຍງານ"
            emptyTitle="ບໍ່ພົບເລື່ອງທີ່ຕົງກັບເງື່ອນໄຂ"
            emptyHint="ລອງຂະຫຍາຍຊ່ວງເວລາ ຫຼື ລົບຕົວກັ່ນຕອງບາງອັນ"
          />
        </CardBody>
        <Pagination
          page={filters.page}
          pageSize={report.tickets.page_size}
          total={report.tickets.total}
          onPageChange={onPageChange}
        />
      </Card>
    </>
  );
}

/**
 * ตัวชี้วัดเฉพาะของแต่ละประเภท
 *
 * เหตุขัดข้องกับคำขอบริการวัดกันคนละเรื่อง — "แก้เร็วแค่ไหน" กับ "ส่งมอบเร็วแค่ไหน"
 * ไม่ใช่ตัวเลขที่เอามาเฉลี่ยรวมกันแล้วยังมีความหมาย จึงแยกเป็นคนละชุดการ์ด
 *
 * ⚠️ วาดเท่าที่ API ส่งมาจริง ไม่ได้ตัดสินจากตัวกรองที่ผู้ใช้เลือก
 *    ถ้า backend ยังไม่ส่งบล็อกพวกนี้ (หรือส่งมาเป็น null) ทั้งส่วนนี้จะหายไปเงียบ ๆ
 *    ซึ่งถูกต้องกว่าการ์ดที่เขียนว่า MTTR 0 นาที ทั้งที่แปลว่า "ไม่รู้"
 */
function TypeKpis({
  report,
  type,
}: {
  report: TicketReport;
  /** ประเภทที่ผู้ใช้กรองอยู่ — '' = ไม่ได้กรอง จึงแสดงทั้งสองชุดคู่กัน */
  type: TypeFilter;
}): React.JSX.Element | null {
  /*
   * backend ส่งทั้งสองบล็อกเสมอ และคำนวณแยกตามประเภทของตัวเองอยู่แล้ว
   * จึงซ่อนชุดที่ผู้ใช้ไม่ได้กรองถามถึง ไม่ใช่เพราะไม่มีข้อมูล แต่เพราะหน้าที่พาดหัวว่า
   * "เหตุขัดข้อง" ไม่ควรมีการ์ดคำขอบริการโผล่มาให้อ่านผิด
   */
  const inc = type !== 'service_request' ? (report.incident_metrics ?? null) : null;
  const sr = type !== 'incident' ? (report.service_request_metrics ?? null) : null;
  if (!inc && !sr) return null;

  return (
    <div className={cn('grid gap-4', inc && sr && 'xl:grid-cols-2')}>
      {inc && (
        <Card>
          <CardHeader>
            <CardTitle>{TICKET_TYPE.incident}</CardTitle>
            <span className="tabular text-caption text-ink-3">{formatNumber(inc.total)} ເລື່ອງ</span>
          </CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-3">
            <KpiCell
              label="ເວລາແກ້ໄຂສະເລ່ຍ (MTTR)"
              value={
                inc.mttr_business_minutes === null
                  ? '—'
                  : formatMinutes(inc.mttr_business_minutes, 'business_minutes')
              }
              hint={
                inc.mttr_business_minutes === null
                  ? 'ຍັງບໍ່ມີເລື່ອງທີ່ແກ້ໄຂສຳເລັດ'
                  : `ຈາກ ${formatNumber(inc.resolved_count)} ເລື່ອງ · ນັບສະເພາະເວລາເຮັດວຽກ`
              }
            />
            <KpiCell
              label="% ທັນກຳນົດ SLA"
              value={inc.sla_met_percent === null ? '—' : formatPercent(inc.sla_met_percent)}
              hint={inc.sla_met_percent === null ? 'ບໍ່ມີເລື່ອງໃນຕົວຫານ' : `ເປົ້າ ≥ ${TARGET_PERCENT}%`}
              {...(inc.sla_met_percent === null
                ? {}
                : { tone: inc.sla_met_percent >= TARGET_PERCENT ? ('ok' as const) : ('breach' as const) })}
            />
            <KpiCell
              label="ການເປີດເລື່ອງຊ້ຳ"
              value={formatNumber(inc.reopen_total)}
              // สองตัวเลขนี้ต่างกันจริง — 3 ครั้งอาจมาจากใบเดียวที่เปิดซ้ำสามรอบ
              hint={`${formatNumber(inc.reopen_total)} ຄັ້ງ ຈາກ ${formatNumber(inc.reopened_tickets)} ເລື່ອງ`}
              {...(inc.reopen_total > 0 ? { tone: 'risk' as const } : {})}
            />
          </CardBody>
        </Card>
      )}

      {sr && (
        <Card>
          <CardHeader>
            <CardTitle>{TICKET_TYPE.service_request}</CardTitle>
            <span className="tabular text-caption text-ink-3">{formatNumber(sr.total)} ເລື່ອງ</span>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiCell
                label="ເວລາສົ່ງມອບສະເລ່ຍ"
                value={
                  sr.avg_fulfillment_business_minutes === null
                    ? '—'
                    : formatMinutes(sr.avg_fulfillment_business_minutes, 'business_minutes')
                }
                // ต้องบอกว่านับจากตอนอนุมัติครบ ไม่ใช่ตอนเปิดเรื่อง ไม่งั้นผู้บริหารจะเทียบ
                // ตัวเลขนี้กับ "ผู้ขอรอมานานแค่ไหน" ซึ่งเป็นคนละอย่างและยาวกว่าเสมอ
                hint={
                  sr.avg_fulfillment_business_minutes === null
                    ? 'ຍັງບໍ່ມີຄຳຂໍທີ່ສົ່ງມອບແລ້ວ'
                    : `ຈາກ ${formatNumber(sr.fulfilled_count)} ເລື່ອງ · ນັບຕັ້ງແຕ່ອະນຸມັດຄົບ`
                }
              />
              <KpiCell
                label="ຄ້າງລໍຖ້າອະນຸມັດ"
                value={formatNumber(sr.pending_approval_count)}
                hint="ຄໍຂວດທີ່ທີມໄອທີແກ້ເອງບໍ່ໄດ້"
                {...(sr.pending_approval_count > 0 ? { tone: 'risk' as const } : {})}
              />
              <KpiCell
                label="ບໍ່ອະນຸມັດ"
                value={formatNumber(sr.rejected_count)}
                hint="ຄຳຂໍທີ່ຜູ້ພິຈາລະນາປະຕິເສດ"
              />
            </div>

            <div className="border-t border-hair pt-3">
              <p className="mb-2 text-label text-ink">ລາຍການບໍລິການທີ່ຖືກຂໍຫຼາຍທີ່ສຸດ</p>
              {sr.top_catalog_items.length === 0 ? (
                <p className="text-caption text-ink-3">ຍັງບໍ່ມີຄຳຂໍທີ່ຜູກກັບລາຍການບໍລິການ</p>
              ) : (
                <BreakdownBars
                  rows={sr.top_catalog_items.map((item) => ({
                    key: String(item.id),
                    label: (
                      <span className="text-body-sm text-ink" title={item.code}>
                        {item.name_th}
                      </span>
                    ),
                    count: item.count,
                  }))}
                  total={sr.top_catalog_items.reduce((sum, i) => sum + i.count, 0)}
                />
              )}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/** ตัวเลขหนึ่งตัวพร้อมคำอธิบาย — เล็กกว่า StatCard เพราะอยู่ในการ์ดอีกที */
function KpiCell({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'ok' | 'risk' | 'breach' | undefined;
}): React.JSX.Element {
  return (
    <div>
      <p className="text-caption text-ink-2">{label}</p>
      <p
        className={cn(
          'tabular mt-0.5 text-h2 font-semibold',
          tone === 'ok' && 'text-sla-ok',
          tone === 'risk' && 'text-sla-risk',
          tone === 'breach' && 'text-sla-breach',
        )}
      >
        {value}
      </p>
      <p className="text-caption text-ink-3">{hint}</p>
    </div>
  );
}

/**
 * แถบสัดส่วนพร้อมป้าย — ตัวเลขอ่านได้จากข้อความเสมอ แถบเป็นแค่ตัวช่วยเทียบ
 * ป้ายสถานะ/ระดับส่งมาเป็น badge จากข้างนอก เพื่อคงกฎ สี+ไอคอน+ข้อความ
 */
function BreakdownBars({
  rows,
  total,
}: {
  rows: { key: string; label: React.ReactNode; count: number; color?: string | undefined }[];
  total: number;
}): React.JSX.Element {
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const percent = total === 0 ? 0 : (row.count / total) * 100;
        return (
          <li key={row.key}>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">{row.label}</span>
              <span className="tabular flex-none text-body-sm font-semibold">
                {formatNumber(row.count)}
                <span className="ml-1 text-caption font-normal text-ink-3">({formatPercent(percent, 0)})</span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
              <div
                className={cn('h-full rounded-full', !row.color && 'bg-primary')}
                style={{ width: `${percent}%`, ...(row.color ? { backgroundColor: row.color } : {}) }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── คอลัมน์ตาราง ──────────────────────────────────────────────────────

function MetPercentCell({ value }: { value: number | null }): React.JSX.Element {
  // null = ไม่มีเรื่องที่แก้เสร็จเลย ไม่ใช่ 0% — สองอย่างนี้อ่านแล้วเข้าใจคนละทาง
  if (value === null) return <span className="text-caption text-ink-3">ບໍ່ມີຂໍ້ມູນ</span>;
  return (
    <span className={cn('tabular font-semibold', value >= TARGET_PERCENT ? 'text-sla-ok' : 'text-sla-breach')}>
      {formatPercent(value)}
    </span>
  );
}

function num(v: number): React.JSX.Element {
  return <span className="tabular">{formatNumber(v)}</span>;
}

function breachedCell(v: number): React.JSX.Element {
  return <span className={cn('tabular', v > 0 && 'font-semibold text-sla-breach')}>{formatNumber(v)}</span>;
}

/** คอลัมน์ตัวเลขที่ทุกตาราง "แยกตาม…" ใช้ร่วมกัน */
function rollupColumns<T extends TicketReportAssigneeRow | TicketReportCompanyRow | TicketReportDepartmentRow>(): Column<T>[] {
  return [
    { key: 'total', header: 'ທັງໝົດ', align: 'right', render: (r) => num(r.total) },
    { key: 'open', header: 'ຍັງເປີດ', align: 'right', hideBelow: 'md', render: (r) => num(r.open) },
    { key: 'done', header: 'ແກ້ໄຂ/ປິດແລ້ວ', align: 'right', render: (r) => num(r.done) },
    { key: 'breached', header: 'ເກີນກຳນົດ', align: 'right', render: (r) => breachedCell(r.breached) },
    { key: 'met', header: '% ທັນ SLA', align: 'right', render: (r) => <MetPercentCell value={r.met_percent} /> },
  ];
}

const assigneeColumns: Column<TicketReportAssigneeRow>[] = [
  {
    key: 'person',
    header: 'ຜູ້ຮັບຜິດຊອບ',
    width: '100%',
    render: (r) =>
      r.assignee ? (
        <span className="flex items-center gap-2">
          <Avatar name={r.assignee.full_name} size="sm" />
          <span className="min-w-0 truncate text-body-sm font-semibold text-ink">{r.assignee.full_name}</span>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 flex-none place-items-center rounded-full border border-dashed border-control text-ink-3"
          >
            <UserRound className="h-3.5 w-3.5" />
          </span>
          <span className="text-body-sm text-ink-3">ຍັງບໍ່ມີຜູ້ຮັບຜິດຊອບ</span>
        </span>
      ),
  },
  ...rollupColumns<TicketReportAssigneeRow>(),
];

const companyColumns: Column<TicketReportCompanyRow>[] = [
  {
    key: 'company',
    header: 'ບໍລິສັດ',
    width: '100%',
    render: (r) => (
      <span className="text-body-sm">
        <span className="font-semibold">{r.company.code}</span>
        {r.company.name_th && <span className="block text-caption text-ink-3">{r.company.name_th}</span>}
      </span>
    ),
  },
  ...rollupColumns<TicketReportCompanyRow>(),
];

function departmentColumns(withCompany: boolean): Column<TicketReportDepartmentRow>[] {
  return [
    {
      key: 'department',
      header: 'ພະແນກ',
      width: '100%',
      render: (r) => (
        <span className="text-body-sm">
          <span className={cn('font-semibold', !r.department && 'text-ink-3')}>
            {r.department?.name ?? 'ບໍ່ລະບຸພະແນກ'}
          </span>
          {withCompany && <span className="block text-caption text-ink-3">{r.company.code}</span>}
        </span>
      ),
    },
    ...rollupColumns<TicketReportDepartmentRow>(),
  ];
}

/**
 * สถานะ SLA แบบหยาบสำหรับรายงาน — "ทัน / เกิน / หยุดนับ" พอ
 *
 * ไม่มีนาทีทำการที่เหลือเหมือนหน้ารายการ เพราะ backend ไม่คำนวณให้ในรายงาน
 * (ต้องอ่านปฏิทินและนโยบายรายบริษัทต่อใบ ซึ่งไม่คุ้มสำหรับหน้าสรุป)
 */
function reportSlaStatus(t: TicketReportItem): SlaStatus | null {
  // เรื่องที่จบแบบไม่ได้ทำ ไม่มี SLA ให้วัด — ทั้งยกเลิกเองและถูกปฏิเสธการอนุมัติ
  if (t.status === 'cancelled' || t.status === 'rejected') return null;
  if (t.is_resolution_breached) return 'breached';
  /*
   * "หยุดนับ" เฉพาะที่นาฬิกาหยุดจริง — รออนุมัติและรอผู้แจ้งเท่านั้น
   *
   * pending_vendor ไม่นับ เพราะนาฬิกายังเดินอยู่ (ดู WAITING_STATUSES ใน enums.ts)
   * ถ้าเหมารวมเข้ามา เรื่องที่ค้างรออะไหล่จนใกล้เกินกำหนดจะขึ้นป้าย "ຢຸດນັບ"
   * แล้วไม่มีใครตามต่อจนกว่าจะเกินไปแล้ว
   */
  if (isWaitingStatus(t.status)) return 'paused';
  return 'on_track';
}

/**
 * คอลัมน์ของรายการเรื่อง
 *
 * คอลัมน์โครงการโผล่เฉพาะเมื่อมีเรื่องที่มาจากโครงการจริงในหน้านี้ — องค์กรที่ยัง
 * ไม่ได้เปิดใช้ Support Hub (หรือ API รุ่นที่ยังไม่ส่งช่องนี้มา) จะได้ตารางเดิม
 * ไม่ใช่คอลัมน์ที่มีแต่ขีดกลางทั้งแถว
 */
function ticketColumns(withProject: boolean): Column<TicketReportItem>[] {
  return [
  {
    key: 'ticket',
    header: 'ເລກທີ່ / ຫົວຂໍ້',
    width: '100%',
    cellClassName: 'max-w-0',
    render: (t) => (
      <Link href={`/tickets/${t.id}`} className="group block min-w-0" title={t.subject}>
        <span className="tabular block text-caption text-ink-3">
          {t.ticket_no} · {TICKET_TYPE[t.ticket_type]}
        </span>
        <span className="block truncate text-body-sm font-semibold text-ink group-hover:text-primary">{t.subject}</span>
      </Link>
    ),
  },
  {
    key: 'priority',
    header: 'ລະດັບ',
    width: '1%',
    cellClassName: 'whitespace-nowrap',
    render: (t) => (
      <span className="inline-flex items-center gap-2" title={PRIORITY[t.priority].label}>
        <PriorityMeter priority={t.priority} />
        <span className="tabular text-body-sm font-semibold">{t.priority}</span>
      </span>
    ),
  },
  {
    key: 'status',
    header: 'ສະຖານະ',
    width: '1%',
    cellClassName: 'whitespace-nowrap',
    render: (t) => <StatusBadge status={t.status} pendingReason={t.pending_reason} className="min-w-max" />,
  },
  {
    key: 'sla',
    header: 'SLA',
    width: '1%',
    cellClassName: 'whitespace-nowrap',
    render: (t) => {
      const status = reportSlaStatus(t);
      if (status === null) return <span className="text-caption text-ink-3">—</span>;
      return (
        <span title={t.sla_exclusion_code ? `ມີເຫດຍົກເວັ້ນ SLA: ${t.sla_exclusion_code}` : undefined}>
          <SlaBadge status={status} className="min-w-max" />
        </span>
      );
    },
  },
  {
    key: 'assignee',
    header: 'ຜູ້ຮັບຜິດຊອບ',
    hideBelow: 'xl',
    width: '1%',
    cellClassName: 'whitespace-nowrap',
    render: (t) =>
      t.assignee ? (
        <span className="block max-w-[160px] truncate text-body-sm" title={t.assignee.full_name}>
          {t.assignee.full_name}
        </span>
      ) : (
        <span className="text-body-sm text-ink-3">ຍັງບໍ່ມີ</span>
      ),
  },
  {
    key: 'requester',
    header: 'ຜູ້ແຈ້ງ',
    hideBelow: 'xl',
    width: '1%',
    cellClassName: 'whitespace-nowrap',
    render: (t) => (
      <span className="block max-w-[160px] truncate text-body-sm" title={t.requester.full_name}>
        {t.requester.full_name}
      </span>
    ),
  },
  {
    key: 'org',
    header: 'ບໍລິສັດ / ພະແນກ',
    hideBelow: 'xl',
    width: '1%',
    cellClassName: 'whitespace-nowrap',
    render: (t) => (
      <span className="text-body-sm">
        <span className="inline-flex rounded-sm border border-hair bg-subtle px-1.5 py-0.5 text-caption font-semibold text-ink-2">
          {t.company.code}
        </span>
        {t.department && <span className="block text-caption text-ink-3">{t.department.name}</span>}
      </span>
    ),
  },
  ...(withProject
    ? [
        {
          key: 'project',
          header: 'ໂຄງການ',
          hideBelow: 'xl' as const,
          width: '1%',
          cellClassName: 'whitespace-nowrap',
          // แสดงรหัส ไม่ใช่ชื่อเต็ม เหมือนป้ายโครงการในกล่องแชท ชื่อเต็มอยู่ใน title
          render: (t: TicketReportItem) =>
            t.support_project ? (
              <span
                className="inline-flex rounded-sm border border-hair px-1.5 py-0.5 font-mono text-caption text-ink-2"
                title={t.support_project.name}
              >
                {t.support_project.code}
              </span>
            ) : (
              <span className="text-caption text-ink-3">—</span>
            ),
        },
      ]
    : []),
  {
    key: 'created',
    header: 'ແຈ້ງເມື່ອ',
    align: 'right',
    width: '1%',
    cellClassName: 'whitespace-nowrap',
    render: (t) => (
      <time dateTime={t.created_at} title={formatDateTime(t.created_at)} className="tabular text-caption text-ink-3">
        {formatDateShort(t.created_at)}
      </time>
    ),
  },
  ];
}

// ── ส่งออก CSV ─────────────────────────────────────────────────────────

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function pct(v: number | null): string {
  return v === null ? '' : `${v}%`;
}

/**
 * ส่งออกสิ่งที่โหลดมาแล้วทั้งหมดเป็นไฟล์เดียว — สรุป · ทุกมิติ · รายการหน้าปัจจุบัน
 *
 * ทำที่เบราว์เซอร์จากข้อมูลชุดเดียวกับที่แสดงอยู่ ตัวเลขในไฟล์จึงตรงกับหน้าจอ
 * ทุกตัว ณ เวลาที่กด · BOM ต้นไฟล์จำเป็น — Excel บน Windows จะอ่านอักษรลาว
 * เป็นขยะถ้าไม่มี
 *
 * ⚠️ รายการเรื่องมีเฉพาะหน้าที่เปิดอยู่ ไม่ใช่ทั้งหมด — ระบุไว้ในหัวตารางของไฟล์
 */
function downloadCsv(report: TicketReport, filters: Filters): void {
  const rows: (string | number | null)[][] = [];
  const t = report.totals;

  rows.push(['ລາຍງານເລື່ອງແຈ້ງ', `${filters.from} – ${filters.to}`]);
  // ประเภทที่กรองต้องอยู่ในไฟล์ด้วย ไม่งั้นไฟล์ที่ส่งต่อกันบอกไม่ได้ว่าเป็นตัวเลขของอะไร
  rows.push(['ປະເພດເລື່ອງ', filters.type ? TICKET_TYPE[filters.type] : 'ທຸກປະເພດ']);
  rows.push([]);
  rows.push(['ສະຫຼຸບ']);
  rows.push(['ທັງໝົດ', t.total]);
  rows.push(['ຍັງເປີດຢູ່', t.open]);
  rows.push(['ແກ້ໄຂແລ້ວ', t.resolved]);
  rows.push(['ປິດແລ້ວ', t.closed]);
  rows.push(['ຍົກເລີກ', t.cancelled]);
  rows.push(['ເກີນກຳນົດ SLA', t.breached, pct(t.breached_percent)]);
  rows.push(['ຄະແນນຄວາມພໍໃຈສະເລ່ຍ', t.avg_satisfaction, `ຈາກ ${t.rated} ຄົນ`]);

  // ตัวชี้วัดเฉพาะประเภท — เขียนเฉพาะบล็อกที่ API ส่งมาจริง เหมือนกับที่หน้าจอวาด
  const inc = report.incident_metrics;
  if (inc) {
    rows.push([]);
    rows.push([TICKET_TYPE.incident, inc.total]);
    rows.push(['ເວລາແກ້ໄຂສະເລ່ຍ MTTR (ນາທີເຮັດວຽກ)', inc.mttr_business_minutes, `ຈາກ ${inc.resolved_count} ເລື່ອງ`]);
    rows.push(['% ທັນກຳນົດ SLA', pct(inc.sla_met_percent)]);
    rows.push(['ການເປີດເລື່ອງຊ້ຳ (ຄັ້ງ)', inc.reopen_total, `ຈາກ ${inc.reopened_tickets} ເລື່ອງ`]);
  }
  const sr = report.service_request_metrics;
  if (sr) {
    rows.push([]);
    rows.push([TICKET_TYPE.service_request, sr.total]);
    rows.push([
      'ເວລາສົ່ງມອບສະເລ່ຍ (ນາທີເຮັດວຽກ ນັບຕັ້ງແຕ່ອະນຸມັດຄົບ)',
      sr.avg_fulfillment_business_minutes,
      `ຈາກ ${sr.fulfilled_count} ເລື່ອງ`,
    ]);
    rows.push(['ຄ້າງລໍຖ້າອະນຸມັດ', sr.pending_approval_count]);
    rows.push(['ບໍ່ອະນຸມັດ', sr.rejected_count]);
    rows.push(['ລາຍການບໍລິການທີ່ຖືກຂໍຫຼາຍທີ່ສຸດ', 'ລະຫັດ', 'ຈຳນວນ']);
    for (const item of sr.top_catalog_items) {
      rows.push([item.name_th, item.code, item.count]);
    }
  }

  rows.push([]);
  rows.push(['ແຍກຕາມສະຖານະ', 'ຈຳນວນ']);
  for (const r of report.by_status) rows.push([statusLabel(r.status), r.count]);

  rows.push([]);
  rows.push(['ແຍກຕາມລະດັບ', 'ຈຳນວນ']);
  for (const r of report.by_priority) rows.push([PRIORITY[r.priority].label, r.count]);

  const rollupHeader = ['ທັງໝົດ', 'ຍັງເປີດ', 'ແກ້ໄຂ/ປິດແລ້ວ', 'ເກີນກຳນົດ', '% ທັນ SLA'];
  const rollup = (r: { total: number; open: number; done: number; breached: number; met_percent: number | null }) => [
    r.total,
    r.open,
    r.done,
    r.breached,
    pct(r.met_percent),
  ];

  rows.push([]);
  rows.push(['ແຍກຕາມຜູ້ຮັບຜິດຊອບ', ...rollupHeader]);
  for (const r of report.by_assignee) {
    rows.push([r.assignee?.full_name ?? 'ຍັງບໍ່ມີຜູ້ຮັບຜິດຊອບ', ...rollup(r)]);
  }

  rows.push([]);
  rows.push(['ແຍກຕາມບໍລິສັດ', ...rollupHeader]);
  for (const r of report.by_company) rows.push([r.company.code, ...rollup(r)]);

  rows.push([]);
  rows.push(['ບໍລິສັດ', 'ແຍກຕາມພະແນກ', ...rollupHeader]);
  for (const r of report.by_department) {
    rows.push([r.company.code, r.department?.name ?? 'ບໍ່ລະບຸພະແນກ', ...rollup(r)]);
  }

  rows.push([]);
  rows.push([
    `ລາຍການເລື່ອງ (ໜ້າ ${report.tickets.page}/${report.tickets.total_pages} · ${report.tickets.items.length} ຈາກ ${report.tickets.total})`,
  ]);
  rows.push([
    'ເລກທີ່',
    'ປະເພດ',
    'ຫົວຂໍ້',
    'ສະຖານະ',
    'ລະດັບ',
    'ບໍລິສັດ',
    'ພະແນກ',
    'ໝວດໝູ່',
    'ໂຄງການ',
    'ຜູ້ແຈ້ງ',
    'ຜູ້ຮັບຜິດຊອບ',
    'ແຈ້ງເມື່ອ',
    'ຄົບກຳນົດ',
    'ແກ້ໄຂເມື່ອ',
    'ປິດເມື່ອ',
    'ເກີນກຳນົດ SLA',
    'ຄະແນນ',
  ]);
  for (const i of report.tickets.items) {
    rows.push([
      i.ticket_no,
      TICKET_TYPE[i.ticket_type],
      i.subject,
      statusLabel(i.status),
      i.priority,
      i.company.code,
      i.department?.name ?? '',
      i.category.name_th,
      i.support_project?.code ?? '',
      i.requester.full_name,
      i.assignee?.full_name ?? '',
      i.created_at,
      i.resolution_due_at,
      i.resolved_at,
      i.closed_at,
      i.is_resolution_breached ? 'ເກີນ' : '',
      i.satisfaction_score,
    ]);
  }

  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ticket-report_${filters.from}_${filters.to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
