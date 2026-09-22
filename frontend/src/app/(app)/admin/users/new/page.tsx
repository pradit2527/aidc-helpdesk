'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Eye, EyeOff, RefreshCw, UserPlus, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { ROLE_LABEL_KEY } from '@/components/layout/app-shell';
import { ROLE_ORDER, ROLE_SIDE, SIDE_LABEL_KEY, SIDE_ORDER } from '@/config/roles';
import { useT } from '@/components/layout/preference-controls';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Alert, PageHeader } from '@/components/ui/misc';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useCompanies, useDepartments } from '@/lib/queries/master-data';
import { useCreateUser, type CreateUserInput } from '@/lib/queries/operations';
import { useCan, useSession } from '@/lib/session';
import type { RoleCode } from '@/lib/types';

/** นโยบายรหัสผ่าน 3.2 — ต้องตรงกับที่ backend ตรวจ */
const PASSWORD_RULES: { label: string; test: (password: string) => boolean }[] = [
  { label: 'ຍາວ 12 ຕົວອັກສອນຂຶ້ນໄປ', test: (p) => p.length >= 12 },
  { label: 'ມີຕົວພິມໃຫຍ່ (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'ມີຕົວພິມນ້ອຍ (a-z)', test: (p) => /[a-z]/.test(p) },
  { label: 'ມີຕົວເລກ (0-9)', test: (p) => /[0-9]/.test(p) },
  { label: 'ມີສັນຍາລັກ ເຊັ່ນ ! @ # $', test: (p) => /[^A-Za-z0-9]/.test(p) },
];


/**
 * สุ่มรหัสผ่านที่ผ่านนโยบายแน่นอน — ใช้ crypto ของเบราว์เซอร์ ไม่ใช่ Math.random ที่เดาลำดับได้
 * ตัดอักษรที่อ่านสับสน (I l O 0 1) ออก เพราะผู้ดูแลต้องบอกรหัสนี้ให้ผู้ใช้ด้วยวาจาหรือข้อความ
 */
function generatePassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*'];
  const random = (n: number): number => crypto.getRandomValues(new Uint32Array(1))[0]! % n;
  const chars = sets.map((set) => set[random(set.length)]!);
  const all = sets.join('');
  while (chars.length < 16) chars.push(all[random(all.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

/**
 * สร้างผู้ใช้ใหม่ (POST /users)
 *
 * ⚠️ ทุกกฎตรวจซ้ำที่ backend — หน้านี้ตรวจเพื่อบอกผู้ดูแลก่อนกดส่งเท่านั้น
 *    รายการบริษัทมาจากขอบเขตของผู้ดูแลเอง และตัวเลือก super_admin แสดงเฉพาะ super_admin
 */
export default function NewUserPage(): React.JSX.Element {
  const router = useRouter();
  const t = useT();
  const { user } = useSession();
  const canCreate = useCan('user.create');
  const canAssignRole = useCan('user.assign_role');
  const isSuperAdmin = user.roles.includes('super_admin');

  const companies = useCompanies();
  const departmentsQuery = useDepartments();
  const create = useCreateUser();

  const activeCompanies = (companies.data ?? []).filter((c) => c.is_active);

  const [username, setUsername] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [companyId, setCompanyId] = React.useState<number | null>(null);
  const [departmentId, setDepartmentId] = React.useState('');
  const [role, setRole] = React.useState<RoleCode>('end_user');
  const [jobTitle, setJobTitle] = React.useState('');
  const [employeeCode, setEmployeeCode] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // ค่าเริ่มต้นของบริษัท = บริษัทต้นสังกัดของผู้ดูแล ถ้าอยู่ในรายการ ไม่งั้นบริษัทแรก
  React.useEffect(() => {
    if (companyId !== null || activeCompanies.length === 0) return;
    const home = activeCompanies.find((c) => c.id === user.company.id);
    setCompanyId((home ?? activeCompanies[0]!).id);
  }, [activeCompanies, companyId, user.company.id]);

  const departments = (departmentsQuery.data ?? []).filter(
    (d) => d.company.id === companyId && d.is_active,
  );

  const roleOptions = ROLE_ORDER.filter((code) => {
    if (code === 'super_admin') return isSuperAdmin;
    // ไม่มีสิทธิ์มอบบทบาท = สร้างได้เฉพาะผู้ใช้ทั่วไป
    return code === 'end_user' || canAssignRole;
  });

  const passwordOk = PASSWORD_RULES.every((rule) => rule.test(password));
  const confirmMismatch = confirm.length > 0 && confirm !== password;
  const ready =
    username.trim().length >= 3 &&
    fullName.trim().length >= 2 &&
    companyId !== null &&
    passwordOk &&
    confirm === password;

  if (!canCreate) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Alert tone="warning" title="ບໍ່ມີສິດສ້າງຜູ້ໃຊ້">
          ການສ້າງຜູ້ໃຊ້ສະເພາະຜູ້ດູແລບໍລິສັດ ແລະ ຜູ້ດູແລລະບົບ
        </Alert>
      </div>
    );
  }

  const fillGenerated = (): void => {
    const generated = generatePassword();
    setPassword(generated);
    setConfirm(generated);
    setShowPassword(true);
    setErrors((prev) => ({ ...prev, password: '' }));
  };

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!ready || companyId === null || create.isPending) return;
    setErrors({});

    const input: CreateUserInput = {
      username: username.trim().toLowerCase(),
      full_name: fullName.trim(),
      company_id: companyId,
      department_id: departmentId === '' ? null : Number(departmentId),
      role,
      password,
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(employeeCode.trim() ? { employee_code: employeeCode.trim() } : {}),
      ...(jobTitle.trim() ? { job_title: jobTitle.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
    };

    try {
      const created = await create.mutateAsync(input);
      toast.success(`ສ້າງຜູ້ໃຊ້ ${created.username} ແລ້ວ`, {
        description: 'ແຈ້ງຊື່ຜູ້ໃຊ້ ແລະ ລະຫັດຜ່ານໃຫ້ເຈົ້າຂອງບັນຊີຜ່ານຊ່ອງທາງທີ່ປອດໄພ',
      });
      router.replace(`/admin/users/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.error(err instanceof Error ? err.message : 'ສ້າງຜູ້ໃຊ້ບໍ່ສຳເລັດ');
    }
  };

  const locked = create.isPending;

  return (
    <form className="mx-auto flex w-full max-w-3xl flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
      <PageHeader
        title="ສ້າງຜູ້ໃຊ້ໃໝ່"
        description="ບັນຊີໃໝ່ເຂົ້າສູ່ລະບົບໄດ້ທັນທີດ້ວຍລະຫັດຜ່ານທີ່ຕັ້ງໃຫ້ — ຂອບເຂດບໍລິສັດຕາມທີ່ທ່ານດູແລ"
      />

      <Card>
        <CardHeader>
          <CardTitle>ຂໍ້ມູນບັນຊີ</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="ຊື່ຜູ້ໃຊ້ (ໃຊ້ເຂົ້າສູ່ລະບົບ)"
              htmlFor="username"
              required
              error={errors.username}
              hint="a-z 0-9 . _ - · ແກ້ພາຍຫຼັງບໍ່ໄດ້"
            >
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={50}
                placeholder="ເຊັ່ນ demo.cosi"
                disabled={locked}
              />
            </Field>
            <Field label="ຊື່ ແລະ ນາມສະກຸນ" htmlFor="full_name" required error={errors.full_name}>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={150}
                disabled={locked}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ບໍລິສັດ" htmlFor="company_id" required error={errors.company_id}>
              <Select
                value={companyId ?? ''}
                onChange={(e) => {
                  setCompanyId(Number(e.target.value));
                  // แผนกเดิมเป็นของบริษัทก่อนหน้า — ล้างทิ้ง ไม่งั้นเซิร์ฟเวอร์ปฏิเสธ
                  setDepartmentId('');
                }}
                disabled={locked}
              >
                {activeCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name_th}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="ພະແນກ"
              htmlFor="department_id"
              error={errors.department_id}
              hint={departments.length === 0 ? 'ບໍລິສັດນີ້ຍັງບໍ່ມີພະແນກ' : undefined}
            >
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={locked}>
                <option value="">— ບໍ່ລະບຸ —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="ບົດບາດ"
              htmlFor="role"
              required
              error={errors.role}
              hint={
                role === 'end_user'
                  ? 'ແຈ້ງບັນຫາ ແລະ ຕິດຕາມເລື່ອງຂອງຕົນເອງ'
                  : role === 'support_lead'
                    ? 'ຫຼັງສ້າງແລ້ວ ໄປທີ່ໜ້າ “ທີມງານ IT” ເພື່ອຕັ້ງເປັນຫົວໜ້າຂອງທີມ — ບໍ່ດັ່ງນັ້ນຈະມອບໝາຍວຽກໃຫ້ໃຜບໍ່ໄດ້'
                    : 'ປັບຂອບເຂດບໍລິສັດເພີ່ມໄດ້ທີ່ໜ້າລາຍລະອຽດຜູ້ໃຊ້'
              }
            >
              <Select value={role} onChange={(e) => setRole(e.target.value as RoleCode)} disabled={locked}>
                {/* จัดกลุ่มตามฝั่ง: ผู้ใช้งาน / Helpdesk Support / ผู้บริหารระบบ */}
                {SIDE_ORDER.map((side) => {
                  const options = roleOptions.filter((code) => ROLE_SIDE[code] === side);
                  if (options.length === 0) return null;
                  return (
                    <optgroup key={side} label={t(SIDE_LABEL_KEY[side])}>
                      {options.map((code) => (
                        <option key={code} value={code}>
                          {t(ROLE_LABEL_KEY[code])}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </Select>
            </Field>
            <Field label="ຕຳແໜ່ງ" htmlFor="job_title" error={errors.job_title}>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={100} disabled={locked} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="ລະຫັດພະນັກງານ" htmlFor="employee_code" error={errors.employee_code}>
              <Input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} maxLength={50} disabled={locked} />
            </Field>
            <Field label="ອີເມວ" htmlFor="email" error={errors.email}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={150} disabled={locked} />
            </Field>
            <Field label="ເບີໂທ" htmlFor="phone" error={errors.phone}>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} disabled={locked} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>ລະຫັດຜ່ານຕັ້ງຕົ້ນ</CardTitle>
          <Button type="button" variant="secondary" size="sm" onClick={fillGenerated} disabled={locked}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            ສຸ່ມລະຫັດຜ່ານ
          </Button>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ລະຫັດຜ່ານ" htmlFor="password" required error={errors.password}>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  maxLength={128}
                  className="pr-12"
                  disabled={locked}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'ເຊື່ອງລະຫັດຜ່ານ' : 'ສະແດງລະຫັດຜ່ານ'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-3 hover:text-ink"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </Field>
            <Field
              label="ຢືນຢັນລະຫັດຜ່ານ"
              htmlFor="confirm_password"
              required
              error={confirmMismatch ? 'ລະຫັດຜ່ານທັງສອງຊ່ອງບໍ່ກົງກັນ' : undefined}
            >
              <Input
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                maxLength={128}
                disabled={locked}
              />
            </Field>
          </div>

          <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="ເງື່ອນໄຂລະຫັດຜ່ານ">
            {PASSWORD_RULES.map((rule) => {
              const passed = rule.test(password);
              return (
                <li key={rule.label} className={cn('flex items-center gap-2 text-caption', passed ? 'text-sla-ok' : 'text-ink-3')}>
                  {passed ? <Check className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
                  {rule.label}
                </li>
              );
            })}
          </ul>

          <p className="text-caption text-ink-3">
            ແຈ້ງລະຫັດຜ່ານໃຫ້ເຈົ້າຂອງບັນຊີແບບສ່ວນຕົວ — ຢ່າສົ່ງໃນກຸ່ມແຊັດ ຫຼື ອີເມວກຸ່ມ
          </p>
        </CardBody>
        <CardFooter className="justify-end gap-2">
          <Button asChild variant="ghost">
            <Link href="/admin/users">ຍົກເລີກ</Link>
          </Button>
          <Button type="submit" disabled={!ready || locked}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {locked ? 'ກຳລັງສ້າງ...' : 'ສ້າງຜູ້ໃຊ້'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
