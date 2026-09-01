'use client';

import { useRouter } from 'next/navigation';
import { Eye, Save, Send } from 'lucide-react';
import * as React from 'react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { BackLink, PageHeader, Tabs } from '@/components/ui/misc';
import { useHasRole } from '@/lib/session';
import { KB_CATEGORIES } from '@/mocks/data';
import type { KbArticle } from '@/lib/types';

/**
 * เขียน/แก้ไขบทความคลังความรู้ (US-14)
 *
 * `kb.publish` แยกจาก `kb.create` โดยตั้งใจ — agent เขียนได้แต่เผยแพร่เองไม่ได้
 * บทความที่ผิดจะกระจายไปถึงผู้ใช้ทุกคนพร้อมกัน จึงต้องมีคนอ่านทวนก่อนหนึ่งชั้น
 */
export function ArticleEditor({ article }: { article?: KbArticle }): React.JSX.Element {
  const router = useRouter();
  const canPublish = useHasRole('company_admin', 'super_admin');
  const editing = article !== undefined;

  const [form, setForm] = React.useState({
    title: article?.title ?? '',
    summary: article?.summary ?? '',
    body_markdown: article?.body_markdown ?? '',
    category_id: article ? String(article.category.id) : '',
    visibility: article?.visibility ?? 'public',
    tags: article?.tags.join(', ') ?? '',
  });
  const [tab, setTab] = React.useState<'write' | 'preview'>('write');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (form.title.trim().length < 5) next.title = 'ຫົວຂໍ້ຕ້ອງຍາວຢ່າງໜ້ອຍ 5 ຕົວອັກສອນ';
    if (!form.category_id) next.category_id = 'ກະລຸນາເລືອກໝວດໝູ່';
    if (form.body_markdown.trim().length < 20) next.body_markdown = 'ເນື້ອຫາສັ້ນເກີນໄປ';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save(publish: boolean): Promise<void> {
    if (!validate()) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    toast.success(publish ? 'ເຜີຍແຜ່ບົດຄວາມແລ້ວ' : 'ບັນທຶກເປັນຮ່າງແລ້ວ');
    setSaving(false);
    router.push('/kb');
  }

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href="/kb" label="ກັບໄປຄັງຄວາມຮູ້" />
      <PageHeader
        title={editing ? 'ແກ້ໄຂບົດຄວາມ' : 'ຂຽນບົດຄວາມໃໝ່'}
        description="ຂຽນເປັນຂັ້ນຕອນທີ່ຜູ້ໃຊ້ທົ່ວໄປເຮັດຕາມໄດ້ ຫຼີກລ້ຽງສັບເຕັກນິກ"
      />

      <div className="flex flex-col gap-4">
        <Card>
          <CardBody className="space-y-4">
            <Field label="ຫົວຂໍ້" htmlFor="title" required error={errors.title}>
              <Input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                maxLength={255}
                placeholder="ເຊັ່ນ ວິທີແກ້ເມື່ອເຂົ້າ Wi-Fi ບໍ່ໄດ້"
              />
            </Field>

            <Field
              label="ສະຫຼຸບຫຍໍ້"
              htmlFor="summary"
              hint="ສະແດງໃນລາຍການຄົ້ນຫາ ຄວນບອກໃຫ້ຮູ້ວ່າບົດຄວາມນີ້ແກ້ອາການແບບໃດ"
            >
              <Input
                value={form.summary}
                onChange={(e) => set('summary', e.target.value)}
                maxLength={500}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ໝວດໝູ່" htmlFor="category_id" required error={errors.category_id}>
                <Select
                  value={form.category_id}
                  onChange={(e) => set('category_id', e.target.value)}
                >
                  <option value="">— ເລືອກໝວດໝູ່ —</option>
                  {KB_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_th}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="ໃຜເບິ່ງເຫັນໄດ້"
                htmlFor="visibility"
                hint="ເນື້ອຫາທີ່ບອກວິທີເຂົ້າເຖິງລະບົບພາຍໃນ ບໍ່ຄວນເປັນສາທາລະນະ"
              >
                <Select
                  value={form.visibility}
                  onChange={(e) => set('visibility', e.target.value as typeof form.visibility)}
                >
                  <option value="public">ທຸກຄົນເຫັນ</option>
                  <option value="internal">ພາຍໃນອົງກອນ</option>
                  <option value="agent_only">ສະເພາະເຈົ້າໜ້າທີ່</option>
                </Select>
              </Field>
            </div>

            <Field label="ປ້າຍກຳກັບ" htmlFor="tags" hint="ຄັ່ນດ້ວຍເຄື່ອງໝາຍຈຸດ ເຊັ່ນ wifi, ເຄືອຂ່າຍ">
              <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ເນື້ອຫາ</CardTitle>
          </CardHeader>
          <div className="px-4 lg:px-5">
            <Tabs
              tabs={[
                { key: 'write' as const, label: 'ຂຽນ' },
                { key: 'preview' as const, label: 'ເບິ່ງຕົວຢ່າງ' },
              ]}
              value={tab}
              onChange={setTab}
              label="ໂໝດແກ້ໄຂເນື້ອຫາ"
            />
          </div>
          <CardBody>
            {tab === 'write' ? (
              <Field label="ເນື້ອຫາ (Markdown)" htmlFor="body_markdown" required error={errors.body_markdown}>
                <Textarea
                  rows={16}
                  value={form.body_markdown}
                  onChange={(e) => set('body_markdown', e.target.value)}
                  className="font-mono text-body-sm"
                  placeholder={'## ຂັ້ນຕອນ\n\n1. ...\n2. ...'}
                />
              </Field>
            ) : form.body_markdown.trim() ? (
              <div className="kb-body text-body text-ink">
                <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                  {form.body_markdown}
                </Markdown>
              </div>
            ) : (
              <p className="py-8 text-center text-body-sm text-ink-3">ຍັງບໍ່ມີເນື້ອຫາໃຫ້ເບິ່ງຕົວຢ່າງ</p>
            )}
          </CardBody>
          <CardFooter className="justify-end">
            <Button variant="secondary" loading={saving} onClick={() => void save(false)}>
              <Save className="h-4 w-4" aria-hidden="true" />
              ບັນທຶກເປັນຮ່າງ
            </Button>
            {canPublish ? (
              <Button loading={saving} onClick={() => void save(true)}>
                <Send className="h-4 w-4" aria-hidden="true" />
                ເຜີຍແຜ່
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-caption text-ink-3">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                ຜູ້ດູແລລະດັບບໍລິສັດເປັນຜູ້ເຜີຍແຜ່
              </span>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
