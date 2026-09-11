'use client';

import { notFound } from 'next/navigation';
import { KeyRound, Lock, ShieldCheck, UserX } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { ROLE_LABEL_KEY } from '@/components/layout/app-shell';
import { useT } from '@/components/layout/preference-controls';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Alert, Avatar, BackLink, DefRow, PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { formatDateTime } from '@/lib/format';
import { useCan, useHasRole } from '@/lib/session';
import { ApiError } from '@/lib/api';
import { useCompanies, useDepartments } from '@/lib/queries/master-data';
import { useUpdateUser, useUser } from '@/lib/queries/operations';
import type { AdminUser } from '@/lib/types';
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
  const query = useUser(Number(id));

  // ผู้ใช้นอกขอบเขตได้ 404 จากเซิร์ฟเวอร์ ไม่ใช่ 403 — ถ้าตอบ 403
  // ผู้เรียกจะไล่เดาเลขเพื่อนับจำนวนพนักงานของบริษัทอื่นได้
  if (query.isError && query.error instanceof ApiError && query.error.status === 404) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/admin/users" label="ກັບໄປລາຍຊື່ຜູ້ໃຊ້" />
      <QueryBoundary query={query}>{query.data && <UserDetailView target={query.data} />}</QueryBoundary>
    </div>
  );
}

function UserDetailView({ target }: { target: AdminUser }): React.JSX.Element {
  const isSuperAdmin = useHasRole('super_admin');
  const t = useT();
  const roleOptions = isSuperAdmin ? [...ASSIGNABLE_ROLES, 'super_admin' as const] : ASSIGNABLE_ROLES;

  const [roles, setRoles] = React.useState<RoleCode[]>(target.roles);
  const [scoped, setScoped] = React.useState<number[]>(target.scoped_companies.map((c) => c.id));

  const companies = useCompanies();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title={target.full_name} description={target.username} />

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

      <BasicInfoCard target={target} />

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
              <span className="text-body-sm">{t(ROLE_LABEL_KEY[code])}</span>
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
            {(companies.data ?? []).map((c) => (
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

/**
 * ชื่อ บริษัท และแผนกของผู้ใช้ — บันทึกผ่าน PATCH /users/{id}
 *
 * ⚠️ แก้ได้เฉพาะผู้ที่มีสิทธิ์ user.assign_role (ผู้ดูแลบริษัท / ผู้ดูแลระบบ)
 *    บริษัทต้นสังกัดตัดสินว่าผู้ใช้เห็นข้อมูลของใคร การย้ายบริษัทจึงเท่ากับการมอบสิทธิ์
 *    คนอื่นเห็นค่าได้แต่แก้ไม่ได้ — การซ่อนไว้เฉย ๆ ทำให้ไม่รู้ว่าข้อมูลนี้อยู่ตรงไหน
 *    ด่านจริงอยู่ที่เซิร์ฟเวอร์ ส่วนนี้แค่ไม่ให้กดสิ่งที่จะโดนปฏิเสธแน่ ๆ
 */
function BasicInfoCard({ target }: { target: AdminUser }): React.JSX.Element {
  const canEdit = useCan('user.assign_role');
  const companies = useCompanies();
  const departmentsQuery = useDepartments();
  const update = useUpdateUser();

  const originalDept = target.department ? String(target.department.id) : '';
  const [fullName, setFullName] = React.useState(target.full_name);
  const [companyId, setCompanyId] = React.useState<number>(target.company.id);
  const [departmentId, setDepartmentId] = React.useState<string>(originalDept);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // หลังบันทึก ข้อมูลจากเซิร์ฟเวอร์เปลี่ยน — ให้ช่องกรอกตามค่าที่บันทึกจริง
  React.useEffect(() => {
    setFullName(target.full_name);
    setCompanyId(target.company.id);
    setDepartmentId(target.department ? String(target.department.id) : '');
  }, [target.full_name, target.company.id, target.department]);

  const allDepartments = departmentsQuery.data ?? [];

  /*
   * แผนกของบริษัทที่ "เลือกอยู่ตอนนี้" ไม่ใช่ของบริษัทเดิมของผู้ใช้
   *
   * เดิมกรองด้วย target.company.id — พอเปลี่ยนบริษัทในช่องเลือก รายการแผนกยังเป็น
   * ของบริษัทเก่า ผู้ดูแลจึงเลือกแผนกข้ามบริษัทได้โดยไม่รู้ตัว
   *
   * ซ่อนแผนกที่ปิดใช้งานแล้ว แต่คงแผนกที่เลือกอยู่ไว้แม้ถูกปิดทีหลัง ไม่งั้นช่องจะ
   * แสดงว่างทั้งที่ผู้ใช้ยังสังกัดแผนกนั้นอยู่จริง
   */
  const departments = allDepartments.filter(
    (d) => d.company.id === companyId && (d.is_active || String(d.id) === departmentId),
  );

  const changeCompany = (next: number): void => {
    setCompanyId(next);
    setErrors({});
    // แผนกที่เลือกไว้เป็นของบริษัทเก่า ถ้าไม่ล้าง เซิร์ฟเวอร์จะปฏิเสธแผนกข้ามบริษัท
    const stillValid = allDepartments.some(
      (d) => String(d.id) === departmentId && d.company.id === next,
    );
    if (!stillValid) setDepartmentId('');
  };

  const dirty =
    fullName.trim() !== target.full_name ||
    companyId !== target.company.id ||
    departmentId !== originalDept;

  const save = async (): Promise<void> => {
    setErrors({});
    try {
      const saved = await update.mutateAsync({
        id: target.id,
        full_name: fullName.trim(),
        company_id: companyId,
        department_id: departmentId === '' ? null : Number(departmentId),
      });
      const deptName = saved.department?.name ?? 'ບໍ່ລະບຸພະແນກ';
      toast.success(`ບັນທຶກແລ້ວ — ${saved.company.code} · ${deptName}`);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.error(err instanceof Error ? err.message : 'ບັນທຶກບໍ່ສຳເລັດ');
    }
  };

  const locked = !canEdit || update.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ຂໍ້ມູນພື້ນຖານ</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        {!canEdit && (
          <p className="text-body-sm text-ink-2">
            ການຍ້າຍບໍລິສັດ ຫຼື ພະແນກ ມີຜົນກັບສິດການເບິ່ງຂໍ້ມູນ
            ຈຶ່ງແກ້ໄດ້ສະເພາະຜູ້ດູແລບໍລິສັດ ແລະ ຜູ້ດູແລລະບົບ
          </p>
        )}
        <Field label="ຊື່ ແລະ ນາມສະກຸນ" htmlFor="full_name" error={errors.full_name}>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={locked} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ບໍລິສັດ" htmlFor="company" error={errors.company_id}>
            <Select
              value={companyId}
              onChange={(e) => changeCompany(Number(e.target.value))}
              disabled={locked}
            >
              {(companies.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="ພະແນກ"
            htmlFor="department"
            error={errors.department_id}
            hint={
              departments.length === 0
                ? 'ບໍລິສັດນີ້ຍັງບໍ່ມີພະແນກ — ສ້າງໄດ້ທີ່ໜ້າ “ຈັດການພະແນກ”'
                : undefined
            }
          >
            <Select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              disabled={locked}
            >
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
      {canEdit && (
        <CardFooter className="justify-end">
          <Button onClick={() => void save()} disabled={!dirty || update.isPending}>
            {update.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
