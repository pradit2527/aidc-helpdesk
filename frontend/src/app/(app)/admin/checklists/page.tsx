'use client';

import { FileText, Paperclip, Pencil, Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { ROLE_LABEL } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, BackLink, MockNotice, PageHeader } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { CHECKLIST_TEMPLATES } from '@/mocks/admin-data';
import type { RoleCode } from '@/lib/types';

/**
 * แม่แบบรายการตรวจตาม SOP
 *
 * ข้อที่ตั้ง "ต้องแนบหลักฐาน" จะติ๊กเสร็จไม่ได้ถ้ายังไม่แนบไฟล์
 * บังคับที่ระดับฐานข้อมูลด้วย ไม่ใช่แค่ในหน้าจอ — ข้อพวกนี้คือจุดที่
 * การตรวจสอบภายในถามหาหลักฐานย้อนหลัง เช่นการปิดสิทธิ์วันพนักงานลาออก
 */
export default function ChecklistsPage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/admin" label="ກັບໄປສູນຄວບຄຸມ" />
      <PageHeader
        title="ແມ່ແບບລາຍການກວດ"
        description="ຂັ້ນຕອນທີ່ຕ້ອງເຮັດຄົບຕາມ SOP ກ່ອນປິດຄຳຂໍ"
        actions={
          <Button onClick={() => toast.info('ຟອມສ້າງແມ່ແບບໃໝ່')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            ສ້າງແມ່ແບບ
          </Button>
        }
      />

      <MockNotice endpoint="GET /checklist-templates" />

      <Alert tone="info" title="ຂໍ້ທີ່ຕ້ອງແນບຫຼັກຖານ ຕິກສຳເລັດບໍ່ໄດ້ຖ້າຍັງບໍ່ແນບໄຟລ໌">
        ບັງຄັບໄວ້ທີ່ລະດັບຖານຂໍ້ມູນ ບໍ່ແມ່ນແຄ່ໃນໜ້າຈໍ ຈຶ່ງຂ້າມບໍ່ໄດ້ເຖິງແມ່ນຈະແກ້ຜ່ານ API ໂດຍກົງ
      </Alert>

      <div className="grid gap-4 xl:grid-cols-2">
        {CHECKLIST_TEMPLATES.map((template) => {
          const required = template.items.filter((i) => i.is_required).length;
          const evidence = template.items.filter((i) => i.evidence_required).length;

          return (
            <Card key={template.id}>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle>{template.name_th}</CardTitle>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-caption text-ink-3">
                    <span className="font-mono">{template.code}</span>
                    <span>ເວີຊັນ {template.version}</span>
                    {template.doc_ref && (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        {template.doc_ref}
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toast.info(`ແກ້ໄຂ ${template.name_th}`)}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  ແກ້ໄຂ
                </Button>
              </CardHeader>

              <CardBody className="p-0">
                <p className="tabular border-b border-hair px-4 py-2 text-caption text-ink-2 lg:px-5">
                  {template.items.length} ຂໍ້ · ບັງຄັບ {required} · ຕ້ອງແນບຫຼັກຖານ {evidence}
                </p>
                <ol className="divide-y divide-hair">
                  {template.items.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 px-4 py-2.5 lg:px-5">
                      <span className="tabular mt-0.5 w-6 flex-none text-caption text-ink-3">
                        {item.sort_order}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-body-sm text-ink">{item.title_th}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
                          <span
                            className={cn(
                              item.is_required ? 'font-semibold text-ink-2' : 'text-ink-3',
                            )}
                          >
                            {item.is_required ? 'ບັງຄັບ' : 'ບໍ່ບັງຄັບ'}
                          </span>
                          {item.evidence_required && (
                            <span className="inline-flex items-center gap-1 text-sla-risk">
                              <Paperclip className="h-3 w-3" aria-hidden="true" />
                              ຕ້ອງແນບຫຼັກຖານ
                            </span>
                          )}
                          {item.default_role_code && (
                            <span className="text-ink-3">
                              ຜູ້ຮັບຜິດຊອບ{' '}
                              {ROLE_LABEL[item.default_role_code as RoleCode] ??
                                item.default_role_code}
                            </span>
                          )}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
