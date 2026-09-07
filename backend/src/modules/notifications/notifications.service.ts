import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import { NOTIFICATION_CHANNEL } from '../../common/constants';
import { paged, type PagedResult } from '../../common/http/pagination';
import type { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import { notification, notificationChannel, ticket } from '../../db/schema';

export interface NotificationListParams {
  unread_only?: string | undefined;
  page: number;
  page_size: number;
}

/**
 * การแจ้งเตือนของผู้ใช้ที่ล็อกอินอยู่
 *
 * ⚠️ ทุกคิวรีในไฟล์นี้ยึดกับ scope.userId เสมอ ไม่มี endpoint ไหน
 *    รับ user_id จากผู้เรียก — การแจ้งเตือนมีทั้งหัวข้อเรื่องและเนื้อความ
 *    ซึ่งเปิดเผยเนื้อหางานของคนอื่นได้ทั้งหมด ต่างจากข้อมูลหลักตรงที่
 *    ขอบเขตที่ใช้คือ "ตัวบุคคล" ไม่ใช่ "บริษัท"
 *
 * แสดงเฉพาะช่องทาง in_app — แถวของ email/teams/line เป็นบันทึกการส่ง
 * ของงานเบื้องหลัง ไม่ใช่สิ่งที่ควรโผล่ในกระดิ่งแจ้งเตือนบนหน้าจอ
 */
@Injectable()
export class NotificationsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  private mine(scope: AccessScope): SQL {
    return and(
      eq(notification.userId, scope.userId),
      eq(notification.channel, 'in_app'),
    ) as SQL;
  }

  async list(
    scope: AccessScope,
    params: NotificationListParams,
  ): Promise<PagedResult<unknown> & { unread: number }> {
    const parts: SQL[] = [this.mine(scope)];
    if (params.unread_only === 'true') parts.push(isNull(notification.readAt) as SQL);

    const where = and(...parts) as SQL;
    const offset = (params.page - 1) * params.page_size;

    const [rows, totalRow, unreadRow] = await Promise.all([
      this.db
        .select({
          id: notification.id,
          event_type: notification.eventType,
          title: notification.title,
          body: notification.body,
          ticket_id: notification.ticketId,
          ticket_no: ticket.ticketNo,
          status: notification.status,
          read_at: notification.readAt,
          created_at: notification.createdAt,
        })
        .from(notification)
        .leftJoin(ticket, eq(ticket.id, notification.ticketId))
        .where(where)
        .orderBy(desc(notification.createdAt), desc(notification.id))
        .limit(params.page_size)
        .offset(offset),
      this.db.select({ n: count() }).from(notification).where(where),
      // นับที่ยังไม่อ่านจากทั้งหมดเสมอ ไม่ใช่จากหน้าปัจจุบัน
      // ตัวเลขบนกระดิ่งต้องไม่เปลี่ยนตามหน้าที่กำลังเปิดอยู่
      this.db
        .select({ n: count() })
        .from(notification)
        .where(and(this.mine(scope), isNull(notification.readAt)) as SQL),
    ]);

    return {
      ...paged(
        rows.map((r) => ({
          ...r,
          read_at: r.read_at?.toISOString() ?? null,
          created_at: r.created_at.toISOString(),
        })),
        params.page,
        params.page_size,
        totalRow[0]?.n ?? 0,
      ),
      unread: unreadRow[0]?.n ?? 0,
    };
  }

  /**
   * ทำเครื่องหมายว่าอ่านแล้ว
   *
   * เงื่อนไข user_id อยู่ใน WHERE ของ UPDATE เอง ไม่ใช่ตรวจก่อนแล้วค่อยอัปเดต
   * การอ่านมาตรวจแล้วเขียนกลับเปิดช่องให้แก้ของคนอื่นได้ถ้าคิวรีสองอันนี้
   * ถูกแยกกันในอนาคต — ใส่ไว้ในเงื่อนไขเดียวกันปิดช่องนั้นถาวร
   *
   * @returns จำนวนแถวที่เปลี่ยนสถานะจริง (แถวที่อ่านแล้วไม่ถูกนับซ้ำ)
   */
  async markRead(scope: AccessScope, ids: number[]): Promise<{ updated: number }> {
    if (ids.length === 0) return { updated: 0 };

    const rows = await this.db
      .update(notification)
      .set({ readAt: new Date() })
      .where(
        and(
          this.mine(scope),
          inArray(notification.id, ids),
          isNull(notification.readAt),
        ) as SQL,
      )
      .returning({ id: notification.id });

    return { updated: rows.length };
  }

  async markAllRead(scope: AccessScope): Promise<{ updated: number }> {
    const rows = await this.db
      .update(notification)
      .set({ readAt: new Date() })
      .where(and(this.mine(scope), isNull(notification.readAt)) as SQL)
      .returning({ id: notification.id });
    return { updated: rows.length };
  }

  /** ช่องทางที่ผู้ใช้เปิดรับ — หน้าตั้งค่าการแจ้งเตือนใช้ */
  async channels(scope: AccessScope) {
    return this.db
      .select({
        id: notificationChannel.id,
        channel: notificationChannel.channel,
        destination: notificationChannel.destination,
        is_enabled: notificationChannel.isEnabled,
        is_verified: notificationChannel.isVerified,
      })
      .from(notificationChannel)
      .where(eq(notificationChannel.userId, scope.userId))
      .orderBy(notificationChannel.channel);
  }

  /**
   * ตั้งค่าช่องทางรับการแจ้งเตือนของตนเอง
   *
   * ⚠️ is_verified ตั้งจากที่นี่ไม่ได้เด็ดขาด
   *    LINE ต้องผูกบัญชีสำเร็จก่อนจึงส่งได้ ถ้าปล่อยให้ผู้ใช้ติ๊กเองว่า
   *    ยืนยันแล้ว งานส่งแจ้งเตือนจะพยายามส่งไปยังปลายทางที่ไม่มีอยู่จริง
   *    แล้วล้มเหลวเงียบ ๆ ทุกครั้ง — ผู้ใช้จะคิดว่าเปิดรับแจ้งเตือนแล้ว
   *    แต่ไม่เคยได้รับอะไรเลย
   */
  async setChannels(
    scope: AccessScope,
    channels: { channel: string; is_enabled: boolean; destination?: string | null }[],
  ) {
    const allowed = new Set(NOTIFICATION_CHANNEL);

    for (const c of channels) {
      if (!allowed.has(c.channel as (typeof NOTIFICATION_CHANNEL)[number])) continue;

      await this.db
        .insert(notificationChannel)
        .values({
          userId: scope.userId,
          channel: c.channel,
          isEnabled: c.is_enabled,
          destination: c.destination ?? null,
        })
        .onConflictDoUpdate({
          target: [notificationChannel.userId, notificationChannel.channel],
          // อัปเดตเฉพาะสองฟิลด์นี้ — is_verified ไม่อยู่ในรายการโดยตั้งใจ
          set: {
            isEnabled: sql`excluded.is_enabled`,
            destination: sql`excluded.destination`,
            updatedAt: new Date(),
          },
        });
    }

    return this.channels(scope);
  }
}
