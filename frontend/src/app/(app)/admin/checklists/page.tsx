'use client';

import { FileText, Paperclip, Pencil, Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import {
  RecordFormDialog,
  type FieldSpec,
  type FieldValue,
} from '@/components/admin/record-form-dialog';
import { ROLE_LABEL_KEY } from '@/components/layout/app-shell';
import { useT } from '@/components/layout/preference-controls';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, BackLink, PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { cn } from '@/lib/cn';
import {
  useChecklistTemplates,
  useCompanies,
  useCreateMaster,
  useUpdateMaster,
} from '@/lib/queries/master-data';
import type { ChecklistTemplate, RoleCode } from '@/lib/types';

/**
 * แม่แบบรายการตรวจตาม SOP
 *
 * ข้อที่ตั้ง "ต้องแนบหลักฐาน" จะติ๊กเสร็จไม่ได้ถ้ายังไม่แนบไฟล์
 * บังคับที่ระดับฐานข้อมูลด้วย ไม่ใช่แค่ในหน้าจอ — ข้อพวกนี้คือจุดที่
 * การตรวจสอบภายในถามหาหลักฐานย้อนหลัง เช่นการปิดสิทธิ์วันพนักงานลาออก
 */
export default function ChecklistsPage(): React.JSX.Element {
  const t = useT();
  const query = useChecklistTemplates();
  const companies = useCompanies();
  const templates = query.data ?? [];

  const createTemplate = useCreateMaster('/checklist-templates');
  const updateTemplate = useUpdateMaster('/checklist-templates');
  const createItem = useCreateMaster('/checklist-items');

  const [editing, setEditing] = React.useState<ChecklistTemplate | null>(null);
  const [creating, setCreating] = React.useState(false);
  /** แม่แบบที่กำลังเพิ่มข้อย่อยให้ — คนละฟอร์มกับการแก้ตัวแม่แบบเอง */
  const [addingItemTo, setAddingItemTo] = React.useState<ChecklistTemplate | null>(null);

  const templateFields: FieldSpec[] = [
    {
      kind: 'text',
      name: 'code',
      label: 'ລະຫັດ',
      required: true,
      placeholder: 'SOP04_ONBOARD',
      lockedOnEdit: true,
    },
    { kind: 'text', name: 'name_th', label: 'ຊື່ແມ່ແບບ', required: true },
    { kind: 'text', name: 'doc_ref', label: 'ອ້າງອີງເອກະສານ', placeholder: 'AIDC-IT-SOP-001 ກ.1' },
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
    { kind: 'checkbox', name: 'is_active', label: 'ເປີດໃຊ້ງານ' },
  ];

  /*
   * เวอร์ชันแก้ได้เฉพาะตอนแก้แม่แบบเดิม และไม่ขยับให้เอง
   * ticket เก่าอ้างเวอร์ชันเดิมผ่านสแนปช็อต การเลื่อนเวอร์ชันจึงต้องเป็น
   * การตัดสินใจของผู้ดูแล ไม่ใช่ผลข้างเคียงของการแก้ชื่อ
   */
  const editFields: FieldSpec[] = [
    ...templateFields,
    { kind: 'number', name: 'version', label: 'ເວີຊັນ', hint: 'ຂຶ້ນເອງບໍ່ໄດ້ — ຕັ້ງເມື່ອຕັ້ງໃຈເທົ່ານັ້ນ' },
  ];

  const itemFields: FieldSpec[] = [
    { kind: 'text', name: 'title_th', label: 'ຊື່ຂໍ້', required: true },
    { kind: 'textarea', name: 'description', label: 'ຄຳອະທິບາຍ' },
    { kind: 'number', name: 'sort_order', label: 'ລຳດັບ', hint: 'ວ່າງໄວ້ = ຕໍ່ທ້າຍໃຫ້ເອງ' },
    { kind: 'checkbox', name: 'is_required', label: 'ບັງຄັບ', hint: 'ຕິກບໍ່ຄົບແລ້ວປິດເລື່ອງບໍ່ໄດ້' },
    { kind: 'checkbox', name: 'evidence_required', label: 'ຕ້ອງແນບຫຼັກຖານ' },
  ];

  const templateInitial: Record<string, FieldValue> = editing
    ? {
        code: editing.code,
        name_th: editing.name_th,
        doc_ref: editing.doc_ref ?? '',
        company_id: editing.company ? String(editing.company.id) : '',
        is_active: editing.is_active,
        version: editing.version,
      }
    : { code: '', name_th: '', doc_ref: '', company_id: '', is_active: true };

  const handleTemplateSubmit = async (values: Record<string, FieldValue>): Promise<void> => {
    if (editing) {
      await updateTemplate.mutateAsync({
        id: editing.id,
        name_th: String(values.name_th ?? ''),
        doc_ref: String(values.doc_ref ?? ''),
        version: Number(values.version ?? editing.version),
        is_active: values.is_active === true,
      });
      toast.success(`ບັນທຶກ ${values.name_th} ແລ້ວ`);
      return;
    }
    await createTemplate.mutateAsync({
      code: String(values.code ?? ''),
      name_th: String(values.name_th ?? ''),
      doc_ref: String(values.doc_ref ?? ''),
      company_id: values.company_id ? Number(values.company_id) : null,
      is_active: values.is_active === true,
    });
    toast.success(`ສ້າງແມ່ແບບ ${values.name_th} ແລ້ວ`);
  };

  const handleItemSubmit = async (values: Record<string, FieldValue>): Promise<void> => {
    if (!addingItemTo) return;
    await createItem.mutateAsync({
      template_id: addingItemTo.id,
      title_th: String(values.title_th ?? ''),
      description: String(values.description ?? ''),
      ...(values.sort_order === null || values.sort_order === ''
        ? {}
        : { sort_order: Number(values.sort_order) }),
      is_required: values.is_required === true,
      evidence_required: values.evidence_required === true,
    });
    toast.success(`ເພີ່ມຂໍ້ “${values.title_th}” ແລ້ວ`);
  };

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/admin" label="ກັບໄປສູນຄວບຄຸມ" />
      <PageHeader
        title="ແມ່ແບບລາຍການກວດ"
        description="ຂັ້ນຕອນທີ່ຕ້ອງເຮັດຄົບຕາມ SOP ກ່ອນປິດຄຳຂໍ"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            ສ້າງແມ່ແບບ
          </Button>
        }
      />

      <Alert tone="info" title="ຂໍ້ທີ່ຕ້ອງແນບຫຼັກຖານ ຕິກສຳເລັດບໍ່ໄດ້ຖ້າຍັງບໍ່ແນບໄຟລ໌">
        ບັງຄັບໄວ້ທີ່ລະດັບຖານຂໍ້ມູນ ບໍ່ແມ່ນແຄ່ໃນໜ້າຈໍ ຈຶ່ງຂ້າມບໍ່ໄດ້ເຖິງແມ່ນຈະແກ້ຜ່ານ API ໂດຍກົງ
      </Alert>

      <QueryBoundary query={query}>
        <div className="grid gap-4 xl:grid-cols-2">
          {templates.map((template) => {
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
                <span className="inline-flex flex-none gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setAddingItemTo(template)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    ເພີ່ມຂໍ້
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(template)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    ແກ້ໄຂ
                  </Button>
                </span>
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
                              {t(ROLE_LABEL_KEY[item.default_role_code as RoleCode]) ??
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
      </QueryBoundary>

      <RecordFormDialog
        open={creating || editing !== null}
        title={editing ? `ແກ້ໄຂ ${editing.name_th}` : 'ສ້າງແມ່ແບບໃໝ່'}
        fields={editing ? editFields : templateFields}
        initial={templateInitial}
        editing={editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSubmit={handleTemplateSubmit}
      />

      <RecordFormDialog
        open={addingItemTo !== null}
        title={addingItemTo ? `ເພີ່ມຂໍ້ໃນ ${addingItemTo.name_th}` : ''}
        fields={itemFields}
        initial={{
          title_th: '',
          description: '',
          sort_order: null,
          is_required: true,
          evidence_required: false,
        }}
        onClose={() => setAddingItemTo(null)}
        onSubmit={handleItemSubmit}
      />
    </div>
  );
}
