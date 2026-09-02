import {
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';

import { DbModule } from '../db/db.module';

/**
 * เวลารอสูงสุดตอนตั้งคิว
 *
 * สั้นโดยตั้งใจ — ถ้า Redis ไม่ตอบใน 5 วินาที ก็ยังไม่ตอบใน 60 วินาทีอยู่ดี
 * และการรอนานเท่ากับหน่วงเวลาบูตของทั้ง API
 */
const QUEUE_SETUP_TIMEOUT_MS = 5_000;
import { SlaScanProcessor, type SlaScanResult } from './sla-scan.processor';
import {
  DEFAULT_JOB_OPTIONS,
  JOB,
  QUEUE,
  queueConnection,
  SLA_SCAN_INTERVAL_MS,
} from './queue.config';

/**
 * ตัวจัดการคิวและ worker
 *
 * ทำไมไม่ใช้ @nestjs/schedule กับ setInterval ธรรมดา
 *   เพราะเมื่อรันหลายอินสแตนซ์ setInterval จะทำงานพร้อมกันทุกเครื่อง
 *   งานกวาด SLA จะรันซ้ำเท่าจำนวนเครื่อง ซึ่งนอกจากเปลืองแล้ว
 *   ยังทำให้การแจ้งเตือนถูกส่งซ้ำหลายรอบไปหาคนเดียวกัน
 *
 *   BullMQ ใช้ repeatable job ที่มีคีย์กำกับใน Redis เครื่องที่สอง
 *   จึงเห็นว่ามีคนตั้งไว้แล้วและไม่ตั้งซ้ำ
 */
@Injectable()
export class SlaQueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('SlaQueue');
  private queue?: Queue;
  private worker?: Worker;

  constructor(private readonly processor: SlaScanProcessor) {}

  async onModuleInit(): Promise<void> {
    if (process.env.JOBS_ENABLED === 'false') {
      this.logger.log('ปิดการทำงานของคิวไว้ด้วย JOBS_ENABLED=false');
      return;
    }

    const connection = queueConnection();

    try {
      this.queue = new Queue(QUEUE.sla, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });

      /*
       * ⚠️ ต้องผูก handler ให้ Queue ด้วย ไม่ใช่แค่ Worker
       *
       * ทั้งคู่เปิด connection ของตัวเองแยกกัน และ EventEmitter ที่ไม่มี
       * handler ของ 'error' จะโยนเป็น unhandled แล้วโปรเซสตาย
       * เจอตอนรันโดยไม่มี Redis — try/catch รอบ new Queue() ไม่ช่วย
       * เพราะการเชื่อมต่อเกิดแบบ async หลังคอนสตรัคเตอร์คืนค่าไปแล้ว
       */
      this.queue.on('error', (error) => this.warnConnection('queue', error));
      this.worker = new Worker(
        QUEUE.sla,
        async (job: Job): Promise<SlaScanResult | undefined> => {
          if (job.name === JOB.scanSla) return this.processor.run();
          this.logger.warn(`ไม่รู้จักงานชื่อ ${job.name}`);
          return undefined;
        },
        {
          connection,
          // งานนี้เขียนฐานข้อมูลเป็นก้อน รันทีละงานพอ
          // ถ้าตั้งสูงกว่านี้ สองรอบจะทับกันตอนฐานข้อมูลช้า แล้วนับซ้ำ
          concurrency: 1,
        },
      );

      this.worker.on('failed', (job, error) => {
        this.logger.error(`งาน ${job?.name ?? 'ไม่ทราบชื่อ'} ล้มเหลว: ${error.message}`);
      });

      this.worker.on('error', (error) => this.warnConnection('worker', error));

      /*
       * ⚠️ ต้องมี timeout — ห้าม await เปล่า ๆ
       *
       * BullMQ เปิด offline queue ไว้ตามค่าเริ่มต้น คำสั่งที่ส่งตอน Redis ล่ม
       * จึงถูกพักไว้รอเชื่อมต่อสำเร็จ "ไม่มีกำหนด" ไม่ล้มเหลวและไม่ timeout เอง
       * ผลคือ onModuleInit ค้าง แล้ว NestJS ก็บูตไม่จบ — ทั้ง API ไม่ขึ้น
       * เพราะงานเบื้องหลังต่อ Redis ไม่ได้ ซึ่งตรงข้ามกับที่ตั้งใจไว้ทุกประการ
       *
       * เจอตอนรันโดยไม่มี Redis: เซิร์ฟเวอร์คอมไพล์ผ่านแต่ไม่เคยตอบคำขอเลย
       */
      await this.withTimeout(
        this.queue.add(
          JOB.scanSla,
          {},
          {
            repeat: { every: SLA_SCAN_INTERVAL_MS },
            // jobId คงที่ทำให้อินสแตนซ์ที่สองไม่ตั้งงานซ้ำ
            jobId: 'repeat-scan-sla',
          },
        ),
        QUEUE_SETUP_TIMEOUT_MS,
      );

      this.logger.log(`ตั้งงานกวาด SLA ทุก ${SLA_SCAN_INTERVAL_MS / 60_000} นาทีแล้ว`);
    } catch (error) {
      /*
       * Redis ไม่พร้อมต้องไม่ทำให้ทั้งแอปบูตไม่ขึ้น
       *
       * API ยังให้บริการได้ครบทุกอย่างโดยไม่มีคิว — สิ่งที่หายไปคือการประเมิน
       * SLA อัตโนมัติและการแจ้งเตือน ซึ่ง /health รายงานเป็น degraded อยู่แล้ว
       * การทำให้ทั้งระบบดับเพราะงานเบื้องหลังต่อไม่ได้ เป็นการแลกที่ไม่คุ้ม
       */
      this.logger.error(
        `ตั้งคิวไม่สำเร็จ ระบบจะทำงานต่อโดยไม่มีการประเมิน SLA อัตโนมัติ: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** ล้มเลิกถ้าไม่เสร็จในเวลาที่กำหนด แทนที่จะรอตลอดไป */
  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`ไม่ตอบสนองภายใน ${ms} มิลลิวินาที`)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * เตือนเรื่องการเชื่อมต่อแบบไม่ให้ท่วม log
   *
   * ioredis ลองเชื่อมต่อใหม่ทุกไม่กี่ร้อยมิลลิวินาที ถ้าเขียนทุกครั้ง
   * log จะเต็มไปด้วยบรรทัดเดิมจนกลบทุกอย่างที่มีประโยชน์
   */
  private lastWarnAt = 0;
  private warnConnection(source: string, error: Error): void {
    const now = Date.now();
    if (now - this.lastWarnAt < 30_000) return;
    this.lastWarnAt = now;
    this.logger.warn(`${source} เชื่อมต่อ Redis ไม่ได้: ${error.message}`);
  }

  /** สั่งรันทันทีโดยไม่รอรอบถัดไป — ใช้ตอนทดสอบและตอนผู้ดูแลกดจากหน้าจอ */
  async runNow(): Promise<SlaScanResult> {
    return this.processor.run();
  }

  async onApplicationShutdown(): Promise<void> {
    // ปิด worker ก่อน queue เพื่อให้งานที่กำลังทำอยู่จบก่อน
    // ถ้าปิดสลับกัน งานที่ค้างจะถูกทิ้งไว้ในสถานะกำลังทำ แล้วไม่มีใครหยิบต่อ
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
  }
}

@Module({
  imports: [DbModule],
  providers: [SlaScanProcessor, SlaQueueService],
  exports: [SlaScanProcessor, SlaQueueService],
})
export class JobsModule {}
