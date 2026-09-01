'use client';

import { CalendarOff, Plus } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/data-table';
import { Input } from '@/components/ui/field';
import { Alert, MockNotice, PageHeader } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { weekdayName } from '@/lib/format';
import { BUSINESS_HOURS, HOLIDAYS } from '@/mocks/data';

/**
 * เวลาทำการและวันหยุด (FR-36)
 *
 * ทุกค่าในหน้านี้เข้าไปอยู่ในสูตรคำนวณ SLA โดยตรง
 * เปิดวันเสาร์เป็นวันทำการหนึ่งครั้ง = กำหนดเวลาของ P2–P4 ทุกใบเลื่อนทันที
 * จึงเตือนไว้ชัดเจนแทนที่จะปล่อยให้เป็นสวิตช์ธรรมดา
 */
export default function BusinessHoursPage(): React.JSX.Element {
  const [rows, setRows] = React.useState(BUSINESS_HOURS);
  const workingDays = rows.filter((r) => r.is_working_day).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ເວລາເຮັດວຽກ ແລະ ວັນພັກ"
        description="ໃຊ້ຄຳນວນນາທີເຮັດວຽກຂອງທຸກເລື່ອງທີ່ບໍ່ແມ່ນ P1"
      />

      <MockNotice endpoint="GET /business-hours · GET /holidays" />

      <Alert tone="warning" title="ການປ່ຽນຄ່າໃນໜ້ານີ້ກະທົບກຳນົດເວລາຂອງທຸກເລື່ອງທັນທີ">
        1 ມື້ເຮັດວຽກຄິດເປັນ 540 ນາທີ ຈາກ 5 ມື້ເຮັດວຽກຕໍ່ອາທິດ
        ຖ້າເພີ່ມ ຫຼື ຫຼຸດວັນເຮັດວຽກ ຄ່າ SLA ຂອງ P2–P4 ຈະເລື່ອນຕາມ
        ແລະ ຈະບໍ່ຕົງກັບເອກະສານ AIDC-IT-SLA-001 ອີກຕໍ່ໄປ
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>ເວລາເຮັດວຽກປະຈຳອາທິດ</CardTitle>
          <span className="tabular text-body-sm text-ink-2">{workingDays} ມື້ເຮັດວຽກຕໍ່ອາທິດ</span>
        </CardHeader>
        <CardBody className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.day_of_week}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded border px-3 py-2',
                row.is_working_day ? 'border-hair' : 'border-dashed border-hair bg-subtle',
              )}
            >
              <label className="flex min-h-tap min-w-[150px] flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={row.is_working_day}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.day_of_week === row.day_of_week
                          ? { ...r, is_working_day: e.target.checked }
                          : r,
                      ),
                    )
                  }
                  className="h-4 w-4 flex-none rounded border-control"
                />
                <span className="text-body-sm font-semibold">{weekdayName(row.day_of_week)}</span>
              </label>

              {row.is_working_day ? (
                <span className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={row.start_time}
                    aria-label={`ເວລາເລີ່ມ ${weekdayName(row.day_of_week)}`}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.day_of_week === row.day_of_week
                            ? { ...r, start_time: e.target.value }
                            : r,
                        ),
                      )
                    }
                    className="w-[130px]"
                  />
                  <span aria-hidden="true" className="text-ink-3">
                    –
                  </span>
                  <Input
                    type="time"
                    value={row.end_time}
                    aria-label={`ເວລາເລີກ ${weekdayName(row.day_of_week)}`}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.day_of_week === row.day_of_week ? { ...r, end_time: e.target.value } : r,
                        ),
                      )
                    }
                    className="w-[130px]"
                  />
                </span>
              ) : (
                <span className="text-body-sm text-ink-3">ບໍ່ແມ່ນວັນເຮັດວຽກ</span>
              )}
            </div>
          ))}
        </CardBody>
        <CardFooter className="justify-end">
          <Button onClick={() => toast.success('ບັນທຶກເວລາເຮັດວຽກແລ້ວ')}>ບັນທຶກ</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ວັນພັກປະຈຳປີ</CardTitle>
          <Button size="sm" onClick={() => toast.info('ຟອມເພີ່ມວັນພັກ')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            ເພີ່ມວັນພັກ
          </Button>
        </CardHeader>
        {HOLIDAYS.length === 0 ? (
          <>
            <div className="px-4 pt-4 lg:px-5">
              <Alert tone="danger" title="ຍັງບໍ່ໄດ້ຮັບປະຕິທິນວັນພັກສະບັບທາງການ">
                ຕາບໃດທີ່ຕາຕະລາງນີ້ຍັງວ່າງ ລະບົບຈະນັບວັນພັກທຸກມື້ເປັນມື້ເຮັດວຽກ
                ແລະ ກຳນົດເວລາຂອງ P2–P4 ຈະສັ້ນກວ່າຄວາມເປັນຈິງ —
                ຕ້ອງໃສ່ໃຫ້ຄົບກ່ອນເປີດໃຊ້ງານຈິງ
              </Alert>
            </div>
            <EmptyState
              icon={CalendarOff}
              title="ຍັງບໍ່ມີວັນພັກໃນລະບົບ"
              hint="ເພີ່ມວັນພັກຕາມປະກາດຂອງບໍລິສັດ"
            />
          </>
        ) : (
          <CardBody>
            <ul className="divide-y divide-hair">
              {HOLIDAYS.map((h) => (
                <li key={h.id} className="flex items-center justify-between py-2">
                  <span className="text-body-sm">{h.name}</span>
                  <span className="tabular text-caption text-ink-2">{h.holiday_date}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
