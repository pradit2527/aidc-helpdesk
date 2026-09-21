import fs from 'node:fs/promises';

import { Injectable, Logger } from '@nestjs/common';

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-error';
import type { AccessScope } from '../../common/scope';
import {
  SupportChatRepository,
  type ChatAttachmentKind,
  type ChatSide,
  type LastMessageRow,
  type StoredChatAttachment,
  type SupportChatMessageRow,
  type SupportChatRow,
} from '../../db/repositories/support-chat.repository';
import { SupportProjectRepository } from '../../db/repositories/support-project.repository';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TicketsService, toTicketListItem } from '../tickets/tickets.service';
import { chatFilePath, writeChatFile } from './chat-file-store';
import { CHAT_MAX_FILE_BYTES, decodeUploadName, detectChatFile } from './chat-file-type';
import { clampSubject, renderTranscript, resolveTicketDefaults } from './chat-ticket';
import { ChatwootSyncService } from './chatwoot-sync.service';
import { visitorName } from './chatwoot-widget';
import {
  SUPPORT_CHAT_MAX_BODY,
  type ConvertChatToTicketDto,
  type ConvertChatToTicketResponseDto,
  type SendChatMessageDto,
  type SendChatMessageResponseDto,
  type SupportChatSummaryDto,
  type SupportChatThreadDto,
} from './support-chat.dto';
import { toMessageDto } from './support-chat.mapper';

/** ไฟล์จาก multer (memory storage) */
export interface UploadedChatFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/**
 * ทีมไอที = ผู้ที่เปลี่ยนสถานะ ticket ได้ (agent · company_admin · super_admin)
 *
 * ใช้สิทธิ์เดียวกับคิวงาน ไม่ตั้งสิทธิ์ใหม่ — คนที่รับเรื่องในคิวได้คือคนเดียวกับที่ควรตอบแชท
 * และขอบเขตบริษัทก็ตามกฎเดิมทุกประการ ผู้ดูแลบริษัท A ไม่เห็นแชทของพนักงานบริษัท B
 */
const STAFF_PERMISSION = 'ticket.change_status';
const PREVIEW_LENGTH = 140;

/** ป้ายแทนข้อความในรายการแชท เมื่อข้อความล่าสุดเป็นไฟล์อย่างเดียว */
const ATTACHMENT_LABEL: Record<ChatAttachmentKind, string> = {
  image: 'ຮູບພາບ',
  audio: 'ຂໍ້ຄວາມສຽງ',
  file: 'ໄຟລ໌ແນບ',
};

@Injectable()
export class SupportChatService {
  private readonly logger = new Logger('SupportChat');

  constructor(
    private readonly chats: SupportChatRepository,
    private readonly realtime: RealtimeGateway,
    private readonly chatwoot: ChatwootSyncService,
    private readonly projects: SupportProjectRepository,
    private readonly tickets: TicketsService,
  ) {}

  /** ห้องแชทของผู้ใช้เอง — null ถ้ายังไม่เคยคุย */
  async mine(scope: AccessScope): Promise<SupportChatThreadDto | null> {
    const row = await this.chats.latestOf(scope.userId);
    return row ? this.thread(row, 'requester') : null;
  }

  /** ผู้ใช้ส่งข้อความหาทีมไอที — ยังไม่มีห้องหรือห้องเดิมปิดไปแล้ว ระบบเปิดห้องใหม่ให้ */
  async sendMine(scope: AccessScope, dto: SendChatMessageDto): Promise<SendChatMessageResponseDto> {
    return this.postAsRequester(scope, cleanBody(dto.body, false), null);
  }

  /** ผู้ใช้ส่งรูป เสียง หรือไฟล์หาทีมไอที พร้อมข้อความประกอบ (ไม่บังคับ) */
  async sendMineFile(
    scope: AccessScope,
    file: UploadedChatFile | undefined,
    body: string | undefined,
  ): Promise<SendChatMessageResponseDto> {
    const text = cleanBody(body ?? '', true);
    const attachment = await storeFile(scope.homeCompanyId, file);
    return this.postAsRequester(scope, text, attachment);
  }

