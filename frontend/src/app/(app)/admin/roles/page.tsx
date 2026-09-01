'use client';

import { Check, Lock, Minus, Save } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, BackLink, MockNotice, PageHeader } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { useHasRole } from '@/lib/session';
import { PERMISSION_GROUPS, ROLES } from '@/mocks/data';

/**
 * บทบาทและสิทธิ์ — company_admin อ่านได้ · super_admin แก้ได้
 *
 * approval.decide แสดงเป็นแถวพิเศษที่ไม่มีบทบาทใดติ๊กได้เลย
 * เพราะตรวจที่ approval_request.approver_id ของแถวนั้นโดยตรง ไม่ผ่านบทบาท
 * ถ้าไม่แสดงไว้ จะมีคนสงสัยว่าทำไมสิทธิ์นี้หายไปจากตาราง
 */
export default function RolesPage(): React.JSX.Element {
  const canEdit = useHasRole('super_admin');

  /**
   * เก็บเฉพาะ "ส่วนที่ถูกแก้" ไม่ใช่สำเนาเมทริกซ์ทั้งชุด
   * เพราะเมทริกซ์ 53 × 5 = 265 ช่อง การถือสำเนาไว้ทำให้ตอบไม่ได้ว่า
   * อะไรถูกแก้ไปบ้าง ซึ่งเป็นสิ่งที่ต้องส่งให้ backend และบันทึกลง audit log
   */
  const [changes, setChanges] = React.useState<Record<string, boolean>>({});
  const changeCount = Object.keys(changes).length;

  function isGranted(roleId: number, code: string, base: boolean): boolean {
    return changes[`${roleId}:${code}`] ?? base;
  }

  function toggle(roleId: number, code: string, base: boolean): void {
    const key = `${roleId}:${code}`;
    const next = !isGranted(roleId, code, base);
    setChanges((prev) => {
      const draft = { ...prev };
      // กลับไปตรงกับค่าเดิมแล้ว = ไม่ใช่การเปลี่ยนแปลง ต้องถอดออกจากรายการ
      if (next === base) delete draft[key];
      else draft[key] = next;
      return draft;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/admin" label="ກັບໄປສູນຄວບຄຸມ" />
      <PageHeader
        title="ບົດບາດ ແລະ ສິດ"
        description={`${ROLES.length} ບົດບາດ · ${PERMISSION_GROUPS.reduce((n, g) => n + g.permissions.length, 0)} ສິດ`}
        actions={
          canEdit && (
            <Button
              disabled={changeCount === 0}
              onClick={() => {
                toast.success(`ບັນທຶກການປ່ຽນສິດ ${changeCount} ລາຍການແລ້ວ`);
                setChanges({});
              }}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              ບັນທຶກ {changeCount > 0 && `(${changeCount})`}
            </Button>
          )
        }
      />

      <MockNotice endpoint="GET /roles · GET /permissions" />

      {!canEdit && (
        <Alert tone="info" title="ໂໝດອ່ານຢ່າງດຽວ">
          ຜູ້ດູແລລະດັບບໍລິສັດເບິ່ງເມທຣິກນີ້ໄດ້ ແຕ່ແກ້ບໍ່ໄດ້ — ການແກ້ສິດຂອງບົດບາດ
          ເປັນສິດຂອງຜູ້ດູແລລະບົບເທົ່ານັ້ນ
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ບົດບາດ</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ROLES.map((role) => (
            <div key={role.id} className="rounded border border-hair p-3">
              <p className="text-body-sm font-semibold">{role.name_th}</p>
              <p className="font-mono text-caption text-ink-3">{role.code}</p>
              <p className="mt-1 text-caption text-ink-2">{role.description}</p>
              <p className="tabular mt-2 text-caption text-ink-3">
                {role.permissions.length} ສິດ · ຜູ້ໃຊ້ {role.user_count} ຄົນ
              </p>
            </div>
          ))}
        </CardBody>
      </Card>

      {PERMISSION_GROUPS.map((group) => (
        <Card key={group.group}>
          <CardHeader>
            <CardTitle>{group.label}</CardTitle>
            <span className="tabular text-caption text-ink-3">
              {group.permissions.length} ສິດ
            </span>
          </CardHeader>
          <CardBody className="p-0">
            {/*
              บนจอเล็กแสดงเป็นรายการทีละสิทธิ์ ไม่ใช่เมทริกซ์ 5 คอลัมน์
              เมทริกซ์กว้าง 720px บนจอ 375px ต้องปัดไปมาเพื่อจับคู่ช่องกับหัวคอลัมน์
              ซึ่งอ่านผิดง่ายมากในเรื่องที่อ่านผิดไม่ได้อย่างสิทธิ์การใช้งาน
            */}
            <ul className="divide-y divide-hair lg:hidden">
              {group.permissions.map((permission) => {
                const rowLevelOnly = permission.code === 'approval.decide';
                return (
                  <li key={permission.code} className="px-4 py-3">
                    <p className="font-mono text-caption text-ink-3">{permission.code}</p>
                    <p className="text-body-sm text-ink">{permission.description}</p>
                    {rowLevelOnly ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-caption text-ink-3">
                        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                        ກວດທີ່ລະດັບແຖວ ບໍ່ມອບຜ່ານບົດບາດ
                      </p>
                    ) : (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {ROLES.map((role) => {
                          const base = role.permissions.includes(permission.code);
                          const granted = isGranted(role.id, permission.code, base);
                          return (
                            <li key={role.id}>
                              <button
                                type="button"
                                disabled={!canEdit}
                                onClick={() => toggle(role.id, permission.code, base)}
                                aria-pressed={granted}
                                className={cn(
                                  'inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-caption font-semibold',
                                  granted
                                    ? 'bg-sla-ok-bg text-sla-ok'
                                    : 'bg-subtle text-ink-3 line-through',
                                  granted !== base && 'ring-2 ring-primary',
                                )}
                              >
                                {granted ? (
                                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                ) : (
                                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                                {role.name_th}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[720px] border-collapse text-body-sm">
                <caption className="sr-only">ເມທຣິກສິດຂອງກຸ່ມ {group.label}</caption>
                <thead>
                  <tr className="border-b border-hair">
                    <th scope="col" className="px-3 py-2.5 text-left text-caption font-semibold text-ink-2">
                      ສິດ
                    </th>
                    {ROLES.map((role) => (
                      <th
                        key={role.id}
                        scope="col"
                        className="px-2 py-2.5 text-center text-caption font-semibold text-ink-2"
                      >
                        {role.name_th}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.permissions.map((permission) => {
                    const rowLevelOnly = permission.code === 'approval.decide';
                    return (
                      <tr key={permission.code} className="border-b border-hair last:border-0">
                        <th scope="row" className="px-3 py-2.5 text-left font-normal">
                          <span className="block font-mono text-caption text-ink-3">
                            {permission.code}
                          </span>
                          <span className="block text-body-sm text-ink">{permission.description}</span>
                        </th>
                        {ROLES.map((role) => {
                          const base = role.permissions.includes(permission.code);
                          const granted = isGranted(role.id, permission.code, base);
                          const dirty = granted !== base;

                          if (rowLevelOnly) {
                            return (
                              <td key={role.id} className="px-2 py-2.5 text-center">
                                <span
                                  className="inline-flex items-center gap-1 text-caption text-ink-3"
                                  title="ກວດທີ່ລະດັບແຖວ ບໍ່ຜູກກັບບົດບາດ ຈຶ່ງມອບຜ່ານເມທຣິກນີ້ບໍ່ໄດ້"
                                >
                                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span className="sr-only">ບໍ່ມອບຜ່ານບົດບາດ</span>
                                </span>
                              </td>
                            );
                          }

                          const icon = granted ? (
                            <Check className="mx-auto h-4 w-4 text-sla-ok" aria-hidden="true" />
                          ) : (
                            <Minus className="mx-auto h-4 w-4 text-ink-3" aria-hidden="true" />
                          );

                          return (
                            <td
                              key={role.id}
                              className={cn('px-2 py-2.5 text-center', dirty && 'bg-primary-subtle')}
                            >
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => toggle(role.id, permission.code, base)}
                                  aria-pressed={granted}
                                  aria-label={`${role.name_th} ${granted ? 'ມີ' : 'ບໍ່ມີ'}ສິດ ${permission.code}`}
                                  className="grid h-tap w-full place-items-center rounded hover:bg-subtle"
                                >
                                  {icon}
                                </button>
                              ) : (
                                <span
                                  role="img"
                                  aria-label={`${role.name_th} ${granted ? 'ມີ' : 'ບໍ່ມີ'}ສິດນີ້`}
                                >
                                  {icon}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      ))}

      <Alert tone="info" title="ເງື່ອນໄຂ “ສະເພາະຂອງຕົນ” ແລະ “ສະເພາະບໍລິສັດຕົນ”">
        ເມທຣິກນີ້ບອກວ່າ “ເຮັດໄດ້ບໍ່” ສ່ວນ “ເຫັນແຖວໃດແດ່” ຄຸມແຍກຢູ່ຊັ້ນ query ຂອງ backend
        ເຊັ່ນ ຜູ້ແຈ້ງມີສິດ ticket.read ແຕ່ເຫັນສະເພາະເລື່ອງທີ່ຕົນແຈ້ງເທົ່ານັ້ນ
      </Alert>
    </div>
  );
}
