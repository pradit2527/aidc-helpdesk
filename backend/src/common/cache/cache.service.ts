import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

import { REDIS } from '../redis/redis.module';

/**
 * cache-aside สำหรับข้อมูลหลักที่อ่านบ่อยแต่เปลี่ยนน้อย
 *
 * กติกาที่ยึดทั้งไฟล์: **cache ล่มต้องไม่ทำให้คำขอล้ม**
 * ทุกการอ่านและเขียนถูกครอบด้วย try/catch แล้วถอยไปอ่านฐานข้อมูลแทน
 * ระบบจึงช้าลงเมื่อ Redis ล่ม ไม่ใช่ดับ
 *
 * ⚠️ ห้ามใช้กับข้อมูลที่ขึ้นกับสิทธิ์ของผู้เรียก
 *    ถ้า cache ผลลัพธ์ที่กรองตามขอบเขตบริษัทไว้ แล้วคนละบริษัทมาอ่านคีย์เดียวกัน
 *    จะได้ข้อมูลของบริษัทอื่นไปเลย ซึ่งเป็นความผิดพลาดที่หน้าตาปกติทุกฟิลด์
 *    ใช้ได้เฉพาะข้อมูลที่เหมือนกันสำหรับทุกคน เช่น หมวดหมู่ นโยบาย SLA ปฏิทิน
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger('Cache');

  /** นับไว้เพื่อให้ /health บอกได้ว่า cache ทำงานจริงหรือถอยไปอ่าน DB ตลอด */
  private hits = 0;
  private misses = 0;
  private errors = 0;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /**
   * อ่านจาก cache ถ้าไม่มีให้เรียก loader แล้วเก็บผลไว้
   *
   * ไม่ทำ single-flight (กันคำขอพร้อมกันหลายตัวยิง loader ซ้ำ) โดยตั้งใจ —
   * ข้อมูลหลักชุดนี้เล็กและอ่านเร็ว การยิงซ้ำสองสามครั้งตอน cache หมดอายุ
   * ถูกกว่าความซับซ้อนของการล็อกข้ามโปรเซส
   * ถ้าวันหนึ่งมีคิวรีหนักที่ต้อง cache ค่อยเพิ่มเฉพาะจุดนั้น
   */
  async remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;

    const fresh = await loader();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  /** คืน undefined ทั้งกรณีไม่มีในแคชและกรณีอ่านแคชไม่ได้ — ผู้เรียกปฏิบัติเหมือนกัน */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) {
        this.misses += 1;
        return undefined;
      }
      this.hits += 1;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.errors += 1;
      this.warnOnce(error);
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.errors += 1;
      this.warnOnce(error);
    }
  }

  /**
   * ลบคีย์ทิ้งเมื่อข้อมูลต้นทางเปลี่ยน
   *
   * ล้างทันทีที่แก้ ไม่รอ TTL หมดเอง — ผู้ดูแลระบบที่แก้หมวดหมู่แล้วรีเฟรช
   * ต้องเห็นผลทันที ถ้าต้องรอ 10 นาทีเขาจะคิดว่าการแก้ไม่สำเร็จแล้วกดซ้ำ
   */
  async forget(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (error) {
      this.errors += 1;
      this.warnOnce(error);
    }
  }

  /**
   * ล้างทุกคีย์ที่ขึ้นต้นด้วย prefix
   *
   * ใช้ SCAN ไม่ใช่ KEYS — KEYS บล็อก Redis ทั้งตัวจนกว่าจะไล่ครบทุกคีย์
   * ซึ่งบนฐานที่มีคีย์เป็นแสน แปลว่าทุกคำขอในระบบค้างรอพร้อมกัน
   */
  async forgetByPrefix(prefix: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
        cursor = next;
        if (keys.length > 0) await this.redis.del(...keys);
      } while (cursor !== '0');
    } catch (error) {
      this.errors += 1;
      this.warnOnce(error);
    }
  }

  stats(): { hits: number; misses: number; errors: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      errors: this.errors,
      hitRate: total === 0 ? 0 : Math.round((this.hits / total) * 100) / 100,
    };
  }

  /**
   * เตือนแค่ครั้งแรกของแต่ละช่วง
   *
   * ถ้า Redis ล่ม ทุกคำขอจะเข้าทางนี้ — log ที่เขียนทุกครั้งจะกลบ log อื่นทั้งหมด
   * จนหาสาเหตุจริงไม่เจอ ซึ่งแย่กว่าไม่มี log เลย
   */
  private lastWarnAt = 0;
  private warnOnce(error: unknown): void {
    const now = Date.now();
    if (now - this.lastWarnAt < 30_000) return;
    this.lastWarnAt = now;
    this.logger.warn(
      `ใช้แคชไม่ได้ ถอยไปอ่านฐานข้อมูลแทน: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * คีย์ของแคชทั้งระบบ รวมไว้ที่เดียว
 *
 * ถ้าปล่อยให้แต่ละที่ประกอบคีย์เอง วันหนึ่งจะมีคนเขียนคีย์ไม่ตรงกับตอนล้าง
 * แล้วได้ข้อมูลเก่าค้างอยู่โดยไม่มีอะไรฟ้อง
 */
export const CACHE_KEY = {
  categoryTree: (companyId: number) => `aidc:cat:tree:${companyId}`,
  categoryPrefix: 'aidc:cat:',
  companyList: () => 'aidc:company:list',
  slaPolicy: (companyId: number, priority: string) => `aidc:sla:${companyId}:${priority}`,
  slaPrefix: 'aidc:sla:',
} as const;

/**
 * อายุแคช
 *
 * ตั้งยาวได้เพราะทุกจุดล้างแคชทันทีที่ข้อมูลต้นทางเปลี่ยน
 * TTL จึงเป็นแค่ตาข่ายกันข้อมูลค้างกรณีที่การล้างพลาด ไม่ใช่กลไกหลัก
 */
export const CACHE_TTL = {
  masterData: 3600,
  slaConfig: 1800,
} as const;
