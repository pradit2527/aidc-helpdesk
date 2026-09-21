import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { Db } from '../client';
import { DB } from '../db.token';
import {
  appUser,
  company,
  department,
  supportChat,
  supportChatMessage,
  supportProject,
} from '../schema';

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
  /** null = ห้องจาก widget ที่ยังไม่ได้ผูกกับบัญชีใน Helpdesk */
  requesterId: number | null;
  requesterName: string | null;
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
  /** null ทั้งที่ปิดแล้ว = Chatwoot เป็นฝ่ายปิดมา ไม่ใช่คนใน Helpdesk */
  closedBy: number | null;
  createdAt: Date;
  chatwootConversationId: number | null;
  chatwootContactId: number | null;
  chatwootCursor: number | null;

  // ── AIDC Support Hub ──
  origin: string;
  projectId: number | null;
  projectCode: string | null;
  projectName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactIdentifier: string | null;
  contactVerified: boolean;
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
  /** ผู้เข้าชมเว็บเป็นคนพิมพ์ — ไม่ใช่ข้อความระบบ และไม่ใช่คำตอบของเจ้าหน้าที่ */
  fromContact: boolean;
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
  fromContact: boolean;
}

/** ตัวตนของผู้เข้าชมเท่าที่ Chatwoot รู้ — ทุกช่องว่างได้ */
export interface WidgetContact {
  name: string | null;
  email: string | null;
  phone: string | null;
  identifier: string | null;
  /** Chatwoot ยืนยันด้วย HMAC แล้ว — เงื่อนไขเดียวที่ยอมให้จับคู่กับบัญชีใน Helpdesk */
  verified: boolean;
}

