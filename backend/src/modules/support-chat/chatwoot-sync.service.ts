import fs from 'node:fs/promises';

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import {
  SupportChatRepository,
  type StoredChatAttachment,
  type SupportChatMessageRow,
  type SupportChatRow,
} from '../../db/repositories/support-chat.repository';
import {
  SupportProjectRepository,
  type SupportProjectSyncTarget,
} from '../../db/repositories/support-project.repository';
import { chatwootRequest } from '../../integrations/chatwoot/chatwoot-api';
import { readChatwootSyncConfig } from '../../integrations/chatwoot/chatwoot-sync.config';
import { readChatwootWidgetConfig } from '../../integrations/chatwoot/chatwoot-widget.config';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { chatFilePath, writeChatFile } from './chat-file-store';
import { CHAT_MAX_FILE_BYTES, detectChatFile } from './chat-file-type';
import {
  classifyMessage,
  isImportable,
  isWithinWindow,
  requesterLinkDecision,
  shouldCloseFromChatwoot,
  shouldReopen,
  toWidgetContact,
  visitorName,
  widgetCompanyId,
  type ChatwootConversation,
  type ChatwootWidgetMessage,
} from './chatwoot-widget';
import { toMessageDto } from './support-chat.mapper';

/** ข้อความจาก Chatwoot Application API — เก็บเฉพาะฟิลด์ที่ใช้ */
interface ChatwootMessage {
  id: number;
  content: string | null;
  /** API ส่งเป็นตัวเลข (0 incoming · 1 outgoing · 2 activity · 3 template) */
  message_type: number | string;
  content_type?: string | null;
  private?: boolean | null;
  sender?: { name?: string | null } | null;
  attachments?: { data_url?: string | null }[] | null;
}

interface ChatwootContactRef {
  id: number;
  identifier?: string | null;
  email?: string | null;
}

const OUTGOING = new Set<number | string>([1, 'outgoing']);

/**
 * บทสนทนาที่เงียบเกินเท่านี้ไม่ถูกไล่ในรอบค้นหา
 *
 * ผู้เข้าชมที่หายไปเกินเดือนหนึ่งแล้วกลับมาพิมพ์ใหม่ Chatwoot จะเลื่อน
 * last_activity_at ให้เอง บทสนทนานั้นจึงกลับเข้าหน้าต่างเวลาทันที
 */
const DISCOVERY_WINDOW_DAYS = 30;
/** หนึ่งหน้าเท่านั้นต่อโครงการต่อรอบ — Chatwoot คืนหน้าละ 25 รายการ เรียงกิจกรรมล่าสุดก่อน */
const DISCOVERY_PAGE = 1;
/** ข้อความระบบเมื่อ Chatwoot ปิดบทสนทนาไปก่อน */
const CLOSED_IN_CHATWOOT = 'ບົດສົນທະນານີ້ຖືກປິດຈາກ Chatwoot ແລ້ວ';

/**
 * ซิงก์แชทสองทาง Helpdesk ↔ Chatwoot
 *
 * - ขาออก: ข้อความของคนใน Helpdesk ถูกส่งเข้าการสนทนาใน Chatwoot (inbox ชนิด API)
 *   ข้อความผู้ใช้เป็น incoming · ข้อความเจ้าหน้าที่ใน Helpdesk เป็น outgoing ขึ้นต้นด้วยชื่อคนตอบ
 * - ขาเข้า: ดึงข้อความ outgoing ใหม่จาก Chatwoot ทุกไม่กี่วินาที แล้วใส่เป็นคำตอบของทีมไอทีใน Helpdesk
 *
 * ⚠️ กันวนซ้ำ — ข้อความที่ส่งออกไปเก็บ chatwoot_message_id ไว้ ตอนดึงกลับจึงข้ามได้
 *    และทุกงานของห้องเดียวกันวิ่งต่อคิว (ส่งเสร็จก่อนค่อยดึง) ไม่งั้นข้อความที่เพิ่งส่ง
 *    อาจถูกดึงกลับเข้ามาเป็นข้อความซ้ำก่อนระบบจะบันทึก id คู่กันทัน
 *
 * ⚠️ Chatwoot ช้าหรือล่มต้องไม่ทำให้แชทใน Helpdesk ใช้ไม่ได้ — ทุกอย่างในนี้ไม่ถูกรอผล
 *    ข้อความที่ส่งไม่สำเร็จค้างไว้แล้วลองใหม่ทุกรอบ (ภายใน 24 ชั่วโมง)
 *
 * ── AIDC Support Hub (origin = 'widget') ───────────────────────────────
 *
 * นอกจากแชทที่ผู้ใช้ Helpdesk เปิดเอง ยังมีบทสนทนาที่ผู้เข้าชมเว็บของกลุ่มเริ่มจาก
 * widget ของ Chatwoot — หนึ่งเว็บ = หนึ่ง inbox ชนิด Website = หนึ่ง support_project
 * รอบที่สอง (CHATWOOT_WIDGET_POLL_MS) ไล่ดูบทสนทนาของ inbox เหล่านั้นแล้วสร้างห้อง
 * ให้ในกล่องแชทเดียวกัน โดยไม่แตะพฤติกรรมของเส้นทางเดิมแม้แต่ข้อเดียว
 */
