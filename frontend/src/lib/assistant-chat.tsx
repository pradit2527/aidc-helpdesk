'use client';

import * as React from 'react';

import { ApiError } from '@/lib/api';
import {
  streamAssistantChat,
  type AssistantEvent,
  type AssistantTicketDraft,
} from '@/lib/assistant';

/**
 * บทสนทนากับผู้ช่วย AI — ใช้ร่วมกันระหว่างแผงแชทลอยทุกหน้ากับหน้า /assistant
 *
 * อยู่ใน AppShell ไม่ใช่ในแผงแชท เพื่อให้คุยค้างไว้แล้วเปลี่ยนหน้าได้โดยบทสนทนาไม่หาย
 * ผู้ใช้ที่ AI บอกให้ "ลองเปิดหน้า ticket ดู" ต้องกลับมาคุยต่อจากเดิมได้
 *
 * ⚠️ ไม่เก็บลง localStorage โดยตั้งใจ — ออกจากระบบแล้ว AppShell ถูกถอดออก บทสนทนาหายตาม
 *    คนที่นั่งเครื่องนี้ต่อจึงอ่านเรื่องที่คนก่อนคุยไว้ไม่ได้
 */

/** ประวัติที่ส่งไปต่อคำถาม — เก่ากว่านี้ตัดทิ้ง ค่าใช้จ่ายของทุกคำถามโตตามความยาวบทสนทนา */
const MAX_HISTORY = 20;

export interface DraftCard {
  draft: AssistantTicketDraft;
  state: 'pending' | 'created' | 'dismissed';
  ticket?: { id: number; no: string };
}

export interface ChatEntry {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  /** ข้อความแจ้งข้อผิดพลาด ไม่ใช่คำตอบ — ไม่ส่งกลับไปเป็นประวัติ */
  failed?: boolean;
  drafts: DraftCard[];
}

interface AssistantChatValue {
  entries: ChatEntry[];
  busy: boolean;
  /** ผู้ช่วยกำลังทำอะไรอยู่ เช่นกำลังค้นหา ticket — null เมื่อกำลังพิมพ์คำตอบหรือว่าง */
  activity: string | null;
  send: (text: string) => Promise<void>;
  stop: () => void;
  /** เริ่มบทสนทนาใหม่ — หยุดคำตอบที่ค้างอยู่ด้วย */
  reset: () => void;
  patchDraft: (entryId: number, index: number, change: Partial<DraftCard>) => void;
}

const AssistantChatContext = React.createContext<AssistantChatValue | null>(null);

export function AssistantChatProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [entries, setEntries] = React.useState<ChatEntry[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [activity, setActivity] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const nextId = React.useRef(1);

  // ออกจากระบบระหว่างตอบ = ยกเลิกคำขอ ไม่ปล่อยให้คิดเงินต่อทั้งที่ไม่มีใครอ่าน
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const patchEntry = React.useCallback(
    (id: number, change: (entry: ChatEntry) => ChatEntry): void =>
      setEntries((list) => list.map((e) => (e.id === id ? change(e) : e))),
    [],
  );

  const send = React.useCallback(
    async (text: string): Promise<void> => {
      const question = text.trim();
      if (!question || abortRef.current) return;

      const userEntry: ChatEntry = { id: nextId.current++, role: 'user', text: question, drafts: [] };
      const reply: ChatEntry = { id: nextId.current++, role: 'assistant', text: '', drafts: [] };

      const history = [...entries, userEntry]
        .filter((e) => !e.failed && e.text.trim().length > 0)
        .slice(-MAX_HISTORY)
        .map((e) => ({ role: e.role, content: e.text }));

      setEntries((list) => [...list, userEntry, reply]);
      setBusy(true);
      setActivity('ກຳລັງຄິດ...');

      const controller = new AbortController();
      abortRef.current = controller;

      const onEvent = (event: AssistantEvent): void => {
        switch (event.type) {
          case 'delta':
            setActivity(null);
            patchEntry(reply.id, (e) => ({ ...e, text: e.text + event.text }));
            break;
          case 'status':
            setActivity(event.text);
            break;
          case 'ticket_draft':
            patchEntry(reply.id, (e) => ({
              ...e,
              drafts: [...e.drafts, { draft: event.draft, state: 'pending' }],
            }));
            break;
          case 'error':
            patchEntry(reply.id, (e) => ({
              ...e,
              failed: e.text.length === 0,
              text: e.text ? `${e.text}\n\n${event.message}` : event.message,
            }));
            break;
          case 'done':
            break;
        }
      };

      try {
        await streamAssistantChat(history, onEvent, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) {
          patchEntry(reply.id, (e) => ({ ...e, failed: e.text.length === 0, text: e.text || 'ຢຸດແລ້ວ' }));
        } else {
          const message =
            error instanceof ApiError ? error.message : 'ເຊື່ອມຕໍ່ຜູ້ຊ່ວຍ AI ບໍ່ໄດ້ ກະລຸນາລອງໃໝ່';
          patchEntry(reply.id, (e) => ({ ...e, failed: true, text: message }));
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setBusy(false);
          setActivity(null);
        }
      }
    },
    [entries, patchEntry],
  );

  const stop = React.useCallback((): void => abortRef.current?.abort(), []);

  const reset = React.useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setActivity(null);
    setEntries([]);
  }, []);

  const patchDraft = React.useCallback(
    (entryId: number, index: number, change: Partial<DraftCard>): void =>
      patchEntry(entryId, (e) => ({
        ...e,
        drafts: e.drafts.map((d, i) => (i === index ? { ...d, ...change } : d)),
      })),
    [patchEntry],
  );

  const value = React.useMemo<AssistantChatValue>(
    () => ({ entries, busy, activity, send, stop, reset, patchDraft }),
    [entries, busy, activity, send, stop, reset, patchDraft],
  );

  return <AssistantChatContext.Provider value={value}>{children}</AssistantChatContext.Provider>;
}

export function useAssistantChat(): AssistantChatValue {
  const context = React.useContext(AssistantChatContext);
  if (!context) throw new Error('useAssistantChat ต้องอยู่ภายใต้ <AssistantChatProvider>');
  return context;
}