/** ค่าที่ตัวค้นพบใช้สร้างหรืออัปเดตห้องของบทสนทนาหนึ่ง */
export interface WidgetChatUpsert {
  conversationId: number;
  contactId: number | null;
  projectId: number;
  companyId: number;
  contact: WidgetContact;
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
  fromContact: supportChatMessage.fromContact,
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
  fromContact: boolean;
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
    fromContact: row.fromContact,
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
        closedBy: supportChat.closedBy,
        createdAt: supportChat.createdAt,
        chatwootConversationId: supportChat.chatwootConversationId,
        chatwootContactId: supportChat.chatwootContactId,
        chatwootCursor: supportChat.chatwootCursor,
        origin: supportChat.origin,
        projectId: supportChat.projectId,
        projectCode: supportProject.code,
        projectName: supportProject.name,
        contactName: supportChat.contactName,
        contactEmail: supportChat.contactEmail,
        contactPhone: supportChat.contactPhone,
        contactIdentifier: supportChat.contactIdentifier,
        contactVerified: supportChat.contactVerified,
      })
      .from(supportChat)
      .innerJoin(company, eq(company.id, supportChat.companyId))
      /*
       * ⚠️ ต้องเป็น leftJoin ไม่ใช่ innerJoin
       *    ห้องจาก widget ไม่มี requester_id — innerJoin จะทำให้มันหายไปจาก
       *    ทุกคิวรีในไฟล์นี้เงียบ ๆ รวมถึงกล่องแชทและตัวซิงก์ แล้วข้อความของ
       *    ผู้เข้าชมจะถูกนำเข้าซ้ำทุกรอบเพราะไม่มีใครเลื่อน cursor ให้
       */
      .leftJoin(requester, eq(requester.id, supportChat.requesterId))
      .leftJoin(department, eq(department.id, requester.departmentId))
      .leftJoin(assignee, eq(assignee.id, supportChat.assigneeId))
      .leftJoin(supportProject, eq(supportProject.id, supportChat.projectId))
      .$dynamic();
  }

  async findById(id: number): Promise<SupportChatRow | null> {
    const [row] = await this.selectChat().where(eq(supportChat.id, id)).limit(1);
    return row ?? null;
  }

  /**
   * ห้องที่ผู้ใช้ควรเห็นเมื่อเปิดแชท — ห้องที่เปิดอยู่ ถ้าไม่มีก็ห้องล่าสุดที่ปิดไปแล้ว
   *
   * ⚠️ เฉพาะห้องที่เขาเปิดเองใน Helpdesk (origin = 'helpdesk')
   *    ห้องจาก widget ที่ถูกจับคู่กับบัญชีเขาไม่ใช่ "แชทของฉัน" — มันคือบทสนทนา
   *    ที่เขาเริ่มจากเว็บอื่น ซึ่งตอบกลับผ่าน Chatwoot เท่านั้น การเอามาแสดง
   *    ในกล่องแชทส่วนตัวจะทำให้เขาพิมพ์ตอบในทางที่ระบบส่งออกไปไม่ได้
   */
  async latestOf(requesterId: number): Promise<SupportChatRow | null> {
    const [row] = await this.selectChat()
      .where(and(eq(supportChat.requesterId, requesterId), eq(supportChat.origin, 'helpdesk')))
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
    if (again !== null) return again;

    /*
     * ไม่มีห้อง Helpdesk ที่เปิดอยู่ แต่แถวใหม่ถูกปฏิเสธ = ห้องจาก widget
     * ที่ถูกจับคู่กับบัญชีคนนี้กำลังถือสิทธิ์ "หนึ่งห้องที่เปิด" อยู่
     *
     * ปลดการจับคู่นั้นแล้วสร้างห้องของเขาแทน — การกดแชทใน Helpdesk คือการกระทำ
     * ที่ผู้ใช้ตั้งใจและยืนยันตัวตนแล้ว ส่วนการจับคู่จากอีเมลเป็นการ "อนุมาน"
     * ของที่อนุมานต้องยอมให้ของที่ยืนยันแล้วเสมอ และห้ามเอาสองห้องมารวมกัน
     * (ห้อง widget ยังอยู่ครบพร้อมข้อมูลผู้ติดต่อ แค่ไม่ผูกกับบัญชีอีกต่อไป)
     */
    await this.db
      .update(supportChat)
      .set({ requesterId: null })
      .where(
        and(
          eq(supportChat.requesterId, requesterId),
          eq(supportChat.status, 'open'),
          eq(supportChat.origin, 'widget'),
        ),
      );

    const [retried] = await this.db
      .insert(supportChat)
      .values({ companyId, requesterId })
      .onConflictDoNothing()
      .returning({ id: supportChat.id });
    if (retried) return retried.id;

    const last = await this.openIdOf(requesterId);
    if (last === null) throw new Error('สร้างห้องแชทไม่สำเร็จ');
    return last;
  }

  private async openIdOf(requesterId: number): Promise<number | null> {
    const [row] = await this.db
      .select({ id: supportChat.id })
      .from(supportChat)
      .where(
        and(
          eq(supportChat.requesterId, requesterId),
          eq(supportChat.status, 'open'),
          eq(supportChat.origin, 'helpdesk'),
        ),
      )
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
    /** ผู้เข้าชมเว็บเป็นคนพิมพ์ (ห้องจาก widget เท่านั้น) */
    fromContact?: boolean;
  }): Promise<SupportChatMessageRow> {
    const isSystem = input.isSystem ?? false;
    const fromContact = input.fromContact ?? false;
    const file = input.attachment;

    return this.db.transaction(async (tx) => {
      const [message] = await tx
        .insert(supportChatMessage)
        .values({
          chatId: input.chatId,
          senderId: input.senderId,
          body: input.body,
          isSystem,
          fromContact,
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

  /**
   * @param companyIds null = ทุกบริษัท (super_admin)
   * @param filter ตัวกรองเพิ่มเติมจากกล่องแชท — ไม่ส่ง = ทุกโครงการและทุกทาง
   */
  async inbox(
    companyIds: readonly number[] | null,
    status: 'open' | 'closed',
    filter: { projectId?: number; origin?: string } = {},
    limit = 100,
  ): Promise<SupportChatRow[]> {
    const conditions: SQL[] = [eq(supportChat.status, status)];
    if (companyIds !== null) {
      if (companyIds.length === 0) return [];
      conditions.push(inArray(supportChat.companyId, [...companyIds]));
    }
    if (filter.projectId !== undefined) {
      conditions.push(eq(supportChat.projectId, filter.projectId));
    }
    if (filter.origin !== undefined) conditions.push(eq(supportChat.origin, filter.origin));
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
        fromContact: supportChatMessage.fromContact,
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
          fromContact: row.fromContact,
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

  /**
   * ผูกห้องเข้ากับเรื่องที่เพิ่งสร้างจากห้องนี้
   *
   * เขียนเฉพาะห้องที่ยังไม่มีเรื่องผูกอยู่ (`ticket_id IS NULL`) — สองแท็บที่กด
   * "สร้างเรื่อง" พร้อมกันจะมีคนเดียวที่ผูกสำเร็จ อีกคนได้ false แล้วผู้เรียก
   * ตอบ 409 CHAT_ALREADY_LINKED ให้ ไม่ใช่เขียนทับจนเรื่องแรกกลายเป็นเรื่องกำพร้า
   *
   * @returns false เมื่อห้องนี้ถูกผูกกับเรื่องอื่นไปก่อนแล้ว
   */
  async linkTicket(chatId: number, ticketId: number): Promise<boolean> {
    const linked = await this.db
      .update(supportChat)
      .set({ ticketId })
      .where(and(eq(supportChat.id, chatId), isNull(supportChat.ticketId)))
      .returning({ id: supportChat.id });
    return linked.length > 0;
  }

  /**
   * ห้องที่ผูกกับเรื่องนี้ — ใช้ตอนเรื่องเปลี่ยนสถานะแล้วต้องบอกผู้ถามในแชท
   *
   * หนึ่งเรื่องผูกกับห้องได้มากกว่าหนึ่งห้องในทางทฤษฎี (ไม่มี unique index บน ticket_id)
   * แต่เส้นทางเดียวที่เขียนค่านี้คือ linkTicket ซึ่งผูกห้องละครั้ง
   * เลือกห้องล่าสุดไว้ก่อนเพื่อให้พฤติกรรมแน่นอน ไม่ขึ้นกับลำดับที่ฐานข้อมูลคืนมา
   */
  async findByTicketId(ticketId: number): Promise<SupportChatRow | null> {
    const [row] = await this.selectChat()
      .where(eq(supportChat.ticketId, ticketId))
      .orderBy(desc(supportChat.id))
      .limit(1);
    return row ?? null;
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

  /**
   * ข้อความของคนใน Helpdesk ที่ยังไม่ถูกส่งไป Chatwoot — เรียงตามลำดับที่เกิด
   *
   * @param options.includeSystem เอาข้อความของระบบมาด้วย (ห้องจาก widget ที่ยังเปิดอยู่)
   *        ค่าเริ่มต้นเป็น false เพื่อให้เส้นทางของแชทภายใน (inbox ชนิด API)
   *        ได้ชุดข้อความเท่าเดิมทุกประการ — ผู้เรียกฝั่ง widget เป็นคนเปิดเอง
   *        แล้วให้ isPushableToVisitor ตัดสินรายข้อความอีกชั้น
   */
  async pendingOutbound(
    chatId: number,
    options: { includeSystem?: boolean; limit?: number } = {},
  ): Promise<SupportChatMessageRow[]> {
    const rows = await this.db
      .select(messageColumns)
      .from(supportChatMessage)
      .leftJoin(appUser, eq(appUser.id, supportChatMessage.senderId))
      .where(
        and(
          eq(supportChatMessage.chatId, chatId),
          isNull(supportChatMessage.chatwootMessageId),
          ...(options.includeSystem ? [] : [eq(supportChatMessage.isSystem, false)]),
          isNull(supportChatMessage.externalSenderName),
          // ข้อความของผู้เข้าชมมาจาก Chatwoot อยู่แล้ว ส่งกลับไปเท่ากับพูดซ้ำให้เขาฟัง
          eq(supportChatMessage.fromContact, false),
        ),
      )
      .orderBy(supportChatMessage.id)
      .limit(options.limit ?? 50);
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
   *
   * ⚠️ เฉพาะห้องที่เปิดจากใน Helpdesk — ห้องจาก widget มีรอบของตัวเอง
   *    (ตัวค้นพบทุก CHATWOOT_WIDGET_POLL_MS) ถ้าเอามารวมรอบเดียวกัน ห้องจาก widget
   *    จะถูกยิงถี่กว่าที่ตั้งใจ และเส้นทางของแชทภายในจะเปลี่ยนพฤติกรรมไปด้วย
   */
  async syncTargets(limit = 200): Promise<number[]> {
    const rows = await this.db
      .select({ id: supportChat.id })
      .from(supportChat)
      .where(
        and(
          eq(supportChat.status, 'open'),
          eq(supportChat.origin, 'helpdesk'),
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

  // ── AIDC Support Hub: ห้องที่มาจาก widget ────────────────────────────

  async findByConversationId(conversationId: number): Promise<SupportChatRow | null> {
    const [row] = await this.selectChat()
      .where(eq(supportChat.chatwootConversationId, conversationId))
      .limit(1);
    return row ?? null;
  }

  /**
   * สร้างห้องของบทสนทนาหนึ่ง ถ้ายังไม่มี แล้วอัปเดตข้อมูลผู้ติดต่อให้เป็นปัจจุบัน
   *
   * ใช้ ON CONFLICT บน uq_support_chat_chatwoot_conversation — สองรอบที่วิ่งชนกัน
   * (รอบดึงเป็นระยะกับ webhook ที่มาถึงพร้อมกัน) จึงไม่สร้างห้องซ้ำให้คนเดียวกัน
   *
   * ⚠️ ไม่แตะ status ของห้องที่มีอยู่แล้วเลย — การเปิดใหม่หรือปิดตาม Chatwoot
   *    เป็นหน้าที่ของตัวซิงก์ ซึ่งต้องเขียนข้อความระบบกำกับไว้ด้วยเสมอ
   *
   * @returns id ของห้อง สถานะปัจจุบัน และบอกว่าเพิ่งถูกสร้างในรอบนี้หรือไม่
   *          (คืนสถานะมาด้วยเพื่อไม่ต้องอ่านแถวซ้ำอีกรอบ — ทุกคิวรีบนฐานข้อมูล dev ราว 250 ms)
   */
  async upsertWidgetChat(
    input: WidgetChatUpsert,
  ): Promise<{ id: number; created: boolean; status: string }> {
    const contactFields = {
      contactName: input.contact.name,
      contactEmail: input.contact.email,
      contactPhone: input.contact.phone,
      contactIdentifier: input.contact.identifier,
      contactVerified: input.contact.verified,
    };

    const [row] = await this.db
      .insert(supportChat)
      .values({
        companyId: input.companyId,
        requesterId: null,
        projectId: input.projectId,
        origin: 'widget',
        chatwootConversationId: input.conversationId,
        chatwootContactId: input.contactId,
        ...contactFields,
      })
      .onConflictDoUpdate({
        target: supportChat.chatwootConversationId,
        /*
         * ⚠️ uq_support_chat_chatwoot_conversation เป็นดัชนี unique **บางส่วน**
         *    Postgres จะจับคู่ ON CONFLICT กับดัชนีแบบนั้นได้ก็ต่อเมื่อเขียนเงื่อนไข
         *    เดียวกันกำกับไว้ด้วย ไม่งั้นได้ error "there is no unique or exclusion
         *    constraint matching the ON CONFLICT specification" ทุกครั้งที่ upsert
         */
        targetWhere: sql`chatwoot_conversation_id is not null`,
        set: {
          ...contactFields,
          projectId: sql`excluded.project_id`,
          chatwootContactId: sql`coalesce(excluded.chatwoot_contact_id, ${supportChat.chatwootContactId})`,
        },
      })
      .returning({
        id: supportChat.id,
        createdAt: supportChat.createdAt,
        status: supportChat.status,
      });

    if (!row) {
      const existing = await this.findByConversationId(input.conversationId);
      if (!existing) throw new Error('สร้างห้องแชทจาก widget ไม่สำเร็จ');
      return { id: existing.id, created: false, status: existing.status };
    }

    // แถวที่เพิ่งถูกสร้างมี created_at เป็นเวลาปัจจุบัน — ใช้ตัดสินว่าต้องประกาศห้องใหม่ไหม
    return {
      id: row.id,
      created: Date.now() - row.createdAt.getTime() < 5_000,
      status: row.status,
    };
  }

  /** ปิดห้องตามที่ Chatwoot บอก — ไม่มีคนใน Helpdesk เป็นผู้ปิด closed_by จึงเป็น null */
  async closeFromChatwoot(chatId: number): Promise<boolean> {
    const closed = await this.db
      .update(supportChat)
      .set({ status: 'closed', closedAt: new Date(), closedBy: null })
      .where(and(eq(supportChat.id, chatId), eq(supportChat.status, 'open')))
      .returning({ id: supportChat.id });
    return closed.length > 0;
  }

  /**
   * เปิดห้องที่ปิดไปแล้วกลับมา — ผู้เข้าชมพิมพ์มาใหม่ในบทสนทนาเดิม
   *
   * ต้องเปิดห้องเดิม ไม่ใช่สร้างห้องใหม่ เพราะหนึ่งบทสนทนาใน Chatwoot ผูกกับ
   * ห้องเดียวเสมอ (uq_support_chat_chatwoot_conversation) และประวัติที่คุยกันไว้
   * ต้องอยู่ต่อเนื่องกัน ไม่ใช่ถูกตัดครึ่งทุกครั้งที่ปิดแล้วกลับมาคุยใหม่
   */
  async reopen(chatId: number): Promise<boolean> {
    const reopened = await this.db
      .update(supportChat)
      .set({ status: 'open', closedAt: null, closedBy: null })
      .where(and(eq(supportChat.id, chatId), eq(supportChat.status, 'closed')))
      .returning({ id: supportChat.id });
    return reopened.length > 0;
  }

  /**
   * หาบัญชีที่ใช้งานอยู่จากอีเมล (ไม่สนตัวพิมพ์เล็กใหญ่)
   *
   * ⚠️ ผู้เรียกต้องตรวจมาก่อนแล้วว่า Chatwoot ยืนยันตัวตนด้วย HMAC
   *    อีเมลที่ผู้เข้าชมพิมพ์เองในฟอร์มก่อนแชท **ห้าม** เข้ามาถึงฟังก์ชันนี้
   *
   * @returns null เมื่อไม่เจอ หรือเจอมากกว่าหนึ่งคน (คลุมเครือ = ไม่จับคู่)
   */
  async findActiveUserByEmail(
    email: string,
  ): Promise<{ id: number; hasOpenChat: boolean } | null> {
    const rows = await this.db
      .select({ id: appUser.id })
      .from(appUser)
      .where(
        and(
          sql`lower(${appUser.email}) = ${email.trim().toLowerCase()}`,
          eq(appUser.isActive, true),
          isNull(appUser.deletedAt),
        ),
      )
      .limit(2);
    if (rows.length !== 1) return null;

    const userId = rows[0]!.id;
    const [open] = await this.db
      .select({ id: supportChat.id })
      .from(supportChat)
      .where(and(eq(supportChat.requesterId, userId), eq(supportChat.status, 'open')))
      .limit(1);
    return { id: userId, hasOpenChat: open !== undefined };
  }

  /**
   * ผูกห้องจาก widget เข้ากับบัญชีใน Helpdesk
   *
   * เขียนเฉพาะห้องที่ยังไม่มีเจ้าของ และปล่อยให้ดัชนี uq_support_chat_open_requester
   * เป็นด่านสุดท้าย — ถ้าคนนั้นเพิ่งเปิดห้องอื่นระหว่างที่เราตรวจกับที่เราเขียน
   * ฐานข้อมูลจะปฏิเสธเอง แล้วเราปล่อยห้องนี้ไว้แบบไม่ผูก ซึ่งถูกต้องกว่าการรวมห้อง
   *
   * @returns false เมื่อผูกไม่สำเร็จ (มีห้องอื่นที่เปิดอยู่แล้ว)
   */
  async linkRequester(chatId: number, userId: number): Promise<boolean> {
    try {
      const linked = await this.db
        .update(supportChat)
        .set({ requesterId: userId })
        .where(
          and(
            eq(supportChat.id, chatId),
            isNull(supportChat.requesterId),
            eq(supportChat.origin, 'widget'),
          ),
        )
        .returning({ id: supportChat.id });
      return linked.length > 0;
    } catch {
      return false;
    }
  }
}
