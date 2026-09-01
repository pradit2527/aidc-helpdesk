'use client';

import * as React from 'react';

import { TicketList } from '@/components/tickets/ticket-list';
import { Card } from '@/components/ui/card';
import { PageHeader, Tabs, MockNotice } from '@/components/ui/misc';
import { useSession } from '@/lib/session';
import { TICKETS } from '@/mocks/data';

type QueueTab = 'unassigned' | 'mine' | 'pending' | 'breached';

/**
 * คิวงานของเจ้าหน้าที่ — หน้าทำงานหลักของ agent (US-03)
 *
 * แท็บเรียงตามลำดับที่ควรหยิบงาน ไม่ใช่ตามตัวอักษร
 * "ยังไม่มีคนรับ" มาก่อนเสมอ เพราะเรื่องที่ยังไม่มีเจ้าของคือความเสี่ยงที่แท้จริง
 */
export default function QueuePage(): React.JSX.Element {
  const { user } = useSession();
  const [tab, setTab] = React.useState<QueueTab>('unassigned');

  const buckets = React.useMemo(() => {
    const open = TICKETS.filter((t) => !['resolved', 'closed', 'cancelled'].includes(t.status));
    return {
      unassigned: open.filter((t) => t.assignee === null),
      mine: open.filter((t) => t.assignee?.id === user.id),
      pending: open.filter((t) => t.status === 'pending_user'),
      breached: open.filter((t) => t.sla.is_resolution_breached),
    };
  }, [user.id]);

  const tabs = [
    { key: 'unassigned' as const, label: 'ຍັງບໍ່ມີຄົນຮັບ', count: buckets.unassigned.length },
    { key: 'mine' as const, label: 'ວຽກຂອງຂ້ອຍ', count: buckets.mine.length },
    { key: 'pending' as const, label: 'ລໍຖ້າຜູ້ແຈ້ງ', count: buckets.pending.length },
    { key: 'breached' as const, label: 'ເກີນກຳນົດ', count: buckets.breached.length },
  ];

  const emptyHint: Record<QueueTab, string> = {
    unassigned: 'ທຸກເລື່ອງມີຜູ້ຮັບຜິດຊອບແລ້ວ',
    mine: 'ທ່ານຍັງບໍ່ໄດ້ຮັບມອບໝາຍວຽກໃດ',
    pending: 'ບໍ່ມີເລື່ອງທີ່ລໍຖ້າຜູ້ແຈ້ງຢູ່',
    breached: 'ບໍ່ມີເລື່ອງໃດເກີນກຳນົດ SLA',
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ຄິວວຽກຂອງຂ້ອຍ"
        description={`ຂອບເຂດ ${user.scoped_companies.map((c) => c.code).join(' · ')}`}
      />

      <MockNotice endpoint="GET /tickets?queue=" />

      <Card>
        <div className="px-4 pt-1 lg:px-5">
          <Tabs tabs={tabs} value={tab} onChange={setTab} label="ກຸ່ມວຽກໃນຄິວ" />
        </div>
        <div className="p-4 lg:p-5">
          <TicketList
            tickets={buckets[tab]}
            emptyTitle="ບໍ່ມີເລື່ອງໃນລາຍການນີ້"
            emptyHint={emptyHint[tab]}
          />
        </div>
      </Card>
    </div>
  );
}
