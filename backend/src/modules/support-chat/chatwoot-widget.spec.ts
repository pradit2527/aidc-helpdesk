import { describe, expect, it } from 'vitest';

import {
  classifyMessage,
  isImportable,
  isPushableToVisitor,
  isWithinWindow,
  requesterLinkDecision,
  shouldCloseFromChatwoot,
  shouldReopen,
  toWidgetContact,
  visitorName,
  widgetCompanyId,
  WIDGET_VISITOR_NAME,
  type ChatwootConversation,
  type OutboundCandidate,
} from './chatwoot-widget';

/*
 * ตัวอย่างทั้งหมดในไฟล์นี้คัดมาจากผลจริงของ Chatwoot 4.17.1 ที่ 18.142.116.44
 * (อ่านอย่างเดียว) ไม่ได้แต่งขึ้นจากเอกสาร
 */

describe('toWidgetContact', () => {
  it('อ่านชื่อ อีเมล เบอร์ และ identifier จาก meta.sender', () => {
    const conversation: ChatwootConversation = {
      id: 1,
      meta: {
        sender: {
          id: 2,
          name: 'ດີໂມ ຜູ້ໃຊ້ທົ່ວໄປ',
          email: 'demo.enduser@aidctech.com.la',
          phone_number: '+8562057547011',
          identifier: 'demo.enduser',
        },
      },
    };

    expect(toWidgetContact(conversation)).toEqual({
      name: 'ດີໂມ ຜູ້ໃຊ້ທົ່ວໄປ',
      email: 'demo.enduser@aidctech.com.la',
      phone: '+8562057547011',
      identifier: 'demo.enduser',
      verified: false,
      contactId: 2,
    });
  });

  it('ผู้เข้าชมที่ไม่บอกอะไรเลยได้ null ทุกช่อง ไม่ใช่สตริงว่าง', () => {
    const contact = toWidgetContact({
      id: 3,
      meta: { sender: { id: 5, name: '  ', email: null, phone_number: null, identifier: null } },
    });
    expect(contact).toMatchObject({ name: null, email: null, phone: null, identifier: null });
    expect(visitorName(contact.name)).toBe(WIDGET_VISITOR_NAME);
  });

  it('ไม่มี meta เลยก็ต้องไม่ระเบิด', () => {
    expect(toWidgetContact({ id: 9 })).toEqual({
      name: null,
      email: null,
      phone: null,
      identifier: null,
      verified: false,
      contactId: null,
    });
  });

  it('verified เป็นจริงเฉพาะเมื่อ meta.hmac_verified เป็น true จริง ๆ', () => {
    const withFlag = (hmac: unknown): boolean =>
      toWidgetContact({ id: 1, meta: { hmac_verified: hmac as boolean } }).verified;

    expect(withFlag(true)).toBe(true);
    expect(withFlag(false)).toBe(false);
    expect(withFlag(undefined)).toBe(false);
    // ค่าที่ "ดูเหมือนจริง" แต่ไม่ใช่ boolean true ต้องไม่ผ่าน
    expect(withFlag('true')).toBe(false);
    expect(withFlag(1)).toBe(false);
  });
});

describe('classifyMessage', () => {
  it('อ่าน message_type ได้ทั้งแบบตัวเลขและแบบข้อความ', () => {
    expect(classifyMessage({ id: 1, message_type: 0 })).toBe('incoming');
    expect(classifyMessage({ id: 2, message_type: 'incoming' })).toBe('incoming');
    expect(classifyMessage({ id: 3, message_type: 1 })).toBe('outgoing');
    expect(classifyMessage({ id: 4, message_type: 'outgoing' })).toBe('outgoing');
    expect(classifyMessage({ id: 5, message_type: 2 })).toBe('activity');
    expect(classifyMessage({ id: 6, message_type: 3 })).toBe('template');
  });

  it('โน้ตส่วนตัวมาก่อนชนิดของข้อความเสมอ', () => {
    // โน้ตภายในถูกส่งเป็น outgoing — ถ้าเรียงผิด ผู้เข้าชมจะได้อ่านโน้ตที่ทีมคุยกันเอง
    expect(classifyMessage({ id: 7, message_type: 1, private: true })).toBe('private');
    expect(classifyMessage({ id: 8, message_type: 'outgoing', private: true })).toBe('private');
  });

  it('ชนิดที่ไม่รู้จักตกเป็น other ไม่ใช่เดาว่าเป็น outgoing', () => {
    expect(classifyMessage({ id: 9, message_type: 99 })).toBe('other');
    expect(classifyMessage({ id: 10 })).toBe('other');
  });
});

