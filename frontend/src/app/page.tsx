import { redirect } from 'next/navigation';

/**
 * ทางเข้าตามบทบาท
 *
 * ของจริงจะอ่าน roles จาก /auth/me แล้วส่งไปคนละที่:
 *   end_user -> /tickets/my · agent -> /queue · company_admin/super_admin/manager_viewer -> /dashboard
 * ตอนนี้ยังไม่มี backend จึงส่งไปคิวงานตรง ๆ
 */
export default function RootPage() {
  redirect('/queue');
}
