'use client';

import { AlertOctagon, AlertTriangle, CheckCircle2, Clock, Inbox } from 'lucide-react';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardBody, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { PRIORITY, STATUS_ORDER, statusLabel } from '@/config/enums';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useDashboardSummary } from '@/lib/queries/master-data';
import type { DashboardSummary } from '@/lib/types';

/**
 * แดชบอร์ด (FR-60, FR-61, US-09)
 *
 * เรียงจาก "ต้องทำอะไรตอนนี้" ไป "ภาพรวมเดือนนี้" ไป "แนวโน้ม" — คนเปิดหน้านี้ต้องเห็น
 * ก่อนว่ามีอะไรค้างและเกินกำหนดเท่าไร แล้วค่อยลงไปดูรายละเอียด
 *
 *   1. ตอนนี้      เปิดอยู่ · เกินกำหนด · ใกล้ครบกำหนด          (ตัวเลขใหญ่ 3 ช่อง)
 *   2. เดือนนี้    ความสุขภาพ SLA เทียบเป้า · ระดับความสำคัญ   (สองการ์ดคู่กัน)
 *   3. รายละเอียด  สถานะ · หมวดหมู่ที่แจ้งมากสุด
 *   4. แนวโน้ม     7 วัน แจ้งเข้า/แก้แล้ว
 *
 * ทุกข้อมูลอ่านได้จากตัวเลขบนหน้า ไม่ใช่กราฟล้วน — ผู้ใช้ที่ใช้โปรแกรมอ่านหน้าจอต้องได้ข้อมูล
 * เดียวกับคนที่เห็นกราฟ
 */

/** เป้า SLA Compliance รายเดือน (SLA 5.1) */
const COMPLIANCE_TARGET = 95;

export default function DashboardPage(): React.JSX.Element {
  const { user } = useSession();
  const query = useDashboardSummary();
  const d = query.data;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="ແດຊບອດ"
        description={`ພາບລວມຂອງ ${user.scoped_companies.map((c) => c.code).join(' · ') || 'ທຸກບໍລິສັດ'}`}
      />

      <QueryBoundary query={query}>{d && <DashboardContent d={d} />}</QueryBoundary>
    </div>
  );
}

/**
 * นาทีปฏิทิน → ข้อความอ่านง่าย เช่น "3 ມື້ 11 ຊມ."
 *
 * ใช้กับเวลาตอบรับเฉลี่ยซึ่งวัดเป็นนาทีปฏิทิน (created_at → first_response_at) ไม่ใช่นาทีทำการ
 * จึงแปลงเป็นวันด้วย 1,440 ได้ ต่างจาก formatMinutes ที่ห้ามหารแบบนี้กับนาทีทำการ
 * ตัวเลขดิบอย่าง "5001 ນທ." ผู้ใช้ต้องคิดเองว่าคือกี่วัน
 */
