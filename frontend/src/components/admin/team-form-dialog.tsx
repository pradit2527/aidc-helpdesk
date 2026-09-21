'use client';

import { Search, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Company, SupportTeam, SupportTeamCandidate } from '@/lib/types';

/**
 * เพิ่ม/แก้ทีมสนับสนุน
 *
 * ไม่ได้ใช้ RecordFormDialog ตัวกลาง เพราะฟอร์มนี้มีสองช่องที่เป็นการเลือกคน
 * หลายคนพร้อมค้นหา ซึ่ง FieldSpec ของตัวกลางรองรับได้แค่ค่าเดี่ยว
 * (text / select / checkbox) การยัดเข้าไปจะทำให้ตัวกลางบวมเพื่อผู้ใช้รายเดียว
 *
 * ⚠️ lead_ids กับ member_ids ที่ส่งไปแทนที่สมาชิกทั้งชุด ไม่ใช่เพิ่มต่อท้าย
 *    ฟอร์มจึงต้องเริ่มจากสมาชิกชุดปัจจุบันเสมอตอนแก้ไข มิฉะนั้นการแก้แค่ชื่อทีม
 *    จะถอดทุกคนออกจากทีมไปด้วยโดยไม่มีอะไรเตือน
 */

export interface TeamFormValues {
  name: string;
  code: string;
  description: string;
  /** null = ทีมส่วนกลาง ใช้ได้ทุกบริษัท */
  company_id: number | null;
  lead_ids: number[];
  member_ids: number[];
  is_active: boolean;
}

function toInitialValues(team: SupportTeam | null): TeamFormValues {
  if (!team) {
    return {
      name: '',
      code: '',
      description: '',
      company_id: null,
      lead_ids: [],
      member_ids: [],
      is_active: true,
    };
  }
  return {
    name: team.name,
    code: team.code,
    description: team.description ?? '',
    company_id: team.company?.id ?? null,
    lead_ids: team.members.filter((m) => m.is_lead).map((m) => m.id),
    member_ids: team.members.map((m) => m.id),
    is_active: team.is_active,
  };
}

