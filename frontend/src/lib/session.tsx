'use client';

import * as React from 'react';

import { SESSION } from '@/mocks/data';
import type { RoleCode, SessionUser } from '@/lib/types';

/**
 * ผู้ใช้ที่ล็อกอินอยู่ ใช้ร่วมกันทั้งแอป
 *
 * ตอนนี้อ่านจากข้อมูลจำลอง เมื่อ /auth/me พร้อมให้เปลี่ยนเฉพาะใน SessionProvider
 * หน้าจอทุกหน้าเรียกผ่าน useSession() จึงไม่ต้องแก้ตาม
 *
 * สลับบทบาทได้จาก UI เพื่อให้ตรวจเมนูและปุ่มของแต่ละ role ได้จริงระหว่างพัฒนา
 * ⚠️ ตัวสลับนี้เปลี่ยนแค่สิ่งที่ "เห็น" ไม่ได้เปลี่ยนสิทธิ์จริง
 *    การกันจริงอยู่ที่ backend ทุกเส้นทาง (docs/04-rbac-sla.md §1.1 ข้อ 6)
 */

interface SessionContextValue {
  user: SessionUser;
  /** ใช้เฉพาะตอนพัฒนา — จะถูกถอดออกเมื่อผูก /auth/me จริง */
  setRoles: (roles: RoleCode[]) => void;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [roles, setRoles] = React.useState<RoleCode[]>(SESSION.roles);

  const value = React.useMemo<SessionContextValue>(
    () => ({ user: { ...SESSION, roles }, setRoles }),
    [roles],
  );

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
