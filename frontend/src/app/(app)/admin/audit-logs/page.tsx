'use client';

import { Download, Search } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input, Select } from '@/components/ui/field';
import { Alert, MockNotice, PageHeader } from '@/components/ui/misc';
import { formatDateTime } from '@/lib/format';
import { AUDIT_LOGS } from '@/mocks/data';
import type { AuditEntry } from '@/lib/types';

const ACTION_LABEL: Record<string, string> = {
  create: 'ສ້າງ',
  update: 'ແກ້ໄຂ',
  delete: 'ລຶບ',
  assign: 'ມອບໝາຍ',
  login: 'ເຂົ້າສູ່ລະບົບ',
  login_failed: 'ເຂົ້າສູ່ລະບົບບໍ່ສຳເລັດ',
  reset_password: 'ຣີເຊັດລະຫັດຜ່ານ',
  export: 'ສົ່ງອອກຂໍ້ມູນ',
};

const ENTITY_LABEL: Record<string, string> = {
  ticket: 'ເລື່ອງແຈ້ງ',
  app_user: 'ຜູ້ໃຊ້',
  sla_target: 'ເປົ້າໝາຍ SLA',
  role: 'ບົດບາດ',
  kb_article: 'ບົດຄວາມ',
};

/**
 * บันทึกการใช้งาน (US-16)
 *
 * เก็บอย่างน้อย 1 ปี และห้าม purge ก่อน 90 วัน (NFR-18)
 * ตารางเป็น append-only ที่ระดับฐานข้อมูล — ทั้ง trigger และการถอนสิทธิ์ UPDATE/DELETE
 * บัญชีที่แอปใช้จึงลบร่องรอยของตัวเองไม่ได้แม้จะถูกยึด
 */
export default function AuditLogsPage(): React.JSX.Element {
  const [q, setQ] = React.useState('');
  const [action, setAction] = React.useState('');

  const rows = AUDIT_LOGS.filter((e) => {
    if (action && e.action !== action) return false;
    if (q) {
      const haystack = `${e.actor?.full_name ?? ''} ${e.entity_type} ${e.entity_id ?? ''} ${e.ip_address ?? ''}`;
      if (!haystack.toLowerCase().includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const columns: Column<AuditEntry>[] = [
    {
      key: 'time',
      header: 'ເວລາ',
      render: (e) => (
        <time className="tabular text-caption" dateTime={e.created_at}>
          {formatDateTime(e.created_at)}
        </time>
      ),
    },
    {
      key: 'actor',
      header: 'ຜູ້ກະທຳ',
      render: (e) =>
        e.actor ? (
          <span className="text-body-sm">{e.actor.full_name}</span>
        ) : (
          <span className="text-body-sm text-ink-3">ບໍ່ໄດ້ເຂົ້າສູ່ລະບົບ</span>
        ),
    },
    {
      key: 'action',
      header: 'ການກະທຳ',
      render: (e) => (
        <span className="text-body-sm">{ACTION_LABEL[e.action] ?? e.action}</span>
      ),
    },
    {
      key: 'entity',
      header: 'ເປົ້າໝາຍ',
      render: (e) => (
        <span className="text-body-sm">
          {ENTITY_LABEL[e.entity_type] ?? e.entity_type}
          {e.entity_id !== null && <span className="tabular text-ink-3"> #{e.entity_id}</span>}
        </span>
      ),
    },
    {
      key: 'change',
      header: 'ສິ່ງທີ່ປ່ຽນ',
      hideBelow: 'lg',
      render: (e) => {
        if (!e.old_value && !e.new_value) return <span className="text-ink-3">—</span>;
        const keys = new Set([
          ...Object.keys(e.old_value ?? {}),
          ...Object.keys(e.new_value ?? {}),
        ]);
        return (
          <ul className="space-y-0.5 text-caption">
            {[...keys].map((key) => (
              <li key={key} className="font-mono">
                {key}: {String(e.old_value?.[key] ?? '—')} → {String(e.new_value?.[key] ?? '—')}
              </li>
            ))}
          </ul>
        );
      },
    },
    {
      key: 'ip',
      header: 'IP',
      hideBelow: 'lg',
      align: 'right',
      render: (e) => <span className="tabular font-mono text-caption text-ink-3">{e.ip_address ?? '—'}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ບັນທຶກການໃຊ້ງານ"
        description="ຮ່ອງຮອຍການກະທຳທັງໝົດໃນລະບົບ ໃຊ້ສືບຍ້ອນຫຼັງໄດ້"
        actions={
          <Button variant="secondary">
            <Download className="h-4 w-4" aria-hidden="true" />
            ສົ່ງອອກ
          </Button>
        }
      />

      <MockNotice endpoint="GET /audit-logs" />

      <Alert tone="info" title="ຕາຕະລາງນີ້ເພີ່ມໄດ້ຢ່າງດຽວ ແກ້ ຫຼື ລຶບບໍ່ໄດ້">
        ບັງຄັບໄວ້ທີ່ລະດັບຖານຂໍ້ມູນ ບໍ່ແມ່ນແຄ່ໃນໂຄ້ດ ເກັບຢ່າງໜ້ອຍ 1 ປີ
        ແລະ ຫ້າມລຶບກ່ອນ 90 ມື້ (NFR-18)
      </Alert>

      <Card>
        <CardBody className="grid gap-2 border-b border-hair sm:grid-cols-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ຊື່ຜູ້ກະທຳ ເປົ້າໝາຍ ຫຼື IP"
              aria-label="ຄົ້ນຫາບັນທຶກ"
              className="pl-9"
            />
          </div>
          <Select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            aria-label="ກັ່ນຕອງຕາມການກະທຳ"
          >
            <option value="">ທຸກການກະທຳ</option>
            {Object.entries(ACTION_LABEL).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
        </CardBody>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id}
          caption="ບັນທຶກການໃຊ້ງານ"
          emptyTitle="ບໍ່ພົບບັນທຶກທີ່ຕົງກັບເງື່ອນໄຂ"
        />
      </Card>
    </div>
  );
}
