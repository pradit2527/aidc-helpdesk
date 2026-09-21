import { describe, expect, it } from 'vitest';

import { TICKET_STATUS } from '../../common/constants';
import { CHAT_NOTICE_MAX_LENGTH, ticketStatusNotice } from './ticket-status-notice';

describe('ticketStatusNotice', () => {
  it('รับเรื่องแล้ว', () => {
    expect(ticketStatusNotice('assigned')).toBe('ທີມງານຮັບເລື່ອງແລ້ວ');
  });

  it('กำลังดำเนินการ', () => {
    expect(ticketStatusNotice('in_progress')).toBe('ກຳລັງດຳເນີນການແກ້ໄຂ');
  });

  it('พักเรื่อง — ต่อท้ายด้วยเหตุผลที่เจ้าหน้าที่กรอกไว้', () => {
    // เหตุผลเดียวกับที่ถูกส่งเป็นข้อความถึงผู้แจ้งใน ChangeTicketStatusUseCase
    expect(ticketStatusNotice('pending_user', { reason: 'ລໍຖ້າອາໄຫຼ່ຈາກຜູ້ຈຳໜ່າຍ' })).toBe(
      'ພັກເລື່ອງໄວ້ກ່ອນ: ລໍຖ້າອາໄຫຼ່ຈາກຜູ້ຈຳໜ່າຍ',
    );
  });

  it('พักเรื่องโดยไม่มีเหตุผลติดมา ยังได้ข้อความตั้งต้น ไม่ใช่ข้อความมีทวิภาคค้าง', () => {
    expect(ticketStatusNotice('pending_user')).toBe('ພັກເລື່ອງໄວ້ກ່ອນ');
    expect(ticketStatusNotice('pending_user', { reason: '   ' })).toBe('ພັກເລື່ອງໄວ້ກ່ອນ');
  });

  it('แก้ไขเสร็จ — ใช้บันทึกวิธีแก้เมื่อมี', () => {
    expect(ticketStatusNotice('resolved', { resolutionNote: 'ຕັ້ງລະຫັດຜ່ານໃໝ່ໃຫ້ແລ້ວ' })).toBe(
      'ແກ້ໄຂສຳເລັດແລ້ວ: ຕັ້ງລະຫັດຜ່ານໃໝ່ໃຫ້ແລ້ວ',
    );
  });

  it('แก้ไขเสร็จโดยไม่มีบันทึก — ใช้ข้อความกลาง', () => {
    expect(ticketStatusNotice('resolved')).toBe('ແກ້ໄຂສຳເລັດແລ້ວ');
  });

  it('แก้ไขเสร็จไม่หยิบ reason มาใช้แทนบันทึกวิธีแก้', () => {
    // reason ของการเปลี่ยนสถานะเป็นบันทึกภายใน ไม่ใช่คำอธิบายที่เขียนให้ผู้ถามอ่าน
    expect(ticketStatusNotice('resolved', { reason: 'ປິດຕາມ SOP' })).toBe('ແກ້ໄຂສຳເລັດແລ້ວ');
  });

  it('ปิดเรื่อง', () => {
    expect(ticketStatusNotice('closed')).toBe('ປິດເລື່ອງແລ້ວ');
  });

  it('ยกเลิก — ต่อท้ายด้วยเหตุผลที่บังคับกรอกอยู่แล้ว', () => {
    expect(ticketStatusNotice('cancelled', { reason: 'ຜູ້ແຈ້ງແກ້ໄດ້ເອງແລ້ວ' })).toBe(
      'ຍົກເລີກເລື່ອງແລ້ວ: ຜູ້ແຈ້ງແກ້ໄດ້ເອງແລ້ວ',
    );
  });

  it('สถานะ new ไม่มีข้อความ — เรื่องเพิ่งถูกสร้างจากห้องนี้เอง', () => {
    expect(ticketStatusNotice('new')).toBeNull();
  });

  it('ทุกสถานะในระบบต้องตอบได้ ไม่โยน error', () => {
    for (const status of TICKET_STATUS) {
      const text = ticketStatusNotice(status, { reason: 'ເຫດຜົນ', resolutionNote: 'ວິທີແກ້' });
      expect(text === null || text.length > 0).toBe(true);
    }
  });

  it('บันทึกวิธีแก้ที่ยาวมากถูกตัดให้พอดีเพดานของคอลัมน์ข้อความแชท', () => {
    // ck_support_chat_message_content บังคับ char_length(body) <= 4000
    const text = ticketStatusNotice('resolved', { resolutionNote: 'ກ'.repeat(6000) });
    expect(text).not.toBeNull();
    expect(text!.length).toBeLessThanOrEqual(CHAT_NOTICE_MAX_LENGTH);
    expect(text!.endsWith('…')).toBe(true);
  });
});
