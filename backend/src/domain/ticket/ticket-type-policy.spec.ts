import { describe, expect, it } from 'vitest';

import { resolveTicketType } from './ticket-type-policy';

/**
 * กฎ "เหตุขัดข้องเป็นของพนักงานในเครือเท่านั้น"
 *
 * ทดสอบที่ชั้นนี้เพราะกฎถูกบังคับจากสองทางเข้าที่ไม่รู้จักกัน (POST /tickets
 * และการยกระดับแชทจาก Support Hub) — ถ้าเทสต์ผ่านทางเข้าใดทางเข้าหนึ่ง
 * อีกทางจะไม่มีอะไรคุ้มครองเลย ซึ่งเป็นสภาพก่อนการแก้ครั้งนี้พอดี
 */
describe('resolveTicketType — ผู้แจ้งภายนอกแจ้งเหตุขัดข้องไม่ได้', () => {
  const internal = { isInternalAccount: true };
  const external = { isInternalAccount: false };

  it('พนักงานในเครือแจ้งได้ทั้งสองชนิดตามที่เลือก', () => {
    expect(resolveTicketType('incident', internal)).toEqual({
      ticketType: 'incident',
      coerced: false,
    });
    expect(resolveTicketType('service_request', internal)).toEqual({
      ticketType: 'service_request',
      coerced: false,
    });
  });

  it('พนักงานที่ไม่ได้ระบุชนิด ได้ค่าตั้งต้นเดียวกับคอลัมน์ในฐานข้อมูล', () => {
    expect(resolveTicketType(undefined, internal)).toEqual({
      ticketType: 'incident',
      coerced: false,
    });
  });

  it('ผู้แจ้งภายนอกที่ขอ incident ถูกดัดเป็น service_request', () => {
    expect(resolveTicketType('incident', external)).toEqual({
      ticketType: 'service_request',
      coerced: true,
    });
  });

  /*
   * ⚠️ เส้นทางที่เกิดจริงบ่อยที่สุด
   *    SupportChatService.convertToTicket ไม่เคยส่ง ticket_type มาเลย
   *    เรื่องจากแชททุกใบจึงเคยกลายเป็น incident เงียบ ๆ ผ่านค่าตั้งต้นของคอลัมน์
   *    ไม่ใช่เพราะมีใครเลือก — ถ้าเทสต์แค่กรณีที่ "ขอ incident มาตรง ๆ"
   *    ช่องนี้จะยังเปิดอยู่เหมือนเดิม
   */
  it('ผู้แจ้งภายนอกที่ไม่ระบุชนิด ก็ยังถูกดัด ไม่ตกไปที่ค่าตั้งต้น incident', () => {
    expect(resolveTicketType(undefined, external)).toEqual({
      ticketType: 'service_request',
      coerced: true,
    });
  });

  it('ผู้แจ้งภายนอกที่ขอ service_request อยู่แล้ว ไม่นับว่าถูกดัด', () => {
    expect(resolveTicketType('service_request', external)).toEqual({
      ticketType: 'service_request',
      coerced: false,
    });
  });
});
