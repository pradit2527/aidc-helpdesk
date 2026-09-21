/**
 * กฎล้วน ๆ ของการนำเข้าแชทจาก widget — ไม่มี I/O ไม่มี Nest ไม่มีฐานข้อมูล
 *
 * แยกออกมาจาก ChatwootSyncService เพื่อให้ทดสอบได้โดยไม่ต้องมี Chatwoot จริง
 * และไม่ต้องบูต Nest — กฎพวกนี้คือจุดที่ผิดแล้วคนนอกเห็นข้อความที่ไม่ควรเห็น
 * หรือข้อความของผู้เข้าชมกลับด้านเป็นคำตอบของทีมไอที
 *
 * ทุกข้อในไฟล์นี้วัดจาก Chatwoot 4.17.1 ของจริง ไม่ได้อ่านจากเอกสาร
 */

/** ชื่อที่ใช้แทนผู้เข้าชมที่ไม่ได้บอกชื่อ */
export const WIDGET_VISITOR_NAME = 'ຜູ້ເຂົ້າຊົມເວັບ';

/** บทสนทนาใน Chatwoot เท่าที่ระบบเราใช้ */
export interface ChatwootConversation {
  id: number;
  inbox_id?: number | null;
  status?: string | null;
  /** unix timestamp (วินาที) */
  last_activity_at?: number | null;
  meta?: {
    sender?: {
      id?: number | null;
      name?: string | null;
      email?: string | null;
      phone_number?: string | null;
      identifier?: string | null;
    } | null;
    /**
     * ⚠️ นี่คือธงที่บอกว่า Chatwoot ยืนยันตัวตนผู้เข้าชมด้วย HMAC แล้ว
     *    วัดจริงกับ 4.17.1: อยู่ที่ `meta.hmac_verified` ของบทสนทนา
     *    (ไม่ได้อยู่ที่ contact_inbox — ฟิลด์นั้นไม่มีในผลของ GET /conversations)
     */
    hmac_verified?: boolean | null;
  } | null;
}

/** ข้อความใน Chatwoot เท่าที่ระบบเราใช้ */
export interface ChatwootWidgetMessage {
  id: number;
  content?: string | null;
  /** ตอนอ่านกลับมาเป็นตัวเลข (0 incoming · 1 outgoing · 2 activity · 3 template) */
  message_type?: number | string | null;
  content_type?: string | null;
  private?: boolean | null;
  sender?: { name?: string | null } | null;
  attachments?: { data_url?: string | null }[] | null;
}

export type MessageClass = 'incoming' | 'outgoing' | 'private' | 'activity' | 'template' | 'other';

const INCOMING = new Set<number | string>([0, 'incoming']);
const OUTGOING_TYPES = new Set<number | string>([1, 'outgoing']);
const ACTIVITY = new Set<number | string>([2, 'activity']);
const TEMPLATE = new Set<number | string>([3, 'template']);

/**
 * ข้อความนี้เป็นชนิดไหน
 *
 * ⚠️ `private` มาก่อนทุกอย่าง — โน้ตภายในของเจ้าหน้าที่ถูกส่งเป็น outgoing
 *    ถ้าเรียงผิดลำดับ โน้ตที่เจ้าหน้าที่เขียนคุยกันเองจะถูกนำเข้าเป็นคำตอบ
 *    ที่ผู้เข้าชมอ่านได้ในหน้าจอของเรา
 */
export function classifyMessage(message: ChatwootWidgetMessage): MessageClass {
  if (message.private === true) return 'private';
  const type = message.message_type ?? '';
  if (ACTIVITY.has(type)) return 'activity';
  if (TEMPLATE.has(type)) return 'template';
  if (INCOMING.has(type)) return 'incoming';
  if (OUTGOING_TYPES.has(type)) return 'outgoing';
  return 'other';
}

/**
 * ข้อความนี้ควรถูกนำเข้าห้องแชทหรือไม่
 *
 * เอาเฉพาะบทสนทนาจริงระหว่างคน — ข้ามโน้ตภายใน ข้อความกิจกรรมของระบบ
 * (“Conversation was marked resolved by …”) ข้อความต้นแบบของบอท และ
 * `content_type` ที่ไม่ใช่ข้อความ เช่น `input_csat` (แบบให้คะแนน) หรือฟอร์ม
 */
export function isImportable(message: ChatwootWidgetMessage): boolean {
  const kind = classifyMessage(message);
  if (kind !== 'incoming' && kind !== 'outgoing') return false;
  const contentType = message.content_type ?? 'text';
  return contentType === 'text';
}