export function TeamFormDialog({
  open,
  team,
  companies,
  candidates,
  candidatesLoading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** null = สร้างใหม่ */
  team: SupportTeam | null;
  companies: Company[];
  candidates: SupportTeamCandidate[];
  candidatesLoading: boolean;
  onClose: () => void;
  onSubmit: (values: TeamFormValues) => Promise<void>;
}): React.JSX.Element | null {
  const [values, setValues] = React.useState<TeamFormValues>(() => toInitialValues(team));
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement | null>(null);

  const editing = team !== null;
  const teamId = team?.id ?? null;

  /*
   * เริ่มค่าใหม่ทุกครั้งที่เปิด หรือเมื่อสลับไปแก้ทีมอื่นโดยไม่ได้ปิดกล่องก่อน
   * ผูกกับ id ของทีมไม่ใช่ตัวอ็อบเจกต์ เพราะการรีเฟรชรายการสร้างอ็อบเจกต์ใหม่
   * ของทีมเดิม ซึ่งจะล้างสิ่งที่ผู้ใช้กำลังพิมพ์ค้างอยู่ทิ้งกลางคัน
   */
  React.useEffect(() => {
    if (!open) return;
    setValues(toInitialValues(team));
    setFieldErrors({});
    setFormError(null);
    window.setTimeout(() => nameRef.current?.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teamId]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  const set = <K extends keyof TeamFormValues>(key: K, value: TeamFormValues[K]): void => {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  /*
   * หัวหน้าทีมเป็นสมาชิกของทีมเสมอ
   *
   * ทีมที่มีหัวหน้าซึ่งไม่ได้อยู่ในทีมตัวเองเป็นสภาพที่อธิบายกับผู้ใช้ไม่ได้
   * และทำให้ backend ตอบ ASSIGNEE_NOT_IN_TEAM ตอนหัวหน้ามอบหมายงานให้ตัวเอง
   */
  const toggleLead = (id: number): void => {
    const nextLeads = values.lead_ids.includes(id)
      ? values.lead_ids.filter((x) => x !== id)
      : [...values.lead_ids, id];
    setValues((v) => ({
      ...v,
      lead_ids: nextLeads,
      member_ids: nextLeads.includes(id)
        ? v.member_ids.includes(id)
          ? v.member_ids
          : [...v.member_ids, id]
        : v.member_ids,
    }));
    setFieldErrors((e) => {
      if (!('lead_ids' in e)) return e;
      const next = { ...e };
      delete next.lead_ids;
      return next;
    });
  };

  const toggleMember = (id: number): void => {
    // ถอดหัวหน้าออกจากสมาชิกไม่ได้ ต้องปลดจากหัวหน้าก่อน
    if (values.lead_ids.includes(id)) return;
    set(
      'member_ids',
      values.member_ids.includes(id)
        ? values.member_ids.filter((x) => x !== id)
        : [...values.member_ids, id],
    );
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const errors: Record<string, string> = {};
    if (values.name.trim().length === 0) errors.name = 'ກະລຸນາຕັ້ງຊື່ທີມ';
    if (values.lead_ids.length === 0) errors.lead_ids = 'ຕ້ອງມີຫົວໜ້າທີມຢ່າງໜ້ອຍ 1 ຄົນ';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setFieldErrors(err.fields);
        setFormError(err.message);
      } else {
        setFormError(err instanceof Error ? err.message : 'ບັນທຶກບໍ່ສຳເລັດ');
      }
    } finally {
      setSaving(false);
    }
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
        aria-labelledby="team-form-title"
        className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-lg border border-hair bg-surface shadow-dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-hair px-5 py-4">
          <h2 id="team-form-title" className="text-h3 font-semibold text-ink">
            {editing ? `ແກ້ໄຂ ${team.name}` : 'ສ້າງທີມໃໝ່'}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving} type="button">
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">ປິດ</span>
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {formError && (
              <p
                className="rounded border border-sla-breach-solid bg-sla-breach-bg px-3 py-2 text-body-sm text-sla-breach"
                role="alert"
              >
                {formError}
              </p>
            )}

            <Field label="ຊື່ທີມ" htmlFor="team-name" required error={fieldErrors.name}>
              <Input
                ref={nameRef}
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
                disabled={saving}
                placeholder="ທີມໄອທີ AIDC-LOG"
              />
            </Field>

            <Field
              label="ລະຫັດທີມ"
              htmlFor="team-code"
              error={fieldErrors.code}
              hint="ວ່າງໄວ້ໄດ້ — ລະບົບຈະສ້າງໃຫ້ຈາກຊື່ທີມ"
            >
              <Input
                value={values.code}
                onChange={(e) => set('code', e.target.value)}
                disabled={saving}
              />
            </Field>

            <Field label="ຄຳອະທິບາຍ" htmlFor="team-description" error={fieldErrors.description}>
              <Textarea
                rows={2}
                value={values.description}
                onChange={(e) => set('description', e.target.value)}
                disabled={saving}
              />
            </Field>

            <Field
              label="ຂອບເຂດບໍລິສັດ"
              htmlFor="team-company"
              error={fieldErrors.company_id}
              hint="ທີມສ່ວນກາງຮັບວຽກໄດ້ທຸກບໍລິສັດໃນກຸ່ມ"
            >
              <Select
                value={values.company_id === null ? '' : String(values.company_id)}
                onChange={(e) => set('company_id', e.target.value === '' ? null : Number(e.target.value))}
                disabled={saving}
              >
                <option value="">ສ່ວນກາງ (ທຸກບໍລິສັດ)</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                  </option>
                ))}
              </Select>
            </Field>

            <PeoplePicker
              legend="ຫົວໜ້າທີມ"
              hint="ຫົວໜ້າທີມມອບໝາຍວຽກໃຫ້ສະມາຊິກໄດ້ ແລະ ນັບເປັນສະມາຊິກໂດຍອັດຕະໂນມັດ — ຕ້ອງມີບົດບາດ “ຫົວໜ້າທີມ Helpdesk” ກ່ອນ"
              required
              requireLeadRole
              candidates={candidates}
              loading={candidatesLoading}
              selectedIds={values.lead_ids}
              onToggle={toggleLead}
              disabled={saving}
              error={fieldErrors.lead_ids}
              idPrefix="lead"
            />

            <PeoplePicker
              legend="ສະມາຊິກທີມ"
              hint="ຜູ້ທີ່ຮັບມອບໝາຍວຽກຂອງທີມນີ້ໄດ້"
              candidates={candidates}
              loading={candidatesLoading}
              selectedIds={values.member_ids}
              lockedIds={values.lead_ids}
              lockedHint="ຫົວໜ້າທີມ"
              onToggle={toggleMember}
              disabled={saving}
              error={fieldErrors.member_ids}
              idPrefix="member"
            />

            {/* เปิด/ปิดใช้งานมีเฉพาะตอนแก้ของเดิม — ทีมที่เพิ่งสร้างเปิดใช้งานอยู่แล้ว */}
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
                  <span className="block text-body-sm text-ink">ເປີດໃຊ້ງານທີມນີ້</span>
                  <span className="block text-caption text-ink-3">
                    ທີມທີ່ປິດແລ້ວຈະບໍ່ປາກົດໃນລາຍຊື່ຜູ້ຮັບມອບໝາຍ ແຕ່ວຽກເກົ່າຍັງຢູ່ຄືເກົ່າ
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
 * เลือกคนหลายคนจากรายชื่อที่ยาว
 *
 * มีช่องค้นหาเพราะรายชื่อผู้ที่เพิ่มเข้าทีมได้คือพนักงานทั้งกลุ่มที่มีบทบาท
 * เจ้าหน้าที่ ซึ่งเลื่อนหาทีละคนไม่ไหว กรองฝั่งหน้าจอได้เพราะรายชื่อถูกดึงมา
 * ครั้งเดียวทั้งชุดอยู่แล้ว ไม่ได้แบ่งหน้า
 */
