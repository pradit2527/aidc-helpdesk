'use client';

import { Pencil, Plus, Power } from 'lucide-react';
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
import { Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { formatNumber } from '@/lib/format';
import {
  useCompanies,
  useCreateMaster,
  useDepartments,
  useUpdateMaster,
} from '@/lib/queries/master-data';
import type { Department } from '@/lib/types';

/** จัดการแผนก (FR-27) */
export default function DepartmentsPage(): React.JSX.Element {
  const [company, setCompany] = React.useState('');
  const departments = useDepartments();
  const companies = useCompanies();

  const create = useCreateMaster('/departments');
  const update = useUpdateMaster('/departments');

  const [editing, setEditing] = React.useState<Department | null>(null);
  const [creating, setCreating] = React.useState(false);

  // กรองฝั่งหน้าจอได้เพราะรายการแผนกทั้งกลุ่มมีไม่ถึงร้อยรายการ
  // ถ้าโตกว่านี้ต้องย้ายไปเป็นพารามิเตอร์ของ API แทน
  const rows = (departments.data ?? []).filter(
    (d) => !company || String(d.company.id) === company,
  );

  const companyOptions = (companies.data ?? []).map((c) => ({
    value: String(c.id),
    label: c.code,
  }));

  const fields: FieldSpec[] = [
    {
      kind: 'select',
      name: 'company_id',
      label: 'ບໍລິສັດ',
      required: true,
      options: companyOptions,
      // แผนกย้ายบริษัทไม่ได้ — ผู้ใช้ที่สังกัดอยู่จะข้ามขอบเขตไปด้วยทั้งกลุ่ม
      lockedOnEdit: true,
    },
    { kind: 'text', name: 'name', label: 'ຊື່ພະແນກ', required: true },
    { kind: 'checkbox', name: 'is_active', label: 'ເປີດໃຊ້ງານ' },
  ];

  const initial: Record<string, FieldValue> = editing
    ? {
        company_id: String(editing.company.id),
        name: editing.name,
        is_active: editing.is_active,
      }
    : {
        company_id: company || String(companyOptions[0]?.value ?? ''),
        name: '',
        is_active: true,
      };

  const handleSubmit = async (values: Record<string, FieldValue>): Promise<void> => {
    if (editing) {
      await update.mutateAsync({
        id: editing.id,
        name: String(values.name ?? ''),
        is_active: values.is_active === true,
      });
      toast.success(`ບັນທຶກ ${values.name} ແລ້ວ`);
      return;
    }
    await create.mutateAsync({
      company_id: Number(values.company_id),
      name: String(values.name ?? ''),
      is_active: values.is_active === true,
    });
    toast.success(`ເພີ່ມພະແນກ ${values.name} ແລ້ວ`);
  };

  /**
   * สลับเปิด/ปิดจากปุ่มในตาราง
   *
   * กันการปิดแผนกที่ยังมีคนสังกัดอยู่ — ไม่ใช่ข้อจำกัดของฐานข้อมูล แต่เป็น
   * เรื่องที่ผู้ใช้ในแผนกนั้นจะเจอผลทันทีโดยไม่รู้ตัว จึงบังคับให้ย้ายคนออกก่อน
   */
  const toggleActive = async (d: Department): Promise<void> => {
    if (d.is_active && d.user_count > 0) {
      toast.error(`ພະແນກ ${d.name} ຍັງມີຜູ້ໃຊ້ ${d.user_count} ຄົນ ປິດການໃຊ້ງານກ່ອນບໍ່ໄດ້`);
      return;
    }
    try {
      await update.mutateAsync({ id: d.id, is_active: !d.is_active });
      toast.success(d.is_active ? `ປິດການໃຊ້ງານ ${d.name} ແລ້ວ` : `ເປີດການໃຊ້ງານ ${d.name} ແລ້ວ`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ບັນທຶກບໍ່ສຳເລັດ');
    }
  };

  const columns: Column<Department>[] = [
    {
      key: 'name',
      header: 'ຊື່ພະແນກ',
      render: (d) => <span className="text-body-sm font-semibold">{d.name}</span>,
    },
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
          <span className="rounded-full bg-sla-ok-bg px-2 py-0.5 text-caption text-sla-ok">
            ໃຊ້ງານ
          </span>
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
          <Button variant="ghost" size="sm" onClick={() => setEditing(d)}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">ແກ້ໄຂ {d.name}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void toggleActive(d)}>
            <Power className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">
              {d.is_active ? 'ປິດການໃຊ້ງານ' : 'ເປີດການໃຊ້ງານ'} {d.name}
            </span>
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
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            ເພີ່ມພະແນກ
          </Button>
        }
      />

      <Card>
        <CardBody className="border-b border-hair">
          <Select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            aria-label="ກັ່ນຕອງຕາມບໍລິສັດ"
            className="sm:max-w-xs"
          >
            <option value="">ທຸກບໍລິສັດໃນຂອບເຂດ</option>
            {(companies.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </Select>
        </CardBody>
        <QueryBoundary query={departments}>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(d) => d.id}
            caption="ລາຍການພະແນກ"
            emptyTitle="ຍັງບໍ່ມີພະແນກໃນບໍລິສັດນີ້"
          />
        </QueryBoundary>
      </Card>

      <RecordFormDialog
        open={creating || editing !== null}
        title={editing ? `ແກ້ໄຂ ${editing.name}` : 'ເພີ່ມພະແນກໃໝ່'}
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
