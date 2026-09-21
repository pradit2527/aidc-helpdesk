import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';

import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import {
  appUser,
  notification,
  permission,
  role,
  rolePermission,
  userRole,
  userRoleScope,
} from '../../db/schema';

/**
 * ชนิดของเหตุการณ์ที่สร้างการแจ้งเตือนได้
 *
 * เป็นค่าคงที่เพราะมันเป็นส่วนหนึ่งของคีย์กันซ้ำ (uq_notification_dedup) —
 * พิมพ์ผิดหนึ่งตัวอักษรแปลว่าการกันซ้ำของเหตุการณ์นั้นหยุดทำงานเงียบ ๆ
 * แล้วผู้รับจะได้ข้อความเดิมทุก 5 นาทีตามรอบงานกวาด
 */
export const NOTIFICATION_EVENT = {
  /** เหตุร้ายแรง P1 — ส่งทันทีแม้นอกเวลาทำการ (SLA 6.2 / ES-01) */
  majorIncident: 'major_incident',
  /** ใช้เวลาไปแล้ว 80% ของเป้าหมาย ยังไม่เสร็จ (ES-02) */
  slaAtRisk: 'sla_at_risk',
  /** เลยกำหนดแก้ไขแล้ว */
  slaBreached: 'sla_breached',
  /** มีคำขอรออนุมัติอยู่ในคิวของคุณ */
  approvalPending: 'approval_pending',
} as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENT)[keyof typeof NOTIFICATION_EVENT];

export interface NotificationDraft {
  userIds: readonly number[];
  ticketId: number;
  eventType: NotificationEvent;
  title: string;
  body: string;
}

/**
 * ตัวสร้างการแจ้งเตือน — ฝั่ง "เขียน" ของ notification
 *
 * NotificationsService ที่มีอยู่เดิมเป็นฝั่งอ่านล้วน (list / markRead / channels)
 * ไม่มีอะไรในระบบเคยเขียนแถวลงตารางนี้เลย ทั้งที่ตาราง ดัชนีกันซ้ำ และ REST
 * ของฝั่งอ่านถูกเตรียมไว้ครบมาตั้งแต่ migration แรก — ไฟล์นี้คือชิ้นที่หายไป
 *
 * ── ขอบเขตของเฟสนี้: in_app อย่างเดียว ──
 *
 * ไม่มี email เพราะโปรเจกต์ยังไม่มี transport ใด ๆ (ไม่มี nodemailer ใน
 * package.json) การเพิ่มเข้ามาพร้อมงานนี้แปลว่าต้องตัดสินใจเรื่อง SMTP,
 * เทมเพลต, การลองใหม่เมื่อส่งไม่ผ่าน และการกันอีเมลหลุดออกนอกองค์กร
 * ซึ่งเป็นงานคนละก้อนและมีความเสี่ยงคนละแบบ
 *
 * แถวที่เขียนที่นี่มี status = 'pending' ตามค่าตั้งต้นของคอลัมน์ ซึ่งอ่านตรงตัวว่า
 * "ยังไม่ถูกส่งออกทางช่องทางภายนอก" — กระดิ่งในแอปอ่านแถวได้ทันทีอยู่แล้ว
 * เพราะ NotificationsService.list กรองแค่ channel = 'in_app'
 */
