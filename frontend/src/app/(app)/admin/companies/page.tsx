'use client';

import { Pencil, Plus } from 'lucide-react';
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
import { PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { formatNumber } from '@/lib/format';
import { useCompanies, useCreateMaster, useUpdateMaster } from '@/lib/queries/master-data';
import type { Company } from '@/lib/types';

/**
 * จัดการบริษัท — 7 บริษัทในกลุ่ม
 *
 * ⚠️ เพิ่มบริษัทได้เฉพาะ super_admin — backend ปฏิเสธคนอื่นด้วย 403
 *    ปุ่มยังแสดงให้ทุกคนที่เปิดหน้านี้ได้เห็น เพราะการซ่อนปุ่มแล้วผู้ใช้
 *    ไม่รู้ว่าทำไมหายไป สับสนกว่าการกดแล้วได้ข้อความบอกเหตุผล
 */
export default function CompaniesPage(): React.JSX.Element {
  const query = useCompanies();
  const rows = query.data ?? [];

  const create = useCreateMaster('/companies');
  const update = useUpdateMaster('/companies');

  const [editing, setEditing] = React.useState<Company | null>(null);
  const [creating, setCreating] = React.useState(false);

  const fields: FieldSpec[] = [
    {
      kind: 'text',
      name: 'code',
      label: 'ລະຫັດບໍລິສັດ',
      required: true,
      placeholder: 'AIDC-NEW',
      hint: 'A–Z, 0–9 ຫຼື _ ເທົ່ານັ້ນ',
      lockedOnEdit: true,
    },
    { kind: 'text', name: 'name_th', label: 'ຊື່ບໍລິສັດ', required: true },
    { kind: 'text', name: 'name_en', label: 'ຊື່ພາສາອັງກິດ' },
    { kind: 'text', name: 'contact_email', label: 'ອີເມວຕິດຕໍ່' },
    { kind: 'checkbox', name: 'is_active', label: 'ເປີດໃຊ້ງານ' },
  ];

  const initial: Record<string, FieldValue> = editing
    ? {
        code: editing.code,
        name_th: editing.name_th ?? '',
        name_en: editing.name_en ?? '',
        contact_email: editing.contact_email ?? '',
        is_active: true,
      }
    : { code: '', name_th: '', name_en: '', contact_email: '', is_active: true };

  const handleSubmit = async (values: Record<string, FieldValue>): Promise<void> => {
    const body = {
      name_th: String(values.name_th ?? ''),
      name_en: String(values.name_en ?? ''),
      contact_email: String(values.contact_email ?? ''),
      is_active: values.is_active === true,
    };
    if (editing) {
      await update.mutateAsync({ id: editing.id, ...body });
      toast.success(`ບັນທຶກ ${values.name_th} ແລ້ວ`);
      return;
    }
    await create.mutateAsync({ code: String(values.code ?? ''), ...body });
    toast.success(`ເພີ່ມບໍລິສັດ ${values.name_th} ແລ້ວ`);
  };

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
        <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">ແກ້ໄຂ {c.name_th ?? c.code}</span>
        </Button>
      ),
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
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            ເພີ່ມບໍລິສັດ
          </Button>
        }
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

      <RecordFormDialog
        open={creating || editing !== null}
        title={editing ? `ແກ້ໄຂ ${editing.name_th ?? editing.code}` : 'ເພີ່ມບໍລິສັດໃໝ່'}
        description="ເພີ່ມບໍລິສັດໄດ້ສະເພາະຜູ້ດູແລລະບົບ"
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
