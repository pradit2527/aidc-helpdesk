import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { ApiError, api } from '@/lib/api';
import { ticketKeys } from '@/lib/queries/tickets';
import type { TicketListItem } from '@/lib/types';

/**
 * แชทช่วยเหลือระหว่างผู้ใช้กับทีมไอที
 *
 * ข้อความใหม่มาทาง WebSocket (ดู components/support-chat/chat-realtime.tsx)
 * ซึ่งเขียนเข้า cache ตรง ๆ ผ่าน appendChatMessage — การดึงซ้ำตามเวลาด้านล่าง
 * เป็นแค่ตาข่ายกันพลาดตอนเครือข่ายหลุด ไม่ใช่ทางหลัก
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

export interface ChatPerson {
  id: number;
  full_name: string;
}

export type ChatAttachmentKind = 'image' | 'audio' | 'file';

export interface ChatAttachment {
  kind: ChatAttachmentKind;
  name: string;
  mime_type: string;
  size: number;
  /** ต่อท้าย base URL ของ API — ใช้ chatFileUrl() */
  path: string;
}

export interface SupportChatMessage {
  id: number;
  chat_id: number;
  /** ว่างได้เมื่อข้อความเป็นไฟล์อย่างเดียว */
  body: string;
  is_system: boolean;
  from_staff: boolean;
  sender: ChatPerson | null;
  attachment: ChatAttachment | null;
  created_at: string;
}

/**
 * ที่มาของห้องแชท
 *
 *   helpdesk = พนักงานที่ล็อกอินกดปุ่มแชทในระบบนี้
 *   widget   = ผู้เข้าชมเว็บของบริษัทที่ฝัง widget ไว้ (AIDC Support Hub)
 *
 * ห้องแบบ widget ไม่มีบัญชีผู้ใช้อยู่เบื้องหลัง — requester ที่ backend ส่งมา
 * เป็นค่าสมมุติ (id: 0) เพื่อให้รูปร่างข้อมูลเหมือนกันทั้งสองแบบ ห้ามนำ id นั้น
 * ไปทำลิงก์ไปหน้าโปรไฟล์ผู้ใช้ หรือแสดงบนหน้าจอเด็ดขาด
 */
export type ChatOrigin = 'helpdesk' | 'widget';

/** โครงการที่รับซัพพอร์ต — เว็บหนึ่งเว็บ = หนึ่งโครงการ */
export interface ChatProjectRef {
  id: number;
  code: string;
  name: string;
}

/** ข้อมูลติดต่อของผู้เข้าชมเว็บ — มีเฉพาะห้องแบบ widget และขาดได้ทุกช่อง */
export interface ChatVisitorContact {
  name: string | null;
  email: string | null;
  phone: string | null;
  /**
   * เว็บที่ผู้เข้าชมมาจาก เซ็นรับรองตัวตนนี้ด้วย HMAC ที่เซิร์ฟเวอร์ของเขาแล้ว
   *
   * ⚠️ ต่างกันมากกับ "ผู้เข้าชมพิมพ์อีเมลมาเอง"
   *    อีเมลที่พิมพ์เองไม่ได้พิสูจน์อะไรเลย ใครก็พิมพ์อีเมลผู้บริหารได้
   *    เจ้าหน้าที่ต้องเห็นความต่างนี้ก่อนจะทำอะไรที่ต้องยืนยันตัวตน เช่นรีเซ็ตรหัสผ่าน
   *
   * เป็น optional บนสายเพราะเพิ่มมาทีหลัง — ไม่มีค่า = ยังไม่ยืนยัน (ปลอดภัยกว่า)
   */
  verified?: boolean;
}

export interface SupportChatSummary {
  id: number;
  status: 'open' | 'closed';
  company: { id: number; code: string };
  requester: ChatPerson & { department: string | null; job_title: string | null };
  assignee: ChatPerson | null;
  ticket_id: number | null;
  /*
   * สามช่องล่างนี้เป็น optional บนสาย ไม่ใช่เพราะ backend เลือกส่งบ้างไม่ส่งบ้าง
   * แต่เพราะหน้าจอนี้ถูกปล่อยก่อน API ที่เพิ่มช่องพวกนี้ — ของเก่าที่ไม่มีช่อง
   * ต้องยังใช้งานได้ตามปกติ ไม่ใช่แสดงหน้าว่างหรือ undefined เต็มจอ
   */
  origin?: ChatOrigin;
  project?: ChatProjectRef | null;
  contact?: ChatVisitorContact | null;
  last_message_at: string;
  last_message: {
    body: string;
    from_staff: boolean;
    is_system: boolean;
    attachment_kind: ChatAttachmentKind | null;
  } | null;
  unread: boolean;
  created_at: string;
  closed_at: string | null;
}

