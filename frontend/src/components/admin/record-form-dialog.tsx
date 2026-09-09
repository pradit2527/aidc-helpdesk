'use client';

import { X } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ApiError } from '@/lib/api';

/**
 * ฟอร์มเพิ่ม/แก้ข้อมูลหลัก ใช้ร่วมกันทุกหน้าในส่วนผู้ดูแล
 *
 * มีตัวเดียวเพราะทุกหน้าทำเรื่องเดียวกัน — เปิดกล่อง กรอกไม่กี่ช่อง ส่ง แล้วรีเฟรชตาราง
 * ถ้าเขียนแยกหน้าละชุด สิบกว่าหน้าจะมีสิบกว่าวิธีจัดการ error กับสิบกว่าแบบของ
 * ปุ่ม "ກຳລັງບັນທຶກ..." ซึ่งไม่มีทางเหมือนกันได้จริง
 *
 * ⚠️ ข้อผิดพลาดรายช่องจาก backend ต้องกลับไปอยู่ที่ช่องนั้น ไม่ใช่แค่ toast
 *    ApiError.fields ถูกแมปมาให้แล้วจาก details ของซองมาตรฐาน — ผู้ใช้ที่กรอก
 *    รหัสผิดรูปแบบต้องเห็นว่า "รหัส" ผิด ไม่ใช่เห็นข้อความลอย ๆ แล้วเดาเอง
 */

export type FieldValue = string | number | boolean | null;

export type FieldSpec =
  | {
      kind: 'text' | 'textarea' | 'number' | 'date' | 'time';
      name: string;
      label: string;
      required?: boolean;
      hint?: string;
      placeholder?: string;
      /** ปิดไว้ตอนแก้ไข — เช่น code ที่แก้ไม่ได้หลังสร้าง */
      lockedOnEdit?: boolean;
    }
  | {
      kind: 'select';
      name: string;
      label: string;
      options: readonly { value: string; label: string }[];
      required?: boolean;
      hint?: string;
      lockedOnEdit?: boolean;
    }
  | {
      kind: 'checkbox';
      name: string;
      label: string;
      hint?: string;
    };

interface RecordFormDialogProps {
  open: boolean;
  title: string;
  description?: string | undefined;
  fields: readonly FieldSpec[];
  initial: Record<string, FieldValue>;
  /** true = กำลังแก้ของเดิม ใช้ตัดสินว่าช่องที่ lockedOnEdit ต้องปิดไหม */
  editing?: boolean;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (values: Record<string, FieldValue>) => Promise<void>;
}