  /** กล่องแชทของทีมไอที — เฉพาะบริษัทในขอบเขต เรียงตามข้อความล่าสุด */
  async inbox(
    scope: AccessScope,
    status: 'open' | 'closed',
    filter: { projectId?: number; origin?: 'helpdesk' | 'widget' } = {},
  ): Promise<SupportChatSummaryDto[]> {
    if (!scope.has(STAFF_PERMISSION)) {
      throw new ForbiddenError('FORBIDDEN', 'ມີແຕ່ທີມໄອທີທີ່ເປີດກ່ອງແຊັດໄດ້');
    }
    /*
     * ตัวกรองโครงการไม่ต้องตรวจขอบเขตแยก — ขอบเขตบริษัทถูกบังคับที่ชั้น query อยู่แล้ว
     * ผู้เรียกที่ใส่ id ของโครงการนอกขอบเขตจึงได้รายการว่าง ไม่ใช่ข้อมูลของบริษัทอื่น
     */
    const rows = await this.chats.inbox(
      scope.isSuperAdmin ? null : [...scope.companyIds],
      status,
      filter,
    );
    const last = await this.chats.lastMessages(rows.map((row) => row.id));
    return rows.map((row) => this.summary(row, 'staff', last.get(row.id) ?? null));
  }

  async detail(scope: AccessScope, id: number): Promise<SupportChatThreadDto> {
    const { row, side } = await this.access(scope, id);
    return this.thread(row, side);
  }

  async send(
    scope: AccessScope,
    id: number,
    dto: SendChatMessageDto,
  ): Promise<SendChatMessageResponseDto> {
    const { row, side } = await this.access(scope, id);
    assertOpen(row);
    return this.postToChat(scope, row, side, cleanBody(dto.body, false), null);
  }

  async sendFile(
    scope: AccessScope,
    id: number,
    file: UploadedChatFile | undefined,
    body: string | undefined,
  ): Promise<SendChatMessageResponseDto> {
    const { row, side } = await this.access(scope, id);
    assertOpen(row);
    const text = cleanBody(body ?? '', true);
    const attachment = await storeFile(row.companyId, file);
    return this.postToChat(scope, row, side, text, attachment);
  }

  /**
   * เปิดไฟล์ในแชท — ตรวจสิทธิ์ห้องทุกครั้ง
   *
   * ⚠️ ห้ามให้ไฟล์แชทออกทาง /attachments/{id}/download — ทางนั้นไม่ได้ตรวจว่าผู้ขอเป็นใคร
   */
  async readFile(
    scope: AccessScope,
    chatId: number,
    messageId: number,
  ): Promise<StoredChatAttachment & { buffer: Buffer }> {
    await this.access(scope, chatId);
    const file = await this.chats.findMessageFile(chatId, messageId);
    if (!file) throw new NotFoundError('NOT_FOUND', 'ບໍ່ພົບໄຟລ໌');

    const buffer = await fs.readFile(chatFilePath(file.key)).catch(() => null);
    if (!buffer) {
      throw new NotFoundError('ATTACHMENT_FILE_MISSING', 'ຂໍ້ມູນໄຟລ໌ມີແຕ່ຫາໄຟລ໌ຈິງບໍ່ພົບ');
    }
    return { ...file, buffer };
  }

  async markRead(scope: AccessScope, id: number): Promise<void> {
    const { row, side } = await this.access(scope, id);
    await this.chats.markRead(row.id, side);
  }