function formatCalendarDuration(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} ນທ.`;
  if (total < 1440) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m > 0 ? `${h} ຊມ. ${m} ນທ.` : `${h} ຊມ.`;
  }
  const days = Math.floor(total / 1440);
  const hours = Math.round((total % 1440) / 60);
  return hours > 0 ? `${days} ມື້ ${hours} ຊມ.` : `${days} ມື້`;
}

/**
 * เนื้อหาแดชบอร์ด — แยกออกมาเพื่อให้ `d` เป็นค่าที่มีแน่นอน
 *
 * ถ้าปล่อยไว้ในคอมโพเนนต์เดียวกัน ทุกจุดที่อ่าน d ต้องเขียน `d?.` ซึ่ง
 * ทำให้ตัวเลขที่ยังโหลดไม่เสร็จกลายเป็น undefined แล้วแสดงเป็นช่องว่าง
 * ปนกับตัวเลขจริง — แยกออกมาแล้ว QueryBoundary รับประกันว่ามีข้อมูลแล้ว
 */
function DashboardContent({ d }: { d: DashboardSummary }): React.JSX.Element {
  /*
   * sla_compliance_percent เป็น null ได้เมื่อยังไม่มีเรื่องปิดในเดือนนี้
   * null < 95 ใน JavaScript เป็น true (null ถูกแปลงเป็น 0) ซึ่งจะทำให้
   * ขึ้นคำเตือน "ต่ำกว่าเป้า" ตั้งแต่เดือนที่ยังไม่มีใครปิดงานเลย
   * จึงต้องเช็ค null แยกก่อนเสมอ
   */
  const compliance = d.sla_compliance_percent;
  const belowTarget = compliance !== null && compliance < COMPLIANCE_TARGET;

  const breachedShare = d.open_tickets > 0 ? (d.breached / d.open_tickets) * 100 : 0;

  return (
    <>
      {/* ── 1. ตอนนี้ ───────────────────────────────────────────── */}
      <section aria-label="ສະຖານະຕອນນີ້" className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="ເລື່ອງທີ່ຍັງເປີດຢູ່"
          value={formatNumber(d.open_tickets)}
          icon={Inbox}
          hint="ທັງໝົດທີ່ຍັງບໍ່ປິດ"
        />
        <StatCard
          label="ເກີນກຳນົດ SLA"
          value={formatNumber(d.breached)}
          tone="breach"
          icon={AlertOctagon}
          emphasized={d.breached > 0}
          hint={
            d.breached > 0
              ? `ຄິດເປັນ ${formatPercent(breachedShare, 0)} ຂອງເລື່ອງທີ່ເປີດຢູ່ · ຈັດການກ່ອນ`
              : 'ບໍ່ມີເລື່ອງທີ່ເກີນກຳນົດ'
          }
        />
        <StatCard
          label="ໃກ້ຄົບກຳນົດ"
          value={formatNumber(d.at_risk)}
          tone="risk"
          icon={Clock}
          hint="ເຫຼືອເວລາບໍ່ເຖິງ 20%"
        />
      </section>

      {/* ── 2. เดือนนี้ + ระดับความสำคัญ ────────────────────────── */}
      <section className="grid gap-4 xl:grid-cols-2">
        <SlaHealthCard
          d={d}
          compliance={compliance}
          belowTarget={belowTarget}
        />
        <PriorityCard d={d} />
      </section>

      {/* ── 3. รายละเอียด ───────────────────────────────────────── */}
      <section className="grid gap-4 xl:grid-cols-2">
        <StatusCard d={d} />
        <CategoriesCard d={d} />
      </section>

      {/* ── 4. แนวโน้ม ──────────────────────────────────────────── */}
      <TrendCard d={d} />
    </>
  );
}

/**
 * สุขภาพ SLA เดือนนี้ — ตัวเลขเดียวใหญ่ ๆ + แถบเทียบเป้า
 *
 * เดิมเป็นแถบเตือนสีส้มแยกอยู่บนสุดและซ่อนตัวเลขจริงไว้ในการ์ดอีกใบ ผู้ใช้ต้องอ่านสองที่
 * ถึงจะรู้ว่า "ได้เท่าไร ต่ำกว่าเป้ากี่จุด" — รวมไว้ที่เดียวและให้แถบมีเส้นเป้าหมายกำกับ
 */
function SlaHealthCard({
  d,
  compliance,
  belowTarget,
}: {
  d: DashboardSummary;
  compliance: number | null;
  belowTarget: boolean;
}): React.JSX.Element {
  const onTarget = compliance !== null && !belowTarget;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ສຸຂະພາບ SLA ເດືອນນີ້</CardTitle>
        {compliance !== null && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-semibold',
              onTarget ? 'bg-sla-ok-bg text-sla-ok' : 'bg-sla-risk-bg text-sla-risk',
            )}
          >
            {onTarget ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {onTarget ? 'ຜ່ານເປົ້າ' : `ຕ່ຳກວ່າເປົ້າ ${COMPLIANCE_TARGET}%`}
          </span>
        )}
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <p className="text-caption text-ink-3">ອັດຕາທັນ SLA (SLA Compliance)</p>
            <p
              className={cn(
                'tabular text-display',
                compliance === null ? 'text-ink-3' : onTarget ? 'text-sla-ok' : 'text-sla-risk',
              )}
            >
              {compliance === null ? '—' : formatPercent(compliance, 0)}
            </p>
          </div>

          <dl className="flex gap-6">
            <div>
              <dt className="text-caption text-ink-3">ແກ້ໄຂແລ້ວເດືອນນີ້</dt>
              <dd className="tabular text-h3">{formatNumber(d.resolved_this_month)}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-3">ຕອບຮັບສະເລ່ຍ</dt>
              <dd className="tabular text-h3">
                {d.avg_first_response_minutes === null
                  ? '—'
                  : formatCalendarDuration(d.avg_first_response_minutes)}
              </dd>
            </div>
          </dl>
        </div>

        {/* แถบเทียบเป้า: ช่องเต็ม = 100% เส้นแนวตั้ง = เป้า 95% */}
        <div>
          <div
            className="relative h-3 rounded-full bg-subtle"
            role="img"
            aria-label={
              compliance === null
                ? 'ຍັງບໍ່ມີເລື່ອງທີ່ປິດໃນເດືອນນີ້'
                : `SLA ${formatPercent(compliance, 0)} ເປົ້າ ${COMPLIANCE_TARGET}%`
            }
          >
            {compliance !== null && (
              <div
                className={cn('h-full rounded-full', onTarget ? 'bg-sla-ok' : 'bg-sla-risk')}
                // ขั้นต่ำ 2% ให้ยังเห็นแถบเมื่อค่าใกล้ศูนย์ — ค่าจริงอยู่ใน aria-label
                style={{ width: `${Math.max(Math.min(compliance, 100), 2)}%` }}
              />
            )}
            <span
              className="absolute -top-1 bottom-[-4px] w-0.5 rounded bg-ink"
              style={{ left: `${COMPLIANCE_TARGET}%` }}
              aria-hidden="true"
            />
          </div>
          <div className="relative mt-1 h-4 text-caption text-ink-3">
            <span className="absolute left-0">0%</span>
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap font-semibold text-ink-2"
              style={{ left: `${COMPLIANCE_TARGET}%` }}
            >
              ເປົ້າ {COMPLIANCE_TARGET}%
            </span>
          </div>
        </div>

        {compliance === null ? (
          <p className="text-caption text-ink-3">ຍັງບໍ່ມີເລື່ອງທີ່ປິດໃນເດືອນນີ້</p>
        ) : (
          belowTarget && (
            <p className="rounded border border-hair bg-subtle px-3 py-2 text-caption text-ink-2">
              ຖ້າຕ່ຳກວ່າເປົ້າສອງເດືອນຕິດ ຫົວໜ້າໄອທີຕ້ອງສະເໜີແຜນປັບປຸງບໍລິການ (SIP) ຕໍ່ຜູ້ບໍລິຫານສູງສຸດໂດຍກົງ
            </p>
          )
        )}
      </CardBody>
    </Card>
  );
}

/** ระดับความสำคัญ — แถบแนวนอนแทนกราฟแท่ง + ตารางตัวเลขซ้ำสองชุดที่บอกข้อมูลเดียวกัน */
function PriorityCard({ d }: { d: DashboardSummary }): React.JSX.Element {
  const rows = (Object.keys(PRIORITY) as (keyof typeof PRIORITY)[]).map((p) => ({
    priority: p,
    count: d.by_priority.find((x) => x.priority === p)?.count ?? 0,
  }));
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle>ເລື່ອງທີ່ເປີດຢູ່ ແຍກຕາມລະດັບ</CardTitle>
        <span className="tabular text-caption text-ink-3">ທັງໝົດ {formatNumber(d.open_tickets)}</span>
      </CardHeader>
      <CardBody>
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.priority}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-body-sm">{PRIORITY[row.priority].label}</span>
                <span className="tabular text-body-sm font-semibold">{formatNumber(row.count)}</span>
              </div>
              <div
                className="mt-1 h-2.5 overflow-hidden rounded-full bg-subtle"
                role="img"
                aria-label={`${PRIORITY[row.priority].label} ${row.count} ເລື່ອງ`}
              >
                {row.count > 0 && (
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max((row.count / max) * 100, 3)}%`,
                      background: `var(--${row.priority.toLowerCase()}-solid)`,
                    }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/** สถานะที่เปิดอยู่ — เรียงตามเส้นทางของงาน (ใหม่ → มอบหมาย → กำลังทำ …) ไม่ใช่ตามตัวอักษรที่ API ส่งมา */
