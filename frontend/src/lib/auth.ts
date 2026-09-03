import { api, ApiError, apiRequest } from '@/lib/api';
import type { SessionUser } from '@/lib/types';

/**
 * เรียก endpoint ยืนยันตัวตน
 *
 * ไม่มีฟังก์ชันไหนในไฟล์นี้แตะ token เลย — backend เป็นผู้ตั้งคุกกี้ httpOnly
 * และเบราว์เซอร์แนบให้เองทุกคำขอ JavaScript อ่าน token ไม่ได้ตั้งแต่ต้น
 * จึงไม่มีอะไรให้ XSS ขโมยไปใช้ต่อ
 *
 * สิ่งเดียวที่ JS อ่านได้คือ aidc_csrf ซึ่งไม่ใช่ความลับ — หน้าที่ของมัน
 * คือพิสูจน์ว่า "คำขอนี้มาจากหน้าเว็บของเรา" ไม่ใช่ "คนนี้คือใคร"
 */

/** รูปร่างผู้ใช้ที่ backend ส่งกลับมา — ดู backend CurrentUserDto */
interface ApiUser {
  id: number;
  username: string;
  full_name: string;
  email?: string | null;
  job_title?: string | null;
  company: { id: number; code: string; name_th?: string };
  department?: { id: number; name: string } | null;
  roles: string[];
  scoped_companies: { id: number; code: string; name_th?: string }[];
  permissions: string[];
}

interface LoginResponse {
  must_change_password: boolean;
  user: ApiUser;
}

type MeResponse = ApiUser & { must_change_password: boolean };

/**
 * แปลงผู้ใช้จาก backend เป็นรูปที่หน้าจอใช้
 *
 * ทำที่นี่ที่เดียว เพื่อไม่ให้ทุกหน้าจอต้องรู้ว่าฟิลด์ไหนของ backend
 * เป็น undefined ได้บ้าง — หน้าจอเห็นแต่ null ที่เดาง่ายกว่า
 */
function toSessionUser(user: ApiUser, mustChangePassword: boolean): SessionUser {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email ?? null,
    job_title: user.job_title ?? null,
    company: user.company,
    department: user.department ?? null,
    roles: user.roles as SessionUser['roles'],
    scoped_companies: user.scoped_companies,
    permissions: user.permissions,
    must_change_password: mustChangePassword,
    /*
     * backend ยังไม่มี endpoint แจ้งเตือน จึงยังไม่ส่งจำนวนที่ยังไม่อ่านมา
     * ตั้งเป็น 0 ไว้ก่อน ดีกว่าโชว์ตัวเลขปลอมที่ผู้ใช้กดแล้วไม่เจออะไร
     */
    unread_notifications: 0,
  };
}

export async function login(
  username: string,
  password: string,
): Promise<{ user: SessionUser; mustChangePassword: boolean }> {
  const data = await api.post<LoginResponse>('/auth/login', { username, password });
  return {
    user: toSessionUser(data.user, data.must_change_password),
    mustChangePassword: data.must_change_password,
  };
}

/**
 * อ่านผู้ใช้ปัจจุบันจากคุกกี้ที่ติดมากับคำขอ
 *
 * คืน null เมื่อยังไม่ได้ล็อกอิน แทนที่จะโยน error
 * เพราะ "ยังไม่ล็อกอิน" เป็นสถานะปกติของแอป ไม่ใช่ความผิดพลาด
 * ส่วน error อื่น (เซิร์ฟเวอร์ล่ม เน็ตหลุด) ยังโยนต่อ เพื่อไม่ให้ถูกกลบ
 * เป็น "ไม่ได้ล็อกอิน" แล้วผู้ใช้โดนเด้งไปหน้าล็อกอินทั้งที่รหัสผ่านถูก
 */
export async function fetchMe(): Promise<SessionUser | null> {
  try {
    const data = await api.get<MeResponse>('/auth/me');
    return toSessionUser(data, data.must_change_password);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/**
 * ออกจากระบบ
 *
 * ไม่โยน error ต่อแม้คำขอล้มเหลว — ผู้ใช้ที่กดออกจากระบบต้องออกได้เสมอ
 * แม้ session จะหมดอายุไปก่อนแล้วหรือเน็ตหลุด มิฉะนั้นจะติดอยู่ในหน้าที่
 * ออกไม่ได้ ซึ่งอันตรายกว่าตอนใช้เครื่องร่วมกับคนอื่น
 */
export async function logout(): Promise<void> {
  try {
    await apiRequest<void>('/auth/logout', { method: 'POST' });
  } catch {
    // เงียบไว้โดยตั้งใจ — ฝั่งเรียกจะพาไปหน้าล็อกอินต่อไม่ว่าผลเป็นอย่างไร
  }
}

/**
 * เปลี่ยนรหัสผ่าน
 *
 * สำเร็จแล้ว backend ล้างคุกกี้ทิ้งทั้งหมด ผู้ใช้จึงต้องล็อกอินใหม่
 * เป็นพฤติกรรมที่ตั้งใจ เพราะเหตุผลที่พบบ่อยที่สุดของการเปลี่ยนรหัสผ่าน
 * คือสงสัยว่ารหัสเดิมรั่ว การเตะทุก session จึงเป็นสิ่งที่ต้องเกิด
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await apiRequest<void>('/auth/change-password', {
    method: 'POST',
    body: { current_password: currentPassword, new_password: newPassword },
  });
}
