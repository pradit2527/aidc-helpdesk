import { AppShell } from '@/components/layout/app-shell';

/**
 * เปลือกของทุกหน้าที่ต้องล็อกอินแล้ว
 *
 * หน้า /login และ /change-password อยู่นอกกลุ่มนี้โดยตั้งใจ
 * เพราะยังไม่ควรมีเมนูให้กดไปหน้าอื่นก่อนยืนยันตัวตนเสร็จ
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
