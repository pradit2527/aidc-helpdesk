'use client';

import { useRouter } from 'next/navigation';
import { Camera, Info, Send } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PriorityBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert, BackLink, PageHeader } from '@/components/ui/misc';
import { CHANNEL, IMPACT_OPTIONS, TICKET_TYPE, URGENCY_OPTIONS, previewPriority } from '@/config/enums';
import { formatFileSize } from '@/lib/format';
import { useSession } from '@/lib/session';
import { TICKET_CATEGORIES } from '@/mocks/data';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * แจ้งปัญหา (US-01)
 *
 * ⚠️ ฟอร์มนี้ไม่มีช่องให้เลือก priority และจะไม่มีตลอดไป
 *    ผู้แจ้งตอบสองคำถามคือ "กระทบใครบ้าง" กับ "เร่งด่วนแค่ไหน"
 *    แล้วระบบคำนวณระดับให้ตามเมทริกซ์ (SLA ข้อ 4)
 *    ถ้าส่ง priority ตรง ๆ backend ตอบ 422 — และควรตอบแบบนั้น
 *
 * ระดับที่แสดงระหว่างกรอกเป็นเพียง "ตัวอย่าง" ค่าจริงยึดจากที่ backend ส่งกลับ
 */
export default function NewTicketPage(): React.JSX.Element {
  const router = useRouter();
  const { user } = useSession();

  const [form, setForm] = React.useState({
    ticket_type: 'incident' as keyof typeof TICKET_TYPE,
    subject: '',
    description: '',
    category_id: '',
    impact: 'individual',
    urgency: 'medium',
    channel: 'portal' as keyof typeof CHANNEL,
    asset_tag: '',
  });
  const [files, setFiles] = React.useState<File[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const preview = previewPriority(form.impact, form.urgency);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }

  function onPickFiles(event: React.ChangeEvent<HTMLInputElement>): void {
    const picked = Array.from(event.target.files ?? []);
    const tooBig = picked.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooBig.length > 0) {
      toast.error(`ໄຟລ໌ໃຫຍ່ເກີນ 20 MB: ${tooBig.map((f) => f.name).join(', ')}`);
    }
    setFiles((prev) => [...prev, ...picked.filter((f) => f.size <= MAX_UPLOAD_BYTES)]);
    event.target.value = '';
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (form.subject.trim().length < 5) next.subject = 'ຫົວຂໍ້ຕ້ອງຍາວຢ່າງໜ້ອຍ 5 ຕົວອັກສອນ';
    if (form.description.trim().length < 10) next.description = 'ກະລຸນາອະທິບາຍບັນຫາຢ່າງໜ້ອຍ 10 ຕົວອັກສອນ';
    if (!form.category_id) next.category_id = 'ກະລຸນາເລືອກໝວດໝູ່';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!validate()) {
      // โฟกัสไปช่องแรกที่ผิด ไม่ให้ผู้ใช้ต้องไล่หาเองบนฟอร์มยาว
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setSubmitting(true);
    // ของจริง: POST /tickets แล้วพาไปหน้ารายละเอียดของเลขที่ที่ backend คืนมา
    await new Promise((resolve) => setTimeout(resolve, 400));
    toast.success('ສົ່ງເລື່ອງແຈ້ງແລ້ວ ທີມງານຈະຕິດຕໍ່ກັບໄປ');
    setSubmitting(false);
    router.push('/tickets/my');
  }

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href="/tickets/my" label="ກັບໄປເລື່ອງຂອງຂ້ອຍ" />
      <PageHeader title="ແຈ້ງບັນຫາ" description="ບອກສິ່ງທີ່ເກີດຂຶ້ນ ທີມງານຈະຮັບເລື່ອງພາຍໃນເວລາທີ່ກຳນົດ" />

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>ເລື່ອງທີ່ຕ້ອງການແຈ້ງ</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <Field label="ປະເພດ" htmlFor="ticket_type">
              <Select
                value={form.ticket_type}
                onChange={(e) => set('ticket_type', e.target.value as keyof typeof TICKET_TYPE)}
              >
                {Object.entries(TICKET_TYPE).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="ຫົວຂໍ້"
              htmlFor="subject"
              required
              error={errors.subject}
              hint="ສະຫຼຸບສັ້ນ ໆ ວ່າເກີດຫຍັງຂຶ້ນ ເຊັ່ນ ‘ເຄື່ອງພິມຊັ້ນ 2 ພິມບໍ່ອອກ’"
            >
              <Input
                value={form.subject}
                onChange={(e) => set('subject', e.target.value)}
                maxLength={255}
                placeholder="ເກີດຫຍັງຂຶ້ນ"
              />
            </Field>

            <Field
              label="ລາຍລະອຽດ"
              htmlFor="description"
              required
              error={errors.description}
              hint="ບອກສິ່ງທີ່ລອງແກ້ໄປແລ້ວ ແລະ ເລີ່ມເປັນຕອນໃດ ຈະຊ່ວຍໃຫ້ແກ້ໄດ້ໄວຂຶ້ນ"
            >
              <Textarea
                rows={5}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="ອະທິບາຍບັນຫາ"
              />
            </Field>

            <Field label="ໝວດໝູ່" htmlFor="category_id" required error={errors.category_id}>
              <Select
                value={form.category_id}
                onChange={(e) => {
                  const category = TICKET_CATEGORIES.find((c) => String(c.id) === e.target.value);
                  set('category_id', e.target.value);
                  // เติมค่าตั้งต้นของหมวดหมู่ให้ แต่ผู้แจ้งแก้ได้เสมอ
                  if (category) {
                    setForm((prev) => ({
                      ...prev,
                      category_id: e.target.value,
                      impact: category.default_impact,
                      urgency: category.default_urgency,
                    }));
                  }
                }}
              >
                <option value="">— ເລືອກໝວດໝູ່ —</option>
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_th}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="ລະຫັດຊັບສິນ (ຖ້າມີ)"
              htmlFor="asset_tag"
              hint="ສະຕິກເກີເລກຊັບສິນທີ່ຕິດຢູ່ເຄື່ອງ"
            >
              <Input
                value={form.asset_tag}
                onChange={(e) => set('asset_tag', e.target.value)}
                placeholder="ເຊັ່ນ LOG-PC-0142"
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ຜົນກະທົບ ແລະ ຄວາມຮີບດ່ວນ</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <Field label="ບັນຫານີ້ກະທົບໃຜແດ່" htmlFor="impact" required>
              <Select value={form.impact} onChange={(e) => set('impact', e.target.value)}>
                {IMPACT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="ຮີບດ່ວນແຄ່ໃດ" htmlFor="urgency" required>
              <Select value={form.urgency} onChange={(e) => set('urgency', e.target.value)}>
                {URGENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>

            {preview && (
              <Alert tone="info" title="ລະດັບຄວາມສຳຄັນທີ່ລະບົບຈະຄຳນວນໃຫ້">
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <PriorityBadge priority={preview} />
                  <span className="inline-flex items-center gap-1.5 text-caption text-ink-2">
                    <Info className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
                    ຄ່ານີ້ເປັນຕົວຢ່າງ ຄ່າຈິງລະບົບຈະຄຳນວນຕອນບັນທຶກ
                  </span>
                </div>
              </Alert>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ໄຟລ໌ແນບ</CardTitle>
          </CardHeader>
          <CardBody>
            <label className="flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-control bg-subtle px-4 text-body-sm font-semibold text-ink-2 hover:border-primary hover:text-primary">
              <Camera className="h-5 w-5" aria-hidden="true" />
              ຖ່າຍຮູບ ຫຼື ເລືອກໄຟລ໌
              <input
                type="file"
                multiple
                // capture="environment" เปิดกล้องหลังทันทีบนมือถือ
                // พนักงานหน้างานถ่ายรูปหน้าจอที่ผิดพลาดได้ในสองแตะ
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                capture="environment"
                onChange={onPickFiles}
                className="sr-only"
              />
            </label>
            <p className="mt-2 text-caption text-ink-3">ຂະໜາດສູງສຸດ 20 MB ຕໍ່ໄຟລ໌</p>

            {files.length > 0 && (
              <ul className="mt-3 space-y-2">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between gap-3 rounded border border-hair px-3 py-2 text-body-sm"
                  >
                    <span className="min-w-0 truncate">{file.name}</span>
                    <span className="flex flex-none items-center gap-3">
                      <span className="tabular text-caption text-ink-3">
                        {formatFileSize(file.size)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                      >
                        ລົບ
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
          <CardFooter className="justify-between">
            <span className="text-caption text-ink-3">
              ແຈ້ງໃນນາມ {user.full_name} · {user.company.code}
            </span>
            <Button type="submit" size="lg" loading={submitting}>
              <Send className="h-4 w-4" aria-hidden="true" />
              ສົ່ງເລື່ອງແຈ້ງ
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
