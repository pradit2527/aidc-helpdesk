import { describe, expect, it } from 'vitest';

import {
  clampSubject,
  DEFAULT_IMPACT,
  DEFAULT_URGENCY,
  formatTranscriptTime,
  renderTranscript,
  resolveTicketDefaults,
  SUBJECT_MAX_LENGTH,
  transcriptRole,
  type TranscriptMessage,
} from './chat-ticket';

/** ข้อความหนึ่งข้อความ พร้อมค่าตั้งต้นที่เป็นกลาง — เทสต์แต่ละข้อแก้เฉพาะช่องที่สนใจ */
function message(over: Partial<TranscriptMessage> = {}): TranscriptMessage {
  return {
    senderId: null,
    senderName: null,
    externalSenderName: null,
    body: '',
    isSystem: false,
    fromContact: false,
    attachmentKind: null,
    createdAt: new Date('2026-09-17T02:30:00.000Z'),
    ...over,
  };
}

describe('transcriptRole', () => {
  it('ข้อความที่ผู้เข้าชมเว็บพิมพ์เป็นของ contact แม้ sender_id จะเป็น null', () => {
    expect(transcriptRole(message({ fromContact: true }), null)).toBe('contact');
  });

  it('ข้อความของบัญชีที่เป็นผู้แจ้งของห้อง เป็นของ requester', () => {
    expect(transcriptRole(message({ senderId: 12 }), 12)).toBe('requester');
  });

  it('ข้อความของบัญชีอื่นเป็นของ staff', () => {
    expect(transcriptRole(message({ senderId: 22 }), 12)).toBe('staff');
  });

  it('คำตอบจากฝั่ง Chatwoot (ไม่มีบัญชีในระบบ) นับเป็น staff ไม่ใช่ contact', () => {
    // ทั้งคู่มี sender_id เป็น null — ตัวที่แยกคือธง from_contact เท่านั้น
    const external = message({ senderId: null, externalSenderName: 'Somsak', fromContact: false });
    expect(transcriptRole(external, null)).toBe('staff');
  });

  it('ห้องที่ยังไม่รู้ว่าใครเป็นผู้แจ้ง ไม่ทำให้ข้อความของเจ้าหน้าที่กลายเป็นของผู้แจ้ง', () => {
    // requesterId เป็น null และ senderId ก็ null ได้ — ห้ามให้ null === null ผ่านเป็น requester
    expect(transcriptRole(message({ senderId: null }), null)).toBe('staff');
  });
});

describe('formatTranscriptTime', () => {
  it('ใช้เวลาเวียงจันทน์ (UTC+7) ไม่ใช่ UTC', () => {
    // 02:30 UTC = 09:30 ที่เวียงจันทน์ — เรื่องที่แจ้งตอนเช้าต้องอ่านว่าเป็นเวลาเช้า
    expect(formatTranscriptTime(new Date('2026-09-17T02:30:00.000Z'))).toBe('17/09/2026 09:30');
  });

  it('ข้ามวันเมื่อเวลา UTC อยู่ปลายวัน', () => {
    expect(formatTranscriptTime(new Date('2026-09-16T18:05:00.000Z'))).toBe('17/09/2026 01:05');
  });
});

