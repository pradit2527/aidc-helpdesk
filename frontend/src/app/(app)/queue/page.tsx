'use client';

import * as React from 'react';

import { TicketList } from '@/components/tickets/ticket-list';
import { Card } from '@/components/ui/card';
import { PageHeader, Tabs } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { useTickets, type TicketListParams } from '@/lib/queries/tickets';
import { useCan, useSession } from '@/lib/session';

type QueueTab = 'unassigned' | 'mine' | 'pending' | 'breached';

/** สถานะที่ยังต้องทำงานอยู่ — ปิดหรือยกเลิกแล้วไม่ควรอยู่ในคิว */
const OPEN_STATUS = 'new,assigned,in_progress,pending_user';

/**
 * คิวของ "ผู้จ่ายงาน" — หัวหน้าทีมและผู้ดูแล
 *
 * กรองที่เซิร์ฟเวอร์ ไม่ใช่ดึงมาทั้งหมดแล้วกรองในเบราว์เซอร์
 * เพราะขอบเขตสิทธิ์บังคับที่ชั้น query อยู่แล้ว และการดึงทุกเรื่อง
 * ของทั้งกลุ่มบริษัทมากรองเองจะช้าลงเรื่อย ๆ ตามจำนวนงานที่สะสม
 *
 * "ยังไม่มีคนรับ" เรียงตามวันที่แจ้ง — เรื่องที่เพิ่งเข้ามาอยู่บนสุดให้หัวหน้าเห็นก่อน
 */
const DISPATCHER_FILTER: Record<QueueTab, TicketListParams> = {
  unassigned: { status: OPEN_STATUS, unassigned: true, sort: '-created_at' },
  mine: { status: OPEN_STATUS, assignee_id: 'me', sort: '-assigned_at' },
  pending: { status: 'pending_user' },
  breached: { status: OPEN_STATUS, sla_status: 'breached' },
};

/**
 * คิวของ "สมาชิกทีม" — เห็นเฉพาะงานที่อยู่ในมือตัวเอง
 *
 * เจ้าของระบบกำหนดว่าคิวของเจ้าหน้าที่ต้องเป็นงานที่หัวหน้าทีมมอบหมายมาให้เท่านั้น
 * ไม่ใช่กองงานรวมของทั้งทีม — การจ่ายงานเป็นหน้าที่ของหัวหน้า ทุกแท็บจึงกรอง
 * assignee_id=me เหมือนกันหมด ต่างกันแค่สถานะ และเรียงตามเวลาที่ถูกมอบหมายล่าสุด
 * เพื่อให้งานที่เพิ่งได้รับอยู่บนสุดเสมอ แม้เรื่องเก่าจะมีคนมาคอมเมนต์เพิ่มก็ตาม
 *
 * (เรื่องที่ยังไม่มีคนรับยังเปิดดูและกด "รับงานนี้" ได้จากเมนู Ticket ทั้งหมด)
 */
const MEMBER_FILTER: Record<Exclude<QueueTab, 'unassigned'>, TicketListParams> = {
  mine: { status: OPEN_STATUS, assignee_id: 'me', sort: '-assigned_at' },
  pending: { status: 'pending_user', assignee_id: 'me', sort: '-assigned_at' },
  breached: {
    status: OPEN_STATUS,
    assignee_id: 'me',
    sla_status: 'breached',
    sort: '-assigned_at',
  },
};

const TAB_LABEL: Record<QueueTab, string> = {
  unassigned: 'ຍັງບໍ່ມີຄົນຮັບ',
  mine: 'ວຽກຂອງຂ້ອຍ',
  pending: 'ລໍຖ້າຜູ້ແຈ້ງ',
  breached: 'ເກີນກຳນົດ',
};

const DISPATCHER_TABS: QueueTab[] = ['unassigned', 'mine', 'pending', 'breached'];
const MEMBER_TABS: QueueTab[] = ['mine', 'pending', 'breached'];

function emptyHint(tab: QueueTab, dispatcher: boolean): string {
  if (tab === 'unassigned') return 'ທຸກເລື່ອງມີຜູ້ຮັບຜິດຊອບແລ້ວ';
  if (tab === 'mine') {
    return dispatcher
      ? 'ທ່ານຍັງບໍ່ໄດ້ຮັບມອບໝາຍວຽກໃດ'
      : 'ຫົວໜ້າທີມຍັງບໍ່ໄດ້ມອບໝາຍວຽກໃຫ້ທ່ານ — ເມື່ອມີວຽກໃໝ່ ຈະຂຶ້ນຢູ່ເທິງສຸດຂອງໜ້ານີ້';
  }
  if (tab === 'pending') {
    return dispatcher ? 'ບໍ່ມີເລື່ອງທີ່ລໍຖ້າຜູ້ແຈ້ງຢູ່' : 'ບໍ່ມີວຽກຂອງທ່ານທີ່ລໍຖ້າຜູ້ແຈ້ງຢູ່';
  }
  return dispatcher ? 'ບໍ່ມີເລື່ອງໃດເກີນກຳນົດ SLA' : 'ບໍ່ມີວຽກຂອງທ່ານທີ່ເກີນກຳນົດ SLA';
}

