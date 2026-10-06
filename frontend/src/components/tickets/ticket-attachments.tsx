import { Download, FileText, Paperclip } from 'lucide-react';
import * as React from 'react';

import { attachmentKind, attachmentUrl } from '@/lib/attachments';
import { formatFileSize } from '@/lib/format';
import type { TicketAttachment } from '@/lib/types';

/**
 * ไฟล์ที่ผู้แจ้งแนบมากับเรื่อง — รูปแสดงตรง ๆ วิดีโอเล่นได้ในหน้า ที่เหลือเป็นลิงก์ดาวน์โหลด
 *
 * ทีมไอทีเปิดเรื่องแล้วต้องเห็นภาพที่ผู้แจ้งถ่ายมาทันที ไม่ต้องกดดาวน์โหลดแล้วเปิดโปรแกรมแยก
 * ภาพหน้าจอ error กับวิดีโอที่ตัวเครื่องมีอาการ คือข้อมูลที่ตอบคำถามแรกที่ไอทีมักต้องถามกลับ
 *
 * ทุกชิ้นมีลิงก์ดาวน์โหลดเสมอ แม้แสดงในหน้าได้แล้ว: วิดีโอ .mov จากไอโฟนบางรุ่นเข้ารหัสแบบที่
 * Chrome เล่นไม่ได้ ผู้ใช้จะเห็นกล่องดำ — ปุ่มดาวน์โหลดคือทางออกที่ไม่ต้องรู้ว่าเกิดอะไรขึ้น
 */
export function TicketAttachments({
  attachments,
}: {
  attachments: readonly TicketAttachment[] | undefined;
}): React.JSX.Element | null {
  if (!attachments || attachments.length === 0) return null;

  return (
    <section className="mt-4 border-t border-hair pt-4" aria-label="ໄຟລ໌ແນບຂອງເລື່ອງ">
      <h3 className="mb-3 flex items-center gap-1.5 text-label text-ink">
        <Paperclip className="h-4 w-4 text-ink-3" aria-hidden="true" />
        ຮູບ ແລະ ໄຟລ໌ທີ່ແນບມາ
        <span className="tabular text-caption font-normal text-ink-3">({attachments.length})</span>
      </h3>

      <ul className="grid gap-3 sm:grid-cols-2">
        {attachments.map((file) => {
          const kind = attachmentKind(file.mime_type);
          return (
            <li key={file.id} className="min-w-0 rounded border border-hair bg-subtle p-2">
              {kind === 'image' && (
                <a
                  href={attachmentUrl(file.id, true)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`ເປີດຮູບ ${file.file_name} ເຕັມຈໍ`}
                  className="block overflow-hidden rounded"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- ไฟล์ส่วนตัวผ่านคุกกี้ล็อกอิน ใช้ next/image ไม่ได้ */}
                  <img
                    src={attachmentUrl(file.id, true)}
                    alt={file.file_name}
                    loading="lazy"
                    className="max-h-64 w-full bg-surface object-contain"
                  />
                </a>
              )}

              {kind === 'video' && (
                // preload="metadata" โหลดแค่ความยาวกับเฟรมแรก ไม่ดึงวิดีโอทั้งก้อนมาจนกว่าจะกดเล่น
                <video
                  controls
                  preload="metadata"
                  playsInline
                  className="max-h-72 w-full rounded bg-black"
                  aria-label={file.file_name}
                >
                  <source src={attachmentUrl(file.id, true)} type={file.mime_type} />
                </video>
              )}

              {kind === 'file' && (
                <div
                  className="grid h-16 place-items-center rounded bg-surface text-ink-3"
                  aria-hidden="true"
                >
                  <FileText className="h-7 w-7" />
                </div>
              )}

              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-body-sm font-semibold text-ink">
                    {file.file_name}
                  </span>
                  <span className="tabular block text-caption text-ink-3">
                    {formatFileSize(file.file_size)}
                  </span>
                </span>
                <a
                  href={attachmentUrl(file.id)}
                  download={file.file_name}
                  className="inline-flex min-h-[36px] flex-none items-center gap-1.5 rounded px-2 text-caption font-semibold text-primary hover:bg-primary-subtle"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  ດາວໂຫຼດ
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
