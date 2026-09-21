/**
 * กฎล้วน ๆ ของการยกระดับแชทเป็นเรื่องแจ้ง — ไม่มี I/O ไม่มี Nest ไม่มีฐานข้อมูล
 *
 * แยกออกมาจาก SupportChatService ด้วยเหตุผลเดียวกับ chatwoot-widget.ts:
 * สองเรื่องในไฟล์นี้ผิดแล้วเห็นยากมาก
 *
 *   1. บทสนทนาที่ถอดเป็นรายละเอียดของเรื่อง — ถ้าติดป้ายผู้พูดผิด
 *      เจ้าหน้าที่ที่มาอ่านทีหลังจะเข้าใจสลับกันว่าใครพูดอะไร
 *   2. ค่าตั้งต้นของหมวดหมู่ ผลกระทบ และความเร่งด่วน — ถ้า "ผู้เรียกไม่ได้ส่งมา"
 *      กับ "ผู้เรียกส่ง null มา" ถูกมองเป็นอย่างเดียวกัน ค่าที่ผู้ใช้เลือกเอง
 *      จะถูกค่าตั้งต้นของโครงการทับเงียบ ๆ
 */

import type { Impact, Urgency } from '../../common/constants';
import { DEFAULT_TZ } from '../../common/sla/business-time';

/** ความยาวสูงสุดของรายละเอียดที่ถอดจากบทสนทนา — ตรงกับเพดานข้อความแชท (4000) */
export const TRANSCRIPT_MAX_LENGTH = 4000;

/** ค่าตั้งต้นเมื่อผู้เรียกไม่ได้ระบุ — ตรงกับค่า default ของคอลัมน์ในตาราง ticket */
export const DEFAULT_IMPACT: Impact = 'individual';
export const DEFAULT_URGENCY: Urgency = 'medium';

/** ข้อความท้ายรายละเอียด เมื่อบทสนทนายาวเกินกว่าจะใส่ครบ */
const TRUNCATED_NOTE = '… (ບົດສົນທະນາຍັງມີຕໍ່ — ເປີດອ່ານທັງໝົດໄດ້ທີ່ຫ້ອງແຊັດທີ່ຜູກກັບເລື່ອງນີ້)';
/** ข้อความท้ายรายละเอียดเสมอ — บอกว่าของจริงอยู่ที่ห้องแชท ไม่ใช่ที่นี่ */
const SOURCE_NOTE = 'ຂໍ້ຄວາມໃໝ່ຫຼັງຈາກນີ້ ອ່ານໄດ້ທີ່ຫ້ອງແຊັດທີ່ຜູກກັບເລື່ອງນີ້';
/** รายละเอียดเมื่อห้องยังไม่มีข้อความที่ถอดได้เลย (มีแต่ข้อความระบบหรือไฟล์ล้วน) */
const EMPTY_TRANSCRIPT = 'ຍົກລະດັບຈາກຫ້ອງແຊັດ — ຍັງບໍ່ມີຂໍ້ຄວາມທີ່ຖອດເປັນຂໍ້ຄວາມໄດ້';

/**
 * ใครเป็นคนพูดในบรรทัดนี้
 *
 * ⚠️ ต้องตรงกับกติกาของ toMessageDto ทุกข้อ — ที่นั่นตัดสิน "ฟองซ้ายหรือขวา"
 *    ในหน้าจอ ที่นี่ตัดสินป้ายชื่อในรายละเอียดของเรื่อง ถ้าสองที่ไม่ตรงกัน
 *    เอกสารที่ผู้ตรวจอ่านจะขัดกับหน้าจอที่เจ้าหน้าที่เห็น
 */
export type TranscriptRole = 'staff' | 'contact' | 'requester';