/** เรื่องที่ห้องนี้ยกระดับไป — ห้องแชทใช้ตัดสินว่าจะขึ้นการ์ดให้คะแนนไหม */
export interface ChatLinkedTicket {
  id: number;
  ticket_no: string;
  status: string;
  satisfaction_score: number | null;
  /** backend ตัดสินให้แล้ว (ผู้แจ้งเท่านั้น · เรื่องเสร็จแล้ว · ยังไม่เคยให้) — หน้าจอห้ามเดาเอง */
  can_rate: boolean;
}

export interface SupportChatThread extends SupportChatSummary {
  messages: SupportChatMessage[];
  /** optional บนสาย — API รุ่นก่อนหน้าไม่มีช่องนี้ */
  ticket?: ChatLinkedTicket | null;
}

export interface SendChatMessageResult {
  chat: SupportChatSummary;
  message: SupportChatMessage;
}

export interface ChatFileInput {
  file: Blob;
  fileName: string;
  /** ข้อความประกอบ — ไม่บังคับ */
  body?: string;
}

export type ChatInboxStatus = 'open' | 'closed';

/**
 * ตัวกรองกล่องแชทนอกเหนือจากสถานะ
 *
 * ค่า null = ไม่กรอง ไม่ใช่ "กรองเอาค่าว่าง" — buildUrl ของ lib/api ตัดค่า null
 * ออกจาก query string ให้อยู่แล้ว จึงส่งลงไปตรง ๆ ได้
 */
export interface ChatInboxFilters {
  projectId?: number | null;
  origin?: ChatOrigin | null;
}

export const chatKeys = {
  all: ['support-chat'] as const,
  mine: () => [...chatKeys.all, 'mine'] as const,
  inboxAll: () => [...chatKeys.all, 'inbox'] as const,
  /*
   * ตัวกรองเป็นส่วนหนึ่งของคีย์ ไม่ใช่ค่าที่ส่งไปเฉย ๆ
   * ถ้าไม่ใส่ การสลับตัวกรองจะเขียนทับผลลัพธ์ของอีกตัวกรองหนึ่งใน cache เดียวกัน
   * แล้วผู้ใช้จะเห็นรายการของโครงการก่อนหน้าค้างอยู่ชั่วครู่ทุกครั้งที่สลับ
   */
  inbox: (status: ChatInboxStatus, filters: ChatInboxFilters = {}) =>
    [
      ...chatKeys.all,
      'inbox',
      status,
      { projectId: filters.projectId ?? null, origin: filters.origin ?? null },
    ] as const,
  thread: (id: number) => [...chatKeys.all, 'thread', id] as const,
};

/** ป้ายแทนข้อความเมื่อข้อความเป็นไฟล์อย่างเดียว — ใช้ในการแจ้งเตือนและรายการแชท */
export const ATTACHMENT_LABEL: Record<ChatAttachmentKind, string> = {
  image: 'ຮູບພາບ',
  audio: 'ຂໍ້ຄວາມສຽງ',
  file: 'ໄຟລ໌ແນບ',
};

