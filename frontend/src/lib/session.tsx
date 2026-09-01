'use client';

import * as React from 'react';

import { SESSION } from '@/mocks/data';
import type { RoleCode, SessionUser } from '@/lib/types';

/**
 * ผู้ใช้ที่ล็อกอินอยู่ ใช้ร่วมกันทั้งแอป
 *
 * ตอนนี้อ่านจากข้อมูลจำลอง เมื่อ GET /auth/me พร้อมให้เปลี่ยนเฉพาะใน
 * SessionProvider หน้าจอทุกหน้าเรียกผ่าน useSession() จึงไม่ต้องแก้ตาม
 *
 * ⚠️ ไม่มีทางเปลี่ยนบทบาทของตัวเองจากฝั่งนี้โดยตั้งใจ
 *    บทบาทมาจาก session เท่านั้น การให้ผู้ใช้เลือกบทบาทเองเท่ากับ
 *    ยกระดับสิทธิ์ตัวเองได้ การมอบบทบาททำที่หน้าจัดการผู้ใช้ ซึ่งต้องใช้
 *    สิทธิ์ user.assign_role และถูกบันทึกลง audit log ทุกครั้ง
 *
 *    ระหว่างพัฒนา ถ้าต้องการดูหน้าจอในมุมของบทบาทอื่น ให้แก้ SESSION.roles
 *    ใน src/mocks/data.ts ชั่วคราว
 */

interface SessionContextValue {
  user: SessionUser;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const value = React.useMemo<SessionContextValue>(() => ({ user: SESSION }), []);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = React.useContext(SessionContext);
  if (!context) {
    throw new Error('useSession ต้องอยู่ภายใต้ <SessionProvider>');
  }
  return context;
}

export function useHasRole(...roles: RoleCode[]): boolean {
  const { user } = useSession();
  return roles.some((r) => user.roles.includes(r));
}
