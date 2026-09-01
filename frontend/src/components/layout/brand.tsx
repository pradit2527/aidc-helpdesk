import Image from 'next/image';
import * as React from 'react';

import { cn } from '@/lib/cn';

/**
 * ตราสัญลักษณ์ของระบบ — ใช้ที่เดียวแล้วเรียกซ้ำทุกที่
 *
 * ไฟล์โลโก้ดึงมาจาก prototype/AIDC_Helpdesk_Portal_v2.html (ตัวแปร COMPANY_LOGO)
 * ซึ่งฝังไว้เป็น data URI ขนาด 27 KB — แตกออกมาเป็นไฟล์จริงใน public/
 * เพื่อให้เบราว์เซอร์แคชได้ และไม่ต้องส่งไบต์ชุดเดิมซ้ำในทุก HTML
 *
 * โลโก้พื้นเข้มอยู่แล้ว จึงไม่ต้องมีกรอบหรือพื้นหลังเพิ่ม
 */
export function Brand({
  className,
  showWordmark = true,
}: {
  className?: string | undefined;
  showWordmark?: boolean | undefined;
}): React.JSX.Element {
  return (
    <span className={cn('flex min-w-0 items-center gap-3', className)}>
      <Image
        src="/company-logo.jpg"
        width={516}
        height={317}
        priority
        className="h-9 w-auto flex-none"
        alt="ໂລໂກ້ບໍລິສັດ ເອໄອດີຊີ ເທັກ ຈຳກັດ (AIDC TECH Sole Co., Ltd)"
      />
      {showWordmark && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-body-sm font-bold tracking-tight">
            AIDC Service Desk
          </span>
          <span className="block truncate text-caption text-ink-3">ສູນບໍລິການກຸ່ມບໍລິສັດ</span>
        </span>
      )}
    </span>
  );
}