/** ข้อความสั้นสำหรับแจ้งเตือน — ข้อความที่มีแต่ไฟล์แสดงเป็นป้ายแทนความว่างเปล่า */
export function messagePreview(message: SupportChatMessage, max = 80): string {
  const text = message.body || (message.attachment ? ATTACHMENT_LABEL[message.attachment.kind] : '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** URL เปิดไฟล์ในแชท — ผ่าน proxy /api/v1 ของหน้าเว็บเอง คุกกี้ล็อกอินจึงแนบไปด้วย */
export function chatFileUrl(attachment: ChatAttachment): string {
  return `${BASE_URL}${attachment.path}`;
}

/** ตาข่ายกันพลาด — ข้อความจริงมาทาง WebSocket ภายในเสี้ยววินาที */
const SAFETY_REFETCH_MS = 45_000;

/**
 * เติมข้อความใหม่เข้าห้องที่อยู่ใน cache — ใช้ทั้งตอนส่งเองและตอนได้รับทาง WebSocket
 * ข้อความเดียวกันมาได้สองทาง (คำตอบของ POST กับ event) จึงกันซ้ำด้วย id
 */
export function appendChatMessage(
  qc: QueryClient,
  message: SupportChatMessage,
  options: { markUnread: boolean },
): void {
  const apply = (thread: SupportChatThread | null | undefined): SupportChatThread | null | undefined => {
    if (!thread || thread.id !== message.chat_id) return thread;
    if (thread.messages.some((m) => m.id === message.id)) return thread;
    return {
      ...thread,
      messages: [...thread.messages, message],
      last_message_at: message.created_at,
      last_message: {
        body: messagePreview(message, 140),
        from_staff: message.from_staff,
        is_system: message.is_system,
        attachment_kind: message.attachment?.kind ?? null,
      },
      unread: thread.unread || options.markUnread,
    };
  };

  qc.setQueryData<SupportChatThread | null>(chatKeys.mine(), (old) => apply(old) ?? null);
  qc.setQueryData<SupportChatThread>(chatKeys.thread(message.chat_id), (old) => apply(old) ?? undefined);

  /*
   * ข้อความระบบ = สถานะของเรื่องที่ผูกไว้เพิ่งเปลี่ยน (แก้เสร็จ ปิด ให้คะแนนแล้ว)
   * ข้อมูลเรื่องในห้อง (ticket.can_rate) ไม่ได้มากับข้อความ จึงดึงห้องใหม่
   * ไม่งั้นการ์ดให้คะแนนจะไม่ขึ้นจนกว่าตาข่ายกันพลาดจะดึงรอบถัดไป (สูงสุด 45 วินาที)
   */
  if (message.is_system) {
    void qc.invalidateQueries({ queryKey: chatKeys.mine() });
    void qc.invalidateQueries({ queryKey: chatKeys.thread(message.chat_id) });
  }
}

function toFormData(input: ChatFileInput): FormData {
  const form = new FormData();
  form.append('file', input.file, input.fileName);
  const body = input.body?.trim();
  if (body) form.append('body', body);
  return form;
}

/** หลังผู้ใช้ส่งเข้าห้องของตัวเอง — ห้องเดิมเติมข้อความ ห้องใหม่ (ครั้งแรก/ห้องเดิมปิด) ดึงทั้งห้อง */
function afterSendMine(qc: QueryClient, result: SendChatMessageResult): void {
  const current = qc.getQueryData<SupportChatThread | null>(chatKeys.mine());
  if (current && current.id === result.chat.id) {
    appendChatMessage(qc, result.message, { markUnread: false });
  } else {
    void qc.invalidateQueries({ queryKey: chatKeys.mine() });
  }
}

/** ห้องแชทของฉันกับทีมไอที */
export function useMyChat(enabled = true): UseQueryResult<SupportChatThread | null, Error> {
  return useQuery({
    queryKey: chatKeys.mine(),
    queryFn: () => api.get<SupportChatThread | null>('/support-chat/mine'),
    enabled,
    refetchInterval: SAFETY_REFETCH_MS,
    staleTime: 10_000,
  });
}

export function useSendMyChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api.post<SendChatMessageResult>('/support-chat/mine/messages', { body }),
    onSuccess: (result) => afterSendMine(qc, result),
  });
}

/** ส่งรูป เสียง หรือไฟล์หาทีมไอที */
export function useSendMyChatFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChatFileInput) =>
      api.post<SendChatMessageResult>('/support-chat/mine/attachments', toFormData(input)),
    onSuccess: (result) => afterSendMine(qc, result),
  });
}

/**
 * กล่องแชทของทีมไอที
 *
 * project_id / origin เป็นตัวกรองที่เพิ่มมาพร้อม Support Hub — ค่าว่างไม่ถูกส่ง
 * ไปใน query string เลย API รุ่นที่ยังไม่รู้จักสองตัวนี้จึงตอบเหมือนเดิมทุกประการ
 */
