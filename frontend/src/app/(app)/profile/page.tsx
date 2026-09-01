'use client';

import Link from 'next/link';
import { KeyRound, Mail, MessageCircle, Smartphone } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Alert, Avatar, DefRow, MockNotice, PageHeader } from '@/components/ui/misc';
import { ROLE_LABEL } from '@/components/layout/app-shell';
import { useSession } from '@/lib/session';

/**
 * โปรไฟล์และการตั้งค่า (US-15)
 *
 * LINE เป็นช่องทางแจ้งเตือน "ขาออก" เท่านั้น รับแจ้งเรื่องผ่าน LINE ไม่ได้
 * เอกสารควบคุมระบุ 4 ช่องทางรับแจ้ง และไม่มี LINE อยู่ในนั้น (D-15)
 */
export default function ProfilePage(): React.JSX.Element {
  const { user } = useSession();

  const [channels, setChannels] = React.useState({
    in_app: true,
    email: true,
    line: false,
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title="ໂປຣໄຟລ໌ ແລະ ການຕັ້ງຄ່າ" />

      <MockNotice endpoint="GET /auth/me · PATCH /users/me" />

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
              {user.roles.map((r) => ROLE_LABEL[r]).join(' · ')}
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
            <Input defaultValue={user.full_name} />
          </Field>
          <Field label="ອີເມວ" htmlFor="email">
            <Input type="email" defaultValue={user.email ?? ''} />
          </Field>
          <Field
            label="ເບີໂທລະສັບ"
            htmlFor="phone"
            hint="ໃຊ້ຕິດຕໍ່ກັບເມື່ອຕ້ອງການຂໍ້ມູນເພີ່ມ ຫຼື ຢືນຢັນຕົວຕົນ"
          >
            <Input type="tel" inputMode="tel" placeholder="020 xxxx xxxx" />
          </Field>
        </CardBody>
        <CardFooter className="justify-end">
          <Button onClick={() => toast.success('ບັນທຶກຂໍ້ມູນແລ້ວ')}>ບັນທຶກ</Button>
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
            onChange={(v) => setChannels((c) => ({ ...c, in_app: v }))}
          />
          <ChannelRow
            icon={Mail}
            title="ອີເມວ"
            description={user.email ?? 'ຍັງບໍ່ໄດ້ຕັ້ງອີເມວ'}
            checked={channels.email}
            disabled={!user.email}
            onChange={(v) => setChannels((c) => ({ ...c, email: v }))}
          />
          <ChannelRow
            icon={MessageCircle}
            title="LINE"
            description="ຕ້ອງຜູກບັນຊີກ່ອນຈຶ່ງສົ່ງໄດ້ — ໃຊ້ແຈ້ງເຕືອນອອກເທົ່ານັ້ນ ແຈ້ງເລື່ອງເຂົ້າມາທາງ LINE ບໍ່ໄດ້"
            checked={channels.line}
            onChange={(v) => setChannels((c) => ({ ...c, line: v }))}
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
