import { useQuery, type UseQueryResult } from '@tanstack/react-query';

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
  company_id?: string;
  category_id?: string;
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
