'use client';

import * as React from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

import type { TicketStatus } from '@/config/enums';
import { ticketKeys } from '@/lib/queries/tickets';
import type { SupportChatMessage } from '@/lib/queries/support-chat';

/**
 * ช่องเรียลไทม์ — socket.io ที่ backend /api/v1/ws
 *
 * ต่อตรงไปยัง backend origin แทนที่จะผ่าน rewrite ของ Next.js เพราะ
 * next.config.ts rewrites() พิสูจน์ไม่ได้ว่าพร็อกซี WebSocket upgrade ผ่านทุกกรณี
 * ที่ localhost ใช้ได้เพราะพอร์ตต่างกันแต่ host เดียวกันยังนับเป็น "same site"
 * คุกกี้ SameSite=Strict จึงยังถูกแนบไปด้วย — ก่อนขึ้น production (คนละโดเมนจริง)
 * ต้องทำ reverse proxy พร้อม WS upgrade หรือทบทวนนโยบายคุกกี้ใหม่
 */
const WS_ORIGIN = process.env.NEXT_PUBLIC_WS_ORIGIN ?? 'http://localhost:8000';

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_ORIGIN, {
      // ต้องตรงกับ path ฝั่ง gateway (/api/v1/ws) เพราะคุกกี้ aidc_at ตั้ง Path=/api/v1
      path: '/api/v1/ws',
      withCredentials: true,
      autoConnect: true,
      /*
       * CSP ของหน้า (src/middleware.ts) เปิด connect-src ไว้แค่ 'self' ws: wss:
       * ขั้น handshake ปกติของ socket.io เริ่มด้วย HTTP long-polling (http://…)
       * ซึ่งไม่ตรงกับ scheme ที่อนุญาต — ข้ามไปต่อด้วย WebSocket ตรง ๆ เท่านั้น
       */
      transports: ['websocket'],
    });
  }
  return socket;
}

/** ปิดการเชื่อมต่อตอนออกจากระบบ — socket เดิมยังถือคุกกี้ของคนที่เพิ่งออก */
export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
}

/** เข้าห้องคอมเมนต์ของเรื่องที่กำลังเปิดอยู่ แล้วรีเฟรชเมื่อมีคอมเมนต์สาธารณะใหม่เข้ามา */
export function useTicketChat(ticketId: number): void {
  const qc = useQueryClient();

  React.useEffect(() => {
    if (!Number.isFinite(ticketId) || ticketId <= 0) return;
    const client = getSocket();

    function join(): void {
      client.emit('ticket:join', { ticketId });
    }
    function onComment(): void {
      // shape ของ comment ใน list กับที่ส่งผ่าน socket ต่างกันเล็กน้อย — invalidate ปลอดภัยกว่า
      void qc.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) });
    }

    if (client.connected) join();
    client.on('connect', join);
    client.on('ticket:comment', onComment);

    return () => {
      client.emit('ticket:leave', { ticketId });
      client.off('connect', join);
      client.off('ticket:comment', onComment);
    };
  }, [ticketId, qc]);
}

/**
 * สัญญาณ "เรื่องเปลี่ยนแล้ว" จาก backend (ดู RealtimeGateway.ticketUpdated)
 *
 * ห้องส่วนตัวได้เลขที่กับสถานะมาด้วย · ห้องทีมไอทีทั้งบริษัทได้แค่ id
 */
export interface TicketUpdatedEvent {
  ticket_id: number;
  actor_id: number;
  kind: 'status' | 'assign' | 'priority' | 'comment';
  ticket_no?: string;
  status?: TicketStatus;
  requester_id?: number;
}

/**
 * ฟังการเปลี่ยนแปลงของทุกเรื่องที่ผู้ใช้เกี่ยวข้อง
 *
 * อาศัยห้อง user:{id} และห้องทีมไอทีที่ chat:subscribe เข้าไว้แล้ว (SupportChatRealtime)
 * จึงไม่ต้องสมัครห้องเพิ่ม — ห้อง ticket:{id} ของหน้าที่เปิดอยู่มาจาก useTicketChat
 */
export function useTicketUpdates(onUpdate: (event: TicketUpdatedEvent) => void): void {
  const ref = React.useRef(onUpdate);
  React.useEffect(() => {
    ref.current = onUpdate;
  });

  React.useEffect(() => {
    const client = getSocket();
    const listener = (event: TicketUpdatedEvent): void => ref.current(event);
    client.on('ticket:updated', listener);
    return () => {
      client.off('ticket:updated', listener);
    };
  }, []);
}

export interface ChatMessageEvent {
  chat_id: number;
  company_id: number;
  requester_id: number;
  message: SupportChatMessage;
}

/**
 * สมัครรับแชทช่วยเหลือ — ผู้ใช้ได้ข้อความในห้องของตัวเอง ทีมไอทีได้ของทุกห้องในขอบเขต
 * ส่ง chat:subscribe ซ้ำทุกครั้งที่เชื่อมต่อใหม่ เพราะ socket ใหม่ไม่มีห้องติดมา
 */
export function useSupportChatSocket(
  onMessage: (event: ChatMessageEvent) => void,
  onReconnect: () => void,
): void {
  const messageRef = React.useRef(onMessage);
  const reconnectRef = React.useRef(onReconnect);
  React.useEffect(() => {
    messageRef.current = onMessage;
    reconnectRef.current = onReconnect;
  });

  React.useEffect(() => {
    const client = getSocket();
    let connectedBefore = client.connected;

    const subscribe = (): void => {
      client.emit('chat:subscribe');
      // ระหว่างหลุดอาจพลาดข้อความไป — เชื่อมต่อกลับมาแล้วดึงของล่าสุดหนึ่งครั้ง
      if (connectedBefore) reconnectRef.current();
      connectedBefore = true;
    };
    const listener = (event: ChatMessageEvent): void => messageRef.current(event);

    if (client.connected) client.emit('chat:subscribe');
    client.on('connect', subscribe);
    client.on('chat:message', listener);
    return () => {
      client.off('connect', subscribe);
      client.off('chat:message', listener);
    };
  }, []);
}
