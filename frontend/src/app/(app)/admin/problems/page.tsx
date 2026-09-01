'use client';

import { AlertTriangle, Plus, Repeat } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Alert, BackLink, MockNotice, PageHeader } from '@/components/ui/misc';
import { PROBLEM_STATUS, type ProblemStatus } from '@/config/admin';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber } from '@/lib/format';
import { PROBLEMS } from '@/mocks/admin-data';
import type { ProblemRecord } from '@/lib/types';

/**
 * Problem และ RCA
 *
 * Problem แยกจาก Incident โดยเจตนา — Incident คือ "บริการกลับมาใช้ได้หรือยัง"
 * ส่วน Problem คือ "ทำไมมันพัง และจะกันไม่ให้พังซ้ำอย่างไร"
 * การบันทึกทางเลี่ยงชั่วคราวหยุดนาฬิกาของ Incident ได้ก็ต่อเมื่อเปิด Problem คู่กัน
 * มิฉะนั้นสาเหตุจริงจะไม่มีใครตามต่อ (SLA 5.4)
 */
export default function ProblemsPage(): React.JSX.Element {
  const rcaPending = PROBLEMS.filter((p) => p.status === 'rca_pending');
  const repeatRisk = PROBLEMS.filter((p) => p.linked_incident_count >= 3 && p.status !== 'closed');
  const open = PROBLEMS.filter((p) => p.status !== 'closed');

  const columns: Column<ProblemRecord>[] = [
    {
      key: 'code',
      header: 'ລະຫັດ / ຫົວຂໍ້',
      render: (p) => (
        <span className="block max-w-[380px]">
          <span className="tabular block font-mono text-caption text-ink-3">{p.code}</span>
          <span className="block truncate text-body-sm font-semibold">{p.title}</span>
        </span>
      ),
    },
    {
      key: 'service',
      header: 'ລະບົບງານ',
      hideBelow: 'md',
      render: (p) => <span className="text-body-sm">{p.service?.name_th ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'ສະຖານະ',
      render: (p) => {
        const meta = PROBLEM_STATUS[p.status as ProblemStatus];
        return (
          <span
            className={cn('rounded-full px-2.5 py-0.5 text-caption font-semibold', meta.className)}
          >
            {meta.label}
          </span>
        );
      },
    },
    {
      key: 'incidents',
      header: 'ເຫດທີ່ຜູກຢູ່',
      align: 'right',
      render: (p) => (
        <span
          className={cn(
            'tabular inline-flex items-center gap-1 font-semibold',
            p.linked_incident_count >= 3 ? 'text-sla-risk' : 'text-ink',
          )}
          // ซ้ำสาเหตุเดิม 3 ครั้งขึ้นไปคือสัญญาณว่าแก้ไม่ถูกจุด ไม่ใช่แค่โชคร้าย
          title={p.linked_incident_count >= 3 ? 'ເກີດຊ້ຳຫຼາຍຄັ້ງ ນັບເຂົ້າ KPI-7' : undefined}
        >
          {p.linked_incident_count >= 3 && <Repeat className="h-3.5 w-3.5" aria-hidden="true" />}
          {p.linked_incident_count}
        </span>
      ),
    },
    {
      key: 'rca',
      header: 'RCA',
      render: (p) => {
        if (p.rca_submitted_at) {
          return (
            <span className="text-caption text-sla-ok">
              ສົ່ງແລ້ວ {formatDate(p.rca_submitted_at)}
            </span>
          );
        }
        if (p.rca_due_at) {
          return (
            <span className="inline-flex items-center gap-1 text-caption font-semibold text-sla-risk">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              ຄົບກຳນົດ {formatDate(p.rca_due_at)}
            </span>
          );
        }
        return <span className="text-caption text-ink-3">—</span>;
      },
    },
    {
      key: 'owner',
      header: 'ເຈົ້າຂອງ',
      hideBelow: 'lg',
      render: (p) => <span className="text-body-sm">{p.owner?.full_name ?? '—'}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/admin" label="ກັບໄປສູນຄວບຄຸມ" />
      <PageHeader
        title="Problem ແລະ RCA"
        description="ສາເຫດຮາກຂອງເຫດທີ່ເກີດຊ້ຳ ແລະ ມາດຕະການປ້ອງກັນ"
        actions={
          <Button onClick={() => toast.info('ຟອມເປີດ Problem ໃໝ່')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            ເປີດ Problem
          </Button>
        }
      />

      <MockNotice endpoint="GET /problems" />

      {rcaPending.length > 0 && (
        <Alert tone="warning" title={`RCA ຄ້າງ ${rcaPending.length} ລາຍການ`}>
          ເອກະສານກຳນົດໃຫ້ສົ່ງ RCA ພາຍໃນ 5 ມື້ເຮັດວຽກຫຼັງເຫດ P1 (SLA 7.2)
          ຖ້າເກີນກຳນົດ ກົດ ES-10 ຈະແຈ້ງເຈົ້າຂອງ Problem ແລະ ຫົວໜ້າໄອທີ
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Problem ທີ່ຍັງເປີດຢູ່" value={formatNumber(open.length)} />
        <StatCard label="RCA ຄ້າງ" value={formatNumber(rcaPending.length)} tone="risk" />
        <StatCard
          label="ສ່ຽງເກີດຊ້ຳ"
          value={formatNumber(repeatRisk.length)}
          tone={repeatRisk.length > 0 ? 'risk' : 'ok'}
          hint="ມີເຫດຜູກຢູ່ 3 ຄັ້ງຂຶ້ນໄປ · ນັບເຂົ້າ KPI-7"
        />
      </div>

      <Card>
        <CardBody className="p-0">
          <DataTable
            columns={columns}
            rows={PROBLEMS}
            rowKey={(p) => p.id}
            caption="ລາຍການ Problem"
            emptyTitle="ຍັງບໍ່ມີ Problem ໃນລະບົບ"
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ສາເຫດຮາກທີ່ບັນທຶກໄວ້</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {PROBLEMS.filter((p) => p.root_cause_note).map((p) => (
            <div key={p.id} className="rounded border border-hair px-4 py-3">
              <p className="tabular font-mono text-caption text-ink-3">{p.code}</p>
              <p className="mt-0.5 text-body-sm font-semibold">{p.title}</p>
              <p className="mt-1 text-body-sm text-ink-2">{p.root_cause_note}</p>
            </div>
          ))}
          {PROBLEMS.every((p) => !p.root_cause_note) && (
            <p className="text-body-sm text-ink-3">ຍັງບໍ່ມີ Problem ໃດບັນທຶກສາເຫດຮາກໄວ້</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
