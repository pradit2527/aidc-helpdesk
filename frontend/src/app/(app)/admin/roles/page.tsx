'use client';

import { Check, Lock, Minus } from 'lucide-react';
import * as React from 'react';

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, MockNotice, PageHeader } from '@/components/ui/misc';
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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ບົດບາດ ແລະ ສິດ"
        description={`${ROLES.length} ບົດບາດ · ${PERMISSION_GROUPS.reduce((n, g) => n + g.permissions.length, 0)} ສິດ`}
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
            <div className="overflow-x-auto">
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
                          const granted = role.permissions.includes(permission.code);
                          return (
                            <td key={role.id} className="px-2 py-2.5 text-center">
                              {rowLevelOnly ? (
                                <span
                                  className="inline-flex items-center gap-1 text-caption text-ink-3"
                                  title="ກວດທີ່ລະດັບແຖວ ບໍ່ຜູກກັບບົດບາດ"
                                >
                                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span className="sr-only">ບໍ່ມອບຜ່ານບົດບາດ</span>
                                </span>
                              ) : granted ? (
                                <Check
                                  className="mx-auto h-4 w-4 text-sla-ok"
                                  aria-label={`${role.name_th} ມີສິດນີ້`}
                                />
                              ) : (
                                <Minus
                                  className={cn('mx-auto h-4 w-4 text-ink-3')}
                                  aria-label={`${role.name_th} ບໍ່ມີສິດນີ້`}
                                />
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
