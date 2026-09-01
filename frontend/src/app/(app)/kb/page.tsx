'use client';

import Link from 'next/link';
import { BookOpen, Eye, Plus, Search, ThumbsUp } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/data-table';
import { Input, Select } from '@/components/ui/field';
import { MockNotice, PageHeader } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { formatDateShort, formatNumber } from '@/lib/format';
import { useHasRole } from '@/lib/session';
import { KB_ARTICLES, KB_CATEGORIES } from '@/mocks/data';

const VISIBILITY_LABEL = {
  public: 'ທຸກຄົນເຫັນ',
  internal: 'ພາຍໃນອົງກອນ',
  agent_only: 'ສະເພາະເຈົ້າໜ້າທີ່',
} as const;

/**
 * คลังความรู้ (US-13)
 *
 * ค้นหาภาษาลาวใช้การเทียบแบบ trigram ที่ฝั่งฐานข้อมูล
 * เพราะภาษาลาวเขียนติดกันไม่มีช่องว่างคั่นคำ การตัดคำแบบปกติจึงใช้ไม่ได้
 */
export default function KbPage(): React.JSX.Element {
  const canWrite = useHasRole('agent', 'company_admin', 'super_admin');
  const [q, setQ] = React.useState('');
  const [category, setCategory] = React.useState('');

  const articles = KB_ARTICLES.filter((a) => {
    // ผู้ใช้ทั่วไปเห็นเฉพาะบทความที่เผยแพร่แล้ว — ของจริงกรองที่ backend
    if (!canWrite && a.status !== 'published') return false;
    if (category && String(a.category.id) !== category) return false;
    if (q) {
      const haystack = `${a.title} ${a.summary ?? ''} ${a.tags.join(' ')}`.toLowerCase();
      if (!haystack.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ຄັງຄວາມຮູ້"
        description="ຄົ້ນຫາວິທີແກ້ບັນຫາດ້ວຍຕົນເອງກ່ອນແຈ້ງເລື່ອງ"
        actions={
          canWrite && (
            <Button asChild>
              <Link href="/kb/new">
                <Plus className="h-4 w-4" aria-hidden="true" />
                ຂຽນບົດຄວາມ
              </Link>
            </Button>
          )
        }
      />

      <MockNotice endpoint="GET /kb/articles" />

      <Card>
        <CardBody className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ພິມສິ່ງທີ່ຢາກຮູ້ ເຊັ່ນ ‘ເຂົ້າ wifi ບໍ່ໄດ້’"
              aria-label="ຄົ້ນຫາບົດຄວາມ"
              className="pl-9"
            />
          </div>
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="ກັ່ນຕອງຕາມໝວດໝູ່"
          >
            <option value="">ທຸກໝວດໝູ່</option>
            {KB_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_th}
              </option>
            ))}
          </Select>
        </CardBody>
      </Card>

      {articles.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="ບໍ່ພົບບົດຄວາມທີ່ຕົງກັບຄຳຄົ້ນຫາ"
            hint="ລອງໃຊ້ຄຳສັ້ນລົງ ຫຼື ແຈ້ງເລື່ອງເຂົ້າມາໃຫ້ທີມງານຊ່ວຍ"
            action={
              <Button asChild variant="secondary">
                <Link href="/tickets/new">ແຈ້ງບັນຫາແທນ</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => (
            <Link key={article.id} href={`/kb/${article.id}`} className="block h-full">
              <Card className="h-full transition-colors hover:border-primary">
                <CardBody className="flex h-full flex-col">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-sm bg-primary-subtle px-2 py-0.5 text-caption font-semibold text-primary">
                      {article.category.name_th}
                    </span>
                    {article.status === 'draft' && (
                      <span className="rounded-sm border border-dashed border-control px-2 py-0.5 text-caption text-ink-3">
                        ຮ່າງ — ຍັງບໍ່ເຜີຍແຜ່
                      </span>
                    )}
                    {article.visibility !== 'public' && (
                      <span className="rounded-sm bg-subtle px-2 py-0.5 text-caption text-ink-2">
                        {VISIBILITY_LABEL[article.visibility]}
                      </span>
                    )}
                  </div>

                  <h2 className="mt-2 text-h3 leading-snug">{article.title}</h2>
                  {article.summary && (
                    <p className="mt-1 line-clamp-3 text-body-sm text-ink-2">{article.summary}</p>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-caption text-ink-3">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="tabular">{formatNumber(article.view_count)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="tabular">{formatNumber(article.helpful_count)}</span>
                    </span>
                    <span className={cn('ml-auto')}>ອັບເດດ {formatDateShort(article.updated_at)}</span>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