describe('renderTranscript', () => {
  const messages: TranscriptMessage[] = [
    message({
      fromContact: true,
      externalSenderName: 'ນາງ ສົມໃຈ',
      body: 'ເຂົ້າລະບົບ ILP ບໍ່ໄດ້',
      createdAt: new Date('2026-09-17T02:30:00.000Z'),
    }),
    message({
      isSystem: true,
      body: 'ທີມໄອທີປິດແຊັດນີ້ແລ້ວ',
      createdAt: new Date('2026-09-17T02:31:00.000Z'),
    }),
    message({
      senderId: 22,
      senderName: 'ສົມສັກ ວົງສາ',
      body: 'ລົບລະຫັດເກົ່າແລ້ວລອງໃໝ່ເດີ້',
      createdAt: new Date('2026-09-17T02:32:00.000Z'),
    }),
  ];

  it('ติดป้ายผู้พูดและเวลาไว้ทุกบรรทัด และตัดข้อความระบบออก', () => {
    const text = renderTranscript(messages, { requesterId: null, contactName: 'ນາງ ສົມໃຈ' });

    expect(text).toContain('[17/09/2026 09:30] ຜູ້ເຂົ້າຊົມ (ນາງ ສົມໃຈ): ເຂົ້າລະບົບ ILP ບໍ່ໄດ້');
    expect(text).toContain('[17/09/2026 09:32] ທີມໄອທີ (ສົມສັກ ວົງສາ): ລົບລະຫັດເກົ່າແລ້ວລອງໃໝ່ເດີ້');
    // ข้อความระบบไม่ใช่สิ่งที่ผู้แจ้งเล่า — ห้ามไปโผล่เป็นเนื้อหาของปัญหา
    expect(text).not.toContain('ທີມໄອທີປິດແຊັດນີ້ແລ້ວ');
  });

  it('บอกไว้ท้ายข้อความเสมอว่าอ่านต่อได้ที่ห้องแชท', () => {
    expect(renderTranscript(messages, { requesterId: null })).toContain('ຫ້ອງແຊັດ');
  });

  it('ข้อความที่มีแต่ไฟล์ยังมีบรรทัดของตัวเอง ไม่หายไปเงียบ ๆ', () => {
    const text = renderTranscript([message({ fromContact: true, attachmentKind: 'image' })], {
      requesterId: null,
    });
    expect(text).toContain('[ຮູບພາບ]');
  });

  it('ห้องที่ยังไม่มีอะไรถอดได้ คืนข้อความแทน ไม่ใช่สตริงว่าง', () => {
    // รายละเอียดของเรื่องเป็นคอลัมน์ NOT NULL และ entity ปฏิเสธคำอธิบายที่ว่างเปล่า
    const text = renderTranscript([message({ isSystem: true, body: 'x' })], { requesterId: null });
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it('ตัดที่ขอบบรรทัด ไม่ตัดกลางประโยค และบอกว่ายังมีต่อ', () => {
    const long = Array.from({ length: 50 }, (_, i) =>
      message({ fromContact: true, body: `ບັນທຶກທີ ${i} `.repeat(10) }),
    );

    const text = renderTranscript(long, { requesterId: null, maxLength: 600 });

    expect(text.length).toBeLessThanOrEqual(600);
    expect(text).toContain('ບົດສົນທະນາຍັງມີຕໍ່');
    for (const line of text.split('\n')) {
      // ทุกบรรทัดที่เหลืออยู่ต้องเป็นบรรทัดเต็ม (ขึ้นต้นด้วยเวลา) หรือเป็นหมายเหตุท้าย
      if (line === '' || line.startsWith('…')) continue;
      expect(line.startsWith('[')).toBe(true);
    }
  });

  it('บรรทัดเดียวที่ยาวเกินงบ ยังได้เนื้อหาบางส่วน ไม่ใช่หมายเหตุลอย ๆ', () => {
    const text = renderTranscript([message({ fromContact: true, body: 'ກ'.repeat(5000) })], {
      requesterId: null,
      maxLength: 200,
    });
    expect(text.length).toBeLessThanOrEqual(200);
    expect(text).toContain('ກ');
  });

  it('บทสนทนาที่พอดีเพดาน ไม่ถูกติดหมายเหตุว่ายังมีต่อ', () => {
    const text = renderTranscript([message({ fromContact: true, body: 'ສັ້ນ' })], {
      requesterId: null,
      maxLength: 4000,
    });
    expect(text).not.toContain('ບົດສົນທະນາຍັງມີຕໍ່');
  });

  it('ผู้เข้าชมที่ไม่ได้บอกชื่อ ใช้ป้ายเฉย ๆ ไม่ใช่ชื่อว่าง', () => {
    const text = renderTranscript([message({ fromContact: true, body: 'ສະບາຍດີ' })], {
      requesterId: null,
      contactName: null,
    });
    expect(text).toContain('ຜູ້ເຂົ້າຊົມ: ສະບາຍດີ');
  });
});

describe('resolveTicketDefaults', () => {
  it('ค่าที่ผู้เรียกส่งมาชนะหมวดหมู่ตั้งต้นของโครงการเสมอ', () => {
    const result = resolveTicketDefaults({
      categoryId: 79,
      projectDefaultCategoryId: 12,
      impact: 'org_wide',
      urgency: 'high',
    });
    expect(result).toEqual({ categoryId: 79, impact: 'org_wide', urgency: 'high' });
  });

  it('ไม่ส่งหมวดหมู่มา ใช้ค่าตั้งต้นของโครงการ', () => {
    expect(resolveTicketDefaults({ projectDefaultCategoryId: 12 }).categoryId).toBe(12);
  });

  it('ไม่มีทั้งสองทาง คืน null ให้ผู้เรียกไปตอบ 422 — ไม่เดาหมวดหมู่ให้', () => {
    expect(resolveTicketDefaults({}).categoryId).toBeNull();
    expect(resolveTicketDefaults({ projectDefaultCategoryId: null }).categoryId).toBeNull();
  });

  it('ผลกระทบและความเร่งด่วนที่ไม่ได้ส่งมา ใช้ค่าตั้งต้นของคอลัมน์', () => {
    expect(resolveTicketDefaults({ categoryId: 1 })).toEqual({
      categoryId: 1,
      impact: DEFAULT_IMPACT,
      urgency: DEFAULT_URGENCY,
    });
  });

  it('null กับไม่ส่งมา มีความหมายเดียวกัน', () => {
    expect(resolveTicketDefaults({ categoryId: null, projectDefaultCategoryId: 12 })).toEqual({
      categoryId: 12,
      impact: DEFAULT_IMPACT,
      urgency: DEFAULT_URGENCY,
    });
  });
});

describe('clampSubject', () => {
  it('ตัดที่ 200 ตามกฎของ TicketEntity ไม่ใช่ 255 ของคอลัมน์', () => {
    expect(clampSubject('ກ'.repeat(300))).toHaveLength(SUBJECT_MAX_LENGTH);
  });

  it('ตัดช่องว่างหัวท้ายและปล่อยหัวข้อสั้น ๆ ผ่านไปตามเดิม', () => {
    expect(clampSubject('  ເຂົ້າລະບົບບໍ່ໄດ້  ')).toBe('ເຂົ້າລະບົບບໍ່ໄດ້');
  });
});
