/**
 * ตัวเรียก Application API ของ Chatwoot — ที่เดียวของทั้งระบบ
 *
 * แยกออกมาจาก ChatwootSyncService เพราะตอนนี้มีผู้เรียกสามทาง
 * (ตัวซิงก์แชท · หน้าผูก inbox ของผู้ดูแล · ตัวค้นหาบทสนทนาจาก widget)
 * และเรื่องเดียวที่ทั้งสามทางพลาดไม่ได้เหมือนกันคือชื่อ header
 *
 * ⚠️ ต้องสะกด `api-access-token` ด้วยขีดกลาง
 *    nginx หน้า Chatwoot ทิ้ง header ที่มีขีดล่างเงียบ ๆ (underscores_in_headers off)
 *    แล้ว Chatwoot ตอบ 401 ทั้งที่ token ถูก · Rails อ่านสองแบบเป็นคีย์เดียวกันอยู่แล้ว
 *
 * ⚠️ token อยู่ใน header เท่านั้น ห้ามพิมพ์ลง log และห้ามใส่ใน URL
 */

const DEFAULT_TIMEOUT_MS = 15_000;

/** ค่าที่ต้องใช้ต่อกับ Chatwoot — รับเป็นรูปย่อยของ ChatwootSyncConfig */
export interface ChatwootConnection {
  baseUrl: string;
  accountId: number;
  token: string;
}

