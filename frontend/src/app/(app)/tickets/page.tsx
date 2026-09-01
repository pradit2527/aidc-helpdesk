'use client';

import { Download, Search, X } from 'lucide-react';
import * as React from 'react';

import { TicketList } from '@/components/tickets/ticket-list';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/ui/data-table';
import { Input, Select } from '@/components/ui/field';
import { MockNotice, PageHeader } from '@/components/ui/misc';
import { PRIORITY, TICKET_STATUS, TICKET_TYPE } from '@/config/enums';
import { useSession } from '@/lib/session';
import { TICKET_CATEGORIES, TICKETS } from '@/mocks/data';

const PAGE_SIZE = 20;

/**
 * เรื่องทั้งหมดในขอบเขต + ค้นหา/กรอง/ส่งออก (FR-16, US-10)
 *
 * ตัวกรองอยู่ในแถบเดียวที่ยุบได้บนมือถือ ไม่ใช่แผงด้านข้างถาวร
 * บนจอ 375px แผงด้านข้างจะกินพื้นที่จนเหลือที่ให้รายการไม่ถึงครึ่ง
 */
export default function AllTicketsPage(): React.JSX.Element {
  const { user } = useSession();
  const [page, setPage] = React.useState(1);
  const [filters, setFilters] = React.useState({
    q: '',
    status: '',
    priority: '',
    type: '',
    company: '',
    category: '',
  });

  const filtered = React.useMemo(() => {
    return TICKETS.filter((t) => {
      if (filters.q) {
        const q = filters.q.toLowerCase();
        const haystack = `${t.ticket_no} ${t.subject} ${t.requester.full_name}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filters.status && t.status !== filters.status) return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.type && t.ticket_type !== filters.type) return false;
      if (filters.company && String(t.company.id) !== filters.company) return false;
      if (filters.category && t.category.name_th !== filters.category) return false;
      return true;
    });
  }, [filters]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeFilters = Object.entries(filters).filter(([, v]) => v !== '');

  function update(key: keyof typeof filters, value: string): void {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ເລື່ອງທັງໝົດ"
        description={`ຂອບເຂດ ${user.scoped_companies.map((c) => c.code).join(' · ') || 'ທຸກບໍລິສັດ'}`}
        actions={
          <Button variant="secondary">
            <Download className="h-4 w-4" aria-hidden="true" />
            ສົ່ງອອກ Excel
          </Button>
        }
      />

      <MockNotice endpoint="GET /tickets" />

      <Card>
        <div className="border-b border-hair p-4 lg:p-5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={filters.q}
              onChange={(e) => update('q', e.target.value)}
              placeholder="ຄົ້ນຫາເລກທີ່ ຫົວຂໍ້ ຫຼື ຊື່ຜູ້ແຈ້ງ"
              aria-label="ຄົ້ນຫາເລື່ອງແຈ້ງ"
              className="pl-9"
            />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Select
              value={filters.status}
              onChange={(e) => update('status', e.target.value)}
              aria-label="ກັ່ນຕອງຕາມສະຖານະ"
            >
              <option value="">ທຸກສະຖານະ</option>
              {Object.entries(TICKET_STATUS).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </Select>

            <Select
              value={filters.priority}
              onChange={(e) => update('priority', e.target.value)}
              aria-label="ກັ່ນຕອງຕາມລະດັບຄວາມສຳຄັນ"
            >
              <option value="">ທຸກລະດັບ</option>
              {Object.entries(PRIORITY).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </Select>

            <Select
              value={filters.type}
              onChange={(e) => update('type', e.target.value)}
              aria-label="ກັ່ນຕອງຕາມປະເພດ"
            >
              <option value="">ທຸກປະເພດ</option>
              {Object.entries(TICKET_TYPE).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>

            <Select
              value={filters.company}
              onChange={(e) => update('company', e.target.value)}
              aria-label="ກັ່ນຕອງຕາມບໍລິສັດ"
            >
              <option value="">ທຸກບໍລິສັດໃນຂອບເຂດ</option>
              {user.scoped_companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </Select>

            <Select
              value={filters.category}
              onChange={(e) => update('category', e.target.value)}
              aria-label="ກັ່ນຕອງຕາມໝວດໝູ່"
            >
              <option value="">ທຸກໝວດໝູ່</option>
              {TICKET_CATEGORIES.map((c) => (
                <option key={c.id} value={c.name_th}>
                  {c.name_th}
                </option>
              ))}
            </Select>
          </div>

          {activeFilters.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-caption text-ink-3">
                ໃຊ້ຕົວກັ່ນຕອງຢູ່ {activeFilters.length} ລາຍການ
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setFilters({ q: '', status: '', priority: '', type: '', company: '', category: '' })
                }
              >
                <X className="h-4 w-4" aria-hidden="true" />
                ລ້າງທັງໝົດ
              </Button>
            </div>
          )}
        </div>

        <div className="p-4 lg:p-5">
          <TicketList
            tickets={pageRows}
            emptyTitle="ບໍ່ພົບເລື່ອງທີ່ຕົງກັບເງື່ອນໄຂ"
            emptyHint="ລອງລົບຕົວກັ່ນຕອງບາງອັນ ຫຼື ປ່ຽນຄຳຄົ້ນຫາ"
          />
        </div>

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          onPageChange={setPage}
        />
      </Card>
    </div>
  );
}
