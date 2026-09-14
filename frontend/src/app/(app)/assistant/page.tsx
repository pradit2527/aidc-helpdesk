'use client';

import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import * as React from 'react';

import { AssistantConversation } from '@/components/assistant/assistant-conversation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, PageHeader } from '@/components/ui/misc';
import { useAssistantStatus } from '@/lib/assistant';
import { CHATWOOT_ENABLED, openChatwoot } from '@/lib/chatwoot';

/**
 * แชทช่วยเหลือ — หน้าเดียว สองโหมด
 *
 *   - เปิดผู้ช่วย AI ไว้ที่ backend → คุยกับ AI (บทสนทนาเดียวกับแผงแชทลอยทุกหน้า)
 *   - ไม่ได้เปิด AI → คุยกับทีมไอทีตัวจริงผ่าน Chatwoot
 *
 * เดิมหน้านี้มีแต่โหมด AI พอยังไม่ได้ตั้งคีย์ ผู้ใช้เจอช่องพิมพ์ที่พิมพ์ไม่ได้
 * ทั้งที่ทีมไอทีรอตอบอยู่ใน Chatwoot แล้ว เมนูที่กดแล้วใช้ไม่ได้แย่กว่าไม่มีเมนู
 */
export default function AssistantPage(): React.JSX.Element {
  const status = useAssistantStatus();

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

  return <ChatWithItTeam />;
}

function ChatWithItTeam(): React.JSX.Element {
  // เข้าหน้านี้ = ตั้งใจจะแชท เปิดหน้าต่างให้เลย ไม่ต้องให้ไปหาปุ่มกลมมุมจอเอง
  React.useEffect(() => {
    openChatwoot();
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader
        title="ແຊັດກັບທີມໄອທີ"
        description="ພິມຄຳຖາມ ຫຼື ບັນຫາທີ່ພົບ ເຈົ້າໜ້າທີ່ໄອທີຈະຕອບໃນແຊັດ"
      />

      {!CHATWOOT_ENABLED ? (
        <Alert tone="warning" title="ແຊັດຍັງບໍ່ໄດ້ຕັ້ງຄ່າ">
          ຜູ້ດູແລລະບົບຕ້ອງຕັ້ງ NEXT_PUBLIC_CHATWOOT_BASE_URL ແລະ NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN ທີ່ frontend ກ່ອນ
        </Alert>
      ) : (
        <Card>
          <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-subtle text-primary">
              <MessageCircle className="h-7 w-7" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-h3 text-ink">ໜ້າຕ່າງແຊັດເປີດຢູ່ມຸມຂວາລຸ່ມ</h2>
              <p className="text-body-sm text-ink-2">
                ເຈົ້າໜ້າທີ່ຕອບໃນເວລາເຮັດການ ຈັນ–ສຸກ 08:30–17:30 · ນອກເວລາຝາກຂໍ້ຄວາມໄວ້ໄດ້
              </p>
            </div>
            <Button onClick={openChatwoot}>
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              ເປີດແຊັດ
            </Button>
            <p className="max-w-md text-caption text-ink-3">
              ບັນຫາທີ່ຕ້ອງໃຫ້ຊ່າງລົງມືແກ້ ກະລຸນາ{' '}
              <Link href="/tickets/new" className="font-semibold text-primary underline">
                ແຈ້ງ Ticket
              </Link>{' '}
              ເພື່ອໃຫ້ມີການຕິດຕາມຕາມ SLA · ຢ່າພິມລະຫັດຜ່ານ ຫຼື OTP ລົງໃນແຊັດ
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
