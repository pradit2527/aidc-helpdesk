import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type Redis from 'ioredis';

import {
  AWAITING_CONFIRMATION_STATUSES,
  BUSINESS_DAY_MINUTES,
  CLOCK_RUNNING_STATUSES,
  type Priority,
} from '../common/constants';
import { REDIS } from '../common/redis/redis.module';
import { elapsedMinutes, minutesBetween } from '../common/sla/business-time';
import type { Db } from '../db/client';
import { DB } from '../db/db.module';
import { SlaConfigRepository } from '../db/repositories/sla-config.repository';
import { TicketRepository } from '../db/repositories/ticket.repository';
import { ticket } from '../db/schema';
import { IncidentAlertService } from '../modules/notifications/incident-alert.service';
import { SLA_SCAN_HEARTBEAT_KEY } from './queue.config';

export interface SlaScanResult {
  scannedAt: string;
  responseBreached: number;
  resolutionBreached: number;
  /** จำนวนการแจ้งยกระดับที่เขียนลงตาราง notification รอบนี้ */
  escalationsSent: number;
  /** จำนวนเรื่องที่ถูกปิดอัตโนมัติเพราะผู้แจ้งไม่ตอบครบ 3 วันทำการ */
  autoClosed: number;
  durationMs: number;
}

/** สถานะที่ยังนับเวลาอยู่ — ปิดหรือยกเลิกแล้วไม่ต้องกวาด */
const OPEN_STATUSES = CLOCK_RUNNING_STATUSES;

/**
 * เกณฑ์การยกระดับ — 80% ของเวลาเป้าหมาย และ 100% (เกินแล้ว)
 *
 * 80% มาจาก sla_target.escalation_percent ซึ่งตั้งค่าได้รายนโยบาย
 * ค่านี้เป็นเพียงค่าสำรองเมื่อนโยบายไม่ได้กำหนดไว้
 */
const DEFAULT_ESCALATION_PERCENT = 80;

/**
 * ปิดอัตโนมัติหลังงานเสร็จกี่วันทำการ ถ้าผู้แจ้งไม่ยืนยัน
 *
 * 3 วันทำการ ตาม SLA 8.2 + SOP-01 ข้อ 9 (ยืนยันผลการแก้ไขภายใน 3 วันทำการ)
 * และยืนยันแล้วในเอกสารเทียบนโยบาย G-10 ว่าตรงกันทั้งสองฉบับ
 */
const AUTO_CLOSE_BUSINESS_DAYS = 3;
const AUTO_CLOSE_BUSINESS_MINUTES = AUTO_CLOSE_BUSINESS_DAYS * BUSINESS_DAY_MINUTES;

/**
 * เพดานจำนวนเรื่องที่ประเมินต่อรอบ
 *
 * การประเมินเปอร์เซ็นต์ต้องใช้ปฏิทินเวลาทำการ จึงคำนวณใน JS ไม่ใช่ SQL
 * (เหตุผลเดียวกับที่รายงานคำนวณเวลาเฉลี่ยใน JS) เพดานนี้กันไม่ให้รอบเดียว
 * ดึงทั้งตารางขึ้นมาในหน่วยความจำ ซึ่งเป็นวิธีที่งานเบื้องหลังทำให้เซิร์ฟเวอร์
 * ล่มบ่อยที่สุด — เรียงจากใกล้กำหนดที่สุดก่อน ใบที่ตกขอบคือใบที่ยังเหลือเวลาเยอะ
 */
