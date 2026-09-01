'use client';

import { notFound } from 'next/navigation';
import { KeyRound, Lock, ShieldCheck, UserX } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { ROLE_LABEL } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Alert, Avatar, BackLink, DefRow, MockNotice, PageHeader } from '@/components/ui/misc';
import { formatDateTime } from '@/lib/format';
import { useHasRole } from '@/lib/session';
import { COMPANIES, DEPARTMENTS, USERS } from '@/mocks/data';
import type { RoleCode } from '@/lib/types';

const ASSIGNABLE_ROLES: RoleCode[] = ['end_user', 'agent', 'company_admin', 'manager_viewer'];

/**
 * รายละเอียดผู้ใช้ + มอบบทบาท + ขอบเขตบริษัท
 *
 * company_admin มอบบทบาท super_admin ไม่ได้ ตัวเลือกจึงไม่ปรากฏให้เลย
 * มิฉะนั้นจะกลายเป็นทางยกระดับสิทธิ์ตัวเอง — สร้างบัญชีใหม่แล้วตั้งเป็น super_admin
 */
export default function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.JSX.Element {
  const { id } = React.use(params);
  const target = USERS.find((u) => u.id === Number(id));
  if (!target) notFound();

  const isSuperAdmin = useHasRole('super_admin');
  const roleOptions = isSuperAdmin ? [...ASSIGNABLE_ROLES, 'super_admin' as const] : ASSIGNABLE_ROLES;

  const [roles, setRoles] = React.useState<RoleCode[]>(target.roles);
  const [scoped, setScoped] = React.useState<number[]>(target.scoped_companies.map((c) => c.id));

  const departments = DEPARTMENTS.filter((d) => d.company.id === target.company.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <BackLink href="/admin/users" label="ກັບໄປລາຍຊື່ຜູ້ໃຊ້" />
      <PageHeader title={target.full_name} description={target.username} />

      <MockNotice endpoint={`GET /users/${id}`} />

      {target.is_locked && (
        <Alert
          tone="danger"
          title="ບັນຊີນີ້ຖືກລັອກຢູ່"
          action={
            <Button size="sm" onClick={() => toast.success('ປົດລັອກບັນຊີແລ້ວ')}>
              <Lock className="h-4 w-4" aria-hidden="true" />
              ປົດລັອກບັນຊີ
            </Button>
          }
        >
          ນະໂຍບາຍ 3.2 ບັງຄັບໃຫ້ຢືນຢັນຕົວຕົນກັບ Service Desk ກ່ອນປົດລັອກທຸກຄັ້ງ
        </Alert>
      )}

      <Card>
        <CardBody>
          <div className="flex items-center gap-4">
            <Avatar name={target.full_name} size="lg" />
            <div className="min-w-0">
              <p className="text-h3">{target.full_name}</p>
              <p className="text-body-sm text-ink-2">{target.job_title ?? '—'}</p>
            </div>
          </div>
          <dl className="mt-4 divide-y divide-hair">
            <DefRow label="ອີເມວ">{target.email ?? '—'}</DefRow>
            <DefRow label="ເບີໂທ">{target.phone ?? '—'}</DefRow>
            <DefRow label="ລະຫັດພະນັກງານ">{target.employee_code ?? '—'}</DefRow>
            <DefRow label="ເຂົ້າລະບົບຫຼ້າສຸດ">
              {target.last_login_at ? formatDateTime(target.last_login_at) : 'ຍັງບໍ່ເຄີຍເຂົ້າ'}
            </DefRow>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ຂໍ້ມູນພື້ນຖານ</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field label="ຊື່ ແລະ ນາມສະກຸນ" htmlFor="full_name">
            <Input defaultValue={target.full_name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ບໍລິສັດ" htmlFor="company">
              <Select defaultValue={target.company.id}>
                {COMPANIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ພະແນກ" htmlFor="department">
              <Select defaultValue={target.department?.id ?? ''}>
                <option value="">— ບໍ່ລະບຸ —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardBody>
        <CardFooter className="justify-end">
          <Button onClick={() => toast.success('ບັນທຶກຂໍ້ມູນຜູ້ໃຊ້ແລ້ວ')}>ບັນທຶກ</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ບົດບາດ</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          <p className="text-body-sm text-ink-2">
            ທຸກຄົນມີບົດບາດ “ຜູ້ແຈ້ງ” ເປັນພື້ນຖານສະເໝີ ບົດບາດອື່ນເພີ່ມທັບລົງໄປ
            ສິດທີ່ໄດ້ຄືຜົນລວມຂອງທຸກບົດບາດ
          </p>
          {roleOptions.map((code) => (
            <label
              key={code}
              className="flex min-h-tap cursor-pointer items-center gap-3 rounded border border-hair px-3 hover:bg-subtle"
            >
              <input
                type="checkbox"
                checked={roles.includes(code)}
                disabled={code === 'end_user'}
                onChange={(e) =>
                  setRoles((prev) =>
                    e.target.checked ? [...prev, code] : prev.filter((r) => r !== code),
                  )
                }
                className="h-4 w-4 rounded border-control"
              />
              <span className="text-body-sm">{ROLE_LABEL[code]}</span>
              {code === 'end_user' && (
                <span className="ml-auto text-caption text-ink-3">ຖອນອອກບໍ່ໄດ້</span>
              )}
            </label>
          ))}

          {!isSuperAdmin && (
            <p className="pt-1 text-caption text-ink-3">
              ບົດບາດ “ຜູ້ດູແລລະບົບ” ມອບໄດ້ໂດຍຜູ້ດູແລລະບົບເທົ່ານັ້ນ
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ຂອບເຂດບໍລິສັດທີ່ເບິ່ງເຫັນໄດ້</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          <p className="text-body-sm text-ink-2">
            ໃຊ້ກັບເຈົ້າໜ້າທີ່ສ່ວນກາງທີ່ດູແລຫຼາຍບໍລິສັດ ຖ້າບໍ່ກຳນົດ
            ລະບົບຈະໃຊ້ບໍລິສັດຕົ້ນສັງກັດຂອງຜູ້ໃຊ້
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {COMPANIES.map((c) => (
              <label
                key={c.id}
                className="flex min-h-tap cursor-pointer items-center gap-3 rounded border border-hair px-3 hover:bg-subtle"
              >
                <input
                  type="checkbox"
                  checked={scoped.includes(c.id)}
                  onChange={(e) =>
                    setScoped((prev) =>
                      e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id),
                    )
                  }
                  className="h-4 w-4 rounded border-control"
                />
                <span className="text-body-sm">{c.code}</span>
              </label>
            ))}
          </div>
        </CardBody>
        <CardFooter className="justify-end">
          <Button onClick={() => toast.success('ບັນທຶກບົດບາດ ແລະ ຂອບເຂດແລ້ວ')}>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            ບັນທຶກສິດ
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ການດຳເນີນການອື່ນ</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => toast.success('ຣີເຊັດລະຫັດຜ່ານແລ້ວ')}>
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            ຣີເຊັດລະຫັດຜ່ານ
          </Button>
          <Button variant="danger" onClick={() => toast.success('ປິດການໃຊ້ງານບັນຊີແລ້ວ')}>
            <UserX className="h-4 w-4" aria-hidden="true" />
            ປິດການໃຊ້ງານບັນຊີ
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
