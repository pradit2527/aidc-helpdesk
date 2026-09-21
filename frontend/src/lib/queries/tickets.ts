import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { TicketStatus } from '@/config/enums';
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
  lists: () => [...ticketKeys.all, 'list'] as const,
  list: (filters: TicketListParams) => [...ticketKeys.lists(), filters] as const,
  detail: (id: number) => [...ticketKeys.all, 'detail', id] as const,
  assignees: (id: number) => [...ticketKeys.detail(id), 'assignees'] as const,
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
  /**
   * ลำดับ — ใหม่สุดอยู่บนเสมอ ต่างกันที่วัด "ใหม่" จากอะไร (ค่าอื่น backend เพิกเฉย)
   *   -updated_at  แก้ไขล่าสุด (ค่าเริ่มต้น)
   *   -created_at  แจ้งเข้ามาล่าสุด
   *   -assigned_at ถูกมอบหมายให้ผู้รับผิดชอบคนปัจจุบันล่าสุด
   */
  sort?: '-updated_at' | '-created_at' | '-assigned_at';
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

export interface AddCommentInput {
  body: string;
  is_internal?: boolean;
}

/**
 * ส่งคอมเมนต์เข้าเรื่อง
 *
 * คอมเมนต์สาธารณะที่สร้างสำเร็จจะถูกดันกลับมาซ้ำผ่าน WebSocket (ดู useTicketChat)
 * invalidate ตรงนี้จึงจำเป็นเฉพาะตอนเครือข่ายเรียลไทม์หลุด หรือคอมเมนต์ภายในที่ไม่ถูกกระจาย
 */
export function useAddComment(ticketId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddCommentInput) => api.post(`/tickets/${ticketId}/comments`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) });
    },
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
  source_device?: 'web' | 'mobile_web' | undefined;
  /** ค่าเริ่มต้นฝั่ง backend = บริษัทของผู้เรียก · ระบุได้เฉพาะบริษัทในขอบเขตสิทธิ์ */
  company_id?: number | undefined;
  department_id?: number | undefined;
  service_id?: number | undefined;
  /** บังคับเมื่อ ticket_type = service_request */
  catalog_item_id?: number | undefined;
  asset_tag?: string | undefined;
  /** แจ้งแทนผู้อื่น — ต้องมีสิทธิ์ ticket.create_for_other */
  requester_id?: number | undefined;
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

/**
 * หลังคำสั่งที่เปลี่ยนเรื่องสำเร็จ
 *
 * ใส่รายละเอียดฉบับเต็มที่เซิร์ฟเวอร์ตอบกลับลงแคชทันที — รวม available_transitions
 * ชุดใหม่ ปุ่มจึงเปลี่ยนตามสถานะใหม่โดยไม่ต้องยิงซ้ำ แล้วค่อยให้รายการกับแดชบอร์ด
 * ดึงใหม่ เพราะตัวเลขในนั้นเปลี่ยนตาม
 *
 * ล้างเฉพาะรายการ ไม่ล้าง ticketKeys.all — ถ้าล้างทั้งกลุ่ม รายละเอียดที่เพิ่งใส่
 * จะถูกดึงซ้ำอีกรอบโดยไม่มีอะไรเปลี่ยน ซึ่งช้าเห็นได้ชัดบนฐานข้อมูลที่อยู่ไกล
 */
