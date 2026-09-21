'use client';

import { AlertTriangle, Link2, RefreshCw, Sparkles, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { toastApiError } from '@/components/tickets/owner-actions';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import {
  PROJECT_CODE_PATTERN,
  useChatwootInboxes,
  useCreateChatwootInbox,
  type SupportProject,
  type SupportProjectLocale,
} from '@/lib/queries/support-projects';
import type { Company, SupportTeam, TicketCategory } from '@/lib/types';

/**
 * เพิ่ม/แก้โครงการที่รับซัพพอร์ต
 *
 * โครงการหนึ่งอัน = เว็บหนึ่งเว็บของบริษัทในเครือ ที่เอา widget ไปฝัง
 * สิ่งที่คนตั้งค่าต้องตัดสินใจจริง ๆ มีสองเรื่อง คือ "เว็บไหน" กับ "แชทที่เข้ามา
 * ควรตกอยู่กับทีมไหนและหมวดอะไร" ที่เหลือเป็นค่าเริ่มต้นที่เดาให้ได้
 *
 * ⚠️ รหัสโครงการแก้ไม่ได้หลังสร้าง
 *    มันถูกพิมพ์อยู่ใน <script data-project="..."> ของทุกหน้าในเว็บที่ฝังไปแล้ว
 *    การเปลี่ยนรหัสจึงเท่ากับปิดปุ่มแชทของเว็บนั้นทั้งเว็บโดยไม่มีอะไรเตือน
 */

export interface SupportProjectFormValues {
  code: string;
  name: string;
  website_url: string;
  /** null = โครงการส่วนกลาง ใช้ได้ทุกบริษัท */
  company_id: number | null;
  default_category_id: number | null;
  team_id: number | null;
  /*
   * เก็บสองช่องของ Chatwoot เป็นข้อความ ไม่ใช่ตัวเลข/null
   * เพราะ "ยังไม่ได้กรอก" กับ "กรอกเลข 0" ต้องแยกออกจากกัน และช่องที่ผู้ใช้
   * ลบค่าทิ้งกลางคันต้องยังพิมพ์ต่อได้ ไม่ใช่เด้งกลับเป็น 0 ทุกครั้งที่ลบ
   */
  chatwoot_inbox_id: string;
  chatwoot_website_token: string;
  locale: SupportProjectLocale;
  is_active: boolean;
}

const LOCALE_LABEL: Record<SupportProjectLocale, string> = {
  lo: 'ລາວ',
  th: 'ໄທ',
  en: 'ອັງກິດ',
};

function toInitialValues(project: SupportProject | null): SupportProjectFormValues {
  if (!project) {
    return {
      code: '',
      name: '',
      website_url: '',
      company_id: null,
      default_category_id: null,
      team_id: null,
      chatwoot_inbox_id: '',
      chatwoot_website_token: '',
      locale: 'lo',
      is_active: true,
    };
  }
  return {
    code: project.code,
    name: project.name,
    website_url: project.website_url ?? '',
    company_id: project.company?.id ?? null,
    default_category_id: project.default_category?.id ?? null,
    team_id: project.team?.id ?? null,
    chatwoot_inbox_id: project.chatwoot.inbox_id === null ? '' : String(project.chatwoot.inbox_id),
    chatwoot_website_token: project.chatwoot.website_token ?? '',
    locale: project.locale,
    is_active: project.is_active,
  };
}

/**
 * หมวดหมู่ปลายกิ่งเท่านั้น
 *
 * หมวดที่มีลูกเป็นแค่หัวข้อจัดกลุ่ม เลือกไปแล้ว ticket จะถูกจัดไว้กลางทาง
 * และกฎ SLA ที่ผูกกับหมวดปลายกิ่งจะไม่ถูกใช้ — ตัดออกตั้งแต่ตัวเลือก
 * ดีกว่าให้เลือกได้แล้วค่อยมางงทีหลังว่าทำไมเวลาตอบรับไม่ตรงที่ตั้งไว้
 */
function leafCategories(categories: TicketCategory[]): { id: number; label: string }[] {
  const hasChild = new Set(categories.map((c) => c.parent_id).filter((id): id is number => id !== null));
  const nameById = new Map(categories.map((c) => [c.id, c.name_th]));

  return categories
    .filter((c) => c.is_active && !hasChild.has(c.id))
    .map((c) => {
      const parent = c.parent_id === null ? null : nameById.get(c.parent_id);
      return { id: c.id, label: parent ? `${parent} › ${c.name_th}` : c.name_th };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'lo'));
}

export function SupportProjectFormDialog({
  open,
  project,
  companies,
  categories,
  teams,
  canCreateCentral,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** null = สร้างใหม่ */
  project: SupportProject | null;
  companies: Company[];
  categories: TicketCategory[];
  teams: SupportTeam[];
  /**
   * ซ่อนตัวเลือก "ສ່ວນກາງ" จากคนที่สร้างไม่ได้ — เป็นเรื่องประสบการณ์ผู้ใช้
   * ไม่ใช่มาตรการความปลอดภัย backend ตัดสินซ้ำทุกคำขออยู่แล้ว
   */
  canCreateCentral: boolean;
  onClose: () => void;
  onSubmit: (values: SupportProjectFormValues) => Promise<void>;
}): React.JSX.Element | null {
  const [values, setValues] = React.useState<SupportProjectFormValues>(() =>
    toInitialValues(project),
  );
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  /** ดึง inbox จาก Chatwoot เฉพาะเมื่อผู้ใช้กดขอเท่านั้น (ดูหมายเหตุใน useChatwootInboxes) */
  const [wantInboxes, setWantInboxes] = React.useState(false);
  const firstFieldRef = React.useRef<HTMLInputElement | null>(null);

  const editing = project !== null;
  const projectId = project?.id ?? null;
  const inboxes = useChatwootInboxes(open && wantInboxes);

  React.useEffect(() => {
    if (!open) return;
    setValues(toInitialValues(project));
    setFieldErrors({});
    setWantInboxes(false);
    window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  const set = <K extends keyof SupportProjectFormValues>(
    key: K,
    value: SupportProjectFormValues[K],
  ): void => {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  const categoryOptions = leafCategories(categories);
  /* ทีมที่ปิดไปแล้วยังต้องอยู่ในรายการถ้าโครงการนี้ผูกไว้ มิฉะนั้นการกดบันทึกแค่แก้ชื่อจะถอดทีมทิ้ง */
  const teamOptions = teams.filter((t) => t.is_active || t.id === values.team_id);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    const code = values.code.trim();
    if (!editing && !PROJECT_CODE_PATTERN.test(code)) {
      errors.code = 'ໃຊ້ A–Z, 0–9 ແລະ _ ຈຳນວນ 2–40 ຕົວ';
    }
    if (values.name.trim().length === 0) errors.name = 'ກະລຸນາຕັ້ງຊື່ໂຄງການ';
    if (values.chatwoot_inbox_id.trim() !== '' && !/^\d+$/.test(values.chatwoot_inbox_id.trim())) {
      errors.chatwoot_inbox_id = 'ເລກ inbox ຕ້ອງເປັນຕົວເລກເທົ່ານັ້ນ';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    try {
      await onSubmit({ ...values, code });
      onClose();
    } catch (err) {
      setFieldErrors(toastApiError(err, 'ບັນທຶກໂຄງການບໍ່ສຳເລັດ') ?? {});
    } finally {
      setSaving(false);
    }
  };

  /**
   * เซิร์ฟเวอร์สร้าง inbox ให้แล้ว — เติมค่าที่ได้กลับลงฟอร์ม
   *
   * การผูกเกิดขึ้นแล้วจริงที่เซิร์ฟเวอร์ ไม่ได้รอกดบันทึก ค่าสองช่องนี้เติมไว้
   * เพื่อให้สิ่งที่เห็นบนหน้าจอตรงกับของจริง ไม่ใช่เพื่อส่งกลับไปอีกรอบ
   */
  const onInboxCreated = (updated: SupportProject): void => {
    if (updated.chatwoot.inbox_id === null) return;
    pickInbox(updated.chatwoot.inbox_id, updated.chatwoot.website_token);
  };

  /** เลือก inbox จากรายการ — เติมทั้งเลขและ token ให้ครบคู่ ค่าที่มีแค่ครึ่งเดียวใช้ไม่ได้ */
  const pickInbox = (inboxId: number, token: string | null): void => {
    setValues((v) => ({
      ...v,
      chatwoot_inbox_id: String(inboxId),
      chatwoot_website_token: token ?? v.chatwoot_website_token,
    }));
    setFieldErrors((e) => {
      const next = { ...e };
      delete next.chatwoot_inbox_id;
      delete next.chatwoot_website_token;
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-form-title"
        className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-lg border border-hair bg-surface shadow-dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-hair px-5 py-4">
          <h2 id="project-form-title" className="text-h3 font-semibold text-ink">
            {editing ? `ແກ້ໄຂ ${project.name}` : 'ເພີ່ມໂຄງການໃໝ່'}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving} type="button">
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">ປິດ</span>
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <Field
              label="ລະຫັດໂຄງການ"
              htmlFor="project-code"
              required
              error={fieldErrors.code}
              hint={
                editing
                  ? 'ແກ້ບໍ່ໄດ້ຫຼັງສ້າງແລ້ວ — ລະຫັດນີ້ຖືກຝັງຢູ່ໃນທຸກໜ້າຂອງເວັບທີ່ຕິດຕັ້ງໄປແລ້ວ'
                  : 'A–Z, 0–9 ແລະ _ ເທົ່ານັ້ນ ເຊັ່ນ ILP — ນຳໄປໃສ່ໃນ data-project ຂອງສະຄຣິບ'
              }
            >
              <Input
                ref={firstFieldRef}
                value={values.code}
                /* บังคับตัวพิมพ์ใหญ่ทันทีที่พิมพ์ ผู้ใช้จึงไม่ต้องจำว่าต้องกด Caps */
                onChange={(e) => set('code', e.target.value.toUpperCase())}
                disabled={saving || editing}
                readOnly={editing}
                placeholder="ILP"
                className="font-mono"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </Field>

            <Field label="ຊື່ໂຄງການ" htmlFor="project-name" required error={fieldErrors.name}>
              <Input
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
                disabled={saving}
                placeholder="ລະບົບ ILP"
              />
            </Field>

            <Field
              label="ທີ່ຢູ່ເວັບ"
              htmlFor="project-website"
              error={fieldErrors.website_url}
              hint="ໃຊ້ອ້າງອີງວ່າ widget ນີ້ຕິດຢູ່ເວັບໃດ ບໍ່ໄດ້ໃຊ້ກວດສິດ"
            >
              <Input
                type="url"
                inputMode="url"
                value={values.website_url}
                onChange={(e) => set('website_url', e.target.value)}
                disabled={saving}
                placeholder="https://ilp.aidclaos.com"
                spellCheck={false}
              />
            </Field>

            <Field
              label="ບໍລິສັດເຈົ້າຂອງ"
              htmlFor="project-company"
              error={fieldErrors.company_id}
              hint="ໂຄງການສ່ວນກາງໃຊ້ຮ່ວມທຸກບໍລິສັດໃນກຸ່ມ"
            >
              <Select
                value={values.company_id === null ? '' : String(values.company_id)}
                onChange={(e) =>
                  set('company_id', e.target.value === '' ? null : Number(e.target.value))
                }
                disabled={saving}
              >
                {(canCreateCentral || values.company_id === null) && (
                  <option value="">ສ່ວນກາງ (ທຸກບໍລິສັດ)</option>
                )}
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="ໝວດໝູ່ຕັ້ງຕົ້ນ"
              htmlFor="project-category"
              error={fieldErrors.default_category_id}
              hint="ໃຊ້ຕອນປ່ຽນແຊັດເປັນ ticket — ເລືອກໄດ້ສະເພາະໝວດປາຍກິ່ງ"
            >
              <Select
                value={values.default_category_id === null ? '' : String(values.default_category_id)}
                onChange={(e) =>
                  set('default_category_id', e.target.value === '' ? null : Number(e.target.value))
                }
                disabled={saving}
              >
                <option value="">ບໍ່ກຳນົດ</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="ທີມທີ່ຮັບຜິດຊອບ"
              htmlFor="project-team"
              error={fieldErrors.team_id}
              hint="ແຊັດຈາກເວັບນີ້ຈະໄປຢູ່ໃນຂອບເຂດຂອງທີມນີ້"
            >
              <Select
                value={values.team_id === null ? '' : String(values.team_id)}
                onChange={(e) =>
                  set('team_id', e.target.value === '' ? null : Number(e.target.value))
                }
                disabled={saving}
              >
                <option value="">ບໍ່ກຳນົດ</option>
                {teamOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_active ? '' : ' (ປິດແລ້ວ)'}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="ພາສາຂອງໜ້າຕ່າງແຊັດ"
              htmlFor="project-locale"
              error={fieldErrors.locale}
              hint="ພາສາຂອງປຸ່ມ ແລະ ຂໍ້ຄວາມໃນ widget ທີ່ຜູ້ເຂົ້າຊົມເຫັນ"
            >
              <Select
                value={values.locale}
                onChange={(e) => set('locale', e.target.value as SupportProjectLocale)}
                disabled={saving}
              >
                {(['lo', 'th', 'en'] as const).map((code) => (
                  <option key={code} value={code}>
                    {LOCALE_LABEL[code]}
                  </option>
                ))}
              </Select>
            </Field>

            <ChatwootLink
              inboxIdValue={values.chatwoot_inbox_id}
              tokenValue={values.chatwoot_website_token}
              onChangeInboxId={(value) => set('chatwoot_inbox_id', value)}
              onChangeToken={(value) => set('chatwoot_website_token', value)}
              onPick={pickInbox}
              /* สร้าง inbox ให้อัตโนมัติได้เฉพาะโครงการที่บันทึกแล้ว — ของใหม่ยังไม่มี id ให้อ้าง */
              projectId={projectId}
              websiteUrl={values.website_url}
              onCreated={onInboxCreated}
              disabled={saving}
              inboxIdError={fieldErrors.chatwoot_inbox_id}
              tokenError={fieldErrors.chatwoot_website_token}
              currentProjectCode={project?.code ?? null}
              requested={wantInboxes}
              onRequest={() => setWantInboxes(true)}
              onReload={() => void inboxes.refetch()}
              loading={inboxes.isFetching}
              failed={inboxes.isError}
              failedMessage={inboxes.error?.message}
              inboxes={inboxes.data ?? []}
            />

            {/* webhook เป็นของเสริม จึงพับเก็บไว้ ไม่แย่งความสนใจจากช่องที่ต้องกรอกจริง */}
            {editing && <WebhookHelp hint={project.webhook_url_hint ?? null} />}

            {editing && (
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-control"
                  checked={values.is_active}
                  onChange={(e) => set('is_active', e.target.checked)}
                  disabled={saving}
                />
                <span>
                  <span className="block text-body-sm text-ink">ເປີດໃຊ້ງານໂຄງການນີ້</span>
                  <span className="block text-caption text-ink-3">
                    ປິດແລ້ວ widget ໃນເວັບນັ້ນຈະບໍ່ສະແດງປຸ່ມແຊັດອີກ ແຕ່ແຊັດເກົ່າຍັງຢູ່ຄືເກົ່າ
                  </span>
                </span>
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-hair px-5 py-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              ຍົກເລີກ
            </Button>
            <Button type="submit" loading={saving}>
              ບັນທຶກ
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * วิธีตั้ง webhook ใน Chatwoot
 *
 * ทั้งก้อนนี้เป็นของเสริมล้วน ๆ — ระบบดึงข้อมูลเป็นรอบทุก 10 วินาทีอยู่แล้ว
 * webhook แค่ย่นเวลาจาก "ไม่เกิน 10 วินาที" เหลือ "แทบจะทันที" เท่านั้น
 * เขียนบอกไว้ชัด ๆ เพราะถ้าไม่บอก จะมีคนคิดว่าระบบยังไม่เสร็จและไม่กล้าเปิดใช้งาน
 *
 * ⚠️ ไม่มีปุ่มคัดลอกใน URL ก้อนนี้โดยตั้งใจ
 *    ข้อความ ?token=<...> เป็นที่ให้ไปแทนค่าจริง ไม่ใช่ค่าที่ใช้ได้ — เคยมีคน
 *    คัดลอกบล็อกตัวอย่างทั้งก้อนไปวางในระบบจริงพร้อมข้อความแทนที่มาแล้ว
 *    ปุ่มคัดลอกจะทำให้เรื่องนั้นเกิดง่ายขึ้นอีก
 */
function WebhookHelp({ hint }: { hint: string | null }): React.JSX.Element {
  const [origin, setOrigin] = React.useState('');
  React.useEffect(() => setOrigin(window.location.origin), []);

  return (
    <details className="rounded border border-hair">
      <summary className="min-h-tap cursor-pointer list-none px-3 py-2 text-body-sm font-semibold text-ink">
        ຕັ້ງຄ່າ webhook ໃນ Chatwoot (ເລັ່ງຄວາມໄວ)
      </summary>
      <div className="space-y-2 border-t border-hair px-3 py-3">
        <p className="text-caption text-ink-2">
          ບໍ່ຕັ້ງກໍ່ໃຊ້ງານໄດ້ປົກກະຕິ — ລະບົບດຶງຂໍ້ມູນເອງທຸກ 10 ວິນາທີຢູ່ແລ້ວ
          webhook ພຽງເຮັດໃຫ້ຂໍ້ຄວາມເຂົ້າມາໄວຂຶ້ນເທົ່ານັ້ນ
        </p>

        {hint === null ? (
          <p className="text-caption text-ink-3">ຍັງບໍ່ໄດ້ເປີດໃຊ້ webhook ໃນ server</p>
        ) : (
          <>
            <p className="text-caption text-ink-3">
              ໃສ່ໃນ Chatwoot › Settings › Integrations › Webhooks
            </p>
            <code className="block overflow-x-auto whitespace-pre rounded bg-subtle px-2 py-1.5 text-caption text-ink-2">
              {(origin || 'https://<helpdesk>') + hint}?token=&lt;ຄ່າທີ່ຕັ້ງໃນ server&gt;
            </code>
            <p className="text-caption text-sla-risk">
              ປ່ຽນ &lt;ຄ່າທີ່ຕັ້ງໃນ server&gt; ເປັນຄ່າ CHATWOOT_WEBHOOK_TOKEN ຂອງ server ກ່ອນນຳໄປໃຊ້
              — ຄ່ານັ້ນເປັນຄ່າລັບ ຈຶ່ງບໍ່ສະແດງໃນໜ້ານີ້
            </p>
            <p className="text-caption text-ink-2">
              ຕິກ 3 ເຫດການ: <code className="font-mono">conversation_created</code>,{' '}
              <code className="font-mono">message_created</code>,{' '}
              <code className="font-mono">conversation_status_changed</code>
            </p>
          </>
        )}
      </div>
    </details>
  );
}

/**
 * ให้ระบบสร้าง inbox ใน Chatwoot ให้เอง
 *
 * มีไว้สำหรับเว็บใหม่ที่ยังไม่มี inbox อยู่เลย ส่วนเว็บที่ทีม Chatwoot ตั้งไว้ให้แล้ว
 * ยังใช้ "ດຶງຈາກ Chatwoot" เลือกจากรายการเหมือนเดิม — สองทางนี้อยู่คู่กัน ไม่แทนกัน
 *
 * ⚠️ ปุ่มนี้เขียนลงระบบของคนอื่น ไม่ใช่ฐานข้อมูลของ Helpdesk
 *    Chatwoot เครื่องเดียวถูกใช้ร่วมกันทุกทีม และ inbox ที่สร้างแล้วลบได้เฉพาะ
 *    ในหน้าจอของ Chatwoot โดยผู้ดูแลของที่นั่น กดผิดหนึ่งครั้งจึงกลายเป็นขยะ
 *    ที่คนอื่นต้องไปตามเก็บ — ขั้นยืนยันตรงนี้ไม่ใช่พิธีกรรม และห้ามตัดออก
 *
 * ยืนยันด้วยการกดสองจังหวะในที่เดียวกัน ไม่ใช่ window.confirm — ข้อความเตือน
 * ต้องบอกให้ครบว่าเกิดอะไรขึ้นและย้อนกลับยังไง ซึ่งยาวเกินกว่ากล่องของเบราว์เซอร์
 */
function AutoCreateInbox({
  projectId,
  websiteUrl,
  disabled,
  onCreated,
}: {
  projectId: number;
  websiteUrl: string;
  disabled: boolean;
  onCreated: (project: SupportProject) => void;
}): React.JSX.Element {
  const create = useCreateChatwootInbox();
  const [confirming, setConfirming] = React.useState(false);

  /* Chatwoot บังคับให้ inbox แบบ Website มี URL — ไม่มีค่านี้ยิงไปก็ถูกปฏิเสธ */
  const ready = websiteUrl.trim() !== '';

  const run = async (): Promise<void> => {
    try {
      const updated = await create.mutateAsync(projectId);
      onCreated(updated);
      setConfirming(false);
      toast.success(`ສ້າງ inbox ໃນ Chatwoot ໃຫ້ ${updated.code} ແລ້ວ`);
    } catch (err) {
      toastApiError(err, 'ສ້າງ inbox ໃນ Chatwoot ບໍ່ສຳເລັດ');
    }
  };

  return (
    <div className="mb-3 rounded border border-hair bg-subtle px-3 py-3">
      <p className="text-body-sm font-semibold text-ink">ຍັງບໍ່ມີ inbox ໃນ Chatwoot ເທື່ອບໍ?</p>
      <p className="mt-0.5 text-caption text-ink-2">
        ລະບົບສ້າງ inbox ແບບ Website ໃໝ່ໃນ Chatwoot ໃຫ້ ແລ້ວຜູກກັບໂຄງການນີ້ໃຫ້ເລີຍ
        ບໍ່ຕ້ອງເຂົ້າໄປເຮັດເອງໃນ Chatwoot
      </p>

      {!ready && (
        <p className="mt-1.5 flex items-start gap-1.5 text-caption text-sla-risk">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden="true" />
          ຕ້ອງກອກ «ທີ່ຢູ່ເວັບ» ດ້ານເທິງກ່ອນ — Chatwoot ໃຊ້ຄ່ານັ້ນຕອນສ້າງ inbox
        </p>
      )}

      {confirming ? (
        <div className="mt-2 rounded border border-sla-risk/40 bg-surface px-3 py-2.5">
          <p className="text-caption text-ink">
            ກົດ «ຢືນຢັນ» ແລ້ວລະບົບຈະ <b>ສ້າງ inbox ໃໝ່ຂຶ້ນຈິງໃນ Chatwoot</b> ຂອງອົງກອນ
            ເຊິ່ງທຸກທີມໃຊ້ຮ່ວມກັນ — ຍົກເລີກຈາກໜ້ານີ້ບໍ່ໄດ້ ຖ້າສ້າງຜິດ ຕ້ອງໃຫ້ຜູ້ດູແລ
            ເຂົ້າໄປລຶບໃນ Chatwoot ເອງ
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" loading={create.isPending} onClick={() => void run()}>
              ຢືນຢັນ ສ້າງ inbox ໃນ Chatwoot
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={create.isPending}
              onClick={() => setConfirming(false)}
            >
              ຍົກເລີກ
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2"
          disabled={disabled || !ready || create.isPending}
          onClick={() => setConfirming(true)}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          ສ້າງ Inbox ໃນ Chatwoot ໃຫ້ອັດຕະໂນມັດ
        </Button>
      )}
    </div>
  );
}

/**
 * ผูกโครงการกับ inbox ของ Chatwoot
 *
 * ปกติผู้ตั้งค่าจะกด "ດຶງຈາກ Chatwoot" แล้วเลือกจากรายการ เพราะการคัดลอกเลข
 * inbox กับ token ยาว ๆ ข้ามระบบมาเองผิดง่ายมาก และผิดแล้วอาการคือ "ปุ่มแชท
 * ไม่ขึ้น" เฉย ๆ ซึ่งหาสาเหตุยาก
 *
 * แต่ช่องกรอกเองยังต้องอยู่ เพราะเซิร์ฟเวอร์ Chatwoot ล่มหรือ token ของ API
 * หมดอายุได้ และตอนนั้นต้องยังตั้งค่าโครงการใหม่ได้อยู่
 */
function ChatwootLink({
  inboxIdValue,
  tokenValue,
  onChangeInboxId,
  onChangeToken,
  onPick,
  projectId,
  websiteUrl,
  onCreated,
  disabled,
  inboxIdError,
  tokenError,
  currentProjectCode,
  requested,
  onRequest,
  onReload,
  loading,
  failed,
  failedMessage,
  inboxes,
}: {
  inboxIdValue: string;
  tokenValue: string;
  onChangeInboxId: (value: string) => void;
  onChangeToken: (value: string) => void;
  onPick: (inboxId: number, token: string | null) => void;
  /** null = โครงการยังไม่ถูกบันทึก จึงยังสร้าง inbox ให้ไม่ได้ */
  projectId: number | null;
  websiteUrl: string;
  onCreated: (project: SupportProject) => void;
  disabled: boolean;
  inboxIdError?: string | undefined;
  tokenError?: string | undefined;
  currentProjectCode: string | null;
  requested: boolean;
  onRequest: () => void;
  onReload: () => void;
  loading: boolean;
  failed: boolean;
  failedMessage?: string | undefined;
  inboxes: {
    id: number;
    name: string;
    channel_type: string;
    website_url: string | null;
    website_token: string | null;
    linked_project_code: string | null;
  }[];
}): React.JSX.Element {
  return (
    <fieldset className="rounded border border-hair p-3">
      <legend className="px-1 text-label text-ink">ເຊື່ອມກັບ Chatwoot</legend>
      <p className="mb-2 text-caption text-ink-3">
        ໜຶ່ງໂຄງການຜູກກັບໜຶ່ງ inbox ແບບ Website — ຍັງບໍ່ເຊື່ອມ widget ຈະຍັງບໍ່ເຮັດວຽກ
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || loading}
          onClick={requested ? onReload : onRequest}
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
          {requested ? 'ດຶງໃໝ່' : 'ດຶງຈາກ Chatwoot'}
        </Button>
        {loading && <span className="text-caption text-ink-3">ກຳລັງຕິດຕໍ່ Chatwoot...</span>}
      </div>

      {/*
        ทางเลือกที่สอง สำหรับเว็บใหม่ที่ยังไม่มี inbox ใน Chatwoot เลย
        โผล่เฉพาะตอนที่ยังไม่ผูก — ผูกแล้วปุ่มนี้ไม่มีความหมายอีกต่อไป มีแต่จะชวนกดผิด
      */}
      {projectId !== null && inboxIdValue.trim() === '' && (
        <AutoCreateInbox
          projectId={projectId}
          websiteUrl={websiteUrl}
          disabled={disabled}
          onCreated={onCreated}
        />
      )}

      {requested && failed && (
        <p role="alert" className="mb-3 rounded bg-sla-risk-bg px-3 py-2 text-caption text-ink-2">
          {failedMessage ?? 'ຕິດຕໍ່ Chatwoot ບໍ່ໄດ້'} — ກອກເລກ inbox ແລະ token ດ້ວຍມືໄດ້ດ້ານລຸ່ມ
        </p>
      )}

      {requested && !failed && !loading && inboxes.length === 0 && (
        <p className="mb-3 text-caption text-ink-3">
          ບໍ່ພົບ inbox ແບບ Website ໃນ Chatwoot — ສ້າງ inbox ກ່ອນແລ້ວກົດດຶງໃໝ່
        </p>
      )}

      {requested && !failed && inboxes.length > 0 && (
        <ul className="mb-3 max-h-48 space-y-1 overflow-y-auto rounded border border-hair p-1">
          {inboxes.map((inbox) => {
            /* inbox ที่โครงการอื่นจองไปแล้ว เลือกซ้ำไม่ได้ — แชทจะปนกันสองโครงการ */
            const takenBy =
              inbox.linked_project_code && inbox.linked_project_code !== currentProjectCode
                ? inbox.linked_project_code
                : null;
            const selected = inboxIdValue === String(inbox.id);

            return (
              <li key={inbox.id}>
                <button
                  type="button"
                  disabled={disabled || takenBy !== null}
                  onClick={() => onPick(inbox.id, inbox.website_token)}
                  aria-current={selected ? 'true' : undefined}
                  className={cn(
                    'flex min-h-tap w-full items-center gap-2 rounded px-2 py-1 text-left',
                    takenBy !== null
                      ? 'cursor-not-allowed bg-subtle text-ink-3'
                      : selected
                        ? 'bg-primary-subtle'
                        : 'hover:bg-subtle',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm text-ink">{inbox.name}</span>
                    <span className="block truncate text-caption text-ink-3">
                      #{inbox.id} · {inbox.channel_type}
                      {inbox.website_url ? ` · ${inbox.website_url}` : ''}
                    </span>
                  </span>
                  {takenBy !== null ? (
                    <span className="flex-none text-caption text-ink-3">ຜູກກັບ {takenBy} ແລ້ວ</span>
                  ) : selected ? (
                    <Link2 className="h-4 w-4 flex-none text-primary" aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-3">
        <Field label="ເລກ inbox" htmlFor="project-inbox-id" error={inboxIdError}>
          <Input
            inputMode="numeric"
            value={inboxIdValue}
            onChange={(e) => onChangeInboxId(e.target.value)}
            disabled={disabled}
            placeholder="2"
            className="font-mono"
            spellCheck={false}
          />
        </Field>

        <Field
          label="Website token"
          htmlFor="project-website-token"
          error={tokenError}
          /* บอกไว้ตรง ๆ ว่าไม่ใช่ความลับ มิฉะนั้นจะมีคนกังวลว่าทำไมโชว์บนหน้าจอ */
          hint="ຄ່ານີ້ເປີດເຜີຍຢູ່ແລ້ວໃນທຸກໜ້າເວັບທີ່ຝັງ widget ບໍ່ແມ່ນຄ່າລັບ"
        >
          <Input
            value={tokenValue}
            onChange={(e) => onChangeToken(e.target.value)}
            disabled={disabled}
            className="font-mono"
            spellCheck={false}
          />
        </Field>
      </div>
    </fieldset>
  );
}
