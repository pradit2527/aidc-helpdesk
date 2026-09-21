/**
 * บทบาทของระบบแบ่งเป็นสองฝั่งชัดเจน
 *
 *   ฝั่งผู้ใช้งาน   end_user                          แจ้งปัญหา หรือแชทเข้ามา
 *   ฝั่ง Helpdesk   support_lead · support_agent      ทำงานกับ ticket และแชท
 *       หัวหน้าทีม   รับงานเองได้ + มอบหมายให้คนในทีมของตนได้
 *       ทีม support  รับงานจาก ticket ได้ แต่มอบหมายให้ใครไม่ได้
 *   ผู้บริหารระบบ   company_admin · manager_viewer · super_admin — ตั้งค่า/ดูภาพรวม อยู่นอกสองฝั่ง
 *
 * ต้องตรงกับ ROLE_SIDE ใน backend/src/common/constants.ts (หน้าจัดการสิทธิ์ใช้ค่า `side` ที่
 * GET /roles ส่งมา ส่วนเมนูและหน้าแรกใช้ตารางนี้เพราะต้องรู้ก่อนที่ข้อมูลจะโหลดเสร็จ)
 */

import type { MessageKey } from '@/config/i18n';
import type { RoleCode, RoleSide } from '@/lib/types';

export const ROLE_SIDE: Record<RoleCode, RoleSide> = {
  end_user: 'user',
  support_lead: 'support',
  support_agent: 'support',
  company_admin: 'admin',
  manager_viewer: 'admin',
  super_admin: 'admin',
};

/** ลำดับการแสดงผล: ฝั่งผู้ใช้งาน → ฝั่ง Helpdesk → ผู้บริหารระบบ */
export const SIDE_ORDER: readonly RoleSide[] = ['user', 'support', 'admin'];

export const SIDE_LABEL_KEY: Record<RoleSide, MessageKey> = {
  user: 'side.user',
  support: 'side.support',
  admin: 'side.admin',
};

/** เรียงตามฝั่งแล้วตามระดับ — ใช้เรียงคอลัมน์ในเมทริกซ์สิทธิ์และตัวเลือกมอบบทบาท */
export const ROLE_ORDER: readonly RoleCode[] = [
  'end_user',
  'support_lead',
  'support_agent',
  'company_admin',
  'manager_viewer',
  'super_admin',
];

/** บทบาทฝั่ง Helpdesk ทั้งสองระดับ — ทำงานกับ ticket และแชทได้ */
export const SUPPORT_ROLES = [
  'support_lead',
  'support_agent',
] as const satisfies readonly RoleCode[];

/** ตำแหน่งในลำดับแสดงผล — รหัสที่ไม่รู้จักไปท้ายสุด แต่ไม่หายไปจากหน้าจอ */
export function roleRank(code: string): number {
  const i = ROLE_ORDER.indexOf(code as RoleCode);
  return i === -1 ? ROLE_ORDER.length : i;
}

/** ฝั่งของบทบาทตามรหัส — รหัสที่ไม่รู้จักถือเป็นฝั่งผู้ใช้งาน (สิทธิ์น้อยที่สุด) */
export function roleSide(code: string): RoleSide {
  return (ROLE_SIDE as Record<string, RoleSide>)[code] ?? 'user';
}
