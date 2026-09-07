'use client';

import * as React from 'react';

import { Card, CardBody } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { formatNumber } from '@/lib/format';
import { useCompanies } from '@/lib/queries/master-data';
import type { Company } from '@/lib/types';

/** จัดการบริษัท — 7 บริษัทในกลุ่ม */
export default function CompaniesPage(): React.JSX.Element {
  const query = useCompanies();
  const rows = query.data ?? [];

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
  ];

  const totals = rows.reduce(
    (acc, c) => ({ users: acc.users + c.user_count, open: acc.open + c.open_ticket_count }),
    { users: 0, open: 0 },
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ຈັດການບໍລິສັດ"
        description="ຂໍ້ມູນບໍລິສັດໃນກຸ່ມ ແລະ ຈຳນວນຜູ້ໃຊ້ຂອງແຕ່ລະບໍລິສັດ"
      />

      <Card>
        <CardBody className="p-0">
          <QueryBoundary query={query}>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(c) => c.id}
              caption="ລາຍການບໍລິສັດໃນກຸ່ມ"
            />
          </QueryBoundary>
        </CardBody>
      </Card>

      {query.isSuccess && (
        <p className="tabular text-caption text-ink-3">
          ລວມ {rows.length} ບໍລິສັດ · ຜູ້ໃຊ້ {formatNumber(totals.users)} ຄົນ · ເລື່ອງທີ່ເປີດຢູ່{' '}
          {formatNumber(totals.open)} ລາຍການ
        </p>
      )}
    </div>
  );
}
