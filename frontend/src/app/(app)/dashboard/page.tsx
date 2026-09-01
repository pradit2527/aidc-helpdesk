'use client';

import { AlertOctagon, CheckCircle2, Clock, Inbox } from 'lucide-react';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardBody, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { Alert, MockNotice, PageHeader } from '@/components/ui/misc';
import { PRIORITY, TICKET_STATUS } from '@/config/enums';
import { formatNumber, formatPercent } from '@/lib/format';
import { useSession } from '@/lib/session';
import { DASHBOARD } from '@/mocks/data';

/**
 * แดชบอร์ด (FR-60, FR-61, US-09)
 *
 * ทุกกราฟมีตารางตัวเลขกำกับหรืออ่านค่าได้จากป้าย ไม่ใช่กราฟล้วน
 * ผู้ใช้ที่ใช้โปรแกรมอ่านหน้าจอต้องได้ข้อมูลเดียวกับคนที่เห็นกราฟ
 */
export default function DashboardPage(): React.JSX.Element {
  const { user } = useSession();
  const d = DASHBOARD;

  const priorityColors: Record<string, string> = {
    P1: 'var(--p1-solid)',
    P2: 'var(--p2-solid)',
    P3: 'var(--p3-solid)',
    P4: 'var(--p4-solid)',
  };

  const belowTarget = d.sla_compliance_percent < 95;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ແດຊບອດ"
        description={`ພາບລວມຂອງ ${user.scoped_companies.map((c) => c.code).join(' · ') || 'ທຸກບໍລິສັດ'}`}
      />

      <MockNotice endpoint="GET /dashboard/summary" />

      {belowTarget && (
        <Alert tone="warning" title={`SLA Compliance ເດືອນນີ້ ${formatPercent(d.sla_compliance_percent)} ຕ່ຳກວ່າເປົ້າ 95%`}>
          ຖ້າຕ່ຳກວ່າເປົ້າສອງເດືອນຕິດ ຫົວໜ້າໄອທີຕ້ອງສະເໜີແຜນປັບປຸງບໍລິການ (SIP) ຕໍ່ຜູ້ບໍລິຫານສູງສຸດໂດຍກົງ
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="ເລື່ອງທີ່ຍັງເປີດຢູ່" value={formatNumber(d.open_tickets)} icon={Inbox} />
        <StatCard
          label="ເກີນກຳນົດ SLA"
          value={formatNumber(d.breached)}
          tone="breach"
          icon={AlertOctagon}
          hint="ຕ້ອງຈັດການກ່ອນເປັນອັນດັບທຳອິດ"
        />
        <StatCard
          label="ໃກ້ຄົບກຳນົດ"
          value={formatNumber(d.at_risk)}
          tone="risk"
          icon={Clock}
          hint="ເຫຼືອເວລາບໍ່ເຖິງ 20%"
        />
        <StatCard
          label="ແກ້ໄຂແລ້ວເດືອນນີ້"
          value={formatNumber(d.resolved_this_month)}
          tone="ok"
          icon={CheckCircle2}
          hint={`SLA ${formatPercent(d.sla_compliance_percent)} · ຕອບຮັບສະເລ່ຍ ${d.avg_first_response_minutes} ນທ.`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ເລື່ອງທີ່ເປີດຢູ່ ແຍກຕາມລະດັບ</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.by_priority} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="priority" tick={{ fontSize: 13 }} stroke="var(--text-muted)" />
                  <YAxis tick={{ fontSize: 13 }} stroke="var(--text-muted)" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      fontSize: 14,
                    }}
                    formatter={(value: number) => [`${value} ເລື່ອງ`, '']}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {d.by_priority.map((entry) => (
                      <Cell key={entry.priority} fill={priorityColors[entry.priority]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* ตารางเดียวกับกราฟ เพื่อให้อ่านค่าได้โดยไม่ต้องพึ่งสายตา */}
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {d.by_priority.map((entry) => (
                <li key={entry.priority} className="rounded border border-hair px-3 py-2">
                  <span className="block text-caption text-ink-3">
                    {PRIORITY[entry.priority].label}
                  </span>
                  <span className="tabular block text-h3">{entry.count}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ແຈ້ງເຂົ້າ ທຽບກັບ ແກ້ໄຂແລ້ວ 7 ມື້</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.trend} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
                  <YAxis tick={{ fontSize: 13 }} stroke="var(--text-muted)" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      fontSize: 14,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  <Line
                    type="monotone"
                    dataKey="created"
                    name="ແຈ້ງເຂົ້າ"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="resolved"
                    name="ແກ້ໄຂແລ້ວ"
                    stroke="var(--chart-5)"
                    strokeWidth={2}
                    // เส้นประเพื่อให้แยกสองเส้นได้ในโหมดขาวดำ
                    strokeDasharray="5 3"
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ສະຖານະຂອງເລື່ອງທີ່ເປີດຢູ່</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="space-y-2">
              {d.by_status.map((entry) => {
                const total = d.by_status.reduce((sum, s) => sum + s.count, 0);
                const percent = (entry.count / total) * 100;
                return (
                  <li key={entry.status}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-body-sm">{TICKET_STATUS[entry.status].label}</span>
                      <span className="tabular text-body-sm font-semibold">
                        {entry.count}
                        <span className="ml-1 text-caption font-normal text-ink-3">
                          ({formatPercent(percent, 0)})
                        </span>
                      </span>
                    </div>
                    <div
                      className="mt-1 h-2 overflow-hidden rounded-full bg-subtle"
                      role="img"
                      aria-label={`${TICKET_STATUS[entry.status].label} ${entry.count} ເລື່ອງ`}
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ໝວດໝູ່ທີ່ແຈ້ງເຂົ້າຫຼາຍທີ່ສຸດ</CardTitle>
          </CardHeader>
          <CardBody>
            <ol className="space-y-2">
              {d.top_categories.map((c, index) => (
                <li key={c.name} className="flex items-center gap-3">
                  <span className="tabular grid h-6 w-6 flex-none place-items-center rounded-full bg-subtle text-caption font-semibold text-ink-2">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body-sm">{c.name}</span>
                  <span className="tabular flex-none text-body-sm font-semibold">{c.count}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-caption text-ink-3">
              ໃຊ້ລາຍການນີ້ເລືອກຫົວຂໍ້ຂຽນບົດຄວາມໃນຄັງຄວາມຮູ້
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