  async close(scope: AccessScope, id: number): Promise<SupportChatSummaryDto> {
    const { row, side } = await this.access(scope, id);
    if (side !== 'staff') {
      throw new ForbiddenError('FORBIDDEN', 'ມີແຕ່ທີມໄອທີທີ່ປິດແຊັດໄດ້');
    }

    if (await this.chats.close(row.id, scope.userId)) {
      const message = await this.chats.addMessage({
        chatId: row.id,
        senderId: null,
        body: 'ທີມໄອທີປິດແຊັດນີ້ແລ້ວ — ຖ້າມີບັນຫາໃໝ່ ພິມຂໍ້ຄວາມມາໄດ້ເລີຍ',
        isSystem: true,
        readSide: 'staff',
      });
      // ตัวซิงก์เห็นว่าห้องปิดแล้ว จะปิด (resolve) การสนทนาฝั่ง Chatwoot ตาม
      return this.publish(await this.mustFind(row.id), message, 'staff').chat;
    }

    const current = await this.mustFind(row.id);
    return this.summary(current, 'staff', null);
  }

  /**
   * ยกระดับห้องแชทเป็นเรื่องแจ้ง (POST /support-chat/{id}/ticket)
   *
   * ด่านเดียวกับการปิดห้อง: ต้องเป็นทีมไอทีในขอบเขตบริษัทของห้องนั้น
   * (`ticket.change_status` — ดู access() และ STAFF_PERMISSION)
   *
   * ผู้แจ้งของเรื่องที่ได้
   *   - ห้องของพนักงาน หรือห้องจาก widget ที่จับคู่กับบัญชีจริงแล้ว → บัญชีนั้น
   *   - ห้องจาก widget ที่ยังไม่รู้ว่าเป็นใคร → **เจ้าหน้าที่ที่กด** เป็นทั้งผู้แจ้งและผู้สร้าง
   *
   * ⚠️ ข้อหลังสำคัญ: ห้ามสร้างบัญชีให้ผู้เข้าชม และห้ามยืมบัญชีใครมาเป็นผู้แจ้ง
   *    ตัวตนของผู้เข้าชมเท่าที่รู้ถูกส่งกลับไปใน `contact_snapshot` ของคำตอบ
   *    เพื่อให้หน้าจอบอกได้ว่าคนที่ถามจริง ๆ คือใคร โดยไม่ต้องแตะแถวของ ticket เลย
   *
   * ไม่มีการมอบหมายผู้รับผิดชอบอัตโนมัติ — เรื่องเข้าคิวที่ยังไม่มีคนรับตามปกติ
   */
  async convertToTicket(
    scope: AccessScope,
    id: number,
    dto: ConvertChatToTicketDto,
  ): Promise<ConvertChatToTicketResponseDto> {
    const { row, side } = await this.access(scope, id);
    if (side !== 'staff') {
      throw new ForbiddenError('FORBIDDEN', 'ມີແຕ່ທີມໄອທີທີ່ສ້າງເລື່ອງແຈ້ງຈາກແຊັດໄດ້');
    }
    assertNotLinked(row);

    const project = row.projectId === null ? null : await this.projects.byId(row.projectId);
    const defaults = resolveTicketDefaults({
      categoryId: dto.category_id,
      projectDefaultCategoryId: project?.defaultCategoryId ?? null,
      impact: dto.impact,
      urgency: dto.urgency,
    });
    if (defaults.categoryId === null) {
      throw new ValidationError('VALIDATION_ERROR', 'ກະລຸນາເລືອກໝວດໝູ່ຂອງເລື່ອງ', [
        {
          field: 'category_id',
          message: 'ໂຄງການນີ້ຍັງບໍ່ໄດ້ຕັ້ງໝວດໝູ່ຕັ້ງຕົ້ນໄວ້ — ກະລຸນາເລືອກເອງ',
        },
      ]);
    }

    const description = dto.description?.trim() || (await this.transcriptOf(row));

    /*
     * สร้างผ่าน TicketsService เส้นทางเดียวกับ POST /tickets ทุกประการ
     *
     * จึงได้การตรวจหมวดหมู่ ขอบเขตบริษัท กฎ "แจ้งแทนผู้อื่น" การคำนวณ priority
     * กำหนดเวลา SLA และการส่งขึ้นบอร์ด Super Work เหมือนเรื่องที่แจ้งตามปกติ
     * ถ้าเขียน insert เองที่นี่ เรื่องที่มาจากแชทจะหลุดกฎเหล่านั้นไปทีละข้อ
     */
    /*
     * ผู้ถามเป็นพนักงานในเครือจริงหรือไม่
     *
     * ⚠️ ตัดสินจาก requester_id ของ "ห้องแชท" ไม่ใช่ของ ticket ที่กำลังจะสร้าง
     *    บรรทัดล่างใส่ `scope.userId` (เจ้าหน้าที่ที่กด) เป็นผู้แจ้งเมื่อห้องยัง
     *    จับคู่กับบัญชีไม่ได้ ซึ่งเป็นการลงบัญชีให้คอลัมน์ NOT NULL มีค่า
     *    ไม่ใช่ข้อเท็จจริงว่าคนถามเป็นพนักงาน ถ้าอ่านจากตรงนั้น กฎ
     *    "เหตุขัดข้องเป็นของพนักงานเท่านั้น" จะเป็นจริงเสมอและไม่เคยทำงานเลย
     */
    const submitterIsInternal = row.requesterId !== null;

    const detail = await this.tickets.create(scope, {
      subject: clampSubject(dto.subject),
      description,
      category_id: defaults.categoryId,
      impact: defaults.impact,
      urgency: defaults.urgency,
      company_id: row.companyId,
      requester_id: row.requesterId ?? scope.userId,
      ...(row.projectId !== null ? { project_id: row.projectId } : {}),
    },
    /*
     * ส่งนอก DTO โดยตั้งใจ — ห้ามให้ค่านี้มาจาก request body เด็ดขาด
     *
     * ค่า true คือด้านที่ "ผ่อนกฎ" (ปลดล็อกให้แจ้งเหตุขัดข้องได้) ถ้ามันเป็น
     * ฟิลด์ในเนื้อคำขอ ใครก็ตามที่เรียก API ได้จะส่ง true มาเองเพื่อข้ามกฎ
     * ข้อเท็จจริงนี้ต้องมาจากสิ่งที่เซิร์ฟเวอร์รู้เท่านั้น
     */
    { submitterIsInternal });

    /*
     * ผูกสองทาง — ถ้าอีกแท็บผูกไปก่อนแล้ว เราจะได้ false ที่บรรทัดนี้
     *
     * เรื่องที่เพิ่งสร้างจะกลายเป็นเรื่องที่ไม่มีห้องผูกอยู่ ซึ่งลบทิ้งเองไม่ได้
     * (ระบบนี้ไม่ลบ ticket) จึงบันทึกเลขที่ไว้ใน log ให้ทีมตามไปยกเลิกได้
     * แล้วตอบ 409 เหมือนกรณีที่ตรวจเจอตั้งแต่ต้น — ผู้ใช้เห็นผลเดียวกันทั้งสองทาง
     */
    if (!(await this.chats.linkTicket(row.id, detail.id))) {
      this.logger.warn(
        `แชท #${row.id} ถูกผูกกับเรื่องอื่นไปก่อนแล้ว — เรื่อง ${detail.ticket_no} ที่เพิ่งสร้างจึงไม่มีห้องผูกอยู่`,
      );
      throw new ConflictError('CHAT_ALREADY_LINKED', 'ແຊັດນີ້ຖືກຜູກກັບເລື່ອງແຈ້ງແລ້ວ', {
        chatId: row.id,
        orphanTicketNo: detail.ticket_no,
      });
    }

    const linked = await this.mustFind(row.id);
    return {
      chat: this.summary(linked, 'staff', null),
      ticket: toTicketListItem(detail),
      /*
       * ตัวตนของผู้เข้าชม ณ เวลาที่ยกระดับ — เฉพาะห้องจาก widget
       * ห้องของพนักงานมีผู้แจ้งเป็นบัญชีจริงอยู่แล้ว ไม่มีอะไรให้สับสน
       *
       * ผู้เข้าชมที่ไม่ได้ฝากอะไรไว้เลยก็เป็น null ไม่ใช่ก้อนที่ว่างทั้งสามช่อง —
       * หน้าจอจะได้ตัดสินด้วยเงื่อนไขเดียวว่า "มีตัวตนให้แสดงไหม"
       * ไม่ต้องไล่เช็คทีละช่องแล้วเผลอขึ้นกล่องเปล่า
       */
      contact_snapshot: contactSnapshot(linked),
    };
  }

