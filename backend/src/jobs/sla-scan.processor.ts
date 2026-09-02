import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type Redis from 'ioredis';

import { REDIS } from '../common/redis/redis.module';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { ticket } from '../db/schema';
import { SLA_SCAN_HEARTBEAT_KEY } from './queue.config';

export interface SlaScanResult {
  scannedAt: string;
  responseBreached: number;
  resolutionBreached: number;
  durationMs: number;
}

/** สถานะที่ยังนับเวลาอยู่ — ปิดหรือยกเลิกแล้วไม่ต้องกวาด */
const OPEN_STATUSES = ['new', 'assigned', 'in_progress'] as const;

/**
 * กวาดหาเรื่องที่เกินกำหนด แล้วตั้งธงลงฐานข้อมูล
 *
 * ทำไมต้องมีงานนี้ ทั้งที่สถานะ SLA คำนวณตอนอ่านอยู่แล้ว
 *   การคำนวณตอนอ่านทำให้ "หน้าจอ" ถูกต้องเสมอ แต่ไม่มีใครรู้เรื่องถ้าไม่มีใครเปิดดู
 *   งานนี้ทำสองอย่างที่การคำนวณตอนอ่านทำแทนไม่ได้
 *     1. ตั้งธง is_*_breached เพื่อให้รายงานย้อนหลังตอบได้ว่า
 *        "เดือนที่แล้วเกินกำหนดกี่เรื่อง" โดยไม่ต้องคำนวณย้อนหลังทั้งตาราง
 *     2. เป็นจุดตั้งต้นของการแจ้งเตือนและการยกระดับ
 *
 * ⚠️ ตั้งธงเท่านั้น ไม่ปลดธง
 *    เรื่องที่เคยเกินกำหนดแล้ว ต่อให้ทีมแก้เสร็จทีหลังก็ยังเกินกำหนดอยู่ดี
 *    ถ้าปลดธงได้ ตัวเลข KPI ของเดือนที่ปิดไปแล้วจะเปลี่ยนย้อนหลัง
 *    และรายงานที่ส่งผู้บริหารไปแล้วจะไม่ตรงกับที่ระบบแสดงในภายหลัง
 */
@Injectable()
export class SlaScanProcessor {
  private readonly logger = new Logger('SlaScan');

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async run(): Promise<SlaScanResult> {
    const startedAt = process.hrtime.bigint();
    const now = new Date();

    const [responseBreached, resolutionBreached] = await Promise.all([
      this.flagResponseBreaches(now),
      this.flagResolutionBreaches(now),
    ]);

    const durationMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000);

    /*
     * บันทึกว่ารันเสร็จเมื่อไร ให้ /health อ่าน
     *
     * นี่คือหัวใจของการจับความล้มเหลวแบบเงียบ — ถ้า scheduler ตายไป
     * ทุก endpoint ยังตอบ 200 หน้าเว็บยังเปิดได้ปกติ แต่ SLA ไม่ถูกประเมิน
     * และไม่มีการแจ้งเตือนใครเลย กว่าจะรู้ตัวคือตอนลูกค้าถามว่าทำไมไม่มีคนรับเรื่อง
     */
    await this.redis
      .set(SLA_SCAN_HEARTBEAT_KEY, now.toISOString())
      .catch((error: Error) => this.logger.warn(`บันทึกเวลารันไม่สำเร็จ: ${error.message}`));

    const result: SlaScanResult = {
      scannedAt: now.toISOString(),
      responseBreached,
      resolutionBreached,
      durationMs,
    };

    if (responseBreached > 0 || resolutionBreached > 0) {
      this.logger.warn({ msg: 'พบเรื่องที่เกินกำหนด', ...result });
    } else {
      this.logger.debug({ msg: 'กวาด SLA เสร็จ ไม่พบเรื่องเกินกำหนดใหม่', ...result });
    }

    return result;
  }

  /**
   * ตั้งธงเกินกำหนดตอบรับ
   *
   * ทำเป็น UPDATE ก้อนเดียวใน SQL ไม่ใช่อ่านมาวนใน JavaScript
   * เพราะถ้าอ่านมาวน ระบบที่มีเรื่องค้างหมื่นเรื่องจะดึงทั้งหมดขึ้นมาในหน่วยความจำ
   * ทุก 5 นาที ซึ่งเป็นวิธีที่งาน background ทำให้เซิร์ฟเวอร์ล่มบ่อยที่สุด
   */
  private async flagResponseBreaches(now: Date): Promise<number> {
    const rows = await this.db
      .update(ticket)
      .set({ isResponseBreached: true })
      .where(
        and(
          eq(ticket.isResponseBreached, false),
          isNotNull(ticket.responseDueAt),
          lte(ticket.responseDueAt, now),
          // ยังไม่มีใครตอบรับ — ตอบแล้วถือว่าทันแม้จะตอบช้า
          isNull(ticket.firstResponseAt),
          isNull(ticket.deletedAt),
          // ข้อยกเว้นตาม SLA ข้อ 9 ไม่ตั้งธงและไม่นับใน KPI
          isNull(ticket.slaExclusionCode),
          sql`${ticket.status} in ${OPEN_STATUSES}`,
        ),
      )
      .returning({ id: ticket.id });

    return rows.length;
  }

  /** ตั้งธงเกินกำหนดแก้ไข */
  private async flagResolutionBreaches(now: Date): Promise<number> {
    const rows = await this.db
      .update(ticket)
      .set({ isResolutionBreached: true })
      .where(
        and(
          eq(ticket.isResolutionBreached, false),
          isNotNull(ticket.resolutionDueAt),
          lte(ticket.resolutionDueAt, now),
          isNull(ticket.resolvedAt),
          isNull(ticket.deletedAt),
          isNull(ticket.slaExclusionCode),
          /*
           * นับ pending_user เป็นเรื่องที่ยังเปิดอยู่ แต่ไม่ตั้งธง
           * เพราะนาฬิกาหยุดเดินระหว่างรอผู้แจ้ง — เวลาที่ผ่านไปช่วงนั้น
           * ไม่ใช่ความล่าช้าของทีม การตั้งธงจะทำให้ KPI ลงโทษทีม
           * สำหรับเวลาที่ควบคุมไม่ได้ แล้วคนจะเลี่ยงไม่ใช้สถานะนี้
           */
          sql`${ticket.status} in ${OPEN_STATUSES}`,
        ),
      )
      .returning({ id: ticket.id });

    return rows.length;
  }
}
