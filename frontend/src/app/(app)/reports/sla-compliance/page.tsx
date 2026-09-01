'use client';

import { Download } from 'lucide-react';
import * as React from 'react';

import { PriorityBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Select } from '@/components/ui/field';
import { Alert, BackLink, MockNotice, PageHeader } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/lib/format';
import { COMPANIES, SLA_COMPLIANCE } from '@/mocks/data';
import type { SlaComplianceRow } from '@/lib/types';

const TARGET_PERCENT = 95;

/**
 * รายงาน SLA รายเดือน (FR-63)
 *
 * ตัวหารตัดเรื่องที่มี sla_exclusion_code ออกตาม KPI-1
 * จึงต้องแสดงจำนวนที่ถูกตัดออกด้วย ไม่ใช่แสดงแต่เปอร์เซ็นต์
 * มิฉะนั้นตัวเลขสวยขึ้นได้ด้วยการตั้งข้อยกเว้นเยอะ ๆ โดยไม่มีใครเห็น
 */
export default function SlaCompliancePage(): React.JSX.Element {
  const [month, setMonth] = React.useState('2026-08');
  const [company, setCompany] = React.useState('');

  const rows = SLA_COMPLIANCE.filter((r) => !company || String(r.company.id) === company);

  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      met: acc.met + r.met,
      excluded: acc.excluded + r.excluded,
    }),
    { total: 0, met: 0, excluded: 0 },
  );
  const overall = totals.total > 0 ? (totals.met / totals.total) * 100 : 0;

  const columns: Column<SlaComplianceRow>[] = [
    { key: 'company', header: 'ບໍລິສັດ', render: (r) => r.company.code },
    { key: 'priority', header: 'ລະດັບ', render: (r) => <PriorityBadge priority={r.priority} withMeter={false} /> },
    { key: 'total', header: 'ປິດທັງໝົດ', align: 'right', render: (r) => <span className="tabular">{formatNumber(r.total)}</span> },
    { key: 'met', header: 'ທັນເວລາ', align: 'right', render: (r) => <span className="tabular">{formatNumber(r.met)}</span> },
    {
      key: 'excluded',
      header: 'ຕັດອອກຈາກຕົວຫານ',
      align: 'right',
      hideBelow: 'md',
      render: (r) => (
        <span className={cn('tabular', r.excluded > 0 && 'text-sla-risk')}>
          {formatNumber(r.excluded)}
        </span>
      ),
    },
    {
      key: 'percent',
      header: '% ຕາມ SLA',
      align: 'right',
      render: (r) => (
        <span
          className={cn(
            'tabular font-semibold',
            r.compliance_percent >= TARGET_PERCENT ? 'text-sla-ok' : 'text-sla-breach',
          )}
        >
          {formatPercent(r.compliance_percent)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/reports" label="ກັບໄປສູນລາຍງານ" />
      <PageHeader
        title="ລາຍງານ SLA ລາຍເດືອນ"
        description="ອ້າງອີງ AIDC-IT-SLA-001 v1.1 ຂໍ້ 7.1 (KPI-1) — ເປົ້າໝາຍ ≥ 95%"
        actions={
          <Button variant="secondary">
            <Download className="h-4 w-4" aria-hidden="true" />
            ສົ່ງອອກ Excel
          </Button>
        }
      />

      <MockNotice endpoint="GET /reports/sla-compliance" />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="SLA Compliance ລວມ"
          value={formatPercent(overall)}
          tone={overall >= TARGET_PERCENT ? 'ok' : 'breach'}
          hint={`ເປົ້າໝາຍ ≥ ${TARGET_PERCENT}%`}
        />
        <StatCard label="ເລື່ອງທີ່ປິດ" value={formatNumber(totals.total)} />
        <StatCard label="ທັນເວລາ" value={formatNumber(totals.met)} tone="ok" />
        <StatCard
          label="ຕັດອອກຈາກຕົວຫານ"
          value={formatNumber(totals.excluded)}
          tone="risk"
          hint="ເລື່ອງທີ່ມີລະຫັດຂໍ້ຍົກເວັ້ນ SLA"
        />
      </div>

      {totals.excluded > 0 && (
        <Alert tone="info" title="ເລື່ອງທີ່ຕັດອອກຈາກຕົວຫານ">
          ເລື່ອງທີ່ມີລະຫັດຂໍ້ຍົກເວັ້ນ (ເຊັ່ນ ບຳລຸງຮັກສາຕາມແຜນ ເຫດສຸດວິໄສ ຫຼື ລໍຖ້າຜູ້ຮັບບໍລິການ)
          ບໍ່ຖືວ່າຜິດ SLA ແລະ ຖືກຕັດອອກຈາກຕົວຫານ — ສະແດງຈຳນວນໄວ້ເພື່ອໃຫ້ກວດສອບຍ້ອນຫຼັງໄດ້
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ຜົນຕາມບໍລິສັດ ແລະ ລະດັບ</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="ເລືອກເດືອນ"
              className="w-auto"
            >
              <option value="2026-08">ສິງຫາ 2569</option>
              <option value="2026-07">ກໍລະກົດ 2569</option>
              <option value="2026-06">ມິຖຸນາ 2569</option>
            </Select>
            <Select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              aria-label="ເລືອກບໍລິສັດ"
              className="w-auto"
            >
              <option value="">ທຸກບໍລິສັດ</option>
              {COMPANIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => `${r.company.id}-${r.priority}`}
            caption="ຜົນ SLA ແຍກຕາມບໍລິສັດ ແລະ ລະດັບຄວາມສຳຄັນ"
            emptyTitle="ບໍ່ມີຂໍ້ມູນໃນເດືອນທີ່ເລືອກ"
          />
        </CardBody>
      </Card>
    </div>
  );
}
