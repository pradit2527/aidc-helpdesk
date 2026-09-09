import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api, type Page } from '@/lib/api';
import type { TicketDetail, TicketListItem } from '@/lib/types';

/**
 * คิวรีของโดเมนเรื่องแจ้ง
 *
 * รวมคีย์ไว้ที่เดียว เพราะ TanStack Query ตัดสินว่าจะล้างแคชอันไหน
 * จากการเทียบคีย์ ถ้าปล่อยให้แต่ละหน้าประกอบคีย์เอง วันหนึ่งจะมีคน
 * เขียนคีย์ไม่ตรงกับตอน invalidate แล้วหน้าจอค้างข้อมูลเก่าโดยไม่มีอะไรฟ้อง
 */
export const ticketKeys = {
  all: ['tickets'] as const,
  list: (filters: TicketListParams) => [...ticketKeys.all, 'list', filters] as const,
  detail: (id: number) => [...ticketKeys.all, 'detail', id] as const,
};

export interface TicketListParams {
  page?: number;
  page_size?: number;
  q?: string;
  status?: string;
  priority?: string;
  ticket_type?: string;
  /** 'me' = เฉพาะงานที่มอบหมายให้ผู้เรียก — backend แปลงเป็น id ให้เอง */
  assignee_id?: string;
  /**
   * 'me' = เฉพาะเรื่องที่ผู้เรียกเป็นผู้แจ้ง
   * รับเฉพาะค่า 'me' โดยตั้งใจ — backend แปลงเป็น id ของผู้เรียกเอง
   * ถ้าส่งเลขผู้ใช้ได้ ใครก็แก้เป็นเลขคนอื่นแล้วดูเรื่องของเขา
   */
  requester_id?: 'me';
  company_id?: string;
  category_id?: string;
  /** กรองด้วยสถานะ SLA ที่คำนวณตอนอ่าน — on_track / at_risk / breached / paused */
  sla_status?: string;
  /** true = เฉพาะเรื่องที่ตนแจ้ง · ใช้ในหน้า "Ticket ของฉัน" */
  mine?: boolean;
  /** true = เฉพาะเรื่องที่ยังไม่มีผู้รับผิดชอบ · ใช้ในหน้าคิวทีม */
  unassigned?: boolean;
}

/**
 * ตัดค่าว่างออกก่อนส่ง
 *
 * ค่าว่างไม่ใช่ตัวกรอง — ถ้าส่ง status='' ไป backend จะแปลว่า
 * "หาเรื่องที่สถานะเท่ากับสตริงว่าง" แล้วได้ผลลัพธ์ว่างเปล่าทุกครั้ง
 * ซึ่งดูเหมือนไม่มีข้อมูลมากกว่าดูเหมือนบั๊ก จึงหายากเป็นพิเศษ
 */
function toQuery(params: TicketListParams): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    query[key] = value as string | number | boolean;
  }
  return query;
}

export function useTickets(params: TicketListParams): UseQueryResult<Page<TicketListItem>, Error> {
  return useQuery({
    queryKey: ticketKeys.list(params),
    queryFn: () => api.page<TicketListItem>('/tickets', toQuery(params)),
    /*
     * คงข้อมูลหน้าก่อนไว้ระหว่างเปลี่ยนหน้าหรือเปลี่ยนตัวกรอง
     *
     * ไม่งั้นตารางจะกะพริบเป็นค่าว่างทุกครั้งที่พิมพ์คำค้นหนึ่งตัวอักษร
     * ซึ่งอ่านยากและทำให้ความสูงของหน้ากระโดดไปมา
     */
    placeholderData: (previous) => previous,
  });
}

export function useTicket(id: number): UseQueryResult<TicketDetail, Error> {
  return useQuery({
    queryKey: ticketKeys.detail(id),
    queryFn: () => api.get<TicketDetail>(`/tickets/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export interface CreateTicketInput {
  ticket_type: string;
  subject: string;
  description: string;
  category_id: number;
  /**
   * ⚠️ ไม่มี priority ในนี้ และจะไม่มีตลอดไป
   *
   * ระดับความสำคัญเป็นผลของ impact × urgency ตามเมทริกซ์ (SLA ข้อ 4)
   * backend ตอบ 422 ถ้าส่งมาตรง ๆ — และควรตอบแบบนั้น
   */
  impact: string;
  urgency: string;
  channel?: string | undefined;
  attachment_ids?: number[] | undefined;
}

export function useCreateTicket(): ReturnType<
  typeof useMutation<TicketDetail, Error, CreateTicketInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTicketInput) => api.post<TicketDetail>('/tickets', input),
    onSuccess: () => {
      // ล้างทั้งกลุ่ม ticket — เรื่องใหม่โผล่ได้ทั้งในคิวงานและในรายการของฉัน
      void qc.invalidateQueries({ queryKey: ticketKeys.all });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** อัปโหลดไฟล์แนบก่อนสร้างเรื่อง แล้วค่อยผูก id ที่ได้เข้ากับเรื่อง (B-08) */
export function useUploadAttachments(): ReturnType<
  typeof useMutation<{ id: number; file_name: string }[], Error, File[]>
> {
  return useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      /*
       * ส่ง FormData ตรง ๆ ไม่ผ่าน api.post
       *
       * api.post ตั้ง Content-Type: application/json เสมอ ซึ่งทำให้
       * multipart พังทั้งก้อน — ต้องปล่อยให้เบราว์เซอร์ตั้งเองเพื่อให้
       * boundary ถูกต้อง
       */
      const csrf = document.cookie
        .split('; ')
        .find((c) => c.startsWith('aidc_csrf='))
        ?.split('=')[1];

      const res = await fetch('/api/v1/attachments', {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {},
        body: fd,
      });
      const payload = (await res.json().catch(() => null)) as
        | { success: boolean; data: { id: number; file_name: string }[]; error?: { message: string } }
        | null;

      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error?.message ?? 'ອັບໂຫຼດໄຟລ໌ບໍ່ສຳເລັດ');
      }
      return payload.data;
    },
  });
}
