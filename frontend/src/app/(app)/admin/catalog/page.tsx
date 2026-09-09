'use client';

import Link from 'next/link';
import { ClipboardCheck, Pencil, Plus, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import {
  RecordFormDialog,
  type FieldSpec,
  type FieldValue,
} from '@/components/admin/record-form-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Alert, BackLink, PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { CLOCK_START_EVENT } from '@/config/admin';
import { formatMinutes } from '@/lib/format';
import {
  useCatalogItems,
  useCategories,
  useChecklistTemplates,
  useCompanies,
  useCreateMaster,
  useUpdateMaster,
} from '@/lib/queries/master-data';
import type { CatalogItem } from '@/lib/types';

/**
 * แค็ตตาล็อกคำขอบริการ
 *
 * เป้าหมายเวลาของรายการในแค็ตตาล็อกเป็นคนละชุดกับตาราง SLA มาตรฐาน (SLA 5.3)
 * คำขอบริการไม่ได้วัด resolution ด้วย 2,700 นาทีของ P4 แต่วัดรายรายการ
 * เช่นรีเซ็ตรหัสผ่าน 30 นาทีทำการ ส่วน response_due_at ยังใช้ตารางมาตรฐานเสมอ
 */
export default function CatalogPage(): React.JSX.Element {
  const query = useCatalogItems();
  const companies = useCompanies();
  const categories = useCategories();
  const templates = useChecklistTemplates();
  const items = query.data ?? [];
  const needApproval = items.filter((i) => i.requires_approval);

  const create = useCreateMaster('/catalog-items');
  const update = useUpdateMaster('/catalog-items');

  const [editing, setEditing] = React.useState<CatalogItem | null>(null);
  const [creating, setCreating] = React.useState(false);

  const refOptions = (
    rows: readonly { id: number; name_th: string }[] | undefined,
  ): { value: string; label: string }[] =>
    (rows ?? []).map((r) => ({ value: String(r.id), label: r.name_th }));

  /*
   * target_mode กับ clock_start_event ล็อกไว้หลังสร้าง
   *
   * ทั้งคู่เปลี่ยนความหมายของกำหนดเวลาที่คำนวณไปแล้วของคำขอเก่าทุกใบ
   * การแก้ย้อนหลังทำให้รายงาน SLA ของเดือนที่ปิดไปแล้วเปลี่ยนค่าโดยไม่มีใครสั่ง
   */
  const fields: FieldSpec[] = [
    {
      kind: 'text',
      name: 'code',
      label: 'ລະຫັດ',
      required: true,
      placeholder: 'REQ_PWD_RESET',
      lockedOnEdit: true,
    },
    { kind: 'text', name: 'name_th', label: 'ຊື່ລາຍການ', required: true },
    {
      kind: 'select',
      name: 'category_id',
      label: 'ໝວດໝູ່',
      options: refOptions(categories.data),
    },
    {
      kind: 'select',
      name: 'company_id',
      label: 'ຂອບເຂດ',
      options: [
        { value: '', label: 'ທັງກຸ່ມ' },
        ...(companies.data ?? []).map((c) => ({ value: String(c.id), label: c.code })),
      ],
      lockedOnEdit: true,
    },
    {
      kind: 'select',
      name: 'target_mode',
      label: 'ໂໝດເປົ້າໝາຍເວລາ',
      required: true,
      options: [
        { value: 'duration', label: 'ນັບເປັນໄລຍະເວລາ' },
        { value: 'before_date', label: 'ກ່ອນວັນທີກຳນົດ' },
        { value: 'by_date', label: 'ພາຍໃນວັນທີກຳນົດ' },
      ],
      lockedOnEdit: true,
    },
    {
      kind: 'number',
      name: 'target_minutes',
      label: 'ເວລາເປົ້າໝາຍ (ນາທີເຮັດວຽກ)',
      hint: 'ຈຳເປັນເມື່ອໂໝດເປັນ “ນັບເປັນໄລຍະເວລາ”',
    },
    {
      kind: 'select',
      name: 'clock_start_event',
      label: 'ເລີ່ມນັບເວລາເມື່ອ',
      options: [
        { value: 'on_create', label: 'ຕອນແຈ້ງເລື່ອງ' },
        { value: 'after_identity_verified', label: 'ຫຼັງຢືນຢັນຕົວຕົນ' },
        { value: 'after_approval', label: 'ຫຼັງອະນຸມັດຄົບ' },
        { value: 'after_budget_approval', label: 'ຫຼັງອະນຸມັດງົບ' },
      ],
      lockedOnEdit: true,
    },
    { kind: 'checkbox', name: 'requires_approval', label: 'ຕ້ອງຜ່ານການອະນຸມັດ' },
    {
      kind: 'text',
      name: 'approval_chain',
      label: 'ລຳດັບຜູ້ອະນຸມັດ',
      placeholder: 'line_manager,system_owner',
      hint: 'ຈຳເປັນເມື່ອຕ້ອງຜ່ານການອະນຸມັດ · ຄັ່ນດ້ວຍ ,',
    },
    {
      kind: 'select',
      name: 'checklist_template_id',
      label: 'ແມ່ແບບລາຍການກວດ',
      options: refOptions(templates.data),
    },
    { kind: 'checkbox', name: 'is_active', label: 'ເປີດໃຊ້ງານ' },
  ];

  /*
   * ตอนแก้ไขตัดสามช่องที่แก้ไม่ได้ออกไปเลย แทนที่จะแสดงแบบจาง ๆ
   *
   * โดยเฉพาะ target_mode ที่ API ไม่ได้ส่งกลับมาด้วยซ้ำ การเดาค่ามาแสดง
   * จะบอกผู้ใช้ผิดว่ารายการนี้ตั้งไว้แบบไหน ซึ่งแย่กว่าการไม่บอกเลย
   */
  const editFields = fields.filter(
    (f) => !['code', 'company_id', 'target_mode', 'clock_start_event'].includes(f.name),
  );

  const initial: Record<string, FieldValue> = editing
    ? {
        name_th: editing.name_th,
        category_id: editing.category ? String(editing.category.id) : '',
        target_minutes: editing.target_minutes ?? null,
        requires_approval: editing.requires_approval,
        approval_chain: editing.approval_chain ?? '',
        checklist_template_id: editing.checklist_template
          ? String(editing.checklist_template.id)
          : '',
        is_active: editing.is_active,
      }
    : {
        code: '',
        name_th: '',
        category_id: '',
        company_id: '',
        target_mode: 'duration',
        target_minutes: 30,
        clock_start_event: 'on_create',
        requires_approval: false,
        approval_chain: '',
        checklist_template_id: '',
        is_active: true,
      };

  const numberOrNull = (v: FieldValue | undefined): number | null =>
    v === '' || v === null || v === undefined ? null : Number(v);

  const handleSubmit = async (values: Record<string, FieldValue>): Promise<void> => {
    const shared = {
      name_th: String(values.name_th ?? ''),
      category_id: numberOrNull(values.category_id),
      target_minutes: numberOrNull(values.target_minutes),
      requires_approval: values.requires_approval === true,
      approval_chain: String(values.approval_chain ?? ''),
      checklist_template_id: numberOrNull(values.checklist_template_id),
      is_active: values.is_active === true,
    };
    if (editing) {
      await update.mutateAsync({ id: editing.id, ...shared });
      toast.success(`ບັນທຶກ ${values.name_th} ແລ້ວ`);
      return;
    }
    await create.mutateAsync({
      ...shared,
      code: String(values.code ?? ''),
      company_id: numberOrNull(values.company_id),
      target_mode: String(values.target_mode ?? 'duration'),
      clock_start_event: String(values.clock_start_event ?? 'on_create'),
    });
    toast.success(`ເພີ່ມ ${values.name_th} ແລ້ວ`);
  };

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
        <Button variant="ghost" size="sm" onClick={() => setEditing(i)}>
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
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            ເພີ່ມລາຍການ
          </Button>
        }
      />

      <Alert tone="info" title="ຄຳຂໍບໍລິການບໍ່ໃຊ້ຕາຕະລາງ SLA ມາດຕະຖານວັດການແກ້ໄຂ">
        ວັດດ້ວຍເປົ້າໝາຍລາຍລາຍການໃນຕາຕະລາງນີ້ແທນ (SLA 5.3) ແຕ່ເວລາຕອບຮັບ
        ຍັງໃຊ້ຕາຕະລາງມາດຕະຖານສະເໝີ — ຄໍລຳ “ເລີ່ມນັບເມື່ອ” ສຳຄັນເທົ່າກັບຕົວເລກເປົ້າໝາຍ
        ເພາະ {needApproval.length} ລາຍການເລີ່ມນັບຫຼັງອະນຸມັດຄົບ ເວລາທີ່ຫົວໜ້າດອງໄວ້ຈຶ່ງບໍ່ນັບເປັນຄວາມຊັກຊ້າຂອງໄອທີ
      </Alert>

      <Card>
        <CardBody className="p-0">
          <QueryBoundary query={query}>
            <DataTable
              columns={columns}
              rows={items}
              rowKey={(i) => i.id}
              caption="ລາຍການໃນແຄັດຕາລັອກບໍລິການ"
            />
          </QueryBoundary>
        </CardBody>
      </Card>
      <RecordFormDialog
        open={creating || editing !== null}
        title={editing ? `ແກ້ໄຂ ${editing.name_th}` : 'ເພີ່ມລາຍການບໍລິການ'}
        fields={editing ? editFields : fields}
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
