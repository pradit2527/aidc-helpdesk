'use client';

import { FileText, Loader2, Mic, Paperclip, Send, Square, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { formatFileSize } from '@/lib/format';
import {
  chatFileUrl,
  type ChatAttachment,
  type ChatFileInput,
  type SupportChatMessage,
} from '@/lib/queries/support-chat';

const timeFormat = new Intl.DateTimeFormat('lo-LA', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('lo-LA', { day: 'numeric', month: 'short' });

/** ≤ 20 MB ตรงกับ backend — ตรวจก่อนส่ง ไม่ให้ผู้ใช้รออัปโหลดไฟล์ใหญ่จนจบแล้วค่อยถูกปฏิเสธ */
const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** อัดเสียงได้นานสุด 5 นาที — ยาวกว่านี้ควรพิมพ์หรือโทร และไฟล์จะชนเพดาน 20 MB */
const MAX_RECORDING_MS = 5 * 60_000;
const MIN_RECORDING_MS = 800;

/** ชนิดที่ backend รับ — docx/xlsx/pptx เป็น zip จึงผ่าน */
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,audio/*,.pdf,.zip,.docx,.xlsx,.pptx,.txt,.csv,.log';

function formatChatTime(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? timeFormat.format(date) : `${dayFormat.format(date)} ${timeFormat.format(date)}`;
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** ชนิดเสียงแรกที่เบราว์เซอร์นี้อัดได้ — Chrome/Edge/Firefox ได้ webm · Safari ได้ mp4 */
function pickRecordingType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function extensionFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

/**
 * รายการข้อความ + ช่องพิมพ์ ของห้องแชทหนึ่งห้อง — ใช้ทั้งฝั่งผู้ใช้และทีมไอที
 *
 * ข้อความของผู้ดูอยู่ชิดขวา อีกฝ่ายชิดซ้ายพร้อมชื่อผู้ส่ง ข้อความระบบอยู่กลาง
 * ส่งได้สามแบบ: พิมพ์ · แนบไฟล์/รูป (หรือวางภาพหน้าจอด้วย Ctrl+V) · อัดเสียง
 */
export function ChatThread({
  messages,
  viewerId,
  onSend,
  onSendFile,
  sending,
  composerDisabled = false,
  composerNotice,
  emptyState,
  autoFocus = false,
  placeholder = 'ພິມຂໍ້ຄວາມ... (Enter ເພື່ອສົ່ງ · Shift+Enter ຂຶ້ນແຖວໃໝ່)',
}: {
  messages: readonly SupportChatMessage[];
  viewerId: number;
  onSend: (body: string) => Promise<boolean>;
  onSendFile: (input: ChatFileInput) => Promise<boolean>;
  sending: boolean;
  composerDisabled?: boolean;
  composerNotice?: React.ReactNode;
  emptyState?: React.ReactNode;
  autoFocus?: boolean;
  placeholder?: string;
}): React.JSX.Element {
  const [draft, setDraft] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const recorder = useVoiceRecorder();

  // เลื่อนลงล่างสุดเมื่อมีข้อความใหม่ — เลื่อนเฉพาะกล่องนี้ ไม่ลากทั้งหน้าตาม
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const busy = sending || composerDisabled;

  const submit = async (): Promise<void> => {
    const body = draft.trim();
    if (!body || busy) return;
    // เคลียร์ช่องหลังส่งสำเร็จเท่านั้น — ส่งไม่ผ่านแล้วข้อความหาย ผู้ใช้ต้องพิมพ์ใหม่ทั้งหมด
    if (await onSend(body)) setDraft('');
  };

  /** ส่งไฟล์ — ข้อความที่พิมพ์ค้างไว้ไปเป็นคำบรรยายของไฟล์ด้วย */
  const sendFile = async (file: Blob, fileName: string): Promise<void> => {
    if (busy) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error('ໄຟລ໌ໃຫຍ່ເກີນ 20 MB');
      return;
    }
    const caption = draft.trim();
    const ok = await onSendFile(caption ? { file, fileName, body: caption } : { file, fileName });
    if (ok && caption) setDraft('');
  };

  const onPickFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    // ล้างค่าเสมอ — เลือกไฟล์เดิมซ้ำจะไม่เกิด change ถ้าไม่ล้าง
    event.target.value = '';
    if (file) void sendFile(file, file.name);
  };

  // วางภาพหน้าจอ (Ctrl+V) ลงช่องพิมพ์ = ส่งรูปนั้น — วิธีที่เร็วที่สุดในการแจ้งปัญหาไอที
  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const image = [...event.clipboardData.files].find((file) => file.type.startsWith('image/'));
    if (!image) return;
    event.preventDefault();
    void sendFile(image, image.name || `screenshot-${Date.now()}.png`);
  };

  const finishRecording = async (): Promise<void> => {
    const clip = await recorder.stop();
    if (!clip) return;
    if (clip.durationMs < MIN_RECORDING_MS) {
      toast.error('ຂໍ້ຄວາມສຽງສັ້ນເກີນໄປ');
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await sendFile(clip.blob, `voice-${stamp}.${extensionFor(clip.blob.type)}`);
  };

  // อัดครบเวลาสูงสุด — ส่งให้เองเหมือนกดหยุด
  React.useEffect(() => {
    if (recorder.elapsedMs >= MAX_RECORDING_MS && recorder.recording) void finishRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.elapsedMs, recorder.recording]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          emptyState
        ) : (
          <ol className="flex flex-col gap-3" aria-live="polite">
            {messages.map((message) => (
              <MessageItem key={message.id} message={message} own={message.sender?.id === viewerId} />
            ))}
          </ol>
        )}
      </div>

      {composerNotice && (
        <p className="flex-none border-t border-hair bg-subtle px-4 py-2 text-caption text-ink-2">{composerNotice}</p>
      )}

      {recorder.recording ? (
        <div className="flex flex-none items-center gap-3 border-t border-hair bg-surface p-3" role="status">
          <span className="h-3 w-3 flex-none animate-pulse rounded-full bg-sla-breach-solid" aria-hidden="true" />
          <span className="tabular text-body-sm font-semibold text-ink">{formatDuration(recorder.elapsedMs)}</span>
          <span className="min-w-0 flex-1 truncate text-caption text-ink-3">
            ກຳລັງອັດສຽງ... ສູງສຸດ {formatDuration(MAX_RECORDING_MS)}
          </span>
          <Button type="button" variant="ghost" onClick={recorder.cancel} aria-label="ຍົກເລີກການອັດສຽງ">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            ຍົກເລີກ
          </Button>
          <Button type="button" onClick={() => void finishRecording()}>
            <Square className="h-4 w-4" aria-hidden="true" />
            ຢຸດ ແລະ ສົ່ງ
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-none items-end gap-2 border-t border-hair bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden" onChange={onPickFile} />
          <div className="flex flex-none flex-col gap-1 sm:flex-row">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              aria-label="ແນບຮູບ ຫຼື ໄຟລ໌"
              title="ແນບຮູບ ຫຼື ໄຟລ໌ (ວາງພາບໜ້າຈໍດ້ວຍ Ctrl+V ກໍໄດ້)"
              className="grid h-tap w-tap place-items-center rounded text-ink-2 hover:bg-subtle disabled:opacity-40"
            >
              <Paperclip className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => void recorder.start()}
              disabled={busy}
              aria-label="ອັດຂໍ້ຄວາມສຽງ"
              title="ອັດຂໍ້ຄວາມສຽງ"
              className="grid h-tap w-tap place-items-center rounded text-ink-2 hover:bg-subtle disabled:opacity-40"
            >
              <Mic className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder={placeholder}
            aria-label="ຂໍ້ຄວາມ"
            disabled={composerDisabled}
            autoFocus={autoFocus}
            className="flex-1"
          />
          <Button type="submit" disabled={busy || draft.trim().length === 0}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            ສົ່ງ
          </Button>
        </form>
      )}
    </div>
  );
}