export interface TranscriptMessage {
  senderId: number | null;
  senderName: string | null;
  /** คนตอบจากฝั่ง Chatwoot ที่ไม่มีบัญชีใน Helpdesk */
  externalSenderName: string | null;
  body: string;
  isSystem: boolean;
  /** ผู้เข้าชมเว็บเป็นคนพิมพ์ */
  fromContact: boolean;
  /** ชนิดไฟล์แนบ — ข้อความที่มีแต่ไฟล์ยังต้องมีบรรทัดของตัวเอง */
  attachmentKind: 'image' | 'audio' | 'file' | null;
  createdAt: Date;
}

export function transcriptRole(
  message: Pick<TranscriptMessage, 'senderId' | 'fromContact'>,
  requesterId: number | null,
): TranscriptRole {
  if (message.fromContact) return 'contact';
  if (message.senderId !== null && message.senderId === requesterId) return 'requester';
  return 'staff';
}

/** ป้ายที่ขึ้นหน้าแต่ละบรรทัด — ภาษาลาว เพราะรายละเอียดของเรื่องคือสิ่งที่ผู้ใช้อ่าน */
const ROLE_LABEL: Record<TranscriptRole, string> = {
  staff: 'ທີມໄອທີ',
  contact: 'ຜູ້ເຂົ້າຊົມ',
  requester: 'ຜູ້ແຈ້ງ',
};

/** ป้ายแทนข้อความ เมื่อบรรทัดนั้นเป็นไฟล์อย่างเดียว — ชุดเดียวกับ ATTACHMENT_LABEL ของกล่องแชท */
const ATTACHMENT_LABEL: Record<NonNullable<TranscriptMessage['attachmentKind']>, string> = {
  image: '[ຮູບພາບ]',
  audio: '[ຂໍ້ຄວາມສຽງ]',
  file: '[ໄຟລ໌ແນບ]',
};

/**
 * เวลาในบทสนทนาที่ถอดออกมา — เวลาเวียงจันทน์เสมอ
 *
 * ไม่ใช้ ISO/UTC เพราะรายละเอียดของเรื่องคือเอกสารที่คนอ่าน ไม่ใช่ข้อมูลที่เครื่องอ่าน
 * เรื่องที่แจ้งตอนเช้าต้องอ่านว่าเป็นเวลาเช้า ไม่ใช่เวลาเมื่อคืนตาม UTC
 */
export function formatTranscriptTime(at: Date, timeZone: string = DEFAULT_TZ): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

/**
 * ถอดบทสนทนาเป็นรายละเอียดของเรื่อง
 *
 * ข้อความระบบถูกตัดออกทั้งหมด — "ทีมไอทีปิดแชทแล้ว" ไม่ใช่สิ่งที่ผู้แจ้งเล่า
 * และมันจะไปโผล่เป็นเนื้อหาของปัญหาในเอกสารที่ผู้ตรวจอ่าน
 *
 * ตัดที่ขอบบรรทัดเสมอ ไม่ตัดกลางประโยค — บรรทัดที่ถูกตัดครึ่งอ่านแล้วเข้าใจผิดได้
 * และบอกไว้ท้ายข้อความว่าของจริงอยู่ที่ห้องแชท ไม่ได้หายไปไหน
 */
