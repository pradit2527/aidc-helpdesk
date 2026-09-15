import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '@/lib/api';

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

export interface SupportChatSummary {
  id: number;
  status: 'open' | 'closed';
  company: { id: number; code: string };
  requester: ChatPerson & { department: string | null; job_title: string | null };
  assignee: ChatPerson | null;
  ticket_id: number | null;
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

export interface SupportChatThread extends SupportChatSummary {
  messages: SupportChatMessage[];
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

export const chatKeys = {
  all: ['support-chat'] as const,
  mine: () => [...chatKeys.all, 'mine'] as const,
  inboxAll: () => [...chatKeys.all, 'inbox'] as const,
  inbox: (status: ChatInboxStatus) => [...chatKeys.all, 'inbox', status] as const,
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

/** กล่องแชทของทีมไอที */
export function useChatInbox(
  status: ChatInboxStatus,
  enabled = true,
): UseQueryResult<SupportChatSummary[], Error> {
  return useQuery({
    queryKey: chatKeys.inbox(status),
    queryFn: () => api.get<SupportChatSummary[]>('/support-chat/inbox', { status }),
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
      for (const status of ['open', 'closed'] as const) {
        qc.setQueryData<SupportChatSummary[]>(chatKeys.inbox(status), (old) => old?.map(clear));
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
