'use client';

import { ArrowLeft, CheckCircle2, Headphones, MessagesSquare } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import {
  ProjectChip,
  VerifiedMark,
  VisitorContact,
  WidgetMark,
  hasRealAccount,
  isWidgetChat,
  verifiedState,
} from '@/components/support-chat/chat-origin';
import { ChatThread } from '@/components/support-chat/chat-thread';
import { ChatTicketAction } from '@/components/support-chat/convert-to-ticket';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Alert, PageHeader } from '@/components/ui/misc';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  useChatInbox,
  useChatThread,
  useCloseChat,
  useMarkChatRead,
  useSendChatFile,
  useSendChatMessage,
  type ChatFileInput,
  type ChatInboxStatus,
  type SupportChatSummary,
} from '@/lib/queries/support-chat';
import { useSupportProjects } from '@/lib/queries/support-projects';
import { useCan, useSession } from '@/lib/session';

const relative = new Intl.RelativeTimeFormat('lo-LA', { numeric: 'auto' });

function ago(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}

/**
 * กล่องแชทของทีมไอที — รายการห้องซ้าย ห้องที่เลือกขวา
 *
 * ข้อความใหม่เข้ามาแบบเรียลไทม์ผ่าน SupportChatRealtime ใน AppShell
 * หน้านี้ไม่ต้องเชื่อมต่อเอง อ่านจาก cache ที่ถูกเติมให้แล้ว
 */