export async function chatwootRequest<T = Record<string, unknown>>(
  connection: ChatwootConnection,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const isForm = body instanceof FormData;
  const init: RequestInit = {
    method,
    headers: {
      'api-access-token': connection.token,
      Accept: 'application/json',
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (body !== undefined) init.body = isForm ? (body as FormData) : JSON.stringify(body);

  const url = `${connection.baseUrl}/api/v1/accounts/${connection.accountId}${path}`;
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    // ตัด query string ออกจากข้อความผิดพลาด — path อาจมีคำค้นที่เป็นข้อมูลส่วนบุคคล
    throw new Error(`Chatwoot ${method} ${path.split('?')[0]} → ${res.status} ${text.slice(0, 160)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** inbox หนึ่งใบเท่าที่ระบบเราใช้ — ฟิลด์อื่นของ Chatwoot มีอีกมาก รวมถึง hmac_token ที่ห้ามแตะ */
export interface ChatwootInbox {
  id: number;
  name?: string | null;
  channel_type?: string | null;
  website_url?: string | null;
  website_token?: string | null;
}

/** ชนิดช่องทางของ inbox ที่เป็น widget บนหน้าเว็บ — ค่าที่ Chatwoot **คืนกลับมา** */
export const CHATWOOT_WEB_WIDGET = 'Channel::WebWidget';

/**
 * ชนิดช่องทางที่ต้องส่ง **ตอนสร้าง** inbox
 *
 * ⚠️ ไม่ใช่ค่าเดียวกับที่อ่านกลับมา
 *    ตอนสร้างส่ง `web_widget` · ตอนอ่านได้ `Channel::WebWidget`
 *    (เอกสาร Chatwoot: POST /inboxes → channel.type ต้องเป็น `web_widget`)
 *    ส่งชื่อคลาสของ Rails ไปตรง ๆ จะถูกปฏิเสธ
 */
export const CHATWOOT_WEB_WIDGET_CREATE_TYPE = 'web_widget';

/**
 * รายการ inbox ทั้งหมดของบัญชี — คัดเฉพาะ widget ของเว็บ และคัดฟิลด์ที่ปลอดภัยเท่านั้น
 *
 * ⚠️ ตัว payload ที่ Chatwoot คืนมามี `hmac_token` ของ inbox รวมอยู่ด้วย
 *    ซึ่งเป็นความลับ (ใครถือไปคำนวณ identifier_hash ของคนอื่นได้ แล้วอ่านแชทย้อนหลังของเขา)
 *    ฟังก์ชันนี้จึงคัดฟิลด์ทีละตัวออกมา ไม่ใช่ส่ง payload ดิบต่อไปให้ชั้นบน
 */
export async function chatwootWebsiteInboxes(
  connection: ChatwootConnection,
): Promise<ChatwootInbox[]> {
  const res = await chatwootRequest<{ payload?: ChatwootInbox[] }>(connection, 'GET', '/inboxes');
  return (res.payload ?? [])
    .filter((inbox) => inbox.channel_type === CHATWOOT_WEB_WIDGET)
    .map((inbox) => ({
      id: inbox.id,
      name: inbox.name ?? null,
      channel_type: inbox.channel_type ?? null,
      website_url: inbox.website_url ?? null,
      website_token: inbox.website_token ?? null,
    }));
}

/** คำบรรยายใต้หัวข้อของ widget — ภาษาของโครงการ ไม่ใช่ภาษาของผู้ตั้งค่า */
const WELCOME_TAGLINE: Record<string, string> = {
  lo: 'ຕິດຕໍ່ທີມໄອທີ AIDC ໄດ້ທີ່ນີ້',
  th: 'ติดต่อทีมไอที AIDC ได้ที่นี่',
  en: 'Chat with the AIDC IT team',
};

export interface CreateWebsiteInboxInput {
  name: string;
  /**
   * ⚠️ Chatwoot **บังคับ** ฟิลด์นี้สำหรับช่องทาง web_widget
   *    ไม่ส่งมาแล้วจะได้ 422 กลับมาจากฝั่งนั้น — ผู้เรียกควรตรวจก่อนเสมอ
   *    เพื่อให้ผู้ใช้ได้ข้อความที่อ่านรู้เรื่อง ไม่ใช่ข้อความดิบของ Rails
   */
  websiteUrl?: string | null;
  /** ภาษาของ widget เท่าที่ระบบเราใช้ — ดูหมายเหตุใน chatwootCreateWebsiteInbox */
  locale?: string | null;
}

/** ผลของการสร้าง inbox เท่าที่ระบบเราเก็บต่อ — ฟิลด์อื่นถูกทิ้งทั้งหมด */
export interface CreatedWebsiteInbox {
  id: number;
  websiteToken: string | null;
}

/**
 * สร้าง inbox ชนิด Website (widget) ใน Chatwoot
 *
 * ⚠️ นี่คือ **การเขียนลงระบบที่ใช้งานจริง** — inbox ที่สร้างจะโผล่ในแอปของทีมทันที
 *    และลบทิ้งจากที่นี่ไม่ได้ ผู้เรียกจึงต้องเป็นเส้นทางที่ตรวจสิทธิ์มาแล้วเท่านั้น
 *
 * ⚠️ คัดฟิลด์ทีละตัวออกมา ไม่ส่งคำตอบดิบต่อไปให้ชั้นบน — กติกาเดียวกับ
 *    chatwootWebsiteInboxes เพราะคำตอบของ Chatwoot มี `hmac_token` ของ inbox
 *    ปนอยู่ได้ ซึ่งเป็นความลับ (ใครถือไปคำนวณ identifier_hash ของคนอื่นได้)
 *
 * หมายเหตุเรื่องภาษา: Chatwoot 4.17 **ไม่มีฟิลด์ locale ของ inbox**
 * ภาษาของ widget ตั้งที่สคริปต์ฝัง (`window.chatwootSettings.locale`) ซึ่งระบบเรา
 * จ่ายให้อยู่แล้วทาง `GET /public/support-projects/{code}` · ค่าที่รับเข้ามาที่นี่
 * จึงใช้เลือกถ้อยคำต้อนรับของ widget เท่านั้น ไม่ได้ถูกส่งเป็นฟิลด์ของ inbox
 */
export async function chatwootCreateWebsiteInbox(
  connection: ChatwootConnection,
  input: CreateWebsiteInboxInput,
): Promise<CreatedWebsiteInbox> {
  const body = {
    name: input.name,
    channel: {
      type: CHATWOOT_WEB_WIDGET_CREATE_TYPE,
      ...(input.websiteUrl ? { website_url: input.websiteUrl } : {}),
      welcome_title: input.name,
      welcome_tagline: WELCOME_TAGLINE[input.locale ?? 'lo'] ?? WELCOME_TAGLINE.lo,
    },
  };

  /*
   * คำตอบของ POST /inboxes เป็น object ของ inbox ตรง ๆ (ไม่ห่อด้วย payload)
   * แต่ endpoint อื่นของ Chatwoot ห่อด้วย payload ทั้งนั้น และเรายังไม่ได้ยิงจริง
   * กับเซิร์ฟเวอร์ที่ทีมใช้งานอยู่ (ห้ามเขียนลงระบบนั้น) จึงอ่านเผื่อทั้งสองรูป
   * ถ้าอ่าน id ไม่ได้ ให้ล้มที่นี่ ดีกว่าบันทึกเลข inbox ที่ไม่มีอยู่จริงลงฐานข้อมูล
   */
  const res = await chatwootRequest<{ id?: number; website_token?: string | null; payload?: ChatwootInbox }>(
    connection,
    'POST',
    '/inboxes',
    body,
  );

  const id = Number(res.id ?? res.payload?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Chatwoot ไม่คืนเลข inbox ที่สร้าง');
  }
  return { id, websiteToken: res.website_token ?? res.payload?.website_token ?? null };
}
