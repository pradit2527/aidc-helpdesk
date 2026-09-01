'use client';

import Link from 'next/link';
import { KeyRound, Lock, Search, Upload, UserPlus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { ROLE_LABEL } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input, Select } from '@/components/ui/field';
import { Avatar, MockNotice, PageHeader } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { useSession } from '@/lib/session';
import { COMPANIES, USERS } from '@/mocks/data';
import type { AdminUser } from '@/lib/types';

/**
 * จัดการผู้ใช้ (US-08)
 *
 * ปุ่มรีเซ็ตรหัสผ่านและปลดล็อกอยู่ในแถวเดียวกันโดยตั้งใจ
 * เพราะโดยมากผู้ใช้โทรมาด้วยอาการเดียว คือ "เข้าระบบไม่ได้"
 * ซึ่งอาจเป็นได้ทั้งลืมรหัสหรือถูกล็อก การแยกเมนูทำให้เจ้าหน้าที่ต้องเดาก่อน
 */
export default function AdminUsersPage(): React.JSX.Element {
  const { user } = useSession();
  const [q, setQ] = React.useState('');
  const [company, setCompany] = React.useState('');
  const [role, setRole] = React.useState('');

  const rows = USERS.filter((u) => {
    if (q && !`${u.full_name} ${u.username} ${u.employee_code ?? ''}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    if (company && String(u.company.id) !== company) return false;
    if (role && !u.roles.includes(role as AdminUser['roles'][number])) return false;
    return true;
  });

  const columns: Column<AdminUser>[] = [
    {
      key: 'name',
      header: 'ຜູ້ໃຊ້',
      render: (u) => (
        <Link href={`/admin/users/${u.id}`} className="group flex items-center gap-3">
          <Avatar name={u.full_name} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-body-sm font-semibold group-hover:text-primary">
              {u.full_name}
            </span>
            <span className="block truncate text-caption text-ink-3">
              {u.username}
              {u.employee_code && ` · ${u.employee_code}`}
            </span>
          </span>
        </Link>
      ),
    },
    {
      key: 'company',
      header: 'ບໍລິສັດ / ພະແນກ',
      hideBelow: 'md',
      render: (u) => (
        <span className="text-body-sm">
          {u.company.code}
          {u.department && <span className="block text-caption text-ink-3">{u.department.name}</span>}
        </span>
      ),
    },
    {
      key: 'roles',
      header: 'ບົດບາດ',
      render: (u) => (
        <span className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <span key={r} className="rounded-sm bg-subtle px-1.5 py-0.5 text-caption text-ink-2">
              {ROLE_LABEL[r]}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'ສະຖານະ',
      render: (u) => (
        <span className="flex flex-wrap gap-1">
          {!u.is_active && (
            <span className="rounded-full bg-subtle px-2 py-0.5 text-caption text-ink-3">
              ປິດການໃຊ້ງານ
            </span>
          )}
          {u.is_locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sla-breach-bg px-2 py-0.5 text-caption font-semibold text-sla-breach">
              <Lock className="h-3 w-3" aria-hidden="true" />
              ຖືກລັອກ
            </span>
          )}
          {u.must_change_password && (
            <span className="rounded-full bg-st-pending-bg px-2 py-0.5 text-caption text-st-pending-fg">
              ຕ້ອງປ່ຽນລະຫັດ
            </span>
          )}
          {u.is_active && !u.is_locked && !u.must_change_password && (
            <span className="rounded-full bg-sla-ok-bg px-2 py-0.5 text-caption text-sla-ok">
              ປົກກະຕິ
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'last_login',
      header: 'ເຂົ້າລະບົບຫຼ້າສຸດ',
      hideBelow: 'lg',
      align: 'right',
      render: (u) => (
        <span className={cn('text-caption', u.last_login_at ? 'text-ink-2' : 'text-ink-3')}>
          {u.last_login_at ? formatRelative(u.last_login_at) : 'ຍັງບໍ່ເຄີຍ'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            toast.success(
              u.is_locked
                ? `ປົດລັອກ ແລະ ຣີເຊັດລະຫັດຂອງ ${u.full_name} ແລ້ວ`
                : `ຣີເຊັດລະຫັດຂອງ ${u.full_name} ແລ້ວ`,
            );
          }}
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {u.is_locked ? 'ປົດລັອກ' : 'ຣີເຊັດລະຫັດ'}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ຈັດການຜູ້ໃຊ້"
        description="ຄົ້ນຫາ ສ້າງ ປິດການໃຊ້ງານ ແລະ ຣີເຊັດລະຫັດຜ່ານ"
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/admin/users/import">
                <Upload className="h-4 w-4" aria-hidden="true" />
                ນຳເຂົ້າຈາກໄຟລ໌
              </Link>
            </Button>
            <Button onClick={() => toast.info('ຟອມສ້າງຜູ້ໃຊ້ໃໝ່')}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              ສ້າງຜູ້ໃຊ້
            </Button>
          </>
        }
      />

      <MockNotice endpoint="GET /users" />

      <Card>
        <CardBody className="grid gap-2 border-b border-hair sm:grid-cols-3">
          <div className="relative sm:col-span-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ຊື່ ຫຼື ລະຫັດພະນັກງານ"
              aria-label="ຄົ້ນຫາຜູ້ໃຊ້"
              className="pl-9"
            />
          </div>
          <Select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            aria-label="ກັ່ນຕອງຕາມບໍລິສັດ"
          >
            <option value="">ທຸກບໍລິສັດໃນຂອບເຂດ</option>
            {COMPANIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </Select>
          <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="ກັ່ນຕອງຕາມບົດບາດ">
            <option value="">ທຸກບົດບາດ</option>
            {Object.entries(ROLE_LABEL).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
        </CardBody>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(u) => u.id}
          caption="ລາຍຊື່ຜູ້ໃຊ້"
          emptyTitle="ບໍ່ພົບຜູ້ໃຊ້ທີ່ຕົງກັບເງື່ອນໄຂ"
        />
      </Card>

      <p className="text-caption text-ink-3">
        ຂອບເຂດປັດຈຸບັນ {user.scoped_companies.map((c) => c.code).join(' · ') || 'ທຸກບໍລິສັດ'} —
        ຜູ້ໃຊ້ນອກຂອບເຂດຈະບໍ່ປາກົດ ເຖິງແມ່ນຄົ້ນຫາດ້ວຍຊື່ຖືກຕ້ອງ
      </p>
    </div>
  );
}
