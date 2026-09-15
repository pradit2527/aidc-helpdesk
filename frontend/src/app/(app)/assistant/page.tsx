'use client';

import Link from 'next/link';
import { MessagesSquare } from 'lucide-react';
import * as React from 'react';

import { AssistantConversation } from '@/components/assistant/assistant-conversation';
import { MyChat } from '@/components/support-chat/my-chat';
import { Card } from '@/components/ui/card';
import { Alert, PageHeader } from '@/components/ui/misc';
import { useAssistantStatus } from '@/lib/assistant';
import { useCan } from '@/lib/session';

/**
 * แชทช่วยเหลือ — หน้าเดียว สองโหมด
 *
 *   - เปิดผู้ช่วย AI ไว้ที่ backend → คุยกับ AI (บทสนทนาเดียวกับแผงแชทลอยทุกหน้า)
 *   - ไม่ได้เปิด AI → คุยกับทีมไอทีตัวจริงแบบเรียลไทม์ ในระบบนี้เอง
 *
 * ทีมไอทีที่เปิดหน้านี้ถูกพาไปกล่องแชท — งานของเขาคือตอบแชทของคนอื่น ไม่ใช่ถามเอง
 */
export default function AssistantPage(): React.JSX.Element {
  const status = useAssistantStatus();
  const isStaff = useCan('ticket.change_status');

  if (status.isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl py-10 text-center text-body-sm text-ink-3" role="status">
        ກຳລັງໂຫຼດ...
      </div>
    );
  }

  if (status.data?.enabled) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <PageHeader
          title="ຖາມ AI ຜູ້ຊ່ວຍໄອທີ"
          description="ຖາມບັນຫາການໃຊ້ງານຄອມພິວເຕີ ອີເມວ ເຄືອຂ່າຍ ຫຼື ຕິດຕາມ Ticket ຂອງທ່ານ — ຖ້າຕ້ອງໃຫ້ທີມໄອທີຊ່ວຍ AI ຈະຮ່າງ Ticket ໃຫ້ກົດຢືນຢັນ"
        />
        <Card className="overflow-hidden">
          <div className="flex h-[calc(100dvh-16rem)] min-h-[440px] flex-col">
            <AssistantConversation disabled={false} />
          </div>
        </Card>
      </div>
    );
  }

  if (isStaff) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Alert tone="info" title="ທ່ານຢູ່ໃນທີມໄອທີ">
          ແຊັດຈາກຜູ້ໃຊ້ທັງໝົດຢູ່ໃນກ່ອງແຊັດ —{' '}
          <Link href="/chats" className="inline-flex items-center gap-1 font-semibold text-primary underline">
            <MessagesSquare className="h-4 w-4" aria-hidden="true" />
            ໄປກ່ອງແຊັດ
          </Link>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader
        title="ແຊັດກັບທີມໄອທີ"
        description="ພິມບັນຫາ ຫຼື ຄຳຖາມ ເຈົ້າໜ້າທີ່ໄອທີຈະຕອບໃນແຊັດນີ້ທັນທີທີ່ເຫັນ · ບັນຫາທີ່ຕ້ອງໃຫ້ຊ່າງລົງມືແກ້ ກະລຸນາແຈ້ງ Ticket"
      />
      <Card className="overflow-hidden">
        <div className="flex h-[calc(100dvh-16rem)] min-h-[440px] flex-col">
          <MyChat active autoFocus />
        </div>
      </Card>
    </div>
  );
}
