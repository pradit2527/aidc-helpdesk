import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, isNull, sql } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import { appUser, kbArticle, ticket } from '../../db/schema';

export interface SystemInfo {
  app: {
    version: string;
    environment: string;
    timezone: string;
    uptime_seconds: number;
  };
  database: {
    version: string;
    size_mb: number;
    table_count: number;
  };
  counts: {
    users: number;
    tickets: number;
    open_tickets: number;
    kb_articles: number;
  };
  backup: {
    /** ยังไม่มีระบบสำรองข้อมูล — บอกตรง ๆ ดีกว่าแสดงเวลาปลอม */
    configured: boolean;
    last_run_at: string | null;
  };
}

/** สถานะที่ถือว่ายังเปิดอยู่ ต้องตรงกับที่ SlaScanProcessor ใช้ */
const OPEN_STATUSES = ['new', 'assigned', 'in_progress', 'pending_user'] as const;

/**
 * ข้อมูลภาพรวมของระบบสำหรับผู้ดูแล
 *
 * ตัวเลขทุกตัวนับจากฐานข้อมูลจริงตอนเรียก ไม่ได้เก็บค่าไว้ล่วงหน้า
 * เพราะหน้านี้ถูกเปิดนาน ๆ ครั้ง การนับสดจึงถูกกว่าการดูแลตัวนับให้ตรง
 *
 * ⚠️ ไม่แสดงข้อมูลที่ยังไม่มีจริง เช่น เวลาสำรองข้อมูลล่าสุด
 *    ตัวเลขปลอมในหน้าผู้ดูแลอันตรายกว่าไม่มีตัวเลข เพราะทำให้คนเชื่อว่า
 *    มีการสำรองข้อมูลอยู่ แล้วไม่ไปตั้งค่าจริงจนวันที่ต้องใช้
 */
@Injectable()
export class SystemService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async info(): Promise<SystemInfo> {
    const [dbMeta, counts] = await Promise.all([this.databaseMeta(), this.counts()]);

    return {
      app: {
        version: process.env.npm_package_version ?? '0.1.0',
        environment: process.env.NODE_ENV ?? 'development',
        timezone: process.env.TZ ?? 'Asia/Vientiane',
        uptime_seconds: Math.floor(process.uptime()),
      },
      database: dbMeta,
      counts,
      backup: {
        // ยังไม่ได้ตั้งค่าการสำรองข้อมูลนอกสถานที่ (ข้อค้างในเอกสาร deploy)
        configured: false,
        last_run_at: null,
      },
    };
  }

  private async databaseMeta(): Promise<SystemInfo['database']> {
    const [row] = await this.db.execute<{
      version: string;
      size_bytes: string;
      table_count: number;
    }>(sql`
      select
        current_setting('server_version') as version,
        pg_database_size(current_database())::text as size_bytes,
        (select count(*)::int from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE') as table_count
    `);

    return {
      version: `PostgreSQL ${row?.version ?? '?'}`,
      // แปลงเป็น MB ทศนิยมหนึ่งตำแหน่ง — หน่วยไบต์อ่านไม่รู้เรื่องบนหน้าจอ
      size_mb: Math.round((Number(row?.size_bytes ?? 0) / 1_048_576) * 10) / 10,
      table_count: row?.table_count ?? 0,
    };
  }

  private async counts(): Promise<SystemInfo['counts']> {
    const [users, tickets, open, kb] = await Promise.all([
      this.db.select({ n: count() }).from(appUser).where(isNull(appUser.deletedAt)),
      this.db.select({ n: count() }).from(ticket).where(isNull(ticket.deletedAt)),
      this.db
        .select({ n: count() })
        .from(ticket)
        .where(
          and(isNull(ticket.deletedAt), sql`${ticket.status} in ${OPEN_STATUSES}`),
        ),
      this.db.select({ n: count() }).from(kbArticle).where(eq(kbArticle.status, 'published')),
    ]);

    return {
      users: users[0]?.n ?? 0,
      tickets: tickets[0]?.n ?? 0,
      open_tickets: open[0]?.n ?? 0,
      kb_articles: kb[0]?.n ?? 0,
    };
  }
}
