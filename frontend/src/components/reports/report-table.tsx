'use client';

import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  X,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { DataTable, EmptyState, type Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { cellText, compareCells, hasComponent } from '@/lib/cell-text';
import { formatNumber } from '@/lib/format';
import { pageWindow } from '@/lib/page-window';
import { downloadBytes, fileSafeName, printTable, toCsv, toTsv, toXlsx } from '@/lib/table-export';

/**
 * ตารางรายงานแบบ DataTable — ปุ่มส่งออกซ้ายบน · ช่องค้นหาขวาบน · กดหัวคอลัมน์เรียงลำดับ ·
 * "แสดง X ถึง Y จาก Z แถว" · ปุ่มเลขหน้า
 *
 * ใช้ DataTable กลางวาดแถว จึงได้การ์ดบนมือถือ แถวสลับสี และสีตอนชี้เมาส์เหมือนทุกตารางในระบบ
 * ส่วนนี้เพิ่มเฉพาะของที่ตารางรายงานต้องการ
 *
 * ไม่ต้องแก้นิยามคอลัมน์ของหน้ารายงาน: ข้อความของเซลล์อ่านจากสิ่งที่ render แสดงอยู่จริง
 * (lib/cell-text.ts) จึงเรียง ค้นหา และส่งออกได้ตรงกับที่ผู้ใช้เห็นเสมอ ไม่มีสองชุดที่เพี้ยนจากกัน
 *
 * ⚠️ ส่งออกและพิมพ์ใช้ "ทุกแถวที่ผ่านการค้นหา ทุกหน้า" ตามลำดับที่เรียงอยู่ ไม่ใช่เฉพาะหน้าที่เห็น
 *    ไฟล์รายงานที่ขาดไปเก้าในสิบเพราะผู้ใช้อยู่หน้าแรก คือรายงานที่ส่งต่อไปแล้วตัวเลขผิดเงียบ ๆ
 */

const PAGE_SIZES = [10, 25, 50, 100] as const;

export interface ReportTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  /** ชื่อตาราง — ใช้เป็นหัวกระดาษตอนพิมพ์ ชื่อแผ่นงาน และชื่อไฟล์ที่ส่งออก */
  caption: string;
  emptyTitle?: string | undefined;
  emptyHint?: string | undefined;
  defaultPageSize?: (typeof PAGE_SIZES)[number] | undefined;
  /**
   * `rows` เป็นแค่หน้าเดียวที่เซิร์ฟเวอร์ส่งมา (ตารางนี้มีตัวแบ่งหน้าของเซิร์ฟเวอร์อยู่ใต้ตาราง)
   *
   * ไม่แบ่งหน้าซ้ำที่เบราว์เซอร์ — สองชุดเลขหน้าซ้อนกัน ผู้ใช้จะแยกไม่ออกว่าอันไหนพาไปแถวที่ 26 —
   * และบอกตรง ๆ ว่าค้นหา เรียง และส่งออกนับเฉพาะแถวที่โหลดมา ไม่ใช่ทุกแถวในรายงาน
   */
  loadedPageOnly?: boolean | undefined;
}

const warned = new Set<string>();

/**
 * ข้อความของเซลล์ที่คอลัมน์ไม่ได้ส่ง `text` มา — อ่านจากสิ่งที่ render คืน
 *
 * ป้ายที่เอาข้อความจาก props (ResultChip · StatusBadge · SlaBadge) อ่านออกเป็นว่าง เพราะ cellText
 * ไม่เรียกคอมโพเนนต์ (ดูเหตุผลใน lib/cell-text.ts) ตารางจะแสดงปกติแต่ไฟล์ส่งออกและช่องค้นหา
 * เห็นเซลล์ว่าง จึงเตือนในโหมดพัฒนาครั้งเดียวต่อคอลัมน์ให้คนเขียนรู้ว่าต้องเติม `text`
 */
function textOf<T>(column: Column<T>, row: T): string {
  const node = column.render(row);
  const text = cellText(node);
  if (
    text === '' &&
    process.env.NODE_ENV !== 'production' &&
    hasComponent(node) &&
    !warned.has(column.key)
  ) {
    warned.add(column.key);
    console.warn(
      `ReportTable: คอลัมน์ "${column.key}" ใช้คอมโพเนนต์ที่ไม่มีข้อความเป็นลูก — ค้นหา/ส่งออกจะเห็นเป็นว่าง ให้ส่ง text: (row) => … ของคอลัมน์นี้`,
    );
  }
  return text;
}

