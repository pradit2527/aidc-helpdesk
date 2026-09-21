import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  chatwootCreateWebsiteInbox,
  chatwootWebsiteInboxes,
  CHATWOOT_WEB_WIDGET,
  CHATWOOT_WEB_WIDGET_CREATE_TYPE,
  type ChatwootConnection,
} from './chatwoot-api';

/*
 * ⚠️ ทุกเทสต์ในไฟล์นี้ยิงใส่ fetch ปลอม
 *    chatwootCreateWebsiteInbox เป็นการ **เขียน** ลง Chatwoot ที่ทีมใช้งานอยู่จริง
 *    inbox ที่สร้างจะโผล่ในแอปของเจ้าหน้าที่ทันทีและลบจากโค้ดไม่ได้
 *    ห้ามให้เทสต์ไฟล์นี้แตะเซิร์ฟเวอร์จริงเด็ดขาด ไม่ว่ากรณีใด
 */

const connection: ChatwootConnection = {
  baseUrl: 'http://chatwoot.test',
  accountId: 1,
  token: 'secret-token',
};

/** แทน fetch ทั้งตัว แล้วคืนคำขอที่ถูกยิงออกไปให้ตรวจ */
function stubFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (url: unknown, init: unknown) => {
      calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
      } as Response;
    });
  return { calls, spy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('chatwootCreateWebsiteInbox', () => {
  it('ยิง POST /inboxes ด้วยชื่อฟิลด์ที่ Chatwoot รับจริง', async () => {
    const { calls } = stubFetch(200, { id: 9, website_token: 'tok_9' });

    await chatwootCreateWebsiteInbox(connection, {
      name: 'ILP',
      websiteUrl: 'https://ilp.aidclaos.com',
      locale: 'lo',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://chatwoot.test/api/v1/accounts/1/inboxes');
    expect(calls[0]!.init.method).toBe('POST');

    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
    expect(body.name).toBe('ILP');
    expect(body.channel).toMatchObject({
      // ⚠️ ตอนสร้างส่ง web_widget · ตอนอ่านกลับได้ Channel::WebWidget — คนละค่า
      type: CHATWOOT_WEB_WIDGET_CREATE_TYPE,
      website_url: 'https://ilp.aidclaos.com',
      welcome_title: 'ILP',
    });
    expect(CHATWOOT_WEB_WIDGET_CREATE_TYPE).not.toBe(CHATWOOT_WEB_WIDGET);
  });

  it('ส่ง token ใน header ที่สะกดด้วยขีดกลาง ไม่ใช่ขีดล่าง', async () => {
    const { calls } = stubFetch(200, { id: 9 });
    await chatwootCreateWebsiteInbox(connection, { name: 'X', websiteUrl: 'https://x.test' });

    const headers = calls[0]!.init.headers as Record<string, string>;
    // nginx หน้า Chatwoot ทิ้ง header ที่มีขีดล่างเงียบ ๆ แล้วได้ 401 ทั้งที่ token ถูก
    expect(headers['api-access-token']).toBe('secret-token');
    expect(headers).not.toHaveProperty('api_access_token');
  });

  it('คืนเฉพาะ id กับ website_token — ทิ้งที่เหลือทั้งหมด รวม hmac_token', async () => {
    stubFetch(200, {
      id: 9,
      name: 'ILP',
      website_token: 'tok_9',
      // ความลับ: ใครถือไปคำนวณ identifier_hash ของคนอื่นได้ แล้วอ่านแชทย้อนหลังของเขา
      hmac_token: 'MUST_NOT_LEAK',
      channel_type: CHATWOOT_WEB_WIDGET,
      messaging_service_sid: 'x',
    });

    const created = await chatwootCreateWebsiteInbox(connection, {
      name: 'ILP',
      websiteUrl: 'https://ilp.aidclaos.com',
    });

    expect(created).toEqual({ id: 9, websiteToken: 'tok_9' });
    expect(JSON.stringify(created)).not.toContain('MUST_NOT_LEAK');
  });

  it('อ่านคำตอบที่ห่อด้วย payload ได้ด้วย', async () => {
    stubFetch(200, { payload: { id: 11, website_token: 'tok_11' } });
    await expect(
      chatwootCreateWebsiteInbox(connection, { name: 'X', websiteUrl: 'https://x.test' }),
    ).resolves.toEqual({ id: 11, websiteToken: 'tok_11' });
  });

  it('เลือกถ้อยคำต้อนรับตามภาษาของโครงการ', async () => {
    const { calls } = stubFetch(200, { id: 9 });
    await chatwootCreateWebsiteInbox(connection, {
      name: 'X',
      websiteUrl: 'https://x.test',
      locale: 'en',
    });

    const channel = (JSON.parse(String(calls[0]!.init.body)) as { channel: Record<string, string> })
      .channel;
    expect(channel.welcome_tagline).toBe('Chat with the AIDC IT team');
  });

  it('ภาษาที่ไม่รู้จักตกมาที่ภาษาลาว ไม่ใช่ undefined', async () => {
    const { calls } = stubFetch(200, { id: 9 });
    await chatwootCreateWebsiteInbox(connection, {
      name: 'X',
      websiteUrl: 'https://x.test',
      locale: 'zz',
    });

    const channel = (JSON.parse(String(calls[0]!.init.body)) as { channel: Record<string, string> })
      .channel;
    expect(channel.welcome_tagline).toBe('ຕິດຕໍ່ທີມໄອທີ AIDC ໄດ້ທີ່ນີ້');
  });

  it('คำตอบที่ไม่มีเลข inbox ถือว่าล้มเหลว — ไม่บันทึกเลขที่ไม่มีอยู่จริง', async () => {
    stubFetch(200, { website_token: 'tok_only' });
    await expect(
      chatwootCreateWebsiteInbox(connection, { name: 'X', websiteUrl: 'https://x.test' }),
    ).rejects.toThrow();
  });

  it('Chatwoot ปฏิเสธ — โยน error ที่ไม่มี token ปนอยู่ในข้อความ', async () => {
    stubFetch(422, { errors: ['Website url is invalid'] });
    await expect(
      chatwootCreateWebsiteInbox(connection, { name: 'X', websiteUrl: 'ftp://x' }),
    ).rejects.toThrow(/422/);

    await expect(
      chatwootCreateWebsiteInbox(connection, { name: 'X', websiteUrl: 'ftp://x' }),
    ).rejects.not.toThrow(/secret-token/);
  });
});

describe('chatwootWebsiteInboxes', () => {
  it('คัดเฉพาะ widget ของเว็บ และคัดฟิลด์ทีละตัว — hmac_token ไม่หลุดออกมา', async () => {
    stubFetch(200, {
      payload: [
        { id: 1, name: 'Widget', channel_type: CHATWOOT_WEB_WIDGET, website_token: 't', hmac_token: 'LEAK' },
        { id: 2, name: 'API', channel_type: 'Channel::Api', hmac_token: 'LEAK' },
      ],
    });

    const inboxes = await chatwootWebsiteInboxes(connection);

    expect(inboxes).toHaveLength(1);
    expect(inboxes[0]!.id).toBe(1);
    expect(JSON.stringify(inboxes)).not.toContain('LEAK');
  });
});
