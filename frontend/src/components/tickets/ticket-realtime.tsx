'use client';

import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';

import { TICKET_STATUS } from '@/config/enums';
import { ticketKeys } from '@/lib/queries/tickets';
import { useSession } from '@/lib/session';
import { useTicketUpdates, type TicketUpdatedEvent } from '@/lib/ws';

/**
 * ตัวรับการเปลี่ยนแปลงของเรื่องแจ้งแบบเรียลไทม์ — วางครั้งเดียวใน AppShell
 *
 * ไอทีเปลี่ยนสถานะ → หน้ารายละเอียด รายการ "ติดตามเรื่องที่แจ้ง" และคิวของคนอื่นดึงใหม่ทันที
 * แทนที่จะรอรอบ refetch 60 วินาที หรือรอผู้ใช้สลับกลับมาที่แท็บ
 */
export function TicketRealtime(): null {
  const qc = useQueryClient();
  const { user } = useSession();

  const onUpdate = React.useCallback(
    (event: TicketUpdatedEvent) => {
      const bySelf = event.actor_id === user.id;

      // คนที่กดเองได้รายละเอียดฉบับใหม่จากคำตอบของคำสั่งแล้ว — ไม่ต้องยิงซ้ำบนฐานข้อมูลที่อยู่ไกล
      if (!bySelf) void qc.invalidateQueries({ queryKey: ticketKeys.detail(event.ticket_id) });
      void qc.invalidateQueries({ queryKey: ticketKeys.lists() });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });

      // ผู้แจ้งต้องรู้ทันทีว่าเรื่องของตัวเองขยับ แม้กำลังเปิดหน้าอื่นอยู่
      if (!bySelf && event.kind === 'status' && event.status && event.requester_id === user.id) {
        const label = TICKET_STATUS[event.status]?.label ?? event.status;
        toast.info(`ເລື່ອງ ${event.ticket_no ?? ''} ປ່ຽນສະຖານະເປັນ “${label}”`);
      }
    },
    [qc, user.id],
  );

  useTicketUpdates(onUpdate);
  return null;
}
