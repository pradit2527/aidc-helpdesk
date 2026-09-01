'use client';

import { FileText, Lock } from 'lucide-react';
import * as React from 'react';

import { PriorityBadge } from '@/components/common/badges';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Alert, DefRow, MockNotice, PageHeader } from '@/components/ui/misc';
import { formatDate, formatMinutes } from '@/lib/format';
import { SLA_POLICY } from '@/mocks/data';
import type { SlaTarget } from '@/lib/types';

/**
 * ตั้งค่า SLA (FR-30, US-11) — super_admin เท่านั้น
 *
 * company_admin แก้ไม่ได้โดยเจตนา ค่าเหล่านี้ผูกกับเอกสารที่แก้ได้เฉพาะ
 * ผ่านการอนุมัติของผู้บริหารสูงสุด (SLA ข้อ 10) การให้แก้ในระบบเท่ากับ
 * เปิดทางให้เลี่ยงกระบวนการเอกสารทั้งหมด
 */
export default function SlaSettingsPage(): React.JSX.Element {
  const columns: Column<SlaTarget>[] = [
    {
      key: 'priority',
      header: 'ລະດັບ',
      render: (t) => <PriorityBadge priority={t.priority} withMeter={false} />,
    },
    {
      key: 'response',
      header: 'ເວລາຕອບຮັບ',
      align: 'right',
      render: (t) => (
        <span className="tabular">
          {formatMinutes(
            t.response_minutes,
            t.clock_mode === 'calendar_24x7' ? 'calendar_minutes' : 'business_minutes',
          )}
        </span>
      ),
    },
    {
      key: 'resolution',
      header: 'ເວລາແກ້ໄຂ',
      align: 'right',
      render: (t) => (
        <span className="tabular">
          {formatMinutes(
            t.resolution_minutes,
            t.clock_mode === 'calendar_24x7' ? 'calendar_minutes' : 'business_minutes',
          )}
          <span className="ml-1 text-caption text-ink-3">({t.resolution_minutes} ນທ.)</span>
        </span>
      ),
    },
    {
      key: 'clock',
      header: 'ໂໝດໂມງ',
      render: (t) =>
        t.clock_mode === 'calendar_24x7' ? (
          <span className="rounded-full bg-p1-bg px-2 py-0.5 text-caption font-semibold text-p1-fg">
            ນັບຕໍ່ເນື່ອງ 24×7
          </span>
        ) : (
          <span className="rounded-full bg-subtle px-2 py-0.5 text-caption text-ink-2">
            ນັບສະເພາະເວລາເຮັດວຽກ
          </span>
        ),
    },
    {
      key: 'report',
      header: 'ຮອບລາຍງານສະຖານະ',
      hideBelow: 'md',
      render: (t) =>
        t.status_report_interval_minutes ? (
          <span className="tabular text-body-sm">
            ທຸກ {formatMinutes(t.status_report_interval_minutes, 'calendar_minutes')}
          </span>
        ) : (
          <span className="text-body-sm text-ink-3">ເມື່ອສະຖານະປ່ຽນ</span>
        ),
    },
    {
      key: 'escalation',
      header: 'ເຕືອນລ່ວງໜ້າ',
      align: 'right',
      hideBelow: 'lg',
      render: (t) => <span className="tabular">{t.escalation_percent}%</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ຕັ້ງຄ່າ SLA"
        description="ຄ່າມາດຕະຖານທີ່ໃຊ້ຄຳນວນກຳນົດເວລາຂອງທຸກເລື່ອງແຈ້ງ"
      />

      <MockNotice endpoint="GET /sla/policies" />

      <Alert tone="warning" title="ຄ່າເຫຼົ່ານີ້ຜູກກັບເອກະສານຄວບຄຸມ">
        ການແກ້ຄ່າໃນໜ້ານີ້ຕ້ອງມີການແກ້ໄຂເອກະສານ AIDC-IT-SLA-001 ແລະ ຜ່ານການອະນຸມັດກ່ອນ
        (SLA ຂໍ້ 10) — ຜູ້ດູແລລະດັບບໍລິສັດແກ້ບໍ່ໄດ້ ເຫັນໄດ້ຢ່າງດຽວ
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>ນະໂຍບາຍທີ່ໃຊ້ຢູ່</CardTitle>
          <span className="inline-flex items-center gap-1.5 text-caption text-ink-3">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            ແກ້ໄດ້ໂດຍຜູ້ດູແລລະບົບເທົ່ານັ້ນ
          </span>
        </CardHeader>
        <CardBody>
          <dl className="divide-y divide-hair">
            <DefRow label="ຊື່ນະໂຍບາຍ">{SLA_POLICY.name}</DefRow>
            <DefRow label="ເອກະສານອ້າງອີງ">
              <span className="inline-flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
                {SLA_POLICY.doc_ref} v{SLA_POLICY.doc_version}
              </span>
            </DefRow>
            <DefRow label="ບັງຄັບໃຊ້ຕັ້ງແຕ່">{formatDate(SLA_POLICY.effective_from)}</DefRow>
            <DefRow label="ສິ້ນສຸດ">
              {SLA_POLICY.effective_to ? formatDate(SLA_POLICY.effective_to) : 'ຍັງບັງຄັບໃຊ້ຢູ່'}
            </DefRow>
            <DefRow label="ຂອບເຂດ">ໃຊ້ຮ່ວມທັງ 7 ບໍລິສັດ</DefRow>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ເປົ້າໝາຍຕາມລະດັບຄວາມສຳຄັນ</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable
            columns={columns}
            rows={SLA_POLICY.targets}
            rowKey={(t) => t.priority}
            caption="ເປົ້າໝາຍ SLA ຕາມລະດັບຄວາມສຳຄັນ"
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ວິທີນັບເວລາ</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-body-sm text-ink-2">
          <p>
            <strong className="text-ink">1 ມື້ເຮັດວຽກ = 540 ນາທີ</strong> (ຈັນ–ສຸກ 08:30–17:30
            ບໍ່ຫັກເວລາພັກທ່ຽງ) ດັ່ງນັ້ນ P3 ທີ່ເປັນ 2 ມື້ເຮັດວຽກ = 1,080 ນາທີ ແລະ P4 ທີ່ເປັນ 5
            ມື້ເຮັດວຽກ = 2,700 ນາທີ
          </p>
          <p>
            <strong className="text-ink">P1 ນັບຕໍ່ເນື່ອງ 24×7</strong> ເພາະມີທີມ On-call
            ສ່ວນ P2–P4 ນັບສະເພາະນາທີເຮັດວຽກ ໂມງຈຶ່ງຢຸດເອງນອກເວລາງານ ວັນເສົາ ວັນອາທິດ ແລະ ວັນພັກ
          </p>
          <p>
            <strong className="text-ink">ເມື່ອປ່ຽນລະດັບກາງທາງ</strong> ໂມງນັບໃໝ່ຕາມລະດັບໃໝ່
            ຕັ້ງແຕ່ເວລາທີ່ປ່ຽນ ບໍ່ແມ່ນນັບຈາກເວລາທີ່ສ້າງເລື່ອງ (SLA 5.4)
          </p>
          <p>
            <strong className="text-ink">ຄຳຂໍບໍລິການບໍ່ໃຊ້ຕາຕະລາງນີ້ວັດການແກ້ໄຂ</strong>{' '}
            ໃຊ້ເປົ້າໝາຍລາຍລາຍການຈາກແຄັດຕາລັອກແທນ ແຕ່ເວລາຕອບຮັບຍັງໃຊ້ຕາຕະລາງນີ້ສະເໝີ
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
