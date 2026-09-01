import Link from 'next/link';
import { ShieldOff } from 'lucide-react';

export const metadata = { title: 'ບໍ່ມີສິດເຂົ້າເຖິງ' };

/**
 * ไม่มีสิทธิ์เข้าถึง
 *
 * บอกทางออกเสมอ ไม่ใช่แค่ปิดประตู
 * ผู้ใช้ที่มาถึงหน้านี้มักถูกส่งลิงก์มาจากเพื่อนร่วมงาน จึงไม่รู้ตัวว่าไม่มีสิทธิ์
 */
export default function ForbiddenPage() {
  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <span className="grid h-16 w-16 place-items-center rounded-full bg-sla-breach-bg text-sla-breach">
        <ShieldOff className="h-8 w-8" aria-hidden="true" />
      </span>
      <h1 className="text-h1">ທ່ານບໍ່ມີສິດເຂົ້າເຖິງໜ້ານີ້</h1>
      <p className="max-w-md text-body text-ink-2">
        ໜ້ານີ້ຈຳກັດໄວ້ສະເພາະບາງບົດບາດ ຫຼື ບາງບໍລິສັດ
        ຫາກທ່ານຄິດວ່າຄວນເຂົ້າໄດ້ ໃຫ້ຕິດຕໍ່ຜູ້ດູແລລະດັບບໍລິສັດຂອງທ່ານເພື່ອຂໍສິດເພີ່ມ
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link
          href="/"
          className="inline-flex min-h-tap items-center rounded bg-primary px-4 text-body-sm font-semibold text-white hover:bg-primary-hover"
        >
          ກັບໄປໜ້າຫຼັກ
        </Link>
        <Link
          href="/tickets/new"
          className="inline-flex min-h-tap items-center rounded border border-control bg-surface px-4 text-body-sm font-semibold hover:bg-subtle"
        >
          ແຈ້ງເລື່ອງຂໍສິດເຂົ້າເຖິງ
        </Link>
      </div>
    </main>
  );
}
