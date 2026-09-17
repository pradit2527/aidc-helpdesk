'use client';

import { Globe, Mail, Phone, ShieldAlert, ShieldCheck, User } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';
import type { ChatVisitorContact, SupportChatSummary } from '@/lib/queries/support-chat';

/**
 * ป้ายบอกที่มาของห้องแชท
 *
 * กล่องแชทเดียวกันรับสองอย่างปนกัน: แชทของพนักงานที่ล็อกอินอยู่ กับแชทของ
 * คนนอกที่กดปุ่มบนเว็บของบริษัท — เจ้าหน้าที่ต้องรู้ก่อนพิมพ์คำตอบว่ากำลังคุยกับใคร
 * เพราะน้ำเสียงและข้อมูลที่อ้างถึงได้ต่างกันสิ้นเชิง
 *
 * ⚠️ ห้ามใช้สีเป็นตัวบอกความต่าง
 *    เจ้าหน้าที่บางคนแยกสีไม่ได้ และหน้าจอนี้ถูกเปิดบนโปรเจกเตอร์ในห้องประชุม
 *    ประจำ ทุกป้ายจึงต้องมีทั้งไอคอนและตัวอักษร อ่านออกแม้พิมพ์ขาวดำ
 */

/** รหัสโครงการที่ห้องนี้สังกัด — แสดงรหัสไม่ใช่ชื่อเต็ม เพราะต้องอยู่ในบรรทัดเดียวกับอย่างอื่น */
export function ProjectChip({
  project,
  className,
}: {
  project: { code: string; name: string };
  className?: string | undefined;
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center rounded border border-hair px-1.5 font-mono text-caption text-ink-2',
        className,
      )}
      title={project.name}
    >
      {project.code}
    </span>
  );
}

/** ห้องที่มาจาก widget บนเว็บ — ไอคอนคู่ข้อความเสมอ ไม่พึ่งสี */
export function WidgetMark({ className }: { className?: string | undefined }): React.JSX.Element {
  return (
    <span className={cn('inline-flex flex-none items-center gap-1 text-caption text-ink-2', className)}>
      <Globe className="h-3.5 w-3.5" aria-hidden="true" />
      ຈາກເວັບ
    </span>
  );
}

/** ห้องนี้มาจาก widget หรือไม่ — API รุ่นเก่าไม่ส่ง origin มา ให้ถือว่าเป็นแชทในระบบ */
export function isWidgetChat(chat: Pick<SupportChatSummary, 'origin'>): boolean {
  return chat.origin === 'widget';
}

/**
 * ห้องนี้มีบัญชีผู้ใช้จริงอยู่เบื้องหลังหรือไม่
 *
 * ผู้เข้าชมที่ยืนยันตัวตนแล้วอาจถูกจับคู่กับพนักงานในระบบได้ — กรณีนั้น backend
 * ส่ง requester ตัวจริง (id > 0 มีแผนกมีตำแหน่ง) มาพร้อม contact เจ้าหน้าที่จึงควร
 * เห็นแผงผู้แจ้งแบบปกติ ไม่ใช่กล่องข้อมูลติดต่อของคนแปลกหน้า
 *
 * id: 0 คือค่าสมมติที่ backend ใช้แทน "ไม่มีบัญชี" — ห้ามแสดงหรือทำลิงก์จากมัน
 */
export function hasRealAccount(chat: Pick<SupportChatSummary, 'requester'>): boolean {
  return chat.requester.id > 0;
}

/**
 * ป้ายบอกว่าตัวตนของผู้เข้าชมถูกรับรองมาหรือไม่
 *
 * ⚠️ นี่ไม่ใช่ป้ายตกแต่ง
 *    "ยังไม่ยืนยัน" แปลว่าทุกอย่างในกล่องข้อมูลติดต่อเป็นสิ่งที่คนพิมพ์เข้ามาเอง
 *    รวมทั้งอีเมล เจ้าหน้าที่ที่เห็นอีเมลของผู้บริหารแล้วรีเซ็ตรหัสผ่านให้ทันที
 *    คือช่องทางโจมตีที่ง่ายที่สุดของระบบทั้งระบบ
 */