export default function ChatInboxPage(): React.JSX.Element {
  const isStaff = useCan('ticket.change_status');
  const [status, setStatus] = React.useState<ChatInboxStatus>('open');
  const [projectId, setProjectId] = React.useState<number | null>(null);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const inbox = useChatInbox(status, { projectId }, isStaff);

  /*
   * รายชื่อโครงการมีไว้ทำตัวกรองเท่านั้น
   *
   * องค์กรที่ยังไม่ได้เปิดใช้ Support Hub จะไม่มีโครงการสักอัน และ API รุ่นที่ยัง
   * ไม่มี endpoint นี้ก็ตอบ 404 — ทั้งสองกรณีต้องได้กล่องแชทหน้าตาเดิมทุกประการ
   * ไม่ใช่ตัวกรองเปล่า ๆ หรือข้อความผิดพลาดคาหน้าจอ
   */
  const projects = useSupportProjects(isStaff);
  const projectOptions = projects.isError ? [] : (projects.data ?? []);

  // โครงการที่เลือกไว้ถูกปิดหรือถูกลบไประหว่างเปิดหน้าค้างไว้ — กลับไปที่ "ทุกโครงการ"
  React.useEffect(() => {
    if (projectId === null) return;
    if (projects.data && !projects.data.some((p) => p.id === projectId)) setProjectId(null);
  }, [projects.data, projectId]);

  // ลิงก์จากการแจ้งเตือน (/chats?id=12) เปิดห้องนั้นให้เลย — อ่านครั้งเดียวตอนเข้าหน้า
  React.useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('id'));
    if (Number.isInteger(id) && id > 0) setSelectedId(id);
  }, []);

  if (!isStaff) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Alert tone="warning" title="ບໍ່ມີສິດເຂົ້າກ່ອງແຊັດ">
          ກ່ອງແຊັດສຳລັບທີມໄອທີ — ຖ້າຕ້ອງການສອບຖາມ ກົດປຸ່ມແຊັດມຸມຂວາລຸ່ມ
        </Alert>
      </div>
    );
  }

  const chats = inbox.data ?? [];
  const unreadCount = chats.filter((chat) => chat.unread).length;

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="ກ່ອງແຊັດ"
        description="ແຊັດຈາກຜູ້ໃຊ້ໃນບໍລິສັດທີ່ທ່ານດູແລ ແລະ ຜູ້ເຂົ້າຊົມເວັບຂອງໂຄງການທີ່ຮັບຊັບພອດ — ຂໍ້ຄວາມໃໝ່ເຂົ້າມາທັນທີ ບໍ່ຕ້ອງໂຫຼດໜ້າໃໝ່"
      />

      <div className="grid min-h-[560px] overflow-hidden rounded-lg border border-hair bg-surface shadow-card lg:h-[calc(100dvh-15rem)] lg:grid-cols-[340px_1fr]">
        {/* ── รายการห้อง ── */}
        <aside className={cn('flex min-h-0 flex-col border-hair lg:border-r', selectedId !== null && 'hidden lg:flex')}>
          <div className="flex flex-none gap-1 border-b border-hair p-2" role="tablist" aria-label="ສະຖານະແຊັດ">
            {(['open', 'closed'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={status === value}
                onClick={() => {
                  setStatus(value);
                  setSelectedId(null);
                }}
                className={cn(
                  'min-h-tap flex-1 rounded px-3 text-body-sm font-semibold',
                  status === value ? 'bg-primary-subtle text-[color:var(--primary-subtle-ink)]' : 'text-ink-2 hover:bg-subtle',
                )}
              >
                {value === 'open' ? 'ກຳລັງສົນທະນາ' : 'ປິດແລ້ວ'}
                {value === 'open' && unreadCount > 0 && (
                  <span className="tabular ml-1.5 rounded-full bg-sla-breach-solid px-1.5 text-[11px] text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ตัวกรองโครงการโผล่เฉพาะองค์กรที่เปิดใช้ Support Hub แล้วจริง ๆ */}
          {projectOptions.length > 0 && (
            <div className="flex-none border-b border-hair px-2 py-2">
              <label htmlFor="chat-project-filter" className="sr-only">
                ກັ່ນຕອງຕາມໂຄງການ
              </label>
              <Select
                id="chat-project-filter"
                value={projectId === null ? '' : String(projectId)}
                onChange={(e) => {
                  setProjectId(e.target.value === '' ? null : Number(e.target.value));
                  setSelectedId(null);
                }}
              >
                <option value="">ທຸກໂຄງການ</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} — {project.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {inbox.isLoading && <li className="p-4 text-body-sm text-ink-3">ກຳລັງໂຫຼດ...</li>}
            {!inbox.isLoading && chats.length === 0 && (
              <li className="flex flex-col items-center gap-2 p-8 text-center text-body-sm text-ink-3">
                <MessagesSquare className="h-8 w-8" aria-hidden="true" />
                {projectId !== null
                  ? 'ຍັງບໍ່ມີແຊັດຂອງໂຄງການນີ້'
                  : status === 'open'
                    ? 'ຍັງບໍ່ມີແຊັດທີ່ລໍຖ້າຢູ່'
                    : 'ຍັງບໍ່ມີແຊັດທີ່ປິດແລ້ວ'}
              </li>
            )}
            {chats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                selected={chat.id === selectedId}
                onSelect={() => setSelectedId(chat.id)}
              />
            ))}
          </ul>
        </aside>

        {/* ── ห้องที่เลือก ── */}
        <section className={cn('min-h-0', selectedId === null && 'hidden lg:block')}>
          {selectedId === null ? (
            <div className="grid h-full place-items-center p-8 text-center text-body-sm text-ink-3">
              <div className="flex flex-col items-center gap-3">
                <Headphones className="h-10 w-10" aria-hidden="true" />
                ເລືອກແຊັດທາງຊ້າຍເພື່ອເລີ່ມຕອບ
              </div>
            </div>
          ) : (
            <StaffThread chatId={selectedId} onBack={() => setSelectedId(null)} />
          )}
        </section>
      </div>
    </div>
  );
}

function ChatListItem({
  chat,
  selected,
  onSelect,
}: {
  chat: SupportChatSummary;
  selected: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  /* null = ไม่ใช่ห้องจาก widget หรือยังไม่มีข้อมูลติดต่อ จึงไม่มีอะไรให้ยืนยัน */
  const verified = verifiedState(chat.contact);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'flex w-full flex-col gap-1 border-b border-[color:var(--border-soft)] px-4 py-3 text-left transition-colors',
          selected ? 'bg-primary-subtle shadow-[inset_3px_0_0_0_var(--accent-fill)]' : 'hover:bg-subtle',
        )}
      >
        <span className="flex items-center gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-body-sm', chat.unread ? 'font-bold text-ink' : 'font-semibold text-ink')}>
            {chat.requester.full_name}
          </span>
          <span className="flex-none text-caption tabular text-ink-3">{ago(chat.last_message_at)}</span>
          {chat.unread && <span className="h-2.5 w-2.5 flex-none rounded-full bg-sla-breach-solid" aria-label="ຍັງບໍ່ໄດ້ອ່ານ" />}
        </span>
        {/*
          บรรทัดที่บอกว่า "ห้องนี้มาจากไหน"
          ป้ายโครงการกับป้าย "ຈາກເວັບ" มาก่อนชื่อบริษัท เพราะเป็นสิ่งที่เปลี่ยนวิธี
          ตอบของเจ้าหน้าที่ ส่วนบริษัทกับผู้รับผิดชอบเป็นข้อมูลประกอบ
        */}
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-ink-3">
          {chat.project && <ProjectChip project={chat.project} />}
          {isWidgetChat(chat) && <WidgetMark />}
          {isWidgetChat(chat) && verified !== null && <VerifiedMark verified={verified} />}
          <span className="min-w-0 truncate">
            {chat.company?.code}
            {chat.requester.department ? ` · ${chat.requester.department}` : ''}
            {chat.assignee ? ` · ${chat.assignee.full_name}` : ' · ຍັງບໍ່ມີຄົນຮັບ'}
          </span>
        </span>
        {chat.last_message && (
          <span className={cn('line-clamp-2 text-caption', chat.unread ? 'text-ink' : 'text-ink-2')}>
            {chat.last_message.from_staff ? 'ທີມໄອທີ: ' : ''}
            {chat.last_message.body}
          </span>
        )}
      </button>
    </li>
  );
}

function StaffThread({ chatId, onBack }: { chatId: number; onBack: () => void }): React.JSX.Element {
  const { user } = useSession();
  /* สิทธิ์ชุดเดียวกับที่ใช้เปิดหน้านี้และปุ่มปิดแชท — ไม่ตั้งเกณฑ์ใหม่ให้ต่างจากของเดิม */
  const canAct = useCan('ticket.change_status');
  const thread = useChatThread(chatId);
  const send = useSendChatMessage(chatId);
  const sendFile = useSendChatFile(chatId);
  const close = useCloseChat(chatId);
  const markRead = useMarkChatRead();
  const markReadMutate = markRead.mutate;

  const data = thread.data;
  const unread = data?.unread ?? false;
  const verified = verifiedState(data?.contact);

  // เปิดห้องอยู่แล้วมีข้อความใหม่เข้ามา = อ่านแล้ว
  React.useEffect(() => {
    if (unread) markReadMutate(chatId);
  }, [unread, chatId, markReadMutate]);

  if (thread.isLoading) {
    return <div className="grid h-full place-items-center text-body-sm text-ink-3">ກຳລັງໂຫຼດ...</div>;
  }
  if (!data) {
    return (
      <div className="p-6">
        <Alert tone="warning" title="ບໍ່ພົບແຊັດນີ້">ແຊັດອາດຢູ່ນອກຂອບເຂດບໍລິສັດທີ່ທ່ານດູແລ</Alert>
      </div>
    );
  }

  const onSend = async (body: string): Promise<boolean> => {
    try {
      await send.mutateAsync(body);
      return true;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ສົ່ງຂໍ້ຄວາມບໍ່ສຳເລັດ');
      return false;
    }
  };

  const onSendFile = async (input: ChatFileInput): Promise<boolean> => {
    try {
      await sendFile.mutateAsync(input);
      return true;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ສົ່ງໄຟລ໌ບໍ່ສຳເລັດ');
      return false;
    }
  };

  const onClose = async (): Promise<void> => {
    try {
      await close.mutateAsync();
      toast.success('ປິດແຊັດແລ້ວ');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ປິດແຊັດບໍ່ສຳເລັດ');
    }
  };

  return (
    <div className="flex h-full min-h-[520px] flex-col">
      {/* ปุ่มสองปุ่มกับชื่อผู้แจ้งยาว ๆ ไม่พออยู่บรรทัดเดียวบนมือถือ — ให้ตกบรรทัดแทนการบีบ */}
      <header className="flex flex-none flex-wrap items-center gap-3 border-b border-hair px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="ກັບໄປລາຍການແຊັດ"
          className="grid h-tap w-tap flex-none place-items-center rounded text-ink-2 hover:bg-subtle lg:hidden"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        {/*
          basis-40 ไม่ใช่ความกว้างจริง แต่เป็นเกณฑ์ให้เบราว์เซอร์ตัดสินว่าจะขึ้นบรรทัดใหม่เมื่อไร
          ถ้าปล่อยเป็น flex-1 เฉย ๆ (ฐาน 0) ปุ่มสองปุ่มจะบีบชื่อผู้แจ้งจนเหลือไม่กี่ตัวอักษร
          บนมือถือ แทนที่จะตกลงไปอยู่บรรทัดถัดไปซึ่งอ่านได้ทั้งคู่
        */}
        <div className="min-w-0 grow basis-40">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-body-sm font-semibold text-ink">
              {data.requester.full_name}
            </span>
            {data.project && <ProjectChip project={data.project} />}
            {isWidgetChat(data) && <WidgetMark />}
            {isWidgetChat(data) && verified !== null && <VerifiedMark verified={verified} full />}
          </p>
          {/*
            ผู้เข้าชมที่ยืนยันตัวตนแล้วอาจถูกจับคู่กับพนักงานในระบบได้ กรณีนั้น
            requester เป็นคนจริงและมีแผนก/ตำแหน่งครบ — แสดงแบบเดียวกับแชทในระบบ
            กล่องข้อมูลติดต่อมีไว้สำหรับคนที่ไม่มีบัญชีเท่านั้น (requester.id === 0)
          */}
          {isWidgetChat(data) && !hasRealAccount(data) ? (
            <VisitorContact contact={data.contact} className="mt-0.5" />
          ) : (
            <p className="truncate text-caption text-ink-3">
              {data.company?.code}
              {data.requester.department ? ` · ${data.requester.department}` : ''}
              {data.requester.job_title ? ` · ${data.requester.job_title}` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-none items-center gap-2">
          {/*
            key ผูกกับห้อง — ปุ่มนี้จำเลขที่ใบที่เพิ่งสร้างไว้ในตัวเอง
            ถ้าไม่รีเซ็ตตอนสลับห้อง เลขที่ของห้องก่อนหน้าจะค้างอยู่บนห้องใหม่
          */}
          <ChatTicketAction key={data.id} chat={data} canConvert={canAct} />
          {data.status === 'open' ? (
            <Button size="sm" variant="secondary" onClick={() => void onClose()} disabled={close.isPending}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              ປິດແຊັດ
            </Button>
          ) : (
            <span className="rounded-full bg-subtle px-2.5 py-0.5 text-caption font-semibold text-ink-2">ປິດແລ້ວ</span>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <ChatThread
          messages={data.messages}
          viewerId={user.id}
          onSend={onSend}
          onSendFile={onSendFile}
          sending={send.isPending || sendFile.isPending}
          composerDisabled={data.status !== 'open'}
          composerNotice={data.status !== 'open' ? 'ແຊັດນີ້ປິດແລ້ວ — ຖ້າຜູ້ໃຊ້ພິມມາໃໝ່ ລະບົບຈະເປີດແຊັດໃໝ່ໃຫ້' : undefined}
          placeholder="ພິມຄຳຕອບ... (Enter ເພື່ອສົ່ງ)"
        />
      </div>
    </div>
  );
}
