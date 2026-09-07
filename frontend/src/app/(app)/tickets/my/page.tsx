'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import * as React from 'react';

import { TicketList } from '@/components/tickets/ticket-list';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader, Tabs } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { useTickets, type TicketListParams } from '@/lib/queries/tickets';

type MyTab = 'open' | 'waiting' | 'done' | 'all';

/**
 * เงื่อนไขของแต่ละแท็บ
 *
 * ⚠️ ทุกแท็บต้องมี requester_id: 'me' เสมอ
 *    backend แปลง 'me' เป็น id ของผู้เรียกเอง ฝั่งนี้จึงส่งเลขผู้ใช้ไปไม่ได้
 *    ซึ่งเป็นเรื่องดี — ถ้าส่งเลขได้ ใครก็แก้เป็นเลขคนอื่นแล้วดูเรื่องของเขา
 */
const TAB_FILTER: Record<MyTab, TicketListParams> = {
  open: { requester_id: 'me', status: 'new,assigned,in_progress' },
  waiting: { requester_id: 'me', status: 'pending_user' },
  done: { requester_id: 'me', status: 'resolved,closed,cancelled' },
  all: { requester_id: 'me' },
};

const TAB_LABEL: Record<MyTab, string> = {
  open: 'ກຳລັງດຳເນີນການ',
  waiting: 'ລໍຖ້າຂ້ອຍຕອບ',
  done: 'ຈົບແລ້ວ',
  all: 'ທັງໝົດ',
};

const TABS: MyTab[] = ['open', 'waiting', 'done', 'all'];

/**
 * เรื่องที่ตนแจ้ง (US-02)
 *
 * หน้าแรกของพนักงานทั่วไป จึงเลือกให้แท็บ "ยังดำเนินการอยู่" มาก่อน
 * คนแจ้งอยากรู้ก่อนอื่นว่าเรื่องของตัวเองถึงไหนแล้ว ไม่ใช่ดูเรื่องที่ปิดไปแล้ว
 */
export default function MyTicketsPage(): React.JSX.Element {
  const [tab, setTab] = React.useState<MyTab>('open');
  const [page, setPage] = React.useState(1);

  const query = useTickets({ ...TAB_FILTER[tab], page, page_size: 20 });

  // จำจำนวนของแท็บที่เคยเปิด — ดูเหตุผลเต็มที่หน้าคิว (queue/page.tsx)
  const [counts, setCounts] = React.useState<Partial<Record<MyTab, number>>>({});
  const total = query.data?.total;
  React.useEffect(() => {
    if (typeof total !== 'number') return;
    setCounts((prev) => (prev[tab] === total ? prev : { ...prev, [tab]: total }));
  }, [tab, total]);

  const tabs = TABS.map((key) => ({
    key,
    label: TAB_LABEL[key],
    ...(counts[key] !== undefined ? { count: counts[key] } : {}),
  }));

  function selectTab(next: MyTab): void {
    setTab(next);
    // กลับหน้าแรกเสมอเมื่อเปลี่ยนแท็บ ไม่งั้นผู้ใช้ที่อยู่หน้า 3 ของแท็บหนึ่ง
    // จะเจอหน้าว่างในแท็บที่มีรายการไม่ถึงสามหน้า แล้วคิดว่าไม่มีข้อมูล
    setPage(1);
  }

  const newTicketButton = (
    <Button asChild>
      <Link href="/tickets/new">
        <Plus className="h-4 w-4" aria-hidden="true" />
        ແຈ້ງບັນຫາ
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ເລື່ອງຂອງຂ້ອຍ"
        description="ຕິດຕາມສະຖານະເລື່ອງທີ່ທ່ານແຈ້ງເຂົ້າມາ"
        actions={newTicketButton}
      />

      <Card>
        <div className="px-4 pt-1 lg:px-5">
          <Tabs tabs={tabs} value={tab} onChange={selectTab} label="ກຸ່ມເລື່ອງຂອງຂ້ອຍ" />
        </div>
        <div className="p-4 lg:p-5">
          <QueryBoundary query={query} loadingLabel="ກຳລັງໂຫຼດເລື່ອງຂອງທ່ານ">
            <TicketList
              tickets={query.data?.items ?? []}
              emptyTitle="ຍັງບໍ່ມີເລື່ອງໃນລາຍການນີ້"
              emptyHint="ເມື່ອທ່ານແຈ້ງບັນຫາເຂົ້າມາ ເລື່ອງຈະມາປາກົດຢູ່ນີ້"
              emptyAction={newTicketButton}
            />
          </QueryBoundary>
        </div>
      </Card>
    </div>
  );
}
