'use client';

import Link from 'next/link';
import { KeyRound, Mail, MessageCircle, Smartphone } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Alert, Avatar, DefRow, PageHeader } from '@/components/ui/misc';
import {
  useNotificationChannels,
  useSetNotificationChannels,
  useUpdateMe,
} from '@/lib/queries/operations';
import { ROLE_LABEL_KEY } from '@/components/layout/app-shell';
import { useT } from '@/components/layout/preference-controls';
import { useSession } from '@/lib/session';

/**
 * โปรไฟล์และการตั้งค่า (US-15)
 *
 * LINE เป็นช่องทางแจ้งเตือน "ขาออก" เท่านั้น รับแจ้งเรื่องผ่าน LINE ไม่ได้
 * เอกสารควบคุมระบุ 4 ช่องทางรับแจ้ง และไม่มี LINE อยู่ในนั้น (D-15)
 */
export default function ProfilePage(): React.JSX.Element {
  const { user } = useSession();
  const t = useT();

  const channelsQuery = useNotificationChannels();
  const saveChannels = useSetNotificationChannels();
  const updateMe = useUpdateMe();

  /*
   * ค่าเริ่มต้นของช่องทางที่ยังไม่มีแถวในฐานข้อมูล
   *
   * in_app เปิดไว้เพราะเป็นช่องทางเดียวที่ไม่ต้องตั้งค่าอะไรเพิ่ม
   * ส่วน email เปิดต่อเมื่อผู้ใช้มีอีเมล — เปิดไว้ทั้งที่ไม่มีปลายทาง
   * จะทำให้งานส่งล้มเหลวทุกครั้งโดยที่ผู้ใช้ไม่รู้
   */
  const channels = React.useMemo(() => {
    const rows = channelsQuery.data ?? [];
    const find = (c: string) => rows.find((r) => r.channel === c);
    return {
      in_app: find('in_app')?.is_enabled ?? true,
      email: find('email')?.is_enabled ?? Boolean(user.email),
      line: find('line')?.is_enabled ?? false,
    };
  }, [channelsQuery.data, user.email]);

  function toggleChannel(channel: 'in_app' | 'email' | 'line', enabled: boolean): void {
    saveChannels.mutate(
      [{ channel, is_enabled: enabled }],
      {
        onSuccess: () => toast.success('ບັນທຶກຊ່ອງທາງແຈ້ງເຕືອນແລ້ວ'),
        onError: () => toast.error('ບັນທຶກບໍ່ສຳເລັດ ລອງໃໝ່ອີກຄັ້ງ'),
      },
    );
  }

  const [form, setForm] = React.useState({
    full_name: user.full_name,
    email: user.email ?? '',
    phone: '',
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title="ໂປຣໄຟລ໌ ແລະ ການຕັ້ງຄ່າ" />

      <Card>
        <CardBody>
          <div className="flex items-center gap-4">
            <Avatar name={user.full_name} size="lg" />
            <div className="min-w-0">
              <p className="text-h3">{user.full_name}</p>
              <p className="text-body-sm text-ink-2">{user.job_title}</p>
            </div>
          </div>

          <dl className="mt-4 divide-y divide-hair">
            <DefRow label="ຊື່ຜູ້ໃຊ້">{user.username}</DefRow>
            <DefRow label="ອີເມວ">{user.email ?? '—'}</DefRow>
            <DefRow label="ບໍລິສັດ">{user.company.name_th ?? user.company.code}</DefRow>
            <DefRow label="ພະແນກ">{user.department?.name ?? '—'}</DefRow>
            <DefRow label="ບົດບາດ">
              {user.roles.map((r) => t(ROLE_LABEL_KEY[r])).join(' · ')}
            </DefRow>
            {user.scoped_companies.length > 0 && (
              <DefRow label="ຂອບເຂດບໍລິສັດ">
                {user.scoped_companies.map((c) => c.code).join(' · ')}
              </DefRow>
            )}
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ຂໍ້ມູນຕິດຕໍ່</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field label="ຊື່ ແລະ ນາມສະກຸນ" htmlFor="full_name">
            <Input
              id="full_name"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            />
          </Field>
          <Field label="ອີເມວ" htmlFor="email">
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <Field
            label="ເບີໂທລະສັບ"
            htmlFor="phone"
            hint="ໃຊ້ຕິດຕໍ່ກັບເມື່ອຕ້ອງການຂໍ້ມູນເພີ່ມ ຫຼື ຢືນຢັນຕົວຕົນ"
          >
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              placeholder="020 xxxx xxxx"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </Field>
        </CardBody>
        <CardFooter className="justify-end">
          <Button
            disabled={updateMe.isPending}
            onClick={() =>
              updateMe.mutate(
                {
                  full_name: form.full_name,
                  // ช่องว่างหมายถึง "ไม่มีอีเมล" ไม่ใช่ "ไม่เปลี่ยน" — ส่ง null ไปให้ชัด
                  email: form.email.trim() || null,
                  phone: form.phone.trim() || null,
                },
                {
                  onSuccess: () => toast.success('ບັນທຶກຂໍ້ມູນແລ້ວ'),
                  // แสดงข้อความจากเซิร์ฟเวอร์ตรง ๆ เพราะเป็นข้อความที่บอก
                  // ได้ว่าช่องไหนผิด ต่างจากข้อความรวม ๆ ที่ไม่ช่วยแก้
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            {updateMe.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ຊ່ອງທາງແຈ້ງເຕືອນ</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          <ChannelRow
            icon={Smartphone}
            title="ໃນລະບົບ"
            description="ກະດິ່ງແຈ້ງເຕືອນເທິງແຖບດ້ານເທິງ"
            checked={channels.in_app}
            onChange={(v) => toggleChannel('in_app', v)}
          />
          <ChannelRow
            icon={Mail}
            title="ອີເມວ"
            description={user.email ?? 'ຍັງບໍ່ໄດ້ຕັ້ງອີເມວ'}
            checked={channels.email}
            disabled={!user.email}
            onChange={(v) => toggleChannel('email', v)}
          />
          <ChannelRow
            icon={MessageCircle}
            title="LINE"
            description="ຕ້ອງຜູກບັນຊີກ່ອນຈຶ່ງສົ່ງໄດ້ — ໃຊ້ແຈ້ງເຕືອນອອກເທົ່ານັ້ນ ແຈ້ງເລື່ອງເຂົ້າມາທາງ LINE ບໍ່ໄດ້"
            checked={channels.line}
            onChange={(v) => toggleChannel('line', v)}
          />
        </CardBody>
        <CardFooter className="justify-between">
          <span className="text-caption text-ink-3">ບັນທຶກອັດຕະໂນມັດເມື່ອປ່ຽນ</span>
          {!channels.line && (
            <Button variant="secondary" size="sm" onClick={() => toast.info('ຈະສະແດງ QR ໃຫ້ສະແກນຜູກບັນຊີ')}>
              ຜູກບັນຊີ LINE
            </Button>
          )}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ຄວາມປອດໄພ</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Alert tone="info" title="ນະໂຍບາຍລະຫັດຜ່ານ">
            ຢ່າງໜ້ອຍ 12 ຕົວອັກສອນ ປະກອບດ້ວຍຕົວພິມໃຫຍ່ ຕົວພິມນ້ອຍ ຕົວເລກ ແລະ ອັກຂະລະພິເສດ
            ແລະ ຫ້າມຊ້ຳກັບ 3 ລະຫັດຫຼ້າສຸດ
          </Alert>
          <Button asChild variant="secondary">
            <Link href="/change-password">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              ປ່ຽນລະຫັດຜ່ານ
            </Link>
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

function ChannelRow({
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <label
      className={`flex min-h-tap items-start gap-3 rounded border border-hair px-3 py-3 ${
        disabled ? 'opacity-60' : 'cursor-pointer hover:bg-subtle'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 flex-none rounded border-control"
      />
      <Icon className="mt-0.5 h-4.5 w-4.5 flex-none text-ink-2" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-body-sm font-semibold">{title}</span>
        <span className="block text-caption text-ink-2">{description}</span>
      </span>
    </label>
  );
}