  /** บทสนทนาในห้องที่ถอดเป็นรายละเอียดของเรื่อง — ใช้เมื่อผู้เรียกไม่ได้เขียนมาเอง */
  private async transcriptOf(row: SupportChatRow): Promise<string> {
    const messages = await this.chats.messages(row.id);
    return renderTranscript(
      messages.map((message) => ({
        senderId: message.senderId,
        senderName: message.senderName,
        externalSenderName: message.externalSenderName,
        body: message.body,
        isSystem: message.isSystem,
        fromContact: message.fromContact,
        attachmentKind: message.attachment?.kind ?? null,
        createdAt: message.createdAt,
      })),
      { requesterId: row.requesterId, contactName: row.contactName },
    );
  }

  private async postAsRequester(
    scope: AccessScope,
    body: string,
    attachment: StoredChatAttachment | null,
  ): Promise<SendChatMessageResponseDto> {
    const chatId = await this.chats.ensureOpen(scope.homeCompanyId, scope.userId);
    const message = await this.saveMessage(
      { chatId, senderId: scope.userId, body, readSide: 'requester' },
      attachment,
    );
    return this.publish(await this.mustFind(chatId), message, 'requester');
  }

  private async postToChat(
    scope: AccessScope,
    row: SupportChatRow,
    side: ChatSide,
    body: string,
    attachment: StoredChatAttachment | null,
  ): Promise<SendChatMessageResponseDto> {
    // เจ้าหน้าที่คนแรกที่ตอบเป็นผู้รับผิดชอบห้อง — คนอื่นยังตอบได้ แต่กล่องแชทบอกว่าใครดูอยู่
    if (side === 'staff' && row.assigneeId === null) {
      await this.chats.assignIfEmpty(row.id, scope.userId);
    }
    const message = await this.saveMessage(
      { chatId: row.id, senderId: scope.userId, body, readSide: side },
      attachment,
    );
    return this.publish(await this.mustFind(row.id), message, side);
  }

