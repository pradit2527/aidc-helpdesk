'use client';

import * as React from 'react';

import { AssistantConversation } from '@/components/assistant/assistant-conversation';
import { Card } from '@/components/ui/card';
import { Alert, PageHeader } from '@/components/ui/misc';
import { useAssistantStatus } from '@/lib/assistant';

/**
 * ผู้ช่วย AI ตอบปัญหาไอที — แบบเต็มหน้า
 *
 * บทสนทนาเป็นก้อนเดียวกับแผงแชทลอยทุกหน้า (AssistantChatProvider ใน AppShell)
 * คุยในแผงแล้วกดขยายมาหน้านี้ได้โดยไม่เริ่มใหม่
 *
 * ไม่มีการเก็บฝั่งเซิร์ฟเวอร์ — ออกจากระบบแล้วบทสนทนาหาย
 * เรื่องที่ต้องมีหลักฐานต้องกลายเป็น ticket ซึ่งผู้ช่วยช่วยร่างให้กดยืนยันได้
 */
export default function AssistantPage(): React.JSX.Element {
  const status = useAssistantStatus();
  const disabled = status.data?.enabled === false;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader
        title="ຖາມ AI ຜູ້ຊ່ວຍໄອທີ"
        description="ຖາມບັນຫາການໃຊ້ງານຄອມພິວເຕີ ອີເມວ ເຄືອຂ່າຍ ຫຼື ຕິດຕາມ Ticket ຂອງທ່ານ — ຖ້າຕ້ອງໃຫ້ທີມໄອທີຊ່ວຍ AI ຈະຮ່າງ Ticket ໃຫ້ກົດຢືນຢັນ"
      />

      {disabled && (
        <Alert tone="warning" title="ຜູ້ຊ່ວຍ AI ຍັງບໍ່ໄດ້ເປີດໃຊ້">
          ຜູ້ດູແລລະບົບຕ້ອງຕັ້ງ ANTHROPIC_API_KEY ແລະ ASSISTANT_ENABLED=true ທີ່ backend ກ່ອນ
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="flex h-[calc(100dvh-18rem)] min-h-[440px] flex-col">
          <AssistantConversation disabled={disabled} />
        </div>
      </Card>
    </div>
  );
}
