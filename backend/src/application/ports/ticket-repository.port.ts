import type { AccessScope } from '../../common/scope';
import type { TicketEntity } from '../../domain/ticket/ticket.entity';

/**
 * สัญญาที่ชั้นเก็บข้อมูลต้องทำตาม
 *
 * use case พึ่ง interface นี้ ไม่ได้พึ่ง class ที่ต่อ Postgres จริง
 * ผลที่ได้จริง ๆ สองอย่าง
 *   1. เทสต์กฎธุรกิจได้โดยไม่ต้องมีฐานข้อมูล — ใส่ตัวปลอมที่ทำ interface นี้
 *      เทสต์ "แจ้งเรื่องนอกเวลางาน นาฬิกาต้องเริ่มวันจันทร์" จึงรันได้ในไม่กี่มิลลิวินาที
 *      แทนที่จะต้องเตรียมฐานข้อมูลทั้งชุด
 *   2. เปลี่ยนวิธีเก็บข้อมูลได้โดยไม่แตะกฎธุรกิจ
 *
 * ⚠️ TypeScript interface หายไปตอนคอมไพล์ NestJS จึงฉีดตาม interface ตรง ๆ ไม่ได้
 *    ต้องใช้ token ด้านล่างเป็นตัวอ้างอิงแทน
 */
export const TICKET_REPOSITORY = Symbol('TICKET_REPOSITORY');

export interface TicketListFilter {
  companyIds?: readonly number[] | null;
  status?: readonly string[];
  priority?: readonly string[];
  ticketType?: string | undefined;
  assigneeId?: number | undefined;
  requesterId?: number | undefined;
  unassigned?: boolean;
  q?: string | undefined;
  page: number;
  pageSize: number;
}

/**
 * แถวดิบจากฐานข้อมูล
 *
 * ประกาศเป็น unknown โดยตั้งใจ — ชั้น use case ไม่ควรรู้รูปร่างของแถวใน DB
 * ตัวที่รู้คือ presentation ซึ่งเป็นผู้แปลงเป็น DTO
 * ถ้าประกาศชนิดจริงตรงนี้ ชนิดของ Drizzle จะรั่วขึ้นมาถึงชั้นที่ควรไม่รู้จัก ORM
 */
export type TicketRowLike = unknown;

/**
 * หน่วยงานที่ทำหลายคำสั่งให้สำเร็จหรือล้มเหลวพร้อมกัน
 *
 * ประกาศเป็น interface ที่ไม่ผูกกับ Drizzle เพื่อไม่ให้ชนิดของ ORM
 * รั่วขึ้นไปถึงชั้น use case ซึ่งจะทำให้เปลี่ยน ORM ไม่ได้อีกเลย
 */
export interface UnitOfWork {
  run<T>(work: (tx: unknown) => Promise<T>): Promise<T>;
}

export interface ITicketRepository {
  /** รายการที่อยู่ในขอบเขตของผู้เรียกเท่านั้น — กรองที่ชั้น query ไม่ใช่ที่ UI */
  list(
    scope: AccessScope,
    filter: TicketListFilter,
  ): Promise<{ rows: TicketRowLike[]; total: number }>;

  /**
   * หาเรื่องเดียวตาม id
   * ⚠️ เรื่องที่อยู่นอกขอบเขตต้องคืนเหมือนไม่มีอยู่จริง (404 ไม่ใช่ 403)
   *    มิฉะนั้นผู้เรียกจะเดาได้ว่าเลขไหนมีข้อมูลอยู่
   */
  findById(scope: AccessScope, id: number): Promise<unknown>;

  /** บันทึกเรื่องใหม่พร้อมออกเลขที่และเขียนประวัติแถวแรก ในทรานแซกชันเดียว */
  create(
    entity: TicketEntity,
    sla: {
      policyId: number | null;
      clockStartedAt: Date;
      responseDueAt: Date | null;
      resolutionDueAt: Date | null;
    },
    actorId: number,
  ): Promise<number>;

  /** บันทึกการเปลี่ยนสถานะพร้อมเขียนประวัติ ในทรานแซกชันเดียว */
  saveStatusChange(
    entity: TicketEntity,
    change: { from: string; to: string; actorId: number; reason?: string },
  ): Promise<void>;

  /** บันทึกการทบทวนระดับความสำคัญพร้อมเขียนประวัติ ในทรานแซกชันเดียว */
  savePriorityChange(
    entity: TicketEntity,
    change: {
      fromPriority: string;
      toPriority: string;
      actorId: number;
      reason: string;
      sla: {
        policyId: number | null;
        responseDueAt: Date | null;
        resolutionDueAt: Date | null;
      };
    },
  ): Promise<void>;
}