function MessageItem({ message, own }: { message: SupportChatMessage; own: boolean }): React.JSX.Element {
  if (message.is_system) {
    return (
      <li className="self-center px-3 text-center text-caption text-ink-3">
        {message.body}
        <span className="ml-2 tabular">{formatChatTime(message.created_at)}</span>
      </li>
    );
  }

  return (
    <li className={cn('flex max-w-[85%] flex-col gap-1', own ? 'items-end self-end' : 'items-start self-start')}>
      {!own && (
        <span className="px-1 text-caption font-semibold text-ink-2">
          {message.sender?.full_name ?? ''}
          {message.from_staff && <span className="ml-1.5 font-normal text-primary">· ທີມໄອທີ</span>}
        </span>
      )}
      {message.attachment && <AttachmentView attachment={message.attachment} own={own} />}
      {message.body && (
        <div
          className={cn(
            'whitespace-pre-wrap break-words rounded-lg px-3.5 py-2.5 text-body-sm',
            own ? 'bg-primary text-[color:var(--on-accent)]' : 'border border-hair bg-surface text-ink',
          )}
        >
          {message.body}
        </div>
      )}
      <span className="px-1 text-caption tabular text-ink-3">{formatChatTime(message.created_at)}</span>
    </li>
  );
}

function AttachmentView({ attachment, own }: { attachment: ChatAttachment; own: boolean }): React.JSX.Element {
  const url = chatFileUrl(attachment);

  if (attachment.kind === 'image') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-hair">
        {/* eslint-disable-next-line @next/next/no-img-element -- ไฟล์ส่วนตัวผ่านคุกกี้ล็อกอิน ใช้ next/image ไม่ได้ */}
        <img src={url} alt={attachment.name} loading="lazy" className="block max-h-64 max-w-full object-contain" />
      </a>
    );
  }

  if (attachment.kind === 'audio') {
    return (
      <audio
        controls
        preload="metadata"
        src={url}
        className="h-10 w-64 max-w-full"
        aria-label={`ຂໍ້ຄວາມສຽງ ${attachment.name}`}
      />
    );
  }

  return (
    <a
      href={url}
      className={cn(
        'flex max-w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-body-sm',
        own ? 'bg-primary text-[color:var(--on-accent)]' : 'border border-hair bg-surface text-ink',
      )}
    >
      <FileText className="h-5 w-5 flex-none" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate font-semibold underline">{attachment.name}</span>
        <span className="block text-caption opacity-80">{formatFileSize(attachment.size)}</span>
      </span>
    </a>
  );
}

