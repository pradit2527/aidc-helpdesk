import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { Db } from '../client';
import { DB } from '../db.module';
import {
  appUser,
  approvalRequest,
  ticketChecklist,
  ticketChecklistItem,
  ticketComment,
  ticketStatusHistory,
} from '../schema';

/**
 * ส่วนประกอบของหน้ารายละเอียดเรื่อง — คอมเมนต์ ประวัติ รายการตรวจ การอนุมัติ
 *
 * แยกจาก TicketRepository เพราะตัวนั้นมีหน้าที่เดียวคือบังคับขอบเขตสิทธิ์
 * ของตาราง ticket การเอาคิวรีลูกมารวมจะทำให้ไฟล์นั้นอ่านยากขึ้นโดยไม่จำเป็น
 *
 * ⚠️ ทุกเมท็อดในนี้รับ ticketId ที่ "ผ่านการตรวจขอบเขตมาแล้ว" เท่านั้น
 *    ผู้เรียกต้อง findById ผ่าน TicketRepository ก่อนเสมอ
 *    ถ้าเรียกตรงด้วย id ที่รับจากผู้ใช้ จะข้ามด่านขอบเขตทั้งหมด
 */
@Injectable()
export class TicketDetailRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * คอมเมนต์ของเรื่อง
   *
   * ⚠️ คอมเมนต์ภายในต้องไม่ถูกส่งออกไปหาผู้แจ้ง (US-02 AC-3)
   *    กรองที่ชั้น query ไม่ใช่ซ่อนใน UI — ถ้าส่งไปแล้วซ่อน ผู้ใช้เปิด
   *    เครื่องมือนักพัฒนาก็อ่านได้ทันที และคอมเมนต์ภายในมักมีข้อมูล
   *    ที่ไม่ควรให้ผู้แจ้งเห็น เช่น การประเมินสาเหตุที่ยังไม่ยืนยัน
   */
  async comments(ticketId: number, includeInternal: boolean) {
    const where = includeInternal
      ? eq(ticketComment.ticketId, ticketId)
      : and(eq(ticketComment.ticketId, ticketId), eq(ticketComment.isInternal, false));

    return this.db
      .select({
        id: ticketComment.id,
        body: ticketComment.body,
        isInternal: ticketComment.isInternal,
        isSystem: ticketComment.isSystem,
        createdAt: ticketComment.createdAt,
        authorId: ticketComment.authorId,
        authorName: appUser.fullName,
      })
      .from(ticketComment)
      .leftJoin(appUser, eq(appUser.id, ticketComment.authorId))
      .where(where)
      .orderBy(asc(ticketComment.createdAt));
  }

  /** ประวัติการเปลี่ยนแปลง เรียงจากเก่าไปใหม่ให้อ่านเป็นไทม์ไลน์ได้ */
  async history(ticketId: number) {
    const actor = alias(appUser, 'actor');

    return this.db
      .select({
        id: ticketStatusHistory.id,
        fromStatus: ticketStatusHistory.fromStatus,
        toStatus: ticketStatusHistory.toStatus,
        fromPriority: ticketStatusHistory.fromPriority,
        toPriority: ticketStatusHistory.toPriority,
        reason: ticketStatusHistory.reason,
        changedAt: ticketStatusHistory.changedAt,
        changedBy: ticketStatusHistory.changedBy,
        actorName: actor.fullName,
      })
      .from(ticketStatusHistory)
      .leftJoin(actor, eq(actor.id, ticketStatusHistory.changedBy))
      .where(eq(ticketStatusHistory.ticketId, ticketId))
      .orderBy(asc(ticketStatusHistory.changedAt));
  }

  /**
   * รายการตรวจที่ผูกกับเรื่องนี้
   *
   * เก็บ titleSnapshot ไว้ตอนสร้าง จึงอ่านจากตรงนั้นไม่ใช่ join กลับไปที่แม่แบบ
   * เพราะแม่แบบแก้ได้ภายหลัง แล้วรายการตรวจของเรื่องเก่าจะเปลี่ยนตามไปด้วย
   * ซึ่งทำให้หลักฐานการตรวจสอบย้อนหลังใช้ไม่ได้
   */
  async checklist(ticketId: number) {
    return this.db
      .select({
        id: ticketChecklistItem.id,
        title: ticketChecklistItem.titleSnapshot,
        isRequired: ticketChecklistItem.isRequired,
        evidenceRequired: ticketChecklistItem.evidenceRequired,
        isDone: ticketChecklistItem.isDone,
        doneAt: ticketChecklistItem.doneAt,
        note: ticketChecklistItem.note,
        doneByName: appUser.fullName,
      })
      .from(ticketChecklistItem)
      .innerJoin(ticketChecklist, eq(ticketChecklist.id, ticketChecklistItem.ticketChecklistId))
      .leftJoin(appUser, eq(appUser.id, ticketChecklistItem.doneBy))
      .where(eq(ticketChecklist.ticketId, ticketId))
      .orderBy(asc(ticketChecklistItem.id));
  }

  /** คำขออนุมัติที่ผูกกับเรื่องนี้ เรียงตามลำดับขั้น */
  async approvals(ticketId: number) {
    const approver = alias(appUser, 'approver');
    const decider = alias(appUser, 'decider');

    return this.db
      .select({
        id: approvalRequest.id,
        seq: approvalRequest.seq,
        approverType: approvalRequest.approverType,
        status: approvalRequest.status,
        comment: approvalRequest.comment,
        requestedAt: approvalRequest.requestedAt,
        decidedAt: approvalRequest.decidedAt,
        dueAt: approvalRequest.dueAt,
        approverName: approver.fullName,
        deciderName: decider.fullName,
      })
      .from(approvalRequest)
      .leftJoin(approver, eq(approver.id, approvalRequest.approverId))
      .leftJoin(decider, eq(decider.id, approvalRequest.decidedBy))
      .where(eq(approvalRequest.ticketId, ticketId))
      .orderBy(asc(approvalRequest.seq));
  }
}
