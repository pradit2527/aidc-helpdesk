import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { Db } from '../client';
import { DB } from '../db.module';
import { appUser, company, department, supportChat, supportChatMessage } from '../schema';

export type ChatSide = 'requester' | 'staff';
export type ChatAttachmentKind = 'image' | 'audio' | 'file';

export interface StoredChatAttachment {
  /** path สัมพัทธ์ในที่เก็บไฟล์ — ระบบกำหนดเองทั้งหมด */
  key: string;
  name: string;
  mime: string;
  size: number;
  kind: ChatAttachmentKind;
}

export interface SupportChatRow {
  id: number;
  companyId: number;
  companyCode: string;
  requesterId: number;
  requesterName: string;
  requesterDepartment: string | null;
  requesterJobTitle: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  status: string;
  ticketId: number | null;
  lastMessageAt: Date;
  lastMessageBy: number | null;
  requesterReadAt: Date | null;
  staffReadAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  chatwootConversationId: number | null;
  chatwootContactId: number | null;
  chatwootCursor: number | null;
}

export interface SupportChatMessageRow {
  id: number;
  chatId: number;
  senderId: number | null;
  senderName: string | null;
  /** คนตอบจากฝั่ง Chatwoot ที่ไม่มีบัญชีใน Helpdesk */
  externalSenderName: string | null;
  chatwootMessageId: number | null;
  body: string;
  isSystem: boolean;
  createdAt: Date;
  attachment: StoredChatAttachment | null;
}

export interface LastMessageRow {
  chatId: number;
  body: string;
  senderId: number | null;
  isSystem: boolean;
  attachmentKind: ChatAttachmentKind | null;
  external: boolean;
}

const requester = alias(appUser, 'chat_requester');
const assignee = alias(appUser, 'chat_assignee');

function asKind(value: string | null): ChatAttachmentKind {
  return value === 'image' || value === 'audio' ? value : 'file';
}

function toAttachment(row: {
  attachmentKey: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentSize: number | null;
  attachmentKind: string | null;
}): StoredChatAttachment | null {
  if (!row.attachmentKey || !row.attachmentMime) return null;
  return {
    key: row.attachmentKey,
    name: row.attachmentName ?? 'file',
    mime: row.attachmentMime,
    size: row.attachmentSize ?? 0,
    kind: asKind(row.attachmentKind),
  };
}

const attachmentColumns = {
  attachmentKey: supportChatMessage.attachmentKey,
  attachmentName: supportChatMessage.attachmentName,
  attachmentMime: supportChatMessage.attachmentMime,
  attachmentSize: supportChatMessage.attachmentSize,
  attachmentKind: supportChatMessage.attachmentKind,
};

const messageColumns = {
  id: supportChatMessage.id,
  chatId: supportChatMessage.chatId,
  senderId: supportChatMessage.senderId,
  senderName: appUser.fullName,
  externalSenderName: supportChatMessage.externalSenderName,
  chatwootMessageId: supportChatMessage.chatwootMessageId,
  body: supportChatMessage.body,
  isSystem: supportChatMessage.isSystem,
  createdAt: supportChatMessage.createdAt,
  ...attachmentColumns,
};

type MessageSelectRow = {
  id: number;
  chatId: number;
  senderId: number | null;
  senderName: string | null;
  externalSenderName: string | null;
  chatwootMessageId: number | null;
  body: string;
  isSystem: boolean;
  createdAt: Date;
  attachmentKey: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentSize: number | null;
  attachmentKind: string | null;
};

function toMessageRow(row: MessageSelectRow): SupportChatMessageRow {
  return {
    id: row.id,
    chatId: row.chatId,
    senderId: row.senderId,
    senderName: row.senderName,
    externalSenderName: row.externalSenderName,
    chatwootMessageId: row.chatwootMessageId,
    body: row.body,
    isSystem: row.isSystem,
    createdAt: row.createdAt,
    attachment: toAttachment(row),
  };
}

/**
 * ที่เก็บแชทช่วยเหลือ
 *
 * ⚠️ ไม่ตัดสินสิทธิ์ในชั้นนี้ — คืนแถวตาม id ตรง ๆ ผู้เรียก (service และ gateway)
 *    ต้องตรวจเองว่าผู้ใช้เป็นเจ้าของห้องหรือเป็นทีมไอทีในขอบเขตบริษัทนั้น
 */