export function useChatInbox(
  status: ChatInboxStatus,
  filters: ChatInboxFilters = {},
  enabled = true,
): UseQueryResult<SupportChatSummary[], Error> {
  const projectId = filters.projectId ?? null;
  const origin = filters.origin ?? null;

  return useQuery({
    queryKey: chatKeys.inbox(status, { projectId, origin }),
    queryFn: () =>
      api.get<SupportChatSummary[]>('/support-chat/inbox', {
        status,
        project_id: projectId,
        origin,
      }),
    enabled,
    refetchInterval: SAFETY_REFETCH_MS,
    staleTime: 10_000,
  });
}

export function useChatThread(id: number | null): UseQueryResult<SupportChatThread, Error> {
  return useQuery({
    queryKey: chatKeys.thread(id ?? 0),
    queryFn: () => api.get<SupportChatThread>(`/support-chat/${id}`),
    enabled: id !== null,
    refetchInterval: SAFETY_REFETCH_MS,
    staleTime: 10_000,
  });
}

export function useSendChatMessage(chatId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api.post<SendChatMessageResult>(`/support-chat/${chatId}/messages`, { body }),
    onSuccess: (result) => {
      appendChatMessage(qc, result.message, { markUnread: false });
      void qc.invalidateQueries({ queryKey: chatKeys.inboxAll() });
    },
  });
}

/** ทีมไอทีส่งรูป เสียง หรือไฟล์ในห้องแชท */
export function useSendChatFile(chatId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChatFileInput) =>
      api.post<SendChatMessageResult>(`/support-chat/${chatId}/attachments`, toFormData(input)),
    onSuccess: (result) => {
      appendChatMessage(qc, result.message, { markUnread: false });
      void qc.invalidateQueries({ queryKey: chatKeys.inboxAll() });
    },
  });
}

export function useMarkChatRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (chatId: number) => api.post<void>(`/support-chat/${chatId}/read`),
    onSuccess: (_result, chatId) => {
      const clear = <T extends SupportChatSummary>(item: T): T =>
        item.id === chatId ? { ...item, unread: false } : item;
      qc.setQueryData<SupportChatThread | null>(chatKeys.mine(), (old) => (old ? clear(old) : old));
      qc.setQueryData<SupportChatThread>(chatKeys.thread(chatId), (old) => (old ? clear(old) : old));
      /*
       * ล้างจุดยังไม่อ่านในกล่องแชท "ทุกชุดตัวกรอง" ไม่ใช่แค่ open/closed
       *
       * ตั้งแต่มีตัวกรองโครงการ คีย์ของกล่องแชทมีได้หลายชุดพร้อมกันใน cache
       * (เช่นชุดไม่กรอง กับชุดกรองเฉพาะ ILP) การเขียนทับเฉพาะคีย์ที่เดาไว้ล่วงหน้า
       * จะเหลือชุดอื่นค้างจุดแดงไว้ แล้วตัวเลข "ยังไม่ได้อ่าน" บนแท็บก็ไม่ลด
       */
      qc.setQueriesData<SupportChatSummary[]>({ queryKey: chatKeys.inboxAll() }, (old) =>
        old?.map(clear),
      );
    },
  });
}

/**
 * เขียนสถานะล่าสุดของห้องลงทุกที่ที่ห้องนั้นโผล่อยู่
 *
 * ห้องเดียวกันอยู่ใน cache ได้หลายที่พร้อมกัน — ห้องที่เปิดค้างอยู่ กับกล่องแชท
 * ทุกชุดตัวกรอง (ดูหมายเหตุใน useMarkChatRead) การเขียนแค่ที่เดียวจะเหลืออีกที่
 * ถือค่าเก่า แล้วปุ่ม "ຍົກເປັນ Ticket" จะกลับมาโผล่ทั้งที่ยกไปแล้ว
 *
 * รวมข้อมูลทับของเดิม ไม่ใช่แทนที่ทั้งก้อน — คำตอบของ API เป็นรูปย่อที่ไม่มี messages
 */
function applyChatSummary(qc: QueryClient, chat: SupportChatSummary): void {
  qc.setQueryData<SupportChatThread>(chatKeys.thread(chat.id), (old) =>
    old ? { ...old, ...chat } : old,
  );
  qc.setQueriesData<SupportChatSummary[]>({ queryKey: chatKeys.inboxAll() }, (old) =>
    old?.map((item) => (item.id === chat.id ? { ...item, ...chat } : item)),
  );
}

