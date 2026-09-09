import { Injectable, Logger } from '@nestjs/common';

import { SuperworkClient, SuperworkApiError, type SuperworkTaskPayload } from './superwork.client';
import { describeMissing, readSuperworkConfig, type SuperworkConfig } from './superwork.config';

/**
 * ส่งเรื่องแจ้งใหม่ขึ้นบอร์ด Super Work
 *
 * ⚠️ กฎข้อเดียวที่สำคัญที่สุด: การส่งล้มเหลวต้องไม่ทำให้การแจ้งเรื่องล้มเหลว
 *
 *    ผู้ใช้กด "ສົ່ງເລື່ອງແຈ້ງ" เพื่อขอความช่วยเหลือ ไม่ใช่เพื่อลงบอร์ดโครงการ
 *    ถ้า Super Work ล่ม เน็ตสะดุด หรือคีย์หมดอายุ แล้วเรื่องแจ้งไม่ถูกบันทึก
 *    เท่ากับ helpdesk ล่มตามระบบอื่นที่ตัวเองไม่ได้ควบคุม
 *
 *    ทุกข้อผิดพลาดจึงจบที่ log ไม่มีทางลอยขึ้นไปถึงผู้เรียก
 *    และเรียกแบบไม่ await ผลจากเส้นทางคำขอของผู้ใช้
 *
 * ⚠️ ไม่มีการเก็บ task id ลงฐานข้อมูล — ตั้งใจ เพราะยังไม่มีคอลัมน์รองรับ
 *    และการเพิ่มคอลัมน์ต้องมี migration ซึ่งเกินขอบเขตที่สั่งไว้
 *    ตัวเชื่อมกลับคือ X-Idempotency-Key ที่เป็นเลขที่ ticket ตรง ๆ
 *    ยิงซ้ำด้วยเลขเดิมจะได้ task เดิมกลับมา ไม่เกิดใบซ้ำ
 */

/** ข้อมูลเท่าที่ต้องใช้แปลงเป็น task — ไม่รับ DTO ทั้งก้อนเพื่อไม่ผูกกับรูปของ API */
export interface TicketForMirror {
  id: number;
  ticket_no: string;
  subject: string;
  description: string;
  priority: string;
  ticket_type: string;
  company: { code: string };
  category: { name_th?: string; name?: string };
  requester: { full_name: string };
  sla: { resolution_due_at?: string | null };
}

/**
 * ระดับความสำคัญของเราเทียบกับของ Super Work
 *
 * P1 คือเหตุที่กระทบทั้งองค์กร จึงตรงกับ SuperHard ที่เป็นระดับบนสุดของเขา
 * ไม่ใช่ High — ถ้าแมป P1 เป็น High จะไม่เหลือระดับให้แยกเหตุร้ายแรงจากงานเร่งด่วนทั่วไป
 */
const PRIORITY_MAP: Record<string, string> = {
  P1: 'SuperHard',
  P2: 'High',
  P3: 'Medium',
  P4: 'Low',
};

/** Super Work ตัดชื่อยาวเอง แต่ตัดเองก่อนได้ผลที่อ่านรู้เรื่องกว่า */
const MAX_TITLE = 180;

@Injectable()
export class SuperworkService {
  private readonly log = new Logger(SuperworkService.name);
  private readonly config: SuperworkConfig;
  private readonly client: SuperworkClient;
  private readonly ready: boolean;

  constructor() {
    this.config = readSuperworkConfig();
    this.client = new SuperworkClient(this.config);

    const missing = describeMissing(this.config);
    this.ready = this.config.enabled && missing.length === 0;

    /*
     * บอกสถานะตอนบูตเสมอ ทั้งตอนเปิดและตอนปิด
     *
     * การเปิดใช้ไว้แต่ขาด env ตัวหนึ่งแล้วเงียบไป คือความล้มเหลวแบบที่
     * ไม่มีใครรู้จนกว่าจะมีคนถามว่า "ทำไม ticket ไม่ขึ้นบอร์ด" อีกสองสัปดาห์
     */
    if (!this.config.enabled) {
      this.log.log('Super Work: ປິດໄວ້ (SUPERWORK_ENABLED ບໍ່ແມ່ນ true)');
    } else if (missing.length > 0) {
      this.log.warn(`Super Work: ເປີດໄວ້ແຕ່ຕັ້ງຄ່າບໍ່ຄົບ — ຂາດ ${missing.join(', ')}`);
    } else {
      this.log.log(
        `Super Work: ພ້ອມສົ່ງ → activity ${this.config.activityId} card ${this.config.cardId}`,
      );
    }
  }

  get isReady(): boolean {
    return this.ready;
  }

