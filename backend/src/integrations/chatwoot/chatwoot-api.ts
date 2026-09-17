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

/** ชนิดช่องทางของ inbox ที่เป็น widget บนหน้าเว็บ */
export const CHATWOOT_WEB_WIDGET = 'Channel::WebWidget';

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
