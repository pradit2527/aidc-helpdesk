'use client';

import { FileText, ImagePlus, Play, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatFileSize } from '@/lib/format';
import {
  classifyUpload,
  MAX_UPLOAD_FILES,
  rejectionMessage,
  UPLOAD_ACCEPT,
  type UploadKind,
} from '@/lib/upload-rules';

/**
 * ปุ่มแนบรูปภาพหรือวิดีโอของหน้าแจ้งเรื่อง — ไม่บังคับ ใช้ร่วมกันทั้ง Incident และ Service Request
 *
 * เห็นตัวอย่างของสิ่งที่แนบก่อนกดส่ง (รูปย่อ / เฟรมแรกของวิดีโอ) เพราะผู้แจ้งส่วนใหญ่แนบจากมือถือ
 * และถ้าเลือกผิดไฟล์ พอส่งไปแล้วแก้ไม่ได้ ทีมไอทีจะได้ดูภาพที่ไม่เกี่ยวกับปัญหา
 *
 * ตรวจชนิดและขนาดตั้งแต่ตอนเลือก (lib/upload-rules.ts) แล้วบอกเหตุผลที่ทำอะไรต่อได้
 * เช่น "รูป HEIC ยังไม่รองรับ แคปหน้าจอแทน" — ดีกว่าเพิ่งรู้ตอนกดส่งหลังอัปโหลดเสร็จ
 */
export function MediaPicker({
  files,
  onChange,
  disabled = false,
}: {
  files: File[];
  onChange: (next: File[]) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  function addFiles(picked: File[]): void {
    const accepted: File[] = [];
    const rejected: string[] = [];

    for (const file of picked) {
      const verdict = classifyUpload(file);
      if (!verdict.ok) {
        rejected.push(rejectionMessage(file.name, verdict.reason));
        continue;
      }
      // ไฟล์เดียวกันเลือกซ้ำ (ชื่อ ขนาด และเวลาแก้ไขตรงกัน) ไม่ต้องใส่ซ้ำสองชิ้น
      const duplicate = [...files, ...accepted].some(
        (f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified,
      );
      if (!duplicate) accepted.push(file);
    }

    // แสดงเหตุผลไม่เกินสามข้อความ — เลือกมาร้อยไฟล์ไม่ควรได้ toast ร้อยอัน
    for (const message of rejected.slice(0, 3)) toast.error(message);
    if (rejected.length > 3) toast.error(`ແລະອີກ ${rejected.length - 3} ໄຟລ໌ທີ່ໃຊ້ບໍ່ໄດ້`);

    const room = MAX_UPLOAD_FILES - files.length;
    if (accepted.length > room) {
      toast.error(`ແນບໄດ້ສູງສຸດ ${MAX_UPLOAD_FILES} ໄຟລ໌ຕໍ່ເລື່ອງ`);
    }
    if (room > 0 && accepted.length > 0) onChange([...files, ...accepted.slice(0, room)]);
  }

  const full = files.length >= MAX_UPLOAD_FILES;

  return (
    <div className="space-y-1.5">
      <p className="flex flex-wrap items-baseline gap-x-2 text-label text-ink">
        ຮູບ ຫຼື ວິດີໂອປະກອບ
        <span className="text-caption font-normal text-ink-3">(ບໍ່ບັງຄັບ)</span>
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled && !full) addFiles(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded border border-dashed px-4 py-4 text-center transition-colors',
          dragging ? 'border-primary bg-primary-subtle' : 'border-control bg-subtle',
        )}
      >
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || full}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" aria-hidden="true" />
          ເລືອກຮູບ ຫຼື ວິດີໂອ
        </Button>

        <span className="text-caption text-ink-3">
          {/* จอสัมผัสลากไฟล์มาวางไม่ได้ — บอกสิ่งที่ทำได้จริงบนเครื่องนั้น */}
          <span className="sm:hidden">ແຕະປຸ່ມເພື່ອຖ່າຍ ຫຼື ເລືອກຈາກເຄື່ອງ</span>
          <span className="hidden sm:inline">ຫຼື ລາກໄຟລ໌ມາວາງບ່ອນນີ້</span>
        </span>

        <span className="text-caption text-ink-3">
          ຮູບ PNG · JPEG · GIF · WebP · ວິດີໂອ MP4 · MOV · WebM · 3GP (ສັ້ນ ໆ) · ເອກະສານ PDF · DOCX
          · XLSX
        </span>
        <span className="tabular text-caption text-ink-3">
          ໄຟລ໌ລະບໍ່ເກີນ 20 MB · ສູງສຸດ {MAX_UPLOAD_FILES} ໄຟລ໌ · ເລືອກແລ້ວ {files.length}/
          {MAX_UPLOAD_FILES}
        </span>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            // เคลียร์ค่าเพื่อให้เลือกไฟล์เดิมซ้ำหลังลบออกได้ — ไม่งั้น onChange ไม่ยิงเพราะค่าไม่เปลี่ยน
            e.target.value = '';
          }}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-2 pt-1">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex items-center gap-3 rounded border border-hair bg-surface p-2 text-body-sm"
            >
              <Thumb file={file} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">{file.name}</span>
                <span className="tabular block text-caption text-ink-3">
                  {formatFileSize(file.size)}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                aria-label={`ລົບ ${file.name}`}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * รูปย่อของไฟล์ที่เลือก
 *
 * สร้าง URL ชั่วคราวใน effect ของตัวเอง ไม่สร้างตอน render แล้วเก็บไว้ใน useMemo
 * — โหมด dev ของ React รัน effect สองรอบ (สร้าง → ล้าง → สร้าง) ถ้า URL ถูกสร้างนอก effect
 * การล้างรอบแรกจะเรียก revokeObjectURL ไปแล้ว รอบสองไม่มีอะไรสร้างใหม่ รูปย่อทุกรูปจึงเสียทันที
 * และ revoke ตอน unmount เสมอ ไม่งั้นไฟล์วิดีโอทั้งก้อนค้างอยู่ในหน่วยความจำของแท็บ
 */
function Thumb({ file }: { file: File }): React.JSX.Element {
  const verdict = classifyUpload(file);
  const kind: UploadKind = verdict.ok ? verdict.kind : 'document';
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (kind === 'document') return undefined;
    const created = URL.createObjectURL(file);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [file, kind]);

  const box =
    'relative grid h-14 w-14 flex-none place-items-center overflow-hidden rounded bg-subtle';

  if (kind === 'document') {
    return (
      <span className={box} aria-hidden="true">
        <FileText className="h-6 w-6 text-ink-3" />
      </span>
    );
  }

  if (kind === 'image') {
    return (
      <span className={box} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- ไฟล์ในเครื่องผู้ใช้ (blob:) ใช้ next/image ไม่ได้ */}
        {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      </span>
    );
  }

  return (
    <span className={box} aria-hidden="true">
      {/* #t=0.1 ให้เบราว์เซอร์แสดงเฟรมแรกเป็นภาพปก โดยไม่ต้องโหลดทั้งวิดีโอ */}
      {url && (
        <video
          src={`${url}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      )}
      <span className="absolute inset-0 grid place-items-center bg-black/30">
        <Play className="h-5 w-5 fill-white text-white" />
      </span>
    </span>
  );
}
