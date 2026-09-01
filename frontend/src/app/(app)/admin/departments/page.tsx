'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Select } from '@/components/ui/field';
import { Alert, MockNotice, PageHeader } from '@/components/ui/misc';
import { formatNumber } from '@/lib/format';
import { COMPANIES, DEPARTMENTS } from '@/mocks/data';
import type { Department } from '@/lib/types';

/** จัดการแผนก (FR-27) */
export default function DepartmentsPage(): React.JSX.Element {
  const [company, setCompany] = React.useState('');
  const rows = DEPARTMENTS.filter((d) => !company || String(d.company.id) === company);

  const columns: Column<Department>[] = [
    { key: 'name', header: 'ຊື່ພະແນກ', render: (d) => <span className="text-body-sm font-semibold">{d.name}</span> },
    { key: 'company', header: 'ບໍລິສັດ', render: (d) => d.company.code },
    {
      key: 'users',
      header: 'ຈຳນວນຜູ້ໃຊ້',
      align: 'right',
      render: (d) => <span className="tabular">{formatNumber(d.user_count)}</span>,
    },
    {
      key: 'status',
      header: 'ສະຖານະ',
      render: (d) =>
        d.is_active ? (
          <span className="rounded-full bg-sla-ok-bg px-2 py-0.5 text-caption text-sla-ok">ໃຊ້ງານ</span>
        ) : (
          <span className="rounded-full bg-subtle px-2 py-0.5 text-caption text-ink-3">ປິດ</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (d) => (
        <span className="inline-flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => toast.info(`ແກ້ໄຂ ${d.name}`)}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">ແກ້ໄຂ {d.name}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              d.user_count > 0
                ? toast.error(`ພະແນກ ${d.name} ຍັງມີຜູ້ໃຊ້ ${d.user_count} ຄົນ ປິດການໃຊ້ງານກ່ອນບໍ່ໄດ້`)
                : toast.success(`ປິດການໃຊ້ງານ ${d.name} ແລ້ວ`)
            }
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">ປິດການໃຊ້ງານ {d.name}</span>
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ຈັດການພະແນກ"
        description="ພະແນກໃຊ້ຈັດກຸ່ມເລື່ອງແຈ້ງ ແລະ ກຳນົດຜູ້ອະນຸມັດຕາມສາຍງານ"
        actions={
          <Button onClick={() => toast.info('ຟອມສ້າງພະແນກໃໝ່')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            ເພີ່ມພະແນກ
          </Button>
        }
      />

      <MockNotice endpoint="GET /departments" />

      <Alert tone="warning" title="ໂຄງສ້າງພະແນກຈິງຂອງ 7 ບໍລິສັດຍັງບໍ່ໄດ້ຮັບ">
        ຂໍ້ມູນທີ່ເຫັນເປັນຊຸດຕົວຢ່າງ ຕ້ອງປ່ຽນເປັນໂຄງສ້າງຈິງກ່ອນເປີດໃຊ້ງານ
      </Alert>

      <Card>
        <CardBody className="border-b border-hair">
          <Select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            aria-label="ກັ່ນຕອງຕາມບໍລິສັດ"
            className="sm:max-w-xs"
          >
            <option value="">ທຸກບໍລິສັດໃນຂອບເຂດ</option>
            {COMPANIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </Select>
        </CardBody>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(d) => d.id}
          caption="ລາຍການພະແນກ"
          emptyTitle="ຍັງບໍ່ມີພະແນກໃນບໍລິສັດນີ້"
        />
      </Card>
    </div>
  );
}