  /** บันทึกข้อความ — ถ้าบันทึกไม่สำเร็จ ลบไฟล์ที่เพิ่งเขียนลงดิสก์ทิ้ง ไม่ปล่อยเป็นไฟล์กำพร้า */
  private async saveMessage(
    input: { chatId: number; senderId: number; body: string; readSide: ChatSide },
    attachment: StoredChatAttachment | null,
  ): Promise<SupportChatMessageRow> {
    try {
      return await this.chats.addMessage({ ...input, ...(attachment ? { attachment } : {}) });
    } catch (error) {
      if (attachment) await fs.unlink(chatFilePath(attachment.key)).catch(() => undefined);
      throw error;
    }
  }

  /**
   * ผู้ใช้เข้าห้องนี้ได้ในฐานะอะไร
   *
   * ⚠️ ห้องที่เข้าไม่ได้ตอบ 404 ไม่ใช่ 403 — เหมือนกฎของ ticket (US-07 AC-2)
   *    การตอบ 403 ยืนยันว่ามีห้องหมายเลขนั้นอยู่จริง ซึ่งไล่เดาได้
   */
  private async access(
    scope: AccessScope,
    id: number,
  ): Promise<{ row: SupportChatRow; side: ChatSide }> {
    const row = await this.chats.findById(id);

    /*
     * ⚠️ ห้องจาก widget ไม่มีฝั่ง "ผู้ถาม" ใน Helpdesk เลย แม้จะถูกจับคู่กับบัญชีแล้ว
     *
     *    บทสนทนานั้นอยู่ใน inbox ชนิด Website ซึ่งรับข้อความ incoming ผ่าน API ไม่ได้
     *    (ดู /docs-chatwoot ข้อ 1) ถ้าปล่อยให้เจ้าของบัญชีพิมพ์เข้ามาในฐานะผู้ถาม
     *    ข้อความจะค้างส่งแล้วถูกลองใหม่ทุกรอบตลอดไปโดยไม่มีวันถึงผู้เข้าชม
     *    การจับคู่มีไว้ให้ทีมไอทีรู้ว่าใครถาม ไม่ใช่เปิดช่องพิมพ์ให้เจ้าตัว
     */
    if (row && row.origin !== 'widget' && row.requesterId === scope.userId) {
      return { row, side: 'requester' };
    }
    if (row && scope.has(STAFF_PERMISSION) && scope.inScope(row.companyId)) {
      return { row, side: 'staff' };
    }
    throw new NotFoundError('NOT_FOUND', 'ບໍ່ພົບແຊັດນີ້');
  }

