'use client';

import { Check, KeyRound, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { changePassword } from '@/lib/auth';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/misc';
import { cn } from '@/lib/cn';

/**
 * เปลี่ยนรหัสผ่าน (US-18)
 *
 * แสดงเกณฑ์ทุกข้อพร้อมสถานะผ่าน/ไม่ผ่านขณะพิมพ์
 * ไม่ใช่ปล่อยให้กดส่งแล้วค่อยบอกว่าผิดข้อไหน — ผู้ใช้จะลองผิดลองถูกหลายรอบ
 * และมักจบด้วยรหัสที่ตัวเองจำไม่ได้
 */
const RULES = [
  { key: 'length', label: 'ຢ່າງໜ້ອຍ 12 ຕົວອັກສອນ', test: (v: string) => v.length >= 12 },
  { key: 'upper', label: 'ມີຕົວພິມໃຫຍ່ A–Z', test: (v: string) => /[A-Z]/.test(v) },
  { key: 'lower', label: 'ມີຕົວພິມນ້ອຍ a–z', test: (v: string) => /[a-z]/.test(v) },
  { key: 'digit', label: 'ມີຕົວເລກ 0–9', test: (v: string) => /\d/.test(v) },
  { key: 'symbol', label: 'ມີອັກຂະລະພິເສດ', test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

export default function ChangePasswordPage(): React.JSX.Element {
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const passed = RULES.filter((r) => r.test(next));
  const allPassed = passed.length === RULES.length;
  const matches = next.length > 0 && next === confirm;

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!allPassed || !matches) return;

    setSubmitting(true);
    setError(null);

    try {
      await changePassword(current, next);

      /*
       * สำเร็จแล้ว backend ล้างคุกกี้ทิ้งทั้งหมด เพราะการเปลี่ยนรหัสผ่าน
       * เพิ่ม token_version ทำให้ token เดิมใช้ไม่ได้ทุกใบทุกอุปกรณ์
       * (เหตุผลที่พบบ่อยที่สุดของการเปลี่ยนรหัสคือสงสัยว่ารหัสเดิมรั่ว)
       *
       * ⚠️ ต้องพาไป /login ไม่ใช่ / — ตอนนี้ไม่มี session แล้ว
       *    ถ้าพาไปหน้าแรก SessionProvider จะถาม /auth/me ได้ 401
       *    แล้วเด้งมา /login อยู่ดี แต่ผู้ใช้จะเห็นจอกระพริบระหว่างทาง
       *
       * ใช้ location.assign ไม่ใช่ router.replace เพื่อล้าง state ในหน่วยความจำ
       * ให้หมด — ข้อมูลผู้ใช้คนเดิมต้องไม่ค้างอยู่หลังเปลี่ยนรหัสผ่าน
       */
      toast.success('ປ່ຽນລະຫັດຜ່ານແລ້ວ — ກະລຸນາເຂົ້າສູ່ລະບົບໃໝ່ດ້ວຍລະຫັດຜ່ານໃໝ່');
      window.location.assign('/login');
      return;
    } catch (cause) {
      setSubmitting(false);

      if (cause instanceof ApiError) {
        // 401 ตรงนี้แปลว่า "รหัสผ่านปัจจุบันไม่ถูก" ไม่ใช่ session หมดอายุ
        setError(
          cause.status === 401
            ? 'ລະຫັດຜ່ານປັດຈຸບັນບໍ່ຖືກຕ້ອງ'
            : (cause.fields ? Object.values(cause.fields)[0] : null) ?? cause.message,
        );
        return;
      }
      setError('ບັນທຶກບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່');
    }
  }

  return (
    <Card>
      <CardBody>
        <div className="mb-4">
          <Alert tone="info" title="ຕ້ອງປ່ຽນລະຫັດຜ່ານກ່ອນໃຊ້ງານ">
            ບັນຊີທີ່ຫາກໍ່ສ້າງ ຫຼື ຫາກໍ່ຖືກຣີເຊັດ ຕ້ອງຕັ້ງລະຫັດໃໝ່ດ້ວຍຕົນເອງໜຶ່ງຄັ້ງ
          </Alert>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="ລະຫັດຜ່ານປັດຈຸບັນ" htmlFor="current" required>
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          <Field label="ລະຫັດຜ່ານໃໝ່" htmlFor="next" required>
            <Input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>

          <ul className="space-y-1" aria-label="ເງື່ອນໄຂຂອງລະຫັດຜ່ານ">
            {RULES.map((rule) => {
              const ok = rule.test(next);
              return (
                <li
                  key={rule.key}
                  className={cn(
                    'flex items-center gap-2 text-caption',
                    ok ? 'text-sla-ok' : 'text-ink-3',
                  )}
                >
                  {ok ? (
                    <Check className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
                  ) : (
                    <X className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
                  )}
                  {rule.label}
                  <span className="sr-only">{ok ? ' — ຜ່ານແລ້ວ' : ' — ຍັງບໍ່ຜ່ານ'}</span>
                </li>
              );
            })}
            <li className="flex items-center gap-2 text-caption text-ink-3">
              <X className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
              ຫ້າມຊ້ຳກັບ 3 ລະຫັດຫຼ້າສຸດ (ລະບົບກວດຕອນບັນທຶກ)
            </li>
          </ul>

          <Field
            label="ຢືນຢັນລະຫັດຜ່ານໃໝ່"
            htmlFor="confirm"
            required
            error={confirm.length > 0 && !matches ? 'ລະຫັດຜ່ານທັງສອງຊ່ອງບໍ່ຕົງກັນ' : undefined}
          >
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>

          {/*
            ข้อผิดพลาดจากเซิร์ฟเวอร์ต้องแสดงให้เห็น
            ที่พบบ่อยคือรหัสผ่านปัจจุบันผิด กับใช้รหัสซ้ำกับ 3 อันล่าสุด
            ซึ่งฝั่ง client ตรวจแทนไม่ได้ทั้งคู่
          */}
          {error && (
            <p className="text-body-sm font-medium text-danger" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={submitting}
            disabled={!allPassed || !matches || current.length === 0}
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            ບັນທຶກລະຫັດຜ່ານໃໝ່
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
