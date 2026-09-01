'use client';

import { Ban, CheckCircle2, Pencil, Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Alert, BackLink, MockNotice, PageHeader } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { APPROVED_SOFTWARE } from '@/mocks/admin-data';
import type { ApprovedSoftware } from '@/lib/types';

/**
 * บัญชีซอฟต์แวร์ที่อนุมัติ
 *
 * ตารางนี้เก็บทั้งของที่ "ติดตั้งได้" และของที่ "ห้ามติดตั้ง" ในที่เดียวกัน
 * แถวที่ปิดใช้งานไม่ใช่ของเก่าที่เลิกใช้ แต่คือรายการต้องห้าม
 * ซึ่งมีค่าพอ ๆ กับรายการที่อนุญาต — เจ้าหน้าที่ต้องตอบได้ทันทีว่าลงได้ไหม
 */
export default function SoftwarePage(): React.JSX.Element {
  const allowed = APPROVED_SOFTWARE.filter((s) => s.is_active);
  const blocked = APPROVED_SOFTWARE.filter((s) => !s.is_active);

  const columns: Column<ApprovedSoftware>[] = [
    {
      key: 'name',
      header: 'ຊອບແວ',
      render: (s) => (
        <span>
          <span className="block text-body-sm font-semibold">{s.name}</span>
          {s.version && <span className="block text-caption text-ink-3">ເວີຊັນ {s.version}</span>}
        </span>
      ),
    },
    {
      key: 'license',
      header: 'ປະເພດ License',
      hideBelow: 'md',
      render: (s) => <span className="text-body-sm">{s.license_type ?? '—'}</span>,
    },
    {
      key: 'scope',
      header: 'ຂອບເຂດ',
      render: (s) => (
        <span className="text-caption text-ink-2">{s.company ? s.company.code : 'ທັງກຸ່ມ'}</span>
      ),
    },
    {
      key: 'status',
      header: 'ສະຖານະ',
      render: (s) => (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-semibold',
            s.is_active ? 'bg-sla-ok-bg text-sla-ok' : 'bg-sla-breach-bg text-sla-breach',
          )}
        >
          {s.is_active ? (
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Ban className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {s.is_active ? 'ຕິດຕັ້ງໄດ້' : 'ຫ້າມຕິດຕັ້ງ'}
        </span>
      ),
    },
    {
      key: 'note',
      header: 'ໝາຍເຫດ',
      hideBelow: 'lg',
      render: (s) => <span className="text-caption text-ink-2">{s.note ?? '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => (
        <Button variant="ghost" size="sm" onClick={() => toast.info(`ແກ້ໄຂ ${s.name}`)}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">ແກ້ໄຂ {s.name}</span>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/admin" label="ກັບໄປສູນຄວບຄຸມ" />
      <PageHeader
        title="ຊອບແວທີ່ອະນຸມັດ"
        description={`ຕິດຕັ້ງໄດ້ ${allowed.length} ລາຍການ · ຫ້າມຕິດຕັ້ງ ${blocked.length} ລາຍການ`}
        actions={
          <Button onClick={() => toast.info('ຟອມເພີ່ມຊອບແວ')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            ເພີ່ມຊອບແວ
          </Button>
        }
      />

      <MockNotice endpoint="GET /approved-software" />

      <Alert tone="info" title="ໃຊ້ຄູ່ກັບຄຳຂໍ “ຕິດຕັ້ງຊອບແວ” ໃນແຄັດຕາລັອກ">
        ເມື່ອຜູ້ໃຊ້ຂໍຕິດຕັ້ງຊອບແວທີ່ບໍ່ຢູ່ໃນບັນຊີນີ້ ເຈົ້າໜ້າທີ່ຕ້ອງສົ່ງເລື່ອງໃຫ້ພິຈາລະນາເພີ່ມເຂົ້າບັນຊີກ່ອນ
        ບໍ່ແມ່ນຕິດຕັ້ງໃຫ້ເລີຍ
      </Alert>

      <Card>
        <CardBody className="p-0">
          <DataTable
            columns={columns}
            rows={APPROVED_SOFTWARE}
            rowKey={(s) => s.id}
            caption="ບັນຊີຊອບແວທີ່ອະນຸມັດ"
          />
        </CardBody>
      </Card>
    </div>
  );
}
