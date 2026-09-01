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
 * ตัวโลโก้พื้นเข้มอยู่แล้ว จึงวางได้ทั้งบนพื้นสว่างและพื้นเข้มโดยไม่ต้องมีกรอบ
 * มีแต่ข้อความข้าง ๆ ที่ต้องสลับสีตามพื้น จึงเป็นที่มาของ prop `tone`
 */
export function Brand({
  className,
  showWordmark = true,
  tone = 'light',
}: {
  className?: string | undefined;
  showWordmark?: boolean | undefined;
  /** light = วางบนพื้นสว่าง · dark = วางบนพื้นเข้ม */
  tone?: 'light' | 'dark' | undefined;
}): React.JSX.Element {
  const dark = tone === 'dark';

  return (
    <span className={cn('flex min-w-0 items-center gap-3', className)}>
      <Image
        src="/company-logo.jpg"
        width={516}
        height={317}
        priority
        className={cn(
          'h-9 w-auto flex-none',
          // บนพื้นเข้ม โลโก้กับพื้นหลังกลืนกัน จึงคั่นด้วยเส้นบางให้เห็นขอบภาพ
          dark && 'ring-1 ring-white/10',
        )}
        alt="ໂລໂກ້ບໍລິສັດ ເອໄອດີຊີ ເທັກ ຈຳກັດ (AIDC TECH Sole Co., Ltd)"
      />
      {showWordmark && (
        <span className="min-w-0 leading-tight">
          <span
            className={cn(
              'block truncate text-body-sm font-bold tracking-tight',
              dark ? 'text-[color:var(--side-ink)]' : 'text-ink',
            )}
          >
            AIDC Service Desk
          </span>
          <span
            className={cn(
              'block truncate text-caption',
              dark ? 'text-[color:var(--side-ink-3)]' : 'text-ink-3',
            )}
          >
            ສູນບໍລິການກຸ່ມບໍລິສັດ
          </span>
        </span>
      )}
    </span>
  );
}