export function renderTranscript(
  messages: readonly TranscriptMessage[],
  options: {
    requesterId: number | null;
    /** ชื่อที่ใช้เรียกผู้เข้าชมที่ไม่ได้บอกชื่อ */
    contactName?: string | null;
    maxLength?: number;
    timeZone?: string;
  },
): string {
  const maxLength = options.maxLength ?? TRANSCRIPT_MAX_LENGTH;

  const lines: string[] = [];
  for (const message of messages) {
    if (message.isSystem) continue;

    const body = message.body.trim();
    const attachment = message.attachmentKind ? ATTACHMENT_LABEL[message.attachmentKind] : '';
    const text = [body, attachment].filter(Boolean).join(' ');
    if (!text) continue;

    const role = transcriptRole(message, options.requesterId);
    const who = speakerName(message, role, options.contactName ?? null);
    const label = who ? `${ROLE_LABEL[role]} (${who})` : ROLE_LABEL[role];
    lines.push(`[${formatTranscriptTime(message.createdAt, options.timeZone)}] ${label}: ${text}`);
  }

  if (lines.length === 0) return EMPTY_TRANSCRIPT;

  const full = `${lines.join('\n')}\n\n${SOURCE_NOTE}`;
  if (full.length <= maxLength) return full;

  /*
   * เก็บบรรทัด "เท่าที่ใส่ได้" จากบนลงล่าง แล้วต่อท้ายด้วยหมายเหตุว่ายังมีต่อ
   *
   * เก็บจากบนลงล่างโดยตั้งใจ — ต้นเรื่องคือสิ่งที่บอกว่าปัญหาคืออะไร
   * ส่วนท้ายบทสนทนามักเป็นการนัดหมายและคำขอบคุณ ซึ่งอ่านย้อนที่ห้องแชทได้
   */
  const budget = maxLength - TRUNCATED_NOTE.length - 2;
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = used === 0 ? line.length : line.length + 1;
    if (used + cost > budget) break;
    kept.push(line);
    used += cost;
  }

  // บรรทัดแรกยาวเกินงบทั้งก้อน — ตัดตัวอักษรเท่าที่เหลือ ดีกว่าคืนแต่หมายเหตุลอย ๆ
  if (kept.length === 0) kept.push(lines[0]!.slice(0, Math.max(0, budget)));
  return `${kept.join('\n')}\n\n${TRUNCATED_NOTE}`;
}

function speakerName(
  message: TranscriptMessage,
  role: TranscriptRole,
  contactName: string | null,
): string | null {
  if (role === 'contact') return message.externalSenderName ?? contactName;
  return message.senderName ?? message.externalSenderName;
}

/**
 * ค่าตั้งต้นของเรื่องที่สร้างจากแชท
 *
 * ⚠️ `undefined` (ไม่ได้ส่งมา) กับ `null` ต้องถูกมองเป็นอย่างเดียวกันที่นี่
 *    แต่ **ค่าที่ส่งมาจริงต้องชนะเสมอ** — หมวดหมู่ตั้งต้นของโครงการมีไว้สำหรับ
 *    เจ้าหน้าที่ที่กดยกระดับเร็ว ๆ ไม่ใช่ไว้ทับสิ่งที่เขาเลือกเองมากับคำขอ
 *
 * @returns categoryId เป็น null เมื่อทั้งผู้เรียกและโครงการไม่ได้บอกหมวดหมู่ไว้เลย
 *          ผู้เรียกต้องตอบ 422 ให้ผู้ใช้เลือกเอง ไม่ใช่เดาหมวดหมู่ให้
 */
export function resolveTicketDefaults(input: {
  categoryId?: number | null | undefined;
  projectDefaultCategoryId?: number | null | undefined;
  impact?: Impact | null | undefined;
  urgency?: Urgency | null | undefined;
}): { categoryId: number | null; impact: Impact; urgency: Urgency } {
  return {
    categoryId: input.categoryId ?? input.projectDefaultCategoryId ?? null,
    impact: input.impact ?? DEFAULT_IMPACT,
    urgency: input.urgency ?? DEFAULT_URGENCY,
  };
}

/**
 * หัวข้อเรื่องที่ตัดให้พอดีกับกฎของโดเมน (TicketEntity ยอมรับ 5–200 ตัวอักษร)
 *
 * ตัดที่ 200 ไม่ใช่ 255 ของคอลัมน์ — คอลัมน์กว้างกว่ากฎ ถ้าตัดตามคอลัมน์
 * entity จะปฏิเสธด้วยข้อความ "ຫົວຂໍ້ຕ້ອງບໍ່ເກີນ 200" ซึ่งผู้ใช้แก้ไม่ได้
 * เพราะหัวข้อนั้นเป็นข้อความที่เขาคัดลอกมาจากแชท ไม่ใช่สิ่งที่เขาพิมพ์เอง
 */
export const SUBJECT_MAX_LENGTH = 200;

export function clampSubject(subject: string, max = SUBJECT_MAX_LENGTH): string {
  const text = subject.trim();
  return text.length <= max ? text : text.slice(0, max);
}
