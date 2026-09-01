'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { landingPath } from '@/config/nav';
import { useSession } from '@/lib/session';

/**
 * ทางเข้าตามบทบาท (หน้าจอ #3)
 *
 * แต่ละบทบาทมี "งานแรกที่ต้องทำ" ต่างกัน จึงส่งไปคนละหน้า
 *   ผู้แจ้ง -> เรื่องของฉัน · เจ้าหน้าที่ -> คิวงาน · ผู้ดูแล/ผู้บริหาร -> แดชบอร์ด
 *
 * ต้องเป็น Client Component เพราะบทบาทมาจาก session ฝั่ง client
 * เมื่อผูก /auth/me จริงแล้ว ย้ายไปตัดสินใจใน middleware ได้ ซึ่งเร็วกว่า
 */
export default function RootPage(): React.JSX.Element {
  const router = useRouter();
  const { user } = useSession();

  React.useEffect(() => {
    router.replace(landingPath(user.roles));
  }, [router, user.roles]);

  return (
    <main id="main" className="grid min-h-screen place-items-center px-4">
      <p className="text-body text-ink-2">ກຳລັງພາໄປໜ້າຫຼັກຂອງທ່ານ...</p>
    </main>
  );
}