describe('isImportable', () => {
  it('เอาเฉพาะข้อความจริงของทั้งสองฝั่ง', () => {
    expect(isImportable({ id: 25, message_type: 0, content_type: 'text' })).toBe(true);
    expect(isImportable({ id: 27, message_type: 1, content_type: 'text' })).toBe(true);
    // ไม่ระบุ content_type ถือว่าเป็นข้อความธรรมดา
    expect(isImportable({ id: 40, message_type: 0 })).toBe(true);
  });

  it('ข้ามโน้ตส่วนตัว ข้อความกิจกรรม ข้อความต้นแบบ และแบบให้คะแนน', () => {
    expect(isImportable({ id: 28, message_type: 2, content_type: 'text' })).toBe(false);
    expect(isImportable({ id: 26, message_type: 3, content_type: 'text' })).toBe(false);
    expect(isImportable({ id: 30, message_type: 3, content_type: 'input_csat' })).toBe(false);
    expect(isImportable({ id: 31, message_type: 1, private: true, content_type: 'text' })).toBe(false);
    // CSAT ที่ถูกส่งเป็น outgoing ก็ยังต้องถูกข้าม เพราะ content_type ไม่ใช่ text
    expect(isImportable({ id: 32, message_type: 1, content_type: 'input_csat' })).toBe(false);
  });
});

describe('requesterLinkDecision', () => {
  it('ยืนยันแล้วและเจอบัญชีเดียวที่ว่างอยู่ → ผูก', () => {
    expect(
      requesterLinkDecision({
        verified: true,
        email: 'somsak@aidctech.com.la',
        match: { id: 42, hasOpenChat: false },
      }),
    ).toEqual({ link: 42, reason: 'linked' });
  });

  it('ยืนยันแล้วแต่ไม่มีบัญชีที่ตรง → ไม่ผูก', () => {
    expect(
      requesterLinkDecision({ verified: true, email: 'someone@example.com', match: null }),
    ).toEqual({ link: null, reason: 'no_match' });
  });

  it('ยังไม่ยืนยัน แม้อีเมลจะตรงกับบัญชีจริง → ห้ามผูกเด็ดขาด', () => {
    /*
     * นี่คือเคสสำคัญที่สุดของไฟล์นี้ — อีเมลจากฟอร์มก่อนแชทใครก็พิมพ์ได้
     * ถ้าผูก ใครก็พิมพ์อีเมลหัวหน้าตัวเองแล้วเข้าไปอยู่ในห้องแชทของเขา
     */
    expect(
      requesterLinkDecision({
        verified: false,
        email: 'somsak@aidctech.com.la',
        match: { id: 42, hasOpenChat: false },
      }),
    ).toEqual({ link: null, reason: 'not_verified' });
  });

  it('ยืนยันแล้ว เจอบัญชี แต่เขามีห้องที่เปิดอยู่แล้ว → ไม่ผูก ไม่รวมห้อง', () => {
    expect(
      requesterLinkDecision({
        verified: true,
        email: 'somsak@aidctech.com.la',
        match: { id: 42, hasOpenChat: true },
      }),
    ).toEqual({ link: null, reason: 'requester_busy' });
  });

  it('ยืนยันแล้วแต่ไม่มีอีเมลมาด้วย → ไม่ผูก', () => {
    expect(requesterLinkDecision({ verified: true, email: null, match: null })).toEqual({
      link: null,
      reason: 'no_email',
    });
  });
});

