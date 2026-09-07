'use client';

import Link from 'next/link';
import { CheckSquare, ThumbsDown, ThumbsUp } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PriorityBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/data-table';
import { Textarea } from '@/components/ui/field';
import { Alert, PageHeader } from '@/components/ui/misc';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { formatDateTime } from '@/lib/format';
import { useApprovals, useDecideApproval } from '@/lib/queries/operations';
import type { Priority } from '@/config/enums';

/**
 * คำขอที่รอผู้ใช้ปัจจุบันอนุมัติ
 *
 * ⚠️ หน้านี้ไม่มีในตารางหน้าจอ 29 หน้าของเอกสาร UI (ประเด็น FE-13)
 *    แต่จำเป็นจริง เพราะ approval.decide ผูกกับแถวไม่ใช่ role
 *    ผู้อนุมัติอาจเป็นหัวหน้าหน่วยงานที่ไม่ได้เป็น agent เลย จึงไม่มีคิวงานให้เข้า
 *    ถ้าไม่มีหน้านี้ คนกลุ่มนั้นจะเข้าถึงงานของตัวเองได้ทางลิงก์ในอีเมลเท่านั้น
 *
 * รอเอกสาร UI ยืนยันรูปแบบหน้าจอนี้อีกครั้ง
 */
export default function ApprovalsPage(): React.JSX.Element {
  const [comments, setComments] = React.useState<Record<number, string>>({});
  const query = useApprovals('me', 'pending');
  const decideMutation = useDecideApproval();

  const pending = query.data?.items ?? [];

  function decide(id: number, approve: boolean): void {
    const comment = comments[id]?.trim() ?? '';

    /*
     * ตรวจที่หน้าจอด้วย ทั้งที่เซิร์ฟเวอร์ตรวจอยู่แล้ว
     *
     * ไม่ใช่การตรวจซ้ำโดยไม่จำเป็น — ผู้ใช้ที่กดปฏิเสธโดยยังไม่พิมพ์เหตุผล
     * ควรเห็นข้อความทันทีตรงที่กด ไม่ใช่รอ 400ms แล้วได้ error จากเซิร์ฟเวอร์
     * ส่วนการตรวจฝั่งเซิร์ฟเวอร์ยังเป็นด่านที่บังคับจริง
     */
    if (!approve && !comment) {
      toast.error('ການປະຕິເສດຕ້ອງລະບຸເຫດຜົນ');
      return;
    }

    decideMutation.mutate(
      { id, decision: approve ? 'approved' : 'rejected', comment: comment || undefined },
      {
        onSuccess: (r) => {
          setComments((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          toast.success(
            r.status === 'rejected'
              ? 'ປະຕິເສດແລ້ວ ເລື່ອງຖືກຍົກເລີກ'
              : r.next_seq !== null
                ? `ອະນຸມັດຂັ້ນນີ້ແລ້ວ ສົ່ງຕໍ່ຂັ້ນທີ ${r.next_seq}`
                : 'ອະນຸມັດຄົບທຸກຂັ້ນແລ້ວ ໂມງ SLA ເລີ່ມນັບຕໍ່',
          );
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ລໍຖ້າອະນຸມັດ"
        description="ຄຳຂໍທີ່ລະບຸໃຫ້ທ່ານເປັນຜູ້ພິຈາລະນາ"
      />

      <Alert tone="info" title="ຂະນະທີ່ຍັງລໍຖ້າອະນຸມັດ ໂມງ SLA ຈະຢຸດນັບ">
        ເວລາທີ່ໃຊ້ພິຈາລະນາຈຶ່ງບໍ່ຖືເປັນຄວາມຊັກຊ້າຂອງທີມໄອທີ
        ແຕ່ຜູ້ຂໍຍັງລໍຖ້າຢູ່ຈິງ ຄວນພິຈາລະນາໃຫ້ໄວ
      </Alert>

      <QueryBoundary query={query}>
      {pending.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckSquare}
            title="ບໍ່ມີຄຳຂໍລໍຖ້າທ່ານພິຈາລະນາ"
            hint="ເມື່ອມີຄຳຂໍທີ່ລະບຸໃຫ້ທ່ານເປັນຜູ້ອະນຸມັດ ຈະມາປາກົດຢູ່ນີ້"
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((item) => (
            <Card key={item.id}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="tabular text-caption text-ink-3">{item.ticket_no}</span>
                    <Link
                      href={`/tickets/${item.ticket_id}`}
                      className="mt-0.5 block text-body font-semibold text-ink hover:text-primary"
                    >
                      {item.subject}
                    </Link>
                    <p className="mt-1 text-caption text-ink-2">
                      ຜູ້ຂໍ {item.requester_name} · {item.company_code}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={item.priority as Priority} withMeter={false} />
                    {item.is_overdue && (
                      <span className="rounded-full bg-sla-breach-bg px-2 py-0.5 text-caption text-sla-breach">
                        ເກີນກຳນົດພິຈາລະນາ
                      </span>
                    )}
                  </div>
                </div>

                <p className="mt-3 rounded border border-hair bg-subtle px-3 py-2 text-caption text-ink-2">
                  ຂັ້ນທີ {item.seq} · ປະເພດຜູ້ອະນຸມັດ {item.approver_type} · ສົ່ງເມື່ອ{' '}
                  {formatDateTime(item.requested_at)}
                  {item.due_at && ` · ກຳນົດ ${formatDateTime(item.due_at)}`}
                </p>

                <div className="mt-3">
                  <label htmlFor={`comment-${item.id}`} className="field-label">
                    ຄວາມເຫັນ
                    <span className="ml-1 font-normal text-ink-3">(ບັງຄັບເມື່ອປະຕິເສດ)</span>
                  </label>
                  <Textarea
                    id={`comment-${item.id}`}
                    rows={2}
                    value={comments[item.id] ?? ''}
                    onChange={(e) => setComments((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="ເຫດຜົນປະກອບການພິຈາລະນາ"
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button disabled={decideMutation.isPending} onClick={() => decide(item.id, true)}>
                    <ThumbsUp className="h-4 w-4" aria-hidden="true" />
                    ອະນຸມັດ
                  </Button>
                  <Button
                    variant="danger"
                    disabled={decideMutation.isPending}
                    onClick={() => decide(item.id, false)}
                  >
                    <ThumbsDown className="h-4 w-4" aria-hidden="true" />
                    ປະຕິເສດ
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      </QueryBoundary>
    </div>
  );
}
