'use client';

import Link from 'next/link';
import { ClipboardCheck, Pencil, Plus, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Alert, BackLink, MockNotice, PageHeader } from '@/components/ui/misc';
import { CLOCK_START_EVENT } from '@/config/admin';
import { formatMinutes } from '@/lib/format';
import { CATALOG_ITEMS } from '@/mocks/admin-data';
import type { CatalogItem } from '@/lib/types';

/**
 * แค็ตตาล็อกคำขอบริการ
 *
 * เป้าหมายเวลาของรายการในแค็ตตาล็อกเป็นคนละชุดกับตาราง SLA มาตรฐาน (SLA 5.3)
 * คำขอบริการไม่ได้วัด resolution ด้วย 2,700 นาทีของ P4 แต่วัดรายรายการ
 * เช่นรีเซ็ตรหัสผ่าน 30 นาทีทำการ ส่วน response_due_at ยังใช้ตารางมาตรฐานเสมอ
 */
export default function CatalogPage(): React.JSX.Element {
  const needApproval = CATALOG_ITEMS.filter((i) => i.requires_approval);

  const columns: Column<CatalogItem>[] = [
    {
      key: 'name',
      header: 'ລາຍການບໍລິການ',
      render: (i) => (
        <span>
          <span className="block text-body-sm font-semibold">{i.name_th}</span>
          <span className="block font-mono text-caption text-ink-3">{i.code}</span>
        </span>
      ),
    },
    {
      key: 'category',
      header: 'ໝວດໝູ່',
      hideBelow: 'md',
      render: (i) => <span className="text-body-sm">{i.category?.name_th ?? '—'}</span>,
    },
    {
      key: 'target',
      header: 'ເປົ້າໝາຍເວລາ',
      align: 'right',
      render: (i) =>
        i.target_minutes === null ? (
          <span className="text-caption text-ink-3">—</span>
        ) : (
          <span className="tabular text-body-sm font-semibold">
            {formatMinutes(i.target_minutes)}
          </span>
        ),
    },
    {
      key: 'clock',
      header: 'ເລີ່ມນັບເມື່ອ',
      render: (i) => (
        <span className="text-caption text-ink-2">
          {CLOCK_START_EVENT[i.clock_start_event] ?? i.clock_start_event}
        </span>
      ),
    },
    {
      key: 'approval',
      header: 'ການອະນຸມັດ',
      render: (i) =>
        i.requires_approval ? (
          <span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-subtle px-2 py-0.5 text-caption font-semibold text-primary">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              ຕ້ອງອະນຸມັດ
            </span>
            <span className="mt-0.5 block font-mono text-caption text-ink-3">
              {i.approval_chain}
            </span>
          </span>
        ) : (
          <span className="text-caption text-ink-3">ບໍ່ຕ້ອງ</span>
        ),
    },
    {
      key: 'checklist',
      header: 'ລາຍການກວດ',
      hideBelow: 'lg',
      render: (i) =>
        i.checklist_template ? (
          <Link
            href="/admin/checklists"
            className="inline-flex items-center gap-1 text-caption text-primary hover:underline"
          >
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {i.checklist_template.name_th}
          </Link>
        ) : (
          <span className="text-caption text-ink-3">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (i) => (
        <Button variant="ghost" size="sm" onClick={() => toast.info(`ແກ້ໄຂ ${i.name_th}`)}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">ແກ້ໄຂ {i.name_th}</span>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/admin" label="ກັບໄປສູນຄວບຄຸມ" />
      <PageHeader
        title="ແຄັດຕາລັອກບໍລິການ"
        description="ຄຳຂໍບໍລິການທີ່ຜູ້ໃຊ້ເລືອກໄດ້ ພ້ອມເປົ້າໝາຍເວລາລາຍລາຍການ"
        actions={
          <Button onClick={() => toast.info('ຟອມເພີ່ມລາຍການບໍລິການ')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            ເພີ່ມລາຍການ
          </Button>
        }
      />

      <MockNotice endpoint="GET /catalog/items" />

      <Alert tone="info" title="ຄຳຂໍບໍລິການບໍ່ໃຊ້ຕາຕະລາງ SLA ມາດຕະຖານວັດການແກ້ໄຂ">
        ວັດດ້ວຍເປົ້າໝາຍລາຍລາຍການໃນຕາຕະລາງນີ້ແທນ (SLA 5.3) ແຕ່ເວລາຕອບຮັບ
        ຍັງໃຊ້ຕາຕະລາງມາດຕະຖານສະເໝີ — ຄໍລຳ “ເລີ່ມນັບເມື່ອ” ສຳຄັນເທົ່າກັບຕົວເລກເປົ້າໝາຍ
        ເພາະ {needApproval.length} ລາຍການເລີ່ມນັບຫຼັງອະນຸມັດຄົບ ເວລາທີ່ຫົວໜ້າດອງໄວ້ຈຶ່ງບໍ່ນັບເປັນຄວາມຊັກຊ້າຂອງໄອທີ
      </Alert>

      <Card>
        <CardBody className="p-0">
          <DataTable
            columns={columns}
            rows={CATALOG_ITEMS}
            rowKey={(i) => i.id}
            caption="ລາຍການໃນແຄັດຕາລັອກບໍລິການ"
          />
        </CardBody>
      </Card>
    </div>
  );
}
