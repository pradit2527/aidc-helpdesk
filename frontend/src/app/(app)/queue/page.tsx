'use client';

import * as React from 'react';

import { TicketList } from '@/components/tickets/ticket-list';
import { Card } from '@/components/ui/card';
import { PageHeader, Tabs } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { useTickets, type TicketListParams } from '@/lib/queries/tickets';
import { useSession } from '@/lib/session';

type QueueTab = 'unassigned' | 'mine' | 'pending' | 'breached';

/** สถานะที่ยังต้องทำงานอยู่ — ปิดหรือยกเลิกแล้วไม่ควรอยู่ในคิว */
const OPEN_STATUS = 'new,assigned,in_progress,pending_user';

/**
 * เงื่อนไขของแต่ละแท็บ แปลงเป็นพารามิเตอร์ที่ backend เข้าใจ
 *
 * กรองที่เซิร์ฟเวอร์ ไม่ใช่ดึงมาทั้งหมดแล้วกรองในเบราว์เซอร์
 * เพราะขอบเขตสิทธิ์บังคับที่ชั้น query อยู่แล้ว และการดึงทุกเรื่อง
 * ของทั้งกลุ่มบริษัทมากรองเองจะช้าลงเรื่อย ๆ ตามจำนวนงานที่สะสม
 */
const TAB_FILTER: Record<QueueTab, TicketListParams> = {
  unassigned: { status: OPEN_STATUS, unassigned: true },
  mine: { status: OPEN_STATUS, assignee_id: 'me' },
  pending: { status: 'pending_user' },
  breached: { status: OPEN_STATUS, sla_status: 'breached' },
};

const TAB_LABEL: Record<QueueTab, string> = {
  unassigned: 'ຍັງບໍ່ມີຄົນຮັບ',
  mine: 'ວຽກຂອງຂ້ອຍ',
  pending: 'ລໍຖ້າຜູ້ແຈ້ງ',
  breached: 'ເກີນກຳນົດ',
};

const EMPTY_HINT: Record<QueueTab, string> = {
  unassigned: 'ທຸກເລື່ອງມີຜູ້ຮັບຜິດຊອບແລ້ວ',
  mine: 'ທ່ານຍັງບໍ່ໄດ້ຮັບມອບໝາຍວຽກໃດ',
  pending: 'ບໍ່ມີເລື່ອງທີ່ລໍຖ້າຜູ້ແຈ້ງຢູ່',
  breached: 'ບໍ່ມີເລື່ອງໃດເກີນກຳນົດ SLA',
};

const TABS: QueueTab[] = ['unassigned', 'mine', 'pending', 'breached'];

/**
 * คิวงานของเจ้าหน้าที่ — หน้าทำงานหลักของ agent (US-03)
 *
 * แท็บเรียงตามลำดับที่ควรหยิบงาน ไม่ใช่ตามตัวอักษร
 * "ยังไม่มีคนรับ" มาก่อนเสมอ เพราะเรื่องที่ยังไม่มีเจ้าของคือความเสี่ยงที่แท้จริง
 */
export default function QueuePage(): React.JSX.Element {
  const { user } = useSession();
  const [tab, setTab] = React.useState<QueueTab>('unassigned');

  const query = useTickets({ ...TAB_FILTER[tab], page: 1, page_size: 50 });

  /*
   * ตัวเลขบนแท็บมาจาก meta.total ของแท็บที่กำลังเปิดอยู่เท่านั้น
   *
   * ถ้าจะให้ครบทั้งสี่ต้องยิงสี่คำขอทุกครั้งที่เปิดหน้า ซึ่งบนโฮสต์ที่
   * หลับแล้วตื่นช้าจะทำให้หน้าโหลดนานขึ้นสี่เท่าเพื่อตัวเลขที่ผู้ใช้
   * ยังไม่ได้ดู แท็บอื่นจึงเว้นว่างไว้จนกว่าจะถูกกด แล้วค่อยจำค่าไว้
   *
   * ทางแก้ที่ถูกต้องคือ endpoint เดียวที่คืนจำนวนทั้งสี่กลุ่มในคิวรีเดียว
   * ซึ่งยังไม่มี — เมื่อมีแล้วให้เปลี่ยนมาใช้ตัวนั้นแทน
   */
  const [counts, setCounts] = React.useState<Partial<Record<QueueTab, number>>>({});
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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ຄິວວຽກຂອງຂ້ອຍ"
        description={`ຂອບເຂດ ${user.scoped_companies.map((c) => c.code).join(' · ')}`}
      />

      <Card>
        <div className="px-4 pt-1 lg:px-5">
          <Tabs tabs={tabs} value={tab} onChange={setTab} label="ກຸ່ມວຽກໃນຄິວ" />
        </div>
        <div className="p-4 lg:p-5">
          <QueryBoundary query={query} loadingLabel="ກຳລັງໂຫຼດຄິວວຽກ">
            <TicketList
              tickets={query.data?.items ?? []}
              emptyTitle="ບໍ່ມີເລື່ອງໃນລາຍການນີ້"
              emptyHint={EMPTY_HINT[tab]}
            />
          </QueryBoundary>
        </div>
      </Card>
    </div>
  );
}