function StatusCard({ d }: { d: DashboardSummary }): React.JSX.Element {
  const rank = (s: string): number => {
    const i = (STATUS_ORDER as readonly string[]).indexOf(s);
    return i === -1 ? STATUS_ORDER.length : i;
  };
  const rows = [...d.by_status].sort((a, b) => rank(a.status) - rank(b.status));
  const total = rows.reduce((sum, s) => sum + s.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>ສະຖານະຂອງເລື່ອງທີ່ເປີດຢູ່</CardTitle>
      </CardHeader>
      <CardBody>
        {rows.length === 0 ? (
          <p className="text-body-sm text-ink-3">ບໍ່ມີເລື່ອງທີ່ເປີດຢູ່</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((entry) => {
              const percent = total > 0 ? (entry.count / total) * 100 : 0;
              return (
                <li key={entry.status}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-body-sm">{statusLabel(entry.status)}</span>
                    <span className="tabular text-body-sm font-semibold">
                      {entry.count}
                      <span className="ml-1 text-caption font-normal text-ink-3">
                        ({formatPercent(percent, 0)})
                      </span>
                    </span>
                  </div>
                  <div
                    className="mt-1 h-2.5 overflow-hidden rounded-full bg-subtle"
                    role="img"
                    aria-label={`${statusLabel(entry.status)} ${entry.count} ເລື່ອງ`}
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(percent, 3)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/** หมวดหมู่ที่แจ้งมากสุด — ชื่อยาวตัดด้วย … (ชื่อเต็มอยู่ใน title) และมีแถบเทียบสัดส่วนกัน */
function CategoriesCard({ d }: { d: DashboardSummary }): React.JSX.Element {
  const max = Math.max(1, ...d.top_categories.map((c) => c.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle>ໝວດໝູ່ທີ່ແຈ້ງເຂົ້າຫຼາຍທີ່ສຸດ</CardTitle>
      </CardHeader>
      <CardBody>
        {d.top_categories.length === 0 ? (
          <p className="text-body-sm text-ink-3">ຍັງບໍ່ມີຂໍ້ມູນ</p>
        ) : (
          <ol className="space-y-3">
            {d.top_categories.map((c, index) => (
              <li key={c.name}>
                <div className="flex items-center gap-3">
                  <span className="tabular grid h-6 w-6 flex-none place-items-center rounded-full bg-subtle text-caption font-semibold text-ink-2">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body-sm" title={c.name}>
                    {c.name}
                  </span>
                  <span className="tabular flex-none text-body-sm font-semibold">{c.count}</span>
                </div>
                <div className="ml-9 mt-1 h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max((c.count / max) * 100, 3)}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-caption text-ink-3">
          ໃຊ້ລາຍການນີ້ເລືອກຫົວຂໍ້ຂຽນບົດຄວາມໃນຄັງຄວາມຮູ້
        </p>
      </CardBody>
    </Card>
  );
}

/**
 * แนวโน้ม 7 วัน — กราฟแท่งคู่ (แจ้งเข้า / แก้แล้ว)
 *
 * เดิมเป็นเส้นโค้งที่ลากผ่านวันที่ไม่มีเรื่อง ทำให้ดูเหมือนมีค่าระหว่างวัน (เส้นพุ่งเกินศูนย์)
 * ข้อมูลนี้เป็นจำนวนนับรายวัน แท่งอ่านตรงกว่าและเทียบสองชุดในวันเดียวกันได้ทันที
 */
function TrendCard({ d }: { d: DashboardSummary }): React.JSX.Element {
  const created = d.trend.reduce((sum, t) => sum + t.created, 0);
  const resolved = d.trend.reduce((sum, t) => sum + t.resolved, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>ແຈ້ງເຂົ້າ ທຽບກັບ ແກ້ໄຂແລ້ວ 7 ມື້</CardTitle>
        <span className="tabular text-caption text-ink-3">
          ແຈ້ງເຂົ້າ {formatNumber(created)} · ແກ້ໄຂແລ້ວ {formatNumber(resolved)}
        </span>
      </CardHeader>
      <CardBody>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.trend} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
              <YAxis tick={{ fontSize: 13 }} stroke="var(--text-muted)" allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'var(--bg-subtle, rgba(127,127,127,0.12))' }}
                contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}
              />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Bar dataKey="created" name="ແຈ້ງເຂົ້າ" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="resolved" name="ແກ້ໄຂແລ້ວ" fill="var(--chart-5)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardBody>
    </Card>
  );
}