describe('shouldReopen', () => {
  it('ห้องที่ปิดแล้วและมีข้อความใหม่ของผู้เข้าชม → เปิดกลับ', () => {
    expect(shouldReopen('closed', [{ id: 1, message_type: 0 }])).toBe(true);
  });

  it('ห้องที่ปิดแล้วแต่มีแค่คำตอบของเจ้าหน้าที่หรือข้อความกิจกรรม → ยังปิดอยู่', () => {
    expect(shouldReopen('closed', [{ id: 1, message_type: 1 }])).toBe(false);
    expect(shouldReopen('closed', [{ id: 2, message_type: 2 }])).toBe(false);
    expect(shouldReopen('closed', [])).toBe(false);
  });

  it('ห้องที่เปิดอยู่แล้วไม่ต้องเปิดซ้ำ', () => {
    expect(shouldReopen('open', [{ id: 1, message_type: 0 }])).toBe(false);
  });
});

describe('shouldCloseFromChatwoot', () => {
  it('Chatwoot ปิดแล้วแต่ห้องเรายังเปิด → ปิดตาม', () => {
    expect(shouldCloseFromChatwoot('resolved', 'open')).toBe(true);
  });

  it('สถานะอื่นของ Chatwoot ไม่ทำให้ห้องเราปิด', () => {
    expect(shouldCloseFromChatwoot('open', 'open')).toBe(false);
    expect(shouldCloseFromChatwoot('pending', 'open')).toBe(false);
    expect(shouldCloseFromChatwoot('snoozed', 'open')).toBe(false);
    expect(shouldCloseFromChatwoot(null, 'open')).toBe(false);
  });

  it('ห้องที่ปิดไปแล้วไม่ถูกปิดซ้ำ (กันข้อความระบบซ้ำทุกรอบ)', () => {
    expect(shouldCloseFromChatwoot('resolved', 'closed')).toBe(false);
  });
});

describe('isWithinWindow', () => {
  const now = new Date('2026-09-17T00:00:00.000Z');
  const unix = (iso: string): number => Math.floor(new Date(iso).getTime() / 1000);

  it('บทสนทนาที่ขยับภายในหน้าต่างเวลาผ่าน', () => {
    expect(isWithinWindow(unix('2026-09-16T23:00:00.000Z'), now, 30)).toBe(true);
    expect(isWithinWindow(unix('2026-08-20T00:00:00.000Z'), now, 30)).toBe(true);
  });

  it('บทสนทนาที่เงียบเกินหน้าต่างถูกข้าม', () => {
    expect(isWithinWindow(unix('2026-07-01T00:00:00.000Z'), now, 30)).toBe(false);
  });

  it('ไม่มีเวลาหรือค่าเพี้ยน ถือว่าไม่อยู่ในหน้าต่าง', () => {
    expect(isWithinWindow(null, now, 30)).toBe(false);
    expect(isWithinWindow(undefined, now, 30)).toBe(false);
    expect(isWithinWindow(Number.NaN, now, 30)).toBe(false);
  });

  it('นาฬิกาสองเครื่องเหลื่อมกันเล็กน้อยยังผ่าน', () => {
    // เวลาในอนาคต 30 วินาที เกิดได้จริงเมื่อเครื่อง Chatwoot กับเราไม่ตรงกันเป๊ะ
    expect(isWithinWindow(unix('2026-09-17T00:00:30.000Z'), now, 30)).toBe(true);
  });
});

describe('widgetCompanyId', () => {
  it('โครงการของบริษัทใช้บริษัทนั้น', () => {
    expect(widgetCompanyId(7, 1)).toBe(7);
  });

  it('โครงการส่วนกลางตกมาที่บริษัทเจ้าของระบบ ไม่ใช่ปล่อยว่าง', () => {
    expect(widgetCompanyId(null, 1)).toBe(1);
  });
});

