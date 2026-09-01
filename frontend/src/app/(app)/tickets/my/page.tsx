'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import * as React from 'react';

import { TicketList } from '@/components/tickets/ticket-list';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MockNotice, PageHeader, Tabs } from '@/components/ui/misc';
import { TICKETS } from '@/mocks/data';

type MyTab = 'open' | 'waiting' | 'done' | 'all';

/**
 * เรื่องที่ตนแจ้ง (US-02)
 *
 * หน้าแรกของพนักงานทั่วไป จึงเลือกให้แท็บ "ยังดำเนินการอยู่" มาก่อน
 * คนแจ้งอยากรู้ก่อนอื่นว่าเรื่องของตัวเองถึงไหนแล้ว ไม่ใช่ดูเรื่องที่ปิดไปแล้ว
 */
export default function MyTicketsPage(): React.JSX.Element {
  const [tab, setTab] = React.useState<MyTab>('open');

  // ของจริงกรองที่ backend ด้วย requester_id ของผู้ใช้ปัจจุบัน
  // ไม่ใช่กรองฝั่ง client เพราะจะได้ข้อมูลของคนอื่นมาถึงเบราว์เซอร์ก่อนแล้ว
  const mine = TICKETS;

  const buckets = {
    open: mine.filter((t) => ['new', 'assigned', 'in_progress'].includes(t.status)),
    waiting: mine.filter((t) => t.status === 'pending_user'),
    done: mine.filter((t) => ['resolved', 'closed', 'cancelled'].includes(t.status)),
    all: mine,
  };

  const tabs = [
    { key: 'open' as const, label: 'ກຳລັງດຳເນີນການ', count: buckets.open.length },
    { key: 'waiting' as const, label: 'ລໍຖ້າຂ້ອຍຕອບ', count: buckets.waiting.length },
    { key: 'done' as const, label: 'ຈົບແລ້ວ', count: buckets.done.length },
    { key: 'all' as const, label: 'ທັງໝົດ', count: buckets.all.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ເລື່ອງຂອງຂ້ອຍ"
        description="ຕິດຕາມສະຖານະເລື່ອງທີ່ທ່ານແຈ້ງເຂົ້າມາ"
        actions={
          <Button asChild>
            <Link href="/tickets/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              ແຈ້ງບັນຫາ
            </Link>
          </Button>
        }
      />

      <MockNotice endpoint="GET /tickets?scope=mine" />

      <Card>
        <div className="px-4 pt-1 lg:px-5">
          <Tabs tabs={tabs} value={tab} onChange={setTab} label="ກຸ່ມເລື່ອງຂອງຂ້ອຍ" />
        </div>
        <div className="p-4 lg:p-5">
          <TicketList
            tickets={buckets[tab]}
            emptyTitle="ຍັງບໍ່ມີເລື່ອງໃນລາຍການນີ້"
            emptyHint="ເມື່ອທ່ານແຈ້ງບັນຫາເຂົ້າມາ ເລື່ອງຈະມາປາກົດຢູ່ນີ້"
            emptyAction={
              <Button asChild>
                <Link href="/tickets/new">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  ແຈ້ງບັນຫາ
                </Link>
              </Button>
            }
          />
        </div>
      </Card>
    </div>
  );
}
