import Link from 'next/link';
import { SearchX } from 'lucide-react';

export const metadata = { title: 'ບໍ່ພົບໜ້າ' };

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <span className="grid h-16 w-16 place-items-center rounded-full bg-subtle text-ink-3">
        <SearchX className="h-8 w-8" aria-hidden="true" />
      </span>
      <h1 className="text-h1">ບໍ່ພົບໜ້າທີ່ຕ້ອງການ</h1>
      <p className="max-w-md text-body text-ink-2">
        ໜ້ານີ້ອາດຖືກຍ້າຍ ຫຼື ລິ້ງທີ່ໄດ້ຮັບອາດບໍ່ຄົບຖ້ວນ
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex min-h-tap items-center rounded bg-primary px-4 text-body-sm font-semibold text-white hover:bg-primary-hover"
      >
        ກັບໄປໜ້າຫຼັກ
      </Link>
    </main>
  );
}
