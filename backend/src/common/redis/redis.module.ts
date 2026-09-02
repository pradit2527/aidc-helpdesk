import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS_CLIENT');

/**
 * สร้าง client ตัวเดียวใช้ร่วมกันทั้งแอป
 *
 * ⚠️ ห้ามใช้ client ตัวนี้กับ BullMQ — BullMQ ต้องการ connection ที่
 *    maxRetriesPerRequest เป็น null เพราะมันบล็อกรอคิวนานกว่า timeout ปกติ
 *    ถ้าใช้ร่วมกัน worker จะหลุดเป็นระยะโดยไม่มีสาเหตุที่ชัดเจน
 *    งานคิวจึงสร้าง connection ของตัวเองแยกต่างหาก
 */
function createRedis(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const logger = new Logger('Redis');

  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    // ไม่เข้าคิวคำสั่งไว้ตอนหลุดการเชื่อมต่อ — ให้มันล้มทันทีแล้วไปอ่านฐานข้อมูลแทน
    // ดีกว่าค้างรอจนคำขอ timeout ทั้งที่มีทางสำรองอยู่
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  });

  // ไม่ผูก handler ไว้ ioredis จะโยน unhandled 'error' แล้วโปรเซสตาย
  // ทั้งที่ Redis ล่มควรทำให้ระบบช้าลง ไม่ใช่ดับ
  client.on('error', (error: Error) => {
    logger.warn(`เชื่อมต่อ Redis ไม่ได้: ${error.message}`);
  });
  client.on('ready', () => logger.log('เชื่อมต่อ Redis แล้ว'));

  return client;
}

@Global()
@Module({
  providers: [{ provide: REDIS, useFactory: createRedis }],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    // ปิดให้เรียบร้อย มิฉะนั้นเทสต์จะค้างเพราะ event loop ยังไม่ว่าง
    // และเซิร์ฟเวอร์ Redis จะเห็น connection ค้างจนกว่าจะ timeout เอง
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