interface RecordedClip {
  blob: Blob;
  durationMs: number;
}

/**
 * อัดเสียงจากไมโครโฟนด้วย MediaRecorder
 *
 * ⚠️ เบราว์เซอร์อนุญาตไมโครโฟนเฉพาะหน้าที่เป็น https หรือ localhost
 *    บน production ที่ยังเป็น http ปุ่มนี้จะแจ้งว่าใช้ไม่ได้
 */
function useVoiceRecorder(): {
  recording: boolean;
  elapsedMs: number;
  start: () => Promise<void>;
  stop: () => Promise<RecordedClip | null>;
  cancel: () => void;
} {
  const [recording, setRecording] = React.useState(false);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const mediaRef = React.useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; startedAt: number } | null>(null);

  const release = React.useCallback((): void => {
    mediaRef.current?.stream.getTracks().forEach((track) => track.stop());
    mediaRef.current = null;
    setRecording(false);
    setElapsedMs(0);
  }, []);

  // ปิดไมโครโฟนเมื่อออกจากหน้า — ไม่งั้นไฟแดงของไมค์ค้างและเบราว์เซอร์ยังฟังอยู่
  React.useEffect(() => release, [release]);

  React.useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const started = mediaRef.current?.startedAt;
      if (started) setElapsedMs(Date.now() - started);
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  const start = async (): Promise<void> => {
    if (mediaRef.current) return;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('ເບຣົາເຊີນີ້ອັດສຽງບໍ່ໄດ້ — ຕ້ອງເປີດຜ່ານ https');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error('ບໍ່ໄດ້ຮັບອະນຸຍາດໃຫ້ໃຊ້ໄມໂຄຣໂຟນ — ກວດການຕັ້ງຄ່າຂອງເບຣົາເຊີ');
      return;
    }
    const type = pickRecordingType();
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.start();
    mediaRef.current = { recorder, stream, chunks, startedAt: Date.now() };
    setElapsedMs(0);
    setRecording(true);
  };

  const stop = (): Promise<RecordedClip | null> => {
    const media = mediaRef.current;
    if (!media) return Promise.resolve(null);
    return new Promise((resolve) => {
      media.recorder.onstop = () => {
        const blob = new Blob(media.chunks, { type: media.recorder.mimeType || 'audio/webm' });
        const durationMs = Date.now() - media.startedAt;
        release();
        resolve(blob.size > 0 ? { blob, durationMs } : null);
      };
      media.recorder.stop();
    });
  };

  const cancel = (): void => {
    const media = mediaRef.current;
    if (!media) return;
    media.recorder.onstop = null;
    if (media.recorder.state !== 'inactive') media.recorder.stop();
    release();
  };

  return { recording, elapsedMs, start, stop, cancel };
}
