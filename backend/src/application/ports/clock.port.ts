import { Injectable } from '@nestjs/common';

/**
 * แหล่งเวลาปัจจุบัน
 *
 * ดูเหมือนเกินจำเป็น แต่ในระบบที่ทุกอย่างวัดด้วย SLA มันเปลี่ยนเรื่องเทสต์ทั้งหมด
 *
 * ถ้าโค้ดเรียก `new Date()` ตรง ๆ คำถามอย่าง
 *   "แจ้งเรื่อง P3 ตอน 20:00 วันศุกร์ นาฬิกาต้องเริ่มเดินเมื่อไร"
 * จะทดสอบได้แค่สองทาง — แช่แข็งเวลาทั้งโปรเซส (กระทบเทสต์อื่นที่รันขนานกัน)
 * หรือรอจนถึงคืนวันศุกร์จริง ๆ
 *
 * พอเวลากลายเป็นสิ่งที่ฉีดเข้าไปได้ คำถามนั้นก็เหลือแค่บรรทัดเดียว
 * และนี่คือกฎที่พังแล้วเจ็บที่สุดในระบบนี้ เพราะมันพังเงียบ —
 * ตัวเลข SLA จะผิดไปเรื่อย ๆ โดยไม่มี error ให้เห็นสักตัว
 */
export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** ใช้ในเทสต์ — กำหนดเวลาได้ตามต้องการ และเลื่อนเวลาเองได้ */
export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(at: Date): void {
    this.current = at;
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}