export function VerifiedMark({
  verified,
  full = false,
  className,
}: {
  verified: boolean;
  /** true = ข้อความเต็มสำหรับหัวห้องแชท · false = แบบสั้นสำหรับรายการที่แคบ */
  full?: boolean | undefined;
  className?: string | undefined;
}): React.JSX.Element {
  const longText = verified
    ? 'ຢືນຢັນຕົວຕົນແລ້ວ'
    : 'ຍັງບໍ່ຢືນຢັນ — ຂໍ້ມູນທີ່ຜູ້ເຂົ້າຊົມພິມເອງ';
  const shortText = verified ? 'ຢືນຢັນຕົວຕົນແລ້ວ' : 'ຍັງບໍ່ຢືນຢັນ';
  const Icon = verified ? ShieldCheck : ShieldAlert;

  return (
    <span
      className={cn('inline-flex flex-none items-center gap-1 text-caption text-ink-2', className)}
      title={longText}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span aria-hidden="true">{full ? longText : shortText}</span>
      {/* โปรแกรมอ่านหน้าจอได้ประโยคเต็มเสมอ แม้หน้าจอจะแสดงแบบสั้น */}
      <span className="sr-only">{longText}</span>
    </span>
  );
}

/** ห้องนี้ควรแสดงป้ายยืนยันตัวตนไหม และค่าที่จะแสดงคืออะไร */
export function verifiedState(contact: ChatVisitorContact | null | undefined): boolean | null {
  if (!contact) return null;
  return contact.verified === true;
}

/**
 * ข้อมูลติดต่อของผู้เข้าชมเว็บ
 *
 * แทนที่ตำแหน่ง "ພະແນກ · ຕຳແໜ່ງ" ของผู้แจ้งที่เป็นพนักงาน เพราะห้องแบบ widget
 * ไม่มีบัญชีผู้ใช้อยู่เบื้องหลัง — ไม่มีแผนก ไม่มีตำแหน่ง และต้องไม่มีลิงก์ไปหน้าโปรไฟล์
 *
 * ผู้เข้าชมกรอกอะไรมาก็ได้ หรือไม่กรอกอะไรเลยก็ได้ ช่องที่ไม่มีค่าจึงถูกตัดทิ้ง
 * ไม่ใช่แสดงเป็น "-" ซึ่งทำให้ดูเหมือนระบบเก็บข้อมูลไม่ครบ
 */
export function VisitorContact({
  contact,
  className,
}: {
  contact: ChatVisitorContact | null | undefined;
  className?: string | undefined;
}): React.JSX.Element | null {
  if (!contact) return null;

  const rows: { icon: typeof User; label: string; value: string; href?: string }[] = [];
  if (contact.name) rows.push({ icon: User, label: 'ຊື່ທີ່ແຈ້ງໄວ້', value: contact.name });
  if (contact.email) {
    rows.push({
      icon: Mail,
      label: 'ອີເມວ',
      value: contact.email,
      href: `mailto:${contact.email}`,
    });
  }
  if (contact.phone) {
    rows.push({
      icon: Phone,
      label: 'ໂທລະສັບ',
      value: contact.phone,
      href: `tel:${contact.phone.replace(/\s+/g, '')}`,
    });
  }

  if (rows.length === 0) {
    return (
      <p className={cn('text-caption text-ink-3', className)}>
        ຜູ້ເຂົ້າຊົມບໍ່ໄດ້ຝາກຂໍ້ມູນຕິດຕໍ່ໄວ້ — ຖ້າຕ້ອງການຕິດຕາມຕໍ່ ໃຫ້ຖາມໃນແຊັດ
      </p>
    );
  }

  return (
    <dl className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <div key={row.label} className="flex min-w-0 items-center gap-1">
            <dt className="flex-none">
              <Icon className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
              <span className="sr-only">{row.label}</span>
            </dt>
            <dd className="min-w-0 truncate text-caption text-ink-2">
              {row.href ? (
                <a className="hover:text-primary hover:underline" href={row.href}>
                  {row.value}
                </a>
              ) : (
                row.value
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
