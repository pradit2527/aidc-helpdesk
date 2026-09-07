import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { NotFoundError, ValidationError } from '../../common/errors/domain-error';
import type { Db } from '../client';
import { DB } from '../db.module';
import {
  appUser,
  ticket,
  ticketChecklist,
  ticketChecklistItem,
  ticketComment,
} from '../schema';

/**
 * การเขียนที่ผูกกับรายละเอียดของเรื่อง — คอมเมนต์และรายการตรวจ
 *
 * ⚠️ ทุกเมธอดในไฟล์นี้รับ ticketId ที่ผ่านการตรวจขอบเขตมาแล้ว
 *    ไม่มีเมธอดไหนตรวจซ้ำเอง ผู้เรียกต้องอ่านเรื่องผ่าน
 *    TicketRepository.findById(scope, id) ก่อนเสมอ — เมธอดนั้นตอบ 404
 *    ให้เรื่องที่อยู่นอกขอบเขตอยู่แล้ว
 *
 *    แยกเป็นไฟล์ต่างหากจาก TicketRepository เพราะตัวนั้นดูแลตาราง ticket
 *    ส่วนตัวนี้ดูแลตารางลูก การรวมกันทำให้ไฟล์เดียวรู้จักทุกตารางในโดเมน
 */
@Injectable()
export class TicketWriteRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * เพิ่มคอมเมนต์
   *
   * @param isFirstResponse true เมื่อคอมเมนต์นี้นับเป็นการตอบรับครั้งแรก
   *        ผู้เรียกเป็นคนตัดสิน ไม่ใช่ที่นี่ เพราะเงื่อนไขขึ้นกับบทบาทของผู้เขียน
   *        ซึ่งเป็นเรื่องของชั้น application ไม่ใช่ชั้นฐานข้อมูล
   */
  async addComment(input: {
    ticketId: number;
    authorId: number;
    body: string;
    isInternal: boolean;
    isFirstResponse: boolean;
    now: Date;
  }) {
    const [row] = await this.db
      .insert(ticketComment)
      .values({
        ticketId: input.ticketId,
        authorId: input.authorId,
        body: input.body,
        isInternal: input.isInternal,
        isSystem: false,
      })
      .returning({ id: ticketComment.id, createdAt: ticketComment.createdAt });

    if (input.isFirstResponse) {
      /*
       * เขียนเวลาตอบรับครั้งแรกเฉพาะตอนที่ยังว่างอยู่
       *
       * เงื่อนไข IS NULL อยู่ใน WHERE ของ UPDATE เอง ไม่ใช่ตรวจก่อนแล้วค่อยเขียน
       * เพราะเจ้าหน้าที่สองคนกดส่งคอมเมนต์พร้อมกันได้จริง — ถ้าอ่านมาตรวจ
       * แล้วค่อยเขียน ทั้งคู่จะเห็นว่ายังว่าง แล้วคนที่เขียนทีหลังจะทับ
       * ทำให้ KPI-2 คำนวณจากเวลาที่ช้ากว่าความจริง
       */
      await this.db
        .update(ticket)
        .set({ firstResponseAt: input.now })
        .where(and(eq(ticket.id, input.ticketId), isNull(ticket.firstResponseAt)));
    }

    return row;
  }

  /**
   * ติ๊กรายการตรวจหนึ่งข้อ
   *
   * ⚠️ ข้อที่ evidence_required ต้องมี attachment_id ก่อนจึงติ๊กเสร็จได้
   *    ตรวจที่นี่ด้วยทั้งที่ฐานข้อมูลมี CHECK อยู่แล้ว เพราะ error จาก
   *    CHECK constraint อ่านไม่รู้เรื่องสำหรับผู้ใช้ปลายทาง
   *    (ck_checklist_item_evidence_when_done) — ด่านที่บังคับจริงยังเป็น
   *    ฐานข้อมูล ส่วนที่นี่มีไว้ให้ข้อความบอกได้ว่าต้องทำอะไรต่อ
   */
  async setChecklistItem(input: {
    itemId: number;
    userId: number;
    isDone?: boolean | undefined;
    note?: string | null | undefined;
    attachmentId?: number | null | undefined;
    now: Date;
  }) {
    const [current] = await this.db
      .select({
        id: ticketChecklistItem.id,
        ticketId: ticketChecklist.ticketId,
        evidenceRequired: ticketChecklistItem.evidenceRequired,
        attachmentId: ticketChecklistItem.attachmentId,
        isDone: ticketChecklistItem.isDone,
        titleSnapshot: ticketChecklistItem.titleSnapshot,
      })
      .from(ticketChecklistItem)
      .innerJoin(ticketChecklist, eq(ticketChecklist.id, ticketChecklistItem.ticketChecklistId))
      .where(eq(ticketChecklistItem.id, input.itemId))
      .limit(1);

    if (!current) {
      throw new NotFoundError('CHECKLIST_ITEM_NOT_FOUND', 'ບໍ່ພົບລາຍການກວດທີ່ລະບຸ', {
        id: input.itemId,
      });
    }

    const nextAttachment =
      input.attachmentId !== undefined ? input.attachmentId : current.attachmentId;
    const nextDone = input.isDone !== undefined ? input.isDone : current.isDone;

    if (nextDone && current.evidenceRequired && nextAttachment === null) {
      throw new ValidationError(
        'EVIDENCE_REQUIRED',
        `ຂໍ້ "${current.titleSnapshot}" ຕ້ອງແນບຫຼັກຖານກ່ອນຈຶ່ງຕິກສຳເລັດໄດ້`,
        [{ field: 'attachment_id', message: 'ຕ້ອງແນບຫຼັກຖານ' }],
      );
    }

    await this.db
      .update(ticketChecklistItem)
      .set({
        ...(input.isDone !== undefined
          ? {
              isDone: input.isDone,
              // ติ๊กเสร็จต้องรู้ว่าใครติ๊กและเมื่อไร — เป็นหลักฐานตาม SOP
              // ยกเลิกการติ๊กต้องล้างทั้งคู่ ไม่ใช่ปล่อยค้างไว้
              doneBy: input.isDone ? input.userId : null,
              doneAt: input.isDone ? input.now : null,
            }
          : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.attachmentId !== undefined ? { attachmentId: input.attachmentId } : {}),
      })
      .where(eq(ticketChecklistItem.id, input.itemId));

    /*
     * อัปเดตเวลาที่รายการตรวจทั้งชุดเสร็จ
     *
     * นับจากข้อที่บังคับเท่านั้น — ข้อที่ไม่บังคับค้างอยู่ไม่ควรกัน
     * ไม่ให้ชุดนั้นถือว่าเสร็จ มิฉะนั้นเจ้าหน้าที่จะติ๊กข้อที่ไม่เกี่ยวข้อง
     * ทิ้งไว้เพื่อให้ผ่าน ซึ่งทำให้บันทึกไม่ตรงความจริง
     */
    const [pending] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(ticketChecklistItem)
      .innerJoin(ticketChecklist, eq(ticketChecklist.id, ticketChecklistItem.ticketChecklistId))
      .where(
        and(
          eq(ticketChecklist.ticketId, current.ticketId),
          eq(ticketChecklistItem.isRequired, true),
          eq(ticketChecklistItem.isDone, false),
        ),
      );

    const allRequiredDone = (pending?.n ?? 0) === 0;
    await this.db
      .update(ticketChecklist)
      .set({ completedAt: allRequiredDone ? input.now : null })
      .where(eq(ticketChecklist.ticketId, current.ticketId));

    return { ticketId: current.ticketId, all_required_done: allRequiredDone };
  }

  /** เรื่องที่ข้อนี้สังกัด — ผู้เรียกใช้ตรวจขอบเขตก่อนแก้ */
  async ticketIdOfChecklistItem(itemId: number): Promise<number> {
    const [row] = await this.db
      .select({ ticketId: ticketChecklist.ticketId })
      .from(ticketChecklistItem)
      .innerJoin(ticketChecklist, eq(ticketChecklist.id, ticketChecklistItem.ticketChecklistId))
      .where(eq(ticketChecklistItem.id, itemId))
      .limit(1);

    if (!row) {
      throw new NotFoundError('CHECKLIST_ITEM_NOT_FOUND', 'ບໍ່ພົບລາຍການກວດທີ່ລະບຸ', { id: itemId });
    }
    return row.ticketId;
  }

  /** ผู้เขียนคอมเมนต์ล่าสุดหนึ่งรายการ พร้อมชื่อ — ใช้ตอบกลับหลังบันทึก */
  async commentById(id: number) {
    const [row] = await this.db
      .select({
        id: ticketComment.id,
        body: ticketComment.body,
        is_internal: ticketComment.isInternal,
        is_system: ticketComment.isSystem,
        created_at: ticketComment.createdAt,
        author_id: ticketComment.authorId,
        author_name: appUser.fullName,
      })
      .from(ticketComment)
      .leftJoin(appUser, eq(appUser.id, ticketComment.authorId))
      .where(eq(ticketComment.id, id))
      .limit(1);

    if (!row) throw new NotFoundError('COMMENT_NOT_FOUND', 'ບໍ່ພົບຄຳເຫັນ', { id });

    const { author_id, author_name, ...rest } = row;
    return {
      ...rest,
      author: author_id === null ? null : { id: author_id, full_name: author_name ?? '' },
      created_at: rest.created_at.toISOString(),
    };
  }

  /**
   * ปลดล็อกบัญชี
   *
   * ⚠️ ต้องรีเซ็ต failed_login_count ด้วย ไม่ใช่แค่ปลดธง is_locked
   *    ถ้าล้างแต่ธง ตัวนับยังค้างที่ค่าเดิม แล้วการกรอกผิดครั้งเดียว
   *    หลังจากนั้นจะล็อกซ้ำทันที ผู้ใช้จะเจอวงจร "ปลดแล้วล็อกใหม่"
   *    ที่หาสาเหตุยากมากจากฝั่งผู้ดูแล
   */
  async unlockUser(userId: number): Promise<{ id: number; username: string }> {
    const [row] = await this.db
      .update(appUser)
      .set({ isLocked: false, failedLoginCount: 0 })
      .where(and(eq(appUser.id, userId), isNull(appUser.deletedAt)))
      .returning({ id: appUser.id, username: appUser.username });

    if (!row) throw new NotFoundError('USER_NOT_FOUND', 'ບໍ່ພົບຜູ້ໃຊ້ທີ່ລະບຸ', { id: userId });
    return row;
  }

  /** ข้อที่ยังไม่ติ๊กและบังคับ — ใช้ตรวจก่อนเปลี่ยนสถานะเป็น resolved */
  async pendingRequiredChecklist(ticketId: number): Promise<string[]> {
    const rows = await this.db
      .select({ title: ticketChecklistItem.titleSnapshot })
      .from(ticketChecklistItem)
      .innerJoin(ticketChecklist, eq(ticketChecklist.id, ticketChecklistItem.ticketChecklistId))
      .where(
        and(
          eq(ticketChecklist.ticketId, ticketId),
          eq(ticketChecklistItem.isRequired, true),
          eq(ticketChecklistItem.isDone, false),
        ),
      );
    return rows.map((r) => r.title);
  }
}