function PeoplePicker({
  legend,
  hint,
  required = false,
  candidates,
  loading,
  selectedIds,
  lockedIds = [],
  lockedHint,
  onToggle,
  disabled,
  error,
  idPrefix,
  requireLeadRole = false,
}: {
  legend: string;
  hint: string;
  required?: boolean;
  candidates: SupportTeamCandidate[];
  loading: boolean;
  selectedIds: number[];
  /** คนที่ติ๊กไว้แล้วและถอดจากตรงนี้ไม่ได้ เช่นหัวหน้าทีมในรายการสมาชิก */
  lockedIds?: number[];
  lockedHint?: string | undefined;
  onToggle: (id: number) => void;
  disabled: boolean;
  error?: string | undefined;
  idPrefix: string;
  /**
   * ตั้งเป็นหัวหน้าได้เฉพาะคนที่ถือบทบาทที่มอบหมายงานได้ (can_lead)
   * คนที่ไม่มีบทบาทหัวหน้ายังแสดงอยู่แต่ติ๊กไม่ได้ — ซ่อนไปเลยจะทำให้ผู้ดูแลสงสัยว่าคนนั้นหายไปไหน
   */
  requireLeadRole?: boolean;
}): React.JSX.Element {
  const [term, setTerm] = React.useState('');
  const searchId = `${idPrefix}-search`;
  const errorId = `${idPrefix}-error`;

  const needle = term.trim().toLowerCase();
  const shown = needle
    ? candidates.filter(
        (c) =>
          c.full_name.toLowerCase().includes(needle) ||
          c.username.toLowerCase().includes(needle) ||
          c.company.code.toLowerCase().includes(needle),
      )
    : candidates;

  return (
    <fieldset className="min-w-0" aria-describedby={error ? errorId : undefined}>
      <legend className="text-label text-ink">
        {legend}
        {required && (
          <>
            {' '}
            <span className="text-sla-breach" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(ຈຳເປັນ)</span>
          </>
        )}
      </legend>
      <p className="mb-1.5 text-caption text-ink-3">{hint}</p>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
          aria-hidden="true"
        />
        <Input
          id={searchId}
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          disabled={disabled}
          className="pl-9"
          placeholder="ຄົ້ນຫາຊື່ ຫຼື ບໍລິສັດ"
          aria-label={`ຄົ້ນຫາຜູ້ໃຊ້ສຳລັບ ${legend}`}
        />
      </div>

      <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded border border-hair p-1">
        {loading ? (
          <p className="px-2 py-3 text-body-sm text-ink-3">ກຳລັງໂຫຼດລາຍຊື່...</p>
        ) : shown.length === 0 ? (
          <p className="px-2 py-3 text-body-sm text-ink-3">
            {candidates.length === 0 ? 'ບໍ່ມີຜູ້ໃຊ້ໃຫ້ເລືອກ' : 'ບໍ່ພົບຊື່ທີ່ຄົ້ນຫາ'}
          </p>
        ) : (
          shown.map((person) => {
            const locked = lockedIds.includes(person.id);
            const checked = selectedIds.includes(person.id) || locked;
            // ถอดคนที่ติ๊กไว้แล้วออกได้เสมอ — ห้ามเฉพาะการเพิ่มคนที่ไม่มีบทบาทหัวหน้า
            const noLeadRole = requireLeadRole && person.can_lead === false && !checked;
            return (
              <label
                key={person.id}
                className={cn(
                  'flex min-h-tap items-center gap-3 rounded px-2',
                  locked || noLeadRole
                    ? 'cursor-not-allowed bg-subtle'
                    : 'cursor-pointer hover:bg-subtle',
                  noLeadRole && 'opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 flex-none rounded border-control"
                  checked={checked}
                  disabled={disabled || locked || noLeadRole}
                  onChange={() => onToggle(person.id)}
                />
                <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
                  {person.full_name}
                </span>
                <span className="flex-none text-caption text-ink-3">
                  {locked && lockedHint
                    ? lockedHint
                    : noLeadRole
                      ? 'ຍັງບໍ່ມີບົດບາດຫົວໜ້າທີມ'
                      : person.company.code}
                </span>
              </label>
            );
          })
        )}
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-caption text-sla-breach">
          {error}
        </p>
      )}
    </fieldset>
  );
}
