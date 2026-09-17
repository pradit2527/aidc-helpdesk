import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import { chatKeys } from '@/lib/queries/support-chat';

/**
 * โครงการที่รับซัพพอร์ต (AIDC Support Hub)
 *
 * หนึ่งเว็บของบริษัท = หนึ่ง inbox แบบ Website ใน Chatwoot = หนึ่งโครงการที่นี่
 * ทีมอื่นเอา widget ไปฝังในเว็บตัวเองด้วย script tag บรรทัดเดียว โดยไม่ต้องรู้จัก
 * Chatwoot เลย — สิ่งที่เขาต้องรู้มีแค่ "รหัสโครงการ" ที่ตั้งไว้ในหน้านี้
 *
 * ⚠️ website_token ไม่ใช่ความลับ มันติดไปกับทุกหน้าเว็บที่ฝัง widget อยู่แล้ว
 *    การแสดงบนหน้าจอผู้ดูแลจึงไม่ได้เปิดเผยอะไรเพิ่ม ส่วนค่าที่เป็นความลับจริง
 *    คือ HMAC key ของ inbox ซึ่งไม่เคยผ่านหน้าจอนี้และต้องอยู่ที่เซิร์ฟเวอร์
 *    ของเว็บที่ฝัง widget เท่านั้น
 */

export type SupportProjectLocale = 'lo' | 'th' | 'en';

export interface SupportProject {
  id: number;
  /** ตัวพิมพ์ใหญ่ [A-Z0-9_] 2–40 ตัว — ค่าที่ทีมอื่นใส่ใน data-project */
  code: string;
  name: string;
  website_url: string | null;
  locale: SupportProjectLocale;
  is_active: boolean;
  /** null = โครงการส่วนกลาง สร้างได้เฉพาะผู้ดูแลระบบ */
  company: { id: number; code: string } | null;
  default_category: { id: number; name: string } | null;
  team: { id: number; name: string } | null;
  chatwoot: { inbox_id: number | null; website_token: string | null };
  open_chats: number;
  created_at: string;
  /**
   * เส้นทางที่ Chatwoot ต้องยิง webhook กลับมา เช่น /api/v1/integrations/chatwoot/events
   *
   * null = ยังไม่ได้เปิดใช้ webhook ที่เซิร์ฟเวอร์ ซึ่งไม่ใช่ความผิดพลาด — ระบบ
   * ทำงานได้ด้วยการดึงข้อมูลเป็นรอบอยู่แล้ว webhook แค่ทำให้เร็วขึ้นเท่านั้น
   *
   * optional บนสายเพราะเพิ่มมาทีหลัง API รุ่นก่อนหน้าไม่ส่งช่องนี้มา
   */
  webhook_url_hint?: string | null;
}

/** inbox ที่มีอยู่จริงบนเซิร์ฟเวอร์ Chatwoot — ใช้เลือกแทนการพิมพ์เลขเอง */
export interface ChatwootInbox {
  id: number;
  name: string;
  channel_type: string;
  website_url: string | null;
  website_token: string | null;
  /** ไม่ใช่ null = inbox นี้ถูกโครงการอื่นจองไปแล้ว เลือกซ้ำไม่ได้ */
  linked_project_code: string | null;
}

export interface SupportProjectInput {
  code: string;
  name: string;
  website_url?: string | null;
  company_id?: number | null;
  default_category_id?: number | null;
  team_id?: number | null;
  chatwoot_inbox_id?: number | null;
  chatwoot_website_token?: string | null;
  locale?: SupportProjectLocale;
  is_active?: boolean;
}

/** รหัสโครงการที่ backend ยอมรับ — ตรวจฝั่งหน้าจอเพื่อบอกเร็ว ไม่ใช่เพื่อกัน */
export const PROJECT_CODE_PATTERN = /^[A-Z0-9_]{2,40}$/;

export const supportProjectKeys = {
  all: ['support-projects'] as const,
  list: () => [...supportProjectKeys.all, 'list'] as const,
  chatwootInboxes: () => [...supportProjectKeys.all, 'chatwoot-inboxes'] as const,
};

