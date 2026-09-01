'use client';

import { Pencil, Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PriorityBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Alert, MockNotice, PageHeader } from '@/components/ui/misc';
import { IMPACT_OPTIONS, URGENCY_OPTIONS, previewPriority } from '@/config/enums';
import { TICKET_CATEGORIES } from '@/mocks/data';
import type { TicketCategory } from '@/lib/types';

const IMPACT_LABEL = Object.fromEntries(IMPACT_OPTIONS.map((o) => [o.value, o.label]));
const URGENCY_LABEL = Object.fromEntries(URGENCY_OPTIONS.map((o) => [o.value, o.label]));

/**
 * จัดการหมวดหมู่ปัญหา (FR-25, FR-28)
 *
 * หมวดหมู่ตั้ง "ผลกระทบ" กับ "ความเร่งด่วน" เป็นค่าตั้งต้น ไม่ได้ตั้ง priority ตรง ๆ
 * เพราะ priority เป็นผลลัพธ์ของสองค่านั้นเสมอ ถ้าให้ตั้งเองจะขัดกันได้ทันที
 * เช่นหมวดที่ตั้งไว้ว่า P1 แต่ผลกระทบเป็นรายบุคคล — เมทริกซ์บอกว่าเป็น P3
 */
export default function CategoriesPage(): React.JSX.Element {
  const columns: Column<TicketCategory>[] = [
    {
      key: 'name',
      header: 'ໝວດໝູ່',
      render: (c) => (
        <span>
          <span className="block text-body-sm font-semibold">{c.name_th}</span>
          <span className="block font-mono text-caption text-ink-3">{c.code}</span>
        </span>
      ),
    },
    {
      key: 'impact',
      header: 'ຜົນກະທົບຕັ້ງຕົ້ນ',
      hideBelow: 'md',
      render: (c) => <span className="text-body-sm">{IMPACT_LABEL[c.default_impact]}</span>,
    },
    {
      key: 'urgency',
      header: 'ຄວາມຮີບດ່ວນຕັ້ງຕົ້ນ',
      hideBelow: 'md',
      render: (c) => <span className="text-body-sm">{URGENCY_LABEL[c.default_urgency]}</span>,
    },
    {
      key: 'resulting',
      header: 'ລະດັບທີ່ໄດ້',
      render: (c) => {
        const priority = previewPriority(c.default_impact, c.default_urgency);
        return priority ? <PriorityBadge priority={priority} withMeter={false} /> : '—';
      },
    },
    {
      key: 'assignee',
      header: 'ຜູ້ຮັບຜິດຊອບຕັ້ງຕົ້ນ',
      hideBelow: 'lg',
      render: (c) =>
        c.default_assignee ? (
          <span className="text-body-sm">{c.default_assignee.full_name}</span>
        ) : (
          <span className="text-body-sm text-ink-3">ເຂົ້າຄິວກາງ</span>
        ),
    },
    {
      key: 'scope',
      header: 'ຂອບເຂດ',
      hideBelow: 'lg',
      render: (c) => (
        <span className="text-caption text-ink-2">{c.company ? c.company.code : 'ໃຊ້ທັງກຸ່ມ'}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <Button variant="ghost" size="sm" onClick={() => toast.info(`ແກ້ໄຂ ${c.name_th}`)}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">ແກ້ໄຂ {c.name_th}</span>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ໝວດໝູ່ບັນຫາ"
        description="ໝວດໝູ່ ແລະ ຄ່າຕັ້ງຕົ້ນທີ່ລະບົບເຕີມໃຫ້ຕອນຜູ້ໃຊ້ແຈ້ງເລື່ອງ"
        actions={
          <Button onClick={() => toast.info('ຟອມສ້າງໝວດໝູ່ໃໝ່')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            ເພີ່ມໝວດໝູ່
          </Button>
        }
      />

      <MockNotice endpoint="GET /categories" />

      <Alert tone="info" title="ບໍ່ມີຊ່ອງ “ລະດັບຄວາມສຳຄັນຕັ້ງຕົ້ນ” ໂດຍຕັ້ງໃຈ">
        ລະບົບຄຳນວນລະດັບຈາກ ຜົນກະທົບ × ຄວາມຮີບດ່ວນ ສະເໝີ (SLA ຂໍ້ 4)
        ຄໍລຳ “ລະດັບທີ່ໄດ້” ຄືຜົນຂອງສອງຄ່າຊ້າຍມື ບໍ່ແມ່ນຄ່າທີ່ຕັ້ງເອງໄດ້
      </Alert>

      <Card>
        <CardBody className="p-0">
          <DataTable
            columns={columns}
            rows={TICKET_CATEGORIES}
            rowKey={(c) => c.id}
            caption="ລາຍການໝວດໝູ່ບັນຫາ"
          />
        </CardBody>
      </Card>
    </div>
  );
}