/** ตัวตนของผู้เข้าชมจาก payload ของบทสนทนา — ค่าว่างและช่องว่างล้วนถือเป็นไม่มี */
export function toWidgetContact(conversation: ChatwootConversation): {
  name: string | null;
  email: string | null;
  phone: string | null;
  identifier: string | null;
  verified: boolean;
  contactId: number | null;
} {
  const sender = conversation.meta?.sender ?? null;
  const contactId = Number(sender?.id);
  return {
    name: clean(sender?.name, 150),
    email: clean(sender?.email, 255),
    phone: clean(sender?.phone_number, 40),
    identifier: clean(sender?.identifier, 255),
    // ต้องเป็น true จริง ๆ เท่านั้น — undefined หรือค่าอื่นแปลว่า "ยังไม่ยืนยัน"
    verified: conversation.meta?.hmac_verified === true,
    contactId: Number.isInteger(contactId) && contactId > 0 ? contactId : null,
  };
}

/** ชื่อที่แสดงแทนผู้เข้าชมคนนี้ */
export function visitorName(contactName: string | null): string {
  return contactName ?? WIDGET_VISITOR_NAME;
}

/**
 * ผูกบทสนทนานี้กับบัญชีใน Helpdesk ได้ไหม
 *
 * ⚠️ `verified` คือเส้นแบ่งเดียวที่มี
 *    ฟอร์มก่อนแชทของ Chatwoot ให้ผู้เข้าชมพิมพ์อีเมลอะไรก็ได้ ถ้าจับคู่อีเมลนั้น
 *    กับบัญชีในระบบ ใครก็พิมพ์อีเมลของหัวหน้าตัวเองแล้วกลายเป็นเจ้าของห้องแชทของเขา
 *    เห็นบทสนทนาย้อนหลังทั้งหมดที่เขาเคยคุยกับทีมไอที
 *    อีเมลจึงเชื่อได้ก็ต่อเมื่อระบบต้นทางเซ็นรับรองมาแล้วด้วย HMAC เท่านั้น
 *
 * @param match ผลค้นบัญชีจากอีเมล — ผู้เรียกต้องค้นเมื่อ verified เป็นจริงเท่านั้น
 */
export function requesterLinkDecision(input: {
  verified: boolean;
  email: string | null;
  match: { id: number; hasOpenChat: boolean } | null;
}): { link: number | null; reason: 'linked' | 'not_verified' | 'no_email' | 'no_match' | 'requester_busy' } {
  if (!input.verified) return { link: null, reason: 'not_verified' };
  if (!input.email) return { link: null, reason: 'no_email' };
  if (!input.match) return { link: null, reason: 'no_match' };
  /*
   * เขามีห้องที่เปิดอยู่แล้ว — ปล่อยห้องนี้ไว้แบบไม่ผูก ไม่ใช่เอาสองห้องมารวมกัน
   * ดัชนี uq_support_chat_open_requester ยอมให้มีห้องที่เปิดได้คนละหนึ่งห้องเท่านั้น
   * และการรวมห้องจะทำให้บทสนทนาสองเรื่องที่ไม่เกี่ยวกันปนกันอยู่ในหน้าจอเดียว
   */
  if (input.match.hasOpenChat) return { link: null, reason: 'requester_busy' };
  return { link: input.match.id, reason: 'linked' };
}

/**
 * ผู้เข้าชมพิมพ์มาใหม่ในห้องที่เราถือว่าปิดไปแล้ว → เปิดห้องเดิมกลับมา
 *
 * ไม่สร้างห้องใหม่ เพราะหนึ่งบทสนทนาใน Chatwoot ผูกกับห้องเดียวเสมอ
 * และประวัติที่คุยกันไว้ต้องอยู่ต่อเนื่อง ไม่ใช่ถูกตัดทุกครั้งที่กลับมาคุย
 */
export function shouldReopen(chatStatus: string, incoming: readonly ChatwootWidgetMessage[]): boolean {
  if (chatStatus !== 'closed') return false;
  return incoming.some((message) => classifyMessage(message) === 'incoming');
}

/** Chatwoot ปิดบทสนทนาไปแล้ว แต่ห้องฝั่งเรายังเปิดอยู่ → ปิดตาม */
export function shouldCloseFromChatwoot(
  conversationStatus: string | null | undefined,
  chatStatus: string,
): boolean {
  return conversationStatus === 'resolved' && chatStatus === 'open';
}

/**
 * ข้อความระบบที่ค้างส่งเกินเท่านี้ ไม่ส่งออกไปหาผู้เข้าชมอีก
 *
 * ข้อความอย่าง "ທີມງານຮັບເລື່ອງແລ້ວ" เป็นข่าวสารตามเวลา — ส่งช้าไปครึ่งวัน
 * แล้วมันจะไปโผล่ผิดลำดับกับสิ่งที่เกิดขึ้นจริง ซึ่งสับสนกว่าการไม่ส่งเลย
 * (ห้องที่ปิดอยู่ตอนข้อความถูกสร้างจะยังค้างอยู่จนกว่าจะเปิดกลับ ถ้าไม่มีเพดานนี้
 * ผู้เข้าชมที่กลับมาถามใหม่อีกเดือนหนึ่งจะได้ข่าวเก่าทั้งชุดรัวใส่หน้า)
 */