describe('isPushableToVisitor', () => {
  const at = new Date('2026-09-17T03:00:00.000Z');
  const now = new Date('2026-09-17T03:00:30.000Z');
  const open = { status: 'open' };

  function candidate(over: Partial<OutboundCandidate> = {}): OutboundCandidate {
    return {
      senderId: 22,
      isSystem: false,
      fromContact: false,
      externalSenderName: null,
      chatwootMessageId: null,
      createdAt: at,
      ...over,
    };
  }

  it('คำตอบของเจ้าหน้าที่ส่งออกได้ — พฤติกรรมเดิมไม่เปลี่ยน', () => {
    expect(isPushableToVisitor(open, candidate(), now)).toBe(true);
  });

  it('ข้อความที่ส่งไปแล้วไม่ถูกส่งซ้ำ', () => {
    expect(isPushableToVisitor(open, candidate({ chatwootMessageId: 91 }), now)).toBe(false);
  });

  it('ข้อความที่ดึงมาจาก Chatwoot ไม่ถูกส่งกลับไป', () => {
    expect(isPushableToVisitor(open, candidate({ externalSenderName: 'Somsak' }), now)).toBe(false);
    expect(isPushableToVisitor(open, candidate({ fromContact: true, senderId: null }), now)).toBe(
      false,
    );
  });

  it('ข้อความที่ไม่ใช่ของระบบและไม่มีเจ้าของใน Helpdesk ยังส่งไม่ได้เหมือนเดิม', () => {
    expect(isPushableToVisitor(open, candidate({ senderId: null }), now)).toBe(false);
  });

  it('ข้อความของระบบที่เราสร้างเอง ส่งถึงผู้เข้าชมได้ทั้งที่ sender_id เป็น null', () => {
    // นี่คือข้อความที่บอกผู้ถามว่าเรื่องของเขาไปถึงไหนแล้ว
    expect(isPushableToVisitor(open, candidate({ isSystem: true, senderId: null }), now)).toBe(true);
  });

  it('ห้องที่ปิดแล้วไม่ส่งข้อความของระบบออกไป', () => {
    /*
     * กันสองข้อความที่มีอยู่เดิมพร้อมกัน — "ທີມໄອທີປິດແຊັດນີ້ແລ້ວ" ที่เขียนตอนปิดห้อง
     * และ "ບົດສົນທະນານີ້ຖືກປິດຈາກ Chatwoot ແລ້ວ" ซึ่งถ้าส่งกลับไปเท่ากับพูดซ้ำ
     * สิ่งที่ Chatwoot เพิ่งทำเอง
     */
    const closed = { status: 'closed' };
    expect(isPushableToVisitor(closed, candidate({ isSystem: true, senderId: null }), now)).toBe(
      false,
    );
  });

  it('คำตอบของเจ้าหน้าที่ยังส่งได้แม้ห้องถูกปิดไปแล้ว', () => {
    // ปิดห้องแล้วยังมีข้อความค้างส่งอยู่ เป็นเรื่องปกติของการซิงก์ที่ไม่รอผล
    expect(isPushableToVisitor({ status: 'closed' }, candidate(), now)).toBe(true);
  });

  it('ข้อความของระบบที่ค้างเกินเพดานเวลา ไม่ถูกส่งตามหลัง', () => {
    const stale = candidate({
      isSystem: true,
      senderId: null,
      createdAt: new Date('2026-09-17T01:00:00.000Z'),
    });
    expect(isPushableToVisitor(open, stale, now)).toBe(false);
    // คำตอบของเจ้าหน้าที่ไม่ถูกเพดานนี้แตะ — ลองใหม่ได้ตลอดเหมือนเดิม
    expect(isPushableToVisitor(open, { ...stale, isSystem: false, senderId: 22 }, now)).toBe(true);
  });
});