function useApplyTicketUpdate(): (ticket: TicketDetail) => void {
  const qc = useQueryClient();
  return (ticket) => {
    qc.setQueryData(ticketKeys.detail(ticket.id), ticket);
    void qc.invalidateQueries({ queryKey: ticketKeys.lists() });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export interface ChangeTicketStatusInput {
  id: number;
  to_status: TicketStatus;
  /**
   * ເຫດຜົນຍ່ອຍ — ໃຊ້ກັບ `pending_user` ເທົ່ານັ້ນ ແລະ ບໍ່ບັງຄັບ
   * ການລໍຖ້າຜູ້ຂາຍ / ລໍຖ້າອະນຸມັດ ໃຊ້ສະຖານະຂອງຕົນເອງແລ້ວ
   */
  pending_reason?: string;
  /** เก็บในประวัติ — บังคับเมื่อพัก ยกเลิก และเปิดคืน */
  reason?: string;
  /** ข้อความถึงผู้แจ้ง */
  comment?: string;
  /** บังคับเมื่อแก้ไขเสร็จ */
  resolution_note?: string;
  /** 1–5 · รับเฉพาะผู้แจ้งตอนยืนยันปิด */
  satisfaction_score?: number;
}

export function useChangeTicketStatus(): ReturnType<
  typeof useMutation<TicketDetail, Error, ChangeTicketStatusInput>
> {
  const apply = useApplyTicketUpdate();
  return useMutation({
    mutationFn: ({ id, ...body }: ChangeTicketStatusInput) =>
      api.post<TicketDetail>(`/tickets/${id}/status`, body),
    onSuccess: apply,
  });
}

export interface AssignTicketInput {
  id: number;
  assignee_id: number;
  /** ข้อความถึงผู้แจ้ง — นับเป็นการตอบรับครั้งแรก */
  comment?: string;
  reason?: string;
}

export function useAssignTicket(): ReturnType<
  typeof useMutation<TicketDetail, Error, AssignTicketInput>
> {
  const qc = useQueryClient();
  const apply = useApplyTicketUpdate();
  return useMutation({
    mutationFn: ({ id, ...body }: AssignTicketInput) =>
      api.post<TicketDetail>(`/tickets/${id}/assign`, body),
    onSuccess: (ticket) => {
      apply(ticket);
      // คิว "งานของฉัน" ของผู้รับเปลี่ยน — ล้างรายชื่อผู้รับไว้ด้วยเผื่อมีการเปลี่ยนสิทธิ์ระหว่างทาง
      void qc.invalidateQueries({ queryKey: ticketKeys.assignees(ticket.id) });
    },
  });
}

export interface TicketAssignee {
  id: number;
  full_name: string;
  /** true = ผู้เรียกเอง — อยู่บนสุดของรายการเสมอ */
  is_me: boolean;
  /** true = หัวหน้าทีมที่คนนี้สังกัด */
  is_lead: boolean;
  /** null = ยังไม่ได้สังกัดทีมไหน แต่ยังมอบหมายให้ได้ (เช่นผู้ดูแลระบบ) */
  team: { id: number; name: string } | null;
  /** งานที่ยังค้างอยู่กับคนนี้ — ใช้เลือกคนที่ว่างที่สุด ไม่ใช่ตัวชี้วัดผลงาน */
  open_tickets: number;
}

/**
 * ผู้ที่มอบหมายเรื่องนี้ให้ได้
 *
 * ดึงเมื่อเปิดกล่องมอบหมายเท่านั้น (enabled) — คนส่วนใหญ่ที่เปิดหน้ารายละเอียด
 * ไม่ได้จะมอบหมายงาน การดึงทุกครั้งที่เปิดหน้าเป็นคิวรีที่เสียเปล่า
 *
 * ⚠️ backend กรองมาให้แล้วว่าผู้เรียกคนนี้มอบหมายให้ใครได้บ้าง (ตนเองมาก่อน
 *    แล้วเรียงตามงานค้างน้อยไปมาก) — ห้ามกรองซ้ำหรือจัดลำดับใหม่ที่หน้าจอ
 *    มิฉะนั้นกติกาจะแตกเป็นสองชุดที่เพี้ยนจากกัน
 */
export function useTicketAssignees(
  id: number,
  enabled: boolean,
): UseQueryResult<TicketAssignee[], Error> {
  return useQuery({
    queryKey: ticketKeys.assignees(id),
    queryFn: () => api.get<TicketAssignee[]>(`/tickets/${id}/assignees`),
    enabled: enabled && Number.isFinite(id) && id > 0,
    staleTime: 60_000,
  });
}

// ── ผูกเรื่องที่เกี่ยวข้องกัน ────────────────────────────────────────

export interface LinkTicketInput {
  id: number;
  related_ticket_id: number;
}

/**
 * ผูกเรื่องนี้กับอีกเรื่องหนึ่ง — POST /tickets/{id}/link
 *
 * ผูกได้ใบเดียว ไม่ใช่กราฟความสัมพันธ์ ถ้าผูกใบใหม่ทับ ใบเดิมจะหลุดไป
 * ซึ่งเป็นพฤติกรรมที่ตั้งใจ — คำถามที่คนถามจริงคือ "เรื่องนี้เกี่ยวกับใบไหน"
 * ใบเดียว ไม่ใช่ "เกี่ยวกับใบไหนบ้าง" และการผูกมีผลสองทางเสมอ
 *
 * ⚠️ ยังไม่มีทาง "ยกเลิกการผูก"
 *    LinkTicketDto ฝั่ง backend ประกาศ related_ticket_id เป็น @IsInt() @Min(1)
 *    ซึ่งส่ง null ไม่ได้ และยังไม่มี DELETE /tickets/{id}/link
 *    หน้าจอจึงให้ "เปลี่ยนไปผูกใบอื่น" แทน ซึ่งทับค่าเดิมได้
 *    ถ้าต้องการล้างค่าจริง ๆ ต้องขอให้ backend เพิ่ม endpoint ก่อน
 */
export function useLinkTicket(): ReturnType<
  typeof useMutation<TicketDetail, Error, LinkTicketInput>
> {
  const apply = useApplyTicketUpdate();
  return useMutation({
    mutationFn: ({ id, related_ticket_id }: LinkTicketInput) =>
      api.post<TicketDetail>(`/tickets/${id}/link`, { related_ticket_id }),
    onSuccess: apply,
  });
}

/**
 * ค้นเรื่องด้วยเลขที่หรือหัวข้อ เพื่อเลือกมาผูก
 *
 * ใช้ GET /tickets ตัวเดียวกับหน้ารายการ ซึ่งกรองตามขอบเขตสิทธิ์ของผู้เรียกให้แล้ว
 * จึงไม่มีทางผูกไปยังเรื่องที่ตัวเองมองไม่เห็น — ถ้าเขียน endpoint ค้นหาแยก
 * ต้องจำกฎขอบเขตให้ตรงกันสองที่ ซึ่งวันหนึ่งจะเพี้ยนจากกัน
 *
 * คีย์แคชแยกจาก ticketKeys.lists() เพราะเป็นคนละเจตนา — ไม่ควรถูกล้างทิ้ง
 * ทุกครั้งที่มีใครเปลี่ยนสถานะเรื่องสักใบระหว่างที่กล่องค้นหาเปิดอยู่
 */
export function useTicketSearch(q: string, excludeId: number): UseQueryResult<TicketListItem[], Error> {
  const term = q.trim();
  return useQuery({
    queryKey: [...ticketKeys.all, 'search', term],
    queryFn: async () => {
      const page = await api.page<TicketListItem>('/tickets', { q: term, page_size: 10 });
      return page.items;
    },
    // ค้นด้วยตัวอักษรเดียวได้ทั้งฐาน ซึ่งช้าและไม่ช่วยใครเลือกอะไร
    enabled: term.length >= 2,
    staleTime: 30_000,
    select: (items) => items.filter((t) => t.id !== excludeId),
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