@Injectable()
export class ChatwootSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ChatwootSync');
  private readonly config = readChatwootSyncConfig();
  private readonly widget = readChatwootWidgetConfig();
  private timer: NodeJS.Timeout | null = null;
  private widgetTimer: NodeJS.Timeout | null = null;
  private polling = false;
  private discovering = false;
  private readonly queues = new Map<number, Promise<void>>();
  /**
   * last_activity_at ล่าสุดที่เห็นของแต่ละบทสนทนา
   *
   * ใช้ตอบว่า "บทสนทนานี้ขยับตั้งแต่รอบก่อนไหม" โดยไม่ต้องยิงถามฐานข้อมูล
   * อยู่ในหน่วยความจำอย่างเดียวโดยตั้งใจ — โปรเซสที่เพิ่งขึ้นจะซิงก์ทุกบทสนทนา
   * ในหน้าต่างเวลาหนึ่งรอบ แล้วนิ่งลงเอง ซึ่งเป็นพฤติกรรมที่ปลอดภัยกว่าการจำผิด
   */
  private readonly lastActivitySeen = new Map<number, number>();

  constructor(
    private readonly chats: SupportChatRepository,
    private readonly projects: SupportProjectRepository,
    private readonly realtime: RealtimeGateway,
  ) {}

  onModuleInit(): void {
    if (this.config.enabled) {
      this.logger.log(
        `ซิงก์แชทกับ Chatwoot: เปิด → ${this.config.baseUrl} บัญชี ${this.config.accountId} inbox ${this.config.inboxId} · ดึงทุก ${this.config.pollMs} ms`,
      );
      this.timer = setInterval(() => void this.pollAll(), this.config.pollMs);
      this.timer.unref?.();
    } else {
      this.logger.log('ซิงก์แชทกับ Chatwoot: ปิดอยู่ (ตั้ง CHATWOOT_SYNC_ENABLED และค่าที่จำเป็นใน .env เพื่อเปิด)');
    }

    /*
     * รอบของ widget ไม่ต้องรอ CHATWOOT_SYNC_ENABLED และไม่ต้องมี inbox ชนิด API
     * ขอแค่ต่อกับ Application API ได้ (ที่อยู่ + token + เลขบัญชี)
     */
    if (this.config.apiReady) {
      this.logger.log(
        `Support Hub: ค้นหาบทสนทนาจาก widget ทุก ${this.widget.pollMs} ms · ` +
          `webhook ${this.widget.webhookToken ? 'เปิด' : 'ปิด'} · ` +
          `ที่อยู่สาธารณะ ${this.widget.publicUrl || '(ยังไม่ได้ตั้ง)'}`,
      );
      this.widgetTimer = setInterval(() => void this.discoverAll(), this.widget.pollMs);
      this.widgetTimer.unref?.();
    } else {
      this.logger.log('Support Hub: ปิดอยู่ (ต้องตั้ง CHATWOOT_BASE_URL, CHATWOOT_API_TOKEN และ CHATWOOT_ACCOUNT_ID)');
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.widgetTimer) clearInterval(this.widgetTimer);
  }

  /** มีข้อความใหม่ในห้องนี้ — ซิงก์ทันทีไม่รอรอบถัดไป */
  kick(chatId: number): void {
    if (this.config.enabled || this.config.apiReady) void this.enqueue(chatId);
  }

  /**
   * Chatwoot ส่งสัญญาณมาว่ามีอะไรขยับใน inbox นี้ — ทางเร่ง ไม่ใช่แหล่งความจริง
   *
   * ⚠️ ไม่เชื่อเนื้อหาใน payload เลย ใช้แค่เลข inbox กับเลขบทสนทนาเป็นคำใบ้
   *    แล้วไปอ่านของจริงจาก Chatwoot ด้วย token ของเราเอง
   *
   * ⚠️ inbox ชนิด API ที่ใช้ซิงก์แชทภายใน (CHATWOOT_SYNC_INBOX_ID) ถูกเพิกเฉยที่นี่
   *    มันมีรอบของตัวเองอยู่แล้ว และเส้นทางของมันคนละเรื่องกับ widget
   */
  kickWidgetInbox(inboxId: number, conversationId: number | null): void {
    if (!this.config.apiReady) return;
    if (this.config.enabled && inboxId === this.config.inboxId) return;

    void (async () => {
      try {
        const project = await this.projects.byInboxId(inboxId);
        // inbox ที่ไม่ตรงกับโครงการใดเลย = ไม่ใช่เรื่องของเรา
        if (!project || !project.isActive || project.chatwootInboxId === null) return;

        if (conversationId !== null) {
          const existing = await this.chats.findByConversationId(conversationId);
          if (existing) {
            await this.enqueue(existing.id);
            return;
          }
        }
        // ยังไม่รู้จักบทสนทนานี้ — ให้รอบค้นหาของโครงการนั้นสร้างห้องให้
        await this.discoverProject({
          id: project.id,
          code: project.code,
          companyId: project.companyId,
          chatwootInboxId: project.chatwootInboxId,
        });
      } catch (error) {
        this.logger.warn(`รับสัญญาณ webhook ของ inbox ${inboxId} ไม่สำเร็จ: ${describe(error)}`);
      }
    })();
  }

  /** งานของห้องเดียวกันต่อคิวกัน ห้องต่างกันทำพร้อมกันได้ */
  private enqueue(chatId: number): Promise<void> {
    const previous = this.queues.get(chatId) ?? Promise.resolve();
    const next: Promise<void> = previous
      .then(() => this.syncChat(chatId))
      .catch((error: unknown) => {
        this.logger.warn(`ซิงก์แชท #${chatId} ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        if (this.queues.get(chatId) === next) this.queues.delete(chatId);
      });
    this.queues.set(chatId, next);
    return next;
  }

  private async pollAll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const ids = await this.chats.syncTargets();
      // ทีละห้อง — ไม่ยิง Chatwoot พร้อมกันหลายร้อยคำขอในรอบเดียว
      for (const id of ids) await this.enqueue(id);
    } catch (error) {
      this.logger.warn(`รอบซิงก์ล้มเหลว: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.polling = false;
    }
  }

  // ── AIDC Support Hub: ค้นหาบทสนทนาจาก widget ────────────────────────

  /**
   * รอบค้นหา — แหล่งความจริงของแชทจาก widget
   *
   * งานถูกจำกัดสามชั้น เพื่อไม่ให้รอบนี้โตตามจำนวนบทสนทนาสะสม
   *   1. เฉพาะโครงการที่เปิดใช้งานและผูก inbox แล้ว
   *   2. หน้าเดียวต่อโครงการต่อรอบ (Chatwoot คืนหน้าละ 25 เรียงกิจกรรมล่าสุดก่อน)
   *   3. เฉพาะบทสนทนาที่ขยับภายใน 30 วัน และ "ขยับจริง" ตั้งแต่รอบก่อน
   */
  private async discoverAll(): Promise<void> {
    if (this.discovering) return;
    this.discovering = true;
    try {
      const targets = await this.projects.activeSyncTargets();
      // ทีละโครงการ — ไม่ยิง Chatwoot พร้อมกันทุก inbox ในรอบเดียว
      for (const project of targets) await this.discoverProject(project);
    } catch (error) {
      this.logger.warn(`รอบค้นหาบทสนทนาจาก widget ล้มเหลว: ${describe(error)}`);
    } finally {
      this.discovering = false;
    }
  }

  private async discoverProject(project: SupportProjectSyncTarget): Promise<void> {
    /*
     * inbox ชนิด API ที่ใช้ซิงก์แชทภายในต้องไม่ถูกดูดเข้ามาทางนี้
     * ถ้าใครเผลอผูกเลขเดียวกันไว้กับโครงการหนึ่ง แชทของพนักงานทุกห้องจะถูก
     * นำเข้าซ้ำเป็นห้องจาก widget แล้วกล่องแชทจะมีเรื่องเดียวกันสองใบ
     */
    if (this.config.enabled && project.chatwootInboxId === this.config.inboxId) return;

    let conversations: ChatwootConversation[];
    try {
      const res = await this.request<{ data?: { payload?: ChatwootConversation[] } }>(
        'GET',
        `/conversations?inbox_id=${project.chatwootInboxId}&status=all&page=${DISCOVERY_PAGE}`,
      );
      // วัดจริงกับ 4.17.1 — รายการอยู่ที่ data.payload ไม่ใช่ payload เหมือน endpoint อื่น
      conversations = res.data?.payload ?? [];
    } catch (error) {
      this.logger.warn(`อ่านบทสนทนาของโครงการ ${project.code} ไม่สำเร็จ: ${describe(error)}`);
      return;
    }

    const now = new Date();
    const ownerCompanyId = await this.projects.ownerCompanyId();
    if (ownerCompanyId === null) {
      this.logger.warn('หาบริษัทเจ้าของระบบไม่เจอ — ข้ามรอบค้นหา (รัน npm run db:seed ก่อน)');
      return;
    }

    let imported = 0;
    let touched = 0;
    for (const conversation of conversations) {
      if (!Number.isInteger(conversation.id)) continue;
      if (!isWithinWindow(conversation.last_activity_at, now, DISCOVERY_WINDOW_DAYS)) continue;

      const activity = conversation.last_activity_at ?? 0;
      const seen = this.lastActivitySeen.get(conversation.id);
      // ยังไม่ขยับตั้งแต่รอบก่อน — ไม่มีอะไรให้ทำ ประหยัดทั้งคำขอและคิวรี
      if (seen !== undefined && seen >= activity) continue;

      try {
        const created = await this.absorbConversation(conversation, project, ownerCompanyId);
        this.lastActivitySeen.set(conversation.id, activity);
        touched += 1;
        if (created) imported += 1;
      } catch (error) {
        this.logger.warn(
          `นำเข้าบทสนทนา #${conversation.id} ของโครงการ ${project.code} ไม่สำเร็จ: ${describe(error)}`,
        );
      }
    }

    if (touched > 0) {
      this.logger.log(
        `Support Hub ${project.code}: เห็น ${conversations.length} บทสนทนา · ` +
          `ซิงก์ ${touched} · สร้างห้องใหม่ ${imported}`,
      );
    }
  }

  /** สร้างหรืออัปเดตห้องของบทสนทนาหนึ่ง แล้วต่อคิวซิงก์ข้อความ */
  private async absorbConversation(
    conversation: ChatwootConversation,
    project: SupportProjectSyncTarget,
    ownerCompanyId: number,
  ): Promise<boolean> {
    const contact = toWidgetContact(conversation);
    const upserted = await this.chats.upsertWidgetChat({
      conversationId: conversation.id,
      contactId: contact.contactId,
      projectId: project.id,
      companyId: widgetCompanyId(project.companyId, ownerCompanyId),
      contact: {
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        identifier: contact.identifier,
        verified: contact.verified,
      },
    });

    await this.linkRequesterIfVerified(upserted.id, contact.verified, contact.email);

    /*
     * Chatwoot ปิดบทสนทนาไปแล้วแต่ห้องเรายังเปิด — ปิดตามพร้อมข้อความระบบ
     * ต้องมีข้อความกำกับเสมอ ไม่งั้นเจ้าหน้าที่เห็นห้องหายจากรายการโดยไม่รู้สาเหตุ
     */
    if (shouldCloseFromChatwoot(conversation.status, upserted.status)) {
      if (await this.chats.closeFromChatwoot(upserted.id)) {
        const row = await this.chats.findById(upserted.id);
        if (row) {
          const message = await this.chats.addMessage({
            chatId: row.id,
            senderId: null,
            body: CLOSED_IN_CHATWOOT,
            isSystem: true,
          });
          this.publishToInbox(row, message);
        }
      }
    }

    await this.enqueue(upserted.id);
    return upserted.created;
  }

  /**
   * จับคู่ผู้เข้าชมกับบัญชีใน Helpdesk — เฉพาะบทสนทนาที่ Chatwoot ยืนยันด้วย HMAC
   *
   * ⚠️ เงื่อนไข verified ห้ามผ่อนปรนเด็ดขาด
   *    ฟอร์มก่อนแชทให้ผู้เข้าชมพิมพ์อีเมลอะไรก็ได้ ถ้าจับคู่อีเมลที่พิมพ์เอง
   *    ใครก็พิมพ์อีเมลของคนอื่นแล้วกลายเป็นเจ้าของห้องแชทของเขา
   *
   * ⚠️ ไม่รวมห้อง — คนที่มีห้องที่เปิดอยู่แล้วจะไม่ถูกผูกกับห้องนี้
   */
  private async linkRequesterIfVerified(
    chatId: number,
    verified: boolean,
    email: string | null,
  ): Promise<void> {
    if (!verified || !email) return;

    const match = await this.chats.findActiveUserByEmail(email);
    const decision = requesterLinkDecision({ verified, email, match });
    if (decision.link === null) return;

    if (await this.chats.linkRequester(chatId, decision.link)) {
      this.logger.log(`ผูกแชท #${chatId} กับผู้ใช้ #${decision.link} (Chatwoot ยืนยันตัวตนแล้ว)`);
    }
  }

  private async syncChat(chatId: number): Promise<void> {
    const head = await this.chats.findById(chatId);
    if (!head) return;
    if (head.origin === 'widget') return this.syncWidgetChat(head);
    if (!this.config.enabled) return;
    return this.syncHelpdeskChat(chatId);
  }

  /**
   * ห้องจาก widget — ส่งคำตอบของเจ้าหน้าที่ออกไป แล้วดึงของใหม่เข้ามา
   *
   * ⚠️ ไม่มีการสร้าง contact หรือเปิดบทสนทนาใหม่ในทางนี้เลย
   *    บทสนทนาเป็นของ Chatwoot ตั้งแต่ต้น เราแค่เข้าไปร่วมวง
   */
  private async syncWidgetChat(row: SupportChatRow): Promise<void> {
    const conversationId = row.chatwootConversationId;
    if (conversationId === null) return;

    const pending = await this.chats.pendingOutbound(row.id);
    for (const message of pending) {
      // ข้อความที่ไม่มีคนใน Helpdesk เป็นเจ้าของ ไม่ถูกส่งออกไปหาผู้เข้าชม
      if (message.senderId === null) continue;
      const chatwootId = await this.postMessage(conversationId, message.body, 'outgoing', message);
      await this.chats.markPushed(message.id, chatwootId);
      await this.chats.advanceCursor(row.id, chatwootId);
    }

    /*
     * ห้องที่ทีมไอทีปิดเองใน Helpdesk → สั่งปิดฝั่ง Chatwoot ตาม (เหมือนเส้นทางเดิม)
     * แต่ห้องที่ถูกปิดเพราะ Chatwoot ปิดมาก่อน ต้องยังดึงข้อความต่อได้
     * เพราะผู้เข้าชมพิมพ์กลับมาเมื่อไรก็ได้ แล้วห้องต้องเปิดกลับ ไม่ใช่เงียบหายไป
     */
    if (row.status === 'closed' && row.closedBy !== null) {
      await this.request('POST', `/conversations/${conversationId}/toggle_status`, {
        status: 'resolved',
      });
    }

    await this.pullWidget(row.id);
  }

  private async syncHelpdeskChat(chatId: number): Promise<void> {
    let row = await this.chats.findById(chatId);
    if (!row) return;

    const pending = await this.chats.pendingOutbound(chatId);
    if (row.chatwootConversationId === null) {
      if (pending.length === 0) return;
      await this.linkConversation(row);
      row = await this.chats.findById(chatId);
      if (!row || row.chatwootConversationId === null) return;
    }
    const conversationId = row.chatwootConversationId;

    for (const message of pending) {
      const chatwootId = await this.push(conversationId, row, message);
      await this.chats.markPushed(message.id, chatwootId);
      await this.chats.advanceCursor(row.id, chatwootId);
    }

    if (row.status === 'closed') {
      await this.request('POST', `/conversations/${conversationId}/toggle_status`, { status: 'resolved' });
      return;
    }

    await this.pull(chatId);
  }

  /** สร้าง (หรือหา) contact ของผู้ใช้ แล้วเปิดการสนทนาใหม่ใน inbox ซิงก์ */
  private async linkConversation(row: SupportChatRow): Promise<void> {
    // ห้องที่ไม่มีเจ้าของเป็นพนักงานมาไม่ถึงตรงนี้ (เส้นทางนี้เป็นของ origin = 'helpdesk')
    if (row.requesterId === null) return;
    const who = await this.chats.requesterIdentity(row.requesterId);
    if (!who) return;
    const inboxId = this.config.inboxId;

    let contactId = await this.findContact(who.username, who.email);
    let sourceId: string | null = null;

    if (contactId === null) {
      const created = await this.request<{
        payload?: { contact?: { id?: number }; contact_inbox?: { source_id?: string } };
      }>('POST', '/contacts', {
        name: who.fullName,
        identifier: who.username,
        ...(who.email ? { email: who.email } : {}),
        inbox_id: inboxId,
        custom_attributes: { company: row.companyCode },
      });
      contactId = Number(created.payload?.contact?.id);
      sourceId = created.payload?.contact_inbox?.source_id ?? null;
      if (!Number.isInteger(contactId) || contactId <= 0) throw new Error('สร้าง contact ใน Chatwoot ไม่สำเร็จ');
    }

    if (!sourceId) sourceId = await this.contactSource(contactId, inboxId);

    const conversation = await this.request<{ id?: number }>('POST', '/conversations', {
      source_id: sourceId,
      inbox_id: inboxId,
      contact_id: contactId,
      additional_attributes: { helpdesk_chat_id: row.id, company: row.companyCode },
    });
    if (!conversation.id) throw new Error('สร้างการสนทนาใน Chatwoot ไม่สำเร็จ');

    await this.chats.linkChatwoot(row.id, conversation.id, contactId);
    this.logger.log(`ผูกแชท #${row.id} กับการสนทนา Chatwoot #${conversation.id}`);
  }

  /** contact เดิมที่ widget เคยสร้างไว้ใช้ identifier = ชื่อผู้ใช้ — หาด้วยค่านั้นก่อน แล้วค่อยอีเมล */
  private async findContact(username: string, email: string | null): Promise<number | null> {
    const byIdentifier = await this.request<{ payload?: ChatwootContactRef[] }>(
      'GET',
      `/contacts/search?q=${encodeURIComponent(username)}`,
    );
    const match = byIdentifier.payload?.find((c) => c.identifier === username);
    if (match) return match.id;

    if (email) {
      const byEmail = await this.request<{ payload?: ChatwootContactRef[] }>(
        'GET',
        `/contacts/search?q=${encodeURIComponent(email)}`,
      );
      const found = byEmail.payload?.find((c) => c.email?.toLowerCase() === email.toLowerCase());
      if (found) return found.id;
    }
    return null;
  }

  private async contactSource(contactId: number, inboxId: number): Promise<string> {
    try {
      const created = await this.request<{ source_id?: string; payload?: { source_id?: string } }>(
        'POST',
        `/contacts/${contactId}/contact_inboxes`,
        { inbox_id: inboxId },
      );
      const sourceId = created.source_id ?? created.payload?.source_id;
      if (sourceId) return sourceId;
    } catch {
      // contact นี้ผูกกับ inbox นี้อยู่แล้ว — หา source_id เดิม
    }
    const inboxes = await this.request<{ payload?: { source_id?: string; inbox?: { id?: number } }[] }>(
      'GET',
      `/contacts/${contactId}/contactable_inboxes`,
    );
    const existing = inboxes.payload?.find((item) => item.inbox?.id === inboxId);
    if (!existing?.source_id) throw new Error('หา source_id ของ contact ใน inbox ซิงก์ไม่เจอ');
    return existing.source_id;
  }

  /** ส่งข้อความหนึ่งข้อความไป Chatwoot · คืน id ข้อความฝั่ง Chatwoot */
  private async push(
    conversationId: number,
    row: SupportChatRow,
    message: SupportChatMessageRow,
  ): Promise<number> {
    const fromRequester = message.senderId === row.requesterId;
    const messageType = fromRequester ? 'incoming' : 'outgoing';
    // ข้อความเจ้าหน้าที่ขึ้นในชื่อเจ้าของ token ของ Chatwoot — ใส่ชื่อคนตอบจริงไว้หน้าข้อความ
    const content =
      fromRequester || !message.body ? message.body : `${message.senderName ?? 'IT'} (Helpdesk): ${message.body}`;
    return this.postMessage(conversationId, content, messageType, message);
  }

  /**
   * ส่งข้อความหนึ่งข้อความเข้าบทสนทนา · คืน id ข้อความฝั่ง Chatwoot
   *
   * ⚠️ ห้องจาก widget ส่ง `content` เป็นข้อความเปล่า ไม่มีชื่อคนตอบขึ้นต้น
   *    ผู้เข้าชมเว็บเป็นคนนอก เขาควรอ่านคำตอบที่สะอาด ไม่ใช่ข้อความที่มีชื่อ
   *    พนักงานภายในกับคำว่า (Helpdesk) แปะอยู่ข้างหน้าทุกบรรทัด
   */
  private async postMessage(
    conversationId: number,
    content: string,
    messageType: 'incoming' | 'outgoing',
    message: SupportChatMessageRow,
  ): Promise<number> {
    const path = `/conversations/${conversationId}/messages`;

    if (message.attachment) {
      const buffer = await fs.readFile(chatFilePath(message.attachment.key));
      const form = new FormData();
      if (content) form.append('content', content);
      form.append('message_type', messageType);
      form.append('private', 'false');
      form.append(
        'attachments[]',
        new Blob([new Uint8Array(buffer)], { type: message.attachment.mime }),
        message.attachment.name,
      );
      const res = await this.request<{ id?: number }>('POST', path, form);
      if (!res.id) throw new Error('Chatwoot ไม่คืน id ข้อความ');
      return res.id;
    }

    const res = await this.request<{ id?: number }>('POST', path, {
      content,
      message_type: messageType,
      private: false,
    });
    if (!res.id) throw new Error('Chatwoot ไม่คืน id ข้อความ');
    return res.id;
  }

  /** ดึงคำตอบใหม่ของเจ้าหน้าที่ (และบอท) จาก Chatwoot เข้ามาในห้อง */
  private async pull(chatId: number): Promise<void> {
    const row = await this.chats.findById(chatId);
    if (!row || row.chatwootConversationId === null) return;

    const after = row.chatwootCursor;
    const response = await this.request<{ payload?: ChatwootMessage[] }>(
      'GET',
      `/conversations/${row.chatwootConversationId}/messages${after ? `?after=${after}` : ''}`,
    );
    const incoming = [...(response.payload ?? [])].sort((a, b) => a.id - b.id);

    let cursor = after ?? 0;
    for (const cw of incoming) {
      cursor = Math.max(cursor, cw.id);
      // เอาเฉพาะคำตอบที่ผู้ใช้ควรเห็น: outgoing ไม่ใช่โน้ตส่วนตัว และเป็นข้อความธรรมดา (ไม่ใช่ CSAT/ฟอร์ม)
      if (!OUTGOING.has(cw.message_type) || cw.private) continue;
      if (cw.content_type && cw.content_type !== 'text') continue;
      if (await this.chats.hasChatwootMessage(cw.id)) continue;

      const attachment = await this.importAttachment(row.companyId, cw);
      const body = (cw.content ?? '').trim().slice(0, 4000);
      if (!body && !attachment) continue;

      const message = await this.chats.addMessage({
        chatId: row.id,
        senderId: null,
        body,
        externalSenderName: (cw.sender?.name ?? 'Chatwoot').slice(0, 150),
        chatwootMessageId: cw.id,
        ...(attachment ? { attachment } : {}),
      });
      this.publishToInbox(row, message);
    }

    if (cursor > (after ?? 0)) await this.chats.advanceCursor(row.id, cursor);
  }

  /**
   * ดึงข้อความใหม่ของห้องจาก widget — ทั้งของผู้เข้าชมและของเจ้าหน้าที่
   *
   * ต่างจาก pull() ของเส้นทางเดิมตรงที่ **ข้อความ incoming ถูกนำเข้าด้วย**
   * เพราะฝั่งนี้ผู้เข้าชมพิมพ์ใน Chatwoot ไม่ได้พิมพ์ใน Helpdesk
   * ข้อความของเขาจึงมาถึงเราได้ทางเดียวคือดึงกลับมา
   */
  private async pullWidget(chatId: number): Promise<void> {
    let row = await this.chats.findById(chatId);
    if (!row || row.chatwootConversationId === null) return;

    const after = row.chatwootCursor;
    const response = await this.request<{ payload?: ChatwootWidgetMessage[] }>(
      'GET',
      `/conversations/${row.chatwootConversationId}/messages${after ? `?after=${after}` : ''}`,
    );
    const fetched = [...(response.payload ?? [])].sort((a, b) => a.id - b.id);

    /*
     * ผู้เข้าชมพิมพ์มาใหม่ในห้องที่เราถือว่าปิดแล้ว → เปิดห้องเดิมกลับมา
     * ต้องทำ "ก่อน" นำเข้าข้อความ ไม่งั้นข้อความใหม่จะไปตกอยู่ในห้องที่ปิดอยู่
     * แล้วเจ้าหน้าที่ไม่เห็นมันในรายการแชทที่เปิดอยู่เลย
     */
    if (shouldReopen(row.status, fetched) && (await this.chats.reopen(row.id))) {
      this.logger.log(`เปิดแชท #${row.id} กลับมา — ผู้เข้าชมพิมพ์เข้ามาใหม่`);
      row = (await this.chats.findById(row.id)) ?? row;
    }

    let cursor = after ?? 0;
    for (const cw of fetched) {
      cursor = Math.max(cursor, cw.id);
      if (!isImportable(cw)) continue;
      if (await this.chats.hasChatwootMessage(cw.id)) continue;

      const fromContact = classifyMessage(cw) === 'incoming';
      const attachment = await this.importAttachment(row.companyId, cw);
      const body = (cw.content ?? '').trim().slice(0, 4000);
      if (!body && !attachment) continue;

      /*
       * ทั้งสองฝั่งเก็บ sender_id เป็น null เพราะไม่มีใครในสองคนนี้เป็นบัญชี
       * ที่พิมพ์ผ่าน Helpdesk — ตัวที่แยกว่าใครพูดคือธง from_contact
       */
      const message = await this.chats.addMessage({
        chatId: row.id,
        senderId: null,
        body,
        fromContact,
        externalSenderName: fromContact
          ? visitorName(row.contactName)
          : (cw.sender?.name ?? 'Chatwoot').slice(0, 150),
        chatwootMessageId: cw.id,
        ...(attachment ? { attachment } : {}),
      });
      this.publishToInbox(row, message);
    }

    if (cursor > (after ?? 0)) await this.chats.advanceCursor(row.id, cursor);
  }

  /**
   * ส่งข้อความใหม่ออกทางเดียวกับที่ service ใช้ — กล่องแชทจึงขยับสดทั้งสองเส้นทาง
   *
   * ห้องจาก widget ไม่มี requester_id ในกรณีทั่วไป ห้อง `user:{id}` จึงถูกข้าม
   * เหลือเฉพาะห้องกล่องแชทของบริษัทนั้นกับของ super_admin
   */
  private publishToInbox(row: SupportChatRow, message: SupportChatMessageRow): void {
    this.realtime.chatMessage(
      { chatId: row.id, companyId: row.companyId, requesterId: row.requesterId },
      toMessageDto(row, message),
    );
  }

  /**
   * ดาวน์โหลดไฟล์แนบของข้อความ Chatwoot มาเก็บในที่เก็บของแชท (ไฟล์แรกของข้อความ)
   *
   * ⚠️ ดาวน์โหลดเฉพาะจาก host ของ Chatwoot ที่ตั้งไว้ — URL มาจากข้อมูลภายนอก
   *    ถ้าเชื่อทุก URL backend จะถูกใช้เป็นทางยิงเข้าเครือข่ายภายในได้ (SSRF)
   */
  private async importAttachment(
    companyId: number,
    cw: { attachments?: { data_url?: string | null }[] | null },
  ): Promise<StoredChatAttachment | null> {
    const first = cw.attachments?.find((item) => item.data_url);
    if (!first?.data_url) return null;

    try {
      const url = new URL(first.data_url, this.config.baseUrl);
      if (!this.config.fileHosts.includes(url.host)) {
        this.logger.warn(`ข้ามไฟล์แนบจาก host ที่ไม่ได้อนุญาต: ${url.host} (เพิ่มใน CHATWOOT_FILE_HOSTS)`);
        return null;
      }
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`ดาวน์โหลดได้ ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0 || buffer.length > CHAT_MAX_FILE_BYTES) return null;

      const name = decodeURIComponent(url.pathname.split('/').pop() ?? 'file');
      const detected = detectChatFile(buffer.subarray(0, 32), name);
      if (!detected) return null;
      return await writeChatFile(companyId, detected, name, buffer);
    } catch (error) {
      this.logger.warn(`นำเข้าไฟล์แนบจาก Chatwoot ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * ทุกคำขอไป Chatwoot ผ่านทางนี้ — ตัวจริงอยู่ที่ integrations/chatwoot/chatwoot-api.ts
   *
   * ⚠️ token อยู่ใน header เท่านั้น ห้ามพิมพ์ลง log และห้ามสะกดชื่อ header ด้วยขีดล่าง
   *    (nginx หน้า Chatwoot ทิ้ง header ที่มีขีดล่างเงียบ ๆ แล้วได้ 401 ทั้งที่ token ถูก)
   */
  private request<T = Record<string, unknown>>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    return chatwootRequest<T>(this.config, method, path, body);
  }
}

/** ข้อความผิดพลาดที่ปลอดภัยพอจะเขียนลง log — ไม่พ่น object ทั้งก้อนออกมา */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