export function RecordFormDialog({
  open,
  title,
  description,
  fields,
  initial,
  editing = false,
  submitLabel = 'ບັນທຶກ',
  onClose,
  onSubmit,
}: RecordFormDialogProps): React.JSX.Element | null {
  const [values, setValues] = React.useState<Record<string, FieldValue>>(initial);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const firstFieldRef = React.useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  /*
   * รีเซ็ตค่าทุกครั้งที่เปิดใหม่
   *
   * ถ้าไม่รีเซ็ต การกด "ເພີ່ມ" หลังจากเพิ่งแก้แถวหนึ่งไป จะได้ฟอร์มที่ค้าง
   * ค่าของแถวเดิมอยู่ แล้วผู้ใช้กดบันทึกทับโดยไม่ทันสังเกต
   */
  React.useEffect(() => {
    if (open) {
      setValues(initial);
      setFieldErrors({});
      setFormError(null);
      // โฟกัสช่องแรกให้ผู้ใช้พิมพ์ได้ทันที ไม่ต้องคลิกหา
      window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    }
    // initial เป็น object ใหม่ทุก render ของผู้เรียก จึงผูกกับ open อย่างเดียว
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape ต้องปิดได้เสมอ — กล่องที่ปิดด้วยเมาส์อย่างเดียวใช้กับคีย์บอร์ดไม่ได้
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  const set = (name: string, value: FieldValue): void => {
    setValues((v) => ({ ...v, [name]: value }));
    // ล้าง error ของช่องนั้นทันทีที่แก้ ไม่ให้ค้างอยู่ทั้งที่แก้ไปแล้ว
    setFieldErrors((e) => {
      if (!(name in e)) return e;
      const next = { ...e };
      delete next[name];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    setFormError(null);
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
        aria-labelledby="record-form-title"
        className="flex max-h-[92vh] w-full max-w-xl flex-col border border-hairline bg-surface shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
          <div>
            <h2 id="record-form-title" className="text-h3 font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-1 text-caption text-ink-3">{description}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving} type="button">
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">ປິດ</span>
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {formError && (
              <p
                className="border border-sla-breach-solid bg-sla-breach-bg px-3 py-2 text-body-sm text-sla-breach"
                role="alert"
              >
                {formError}
              </p>
            )}

            {fields.map((spec, index) => {
              const id = `rf-${spec.name}`;
              const error = fieldErrors[spec.name];
              const locked = editing && 'lockedOnEdit' in spec && spec.lockedOnEdit === true;

              if (spec.kind === 'checkbox') {
                return (
                  <label key={spec.name} className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={values[spec.name] === true}
                      onChange={(e) => set(spec.name, e.target.checked)}
                      disabled={saving}
                    />
                    <span>
                      <span className="block text-body-sm text-ink">{spec.label}</span>
                      {spec.hint && (
                        <span className="block text-caption text-ink-3">{spec.hint}</span>
                      )}
                    </span>
                  </label>
                );
              }

              const common = {
                disabled: saving || locked,
                // ช่องที่ล็อกไว้ต้องบอกเหตุผล ไม่ใช่จาง ๆ เฉย ๆ ให้ผู้ใช้เดา
                ...(locked ? { title: 'ແກ້ໄຂພາຍຫຼັງສ້າງບໍ່ໄດ້' } : {}),
              };

              return (
                <Field
                  key={spec.name}
                  label={spec.label}
                  htmlFor={id}
                  required={spec.required}
                  hint={locked ? 'ແກ້ໄຂພາຍຫຼັງສ້າງບໍ່ໄດ້' : spec.hint}
                  error={error}
                >
                  {spec.kind === 'select' ? (
                    <Select
                      ref={index === 0 ? (el) => void (firstFieldRef.current = el) : undefined}
                      value={String(values[spec.name] ?? '')}
                      onChange={(e) => set(spec.name, e.target.value)}
                      {...common}
                    >
                      {/*
                        เติมตัวเลือกว่างให้เฉพาะเมื่อผู้เรียกยังไม่ได้ใส่มาเอง
                        ไม่งั้นช่องอย่าง "ขอบเขต" ที่มี "ໃຊ້ທັງກຸ່ມ" (ค่าว่าง) อยู่แล้ว
                        จะได้ตัวเลือกว่างสองอันติดกัน ซึ่งอ่านแล้วไม่รู้ว่าต่างกันตรงไหน
                      */}
                      {!spec.required && !spec.options.some((o) => o.value === '') && (
                        <option value="">—</option>
                      )}
                      {spec.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : spec.kind === 'textarea' ? (
                    <Textarea
                      value={String(values[spec.name] ?? '')}
                      onChange={(e) => set(spec.name, e.target.value)}
                      placeholder={spec.placeholder}
                      {...common}
                    />
                  ) : (
                    <Input
                      ref={index === 0 ? (el) => void (firstFieldRef.current = el) : undefined}
                      type={
                        spec.kind === 'number'
                          ? 'number'
                          : spec.kind === 'date'
                            ? 'date'
                            : spec.kind === 'time'
                              ? 'time'
                              : 'text'
                      }
                      value={String(values[spec.name] ?? '')}
                      onChange={(e) =>
                        set(
                          spec.name,
                          spec.kind === 'number'
                            ? e.target.value === ''
                              ? null
                              : Number(e.target.value)
                            : e.target.value,
                        )
                      }
                      placeholder={spec.placeholder}
                      {...common}
                    />
                  )}
                </Field>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 border-t border-hairline px-5 py-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              ຍົກເລີກ
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'ກຳລັງບັນທຶກ...' : submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
