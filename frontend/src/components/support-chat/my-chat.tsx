'use client';

import { Headphones } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { ChatThread } from '@/components/support-chat/chat-thread';
import { ApiError } from '@/lib/api';
import {
  useMarkChatRead,
  useMyChat,
  useSendMyChatFile,
  useSendMyChatMessage,
  type ChatFileInput,
} from '@/lib/queries/support-chat';
import { useSession } from '@/lib/session';

/**
 * ห้องแชทของผู้ใช้กับทีมไอที — ใช้ในแผงลอยและหน้าเต็ม
 *
 * @param active แผง/หน้านี้กำลังแสดงอยู่ไหม — ใช้ตัดสินว่าข้อความที่เข้ามาถือว่าอ่านแล้ว
 */
export function MyChat({ active, autoFocus = false }: { active: boolean; autoFocus?: boolean }): React.JSX.Element {
  const { user } = useSession();
  const chat = useMyChat();
  const send = useSendMyChatMessage();
  const sendFile = useSendMyChatFile();
  const markRead = useMarkChatRead();

  const thread = chat.data ?? null;
  const unread = thread?.unread ?? false;
  const chatId = thread?.id;
  const markReadMutate = markRead.mutate;

  // เปิดดูอยู่แล้วมีข้อความใหม่ = อ่านแล้ว — ไม่งั้นจุดแจ้งเตือนค้างทั้งที่ผู้ใช้เห็นข้อความแล้ว
  React.useEffect(() => {
    if (active && unread && chatId !== undefined) markReadMutate(chatId);
  }, [active, unread, chatId, markReadMutate]);

  const onSend = async (body: string): Promise<boolean> => {
    try {
      await send.mutateAsync(body);
      return true;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ສົ່ງຂໍ້ຄວາມບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່');
      return false;
    }
  };

  const onSendFile = async (input: ChatFileInput): Promise<boolean> => {
    try {
      await sendFile.mutateAsync(input);
      return true;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ສົ່ງໄຟລ໌ບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່');
      return false;
    }
  };

  if (chat.isLoading) {
    return (
      <div className="grid h-full place-items-center text-body-sm text-ink-3" role="status">
        ກຳລັງໂຫຼດແຊັດ...
      </div>
    );
  }

  return (
    <ChatThread
      messages={thread?.messages ?? []}
      viewerId={user.id}
      onSend={onSend}
      onSendFile={onSendFile}
      sending={send.isPending || sendFile.isPending}
      autoFocus={autoFocus}
      placeholder="ພິມບັນຫາ ຫຼື ຄຳຖາມ... (Enter ເພື່ອສົ່ງ)"
      composerNotice={
        thread?.status === 'closed'
          ? 'ແຊັດກ່ອນໜ້າຖືກປິດແລ້ວ — ພິມຂໍ້ຄວາມໃໝ່ເພື່ອເລີ່ມແຊັດຄັ້ງໃໝ່'
          : undefined
      }
      emptyState={
        <div className="flex h-full flex-col items-center justify-center gap-3 py-6 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-subtle text-primary">
            <Headphones className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-body-sm font-semibold text-ink">ແຊັດກັບທີມໄອທີ</p>
          <p className="max-w-xs text-caption text-ink-2">
            ພິມບັນຫາທີ່ພົບໄດ້ເລີຍ ເຈົ້າໜ້າທີ່ຈະຕອບໃນແຊັດນີ້ທັນທີທີ່ເຫັນ · ຈັນ–ສຸກ 08:30–17:30
          </p>
          <p className="max-w-xs text-caption text-ink-3">ຢ່າພິມລະຫັດຜ່ານ ຫຼື OTP ລົງໃນແຊັດ</p>
        </div>
      }
    />
  );
}
