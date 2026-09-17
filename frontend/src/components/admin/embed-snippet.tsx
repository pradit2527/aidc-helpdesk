'use client';

import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

/**
 * สคริปต์ที่ทีมอื่นก็อปไปวางในเว็บของตัวเอง
 *
 * ทั้งงานนี้มีอยู่เพื่อให้บรรทัดเดียวนี้เป็นสิ่งเดียวที่ทีมอื่นต้องรู้ —
 * ไม่ต้องรู้ว่ามี Chatwoot อยู่ ไม่ต้องขอ token ไม่ต้องรอใครตั้งค่าให้
 * ปุ่มคัดลอกจึงสำคัญกว่าที่คิด คนที่ลากเมาส์เลือกเองมักได้ช่องว่างหัวท้ายติดมาด้วย
 *
 * ⚠️ ห้ามตัดข้อความให้สั้นลงด้วย CSS ที่ซ่อนบางส่วน
 *    ผู้ใช้จำนวนหนึ่งจะเลือกด้วยมืออยู่ดี ถ้าสิ่งที่เห็นไม่ใช่ของจริงทั้งบรรทัด
 *    เขาจะวางสคริปต์ที่ขาดไปครึ่งหนึ่งลงเว็บจริงโดยไม่รู้ตัว
 */
export function EmbedSnippet({
  snippet,
  label,
}: {
  snippet: string;
  /** ข้อความบนปุ่มสำหรับโปรแกรมอ่านหน้าจอ — มีหลายบล็อกในหน้าเดียว */
  label: string;
}): React.JSX.Element {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      /*
       * คลิปบอร์ดถูกปฏิเสธได้จริงบนเบราว์เซอร์ที่ตั้งค่าเข้มหรือหน้าที่ไม่ใช่ https
       * บอกให้ผู้ใช้เลือกเอง ดีกว่าปุ่มที่กดแล้วไม่เกิดอะไรขึ้นเลย
       */
      toast.error('ຄັດລອກອັດຕະໂນມັດບໍ່ໄດ້ — ກະລຸນາເລືອກຂໍ້ຄວາມແລ້ວກົດ Ctrl+C');
    }
  };

  return (
    <div className="flex items-start gap-2 rounded border border-hair bg-subtle p-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre text-caption text-ink-2">
        {snippet}
      </code>
      <Button type="button" variant="secondary" size="sm" onClick={() => void copy()}>
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="sr-only">
          {copied ? `ຄັດລອກ${label}ແລ້ວ` : `ຄັດລອກ${label}`}
        </span>
        <span aria-hidden="true">{copied ? 'ຄັດລອກແລ້ວ' : 'ຄັດລອກ'}</span>
      </Button>
    </div>
  );
}
