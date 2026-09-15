'use client';

import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { appendChatMessage, chatKeys, type SupportChatThread } from '@/lib/queries/support-chat';
import { useSession } from '@/lib/session';
import { useSupportChatSocket, type ChatMessageEvent } from '@/lib/ws';

/** ชื่อ event บน window ที่ปุ่มแชทฟังเพื่อแสดงแจ้งเตือน */
export const CHAT_MESSAGE_EVENT = 'aidc:chat-message';

/**
 * ตัวรับข้อความแชทเรียลไทม์ของทั้งแอป — วางไว้ครั้งเดียวใน AppShell
 *
 * เขียนข้อความเข้า cache ทันที ห้องที่เปิดดูอยู่จึงเห็นข้อความใหม่โดยไม่ต้องรอดึงจาก server
 * แล้วส่งต่อเป็น event บน window ให้ส่วนที่ต้องแจ้งเตือน (ปุ่มแชท) ตัดสินใจเอง
 */
export function SupportChatRealtime(): null {
  const qc = useQueryClient();
  const { user } = useSession();

  const onMessage = React.useCallback(
    (event: ChatMessageEvent) => {
      const fromSelf = event.message.sender?.id === user.id;
      appendChatMessage(qc, event.message, { markUnread: !fromSelf && !event.message.is_system });

      // ห้องของตัวเองที่ยังไม่อยู่ใน cache (เช่นทีมไอทีเปิดห้องใหม่ให้) — ดึงทั้งห้อง
      if (event.requester_id === user.id) {
        const mine = qc.getQueryData<SupportChatThread | null>(chatKeys.mine());
        if (!mine || mine.id !== event.chat_id) void qc.invalidateQueries({ queryKey: chatKeys.mine() });
      }
      // ลำดับห้องและจุดยังไม่อ่านในกล่องแชทเปลี่ยน — ให้ดึงใหม่
      void qc.invalidateQueries({ queryKey: chatKeys.inboxAll() });

      window.dispatchEvent(new CustomEvent<ChatMessageEvent>(CHAT_MESSAGE_EVENT, { detail: event }));
    },
    [qc, user.id],
  );

  const onReconnect = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: chatKeys.all });
  }, [qc]);

  useSupportChatSocket(onMessage, onReconnect);
  return null;
}
