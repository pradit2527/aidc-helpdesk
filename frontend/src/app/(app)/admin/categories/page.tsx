'use client';

import { Pencil, Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import {
  RecordFormDialog,
  type FieldSpec,
  type FieldValue,
} from '@/components/admin/record-form-dialog';
import { PriorityBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Alert, PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { IMPACT_OPTIONS, URGENCY_OPTIONS, previewPriority } from '@/config/enums';
import {
  useCategories,
  useCompanies,
  useCreateMaster,
  useUpdateMaster,
} from '@/lib/queries/master-data';
import type { TicketCategory } from '@/lib/types';

const IMPACT_LABEL = Object.fromEntries(IMPACT_OPTIONS.map((o) => [o.value, o.label]));
const URGENCY_LABEL = Object.fromEntries(URGENCY_OPTIONS.map((o) => [o.value, o.label]));

/**
 * จัดการหมวดหมู่ปัญหา (FR-25, FR-28)
 *
 * หมวดหมู่ตั้ง "ผลกระทบ" กับ "ความเร่งด่วน" เป็นค่าตั้งต้น ไม่ได้ตั้ง priority ตรง ๆ
 * เพราะ priority เป็นผลลัพธ์ของสองค่านั้นเสมอ ถ้าให้ตั้งเองจะขัดกันได้ทันที
 * เช่นหมวดที่ตั้งไว้ว่า P1 แต่ผลกระทบเป็นรายบุคคล — เมทริกซ์บอกว่าเป็น P3
 *
 * ⚠️ ไม่มีปุ่มลบโดยตั้งใจ — ปิดด้วย "ເປີດໃຊ້ງານ" เท่านั้น
 *    ticket เก่าอ้างถึง category_id อยู่ การลบทำให้ประวัติชี้ไปที่ความว่างเปล่า
 */
export default function CategoriesPage(): React.JSX.Element {
  const query = useCategories();
  const companies = useCompanies();
  const categories = query.data ?? [];

  const create = useCreateMaster('/categories');
  const update = useUpdateMaster('/categories');

  const [editing, setEditing] = React.useState<TicketCategory | null>(null);
  const [creating, setCreating] = React.useState(false);
  const open = creating || editing !== null;

  const fields: FieldSpec[] = [
    {
      kind: 'text',
      name: 'code',
      label: 'ລະຫັດ',
      required: true,
      placeholder: 'AI_TOOLS',
      hint: 'A–Z, 0–9 ຫຼື _ ເທົ່ານັ້ນ',
      lockedOnEdit: true,
    },
    { kind: 'text', name: 'name_th', label: 'ຊື່ໝວດໝູ່', required: true },
    {
      kind: 'select',
      name: 'company_id',
      label: 'ຂອບເຂດ',
      options: [
        { value: '', label: 'ໃຊ້ທັງກຸ່ມ' },
        ...(companies.data ?? []).map((c) => ({ value: String(c.id), label: c.code })),
      ],
      hint: 'ໃຊ້ທັງກຸ່ມ = ທຸກບໍລິສັດເຫັນ (ສະເພາະຜູ້ດູແລລະບົບ)',
      lockedOnEdit: true,
    },
    {
      kind: 'select',
      name: 'default_impact',
      label: 'ຜົນກະທົບຕັ້ງຕົ້ນ',
      required: true,
      options: IMPACT_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    },
    {
      kind: 'select',
      name: 'default_urgency',
      label: 'ຄວາມຮີບດ່ວນຕັ້ງຕົ້ນ',
      required: true,
      options: URGENCY_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    },
    {
      kind: 'number',
      name: 'sort_order',
      label: 'ລຳດັບການສະແດງ',
      hint: 'ເລກນ້ອຍຂຶ້ນກ່ອນ',
    },
    { kind: 'checkbox', name: 'is_active', label: 'ເປີດໃຊ້ງານ', hint: 'ປິດແລ້ວຈະບໍ່ຂຶ້ນໃນຟອມແຈ້ງເລື່ອງ' },
  ];

  const initial: Record<string, FieldValue> = editing
    ? {
        code: editing.code,
        name_th: editing.name_th,
        company_id: editing.company ? String(editing.company.id) : '',
        default_impact: editing.default_impact,
        default_urgency: editing.default_urgency,
        sort_order: editing.sort_order ?? 0,
        is_active: editing.is_active,
      }
    : {
        code: '',
        name_th: '',
        company_id: '',
        default_impact: 'individual',
        default_urgency: 'medium',
        sort_order: 0,
        is_active: true,
      };

  const handleSubmit = async (values: Record<string, FieldValue>): Promise<void> => {
    if (editing) {
      await update.mutateAsync({
        id: editing.id,
        name_th: String(values.name_th ?? ''),
        default_impact: String(values.default_impact ?? ''),
        default_urgency: String(values.default_urgency ?? ''),
        sort_order: Number(values.sort_order ?? 0),
        is_active: values.is_active === true,
      });
      toast.success(`ບັນທຶກ ${values.name_th} ແລ້ວ`);
      return;
    }
    await create.mutateAsync({
      code: String(values.code ?? ''),
      name_th: String(values.name_th ?? ''),
      // สตริงว่างจากช่องเลือก = ระดับกลุ่ม ซึ่ง backend รับเป็น null ไม่ใช่ ''
      company_id: values.company_id ? Number(values.company_id) : null,
      default_impact: String(values.default_impact ?? ''),
      default_urgency: String(values.default_urgency ?? ''),
      sort_order: Number(values.sort_order ?? 0),
      is_active: values.is_active === true,
    });
    toast.success(`ເພີ່ມ ${values.name_th} ແລ້ວ`);
  };

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
      key: 'status',
      header: 'ສະຖານະ',
      render: (c) =>
        c.is_active ? (
          <span className="text-caption text-sla-ok">ເປີດໃຊ້</span>
        ) : (
          <span className="text-caption text-ink-3">ປິດແລ້ວ</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
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
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            ເພີ່ມໝວດໝູ່
          </Button>
        }
      />

      <Alert tone="info" title="ບໍ່ມີຊ່ອງ “ລະດັບຄວາມສຳຄັນຕັ້ງຕົ້ນ” ໂດຍຕັ້ງໃຈ">
        ລະບົບຄຳນວນລະດັບຈາກ ຜົນກະທົບ × ຄວາມຮີບດ່ວນ ສະເໝີ (SLA ຂໍ້ 4)
        ຄໍລຳ “ລະດັບທີ່ໄດ້” ຄືຜົນຂອງສອງຄ່າຊ້າຍມື ບໍ່ແມ່ນຄ່າທີ່ຕັ້ງເອງໄດ້
      </Alert>

      <Card>
        <CardBody className="p-0">
          <QueryBoundary query={query}>
            <DataTable
              columns={columns}
              rows={categories}
              rowKey={(c) => c.id}
              caption="ລາຍການໝວດໝູ່ບັນຫາ"
            />
          </QueryBoundary>
        </CardBody>
      </Card>

      <RecordFormDialog
        open={open}
        title={editing ? `ແກ້ໄຂ ${editing.name_th}` : 'ເພີ່ມໝວດໝູ່ໃໝ່'}
        description="ລຶບບໍ່ໄດ້ໂດຍຕັ້ງໃຈ — ໝວດທີ່ເລີກໃຊ້ໃຫ້ປິດ “ເປີດໃຊ້ງານ”"
        fields={fields}
        initial={initial}
        editing={editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
