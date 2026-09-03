'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { fetchMe, logout as logoutRequest } from '@/lib/auth';
import type { RoleCode, SessionUser } from '@/lib/types';

/**
 * ผู้ใช้ที่ล็อกอินอยู่ ใช้ร่วมกันทั้งแอป
 *
 * อ่านจาก GET /auth/me ซึ่งยืนยันตัวตนด้วยคุกกี้ httpOnly ที่เบราว์เซอร์
 * แนบมาให้เอง ไม่มี token ผ่านมือ JavaScript เลยสักขั้นตอน
 *
 * ⚠️ ไม่มีทางเปลี่ยนบทบาทของตัวเองจากฝั่งนี้โดยตั้งใจ
 *    บทบาทมาจาก session เท่านั้น การให้ผู้ใช้เลือกบทบาทเองเท่ากับ
 *    ยกระดับสิทธิ์ตัวเองได้ การมอบบทบาททำที่หน้าจัดการผู้ใช้ ซึ่งต้องใช้
 *    สิทธิ์ user.assign_role และถูกบันทึกลง audit log ทุกครั้ง
 *
 * ⚠️ permissions ที่ได้มาใช้ "ซ่อนเมนู" เท่านั้น ไม่ใช่ด่านความปลอดภัย
 *    ผู้ใช้แก้ค่าในเบราว์เซอร์ได้เสมอ ด่านจริงอยู่ที่ backend ทุกคำขอ
 */

interface SessionContextValue {
  user: SessionUser;
  /** โหลดข้อมูลผู้ใช้ใหม่ — ใช้หลังแก้โปรไฟล์หรือหลังได้รับบทบาทเพิ่ม */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

/** เส้นทางที่เข้าได้โดยไม่ต้องล็อกอิน */
const PUBLIC_PATHS = ['/login'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function SessionProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [state, setState] = React.useState<'loading' | 'ready' | 'anonymous'>('loading');

  const load = React.useCallback(async (): Promise<SessionUser | null> => {
    const me = await fetchMe();
    setUser(me);
    setState(me ? 'ready' : 'anonymous');
    return me;
  }, []);

  React.useEffect(() => {
    // หน้าล็อกอินไม่ต้องถาม /auth/me — ผู้ใช้ยังไม่มี session อยู่แล้ว
    // ถ้าถามจะได้ 401 ทุกครั้งแล้วมีเสียงรบกวนใน log ฝั่งเซิร์ฟเวอร์เปล่า ๆ
    if (isPublic(pathname)) {
      setState('anonymous');
      return;
    }
    void load();
  }, [pathname, load]);

  /*
   * ยังไม่ล็อกอินแต่เปิดหน้าที่ต้องล็อกอิน → พาไปหน้าล็อกอิน
   *
   * ต้องอยู่ใน useEffect ไม่ใช่ระหว่าง render — การสั่ง router ระหว่าง render
   * ทำให้ React เตือนว่าอัปเดต state ของ component อื่นขณะกำลัง render อยู่
   *
   * แนบ next มาด้วย เพื่อพากลับมาหน้าเดิมหลังล็อกอินสำเร็จ
   * ผู้ใช้ที่กดลิงก์ ticket จากอีเมลแล้วโดนเด้งไปหน้าแรกจะหาเรื่องนั้นไม่เจอ
   */
  React.useEffect(() => {
    if (state === 'anonymous' && !isPublic(pathname)) {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
    }
  }, [state, pathname, router]);

  /*
   * บังคับเปลี่ยนรหัสผ่านก่อนใช้งานอย่างอื่น (US-18 AC-1)
   *
   * ตรวจที่นี่ ไม่ใช่แค่ตอนล็อกอิน เพราะผู้ดูแลระบบสั่งรีเซ็ตรหัสผ่านได้
   * ระหว่างที่ผู้ใช้เปิดแอปค้างไว้ ถ้าตรวจแค่ตอนล็อกอิน ผู้ใช้คนนั้น
   * จะใช้งานต่อได้ทั้งวันโดยไม่เคยเปลี่ยนรหัสเลย
   */
  React.useEffect(() => {
    if (state !== 'ready' || !user?.must_change_password) return;
    if (pathname === '/change-password') return;
    router.replace('/change-password');
  }, [state, user?.must_change_password, pathname, router]);

  const signOut = React.useCallback(async (): Promise<void> => {
    await logoutRequest();
    setUser(null);
    setState('anonymous');
    router.replace('/login');
  }, [router]);

  const value = React.useMemo<SessionContextValue | null>(
    () => (user ? { user, refresh: async () => void (await load()), signOut } : null),
    [user, load, signOut],
  );

  if (isPublic(pathname)) return <>{children}</>;

  if (state === 'loading' || !value) {
    return (
      <div
        className="grid min-h-screen place-items-center bg-canvas px-6 text-center text-sm text-muted"
        role="status"
        aria-live="polite"
      >
        ກຳລັງກວດສອບການເຂົ້າສູ່ລະບົບ...
      </div>
    );
  }

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

/**
 * มีสิทธิ์ข้อใดข้อหนึ่งไหม — ใช้ซ่อนเมนูและปุ่ม
 *
 * super_admin ผ่านทุกข้อ ให้ตรงกับที่ backend ตัดสิน
 * ถ้าสองฝั่งตัดสินไม่ตรงกัน ผู้ใช้จะเห็นปุ่มที่กดแล้วได้ 403
 * หรือแย่กว่านั้นคือไม่เห็นปุ่มที่ตัวเองมีสิทธิ์ใช้จริง
 */
export function useCan(...permissions: string[]): boolean {
  const { user } = useSession();
  if (user.roles.includes('super_admin')) return true;
  return permissions.some((p) => user.permissions.includes(p));
}
