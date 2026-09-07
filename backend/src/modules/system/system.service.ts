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

  /**
   * ความพร้อมใช้งานจริง — ตรวจของที่ "มีอยู่" ไม่ใช่ของที่ "ตั้งใจจะมี"
   *
   * ทุกข้อในนี้เคยเป็นสาเหตุที่ทำให้ระบบทำงานผิดแบบเงียบ ๆ มาแล้ว เช่น
   * ตาราง holiday ที่ว่างทำให้เครื่องคำนวณ SLA นับวันหยุดเป็นวันทำการ
   * แล้วคืนกำหนดเวลาที่เร็วกว่าความจริง โดยไม่มี error ให้เห็นเลย
   *
   * ⚠️ ห้ามให้ข้อไหนคืน 'ok' จากค่าคงที่ในโค้ด ทุกข้อต้องนับจากฐานข้อมูลจริง
   *    รายการตรวจที่บอกว่าพร้อมทั้งที่ยังไม่พร้อม แย่กว่าไม่มีรายการตรวจ
   */
  async readiness(): Promise<{
    ready: boolean;
    blocking_count: number;
    checks: {
      key: string;
      label: string;
      status: 'ok' | 'warn' | 'blocked';
      detail: string;
      /** ข้อค้างที่ต้องให้องค์กรตอบ อ้างอิงตาม docs/02-data-model.md */
      ref: string | null;
    }[];
  }> {
    const [row] = await this.db.execute<{
      holidays: number;
      contacts: number;
      critical_services: number;
      sla_policies: number;
      business_hours: number;
      admins: number;
      catalog_items: number;
      published_kb: number;
    }>(sql`
      select
        (select count(*)::int from holiday)                                    as holidays,
        (select count(*)::int from escalation_contact where is_active)         as contacts,
        (select count(*)::int from service
           where is_active and service_tier = 'critical')                      as critical_services,
        (select count(*)::int from sla_policy where is_active)                 as sla_policies,
        (select count(*)::int from business_hours)                             as business_hours,
        (select count(*)::int from app_user
           where is_admin_account and is_active and deleted_at is null)        as admins,
        (select count(*)::int from service_catalog_item where is_active)       as catalog_items,
        (select count(*)::int from kb_article where status = 'published')      as published_kb
    `);

    const n = {
      holidays: row?.holidays ?? 0,
      contacts: row?.contacts ?? 0,
      criticalServices: row?.critical_services ?? 0,
      slaPolicies: row?.sla_policies ?? 0,
      businessHours: row?.business_hours ?? 0,
      admins: row?.admins ?? 0,
      catalogItems: row?.catalog_items ?? 0,
      publishedKb: row?.published_kb ?? 0,
    };

    const checks: Awaited<ReturnType<SystemService['readiness']>>['checks'] = [
      {
        key: 'business_hours',
        label: 'เวลาทำการ',
        status: n.businessHours > 0 ? 'ok' : 'blocked',
        detail:
          n.businessHours > 0
            ? `กำหนดไว้ ${n.businessHours} รายการ`
            : 'ยังไม่มีเวลาทำการ — เครื่องคำนวณ SLA หากำหนดเวลาไม่ได้เลย',
        ref: null,
      },
      {
        key: 'sla_policy',
        label: 'นโยบาย SLA',
        status: n.slaPolicies > 0 ? 'ok' : 'blocked',
        detail:
          n.slaPolicies > 0
            ? `ใช้งานอยู่ ${n.slaPolicies} นโยบาย`
            : 'ยังไม่มีนโยบาย SLA ที่เปิดใช้ — ticket ใหม่จะไม่มีกำหนดเวลา',
        ref: null,
      },
      {
        key: 'holiday_calendar',
        label: 'ปฏิทินวันหยุด',
        status: n.holidays > 0 ? 'ok' : 'blocked',
        detail:
          n.holidays > 0
            ? `มีวันหยุด ${n.holidays} วันในระบบ`
            : 'ตารางว่าง — เครื่องคำนวณ SLA นับวันหยุดราชการเป็นวันทำการ ' +
              'ทำให้กำหนดเวลาที่คืนเร็วกว่าความจริงโดยไม่มี error',
        ref: 'Q-03',
      },
      {
        key: 'escalation_contacts',
        label: 'ผู้รับการยกระดับ',
        status: n.contacts > 0 ? 'ok' : 'blocked',
        detail:
          n.contacts > 0
            ? `กำหนดไว้ ${n.contacts} รายการ`
            : 'ยังไม่มีผู้รับ — กฎยกระดับจะทำงานแล้วไม่มีใครได้รับแจ้ง ' +
              'ซึ่งเป็นความล้มเหลวแบบเงียบ',
        ref: 'Q-07',
      },
      {
        key: 'service_registry',
        label: 'ทะเบียนระบบงานระดับ critical',
        status: n.criticalServices > 0 ? 'ok' : 'warn',
        detail:
          n.criticalServices > 0
            ? `มี ${n.criticalServices} ระบบ`
            : 'ยังไม่มีระบบงานระดับ critical — คำนวณ KPI-6 Uptime ไม่ได้ ' +
              'และ SOP-03 ไม่มีผู้อนุมัติขั้นที่ 2',
        ref: 'Q-05',
      },
      {
        key: 'admin_account',
        label: 'บัญชีผู้ดูแล',
        status: n.admins >= 2 ? 'ok' : n.admins === 1 ? 'warn' : 'blocked',
        detail:
          n.admins >= 2
            ? `มี ${n.admins} บัญชี`
            : n.admins === 1
              ? 'มีบัญชีผู้ดูแลเพียงบัญชีเดียว — ถ้าบัญชีนี้เข้าไม่ได้ ' +
                'จะไม่มีใครแก้ไขการตั้งค่าระบบได้เลย'
              : 'ไม่มีบัญชีผู้ดูแลที่ใช้งานได้',
        ref: null,
      },
      {
        key: 'service_catalog',
        label: 'แคตตาล็อกบริการ',
        status: n.catalogItems > 0 ? 'ok' : 'warn',
        detail:
          n.catalogItems > 0
            ? `มี ${n.catalogItems} รายการ`
            : 'ยังไม่มีรายการบริการ — ผู้ใช้แจ้งคำขอบริการไม่ได้',
        ref: null,
      },
      {
        key: 'knowledge_base',
        label: 'คลังความรู้',
        status: n.publishedKb > 0 ? 'ok' : 'warn',
        detail:
          n.publishedKb > 0
            ? `เผยแพร่แล้ว ${n.publishedKb} บทความ`
            : 'ยังไม่มีบทความที่เผยแพร่ — ผู้ใช้ช่วยเหลือตัวเองไม่ได้',
        ref: null,
      },
      {
        key: 'backup',
        label: 'การสำรองข้อมูลนอกสถานที่',
        // อ่านจากตัวแปรสภาพแวดล้อมจริง ไม่ใช่ค่าคงที่ — วันที่ตั้งค่าเสร็จ
        // ข้อนี้ต้องเปลี่ยนเป็น ok เองโดยไม่ต้องแก้โค้ด
        status: process.env.BACKUP_DESTINATION ? 'ok' : 'blocked',
        detail: process.env.BACKUP_DESTINATION
          ? 'ตั้งค่าปลายทางสำรองข้อมูลแล้ว'
          : 'ยังไม่ได้ตั้ง BACKUP_DESTINATION — ข้อมูลทั้งหมดอยู่ที่เดียว',
        ref: null,
      },
    ];

    const blocking = checks.filter((c) => c.status === 'blocked');
    return {
      ready: blocking.length === 0,
      blocking_count: blocking.length,
      checks,
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