/**
 * โครงการทั้งหมดที่ผู้เรียกเห็นได้
 *
 * ใช้สองที่: หน้าผู้ดูแล และตัวกรองในกล่องแชท — กล่องแชทเรียกด้วยสิทธิ์ของ
 * เจ้าหน้าที่ธรรมดา ถ้าเซิร์ฟเวอร์ปฏิเสธหรือยังไม่มี endpoint นี้ หน้าจอต้อง
 * ซ่อนตัวกรองไปเฉย ๆ ไม่ใช่ขึ้นข้อผิดพลาดคาหน้ากล่องแชท
 */
export function useSupportProjects(enabled = true): UseQueryResult<SupportProject[], Error> {
  return useQuery({
    queryKey: supportProjectKeys.list(),
    queryFn: () => api.get<SupportProject[]>('/support-projects'),
    enabled,
    staleTime: 60_000,
    /*
     * ไม่ลองซ้ำ — ผู้เรียกที่ไม่มีสิทธิ์หรือ API รุ่นเก่าได้ 403/404 ทันที
     * การลองซ้ำสามรอบแค่ทำให้ตัวกรองค้างอยู่ในสถานะกำลังโหลดนานขึ้นเปล่า ๆ
     */
    retry: false,
  });
}

/**
 * inbox บนเซิร์ฟเวอร์ Chatwoot
 *
 * ต้องมีสิทธิ์ user.assign_role และตอบ 503 เมื่อต่อ Chatwoot ไม่ได้ จึงดึงเฉพาะ
 * ตอนผู้ใช้กดปุ่ม "ດຶງຈາກ Chatwoot" ไม่ใช่ตอนเปิดกล่องแก้ไข — การเปิดกล่องเพื่อ
 * แก้แค่ชื่อโครงการไม่ควรยิงไปหาระบบภายนอกที่อาจล่มอยู่
 */
export function useChatwootInboxes(enabled: boolean): UseQueryResult<ChatwootInbox[], Error> {
  return useQuery({
    queryKey: supportProjectKeys.chatwootInboxes(),
    queryFn: () => api.get<ChatwootInbox[]>('/support-projects/chatwoot-inboxes'),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * ล้างแคชหลังแก้โครงการ
 *
 * ล้างคีย์ของกล่องแชทด้วย เพราะป้ายชื่อโครงการบนแต่ละห้องกับรายการในตัวกรอง
 * มาจากที่นี่ — เปลี่ยนชื่อโครงการแล้วกล่องแชทยังโชว์ชื่อเก่าจนกว่าจะรีเฟรชทั้งหน้า
 * เป็นอาการที่อธิบายกับผู้ใช้ไม่ได้
 */
function useInvalidateProjects(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: supportProjectKeys.all });
    void qc.invalidateQueries({ queryKey: chatKeys.inboxAll() });
  };
}

export function useCreateSupportProject(): UseMutationResult<
  SupportProject,
  Error,
  SupportProjectInput
> {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (input: SupportProjectInput) => api.post<SupportProject>('/support-projects', input),
    onSuccess: invalidate,
  });
}

/** แก้โครงการเดิม — code แก้ไม่ได้หลังสร้าง เพราะมันฝังอยู่ในทุกหน้าเว็บที่ฝัง widget ไปแล้ว */
export type UpdateSupportProjectInput = Partial<Omit<SupportProjectInput, 'code'>> & { id: number };

export function useUpdateSupportProject(): UseMutationResult<
  SupportProject,
  Error,
  UpdateSupportProjectInput
> {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateSupportProjectInput) =>
      api.patch<SupportProject>(`/support-projects/${id}`, body),
    onSuccess: invalidate,
  });
}

/**
 * สคริปต์ที่ทีมอื่นก็อปไปวางในเว็บของตัวเอง
 *
 * origin มาจากหน้าเว็บที่ผู้ดูแลเปิดอยู่ ไม่ใช่ค่าคงที่ในโค้ด — ผู้ดูแลที่เปิด
 * จาก staging จะได้สคริปต์ที่ชี้ staging ซึ่งเป็นสิ่งที่เขาต้องการจริงตอนทดสอบ
 */
export function embedSnippet(code: string, origin: string): string {
  return `<script src="${origin}/kit/v1/aidc-support.js" data-project="${code}" defer></script>`;
}