@Injectable()
export class SupportChatRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  private selectChat() {
    return this.db
      .select({
        id: supportChat.id,
        companyId: supportChat.companyId,
        companyCode: company.code,
        requesterId: supportChat.requesterId,
        requesterName: requester.fullName,
        requesterDepartment: department.name,
        requesterJobTitle: requester.jobTitle,
        assigneeId: supportChat.assigneeId,
        assigneeName: assignee.fullName,
        status: supportChat.status,
        ticketId: supportChat.ticketId,
        lastMessageAt: supportChat.lastMessageAt,
        lastMessageBy: supportChat.lastMessageBy,
        requesterReadAt: supportChat.requesterReadAt,
        staffReadAt: supportChat.staffReadAt,
        closedAt: supportChat.closedAt,
        createdAt: supportChat.createdAt,
        chatwootConversationId: supportChat.chatwootConversationId,
        chatwootContactId: supportChat.chatwootContactId,
        chatwootCursor: supportChat.chatwootCursor,
      })
      .from(supportChat)
      .innerJoin(company, eq(company.id, supportChat.companyId))
      .innerJoin(requester, eq(requester.id, supportChat.requesterId))
      .leftJoin(department, eq(department.id, requester.departmentId))
      .leftJoin(assignee, eq(assignee.id, supportChat.assigneeId))
      .$dynamic();
  }

  async findById(id: number): Promise<SupportChatRow | null> {
    const [row] = await this.selectChat().where(eq(supportChat.id, id)).limit(1);
    return row ?? null;
  }

  /** ห้องที่ผู้ใช้ควรเห็นเมื่อเปิดแชท — ห้องที่เปิดอยู่ ถ้าไม่มีก็ห้องล่าสุดที่ปิดไปแล้ว */
  async latestOf(requesterId: number): Promise<SupportChatRow | null> {
    const [row] = await this.selectChat()
      .where(eq(supportChat.requesterId, requesterId))
      .orderBy(
        sql`case when ${supportChat.status} = 'open' then 0 else 1 end`,
        desc(supportChat.lastMessageAt),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * ห้องที่เปิดอยู่ของผู้ใช้ ถ้ายังไม่มีให้สร้าง
   *
   * กดส่งสองแท็บพร้อมกันได้ — unique index บางส่วนกันห้องซ้อน แถวที่ชนจะไม่ถูกสร้าง
   * แล้วอ่านห้องที่อีกคำขอเพิ่งสร้างแทน ไม่ต้องล็อกเอง
   */
  async ensureOpen(companyId: number, requesterId: number): Promise<number> {
    const existing = await this.openIdOf(requesterId);
    if (existing !== null) return existing;

    const [created] = await this.db
      .insert(supportChat)
      .values({ companyId, requesterId })
      .onConflictDoNothing()
      .returning({ id: supportChat.id });
    if (created) return created.id;

    const again = await this.openIdOf(requesterId);
    if (again === null) throw new Error('สร้างห้องแชทไม่สำเร็จ');
    return again;
  }

  private async openIdOf(requesterId: number): Promise<number | null> {
    const [row] = await this.db
      .select({ id: supportChat.id })
      .from(supportChat)
      .where(and(eq(supportChat.requesterId, requesterId), eq(supportChat.status, 'open')))
      .limit(1);
    return row?.id ?? null;
  }

  /** เพิ่มข้อความ และเลื่อนเวลาข้อความล่าสุดของห้องในธุรกรรมเดียวกัน */
  async addMessage(input: {
    chatId: number;
    senderId: number | null;
    body: string;
    isSystem?: boolean;
    /** ผู้ส่งอ่านข้อความของตัวเองแล้วโดยปริยาย */
    readSide?: ChatSide;
    attachment?: StoredChatAttachment;
    /** ข้อความที่นำเข้าจาก Chatwoot */
    externalSenderName?: string;
    chatwootMessageId?: number;
  }): Promise<SupportChatMessageRow> {
    const isSystem = input.isSystem ?? false;
    const file = input.attachment;

    return this.db.transaction(async (tx) => {
      const [message] = await tx
        .insert(supportChatMessage)
        .values({
          chatId: input.chatId,
          senderId: input.senderId,
          body: input.body,
          isSystem,
          ...(file
            ? {
                attachmentKey: file.key,
                attachmentName: file.name,
                attachmentMime: file.mime,
                attachmentSize: file.size,
                attachmentKind: file.kind,
              }
            : {}),
          ...(input.externalSenderName !== undefined ? { externalSenderName: input.externalSenderName } : {}),
          ...(input.chatwootMessageId !== undefined ? { chatwootMessageId: input.chatwootMessageId } : {}),
        })
        .returning();
      if (!message) throw new Error('บันทึกข้อความไม่สำเร็จ');

      const at = message.createdAt;
      const patch: Partial<typeof supportChat.$inferInsert> = { lastMessageAt: at };
      /*
       * ข้อความจาก Chatwoot มี sender_id เป็น null — last_message_by จึงเป็น null ด้วย
       * ซึ่งฝั่งผู้ใช้อ่านว่า "อีกฝ่ายตอบล่าสุด" ถูกต้อง (ข้อความระบบไม่แตะค่านี้เลย)
       */
      if (!isSystem) patch.lastMessageBy = input.senderId;
      if (input.readSide === 'requester') patch.requesterReadAt = at;
      if (input.readSide === 'staff') patch.staffReadAt = at;
      await tx.update(supportChat).set(patch).where(eq(supportChat.id, input.chatId));

      let senderName: string | null = null;
      if (input.senderId !== null) {
        const [sender] = await tx
          .select({ fullName: appUser.fullName })
          .from(appUser)
          .where(eq(appUser.id, input.senderId))
          .limit(1);
        senderName = sender?.fullName ?? null;
      }

      return toMessageRow({ ...message, senderName });
    });
  }

  /** ข้อความล่าสุดของห้อง เรียงเก่าไปใหม่ */
  async messages(chatId: number, limit = 300): Promise<SupportChatMessageRow[]> {
    const rows = await this.db
      .select(messageColumns)
      .from(supportChatMessage)
      .leftJoin(appUser, eq(appUser.id, supportChatMessage.senderId))
      .where(eq(supportChatMessage.chatId, chatId))
      .orderBy(desc(supportChatMessage.id))
      .limit(limit);
    return rows.reverse().map(toMessageRow);
  }

  /** ไฟล์ของข้อความหนึ่ง — ต้องอยู่ในห้องที่ระบุด้วย กันการเดา id ข้อความข้ามห้อง */
  async findMessageFile(chatId: number, messageId: number): Promise<StoredChatAttachment | null> {
    const [row] = await this.db
      .select(attachmentColumns)
      .from(supportChatMessage)
      .where(and(eq(supportChatMessage.id, messageId), eq(supportChatMessage.chatId, chatId)))
      .limit(1);
    return row ? toAttachment(row) : null;
  }

  /** @param companyIds null = ทุกบริษัท (super_admin) */
  async inbox(
    companyIds: readonly number[] | null,
    status: 'open' | 'closed',
    limit = 100,
  ): Promise<SupportChatRow[]> {
    const conditions: SQL[] = [eq(supportChat.status, status)];
    if (companyIds !== null) {
      if (companyIds.length === 0) return [];
      conditions.push(inArray(supportChat.companyId, [...companyIds]));
    }
    return this.selectChat()
      .where(and(...conditions))
      .orderBy(desc(supportChat.lastMessageAt))
      .limit(limit);
  }

  async lastMessages(chatIds: readonly number[]): Promise<Map<number, LastMessageRow>> {
    if (chatIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([supportChatMessage.chatId], {
        chatId: supportChatMessage.chatId,
        body: supportChatMessage.body,
        senderId: supportChatMessage.senderId,
        isSystem: supportChatMessage.isSystem,
        attachmentKind: supportChatMessage.attachmentKind,
        externalSenderName: supportChatMessage.externalSenderName,
      })
      .from(supportChatMessage)
      .where(inArray(supportChatMessage.chatId, [...chatIds]))
      .orderBy(supportChatMessage.chatId, desc(supportChatMessage.id));
    return new Map(
      rows.map((row) => [
        row.chatId,
        {
          chatId: row.chatId,
          body: row.body,
          senderId: row.senderId,
          isSystem: row.isSystem,
          attachmentKind: row.attachmentKind ? asKind(row.attachmentKind) : null,
          external: row.externalSenderName !== null,
        },
      ]),
    );
  }

  async markRead(chatId: number, side: ChatSide): Promise<void> {
    const now = new Date();
    await this.db
      .update(supportChat)
      .set(side === 'requester' ? { requesterReadAt: now } : { staffReadAt: now })
      .where(eq(supportChat.id, chatId));
  }

  /** ตั้งผู้รับผิดชอบเฉพาะห้องที่ยังไม่มี — สองคนตอบพร้อมกัน คนแรกได้ห้องไป */
  async assignIfEmpty(chatId: number, staffId: number): Promise<void> {
    await this.db
      .update(supportChat)
      .set({ assigneeId: staffId })
      .where(and(eq(supportChat.id, chatId), isNull(supportChat.assigneeId)));
  }

  /** @returns false ถ้าห้องถูกปิดไปก่อนแล้ว */
  async close(chatId: number, closedBy: number): Promise<boolean> {
    const closed = await this.db
      .update(supportChat)
      .set({ status: 'closed', closedAt: new Date(), closedBy })
      .where(and(eq(supportChat.id, chatId), eq(supportChat.status, 'open')))
      .returning({ id: supportChat.id });
    return closed.length > 0;
  }

  // ── ซิงก์กับ Chatwoot ────────────────────────────────────────────────

  /** ข้อมูลที่ใช้สร้าง contact ใน Chatwoot */
  async requesterIdentity(
    userId: number,
  ): Promise<{ username: string; fullName: string; email: string | null } | null> {
    const [row] = await this.db
      .select({ username: appUser.username, fullName: appUser.fullName, email: appUser.email })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);
    return row ?? null;
  }

  /** ข้อความของคนใน Helpdesk ที่ยังไม่ถูกส่งไป Chatwoot — เรียงตามลำดับที่เกิด */
  async pendingOutbound(chatId: number, limit = 50): Promise<SupportChatMessageRow[]> {
    const rows = await this.db
      .select(messageColumns)
      .from(supportChatMessage)
      .leftJoin(appUser, eq(appUser.id, supportChatMessage.senderId))
      .where(
        and(
          eq(supportChatMessage.chatId, chatId),
          isNull(supportChatMessage.chatwootMessageId),
          eq(supportChatMessage.isSystem, false),
          isNull(supportChatMessage.externalSenderName),
        ),
      )
      .orderBy(supportChatMessage.id)
      .limit(limit);
    return rows.map(toMessageRow);
  }

  async markPushed(messageId: number, chatwootMessageId: number): Promise<void> {
    await this.db
      .update(supportChatMessage)
      .set({ chatwootMessageId })
      .where(eq(supportChatMessage.id, messageId));
  }

  async hasChatwootMessage(chatwootMessageId: number): Promise<boolean> {
    const [row] = await this.db
      .select({ id: supportChatMessage.id })
      .from(supportChatMessage)
      .where(eq(supportChatMessage.chatwootMessageId, chatwootMessageId))
      .limit(1);
    return row !== undefined;
  }

  async linkChatwoot(chatId: number, conversationId: number, contactId: number): Promise<void> {
    await this.db
      .update(supportChat)
      .set({ chatwootConversationId: conversationId, chatwootContactId: contactId })
      .where(eq(supportChat.id, chatId));
  }

  /** เลื่อน cursor ไปข้างหน้าเท่านั้น — ไม่ถอยกลับแม้ได้ id เก่ากว่ามา */
  async advanceCursor(chatId: number, cursor: number): Promise<void> {
    await this.db
      .update(supportChat)
      .set({ chatwootCursor: sql`greatest(coalesce(${supportChat.chatwootCursor}, 0), ${cursor})` })
      .where(eq(supportChat.id, chatId));
  }

  /**
   * ห้องที่ต้องซิงก์ในรอบนี้ — ห้องที่เปิดอยู่และผูกกับ Chatwoot แล้ว
   * หรือยังไม่ผูกแต่มีข้อความค้างส่งภายใน 24 ชั่วโมง (เผื่อ Chatwoot ล่มชั่วคราว)
   */
  async syncTargets(limit = 200): Promise<number[]> {
    const rows = await this.db
      .select({ id: supportChat.id })
      .from(supportChat)
      .where(
        and(
          eq(supportChat.status, 'open'),
          or(
            isNotNull(supportChat.chatwootConversationId),
            sql`exists (
              select 1 from ${supportChatMessage} m
               where m.chat_id = ${supportChat.id}
                 and m.chatwoot_message_id is null
                 and m.is_system = false
                 and m.external_sender_name is null
                 and m.created_at > now() - interval '1 day'
            )`,
          ),
        ),
      )
      .orderBy(desc(supportChat.lastMessageAt))
      .limit(limit);
    return rows.map((row) => row.id);
  }
}
