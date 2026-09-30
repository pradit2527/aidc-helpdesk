import { Injectable, Logger } from '@nestjs/common';

import { NOTIFICATION_EVENT, NotificationProducer } from './notification-producer.service';

/**
 * สิทธิ์ที่นิยามว่า "คนที่ทำงานกับเรื่องได้"
 *
 * ใช้ตัวเดียวกับ TicketRepository.ticketWorkers และ assignableUsers โดยตั้งใจ —
 * คนที่ระบบเสนอให้มอบหมายงานได้ กับคนที่ควรรู้ว่ามีงานเข้าคิว ต้องเป็นชุดเดียวกัน
 * ถ้าแยกกฎกันวันหนึ่งจะมีคนที่มอบหมายได้แต่ไม่เคยรู้ว่ามีอะไรรออยู่
 */
const TICKET_WORKER_PERMISSION = 'ticket.change_status';

/**
 * แจ้งเตือนงานประจำวัน — มีงานเข้า · ได้รับมอบหมาย · มีคนตอบกลับ
 *
 * ── ทำไมต้องมีไฟล์นี้ ──
 *
 * IncidentAlertService ครอบคลุมเฉพาะข่าวร้าย: เหตุร้ายแรง · ใกล้เกินกำหนด ·
 * เกินกำหนด · ค้างอนุมัติ ทั้งสี่อย่างเกิด "หลัง" จากที่งานถูกปล่อยทิ้งไว้แล้ว
 *
 * วัดจากฐานข้อมูลจริงเมื่อ 30 ก.ย. 2569 — การแจ้งเตือนทั้งระบบ 307 รายการ
 * เป็น sla_breached ทั้งหมด ไม่มีสักรายการที่บอกว่า "มีงานเข้ามา" หรือ
 * "งานนี้เป็นของคุณ" ผลที่ตามมาคือ 11 เรื่องค้างอยู่ที่สถานะ "ใหม่" และ
 * เกินกำหนดทุกใบ แล้วระบบก็ยิงข่าวเกินกำหนดใส่คนที่ไม่เคยรู้มาก่อนว่ามีเรื่องนั้นอยู่
 *
 * สามเหตุการณ์ในไฟล์นี้คือข่าวที่มาถึง "ก่อน" นาฬิกา SLA จะหมด
 *
 * ⚠️ ยังเป็นการแจ้งในแอปอย่างเดียว เหมือน IncidentAlertService
 *    ตราบใดที่ยังไม่มี SMTP หรือ LINE token ข้อความจะไปไม่ถึงคนที่ไม่ได้เปิดเว็บทิ้งไว้
 *    ซึ่งตอนนี้คือเกือบทุกคน (7 วันล่าสุดมีคนล็อกอิน 2 จาก 14) — ต้องบอกตรง ๆ
 *    ไม่ใช่ถือว่าปัญหาการแจ้งเตือนถูกแก้แล้วเพราะแถวถูกเขียนลงตาราง
 */
@Injectable()
export class WorkAlertService {
  private readonly logger = new Logger('WorkAlert');

  constructor(private readonly notifications: NotificationProducer) {}

  /**
   * มีเรื่องใหม่เข้าคิว — บอกทุกคนที่รับงานของบริษัทนั้นได้
   *
   * ไม่ใช่การมอบหมาย แต่เป็นการเปิดไฟว่ามีของเข้ามา ใครหยิบก่อนก็ได้
   * (ถ้าวันหนึ่งมีการจ่ายงานอัตโนมัติแล้ว ข่าวนี้จะถูกแทนที่ด้วย ticketAssigned
   *  สำหรับเรื่องที่จ่ายได้ และเหลือไว้เฉพาะเรื่องที่ระบบหาคนรับไม่ได้)
   */
  async ticketOpened(input: {
    ticketId: number;
    ticketNo: string;
    companyId: number;
    subject: string;
    priority: string;
    /** คนที่กดแจ้ง — ไม่ต้องบอกเขาว่ามีเรื่องที่ตัวเองเพิ่งแจ้ง */
    actorId: number;
  }): Promise<void> {
    try {
      const workers = await this.notifications.usersWithPermission(
        input.companyId,
        TICKET_WORKER_PERMISSION,
      );
      const recipients = workers.filter((id) => id !== input.actorId);

      if (recipients.length === 0) {
        /*
         * ไม่มีใครรับแจ้ง = ตั้งค่าไม่ครบ ไม่ใช่เรื่องปกติ — เรื่องที่แจ้งเข้ามา
         * จะไม่มีใครรู้เลยจนกว่าจะเลยกำหนด ซึ่งเป็นอาการที่เจอในข้อมูลจริงแล้ว
         */
        this.logger.warn(
          `เรื่องใหม่ ${input.ticketNo} ไม่มีผู้รับแจ้ง — ` +
            `บริษัท ${input.companyId} ยังไม่มีใครถือสิทธิ์ ${TICKET_WORKER_PERMISSION} ในขอบเขตนี้`,
        );
        return;
      }

      await this.notifications.notify({
        userIds: recipients,
        ticketId: input.ticketId,
        eventType: NOTIFICATION_EVENT.ticketCreated,
        title: `[${input.priority}] ເລື່ອງໃໝ່ເຂົ້າຄິວ ${input.ticketNo}`,
        body: input.subject,
      });
    } catch (error) {
      this.fail('เรื่องใหม่', input.ticketNo, error);
    }
  }