/**
 * ยกแชทเป็น Ticket
 *
 * ทุกช่องไม่บังคับยกเว้นหัวข้อ — ที่ไม่ส่งมา backend เติมค่าตั้งต้นของโครงการ
 * และของหมวดหมู่ให้เอง (ห้ามเดาค่าพวกนั้นที่หน้าจอ กติกาอยู่ฝั่งเดียวเท่านั้น)
 */
export interface ConvertChatToTicketInput {
  subject: string;
  /** ไม่ส่ง = ให้ backend ประกอบรายละเอียดจากบทสนทนาเอง */
  description?: string;
  category_id?: number;
  impact?: string;
  urgency?: string;
}

/** ข้อมูลติดต่อ ณ วันที่ยกเป็น Ticket — เก็บไว้กับใบนั้น ไม่เปลี่ยนตามที่ผู้เข้าชมแก้ทีหลัง */
export interface ChatContactSnapshot {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface ConvertChatToTicketResult {
  chat: SupportChatSummary;
  ticket: TicketListItem;
  /** null = ห้องที่ไม่ได้มาจาก widget หรือผู้เข้าชมไม่ได้ฝากข้อมูลติดต่อไว้ */
  contact_snapshot: ChatContactSnapshot | null;
}

export function useConvertChatToTicket(chatId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConvertChatToTicketInput) =>
      api.post<ConvertChatToTicketResult>(`/support-chat/${chatId}/ticket`, input),
    onSuccess: (result) => {
      applyChatSummary(qc, result.chat);
      /*
       * เรื่องใหม่โผล่ได้ทั้งในคิวทีมและในรายการของผู้แจ้ง จึงล้างทั้งกลุ่ม
       * ไม่ใช่เฉพาะรายการเดียว — เหตุผลเดียวกับ useCreateTicket
       */
      void qc.invalidateQueries({ queryKey: ticketKeys.all });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      /*
       * 409 = มีคนอื่นยกห้องนี้เป็น Ticket ไปแล้วระหว่างที่กล่องนี้เปิดค้างอยู่
       * ดึงห้องใหม่ทันที ปุ่มจะกลายเป็นลิงก์ไปใบที่มีอยู่แล้วเอง
       */
      if (error instanceof ApiError && error.status === 409) {
        void qc.invalidateQueries({ queryKey: chatKeys.thread(chatId) });
        void qc.invalidateQueries({ queryKey: chatKeys.inboxAll() });
      }
    },
  });
}

/**
 * ผู้ถามให้คะแนนเรื่องที่ห้องนี้ยกระดับไป
 *
 * เรื่องที่รอยืนยันจะปิดไปพร้อมคะแนน — ล้าง cache ของเรื่องด้วย
 * ไม่งั้นหน้ารายการ/หน้าประวัติยังโชว์ปุ่ม "ยืนยันปิด" ของเรื่องที่ปิดไปแล้ว
 */
export function useRateChat(chatId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (score: number) =>
      api.post<SupportChatThread>(`/support-chat/${chatId}/rating`, { score }),
    onSuccess: (thread) => {
      qc.setQueryData<SupportChatThread | null>(chatKeys.mine(), (old) =>
        old && old.id === thread.id ? thread : old,
      );
      qc.setQueryData<SupportChatThread>(chatKeys.thread(chatId), thread);
      void qc.invalidateQueries({ queryKey: ticketKeys.all });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      // 409 = ให้ไปแล้วจากอีกแท็บ หรือเรื่องขยับสถานะไปแล้ว — ดึงห้องใหม่ให้การ์ดตรงความจริง
      if (error instanceof ApiError && error.status === 409) {
        void qc.invalidateQueries({ queryKey: chatKeys.mine() });
        void qc.invalidateQueries({ queryKey: chatKeys.thread(chatId) });
      }
    },
  });
}

export function useCloseChat(chatId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SupportChatSummary>(`/support-chat/${chatId}/close`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chatKeys.thread(chatId) });
      void qc.invalidateQueries({ queryKey: chatKeys.inboxAll() });
    },
  });
}
