'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { SESSION_EXPIRED_EVENT } from '@/lib/api';
import { fetchMe, logout as logoutRequest, takePrimedUser } from '@/lib/auth';
import { identifyChatwootUser, resetChatwoot } from '@/lib/chatwoot';
import type { RoleCode, SessionUser } from '@/lib/types';
import { disconnectRealtime } from '@/lib/ws';

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

type LoadResult = 'ready' | 'anonymous' | 'error';

const SessionContext = React.createContext<SessionContextValue | null>(null);

/** เส้นทางที่เข้าได้โดยไม่ต้องล็อกอิน */
const PUBLIC_PATHS = ['/login'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function loginUrl(pathname: string): string {
  return `/login?next=${encodeURIComponent(pathname)}`;
}

export function SessionProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [state, setState] = React.useState<'loading' | LoadResult>('loading');

  /**
   * โหลดผู้ใช้ปัจจุบัน
   *
   * ⚠️ ต้องดักข้อผิดพลาดให้ครบทุกทาง
   *
   * เดิมไม่มี try/catch — พอ /auth/me ล้มด้วยเหตุอื่นที่ไม่ใช่ 401
   * (เน็ตสะดุด, เซิร์ฟเวอร์กำลังตื่นจากการหลับ, ECONNRESET)
   * promise จะ reject แล้ว state ค้างที่ 'loading' ตลอดไป
   *
   * แยก 'error' ออกจาก 'anonymous' โดยตั้งใจ — เน็ตล่มไม่ใช่ "ยังไม่ล็อกอิน"
   * ถ้ากลบเป็นอันเดียวกัน ผู้ใช้จะถูกเด้งไปหน้าล็อกอินแล้วกรอกซ้ำไปเรื่อย
   * ทั้งที่รหัสถูกต้องและ session ยังอยู่
   *
   * ใช้ผู้ใช้ที่หน้าล็อกอินเพิ่งได้มาก่อน ถ้ามี — ไม่ต้องถาม /auth/me ซ้ำทันทีหลังล็อกอิน
   */
  const load = React.useCallback(async (): Promise<LoadResult> => {
    try {
      const me = takePrimedUser() ?? (await fetchMe());
      setUser(me);
      const result: LoadResult = me ? 'ready' : 'anonymous';
      setState(result);
      return result;
    } catch {
      setUser(null);
      setState('error');
      return 'error';
    }
  }, []);

  // อ่านผู้ใช้ปัจจุบันใน effect ด้านล่างโดยไม่ต้องผูก effect กับ user
  const userRef = React.useRef<SessionUser | null>(null);
  React.useEffect(() => {
    userRef.current = user;
  }, [user]);

  /*
   * โหลดผู้ใช้เมื่อเข้าหน้าที่ต้องล็อกอินและยังไม่มีข้อมูล
   *
   * ⚠️ นี่คือเหตุที่ผู้ใช้เคย "ล็อกอินสองรอบถึงจะเข้าได้"
   *
   *    เดิมมีสอง effect แยกกัน — ตัวหนึ่งโหลด /auth/me อีกตัวดูว่า state เป็น
   *    'anonymous' แล้วเด้งไปหน้าล็อกอิน provider นี้อยู่ที่ราก จึงยังถือ 'anonymous'
   *    ค้างมาจากหน้าล็อกอิน พอล็อกอินสำเร็จแล้วเปลี่ยนหน้า ตัวเด้งทำงานทันที
   *    ก่อน /auth/me จะตอบ ผู้ใช้จึงถูกส่งกลับไปหน้าล็อกอินทั้งที่เพิ่งเข้าสำเร็จ
   *    ตอนนี้ตัดสินใจเด้งจาก "ผลของการโหลดรอบนี้" เท่านั้น
   *
   * ⚠️ ไม่โหลดซ้ำทุกครั้งที่เปลี่ยนหน้า — เดิมยิง /auth/me ทุกคลิก
   *    ซึ่งบนฐานข้อมูลที่อยู่ไกลกินเวลาวินาทีกว่าและแย่ connection กับข้อมูลของหน้านั้นเอง
   *    session หมดอายุระหว่างใช้งานถูกจับได้จากคำขอ API ปกติอยู่แล้ว (SESSION_EXPIRED_EVENT)
   */
  React.useEffect(() => {
    if (isPublic(pathname)) {
      // ออกมาหน้าล็อกอิน = ทิ้งผู้ใช้เดิม คนที่ล็อกอินต่ออาจเป็นคนละคน
      setUser(null);
      setState('loading');
      return;
    }
    if (userRef.current) return;

    let cancelled = false;
    void load().then((result) => {
      if (!cancelled && result === 'anonymous') router.replace(loginUrl(pathname));
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, load, router]);

  /*
   * session หมดจริงระหว่างใช้งาน (ต่ออายุด้วย refresh token ไม่สำเร็จ) → ไปหน้าล็อกอิน
   * แนบหน้าปัจจุบันไปด้วย เพื่อให้กลับมาที่เดิมหลังล็อกอินใหม่
   */
  React.useEffect(() => {
    const onExpired = (): void => {
      const current = window.location.pathname;
      if (!isPublic(current)) router.replace(loginUrl(current));
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [router]);

  /*
   * บอกแชท Chatwoot ว่าใครกำลังคุยอยู่ ทุกครั้งที่ได้ผู้ใช้คนใหม่
   *
   * ผูกกับ id ไม่ใช่ทั้งอ็อบเจกต์ — refresh() หลังแก้โปรไฟล์สร้างอ็อบเจกต์ใหม่
   * ของคนเดิม ถ้าผูกกับอ็อบเจกต์จะยิงถาม backend ซ้ำทุกครั้งโดยไม่มีอะไรเปลี่ยน
   *
   * ล้มเหลวได้เงียบ ๆ โดยตั้งใจ — แชทยังใช้ได้แบบไม่ระบุตัวตน
   * ปัญหาของแชทต้องไม่ทำให้ระบบหลักใช้ไม่ได้
   */
  const userId = user?.id;
  React.useEffect(() => {
    if (userId === undefined) return;
    identifyChatwootUser().catch(() => undefined);
  }, [userId]);

  /*
   * ไม่มีการบังคับเปลี่ยนรหัสผ่านแล้ว — หน้า /change-password ถูกถอดออก
   * ตามที่องค์กรสั่ง (เดิมคือ US-18 AC-1)
   *
   * ฟิลด์ must_change_password ยังอยู่ในฐานข้อมูลและยังถูกส่งมาใน session
   * เพื่อให้หน้าจัดการผู้ใช้แสดงธงได้ว่าบัญชีไหนยังใช้รหัสตั้งต้นอยู่
   * แต่ไม่มีผลกับการนำทางอีกต่อไป
   */

  const signOut = React.useCallback(async (): Promise<void> => {
    await logoutRequest();
    // ล้างแชทด้วย — มิฉะนั้นคนที่นั่งเครื่องนี้ต่อจะเปิดอ่านบทสนทนาของคนที่เพิ่งออกได้
    resetChatwoot();
    // socket เดิมยังอยู่ในห้องแชทของคนที่เพิ่งออก ข้อความใหม่จะยังเด้งเข้ามา
    disconnectRealtime();
    setUser(null);
    setState('anonymous');
    router.replace('/login');
  }, [router]);

  const value = React.useMemo<SessionContextValue | null>(
    () => (user ? { user, refresh: async () => void (await load()), signOut } : null),
    [user, load, signOut],
  );

  if (isPublic(pathname)) return <>{children}</>;

  /*
   * ติดต่อเซิร์ฟเวอร์ไม่ได้ — ต้องมีทางออกให้ผู้ใช้กดเอง
   *
   * ห้ามเด้งไปหน้าล็อกอิน เพราะปัญหาไม่ได้อยู่ที่ตัวตนของผู้ใช้
   * การให้กรอกรหัสใหม่ไม่ช่วยอะไร มีแต่ทำให้เข้าใจผิดว่ารหัสผิด
   */
  if (state === 'error') {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-6" role="alert">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <p className="text-body-sm text-ink-2">
            ຕິດຕໍ່ເຊີບເວີບໍ່ໄດ້ຊົ່ວຄາວ — ອາດຍ້ອນເຊີບເວີກຳລັງເລີ່ມເຮັດວຽກ
          </p>
          <button
            type="button"
            onClick={() => {
              setState('loading');
              void load().then((result) => {
                if (result === 'anonymous') router.replace(loginUrl(pathname));
              });
            }}
            className="min-h-tap rounded-md bg-primary px-5 py-2 text-body-sm font-semibold text-white"
          >
            ລອງໃໝ່
          </button>
        </div>
      </div>
    );
  }

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