  /**
   * เรื่องถูกมอบให้ใครสักคน — บอกคนนั้น
   *
   * ข้ามเมื่อรับเรื่องเอง (actor = assignee) เพราะเขาเพิ่งกดเองเมื่อวินาทีที่แล้ว
   * การแจ้งกลับไปหาคนที่เพิ่งกดทำให้กระดิ่งมีแต่เสียงของตัวเอง แล้วคนจะเลิกดูมัน
   */
  async ticketAssigned(input: {
    ticketId: number;
    ticketNo: string;
    subject: string;
    assigneeId: number | null;
    actorId: number;
  }): Promise<void> {
    if (input.assigneeId === null || input.assigneeId === input.actorId) return;

    try {
      await this.notifications.notify({
        userIds: [input.assigneeId],
        ticketId: input.ticketId,
        eventType: NOTIFICATION_EVENT.ticketAssigned,
        title: `ເລື່ອງນີ້ເປັນຂອງທ່ານແລ້ວ ${input.ticketNo}`,
        body: input.subject,
        // ถูกดึงไปให้คนอื่นแล้วถูกมอบกลับมาในวันเดียวกัน = ข่าวใหม่จริง ๆ
        renotifyIfRead: true,
      });
    } catch (error) {
      this.fail('มอบหมายงาน', input.ticketNo, error);
    }
  }

  /**
   * มีคนตอบกลับในเรื่อง — บอก "อีกฝ่าย" ไม่ใช่บอกทุกคน
   *
   *   ผู้แจ้งพิมพ์      → บอกผู้รับผิดชอบ ถ้ายังไม่มีใครรับ บอกทั้งคิว
   *   เจ้าหน้าที่พิมพ์   → บอกผู้แจ้ง
   *
   * ⚠️ คอมเมนต์ภายในห้ามไปถึงผู้แจ้งเด็ดขาด (US-02 AC-3)
   *    หัวข้อการแจ้งเตือนพาเนื้อความติดไปด้วย การส่งคอมเมนต์ภายในให้ผู้แจ้ง
   *    คือการรั่วข้อมูลที่เขาเปิดดูในระบบไม่ได้ ผ่านช่องทางที่ไม่มีใครตรวจ
   */
  async ticketReplied(input: {
    ticketId: number;
    ticketNo: string;
    companyId: number;
    subject: string;
    requesterId: number;
    assigneeId: number | null;
    authorId: number;
    isInternal: boolean;
  }): Promise<void> {
    try {
      const recipients = await this.replyRecipients(input);
      if (recipients.length === 0) return;

      const fromRequester = input.authorId === input.requesterId;
      await this.notifications.notify({
        userIds: recipients,
        ticketId: input.ticketId,
        eventType: NOTIFICATION_EVENT.ticketReplied,
        title: fromRequester
          ? `ຜູ້ແຈ້ງຕອບກັບມາ ${input.ticketNo}`
          : `ທີມໄອທີຕອບກັບແລ້ວ ${input.ticketNo}`,
        body: input.subject,
        // การตอบกลับเกิดซ้ำได้หลายครั้งต่อวัน และแต่ละครั้งคือข่าวใหม่
        renotifyIfRead: true,
      });
    } catch (error) {
      this.fail('ตอบกลับ', input.ticketNo, error);
    }
  }

  private async replyRecipients(input: {
    companyId: number;
    requesterId: number;
    assigneeId: number | null;
    authorId: number;
    isInternal: boolean;
  }): Promise<number[]> {
    const fromRequester = input.authorId === input.requesterId;

    if (fromRequester) {
      // ยังไม่มีเจ้าของ → ปลุกทั้งคิว ดีกว่าปล่อยให้คำตอบของผู้แจ้งค้างโดยไม่มีใครเห็น
      const targets =
        input.assigneeId !== null
          ? [input.assigneeId]
          : await this.notifications.usersWithPermission(input.companyId, TICKET_WORKER_PERMISSION);
      return targets.filter((id) => id !== input.authorId);
    }

    // เจ้าหน้าที่พิมพ์: คอมเมนต์ภายในเป็นบันทึกของทีม ไม่ใช่คำตอบถึงผู้แจ้ง
    if (input.isInternal) {
      return input.assigneeId !== null && input.assigneeId !== input.authorId
        ? [input.assigneeId]
        : [];
    }

    return input.requesterId === input.authorId ? [] : [input.requesterId];
  }

  private fail(what: string, ticketNo: string, error: unknown): void {
    // งานหลักสำเร็จไปแล้วเสมอเมื่อมาถึงจุดนี้ — การแจ้งเตือนที่ล้มต้องไม่ทำให้มันดูเหมือนล้ม
    this.logger.error(
      `แจ้งเตือน "${what}" ของเรื่อง ${ticketNo} ไม่สำเร็จ: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
