'use client';

import { Database, HardDriveDownload, Server } from 'lucide-react';
import * as React from 'react';

import { Card, CardBody, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { Alert, DefRow, MockNotice, PageHeader } from '@/components/ui/misc';
import { formatDateTime, formatMinutes, formatNumber } from '@/lib/format';
import { SYSTEM_INFO } from '@/mocks/data';

/**
 * ข้อมูลระบบ — super_admin เท่านั้น
 *
 * สถานะสำรองข้อมูลอยู่บนหน้านี้เพราะเป็นสิ่งที่ต้องเห็นทุกวัน
 * ถ้าซ่อนไว้ในรายงานรายเดือน จะรู้ว่าสำรองไม่สำเร็จก็ต่อเมื่อต้องกู้คืนจริง
 */
export default function SystemPage(): React.JSX.Element {
  const info = SYSTEM_INFO;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="ຂໍ້ມູນລະບົບ" description="ເວີຊັນ ຈຳນວນຂໍ້ມູນ ແລະ ສະຖານະການສຳຮອງຂໍ້ມູນ" />

      <MockNotice endpoint="GET /system/info" />

      {info.last_backup_at === null && (
        <Alert tone="danger" title="ຍັງບໍ່ມີການສຳຮອງຂໍ້ມູນ">
          ຍັງບໍ່ໄດ້ກຳນົດປາຍທາງສຳຮອງຂໍ້ມູນນອກສະຖານທີ່ — ຕ້ອງກຳນົດ ແລະ
          ທົດສອບການກູ້ຄືນຢ່າງໜ້ອຍໜຶ່ງຄັ້ງກ່ອນເປີດໃຊ້ງານຈິງ
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="ຜູ້ໃຊ້ທັງໝົດ" value={formatNumber(info.counts.users)} />
        <StatCard label="ເລື່ອງແຈ້ງທັງໝົດ" value={formatNumber(info.counts.tickets)} />
        <StatCard label="ເລື່ອງທີ່ເປີດຢູ່" value={formatNumber(info.counts.open_tickets)} />
        <StatCard label="ບົດຄວາມໃນຄັງຄວາມຮູ້" value={formatNumber(info.counts.kb_articles)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Server className="h-4.5 w-4.5 text-ink-3" aria-hidden="true" />
                ແອັບພລິເຄຊັນ
              </span>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="divide-y divide-hair">
              <DefRow label="ເວີຊັນ">{info.version}</DefRow>
              <DefRow label="ສະພາບແວດລ້ອມ">{info.environment}</DefRow>
              <DefRow label="ເຮັດວຽກຕໍ່ເນື່ອງ">
                {formatMinutes(Math.round(info.uptime_seconds / 60), 'calendar_minutes')}
              </DefRow>
              <DefRow label="ເຂດເວລາ">Asia/Vientiane (UTC+7)</DefRow>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Database className="h-4.5 w-4.5 text-ink-3" aria-hidden="true" />
                ຖານຂໍ້ມູນ
              </span>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="divide-y divide-hair">
              <DefRow label="ເວີຊັນ">{info.database.version}</DefRow>
              <DefRow label="ຂະໜາດ">
                <span className="tabular">{formatNumber(info.database.size_mb)} MB</span>
              </DefRow>
              <DefRow label="ຕາຕະລາງ">39</DefRow>
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <HardDriveDownload className="h-4.5 w-4.5 text-ink-3" aria-hidden="true" />
              ການສຳຮອງຂໍ້ມູນ
            </span>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="divide-y divide-hair">
            <DefRow label="ສຳຮອງຫຼ້າສຸດ">
              {info.last_backup_at ? (
                formatDateTime(info.last_backup_at)
              ) : (
                <span className="font-semibold text-sla-breach">ຍັງບໍ່ເຄີຍສຳຮອງ</span>
              )}
            </DefRow>
            <DefRow label="ປາຍທາງນອກສະຖານທີ່">
              {info.backup_destination ?? (
                <span className="font-semibold text-sla-breach">ຍັງບໍ່ໄດ້ກຳນົດ</span>
              )}
            </DefRow>
            <DefRow label="ທົດສອບກູ້ຄືນຫຼ້າສຸດ">
              <span className="font-semibold text-sla-breach">ຍັງບໍ່ເຄີຍທົດສອບ</span>
            </DefRow>
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
