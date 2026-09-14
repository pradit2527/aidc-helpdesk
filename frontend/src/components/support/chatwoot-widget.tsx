'use client';

import * as React from 'react';

import { loadChatwoot } from '@/lib/chatwoot';

/**
 * ปุ่มแชทถาม-ตอบกับทีม IT มุมขวาล่างของทุกหน้า
 *
 * วางไว้นอก SessionProvider โดยตั้งใจ — ต้องขึ้นทั้งหน้า login และหน้าที่แจ้งว่า
 * ติดต่อเซิร์ฟเวอร์ไม่ได้ ซึ่งเป็นสองจังหวะที่คนต้องการถามมากที่สุด
 * (ลืมรหัสผ่าน / ระบบเข้าไม่ได้) และเป็นจังหวะที่ยังไม่มี session
 *
 * ไม่ได้วาดอะไรเอง Chatwoot สร้างปุ่มและหน้าต่างของมันเอง
 */
export function ChatwootWidget(): null {
  React.useEffect(() => {
    loadChatwoot();
  }, []);

  return null;
}