  private async mustFind(id: number): Promise<SupportChatRow> {
    const row = await this.chats.findById(id);
    if (!row) throw new NotFoundError('NOT_FOUND', 'ບໍ່ພົບແຊັດນີ້');
    return row;
  }

  /** ส่งข้อความใหม่ออกไปทุกคนที่เกี่ยวข้องแบบเรียลไทม์ ส่งต่อให้ Chatwoot แล้วคืนผลให้ผู้ส่ง */
  private publish(
    row: SupportChatRow,
    message: SupportChatMessageRow,
    side: ChatSide,
  ): SendChatMessageResponseDto {
    const messageDto = toMessageDto(row, message);
    this.realtime.chatMessage(
      { chatId: row.id, companyId: row.companyId, requesterId: row.requesterId },
      messageDto,
    );
    // ไม่รอผล — Chatwoot ช้าหรือล่มต้องไม่ทำให้แชทใน Helpdesk ช้าตาม ข้อความที่ค้างส่งถูกลองใหม่ทุกรอบ
    this.chatwoot.kick(row.id);
    return {
      chat: this.summary(row, side, toLastMessage(row.id, message)),
      message: messageDto,
    };
  }

  private async thread(row: SupportChatRow, side: ChatSide): Promise<SupportChatThreadDto> {
    const messages = await this.chats.messages(row.id);
    const last = messages.at(-1);
    return {
      ...this.summary(row, side, last ? toLastMessage(row.id, last) : null),
      messages: messages.map((message) => toMessageDto(row, message)),
    };
  }

