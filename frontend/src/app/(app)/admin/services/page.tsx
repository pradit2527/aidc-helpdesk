'use client';

import Link from 'next/link';
import { AlertTriangle, CalendarClock, Plus, Send } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Alert, BackLink, MockNotice, PageHeader, Tabs } from '@/components/ui/misc';
import { SERVICE_GROUP, SERVICE_TIER, type ServiceGroup, type ServiceTier } from '@/config/admin';
import { cn } from '@/lib/cn';
import { formatDateTime, formatMinutes, formatPercent } from '@/lib/format';
import { MAINTENANCE_WINDOWS, SERVICES, SERVICE_OUTAGES } from '@/mocks/admin-data';
import type { MaintenanceWindow, ServiceOutage, ServiceRecord } from '@/lib/types';

/**
 * ทะเบียนระบบงาน เหตุขัดข้อง และหน้าต่างบำรุงรักษา
 *
 * `service.manage` มอบให้ agent ด้วย ไม่ใช่เฉพาะผู้ดูแล
 * เพราะการบันทึกเหตุขัดข้องต้องทำทันทีตอนเกิดเหตุ ไม่ใช่รอผู้ดูแลว่าง
 * ถ้าบันทึกช้า เวลาเริ่ม downtime จะเพี้ยน แล้ว Uptime รายเดือนก็เพี้ยนตาม
 */
export default function ServicesPage(): React.JSX.Element {
  const [tab, setTab] = React.useState<'registry' | 'outages' | 'maintenance'>('registry');

  const openOutages = SERVICE_OUTAGES.filter((o) => o.ended_at === null);
  const unnotified = MAINTENANCE_WINDOWS.filter((w) => w.notified_at === null);

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/admin" label="ກັບໄປສູນຄວບຄຸມ" />
      <PageHeader
        title="ທະບຽນລະບົບງານ"
        description="ລະບົບງານ ເປົ້າໝາຍຄວາມພ້ອມໃຊ້ງານ ເຫດຂັດຂ້ອງ ແລະ ໜ້າຕ່າງບຳລຸງຮັກສາ"
      />

      <MockNotice endpoint="GET /services · GET /service-outages · GET /maintenance-windows" />

      {openOutages.length > 0 && (
        <Alert tone="danger" title={`ມີເຫດຂັດຂ້ອງທີ່ຍັງບໍ່ຄືນບໍລິການ ${openOutages.length} ລາຍການ`}>
          ນາທີ downtime ຍັງເດີນຢູ່ ແລະ ຈະນັບເຂົ້າ Uptime ຂອງເດືອນນີ້ຈົນກວ່າຈະບັນທຶກເວລາສິ້ນສຸດ
        </Alert>
      )}

      <Card>
        <div className="px-4 pt-1 lg:px-5">
          <Tabs
            tabs={[
              { key: 'registry' as const, label: 'ລະບົບງານ', count: SERVICES.length },
              { key: 'outages' as const, label: 'ເຫດຂັດຂ້ອງ', count: SERVICE_OUTAGES.length },
              {
                key: 'maintenance' as const,
                label: 'ບຳລຸງຮັກສາ',
                count: MAINTENANCE_WINDOWS.length,
              },
            ]}
            value={tab}
            onChange={setTab}
            label="ສ່ວນຂອງທະບຽນລະບົບງານ"
          />
        </div>

        <div className="flex justify-end border-b border-hair px-4 py-3 lg:px-5">
          <Button size="sm" onClick={() => toast.info('ຟອມເພີ່ມລາຍການໃໝ່')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {tab === 'registry' ? 'ເພີ່ມລະບົບງານ' : tab === 'outages' ? 'ບັນທຶກເຫດຂັດຂ້ອງ' : 'ວາງແຜນບຳລຸງຮັກສາ'}
          </Button>
        </div>

        <CardBody className="p-0">
          {tab === 'registry' && <RegistryTable />}
          {tab === 'outages' && <OutagesTable />}
          {tab === 'maintenance' && <MaintenanceTable unnotified={unnotified.length} />}
        </CardBody>
      </Card>
    </div>
  );
}

