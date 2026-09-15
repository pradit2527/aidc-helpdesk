'use client';

import { CornerDownRight, Pencil, Plus } from 'lucide-react';
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
import { cn } from '@/lib/cn';
import {
  useCategories,
  useCompanies,
  useCreateMaster,
  useUpdateMaster,
} from '@/lib/queries/master-data';
import type { TicketCategory } from '@/lib/types';

const IMPACT_LABEL = Object.fromEntries(IMPACT_OPTIONS.map((o) => [o.value, o.label]));
const URGENCY_LABEL = Object.fromEntries(URGENCY_OPTIONS.map((o) => [o.value, o.label]));
const NO_PARENT = { value: '', label: 'ບໍ່ມີ — ເປັນໝວດຫຼັກ' };

const bySortOrder = (a: TicketCategory, b: TicketCategory): number =>
  a.sort_order - b.sort_order || a.name_th.localeCompare(b.name_th);

/**
 * จัดการหมวดหมู่ปัญหา (FR-25, FR-28)
 *
 * หมวดหมู่เป็นต้นไม้สองชั้น: หมวดหลัก › หมวดย่อย — ฟอร์มแจ้งเรื่องให้เลือกหมวดหลักก่อน
 * แล้วรายการหมวดย่อยเปลี่ยนตาม ตารางนี้จึงเรียงหมวดย่อยไว้ใต้หมวดหลักของมันเสมอ
 * ไม่ใช่เรียงรวมกันตาม sort_order ซึ่งทำให้มองไม่ออกว่าอะไรอยู่ใต้อะไร
 *
 * หมวดหมู่ตั้ง "ผลกระทบ" กับ "ความเร่งด่วน" เป็นค่าตั้งต้น ไม่ได้ตั้ง priority ตรง ๆ
 * เพราะ priority เป็นผลลัพธ์ของสองค่านั้นเสมอ ถ้าให้ตั้งเองจะขัดกันได้ทันที
 *
 * ⚠️ ไม่มีปุ่มลบโดยตั้งใจ — ปิดด้วย "ເປີດໃຊ້ງານ" เท่านั้น
 *    ticket เก่าอ้างถึง category_id อยู่ การลบทำให้ประวัติชี้ไปที่ความว่างเปล่า
 */
