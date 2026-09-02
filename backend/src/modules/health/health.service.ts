import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type Redis from 'ioredis';

import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import { REDIS } from '../../common/redis/redis.module';

export type ComponentStatus = 'ok' | 'degraded' | 'down';

export interface HealthReport {
  status: ComponentStatus;
  version: string;
  checked_at: string;
  components: {
    database: { status: ComponentStatus; latency_ms: number | null; detail?: string };
    redis: { status: ComponentStatus; latency_ms: number | null; detail?: string };
    sla_scan: { status: ComponentStatus; last_run_at: string | null; detail?: string };
  };
}

/** เกินเวลานี้ถือว่าองค์ประกอบนั้นตอบช้าผิดปกติ แม้จะยังตอบอยู่ */
const SLOW_MS = 1_000;
/** งาน scan_sla ควรรันทุก 5 นาที ปล่อยให้พลาดได้ราว 3 รอบก่อนเตือน */
const SLA_SCAN_STALE_MS = 15 * 60 * 1_000;

/**
 * ตรวจสุขภาพจริง ไม่ใช่ตอบ ok ค้างไว้
 *
 * ค่าคงที่ที่ตอบ ok ตลอดเวลาแย่กว่าไม่มี health check เลย เพราะมันทำให้
 * ทีมเชื่อว่าระบบปกติในขณะที่ฐานข้อมูลล่มไปแล้ว และ load balancer ก็ยังส่ง
 * ผู้ใช้เข้ามาเจอหน้า error ต่อไปเรื่อย ๆ
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger('Health');

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async report(): Promise<HealthReport> {
    // ตรวจพร้อมกัน ไม่ใช่ทีละอย่าง — ถ้าเรียงกันแล้วอันแรกช้า 3 วินาที
    // health check จะ timeout ก่อนได้รู้ว่าอันที่สองก็ล่มอยู่เหมือนกัน
    const [database, redis, slaScan] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkSlaScan(),
    ]);

    return {
      status: this.worst([database.status, redis.status, slaScan.status]),
      version: process.env.npm_package_version ?? '0.1.0',
      checked_at: new Date().toISOString(),
      components: { database, redis, sla_scan: slaScan },
    };
  }

  /** พร้อมรับ traffic หรือยัง — ฐานข้อมูลล่มเมื่อไรถือว่าไม่พร้อมทันที */
  async isReady(): Promise<boolean> {
    const database = await this.checkDatabase();
    return database.status === 'ok' || database.status === 'degraded';
  }

  private async checkDatabase(): Promise<HealthReport['components']['database']> {
    const startedAt = process.hrtime.bigint();
    try {
      await this.db.execute(sql`select 1`);
      const latency = this.elapsedMs(startedAt);
      return {
        status: latency > SLOW_MS ? 'degraded' : 'ok',
        latency_ms: latency,
        ...(latency > SLOW_MS ? { detail: 'ฐานข้อมูลตอบช้ากว่าปกติ' } : {}),
      };
    } catch (error) {
      this.logger.error(`ฐานข้อมูลไม่ตอบสนอง: ${this.messageOf(error)}`);
      // ไม่ส่งข้อความจริงจากฐานข้อมูลออกไป เพราะมันบอก host และชื่อฐานข้อมูล
      return { status: 'down', latency_ms: null, detail: 'เชื่อมต่อฐานข้อมูลไม่ได้' };
    }
  }

  private async checkRedis(): Promise<HealthReport['components']['redis']> {
    const startedAt = process.hrtime.bigint();
    try {
      await this.redis.ping();
      const latency = this.elapsedMs(startedAt);
      return {
        status: latency > SLOW_MS ? 'degraded' : 'ok',
        latency_ms: latency,
      };
    } catch (error) {
      this.logger.warn(`Redis ไม่ตอบสนอง: ${this.messageOf(error)}`);
      /*
       * Redis ล่ม = degraded ไม่ใช่ down โดยตั้งใจ
       * cache หายทำให้ช้าลง แต่ทุกอย่างยังอ่านจากฐานข้อมูลได้
       * ถ้าตอบ down แล้ว load balancer ถอดเครื่องออก ระบบจะดับทั้งที่ยังใช้ได้
       */
      return { status: 'degraded', latency_ms: null, detail: 'Redis ไม่ตอบสนอง ระบบทำงานต่อได้แต่ช้าลง' };
    }
  }

  /**
   * งานประเมิน SLA รันล่าสุดเมื่อไร
   *
   * ตรวจข้อนี้เพราะเป็นความล้มเหลวแบบ "เงียบ" ที่อันตรายที่สุดในระบบนี้ —
   * ถ้า scheduler ตายไป ทุก endpoint ยังตอบ 200 หน้าเว็บยังเปิดได้ปกติ
   * แต่ SLA จะไม่ถูกประเมินและไม่มีการแจ้งเตือนใครเลย
   * กว่าจะรู้ตัวคือตอนลูกค้าถามว่าทำไมไม่มีใครรับเรื่อง
   */
  private async checkSlaScan(): Promise<HealthReport['components']['sla_scan']> {
    try {
      const raw = await this.redis.get('aidc:job:scan_sla:last_run_at');
      if (!raw) {
        return {
          status: 'degraded',
          last_run_at: null,
          detail: 'ยังไม่เคยมีบันทึกว่างานประเมิน SLA รัน',
        };
      }

      const lastRun = new Date(raw);
      const age = Date.now() - lastRun.getTime();
      if (Number.isNaN(age)) {
        return { status: 'degraded', last_run_at: null, detail: 'ค่าเวลาที่บันทึกไว้อ่านไม่ได้' };
      }

      return age > SLA_SCAN_STALE_MS
        ? {
            status: 'degraded',
            last_run_at: lastRun.toISOString(),
            detail: `งานประเมิน SLA ไม่ได้รันมา ${Math.round(age / 60_000)} นาที`,
          }
        : { status: 'ok', last_run_at: lastRun.toISOString() };
    } catch {
      // อ่านค่าไม่ได้เพราะ Redis ล่ม ซึ่ง checkRedis รายงานไปแล้ว
      return { status: 'degraded', last_run_at: null, detail: 'ตรวจสถานะงานประเมิน SLA ไม่ได้' };
    }
  }

  private worst(statuses: ComponentStatus[]): ComponentStatus {
    if (statuses.includes('down')) return 'down';
    if (statuses.includes('degraded')) return 'degraded';
    return 'ok';
  }

  private elapsedMs(startedAt: bigint): number {
    return Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