  private summary(
    row: SupportChatRow,
    viewer: ChatSide,
    last: LastMessageRow | null,
  ): SupportChatSummaryDto {
    const lastAt = row.lastMessageAt.getTime();
    const unseenSince = (readAt: Date | null): boolean => readAt === null || readAt.getTime() < lastAt;

    let preview = '';
    if (last) {
      preview = last.body.length > PREVIEW_LENGTH ? `${last.body.slice(0, PREVIEW_LENGTH)}…` : last.body;
      if (!preview && last.attachmentKind) preview = ATTACHMENT_LABEL[last.attachmentKind];
    }

    const isWidget = row.origin === 'widget';

    return {
      id: row.id,
      status: row.status === 'closed' ? 'closed' : 'open',
      origin: isWidget ? 'widget' : 'helpdesk',
      project:
        row.projectId === null
          ? null
          : { id: row.projectId, code: row.projectCode ?? '', name: row.projectName ?? '' },
      /*
       * ตัวตนของผู้เข้าชมมีเฉพาะห้องจาก widget
       * ⚠️ ส่ง verified ไปด้วยเสมอ — อีเมลที่ยังไม่ยืนยันคือข้อความที่ใครก็พิมพ์ได้
       *    หน้าจอต้องแยกสองอย่างนี้ให้ผู้ใช้เห็น ไม่ใช่แสดงเป็นตัวตนเหมือนกัน
       */
      contact: isWidget
        ? {
            name: row.contactName,
            email: row.contactEmail,
            phone: row.contactPhone,
            verified: row.contactVerified,
          }
        : null,
      company: { id: row.companyId, code: row.companyCode },
      /*
       * requester ไม่เคยเป็น null เพื่อไม่ให้หน้าจอต้องแยกสองกรณี
       * ห้องจาก widget ที่ยังไม่รู้ว่าเป็นใคร ใช้ id 0 ซึ่งไม่มีวันตรงกับบัญชีจริง
       */
      requester:
        row.requesterId === null
          ? {
              id: 0,
              full_name: visitorName(row.contactName),
              department: null,
              job_title: null,
            }
          : {
              id: row.requesterId,
              full_name: row.requesterName ?? '',
              department: row.requesterDepartment,
              job_title: row.requesterJobTitle,
            },
      assignee:
        row.assigneeId !== null ? { id: row.assigneeId, full_name: row.assigneeName ?? '' } : null,
      ticket_id: row.ticketId,
      last_message_at: row.lastMessageAt.toISOString(),
      last_message: last
        ? {
            body: preview,
            from_staff:
              !last.isSystem &&
              !last.fromContact &&
              (last.external || last.senderId !== row.requesterId),
            is_system: last.isSystem,
            attachment_kind: last.attachmentKind,
          }
        : null,
      /*
       * ฝั่งผู้ใช้: ใครก็ตามที่ไม่ใช่ตัวเขาเองส่งล่าสุด = ยังไม่ได้อ่าน
       * last_message_by เป็น null เมื่อคนตอบล่าสุดมาจาก Chatwoot (ไม่มีบัญชีใน Helpdesk)
       * ห้องที่มีแต่ข้อความระบบไม่มีจริง — ห้องถูกสร้างพร้อมข้อความแรกของผู้ใช้เสมอ
       *
       * ⚠️ ห้องจาก widget ใช้เกณฑ์ต่างออกไป — last_message_by เป็น null ทั้งข้อความ
       *    ของผู้เข้าชมและคำตอบของเจ้าหน้าที่ฝั่ง Chatwoot (ไม่มีใครมีบัญชีในระบบเรา)
       *    เทียบกับ requester_id ที่เป็น null ด้วย จะได้ "ยังไม่ได้อ่าน" ทุกกรณี
       *    รวมทั้งตอนที่เจ้าหน้าที่เพิ่งตอบไปเอง จึงต้องดูจากธง from_contact แทน
       */
      unread:
        viewer === 'staff'
          ? (isWidget
              ? (last?.fromContact ?? false)
              : row.lastMessageBy === row.requesterId) && unseenSince(row.staffReadAt)
          : row.lastMessageBy !== row.requesterId && unseenSince(row.requesterReadAt),
      created_at: row.createdAt.toISOString(),
      closed_at: row.closedAt?.toISOString() ?? null,
    };
  }
}

function toLastMessage(chatId: number, message: SupportChatMessageRow): LastMessageRow {
  return {
    chatId,
    body: message.body,
    senderId: message.senderId,
    isSystem: message.isSystem,
    attachmentKind: message.attachment?.kind ?? null,
    external: message.externalSenderName !== null,
    fromContact: message.fromContact,
  };
}

function assertOpen(row: SupportChatRow): void {
  if (row.status !== 'open') {
    throw new ConflictError('CHAT_CLOSED', 'ແຊັດນີ້ປິດແລ້ວ');
  }
}

