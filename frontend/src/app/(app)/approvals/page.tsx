'use client';

import Link from 'next/link';
import { CheckSquare, ThumbsDown, ThumbsUp } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { PriorityBadge, StatusBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/data-table';
import { Textarea } from '@/components/ui/field';
import { Alert, MockNotice, PageHeader } from '@/components/ui/misc';
import { formatDateTime } from '@/lib/format';
import { MY_APPROVALS } from '@/mocks/data';

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
  const [decided, setDecided] = React.useState<number[]>([]);
  const [comments, setComments] = React.useState<Record<number, string>>({});

  const pending = MY_APPROVALS.filter((a) => !decided.includes(a.step.id));

  function decide(stepId: number, approve: boolean): void {
    if (!approve && !comments[stepId]?.trim()) {
      toast.error('ການປະຕິເສດຕ້ອງລະບຸເຫດຜົນ');
      return;
    }
    setDecided((prev) => [...prev, stepId]);
    toast.success(approve ? 'ອະນຸມັດແລ້ວ' : 'ປະຕິເສດແລ້ວ ເລື່ອງຈະຖືກຍົກເລີກ');
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ລໍຖ້າອະນຸມັດ"
        description="ຄຳຂໍທີ່ລະບຸໃຫ້ທ່ານເປັນຜູ້ພິຈາລະນາ"
      />

      <MockNotice endpoint="GET /approvals?assignee=me" />

      <Alert tone="info" title="ຂະນະທີ່ຍັງລໍຖ້າອະນຸມັດ ໂມງ SLA ຈະຢຸດນັບ">
        ເວລາທີ່ໃຊ້ພິຈາລະນາຈຶ່ງບໍ່ຖືເປັນຄວາມຊັກຊ້າຂອງທີມໄອທີ
        ແຕ່ຜູ້ຂໍຍັງລໍຖ້າຢູ່ຈິງ ຄວນພິຈາລະນາໃຫ້ໄວ
      </Alert>

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
          {pending.map(({ ticket, step }) => (
            <Card key={step.id}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="tabular text-caption text-ink-3">{ticket.ticket_no}</span>
                    <Link
                      href={`/tickets/${ticket.id}`}
                      className="mt-0.5 block text-body font-semibold text-ink hover:text-primary"
                    >
                      {ticket.subject}
                    </Link>
                    <p className="mt-1 text-caption text-ink-2">
                      ຜູ້ຂໍ {ticket.requester.full_name} · {ticket.company.code} ·{' '}
                      {ticket.department?.name}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={ticket.priority} withMeter={false} />
                    <StatusBadge status={ticket.status} pendingReason={ticket.pending_reason} />
                  </div>
                </div>

                <p className="mt-3 rounded border border-hair bg-subtle px-3 py-2 text-caption text-ink-2">
                  ຂັ້ນທີ {step.seq} · ຜູ້ພິຈາລະນາ {step.approver.full_name} · ຮັບເລື່ອງເມື່ອ{' '}
                  {formatDateTime(ticket.updated_at)}
                </p>

                <div className="mt-3">
                  <label htmlFor={`comment-${step.id}`} className="field-label">
                    ຄວາມເຫັນ
                    <span className="ml-1 font-normal text-ink-3">(ບັງຄັບເມື່ອປະຕິເສດ)</span>
                  </label>
                  <Textarea
                    id={`comment-${step.id}`}
                    rows={2}
                    value={comments[step.id] ?? ''}
                    onChange={(e) =>
                      setComments((prev) => ({ ...prev, [step.id]: e.target.value }))
                    }
                    placeholder="ເຫດຜົນປະກອບການພິຈາລະນາ"
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => decide(step.id, true)}>
                    <ThumbsUp className="h-4 w-4" aria-hidden="true" />
                    ອະນຸມັດ
                  </Button>
                  <Button variant="danger" onClick={() => decide(step.id, false)}>
                    <ThumbsDown className="h-4 w-4" aria-hidden="true" />
                    ປະຕິເສດ
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