interface Prepared<T> {
  row: T;
  /** ข้อความของทุกคอลัมน์ ตามลำดับ columns */
  cells: string[];
  /** ค่าสำหรับเรียงของทุกคอลัมน์ */
  keys: (string | number | null)[];
  /** ข้อความรวมของทั้งแถว ตัวพิมพ์เล็ก — ไว้ค้นหา */
  haystack: string;
}

export function ReportTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  emptyTitle,
  emptyHint,
  defaultPageSize = 10,
  loadedPageOnly = false,
}: ReportTableProps<T>): React.JSX.Element {
  const [term, setTerm] = React.useState('');
  const [sort, setSort] = React.useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = React.useState(1);
  const [chosenPageSize, setPageSize] = React.useState<number>(defaultPageSize);

  // คอลัมน์ที่ไม่มีหัวคือคอลัมน์ปุ่ม — ไม่มีข้อมูลให้ค้นหา เรียง หรือส่งออก
  const dataColumns = React.useMemo(() => columns.filter((c) => c.header !== ''), [columns]);

  const prepared = React.useMemo<Prepared<T>[]>(
    () =>
      rows.map((row) => {
        const cells = dataColumns.map((c) => (c.text ? c.text(row) : textOf(c, row)));
        const keys = dataColumns.map((c, i) => (c.sortValue ? c.sortValue(row) : (cells[i] ?? '')));
        return { row, cells, keys, haystack: cells.join(' ').toLowerCase() };
      }),
    [rows, dataColumns],
  );

  const visible = React.useMemo(() => {
    const q = term.trim().toLowerCase();
    const filtered = q === '' ? prepared : prepared.filter((p) => p.haystack.includes(q));
    if (!sort) return filtered;

    const index = dataColumns.findIndex((c) => c.key === sort.key);
    if (index === -1) return filtered;
    // sort ของ JS เสถียร — แถวที่ค่าเท่ากันคงลำดับเดิมจากรายงาน ไม่สลับไปมาเมื่อกดเรียงซ้ำ
    return [...filtered].sort((a, b) =>
      compareCells(a.keys[index] ?? null, b.keys[index] ?? null, sort.dir),
    );
  }, [prepared, term, sort, dataColumns]);

  // เปลี่ยนคำค้น การเรียง ขนาดหน้า หรือข้อมูล → กลับหน้าแรก ไม่งั้นค้างที่หน้า 5 ของผลลัพธ์ที่เหลือหน้าเดียว
  // ผูกกับ "จำนวนแถว" ไม่ใช่ตัวอาร์เรย์ rows — หลายหน้ากรองด้วย .filter() ใหม่ทุกรอบเรนเดอร์
  // ถ้าผูกกับตัวอาร์เรย์ ทุกครั้งที่ข้อมูลรีเฟรชผู้ใช้ที่อยู่หน้า 3 จะถูกเด้งกลับหน้า 1 เอง
  React.useEffect(() => setPage(1), [term, sort, chosenPageSize, rows.length]);

  const total = visible.length;
  // หน้าเดียวจากเซิร์ฟเวอร์ → แสดงทุกแถวที่มี (อย่างน้อย 1 กันหารศูนย์ตอนว่าง)
  const pageSize = loadedPageOnly ? Math.max(1, rows.length) : chosenPageSize;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const shown = visible.slice((current - 1) * pageSize, current * pageSize);

  const header = dataColumns.map((c) => c.header);
  const exportRows = (): string[][] => visible.map((p) => p.cells);
  const noData = total === 0;

  function toggleSort(key: string): void {
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
  }

  async function copy(): Promise<void> {
    const text = toTsv(header, exportRows());
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API ใช้ได้เฉพาะ https/localhost — เครื่องอื่นในวงแลนเปิดผ่าน http จึงต้องถอยไปวิธีเก่า
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (!ok) {
        toast.error('ຄັດລອກບໍ່ສຳເລັດ — ລອງ CSV ຫຼື Excel ແທນ');
        return;
      }
    }
    toast.success(`ຄັດລອກ ${formatNumber(total)} ແຖວແລ້ວ — ວາງລົງ Excel ໄດ້ເລີຍ`);
  }

  function saveCsv(): void {
    downloadBytes(
      toCsv(header, exportRows()),
      'text/csv;charset=utf-8',
      `${fileSafeName(caption)}.csv`,
    );
  }

  function saveXlsx(): void {
    downloadBytes(
      toXlsx(caption, header, exportRows()),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      `${fileSafeName(caption)}.xlsx`,
    );
  }

  function print(): void {
    printTable(caption, header, exportRows());
  }

  function savePdf(): void {
    // ไม่มีไลบรารีสร้าง PDF ที่รองรับอักษรลาว — ใช้หน้าต่างพิมพ์ของเบราว์เซอร์ ซึ่งบันทึกเป็น PDF ได้
    // ด้วยฟอนต์ของระบบ ต้องบอกผู้ใช้ตรง ๆ ว่าต้องเลือกอะไร ไม่งั้นเขาจะเห็นแค่หน้าต่างสั่งพิมพ์
    toast.info('ໃນໜ້າຕ່າງພິມ ໃຫ້ເລືອກເຄື່ອງພິມເປັນ "Save as PDF" (ບັນທຶກເປັນ PDF)');
    print();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div
          role="group"
          aria-label="ສົ່ງອອກຂໍ້ມູນຕາຕະລາງ"
          className="inline-flex overflow-hidden rounded border border-control"
        >
          <ExportButton label="ຄັດລອກ" onClick={() => void copy()} disabled={noData} />
          <ExportButton label="CSV" onClick={saveCsv} disabled={noData} />
          <ExportButton label="Excel" onClick={saveXlsx} disabled={noData} />
          <ExportButton label="PDF" onClick={savePdf} disabled={noData} />
          <ExportButton label="ພິມ" onClick={print} disabled={noData} />
        </div>

        <label className="flex items-center gap-2 text-body-sm text-ink-2">
          <span className="flex-none">ຄົ້ນຫາ:</span>
          <span className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              aria-label={`ຄົ້ນຫາໃນຕາຕະລາງ ${caption}`}
              className="w-44 pl-8 pr-8 sm:w-56"
            />
            {term !== '' && (
              <button
                type="button"
                onClick={() => setTerm('')}
                aria-label="ລ້າງຄຳຄົ້ນຫາ"
                className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-ink-3 hover:bg-subtle hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </span>
        </label>
      </div>

      {/* บนจอแคบตารางกลายเป็นการ์ด ไม่มีหัวคอลัมน์ให้กด จึงมีช่องเลือกคอลัมน์ที่จะเรียงแทน */}
      {!noData && (
        <div className="flex items-center gap-2 text-body-sm text-ink-2 lg:hidden print:hidden">
          <label className="flex min-w-0 items-center gap-2">
            <span className="flex-none">ຮຽງຕາມ:</span>
            <select
              value={sort?.key ?? ''}
              onChange={(e) =>
                setSort(
                  e.target.value === '' ? null : { key: e.target.value, dir: sort?.dir ?? 'asc' },
                )
              }
              className="h-9 min-w-0 rounded border border-control bg-surface px-2 text-body-sm text-ink"
            >
              <option value="">—</option>
              {dataColumns
                .filter((c) => c.sortable !== false)
                .map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.header}
                  </option>
                ))}
            </select>
          </label>
          {sort && (
            <button
              type="button"
              onClick={() => setSort({ key: sort.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
              aria-label={
                sort.dir === 'asc'
                  ? 'ຮຽງຈາກນ້ອຍໄປຫາຫຼາຍ — ກົດເພື່ອສະຫຼັບ'
                  : 'ຮຽງຈາກຫຼາຍໄປຫານ້ອຍ — ກົດເພື່ອສະຫຼັບ'
              }
              className="grid h-9 w-9 flex-none place-items-center rounded border border-control bg-surface text-ink hover:bg-primary-subtle"
            >
              {sort.dir === 'asc' ? (
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      )}

      {noData ? (
        <EmptyState
          title={term.trim() !== '' ? 'ບໍ່ພົບແຖວທີ່ຕົງກັບຄຳຄົ້ນຫາ' : (emptyTitle ?? 'ບໍ່ມີຂໍ້ມູນ')}
          hint={
            term.trim() !== '' ? `ຄຳຄົ້ນຫາ «${term.trim()}» ບໍ່ກົງກັບແຖວໃດໃນຕາຕະລາງນີ້` : emptyHint
          }
        />
      ) : (
        <DataTable
          striped
          columns={columns}
          rows={shown.map((p) => p.row)}
          rowKey={rowKey}
          caption={caption}
          sort={sort}
          onSort={toggleSort}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-body-sm text-ink-2 print:hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="tabular" role="status" aria-live="polite">
            ສະແດງ {formatNumber(from)} ຫາ {formatNumber(to)} ຈາກ {formatNumber(total)} ແຖວ
            {total !== rows.length && (
              <span className="text-ink-3">
                {' '}
                (ກັ່ນຕອງຈາກທັງໝົດ {formatNumber(rows.length)} ແຖວ)
              </span>
            )}
          </p>
          {loadedPageOnly && (
            <span className="text-caption text-ink-3">
              ຄົ້ນຫາ · ຮຽງ · ສົ່ງອອກ ນັບສະເພາະແຖວຂອງໜ້ານີ້ — ປ່ຽນໜ້າດ້ວຍປຸ່ມລຸ່ມຕາຕະລາງ
            </span>
          )}
          {!loadedPageOnly && rows.length > PAGE_SIZES[0] && (
            <label className="flex items-center gap-1.5 text-caption text-ink-3">
              ແຖວຕໍ່ໜ້າ
              <select
                value={chosenPageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded border border-control bg-surface px-1.5 text-body-sm text-ink"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {pageCount > 1 && <Pager page={current} pageCount={pageCount} onChange={setPage} />}
      </div>
    </div>
  );
}

function ExportButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-[36px] border-r border-control bg-subtle px-3.5 text-body-sm font-semibold text-ink last:border-r-0 hover:bg-primary-subtle hover:text-primary disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-subtle"
    >
      {label}
    </button>
  );
}

/**
 * เลขหน้า: หน้าแรก · ก่อนหน้า · 1 2 3 … · ถัดไป · หน้าสุดท้าย
 * แสดงสูงสุดเจ็ดปุ่มเลข เหลือที่เหลือเป็น "…" — ตารางร้อยหน้าไม่ควรได้ปุ่มร้อยปุ่ม
 */
function Pager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}): React.JSX.Element {
  const numbers = pageWindow(page, pageCount);
  const edge =
    'inline-flex min-h-[36px] items-center gap-1 rounded border border-control bg-surface px-2.5 text-body-sm text-ink hover:bg-primary-subtle disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-surface';

  return (
    <nav aria-label="ເລືອກໜ້າຂອງຕາຕະລາງ" className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        className={edge}
        disabled={page <= 1}
        onClick={() => onChange(1)}
        aria-label="ໜ້າທຳອິດ"
      >
        <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
        <span className="hidden md:inline">ໜ້າທຳອິດ</span>
      </button>
      <button
        type="button"
        className={edge}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="ໜ້າກ່ອນ"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        <span className="hidden md:inline">ກ່ອນໜ້າ</span>
      </button>

      {numbers.map((n, i) =>
        n === null ? (
          <span key={`gap-${i}`} className="px-1 text-ink-3" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`ໜ້າ ${n}`}
            aria-current={n === page ? 'page' : undefined}
            className={cn(
              'tabular min-h-[36px] min-w-[36px] rounded border px-2 text-body-sm font-semibold',
              n === page
                ? 'border-primary bg-primary text-white'
                : 'border-control bg-surface text-ink hover:bg-primary-subtle',
            )}
          >
            {n}
          </button>
        ),
      )}

      <button
        type="button"
        className={edge}
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        aria-label="ໜ້າຖັດໄປ"
      >
        <span className="hidden md:inline">ຖັດໄປ</span>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={edge}
        disabled={page >= pageCount}
        onClick={() => onChange(pageCount)}
        aria-label="ໜ້າສຸດທ້າຍ"
      >
        <span className="hidden md:inline">ໜ້າສຸດທ້າຍ</span>
        <ChevronsRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
