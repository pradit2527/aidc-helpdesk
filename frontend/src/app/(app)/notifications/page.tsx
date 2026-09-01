'use client';

import Link from 'next/link';
import {
  AlertOctagon,
  Bell,
  CheckCheck,
  CheckSquare,
  Clock,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/data-table';
import { MockNotice, PageHeader, Tabs } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { NOTIFICATIONS } from '@/mocks/data';

/** ไอคอนต่อชนิดเหตุการณ์ — ต่างกันจริง ไม่ใช่กระดิ่งอันเดียวทุกแถว */
const EVENT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  sla_breached: AlertOctagon,
  sla_warning: Clock,
  assigned: UserPlus,
  comment: MessageSquare,
  approval_pending: CheckSquare,
  resolved: CheckCheck,
};

const EVENT_TONE: Record<string, string> = {
  sla_breached: 'bg-sla-breach-bg text-sla-breach',
  sla_warning: 'bg-sla-risk-bg text-sla-risk',
  resolved: 'bg-sla-ok-bg text-sla-ok',
};

export default function NotificationsPage(): React.JSX.Element {
  const [tab, setTab] = React.useState<'unread' | 'all'>('unread');
  const [readIds, setReadIds] = React.useState<number[]>([]);

  const items = NOTIFICATIONS.map((n) => ({
    ...n,
    read_at: readIds.includes(n.id) ? new Date().toISOString() : n.read_at,
  }));
  const unread = items.filter((n) => n.read_at === null);
  const shown = tab === 'unread' ? unread : items;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ການແຈ້ງເຕືອນ"
        description="ເຫດການທີ່ກ່ຽວຂ້ອງກັບເລື່ອງທີ່ທ່ານແຈ້ງ ຫຼື ຮັບຜິດຊອບ"
        actions={
          unread.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => {
                setReadIds(NOTIFICATIONS.map((n) => n.id));
                toast.success('ໝາຍວ່າອ່ານແລ້ວທັງໝົດ');
              }}
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              ອ່ານແລ້ວທັງໝົດ
            </Button>
          )
        }
      />

      <MockNotice endpoint="GET /notifications" />

      <Card>
        <div className="px-4 pt-1 lg:px-5">
          <Tabs
            tabs={[
              { key: 'unread' as const, label: 'ຍັງບໍ່ໄດ້ອ່ານ', count: unread.length },
              { key: 'all' as const, label: 'ທັງໝົດ', count: items.length },
            ]}
            value={tab}
            onChange={setTab}
            label="ກຸ່ມການແຈ້ງເຕືອນ"
          />
        </div>

        {shown.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="ບໍ່ມີການແຈ້ງເຕືອນທີ່ຍັງບໍ່ໄດ້ອ່ານ"
            hint="ເມື່ອມີຄວາມເຄື່ອນໄຫວໃນເລື່ອງຂອງທ່ານ ຈະມາປາກົດຢູ່ນີ້"
          />
        ) : (
          <ul className="divide-y divide-hair">
            {shown.map((item) => {
              const Icon = EVENT_ICON[item.event_type] ?? Bell;
              const isUnread = item.read_at === null;
              const body = (
                <div className="flex items-start gap-3 px-4 py-3 lg:px-5">
                  <span
                    className={cn(
                      'grid h-9 w-9 flex-none place-items-center rounded-full',
                      EVENT_TONE[item.event_type] ?? 'bg-subtle text-ink-2',
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={cn('text-body-sm', isUnread ? 'font-semibold text-ink' : 'text-ink-2')}
                      >
                        {item.title}
                      </span>
                      {isUnread && (
                        <span
                          className="h-2 w-2 flex-none rounded-full bg-primary"
                          role="img"
                          aria-label="ຍັງບໍ່ໄດ້ອ່ານ"
                        />
                      )}
                      <time
                        className="ml-auto flex-none text-caption text-ink-3"
                        dateTime={item.created_at}
                        title={formatDateTime(item.created_at)}
                      >
                        {formatRelative(item.created_at)}
                      </time>
                    </span>
                    <span className="mt-0.5 block text-body-sm text-ink-2">{item.body}</span>
                    {item.ticket && (
                      <span className="tabular mt-1 block text-caption text-ink-3">
                        {item.ticket.ticket_no}
                      </span>
                    )}
                  </span>
                </div>
              );

              return (
                <li key={item.id} className={cn(isUnread && 'bg-primary-subtle/40')}>
                  {item.ticket ? (
                    <Link
                      href={`/tickets/${item.ticket.id}`}
                      onClick={() => setReadIds((prev) => [...prev, item.id])}
                      className="block hover:bg-subtle"
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