const ESCALATION_SCAN_CAP = 500;

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
    private readonly slaConfig: SlaConfigRepository,
    private readonly tickets: TicketRepository,
    private readonly alerts: IncidentAlertService,
  ) {}

  async run(): Promise<SlaScanResult> {
    const startedAt = process.hrtime.bigint();
    const now = new Date();

    const [responseBreached, resolutionBreached] = await Promise.all([
      this.flagResponseBreaches(now),
      this.flagResolutionBreaches(now),
    ]);

    /*
     * ยกระดับและปิดอัตโนมัติทำ "หลัง" การตั้งธง ไม่ใช่พร้อมกัน
     *
     * การยกระดับอ่านธง is_resolution_breached ที่เพิ่งถูกตั้งไปข้างบน
     * ถ้ายิงพร้อมกัน รอบนี้จะเห็นค่าก่อนตั้งธง แล้วการแจ้งจะช้าไปหนึ่งรอบเสมอ
     *
     * ทั้งคู่กลืนข้อผิดพลาดของตัวเอง — งานกวาดที่ล้มเพราะส่งการแจ้งเตือนไม่ได้
     * ต้องไม่ทำให้การตั้งธงเกินกำหนด (ซึ่งสำเร็จไปแล้ว) ถูกนับว่าล้มเหลวทั้งรอบ
     */
    const escalationsSent = await this.escalate(now).catch((error: unknown) => {
      this.logger.error(`ยกระดับ SLA ไม่สำเร็จ: ${describe(error)}`);
      return 0;
    });
    const autoClosed = await this.autoCloseConfirmed(now).catch((error: unknown) => {
      this.logger.error(`ปิดเรื่องอัตโนมัติไม่สำเร็จ: ${describe(error)}`);
      return 0;
    });

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
      escalationsSent,
      autoClosed,
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

  /**
   * ยกระดับเมื่อใช้เวลาไปแล้ว 80% และ 100% ของเป้าหมาย
   *
   * ── ทำไมอยู่ในงานกวาดตัวนี้ ไม่ใช่งานใหม่ ──
   *
   * โจทย์บอกให้ "ขยายงานกวาด SLA ที่มีอยู่ ถ้ามี" — มีอยู่ และนี่คือมัน
   * docstring ของคลาสนี้เขียนไว้ตั้งแต่ต้นว่าตัวเองคือ "จุดตั้งต้นของการแจ้งเตือน
   * และการยกระดับ" ซึ่งไม่เคยถูกต่อยอดจนถึงตอนนี้
   *
   * ⚠️ ไม่ได้เพิ่ม @nestjs/schedule เข้ามา ทั้งที่โจทย์เปิดทางไว้
   *    เพราะ jobs.module.ts อธิบายไว้ชัดว่าทำไมถึงเลือก BullMQ แทน: setInterval
   *    รันในทุกอินสแตนซ์ การยกระดับจะถูกส่งซ้ำเท่าจำนวนเครื่อง ซึ่งเป็นปัญหา
   *    ที่การแจ้งเตือนเจ็บกว่าการตั้งธงหลายเท่า — การเพิ่ม scheduler ตัวที่สอง
   *    เข้ามาข้าง ๆ คือการสร้างปัญหานั้นขึ้นมาเองทั้งที่มีทางที่ถูกอยู่แล้ว
   *
   * ⚠️ คำนวณเปอร์เซ็นต์ใน JS ไม่ใช่ SQL เพราะต้องใช้ปฏิทินเวลาทำการ
   *    (P1 นับ 24×7 · ที่เหลือนับเฉพาะนาทีทำการ) ใช้ business-time.ts
   *    ตัวเดียวกับที่หน้าจอใช้ ตัวเลขบนกระดิ่งจึงตรงกับตัวเลขบนหน้าเรื่องเสมอ
   *
   * การกันแจ้งซ้ำเป็นหน้าที่ของ uq_notification_dedup — หนึ่งคนได้หนึ่งข้อความ
   * ต่อหนึ่งเรื่องต่อหนึ่งเกณฑ์ต่อวัน ต่อให้งานนี้รันทุก 5 นาที
   */
  private async escalate(now: Date): Promise<number> {
    const rows = await this.db
      .select({
        id: ticket.id,
        ticketNo: ticket.ticketNo,
        companyId: ticket.companyId,
        subject: ticket.subject,
        priority: ticket.priority,
        assigneeId: ticket.assigneeId,
        status: ticket.status,
        clockStart: sql<Date>`coalesce(${ticket.priorityChangedAt}, ${ticket.slaClockStartedAt}, ${ticket.createdAt})`,
        resolutionDueAt: ticket.resolutionDueAt,
        pausedMinutes: ticket.pendingDurationMinutes,
        pendingStartedAt: ticket.pendingStartedAt,
        workaroundAt: ticket.workaroundAt,
      })
      .from(ticket)
      .where(
        and(
          isNotNull(ticket.resolutionDueAt),
          isNull(ticket.resolvedAt),
          isNull(ticket.deletedAt),
          // ข้อยกเว้นตาม SLA ข้อ 9 — ไม่ตั้งธงและไม่ยกระดับ
          isNull(ticket.slaExclusionCode),
          // workaround หยุดนาฬิกา resolution ถาวร (SLA 5.4) — ไม่ต้องเร่งแล้ว
          isNull(ticket.workaroundAt),
          inArray(ticket.status, [...OPEN_STATUSES]),
        ),
      )
      // ใกล้กำหนดที่สุดก่อน — ใบที่ตกขอบเพดานคือใบที่ยังเหลือเวลาเยอะที่สุด
      .orderBy(asc(ticket.resolutionDueAt))
      .limit(ESCALATION_SCAN_CAP);

    let sent = 0;
    for (const row of rows) {
      const [cal, target] = await Promise.all([
        this.slaConfig.calendarFor(row.companyId),
        this.slaConfig.targetFor(row.companyId, row.priority as Priority),
      ]);

      const used = elapsedMinutes({
        /*
         * row.clockStart มาจาก sql<Date>`coalesce(...)` — เป็นแค่การกำกับ
         * ชนิดตอนคอมไพล์ ไม่ได้แปลงค่าจริงตอนรัน postgres.js คืนนิพจน์
         * coalesce มาเป็นสตริง ไม่ใช่ Date เหมือนคอลัมน์ timestamp ปกติ
         * ต้อง new Date() เองก่อนเรียก .getTime() มิฉะนั้นพังทุกรอบที่กวาด
         */
        clockStart: new Date(row.clockStart),
        now,
        cal,
        mode: target.clockMode,
        pausedMinutes: row.pausedMinutes,
        pendingStartedAt: row.pendingStartedAt,
      });

      const budget = target.resolutionMinutes + Math.max(0, row.pausedMinutes);
      if (budget <= 0) continue;

      const usedPercent = Math.round((used / budget) * 100);
      const threshold = target.escalationPercent || DEFAULT_ESCALATION_PERCENT;

      /*
       * เลยกำหนดแล้วนับเป็นเกณฑ์ 100% ไม่ว่าเปอร์เซ็นต์จะคำนวณออกมาเท่าไร
       *
       * สองค่านี้ไม่ตรงกันเสมอไป: resolution_due_at ถูกเลื่อนออกทุกครั้งที่
       * เรื่องกลับมาจากสถานะพัก ส่วน used/budget คำนวณสดจากปฏิทิน ณ ตอนนี้
       * เมื่อไม่ตรงกัน ให้ "เลยกำหนดจริง" ชนะ เพราะนั่นคือค่าที่รายงานและ
       * ธง is_resolution_breached ใช้ตัดสิน
       */
      const level =
        row.resolutionDueAt !== null && row.resolutionDueAt.getTime() <= now.getTime()
          ? ('breached' as const)
          : usedPercent >= threshold
            ? ('at_risk' as const)
            : null;

      if (level === null) continue;

      sent += await this.alerts.slaThresholdReached({
        ticketId: row.id,
        ticketNo: row.ticketNo,
        companyId: row.companyId,
        subject: row.subject,
        assigneeId: row.assigneeId,
        level,
        usedPercent,
      });

      /*
       * บันทึกว่าเคยยกระดับแล้ว — คอลัมน์นี้ถูกประกาศไว้ตั้งแต่ migration แรก
       * แต่ไม่เคยมีใครเขียนลงไปเลย เขียนเฉพาะครั้งแรก (IS NULL ใน WHERE)
       * เพื่อให้มันตอบคำถาม "เริ่มเร่งเมื่อไร" ไม่ใช่ "เร่งครั้งล่าสุดเมื่อไร"
       */
      await this.db
        .update(ticket)
        .set({ escalationNotifiedAt: now })
        .where(and(eq(ticket.id, row.id), isNull(ticket.escalationNotifiedAt)));
    }

    return sent;
  }

  /**
   * ปิดอัตโนมัติเมื่อผู้แจ้งไม่ยืนยันภายใน 3 วันทำการ
   *
   * ครอบคลุม **ทั้งสองสาย**: `resolved` (เหตุขัดข้องที่แก้แล้ว) และ
   * `fulfilled` (คำขอบริการที่ส่งมอบแล้ว) — ถ้าดูแค่ resolved คำขอบริการ
   * ทุกใบจะค้างอยู่ในสถานะ "ส่งมอบแล้ว" ตลอดกาล เพราะผู้แจ้งส่วนใหญ่ไม่กลับ
   * มากดยืนยัน แล้ว KPI ที่นับจาก closed_at จะไม่มีวันนับใบเหล่านั้นเลย
   *
   * ⚠️ นับ "วันทำการ" ไม่ใช่วันปฏิทิน ด้วยปฏิทินของบริษัทนั้น
   *    งานที่เสร็จบ่ายวันศุกร์ต้องไม่ถูกปิดเช้าวันจันทร์ — ผู้แจ้งยังไม่มีโอกาส
   *    เปิดคอมพิวเตอร์ดูด้วยซ้ำ ใช้ business-time.ts ตัวเดียวกับที่ SLA ใช้
   *
   * ⚠️ ปิดผ่าน TicketEntity ไม่ใช่ UPDATE ตรง
   *    เป็นเหตุผลที่ docstring ของ entity ยกมาเป็นตัวอย่างตั้งแต่บรรทัดแรก:
   *    "กฎอย่าง 'ปิดเรื่องที่ยังไม่ได้แก้ไม่ได้' ต้องเป็นจริงเสมอ ไม่ว่าคำสั่ง
   *    จะมาจาก REST controller หรืองานปิดอัตโนมัติตอนกลางคืน"
   *
   * closed_by เป็น NULL โดยตั้งใจ — schema ระบุว่า "null พร้อมกับ closed_at
   * ไม่ null = ระบบปิดอัตโนมัติ" ซึ่งเป็นวิธีเดียวที่รายงานแยกออกว่าใบไหน
   * ผู้แจ้งยืนยันเอง และใบไหนหมดเวลาไปเฉย ๆ
   */
  private async autoCloseConfirmed(now: Date): Promise<number> {
    const rows = await this.db
      .select({
        id: ticket.id,
        companyId: ticket.companyId,
        priority: ticket.priority,
        status: ticket.status,
        resolvedAt: ticket.resolvedAt,
        pendingStartedAt: ticket.pendingStartedAt,
      })
      .from(ticket)
      .where(
        and(
          inArray(ticket.status, [...AWAITING_CONFIRMATION_STATUSES]),
          isNotNull(ticket.resolvedAt),
          isNull(ticket.deletedAt),
          /*
           * กรองหยาบ ๆ ด้วยวันปฏิทินก่อน แล้วค่อยกรองละเอียดด้วยวันทำการใน JS
           *
           * 3 วันทำการยาวอย่างน้อย 3 วันปฏิทินเสมอ (วันหยุดมีแต่ทำให้ยาวขึ้น)
           * เงื่อนไขนี้จึงตัดแถวที่ยังไม่ถึงแน่ ๆ ออกได้ที่ฐานข้อมูล
           * โดยไม่มีทางตัดแถวที่ถึงแล้วทิ้งไป
           */
          lte(ticket.resolvedAt, new Date(now.getTime() - AUTO_CLOSE_BUSINESS_DAYS * 86_400_000)),
        ),
      )
      .limit(ESCALATION_SCAN_CAP);

    let closed = 0;
    for (const row of rows) {
      if (row.resolvedAt === null) continue;

      const [cal, target] = await Promise.all([
        this.slaConfig.calendarFor(row.companyId),
        this.slaConfig.targetFor(row.companyId, row.priority as Priority),
      ]);

      /*
       * นับด้วยปฏิทินวันทำการเสมอ แม้เรื่องนั้นจะเป็น P1 ที่ SLA นับ 24×7
       *
       * "3 วันทำการให้ผู้แจ้งยืนยัน" เป็นเวลาของ **ผู้แจ้ง** ไม่ใช่เวลาของทีมไอที
       * ผู้แจ้งเป็นพนักงานออฟฟิศที่เข้างานตามเวลาทำการ ไม่ว่าเรื่องจะด่วนแค่ไหน
       * ถ้าใช้ 24×7 กับ P1 เรื่องที่แก้เสร็จคืนวันศุกร์จะถูกปิดก่อนเช้าวันจันทร์
       */
      void target;
      const waited = minutesBetween(row.resolvedAt, now, cal, 'business_hours');
      if (waited < AUTO_CLOSE_BUSINESS_MINUTES) continue;

      const ok = await this.tickets.autoClose({
        ticketId: row.id,
        at: now,
        reason: `ປິດອັດຕະໂນມັດ — ຜູ້ແຈ້ງບໍ່ໄດ້ຢືນຢັນພາຍໃນ ${AUTO_CLOSE_BUSINESS_DAYS} ວັນເຮັດວຽກ`,
      });
      if (ok) closed++;
    }

    if (closed > 0) this.logger.log(`ปิดเรื่องอัตโนมัติ ${closed} เรื่อง`);
    return closed;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