function RegistryTable(): React.JSX.Element {
  const columns: Column<ServiceRecord>[] = [
    {
      key: 'name',
      header: 'ລະບົບງານ',
      render: (s) => (
        <span>
          <span className="block text-body-sm font-semibold">{s.name_th}</span>
          <span className="block font-mono text-caption text-ink-3">{s.code}</span>
        </span>
      ),
    },
    {
      key: 'group',
      header: 'ກຸ່ມ',
      hideBelow: 'md',
      render: (s) => (
        <span className="text-body-sm">
          {SERVICE_GROUP[s.service_group as ServiceGroup] ?? s.service_group}
        </span>
      ),
    },
    {
      key: 'tier',
      header: 'ລະດັບ / ເປົ້າໝາຍ',
      render: (s) => {
        const tier = SERVICE_TIER[s.service_tier as ServiceTier];
        return (
          <span>
            <span
              className={cn(
                'inline-block rounded-full px-2 py-0.5 text-caption font-semibold',
                s.service_tier === 'critical' && 'bg-p1-bg text-p1-fg',
                s.service_tier === 'high' && 'bg-p2-bg text-p2-fg',
                s.service_tier === 'standard' && 'bg-subtle text-ink-2',
              )}
            >
              {tier?.label ?? s.service_tier}
            </span>
            {tier && (
              <span className="tabular mt-0.5 block text-caption text-ink-3">
                ≥ {tier.uptime} · ຫຼຸດໄດ້ {tier.maxDowntime}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'uptime',
      header: 'Uptime ເດືອນນີ້',
      align: 'right',
      render: (s) => {
        if (s.uptime_percent_month === null) {
          return <span className="text-caption text-ink-3">ບໍ່ໄດ້ວັດ</span>;
        }
        const target = Number(
          (SERVICE_TIER[s.service_tier as ServiceTier]?.uptime ?? '0%').replace('%', ''),
        );
        const met = s.uptime_percent_month >= target;
        return (
          <span className={cn('tabular font-semibold', met ? 'text-sla-ok' : 'text-sla-breach')}>
            {formatPercent(s.uptime_percent_month, 2)}
          </span>
        );
      },
    },
    {
      key: 'owner',
      header: 'ເຈົ້າຂອງລະບົບ',
      hideBelow: 'lg',
      render: (s) =>
        s.owner ? (
          <span className="text-body-sm">{s.owner.full_name}</span>
        ) : (
          // ไม่มีเจ้าของ = ไม่มีใครรับผิดชอบตอนระบบล่ม ต้องเห็นชัดกว่าขีดกลาง
          <span className="inline-flex items-center gap-1 text-caption font-semibold text-sla-risk">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            ຍັງບໍ່ໄດ້ກຳນົດ
          </span>
        ),
    },
    {
      key: 'clock',
      header: 'ຂອບເຂດ',
      align: 'right',
      hideBelow: 'lg',
      render: (s) => (
        <span className="text-caption text-ink-2">
          {s.is_24x7 ? '24×7' : 'ເວລາເຮັດວຽກ'}
          <span className="block text-ink-3">{s.company ? s.company.code : 'ທັງກຸ່ມ'}</span>
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={SERVICES}
      rowKey={(s) => s.id}
      caption="ທະບຽນລະບົບງານ"
    />
  );
}

function OutagesTable(): React.JSX.Element {
  const columns: Column<ServiceOutage>[] = [
    { key: 'service', header: 'ລະບົບງານ', render: (o) => o.service.name_th },
    {
      key: 'period',
      header: 'ຊ່ວງເວລາ',
      render: (o) => (
        <span className="text-body-sm">
          <span className="block">{formatDateTime(o.started_at)}</span>
          <span className="block text-caption text-ink-3">
            {o.ended_at ? `ຄືນບໍລິການ ${formatDateTime(o.ended_at)}` : 'ຍັງບໍ່ຄືນບໍລິການ'}
          </span>
        </span>
      ),
    },
    {
      key: 'duration',
      header: 'ໄລຍະເວລາ',
      align: 'right',
      render: (o) => {
        if (o.ended_at === null) {
          return <span className="text-caption font-semibold text-sla-breach">ກຳລັງເກີດຂຶ້ນ</span>;
        }
        const minutes = Math.round(
          (new Date(o.ended_at).getTime() - new Date(o.started_at).getTime()) / 60000,
        );
        return <span className="tabular">{formatMinutes(minutes, 'calendar_minutes')}</span>;
      },
    },
    {
      key: 'kind',
      header: 'ປະເພດ',
      render: (o) =>
        o.is_planned ? (
          // ตามแผน = ไม่นับเป็น downtime (SLA 3.1, ข้อ 9)
          <span className="rounded-full bg-subtle px-2 py-0.5 text-caption text-ink-2">
            ຕາມແຜນ · ບໍ່ນັບ
          </span>
        ) : (
          <span className="rounded-full bg-sla-breach-bg px-2 py-0.5 text-caption font-semibold text-sla-breach">
            ບໍ່ໄດ້ວາງແຜນ
          </span>
        ),
    },
    {
      key: 'cause',
      header: 'ສາເຫດ',
      hideBelow: 'lg',
      render: (o) => <span className="text-caption text-ink-2">{o.cause ?? '—'}</span>,
    },
    {
      key: 'ticket',
      header: 'ເລື່ອງທີ່ກ່ຽວ',
      align: 'right',
      hideBelow: 'md',
      render: (o) =>
        o.ticket ? (
          <Link
            href={`/tickets/${o.ticket.id}`}
            className="tabular text-caption text-primary hover:underline"
          >
            {o.ticket.ticket_no}
          </Link>
        ) : (
          <span className="text-caption text-ink-3">—</span>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={SERVICE_OUTAGES}
      rowKey={(o) => o.id}
      caption="ບັນທຶກເຫດຂັດຂ້ອງ"
      emptyTitle="ຍັງບໍ່ມີບັນທຶກເຫດຂັດຂ້ອງ"
    />
  );
}

function MaintenanceTable({ unnotified }: { unnotified: number }): React.JSX.Element {
  const columns: Column<MaintenanceWindow>[] = [
    { key: 'service', header: 'ລະບົບງານ', render: (w) => w.service?.name_th ?? 'ທຸກລະບົບ' },
    {
      key: 'window',
      header: 'ຊ່ວງທີ່ວາງແຜນ',
      render: (w) => (
        <span className="text-body-sm">
          <span className="block">{formatDateTime(w.planned_start)}</span>
          <span className="block text-caption text-ink-3">ເຖິງ {formatDateTime(w.planned_end)}</span>
        </span>
      ),
    },
    {
      key: 'description',
      header: 'ລາຍລະອຽດ',
      hideBelow: 'md',
      render: (w) => <span className="text-body-sm">{w.description}</span>,
    },
    {
      key: 'notice',
      header: 'ການແຈ້ງລ່ວງໜ້າ',
      render: (w) =>
        w.notified_at ? (
          <span className="text-caption text-sla-ok">ແຈ້ງແລ້ວ {formatDateTime(w.notified_at)}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-caption font-semibold text-sla-risk">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            ຍັງບໍ່ໄດ້ແຈ້ງ (ຕ້ອງ ≥ {w.notice_lead_business_days} ມື້ເຮັດວຽກ)
          </span>
        ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (w) =>
        w.notified_at ? null : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => toast.success('ສົ່ງແຈ້ງເຕືອນລ່ວງໜ້າໃຫ້ຜູ້ຮັບບໍລິການແລ້ວ')}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            ແຈ້ງດຽວນີ້
          </Button>
        ),
    },
  ];

  return (
    <div>
      {unnotified > 0 && (
        <div className="border-b border-hair bg-sla-risk-bg/40 px-4 py-3 lg:px-5">
          <p className="inline-flex items-center gap-2 text-body-sm">
            <CalendarClock className="h-4 w-4 flex-none text-sla-risk" aria-hidden="true" />
            ໜ້າຕ່າງທີ່ບໍ່ໄດ້ແຈ້ງລ່ວງໜ້າ ≥ 3 ມື້ເຮັດວຽກ ຈະຖືກນັບເປັນ Downtime ຕາມປົກກະຕິ
            ບໍ່ໄດ້ຮັບການຍົກເວັ້ນ (SLA ຂໍ້ 9)
          </p>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={MAINTENANCE_WINDOWS}
        rowKey={(w) => w.id}
        caption="ໜ້າຕ່າງບຳລຸງຮັກສາທີ່ວາງແຜນໄວ້"
        emptyTitle="ຍັງບໍ່ມີແຜນບຳລຸງຮັກສາ"
      />
    </div>
  );
}
