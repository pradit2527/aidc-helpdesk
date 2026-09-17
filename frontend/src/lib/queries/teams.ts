import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import { ticketKeys } from '@/lib/queries/tickets';
import type { SupportTeam, SupportTeamCandidate } from '@/lib/types';

/**
 * ทีมสนับสนุนของฝ่ายไอที
 *
 * ทีมคือสิ่งที่ตอบคำถามว่า "หัวหน้าคนนี้มอบหมายงานให้ใครได้บ้าง"
 * ฝั่งหน้าจอมีหน้าที่แค่แสดงกับส่งค่าที่ผู้ใช้เลือก — การตัดสินว่าใครมอบหมาย
 * ให้ใครได้จริงอยู่ที่ backend ทั้งตอนอ่าน (/tickets/{id}/assignees กรองมาให้แล้ว)
 * และตอนบันทึก (403 NOT_TEAM_LEAD · 422 ASSIGNEE_NOT_IN_TEAM)
 *
 * ชนิดข้อมูลมาจาก @/lib/types ตัวเดียวกับที่หน้าจอใช้ ไม่ประกาศซ้ำที่นี่
 */
export const teamKeys = {
  all: ['support-teams'] as const,
  list: () => [...teamKeys.all, 'list'] as const,
  candidates: () => [...teamKeys.all, 'candidates'] as const,
};

/**
 * ทีมทั้งหมดที่ผู้เรียกเห็นได้
 *
 * ต้องมีสิทธิ์ ticket.assign หรือ user.assign_role — คนที่มีแค่ ticket.assign
 * ได้เฉพาะทีมของตัวเองกลับมา การกรองทำที่เซิร์ฟเวอร์ ไม่ใช่ที่นี่
 */
export function useSupportTeams(): UseQueryResult<SupportTeam[], Error> {
  return useQuery({
    queryKey: teamKeys.list(),
    queryFn: () => api.get<SupportTeam[]>('/support-teams'),
    // โครงทีมเปลี่ยนไม่บ่อย แต่จำนวนงานค้างของสมาชิกเปลี่ยนตลอด จึงไม่ตั้ง staleTime ยาว
    staleTime: 30_000,
  });
}

/**
 * ผู้ที่เพิ่มเข้าทีมได้
 *
 * ดึงเฉพาะตอนเปิดกล่องแก้ไข (enabled) — รายชื่อนี้ยาวกว่ารายการทีมมาก
 * และคนที่แค่เข้ามาดูว่าใครอยู่ทีมไหนไม่ได้ใช้เลย
 */
export function useTeamCandidates(enabled: boolean): UseQueryResult<SupportTeamCandidate[], Error> {
  return useQuery({
    queryKey: teamKeys.candidates(),
    queryFn: () => api.get<SupportTeamCandidate[]>('/support-teams/candidates'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export interface CreateTeamInput {
  name: string;
  code?: string;
  description?: string;
  /** null = ทีมส่วนกลาง ใช้ได้ทุกบริษัท */
  company_id?: number | null;
  lead_ids: number[];
  member_ids: number[];
}

/**
 * แก้ทีมเดิม — ส่งเฉพาะช่องที่เปลี่ยน
 *
 * ⚠️ lead_ids / member_ids แทนที่สมาชิกทั้งชุด ไม่ใช่เพิ่มต่อท้าย
 *    ส่งรายการที่ขาดคนไปหนึ่งคน = ถอดคนนั้นออกจากทีม จึงต้องส่งรายชื่อเต็มเสมอ
 */
export type UpdateTeamInput = Partial<CreateTeamInput> & {
  id: number;
  is_active?: boolean;
};

/**
 * ล้างแคชหลังแก้โครงทีม
 *
 * ล้างคีย์ของ ticket ด้วย เพราะรายชื่อผู้ที่มอบหมายให้ได้ของทุกเรื่อง
 * (ticketKeys.assignees) คำนวณจากสมาชิกทีม — ถ้าไม่ล้าง หัวหน้าที่เพิ่งเพิ่มคนใหม่
 * จะเปิดกล่องมอบหมายแล้วไม่เห็นคนนั้นจนกว่าจะรีเฟรชทั้งหน้า
 *
 * คิวรีของ ticket ที่ไม่มีหน้าไหนใช้อยู่จะถูกทำเครื่องหมายว่าเก่าเฉย ๆ
 * ไม่ได้ยิงใหม่ทันที การล้างกว้างตรงนี้จึงไม่ได้แลกด้วยคำขอเพิ่ม
 */
function useInvalidateTeams(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: teamKeys.all });
    void qc.invalidateQueries({ queryKey: ticketKeys.all });
  };
}

export function useCreateTeam(): UseMutationResult<SupportTeam, Error, CreateTeamInput> {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: (input: CreateTeamInput) => api.post<SupportTeam>('/support-teams', input),
    onSuccess: invalidate,
  });
}

export function useUpdateTeam(): UseMutationResult<SupportTeam, Error, UpdateTeamInput> {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateTeamInput) =>
      api.patch<SupportTeam>(`/support-teams/${id}`, body),
    onSuccess: invalidate,
  });
}
