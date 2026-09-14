import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { Priority } from '@/config/enums';
import { api, ApiError, readCsrfToken, refreshSession, type ApiErrorCode } from '@/lib/api';

/**
 * ผู้ช่วย AI ตอบปัญหาไอที — ฝั่งหน้าจอ
 *
 * คำตอบมาเป็น Server-Sent Events ผ่าน fetch ไม่ใช่ EventSource
 * เพราะ EventSource ส่งได้แค่ GET และแนบ header X-CSRF-Token ไม่ได้
 * ส่วนคำถามพร้อมประวัติต้องส่งเป็น body ของ POST
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

export interface AssistantTicketDraft {
  subject: string;
  description: string;
  category_id: number;
  category_name: string;
  impact: 'org_wide' | 'department' | 'individual';
  urgency: 'high' | 'medium' | 'low';
  priority: Priority;
}

export type AssistantEvent =
  | { type: 'delta'; text: string }
  | { type: 'status'; text: string }
  | { type: 'ticket_draft'; draft: AssistantTicketDraft }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

export function useAssistantStatus(): UseQueryResult<{ enabled: boolean; model: string }, Error> {
  return useQuery({
    queryKey: ['assistant', 'status'],
    queryFn: () => api.get<{ enabled: boolean; model: string }>('/assistant/status'),
    staleTime: 5 * 60_000,
    refetchInterval: false,
  });
}

/**
 * ส่งคำถามแล้วอ่านคำตอบทีละเหตุการณ์
 *
 * resolve เมื่อสตรีมจบ · reject ด้วย ApiError เมื่อเซิร์ฟเวอร์ปฏิเสธก่อนเริ่มสตรีม
 * (ยังไม่ล็อกอิน ปิดใช้งาน ถามถี่เกิน) — ข้อผิดพลาดระหว่างตอบมาเป็นเหตุการณ์ error แทน
 */
export async function streamAssistantChat(
  messages: readonly AssistantTurn[],
  onEvent: (event: AssistantEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  // อ่าน CSRF ใหม่ทุกครั้งที่ยิง — การต่ออายุ session ออก token ใหม่ ค่าเก่าจะได้ 403
  const post = (): Promise<Response> => {
    const csrf = readCsrfToken();
    return fetch(`${BASE_URL}/assistant/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ messages }),
      signal,
    });
  };

  let res = await post();
  if (res.status === 401 && (await refreshSession())) res = await post();

  if (!res.ok || !res.body) {
    const payload = (await res.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    throw new ApiError(
      res.status,
      (payload?.error?.code ?? 'SERVER_ERROR') as ApiErrorCode,
      payload?.error?.message ?? 'ເຊື່ອມຕໍ່ຜູ້ຊ່ວຍ AI ບໍ່ໄດ້',
    );
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;

    // เหตุการณ์หนึ่งจบด้วยบรรทัดว่าง — ชิ้นที่อ่านได้อาจตัดกลางเหตุการณ์ จึงเก็บส่วนที่เหลือไว้รอบหน้า
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = raw
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) onEvent(JSON.parse(data) as AssistantEvent);
      boundary = buffer.indexOf('\n\n');
    }
  }
}