/**
 * คิวงานของเจ้าหน้าที่ — หน้าทำงานหลักของ agent (US-03)
 *
 * หน้าเดียวสองมุมมอง ตัดสินจากว่าผู้ใช้ "จ่ายงานได้" หรือไม่
 *   - หัวหน้าทีม / ผู้ดูแล: เริ่มที่ "ยังไม่มีคนรับ" เพราะเรื่องที่ยังไม่มีเจ้าของ
 *     คือความเสี่ยงที่แท้จริง และเป็นงานของเขาที่ต้องมอบหมายออกไป
 *   - สมาชิกทีม: เห็นเฉพาะงานที่ถูกมอบหมายให้ตัวเอง งานที่มาใหม่สุดอยู่บนสุด
 *
 * ⚠️ นี่เป็นแค่การจัดหน้าจอ ไม่ใช่การบังคับสิทธิ์ — สิทธิ์มอบหมายจริงตัดสินที่ backend
 *    (mayAssignToOthers) สมาชิกทีมที่ยิง API เองก็ยังมอบหมายให้คนอื่นไม่ได้
 */
export default function QueuePage(): React.JSX.Element {
  const { user } = useSession();
  const isAdminLevel = useCan('user.assign_role');
  const dispatcher = isAdminLevel || user.led_teams.length > 0;

  const tabKeys = dispatcher ? DISPATCHER_TABS : MEMBER_TABS;
  const [tab, setTab] = React.useState<QueueTab>(dispatcher ? 'unassigned' : 'mine');

  // สิทธิ์เปลี่ยนกลางคัน (ถูกตั้งเป็นหัวหน้าทีม / ถูกถอด) — แท็บที่ค้างอยู่อาจไม่มีในชุดใหม่
  const activeTab: QueueTab = tabKeys.includes(tab) ? tab : tabKeys[0]!;

  const filter =
    dispatcher || activeTab === 'unassigned'
      ? DISPATCHER_FILTER[activeTab]
      : MEMBER_FILTER[activeTab];

  const query = useTickets({ ...filter, page: 1, page_size: 50 });

  /*
   * ตัวเลขบนแท็บมาจาก meta.total ของแท็บที่กำลังเปิดอยู่เท่านั้น
   *
   * ถ้าจะให้ครบทุกแท็บต้องยิงหลายคำขอทุกครั้งที่เปิดหน้า ซึ่งบนโฮสต์ที่
   * หลับแล้วตื่นช้าจะทำให้หน้าโหลดนานขึ้นหลายเท่าเพื่อตัวเลขที่ผู้ใช้
   * ยังไม่ได้ดู แท็บอื่นจึงเว้นว่างไว้จนกว่าจะถูกกด แล้วค่อยจำค่าไว้
   *
   * ทางแก้ที่ถูกต้องคือ endpoint เดียวที่คืนจำนวนทุกกลุ่มในคิวรีเดียว
   * ซึ่งยังไม่มี — เมื่อมีแล้วให้เปลี่ยนมาใช้ตัวนั้นแทน
   */
  const [counts, setCounts] = React.useState<Partial<Record<QueueTab, number>>>({});
  const total = query.data?.total;
  React.useEffect(() => {
    if (typeof total !== 'number') return;
    setCounts((prev) => (prev[activeTab] === total ? prev : { ...prev, [activeTab]: total }));
  }, [activeTab, total]);

  const tabs = tabKeys.map((key) => ({
    key,
    label: TAB_LABEL[key],
    ...(counts[key] !== undefined ? { count: counts[key] } : {}),
  }));

  const scopeLine = `ຂອບເຂດ ${user.scoped_companies.map((c) => c.code).join(' · ')}`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ຄິວວຽກຂອງຂ້ອຍ"
        description={
          dispatcher
            ? scopeLine
            : `ສະເພາະວຽກທີ່ຖືກມອບໝາຍໃຫ້ທ່ານ · ວຽກທີ່ມາໃໝ່ສຸດຢູ່ເທິງສະເໝີ · ${scopeLine}`
        }
      />

      <Card>
        <div className="px-4 pt-1 lg:px-5">
          <Tabs tabs={tabs} value={activeTab} onChange={setTab} label="ກຸ່ມວຽກໃນຄິວ" />
        </div>
        <div className="p-4 lg:p-5">
          <QueryBoundary query={query} loadingLabel="ກຳລັງໂຫຼດຄິວວຽກ">
            <TicketList
              tickets={query.data?.items ?? []}
              emptyTitle="ບໍ່ມີເລື່ອງໃນລາຍການນີ້"
              emptyHint={emptyHint(activeTab, dispatcher)}
            />
          </QueryBoundary>
        </div>
      </Card>
    </div>
  );
}
