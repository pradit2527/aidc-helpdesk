import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, or } from 'drizzle-orm';

import type { ClockMode, Priority } from '../../common/constants';
import { defaultCalendar, type BusinessCalendar } from '../../common/sla/business-time';
import type { Db } from '../client';
import { DB } from '../db.module';
import { businessHours, holiday, slaPolicy, slaTarget } from '../schema';

export interface ResolvedTarget {
  policyId: number;
  docRef: string | null;
  docVersion: string | null;
  responseMinutes: number;
  resolutionMinutes: number;
  clockMode: ClockMode;
  statusReportIntervalMinutes: number | null;
  escalationPercent: number;
}

/**
 * ค่าตั้งต้นของ SLA ที่ต้องอ่านทุกครั้งที่คำนวณกำหนดเวลา
 *
 * แคชไว้ในหน่วยความจำเพราะสองเหตุผล
 *   1. อ่านบ่อยมาก — ทุกการสร้างและทุกการอ่าน ticket ต้องใช้
 *   2. เปลี่ยนน้อยมาก — ผูกกับเอกสารที่แก้ได้ปีละครั้ง
 *
 * แคชไม่มีวันหมดอายุเอง ต้องเรียก invalidate() หลังแก้ค่าผ่านหน้าผู้ดูแล
 * ตั้งใจให้ชัดแบบนี้แทน TTL เพราะ TTL แปลว่า "ค่าที่แก้แล้วยังผิดอยู่อีกสักพัก"
 * ซึ่งกับ SLA คือคำนวณกำหนดเวลาผิดไปทั้งช่วงนั้น
 */
@Injectable()
export class SlaConfigRepository {
  private calendarCache = new Map<string, BusinessCalendar>();
  private targetCache = new Map<string, ResolvedTarget>();

  constructor(@Inject(DB) private readonly db: Db) {}

  invalidate(): void {
    this.calendarCache.clear();
    this.targetCache.clear();
  }

  /**
   * ปฏิทินเวลาทำการของบริษัทหนึ่ง
   *
   * แถวระดับกลุ่ม (company_id = NULL) เป็นค่าตั้งต้น แถวของบริษัททับได้รายวัน
   * จึงอ่านทั้งสองชุดแล้วให้ของบริษัทชนะ ไม่ใช่เลือกชุดใดชุดหนึ่ง
   */
  async calendarFor(companyId: number): Promise<BusinessCalendar> {
    const key = `c${companyId}`;
    const cached = this.calendarCache.get(key);
    if (cached) return cached;

    const rows = await this.db
      .select()
      .from(businessHours)
      .where(or(isNull(businessHours.companyId), eq(businessHours.companyId, companyId)));

    const cal = defaultCalendar();
    cal.windows.clear();

    // เรียงให้แถวระดับกลุ่มมาก่อน แถวของบริษัทจึงเขียนทับทีหลัง
    const ordered = [...rows].sort((a, b) => (a.companyId === null ? -1 : 1) - (b.companyId === null ? -1 : 1));
    for (const row of ordered) {
      if (!row.isWorkingDay) {
        cal.windows.delete(row.dayOfWeek);
        continue;
      }
      cal.windows.set(row.dayOfWeek, {
        startMinute: toMinuteOfDay(row.startTime),
        endMinute: toMinuteOfDay(row.endTime),
      });
    }

    const holidayRows = await this.db
      .select({ date: holiday.holidayDate })
      .from(holiday)
      .where(or(isNull(holiday.companyId), eq(holiday.companyId, companyId)));
    for (const row of holidayRows) cal.holidays.add(row.date);

    this.calendarCache.set(key, cal);
    return cal;
  }

  /**
   * เป้าหมาย SLA ของระดับความสำคัญหนึ่ง ภายใต้นโยบายที่บริษัทนั้นใช้อยู่
   *
   * เลือกนโยบายของบริษัทก่อน ถ้าไม่มีจึงใช้นโยบายกลางที่ตั้งเป็นค่าเริ่มต้น
   */
  async targetFor(companyId: number, priority: Priority): Promise<ResolvedTarget> {
    const key = `c${companyId}:${priority}`;
    const cached = this.targetCache.get(key);
    if (cached) return cached;

    const rows = await this.db
      .select({
        policyId: slaPolicy.id,
        companyId: slaPolicy.companyId,
        docRef: slaPolicy.docRef,
        docVersion: slaPolicy.docVersion,
        responseMinutes: slaTarget.responseMinutes,
        resolutionMinutes: slaTarget.resolutionMinutes,
        clockMode: slaTarget.clockMode,
        statusReportIntervalMinutes: slaTarget.statusReportIntervalMinutes,
        escalationPercent: slaTarget.escalationPercent,
      })
      .from(slaTarget)
      .innerJoin(slaPolicy, eq(slaPolicy.id, slaTarget.slaPolicyId))
      .where(
        and(
          eq(slaTarget.priority, priority),
          eq(slaPolicy.isActive, true),
          or(isNull(slaPolicy.companyId), eq(slaPolicy.companyId, companyId)),
        ),
      );

    // นโยบายของบริษัทชนะนโยบายกลางเสมอ
    const chosen = rows.find((r) => r.companyId === companyId) ?? rows[0];
    if (!chosen) {
      throw new Error(
        `ไม่พบเป้าหมาย SLA ของระดับ ${priority} สำหรับบริษัท ${companyId} — ยังไม่ได้ seed ตาราง sla_target`,
      );
    }

    const resolved: ResolvedTarget = {
      policyId: chosen.policyId,
      docRef: chosen.docRef,
      docVersion: chosen.docVersion,
      responseMinutes: chosen.responseMinutes,
      resolutionMinutes: chosen.resolutionMinutes,
      clockMode: chosen.clockMode as ClockMode,
      statusReportIntervalMinutes: chosen.statusReportIntervalMinutes,
      escalationPercent: chosen.escalationPercent,
    };
    this.targetCache.set(key, resolved);
    return resolved;
  }
}

/** 'HH:MM:SS' หรือ 'HH:MM' -> นาทีนับจากเที่ยงคืน */
function toMinuteOfDay(value: string): number {
  const [h, m] = value.split(':');
  return Number(h) * 60 + Number(m ?? 0);
}
