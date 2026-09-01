'use client';

import { Pencil, Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { MockNotice, PageHeader } from '@/components/ui/misc';
import { formatNumber } from '@/lib/format';
import { COMPANIES } from '@/mocks/data';
import type { Company } from '@/lib/types';

/** จัดการบริษัท — 7 บริษัทในกลุ่ม + โลโก้หัวรายงาน */
export default function CompaniesPage(): React.JSX.Element {
  const columns: Column<Company>[] = [
    {
      key: 'code',
      header: 'ບໍລິສັດ',
      render: (c) => (
        <span>
          <span className="block text-body-sm font-semibold">{c.name_th ?? c.code}</span>
          <span className="block font-mono text-caption text-ink-3">{c.code}</span>
        </span>
      ),
    },
    { key: 'name_en', header: 'ຊື່ພາສາອັງກິດ', hideBelow: 'md', render: (c) => c.name_en ?? '—' },
    {
      key: 'email',
      header: 'ອີເມວຕິດຕໍ່',
      hideBelow: 'lg',
      render: (c) => <span className="text-caption">{c.contact_email ?? '—'}</span>,
    },
    {
      key: 'users',
      header: 'ຜູ້ໃຊ້',
      align: 'right',
      render: (c) => <span className="tabular">{formatNumber(c.user_count)}</span>,
    },
    {
      key: 'open',
      header: 'ເລື່ອງທີ່ເປີດຢູ່',
      align: 'right',
      render: (c) => <span className="tabular">{formatNumber(c.open_ticket_count)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <Button variant="ghost" size="sm" onClick={() => toast.info(`ແກ້ໄຂ ${c.code}`)}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">ແກ້ໄຂ {c.code}</span>
        </Button>
      ),
    },
  ];

  const totals = COMPANIES.reduce(
    (acc, c) => ({ users: acc.users + c.user_count, open: acc.open + c.open_ticket_count }),
    { users: 0, open: 0 },
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ຈັດການບໍລິສັດ"
        description="ຂໍ້ມູນບໍລິສັດໃນກຸ່ມ ແລະ ໂລໂກ້ທີ່ໃຊ້ເທິງຫົວລາຍງານ"
        actions={
          <Button onClick={() => toast.info('ຟອມເພີ່ມບໍລິສັດ')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            ເພີ່ມບໍລິສັດ
          </Button>
        }
      />

      <MockNotice endpoint="GET /companies" />

      <Card>
        <CardBody className="p-0">
          <DataTable
            columns={columns}
            rows={COMPANIES}
            rowKey={(c) => c.id}
            caption="ລາຍການບໍລິສັດໃນກຸ່ມ"
          />
        </CardBody>
      </Card>

      <p className="tabular text-caption text-ink-3">
        ລວມ {COMPANIES.length} ບໍລິສັດ · ຜູ້ໃຊ້ {formatNumber(totals.users)} ຄົນ ·
        ເລື່ອງທີ່ເປີດຢູ່ {formatNumber(totals.open)} ລາຍການ
      </p>
    </div>
  );
}