@Injectable()
export class NotificationProducer {
  private readonly logger = new Logger('NotificationProducer');

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * เขียนการแจ้งเตือนในแอปให้ผู้รับหลายคนพร้อมกัน
   *
   * ⚠️ onConflictDoNothing ไม่ใช่ทางลัด — มันคือกลไกกันซ้ำหลัก
   *    uq_notification_dedup คุม (user, ticket, event, channel, วันตามเวลาเวียงจันทน์)
   *    งานกวาด SLA รันทุก 5 นาที ถ้าไม่มีด่านนี้ เรื่องที่เกินกำหนดหนึ่งใบ
   *    จะยิงข้อความใส่หัวหน้าไอที 288 ครั้งต่อวัน แล้วไม่มีใครอ่านกระดิ่งอีกเลย
   *
   * ⚠️ ไม่โยน error ออกไป
   *    ทุกจุดที่เรียกตัวนี้ทำงานหลักสำเร็จไปแล้ว (เรื่องถูกบันทึก สถานะถูกเปลี่ยน)
   *    การแจ้งเตือนที่ล้มต้องไม่ทำให้คำสั่งที่สำเร็จแล้วดูเหมือนล้ม
   *
   * @returns จำนวนแถวที่เขียนจริง — น้อยกว่าจำนวนผู้รับได้ ถ้าบางคนได้ไปแล้ววันนี้
   */
  async notify(draft: NotificationDraft): Promise<number> {
    const userIds = [...new Set(draft.userIds)].filter((id) => Number.isInteger(id) && id > 0);
    if (userIds.length === 0) return 0;

    try {
      const rows = await this.db
        .insert(notification)
        .values(
          userIds.map((userId) => ({
            userId,
            ticketId: draft.ticketId,
            eventType: draft.eventType,
            channel: 'in_app' as const,
            // คอลัมน์กว้าง 255 — ตัดที่นี่ ดีกว่าปล่อยให้ทั้ง insert ล้มทั้งก้อน
            title: draft.title.slice(0, 255),
            body: draft.body,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: notification.id });

      return rows.length;
    } catch (error) {
      this.logger.error(
        `เขียนการแจ้งเตือน ${draft.eventType} ของเรื่อง #${draft.ticketId} ไม่สำเร็จ: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  /**
   * ผู้ที่ถือสิทธิ์นี้อยู่ และบริษัทนั้นอยู่ในขอบเขตของเขา
   *
   * ใช้ permission code ไม่ใช่ชื่อบทบาท ด้วยเหตุผลเดียวกับ
   * TicketRepository.ticketWorkers — หน้าจัดการสิทธิ์แก้ได้ว่าบทบาทไหนถืออะไร
   * ถ้าผูกกับชื่อบทบาท การแก้สิทธิ์จากหน้าจอจะไม่มีผลกับว่าใครได้รับแจ้ง
   *
   * ⚠️ ขอบเขตบริษัทต้องตรวจด้วย ไม่ใช่ส่งให้ทุกคนที่ถือสิทธิ์
   *    ผู้ดูแลของบริษัท ก. ไม่ควรได้รับแจ้งเหตุร้ายแรงของบริษัท ข. —
   *    หัวข้อการแจ้งเตือนมีเลขที่เรื่องและหัวข้อปัญหาติดไปด้วย ซึ่งเป็น
   *    ข้อมูลข้ามบริษัทที่เขาเปิดดูในระบบไม่ได้อยู่แล้ว
   *
   * กติกาขอบเขตเดียวกับ AccessScope: มีแถว user_role_scope ใช้ตามนั้น
   * ไม่มีเลยใช้บริษัทต้นสังกัด
   */
  async usersWithPermission(companyId: number, permissionCode: string): Promise<number[]> {
    const now = new Date();
    const activeRole = or(isNull(userRole.expiresAt), gt(userRole.expiresAt, now));

    const holderRoleIds = this.db
      .select({ roleId: rolePermission.roleId })
      .from(rolePermission)
      .innerJoin(permission, eq(permission.id, rolePermission.permissionId))
      .where(eq(permission.code, permissionCode));

    const candidates = await this.db
      .select({ id: appUser.id, homeCompanyId: appUser.companyId })
      .from(appUser)
      .innerJoin(userRole, eq(userRole.userId, appUser.id))
      .innerJoin(role, eq(role.id, userRole.roleId))
      .where(
        and(
          eq(appUser.isActive, true),
          isNull(appUser.deletedAt),
          activeRole,
          inArray(role.id, holderRoleIds),
        ),
      );

    if (candidates.length === 0) return [];

    const ids = [...new Set(candidates.map((c) => c.id))];

    /*
     * ขอบเขตรายบริษัทของทุกคนในรายการ — คิวรีเดียว ไม่ใช่คนละคิวรี
     *
     * อ่าน "ทุกแถวขอบเขต" ไม่ใช่เฉพาะแถวของบริษัทนี้ เพราะต้องแยกสองกรณีให้ออก
     *   มีแถวขอบเขตแต่ไม่มีบริษัทนี้ → เห็นไม่ได้
     *   ไม่มีแถวขอบเขตเลย          → ถอยไปใช้บริษัทต้นสังกัด
     * ถ้ากรอง companyId ตั้งแต่ใน SQL สองกรณีนี้จะหน้าตาเหมือนกันทุกประการ
     * (ไม่มีแถวกลับมา) แล้วผู้ดูแลที่มีขอบเขตชัดเจนจะถูกนับว่า "ไม่มีขอบเขต"
     * แล้วได้รับแจ้งเรื่องของบริษัทที่เขาเปิดดูไม่ได้ — กติกาเดียวกับ ScopeService
     */
    const scopeRows = await this.db
      .select({ userId: userRole.userId, companyId: userRoleScope.companyId })
      .from(userRoleScope)
      .innerJoin(userRole, eq(userRole.id, userRoleScope.userRoleId))
      .where(and(inArray(userRole.userId, ids), activeRole));

    const scopedCompanies = new Map<number, Set<number>>();
    for (const row of scopeRows) {
      const set = scopedCompanies.get(row.userId);
      if (set) set.add(row.companyId);
      else scopedCompanies.set(row.userId, new Set([row.companyId]));
    }

    const recipients = new Set<number>();
    for (const c of candidates) {
      const scoped = scopedCompanies.get(c.id);
      const visible = scoped ? scoped.has(companyId) : c.homeCompanyId === companyId;
      if (visible) recipients.add(c.id);
    }

    return [...recipients];
  }
}
