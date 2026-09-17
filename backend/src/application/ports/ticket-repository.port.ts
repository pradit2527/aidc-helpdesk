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
  /** ลำดับของรายการ — ไม่ระบุ = แก้ไขล่าสุดก่อน (ดู TicketRepository.list) */
  sort?: TicketListSort | undefined;
  page: number;
  pageSize: number;
}

/**
 * ลำดับที่รายการเรื่องรองรับ — ใหม่สุดอยู่บนเสมอทั้งสามแบบ
 *
 *   updated  แก้ไขล่าสุด (ค่าเริ่มต้น)
 *   created  แจ้งเข้ามาล่าสุด — คิว "ยังไม่มีคนรับ" ของหัวหน้าทีม
 *   assigned ถูกมอบหมายให้ผู้รับผิดชอบคนปัจจุบันล่าสุด — คิว "งานของฉัน" ของเจ้าหน้าที่
 */
export type TicketListSort = 'updated' | 'created' | 'assigned';

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

/** ข้อความสาธารณะถึงผู้แจ้งที่ต้องบันทึกในทรานแซกชันเดียวกับคำสั่ง */
export interface PublicCommentRecord {
  body: string;
  /**
   * นับเป็นการตอบรับครั้งแรกหรือไม่ — use case เป็นผู้ตัดสิน
   * repository เขียนเวลาเฉพาะตอนที่ยังว่างอยู่ จึงไม่ทับค่าที่มีแล้ว
   */
  countsAsFirstResponse: boolean;
}

/**
 * ทุกอย่างที่ต้องบันทึกพร้อมกันเมื่อเรื่องเปลี่ยนสถานะหนึ่งครั้ง
 *
 * รวมไว้ในก้อนเดียวเพราะต้องสำเร็จหรือล้มเหลวพร้อมกัน — ถ้าสถานะเปลี่ยนแล้ว
 * แต่ข้อความแจ้งผู้แจ้งหรือบันทึก audit ไม่ถูกเขียน หลักฐานกับความจริงจะไม่ตรงกัน
 */
export interface StatusChangeRecord {
  from: string;
  to: string;
  actorId: number;
  /** เวลาที่เกิดการเปลี่ยน — ใช้เป็น updated_at เวลาในประวัติ และเวลาตอบรับครั้งแรก */
  at: Date;
  /** เหตุผลที่เก็บในประวัติ — บังคับกรณีพัก ยกเลิก และเปิดคืน */
  reason?: string;
  /** กำหนดแก้เสร็จใหม่ — เลื่อนออกเท่าเวลาที่หยุดนับ เมื่อเลิกพักหรือเปิดคืน */
  resolutionDueAt?: Date;
  resolutionNote?: string;
  /** คะแนนความพึงพอใจจากผู้แจ้งตอนยืนยันปิด (1–5) */
  satisfactionScore?: number;
  /** true = รอบนี้คือการเปิดคืน นับเพิ่มใน reopen_count */
  reopened?: boolean;
  /** true = ผู้สั่งถูกตั้งเป็นผู้รับผิดชอบในคำสั่งเดียวกัน (เริ่มงานเรื่องที่ยังไม่มีคนรับ) */
  selfAssigned?: boolean;
  publicComment?: PublicCommentRecord;
  /** รายละเอียดเพิ่มที่เก็บใน audit_log.new_value */
  auditDetail?: Record<string, unknown>;
}

/** ทุกอย่างที่ต้องบันทึกพร้อมกันเมื่อมอบหมายผู้รับผิดชอบหนึ่งครั้ง */
export interface AssignmentRecord {
  ticketId: number;
  companyId: number;
  actorId: number;
  at: Date;
  fromAssigneeId: number | null;
  toAssigneeId: number;
  fromStatus: string;
  toStatus: string;
  reason?: string;
  publicComment?: PublicCommentRecord;
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

  /** บันทึกการเปลี่ยนสถานะพร้อมประวัติ ข้อความถึงผู้แจ้ง และ audit ในทรานแซกชันเดียว */
  saveStatusChange(entity: TicketEntity, change: StatusChangeRecord): Promise<void>;

  /** บันทึกการมอบหมายพร้อมประวัติ ข้อความถึงผู้แจ้ง และ audit ในทรานแซกชันเดียว */
  saveAssignment(change: AssignmentRecord): Promise<void>;

  /** ผู้ที่รับเรื่องของบริษัทนี้ได้ — ถือสิทธิ์ทำงานกับเรื่องและบริษัทอยู่ในขอบเขต */
  assignableUsers(companyId: number): Promise<{ id: number; fullName: string }[]>;

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
