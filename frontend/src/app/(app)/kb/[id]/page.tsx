'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eye, Pencil, ThumbsDown, ThumbsUp } from 'lucide-react';
import * as React from 'react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Alert, BackLink, DefRow, MockNotice } from '@/components/ui/misc';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useHasRole } from '@/lib/session';
import { KB_ARTICLES } from '@/mocks/data';

/**
 * อ่านบทความ + ให้คะแนน + ทางออกถ้ายังไม่หาย
 *
 * เนื้อหาเป็น Markdown ที่ผู้ใช้ในระบบเขียนเอง จึงต้องผ่าน rehype-sanitize เสมอ
 * ผู้เขียนเป็นคนในองค์กรไม่ได้แปลว่าปลอดภัย — บัญชีถูกยึดได้ และ
 * บทความที่ฝัง <script> ไว้จะรันในเบราว์เซอร์ของทุกคนที่เปิดอ่าน
 */
export default function KbArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.JSX.Element {
  const { id } = React.use(params);
  const article = KB_ARTICLES.find((a) => a.id === Number(id));
  if (!article) notFound();

  const canEdit = useHasRole('agent', 'company_admin', 'super_admin');
  const [voted, setVoted] = React.useState<'up' | 'down' | null>(null);

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href="/kb" label="ກັບໄປຄັງຄວາມຮູ້" />

      <MockNotice endpoint={`GET /kb/articles/${id}`} />

      {article.status === 'draft' && (
        <div className="mb-4">
          <Alert tone="warning" title="ບົດຄວາມນີ້ຍັງເປັນຮ່າງ">
            ຜູ້ໃຊ້ທົ່ວໄປຍັງເບິ່ງບໍ່ເຫັນ ຈົນກວ່າຈະຖືກເຜີຍແຜ່
          </Alert>
        </div>
      )}

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="inline-block rounded-sm bg-primary-subtle px-2 py-0.5 text-caption font-semibold text-primary">
                {article.category.name_th}
              </span>
              <h1 className="mt-2 text-h1 leading-snug">{article.title}</h1>
              {article.summary && <p className="mt-1 text-body text-ink-2">{article.summary}</p>}
            </div>
            {canEdit && (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/kb/${article.id}/edit`}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  ແກ້ໄຂ
                </Link>
              </Button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-hair py-2 text-caption text-ink-3">
            <span>{article.author.full_name}</span>
            <span>ອັບເດດ {formatDateTime(article.updated_at)}</span>
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="tabular">{formatNumber(article.view_count)} ຄັ້ງ</span>
            </span>
          </div>

          {/* prose-* ไม่ได้ติดตั้งปลั๊กอิน typography จึงจัดสไตล์เองด้วย CSS ที่กำหนดไว้ */}
          <div className="kb-body mt-5 text-body text-ink">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {article.body_markdown}
            </Markdown>
          </div>

          {article.tags.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full bg-subtle px-2.5 py-0.5 text-caption text-ink-2"
                >
                  #{tag}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardBody>
          <p className="text-body font-semibold">ບົດຄວາມນີ້ຊ່ວຍແກ້ບັນຫາຂອງທ່ານໄດ້ບໍ່</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant={voted === 'up' ? 'primary' : 'secondary'}
              onClick={() => {
                setVoted('up');
                toast.success('ຂອບໃຈສຳລັບຄຳຕິຊົມ');
              }}
              // ป้องกันโหวตซ้ำที่ฝั่งฐานข้อมูลด้วย unique(article, user) อีกชั้น
              disabled={voted !== null}
            >
              <ThumbsUp className="h-4 w-4" aria-hidden="true" />
              ຊ່ວຍໄດ້ ({formatNumber(article.helpful_count)})
            </Button>
            <Button
              variant={voted === 'down' ? 'primary' : 'secondary'}
              onClick={() => {
                setVoted('down');
                toast.info('ຂອບໃຈ ພວກເຮົາຈະປັບປຸງບົດຄວາມນີ້');
              }}
              disabled={voted !== null}
            >
              <ThumbsDown className="h-4 w-4" aria-hidden="true" />
              ຍັງບໍ່ໄດ້ ({formatNumber(article.not_helpful_count)})
            </Button>
          </div>

          <div className="mt-4 border-t border-hair pt-4">
            <p className="text-body-sm text-ink-2">ຖ້າຍັງແກ້ບໍ່ໄດ້ ແຈ້ງເລື່ອງເຂົ້າມາໄດ້ເລີຍ</p>
            <Button asChild className="mt-2">
              <Link href="/tickets/new">ແຈ້ງບັນຫາ</Link>
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardBody>
          <dl className="divide-y divide-hair">
            <DefRow label="ສະຖານະ">
              {article.status === 'published' ? 'ເຜີຍແຜ່ແລ້ວ' : article.status === 'draft' ? 'ຮ່າງ' : 'ຈັດເກັບ'}
            </DefRow>
            <DefRow label="ເຜີຍແຜ່ເມື່ອ">
              {article.published_at ? formatDateTime(article.published_at) : '—'}
            </DefRow>
            <DefRow label="ຜູ້ຂຽນ">{article.author.full_name}</DefRow>
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