export const SYSTEM_NOTICE_MAX_AGE_MINUTES = 60;

/** ข้อความหนึ่งข้อความเท่าที่ต้องรู้เพื่อตัดสินว่าส่งออกไปหาผู้เข้าชมได้ไหม */
export interface OutboundCandidate {
  senderId: number | null;
  isSystem: boolean;
  fromContact: boolean;
  externalSenderName: string | null;
  chatwootMessageId: number | null;
  createdAt: Date;
}

/**
 * ข้อความนี้ส่งออกไปหาผู้เข้าชมได้ไหม (ห้องจาก widget เท่านั้น)
 *
 * เดิมเส้นทางนี้ตัดสินด้วยบรรทัดเดียวว่า "sender_id เป็น null = ส่งไม่ได้"
 * ซึ่งถูกสำหรับข้อความที่ดึงมาจาก Chatwoot แต่พลอยตัดข้อความของระบบที่เรา
 * สร้างเองออกไปด้วย — และนั่นคือข้อความที่บอกผู้ถามว่าเรื่องของเขาไปถึงไหนแล้ว
 *
 * ⚠️ ข้อความระบบส่งได้เฉพาะตอนห้อง **ยังเปิดอยู่**
 *    ข้อความระบบสองชนิดที่มีอยู่เดิมเขียนตอนห้องเพิ่งถูกปิดพอดี
 *    ("ທີມໄອທີປິດແຊັດນີ້ແລ້ວ" และ "ບົດສົນທະນານີ້ຖືກປິດຈາກ Chatwoot ແລ້ວ")
 *    ตัวหลังมาจากการที่ Chatwoot ปิดบทสนทนาเอง การส่งกลับไปคือการพูดซ้ำสิ่งที่
 *    Chatwoot เพิ่งทำ เงื่อนไข "ห้องต้องเปิด" จึงกันทั้งคู่ไว้พร้อมกัน
 *    และรักษาพฤติกรรมเดิมของการปิดห้องไว้ครบทุกข้อ
 */
export function isPushableToVisitor(
  chat: { status: string },
  message: OutboundCandidate,
  now: Date,
  maxSystemAgeMinutes: number = SYSTEM_NOTICE_MAX_AGE_MINUTES,
): boolean {
  // ส่งไปแล้ว หรือเป็นข้อความที่ดึงมาจาก Chatwoot — ส่งกลับ = พูดซ้ำให้เขาฟัง
  if (message.chatwootMessageId !== null) return false;
  if (message.externalSenderName !== null) return false;
  if (message.fromContact) return false;

  // เส้นทางเดิมไม่เปลี่ยน: ข้อความที่คนใน Helpdesk พิมพ์เองส่งได้เสมอ
  if (!message.isSystem) return message.senderId !== null;

  if (chat.status !== 'open') return false;
  return now.getTime() - message.createdAt.getTime() <= maxSystemAgeMinutes * 60_000;
}

/**
 * ขอบเขตของรอบค้นหา — เอาเฉพาะบทสนทนาที่ขยับภายใน N วันที่ผ่านมา
 *
 * ถ้าไม่จำกัด ทุกรอบจะไล่บทสนทนาที่ตายไปแล้วเป็นร้อยรายการ ยิง Chatwoot ซ้ำ ๆ
 * โดยไม่มีอะไรเปลี่ยน — เปลืองทั้งสองฝั่งและกลบบทสนทนาที่กำลังคุยกันอยู่จริง
 */
export function isWithinWindow(
  lastActivityAt: number | null | undefined,
  now: Date,
  maxAgeDays: number,
): boolean {
  if (!lastActivityAt || !Number.isFinite(lastActivityAt)) return false;
  const ageMs = now.getTime() - lastActivityAt * 1000;
  return ageMs >= -60_000 && ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
}

/**
 * บริษัทของห้องที่มาจาก widget
 *
 * โครงการส่วนกลาง (company_id เป็น null) ต้องตกมาที่บริษัทเจ้าของระบบ
 * ห้องที่ไม่มีบริษัทคือห้องที่ไม่มีกฎการมองเห็น — ไม่มีอยู่ในระบบนี้
 */
export function widgetCompanyId(
  projectCompanyId: number | null,
  ownerCompanyId: number,
): number {
  return projectCompanyId ?? ownerCompanyId;
}

function clean(value: string | null | undefined, max: number): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text.slice(0, max) : null;
}