  /**
   * ยิงขึ้นบอร์ดแบบไม่รอผล
   *
   * ผู้เรียกได้ผลลัพธ์ทันทีโดยไม่ต้องรอ Super Work ตอบ — เวลาตอบของ helpdesk
   * ไม่ควรผูกกับเวลาตอบของระบบอื่น
   */
  mirrorTicketInBackground(ticket: TicketForMirror): void {
    if (!this.ready) return;
    void this.mirrorTicket(ticket).catch(() => {
      // mirrorTicket จัดการ log เองครบแล้ว ตรงนี้แค่กัน unhandled rejection
    });
  }

  /** ใช้โดยตรงเมื่ออยากรู้ผล เช่นในสคริปต์ทดสอบ */
  async mirrorTicket(ticket: TicketForMirror): Promise<string | null> {
    if (!this.ready) return null;

    const payload = this.buildPayload(ticket);
    const idempotencyKey = `aidc-helpdesk-${ticket.ticket_no}`;

    try {
      const task = await this.client.createTask(payload, idempotencyKey);

      /*
       * เทียบค่าที่ส่งไปกับค่าที่ได้กลับมา
       *
       * Super Work "ทิ้ง point/dueDate/priorityStatus เงียบ ๆ พร้อมตอบ 201"
       * ถ้าพนักงานที่คีย์สวมบทบาทไม่ใช่หัวหน้า activity — สำเร็จแต่ไม่ได้ผลที่ตั้งใจ
       * ถ้าไม่เทียบ จะไม่มีทางรู้เลยว่ากำหนดเวลาที่ตั้งใจส่งไปนั้นหายไป
       */
      if (payload.priorityStatus && task.priorityStatus !== payload.priorityStatus) {
        this.log.warn(
          `Super Work ບໍ່ຮັບ priorityStatus ຂອງ ${ticket.ticket_no} ` +
            `(ສົ່ງ ${payload.priorityStatus} ໄດ້ ${task.priorityStatus ?? 'ບໍ່ມີ'}) — ` +
            'ພະນັກງານທີ່ key ສວມບົດບາດອາດບໍ່ແມ່ນຫົວໜ້າ activity',
        );
      }

      this.log.log(
        `${ticket.ticket_no} → Super Work task ${task.id}` +
          (task.idempotentReplay ? ' (ໃບເດີມ ບໍ່ໄດ້ສ້າງຊ້ຳ)' : ''),
      );
      return task.id;
    } catch (err) {
      if (err instanceof SuperworkApiError) {
        this.log.error(
          `ສົ່ງ ${ticket.ticket_no} ຂຶ້ນ Super Work ບໍ່ສຳເລັດ — ${err.status} ${err.code}: ${err.message}`,
        );
      } else {
        this.log.error(
          `ສົ່ງ ${ticket.ticket_no} ຂຶ້ນ Super Work ບໍ່ສຳເລັດ — ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      return null;
    }
  }

  private buildPayload(ticket: TicketForMirror): SuperworkTaskPayload {
    const title = `${ticket.ticket_no} · ${ticket.subject}`.slice(0, MAX_TITLE);

    const payload: SuperworkTaskPayload = {
      activityId: this.config.activityId,
      cardId: this.config.cardId,
      title,
      members: this.config.memberIds,
      description: this.buildDescription(ticket),
      priorityStatus: PRIORITY_MAP[ticket.priority] ?? 'Medium',
    };

    if (this.config.checkerIds.length > 0) payload.checkers = this.config.checkerIds;

    /*
     * point กับ dueDate ต้องไปคู่กันเสมอ — ส่งอันเดียวได้ 400 point_deadline_pair_required
     * จึงส่งก็ต่อเมื่อตั้ง SUPERWORK_POINT ไว้ และมีกำหนดเวลาแก้ไขจริง
     * กำหนดเวลาที่ไม่ได้ส่งยังอยู่ในคำอธิบายให้คนอ่านเห็นอยู่ดี
     */
    const dueAt = ticket.sla.resolution_due_at;
    if (this.config.point !== null && dueAt) {
      payload.point = this.config.point;
      payload.dueDate = dueAt.slice(0, 10);
    }

    return payload;
  }

  private buildDescription(ticket: TicketForMirror): string {
    const category = ticket.category.name_th ?? ticket.category.name ?? '—';
    const due = ticket.sla.resolution_due_at
      ? new Date(ticket.sla.resolution_due_at).toLocaleString('en-GB', {
          timeZone: 'Asia/Vientiane',
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : 'ບໍ່ໄດ້ກຳນົດ';

    return [
      ticket.description,
      '',
      '———',
      `ເລກທີ: ${ticket.ticket_no}`,
      `ບໍລິສັດ: ${ticket.company.code}`,
      `ໝວດໝູ່: ${category}`,
      `ຜູ້ແຈ້ງ: ${ticket.requester.full_name}`,
      `ລະດັບ: ${ticket.priority}`,
      `ກຳນົດແກ້ໄຂ (SLA): ${due}`,
      `ເປີດເບິ່ງ: ${this.config.appBaseUrl}/tickets/${ticket.id}`,
    ].join('\n');
  }
}