export default function CategoriesPage(): React.JSX.Element {
  const query = useCategories();
  const companies = useCompanies();
  const categories = React.useMemo(() => query.data ?? [], [query.data]);

  const create = useCreateMaster('/categories');
  const update = useUpdateMaster('/categories');

  const [editing, setEditing] = React.useState<TicketCategory | null>(null);
  const [creating, setCreating] = React.useState(false);
  /** กดเพิ่มหมวดย่อยจากแถวของหมวดหลัก — เติมหมวดหลักและค่าตั้งต้นของมันให้ */
  const [creatingUnder, setCreatingUnder] = React.useState<TicketCategory | null>(null);
  const open = creating || editing !== null;

  const { rows, byId, childrenOf } = React.useMemo(() => {
    const ids = new Map(categories.map((c) => [c.id, c]));
    const children = new Map<number, TicketCategory[]>();
    for (const c of categories) {
      if (c.parent_id === null || !ids.has(c.parent_id)) continue;
      children.set(c.parent_id, [...(children.get(c.parent_id) ?? []), c]);
    }
    const ordered: TicketCategory[] = [];
    // หมวดที่หมวดหลักอยู่นอกขอบเขตที่มองเห็น แสดงเป็นแถวบนสุดแทนการหายไปจากตาราง
    const tops = categories.filter((c) => c.parent_id === null || !ids.has(c.parent_id)).sort(bySortOrder);
    for (const top of tops) {
      ordered.push(top);
      ordered.push(...[...(children.get(top.id) ?? [])].sort(bySortOrder));
    }
    return { rows: ordered, byId: ids, childrenOf: children };
  }, [categories]);

  const editingHasChildren = editing ? (childrenOf.get(editing.id)?.length ?? 0) > 0 : false;
  const parentOptions = categories
    .filter((c) => c.parent_id === null && c.id !== editing?.id)
    .sort(bySortOrder)
    .map((c) => ({
      value: String(c.id),
      label: `${c.name_th} (${c.code})${c.is_active ? '' : ' · ປິດແລ້ວ'}`,
    }));

  const fields: FieldSpec[] = [
    {
      kind: 'text',
      name: 'code',
      label: 'ລະຫັດ',
      required: true,
      placeholder: creatingUnder ? `${creatingUnder.code}_...` : 'AI_TOOLS',
      hint: 'A–Z, 0–9 ຫຼື _ ເທົ່ານັ້ນ · ແກ້ບໍ່ໄດ້ຫຼັງສ້າງ',
      lockedOnEdit: true,
    },
    { kind: 'text', name: 'name_th', label: 'ຊື່ໝວດໝູ່', required: true },
    {
      kind: 'select',
      name: 'parent_id',
      label: 'ໝວດຫຼັກ',
      // หมวดที่มีหมวดย่อยอยู่แล้วย้ายไปเป็นหมวดย่อยไม่ได้ — ต้นไม้มีสองชั้น
      options: editingHasChildren ? [NO_PARENT] : [NO_PARENT, ...parentOptions],
      hint: editingHasChildren
        ? 'ໝວດນີ້ມີໝວດຍ່ອຍຢູ່ ຈຶ່ງຍ້າຍໄປເປັນໝວດຍ່ອຍບໍ່ໄດ້'
        : 'ເລືອກໝວດຫຼັກ ຖ້າໝວດນີ້ເປັນໝວດຍ່ອຍ · ຊ້ອນໄດ້ 2 ຊັ້ນເທົ່ານັ້ນ',
    },
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
      hint: 'ເລກນ້ອຍຂຶ້ນກ່ອນ · ໝວດຍ່ອຍລຽງພາຍໃນໝວດຫຼັກຂອງມັນ',
    },
    { kind: 'checkbox', name: 'is_active', label: 'ເປີດໃຊ້ງານ', hint: 'ປິດແລ້ວຈະບໍ່ຂຶ້ນໃນຟອມແຈ້ງເລື່ອງ' },
  ];

  const initial: Record<string, FieldValue> = editing
    ? {
        code: editing.code,
        name_th: editing.name_th,
        parent_id: editing.parent_id !== null ? String(editing.parent_id) : '',
        company_id: editing.company ? String(editing.company.id) : '',
        default_impact: editing.default_impact,
        default_urgency: editing.default_urgency,
        sort_order: editing.sort_order ?? 0,
        is_active: editing.is_active,
      }
    : {
        code: creatingUnder ? `${creatingUnder.code}_` : '',
        name_th: '',
        parent_id: creatingUnder ? String(creatingUnder.id) : '',
        company_id: creatingUnder?.company ? String(creatingUnder.company.id) : '',
        default_impact: creatingUnder?.default_impact ?? 'individual',
        default_urgency: creatingUnder?.default_urgency ?? 'medium',
        sort_order: creatingUnder ? ((childrenOf.get(creatingUnder.id)?.length ?? 0) + 1) * 10 : 0,
        is_active: true,
      };

  const handleSubmit = async (values: Record<string, FieldValue>): Promise<void> => {
    // สตริงว่างจากช่องเลือก = หมวดหลัก ซึ่ง backend รับเป็น null ไม่ใช่ ''
    const parentId = values.parent_id ? Number(values.parent_id) : null;
    if (editing) {
      await update.mutateAsync({
        id: editing.id,
        name_th: String(values.name_th ?? ''),
        parent_id: parentId,
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
      parent_id: parentId,
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
      render: (c) => {
        const parent = c.parent_id !== null ? byId.get(c.parent_id) : undefined;
        const childCount = childrenOf.get(c.id)?.length ?? 0;
        return (
          <span className={cn('flex items-start gap-2', parent && 'pl-5 sm:pl-7')}>
            {parent && <CornerDownRight className="mt-1 h-4 w-4 flex-none text-ink-3" aria-hidden="true" />}
            <span className="min-w-0">
              {parent && <span className="sr-only">ໝວດຍ່ອຍຂອງ {parent.name_th}: </span>}
              <span className={cn('block text-body-sm', parent ? 'text-ink' : 'font-semibold')}>{c.name_th}</span>
              <span className="block text-caption text-ink-3">
                <span className="font-mono">{c.code}</span>
                {!parent && childCount > 0 && ` · ${childCount} ໝວດຍ່ອຍ`}
              </span>
            </span>
          </span>
        );
      },
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
        <span className="inline-flex items-center justify-end gap-1">
          {c.parent_id === null && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(null);
                setCreatingUnder(c);
                setCreating(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden xl:inline">ໝວດຍ່ອຍ</span>
              <span className="sr-only xl:hidden">ເພີ່ມໝວດຍ່ອຍໃນ {c.name_th}</span>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">ແກ້ໄຂ {c.name_th}</span>
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ໝວດໝູ່ບັນຫາ"
        description="ໝວດຫຼັກ › ໝວດຍ່ອຍ ແລະ ຄ່າຕັ້ງຕົ້ນທີ່ລະບົບເຕີມໃຫ້ຕອນຜູ້ໃຊ້ແຈ້ງເລື່ອງ"
        actions={
          <Button
            onClick={() => {
              setCreatingUnder(null);
              setCreating(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            ເພີ່ມໝວດໝູ່
          </Button>
        }
      />

      <Alert tone="info" title="ໝວດຫຼັກທີ່ມີໝວດຍ່ອຍ ຜູ້ແຈ້ງຕ້ອງເລືອກໝວດຍ່ອຍສະເໝີ">
        ຄ່າຕັ້ງຕົ້ນຂອງໝວດຍ່ອຍຖືກໃຊ້ແທນຄ່າຂອງໝວດຫຼັກ · ລະບົບຄຳນວນລະດັບຈາກ ຜົນກະທົບ × ຄວາມຮີບດ່ວນ ສະເໝີ (SLA ຂໍ້ 4)
        ຄໍລຳ “ລະດັບທີ່ໄດ້” ຄືຜົນຂອງສອງຄ່ານັ້ນ ບໍ່ແມ່ນຄ່າທີ່ຕັ້ງເອງໄດ້
      </Alert>

      <Card>
        <CardBody className="p-0">
          <QueryBoundary query={query}>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(c) => c.id}
              caption="ລາຍການໝວດໝູ່ບັນຫາ ລຽງໝວດຍ່ອຍໄວ້ໃຕ້ໝວດຫຼັກ"
            />
          </QueryBoundary>
        </CardBody>
      </Card>

      <RecordFormDialog
        open={open}
        title={
          editing
            ? `ແກ້ໄຂ ${editing.name_th}`
            : creatingUnder
              ? `ເພີ່ມໝວດຍ່ອຍໃນ ${creatingUnder.name_th}`
              : 'ເພີ່ມໝວດໝູ່ໃໝ່'
        }
        description="ລຶບບໍ່ໄດ້ໂດຍຕັ້ງໃຈ — ໝວດທີ່ເລີກໃຊ້ໃຫ້ປິດ “ເປີດໃຊ້ງານ”"
        fields={fields}
        initial={initial}
        editing={editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
          setCreatingUnder(null);
        }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