/**
 * ตัวตนของผู้เข้าชม ณ เวลาที่ยกระดับเป็นเรื่อง
 *
 * null เมื่อห้องไม่ได้มาจาก widget หรือผู้เข้าชมไม่ได้ฝากอะไรไว้เลย
 * ⚠️ ค่านี้อยู่ในคำตอบเท่านั้น ไม่ได้ถูกเขียนลงแถวของ ticket
 */
function contactSnapshot(
  row: SupportChatRow,
): { name: string | null; email: string | null; phone: string | null } | null {
  if (row.origin !== 'widget') return null;
  const snapshot = { name: row.contactName, email: row.contactEmail, phone: row.contactPhone };
  return Object.values(snapshot).some((value) => value !== null) ? snapshot : null;
}

/**
 * หนึ่งห้องผูกกับเรื่องได้เรื่องเดียว
 *
 * ถ้ายอมให้ผูกซ้ำ ข้อความบอกความคืบหน้าจากสองเรื่องจะไหลลงห้องเดียวกัน
 * แล้วผู้ถามจะอ่านว่า "แก้ไขสำเร็จแล้ว" สลับกับ "กำลังดำเนินการ" โดยไม่รู้ว่าของเรื่องไหน
 */
function assertNotLinked(row: SupportChatRow): void {
  if (row.ticketId !== null) {
    throw new ConflictError('CHAT_ALREADY_LINKED', 'ແຊັດນີ້ຖືກຜູກກັບເລື່ອງແຈ້ງແລ້ວ', {
      ticketId: row.ticketId,
    });
  }
}

/**
 * ตรวจและเขียนไฟล์ที่ผู้ใช้อัปโหลด
 *
 * ⚠️ ชนิดไฟล์ตรวจจาก magic bytes ไม่ใช่ Content-Type หรือนามสกุลที่ส่งมา
 */
async function storeFile(
  companyId: number,
  file: UploadedChatFile | undefined,
): Promise<StoredChatAttachment> {
  if (!file || file.size === 0) {
    throw new ValidationError('VALIDATION_ERROR', 'ກະລຸນາເລືອກໄຟລ໌', [
      { field: 'file', message: 'ບໍ່ມີໄຟລ໌ໃນຄຳຂໍ' },
    ]);
  }
  if (file.size > CHAT_MAX_FILE_BYTES) {
    throw new ValidationError('FILE_TOO_LARGE', 'ໄຟລ໌ໃຫຍ່ເກີນ 20 MB', [
      { field: 'file', message: 'ຂະໜາດເກີນກຳນົດ' },
    ]);
  }

  const name = decodeUploadName(file.originalname).slice(0, 255);
  const detected = detectChatFile(file.buffer.subarray(0, 32), name);
  if (!detected) {
    throw new ValidationError('UNSUPPORTED_FILE_TYPE', `ໄຟລ໌ "${name}" ເປັນຊະນິດທີ່ບໍ່ຮອງຮັບ`, [
      { field: 'file', message: 'ຮອງຮັບ ຮູບພາບ · ສຽງ · PDF · zip · ຂໍ້ຄວາມ' },
    ]);
  }
  return writeChatFile(companyId, detected, name, file.buffer);
}

/**
 * ตัดช่องว่างหัวท้าย — ข้อความที่มีแต่ช่องว่างผ่าน @MinLength(1) ได้ แต่ไม่ใช่ข้อความจริง
 * @param allowEmpty true เมื่อมีไฟล์มาด้วย — ส่งรูปหรือเสียงอย่างเดียวได้
 */
function cleanBody(raw: string, allowEmpty: boolean): string {
  const body = raw.trim();
  if ((!allowEmpty && body.length === 0) || body.length > SUPPORT_CHAT_MAX_BODY) {
    throw new ValidationError('VALIDATION_ERROR', 'ກະລຸນາພິມຂໍ້ຄວາມ', [
      { field: 'body', message: `ພິມໄດ້ 1–${SUPPORT_CHAT_MAX_BODY} ຕົວອັກສອນ` },
    ]);
  }
  return body;
}
