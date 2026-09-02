import {
  computePriority,
  type Impact,
  type Priority,
  type TicketStatus,
  type Urgency,
} from '../../common/constants';
import { ConflictError, DomainError, ValidationError } from '../../common/errors/domain-error';

/**
 * ── ชั้นโดเมน ────────────────────────────────────────────────────────────
 *
 * ไฟล์นี้เป็น TypeScript ล้วน ไม่ import NestJS, Drizzle, Express หรือฐานข้อมูลใด ๆ
 * ทดสอบได้โดยไม่ต้องบูตอะไรเลย — `new TicketEntity(...)` แล้วเรียกเมท็อดได้ทันที
 *
 * ทำไมกฎธุรกิจต้องอยู่ที่นี่ ไม่ใช่ที่ service
 *   กฎอย่าง "ปิดเรื่องที่ยังไม่ได้แก้ไม่ได้" ต้องเป็นจริงเสมอ ไม่ว่าคำสั่งจะมาจาก
 *   REST controller, งานปิดอัตโนมัติตอนกลางคืน, หรือสคริปต์นำเข้าข้อมูลเก่า
 *   ถ้ากฎอยู่ที่ service ของ REST ทางเข้าอื่นจะข้ามมันไปได้เงียบ ๆ
 *   และไม่มีใครรู้จนกว่าจะเจอข้อมูลที่ผิดกฎอยู่ในฐานข้อมูลจริง
 */

/** ค่าที่ต้องมีตอนสร้างเรื่องใหม่ */
export interface NewTicketProps {
  companyId: number;
  categoryId: number;
  requesterId: number;
  createdBy: number;
  subject: string;
  description: string;
  impact: Impact;
  urgency: Urgency;
  ticketType?: 'incident' | 'service_request' | 'problem' | 'change';
  channel?: string;
  departmentId?: number | null;
  catalogItemId?: number | null;
  serviceId?: number | null;
  sourceDevice?: string | null;
  assetTag?: string | null;
}

/** สถานะทั้งหมดของเรื่องหนึ่งเรื่อง รวมค่าที่มีเฉพาะเรื่องที่บันทึกแล้ว */
export interface TicketProps extends NewTicketProps {
  id?: number;
  ticketNo?: string;
  status: TicketStatus;
  priority: Priority;
  isSecurityIncident?: boolean;
  isMajorIncident?: boolean;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  closedBy?: number | null;
  priorityChangedAt?: Date | null;
  /** เหตุผลที่พักเรื่องไว้รอผู้แจ้ง — ล้างเมื่อกลับมาทำต่อ */
  pendingReason?: string | null;
  /** เวลาที่เริ่มพัก ใช้คำนวณว่าหยุดนาฬิกาไปกี่นาที */
  pendingStartedAt?: Date | null;
  /** นาทีที่หยุดนาฬิกาสะสม — บวกกลับเข้ากำหนดเวลาเมื่อคำนวณใหม่ (SLA 5.4) */
  pendingDurationMinutes: number;
}

const MIN_SUBJECT_LENGTH = 5;
const MAX_SUBJECT_LENGTH = 200;

/**
 * สถานะไหนไปสถานะไหนได้บ้าง
 *
 * ลอกมาจากแผนภาพสถานะใน docs/02-data-model.md ตรง ๆ ทุกเส้น
 * เขียนเป็นตารางแทน if ซ้อนกัน เพื่อให้เทียบกับเอกสารได้ทีละบรรทัด
 * โดยไม่ต้องไล่ตรรกะ — ถ้าเอกสารเปลี่ยน จุดที่ต้องแก้มีที่เดียว
 */
const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  // ไป pending_user ได้ตั้งแต่ยังไม่มอบหมาย สำหรับคำขอที่ต้องรออนุมัติก่อน
  new: ['assigned', 'pending_user', 'cancelled'],
  assigned: ['in_progress', 'pending_user', 'cancelled'],
  in_progress: ['pending_user', 'resolved', 'cancelled'],
  // ไป closed ตรง ๆ ได้ กรณีติดตาม 2 ครั้งแล้วไม่ตอบจนครบ 3 วันทำการ (G-09)
  pending_user: ['in_progress', 'closed', 'cancelled'],
  resolved: ['closed', 'in_progress'],
  // เปิดซ้ำได้ภายใน 7 วันเท่านั้น — ดู assertReopenWindow
  closed: ['in_progress'],
  cancelled: [],
};

/** สถานะที่ถือว่าจบแล้ว นาฬิกา SLA หยุดเดิน */
const TERMINAL_STATUSES: readonly TicketStatus[] = ['closed', 'cancelled'];

/**
 * เปิดซ้ำได้ภายในกี่วันหลังปิด
 *
 * เกินจากนี้ต้องแจ้งเรื่องใหม่ เพราะการเปิดเรื่องเก่าที่ปิดไปนานแล้ว
 * จะทำให้ตัวเลข "เวลาเฉลี่ยในการแก้" ของเดือนที่ปิดไปแล้วเปลี่ยนย้อนหลัง
 * และรายงานที่ส่งผู้บริหารไปแล้วจะไม่ตรงกับที่ระบบแสดงในภายหลัง
 */
const REOPEN_WINDOW_DAYS = 7;

export class TicketEntity {
  private props: TicketProps;

  private constructor(props: TicketProps) {
    this.props = props;
  }

  /**
   * สร้างเรื่องใหม่
   *
   * ⚠️ ไม่มีทางกำหนด priority เองได้ ทั้งตอนสร้างและตอนแก้ —
   *    มันคำนวณจาก impact × urgency เสมอ ตามข้อ 4 ของเอกสาร SLA
   *    ถ้าเปิดให้ส่งเข้ามา ผู้แจ้งทุกคนจะเลือก P1 แล้วตัวเลข SLA
   *    จะไม่สะท้อนความจริงอีกต่อไป
   */
  static create(props: NewTicketProps): TicketEntity {
    TicketEntity.assertSubject(props.subject);
    TicketEntity.assertDescription(props.description);

    const priority = computePriority(props.impact, props.urgency);

    return new TicketEntity({
      ...props,
      status: 'new',
      priority,
      // P1 คือเหตุการณ์ร้ายแรงตามนิยาม จึงตั้งธงตั้งแต่แรกโดยไม่ต้องรอใครกด
      // ถ้ารอให้กดเอง เรื่อง P1 ที่แจ้งตอนกลางคืนจะไม่ถูกนับเป็นเหตุร้ายแรง
      // ในรายงาน ทั้งที่มันเข้าเกณฑ์ทุกข้อ
      isMajorIncident: priority === 'P1',
      pendingDurationMinutes: 0,
    });
  }

  /** ประกอบกลับจากแถวในฐานข้อมูล — ไม่ตรวจกฎ เพราะข้อมูลผ่านมาแล้วตอนบันทึก */
  static rehydrate(props: TicketProps): TicketEntity {
    return new TicketEntity(props);
  }

  get isMajorIncident(): boolean {
    return this.props.isMajorIncident ?? false;
  }

  get id(): number | undefined {
    return this.props.id;
  }
  get ticketNo(): string | undefined {
    return this.props.ticketNo;
  }
  get status(): TicketStatus {
    return this.props.status;
  }
  get priority(): Priority {
    return this.props.priority;
  }
  get impact(): Impact {
    return this.props.impact;
  }
  get urgency(): Urgency {
    return this.props.urgency;
  }
  get companyId(): number {
    return this.props.companyId;
  }
  get requesterId(): number {
    return this.props.requesterId;
  }
  get isSecurityIncident(): boolean {
    return this.props.isSecurityIncident ?? false;
  }

  /** นาฬิกา SLA ของ P1 นับต่อเนื่อง 24×7 ที่เหลือนับเฉพาะนาทีทำการ */
  get usesCalendarClock(): boolean {
    return this.props.priority === 'P1';
  }

  get isTerminal(): boolean {
    return TERMINAL_STATUSES.includes(this.props.status);
  }

  get isPending(): boolean {
    return this.props.status === 'pending_user';
  }

  get pendingStartedAt(): Date | null {
    return this.props.pendingStartedAt ?? null;
  }

  get pendingDurationMinutes(): number {
    return this.props.pendingDurationMinutes;
  }

  /**
   * การเปลี่ยนไปสถานะนี้ทำให้ "เลิกพัก" หรือไม่
   *
   * ผู้เรียกต้องถามก่อนเปลี่ยนสถานะ เพราะการคำนวณว่าหยุดนาฬิกาไปกี่นาที
   * ต้องใช้ปฏิทินวันทำการซึ่งอยู่นอกชั้นโดเมน entity จึงบอกได้แค่ว่า
   * "ต้องคำนวณไหม" ส่วน "กี่นาที" เป็นหน้าที่ของ use case
   */
  willResumeFromPending(next: TicketStatus): boolean {
    return this.isPending && next !== 'pending_user';
  }

  /**
   * เปลี่ยนสถานะตามตารางที่อนุญาต
   *
   * `resolvedAt` ถูกตั้งที่นี่ ไม่ใช่ที่ service เพราะ "แก้เสร็จเมื่อไร"
   * เป็นส่วนหนึ่งของความหมายของการเปลี่ยนเป็น resolved ไม่ใช่ผลข้างเคียง
   * ถ้าแยกกัน วันหนึ่งจะมีทางเข้าที่เปลี่ยนสถานะแล้วลืมตั้งเวลา
   */
  changeStatus(
    next: TicketStatus,
    at: Date,
    options: {
      /** นาทีที่หยุดนาฬิกาในช่วงพักรอบนี้ — use case คำนวณจากปฏิทินมาให้ */
      pausedMinutesToAdd?: number;
      pendingReason?: string | null;
      actorId?: number;
    } = {},
  ): void {
    if (next === this.props.status) {
      throw new ConflictError(
        'TICKET_STATUS_UNCHANGED',
        'ສະຖານະໃໝ່ຊ້ຳກັບສະຖານະປັດຈຸບັນ',
        { current: this.props.status },
      );
    }

    const allowed = ALLOWED_TRANSITIONS[this.props.status];
    if (!allowed.includes(next)) {
      throw new ConflictError(
        'TICKET_INVALID_TRANSITION',
        `ປ່ຽນສະຖານະຈາກ "${this.props.status}" ໄປ "${next}" ບໍ່ໄດ້`,
        { from: this.props.status, to: next, allowed },
      );
    }

    if (this.props.status === 'closed') this.assertReopenWindow(at);

    // สะสมนาทีที่หยุดนาฬิกาก่อนเปลี่ยนสถานะ มิฉะนั้น isPending
    // จะเป็นเท็จไปแล้วตอนที่ต้องใช้ค่านี้
    if (this.willResumeFromPending(next) && options.pausedMinutesToAdd) {
      this.props.pendingDurationMinutes += options.pausedMinutesToAdd;
    }

    this.props.status = next;

    if (next === 'pending_user') {
      this.props.pendingReason = options.pendingReason ?? null;
      this.props.pendingStartedAt = at;
    } else {
      this.props.pendingReason = null;
      this.props.pendingStartedAt = null;
    }

    if (next === 'resolved') this.props.resolvedAt = at;

    if (next === 'closed') {
      this.props.closedAt = at;
      this.props.closedBy = options.actorId ?? null;
    } else {
      // ปิดแล้วเปิดใหม่ ต้องล้างผู้ปิดออก มิฉะนั้นเรื่องที่ยังเปิดอยู่
      // จะมีชื่อคนปิดค้างไว้ ซึ่งอ่านแล้วเข้าใจผิดทั้งในหน้าจอและในรายงาน
      this.props.closedAt = null;
      this.props.closedBy = null;
    }

    // กลับมาทำต่อ = ยังไม่จบ ต้องล้างเวลาที่เคยบันทึกไว้
    // มิฉะนั้นรายงาน "เวลาเฉลี่ยในการแก้" จะนับรอบแรกที่ถูกตีกลับด้วย
    if (next === 'in_progress') this.props.resolvedAt = null;
  }

  /**
   * ทบทวนระดับความสำคัญด้วยการแก้ impact หรือ urgency
   *
   * ตั้งใจไม่มีเมท็อด setPriority() — ระดับความสำคัญเป็นผลลัพธ์ ไม่ใช่ค่ารับเข้า
   * ผู้ใช้ที่ต้องการยกระดับต้องบอกว่า "กระทบกว้างขึ้น" หรือ "ด่วนขึ้น"
   * ซึ่งเป็นข้อเท็จจริงที่ตรวจสอบย้อนหลังได้ ต่างจากการเลือก P1 ลอย ๆ
   */
  reassess(impact: Impact, urgency: Urgency, at: Date): { from: Priority; to: Priority } {
    if (this.isTerminal) {
      throw new ConflictError(
        'TICKET_ALREADY_CLOSED',
        'ເລື່ອງທີ່ປິດແລ້ວ ທົບທວນລະດັບຄວາມສຳຄັນບໍ່ໄດ້',
        { status: this.props.status },
      );
    }

    const from = this.props.priority;
    const to = computePriority(impact, urgency);

    this.props.impact = impact;
    this.props.urgency = urgency;
    this.props.priority = to;
    this.props.priorityChangedAt = at;

    /*
     * ยกระดับเป็น P1 ตั้งธงเหตุร้ายแรง แต่ลดระดับลงมาไม่ปลดธง
     *
     * เพราะกระบวนการรับมือเหตุร้ายแรงเริ่มไปแล้ว — แจ้งผู้บริหาร ตั้งวอร์รูม
     * บันทึกเหตุการณ์ การปลดธงจะทำให้เรื่องนั้นหายไปจากรายงานเหตุร้ายแรง
     * ทั้งที่กระบวนการเกิดขึ้นจริง การปลดธงต้องเป็นการตัดสินใจที่ชัดเจนแยกต่างหาก
     */
    if (to === 'P1') this.props.isMajorIncident = true;

    return { from, to };
  }

  /** ค่าที่จะเขียนลงฐานข้อมูล — repository เป็นผู้แปลงเป็นชื่อคอลัมน์ */
  toPersistence(): Readonly<TicketProps> {
    return { ...this.props };
  }

  /** เปิดซ้ำได้ภายใน 7 วันหลังปิด เกินจากนั้นต้องแจ้งเรื่องใหม่ */
  private assertReopenWindow(at: Date): void {
    const closedAt = this.props.closedAt;
    if (!closedAt) return;

    const days = (at.getTime() - closedAt.getTime()) / 86_400_000;
    if (days > REOPEN_WINDOW_DAYS) {
      throw new ConflictError(
        'TICKET_REOPEN_WINDOW_EXPIRED',
        `ເລື່ອງນີ້ປິດເກີນ ${REOPEN_WINDOW_DAYS} ວັນແລ້ວ ກະລຸນາແຈ້ງເລື່ອງໃໝ່`,
        { closedAt: closedAt.toISOString(), daysSinceClosed: Math.floor(days) },
      );
    }
  }

  private static assertSubject(subject: string): void {
    const trimmed = subject.trim();
    if (trimmed.length < MIN_SUBJECT_LENGTH) {
      throw new ValidationError('TICKET_SUBJECT_TOO_SHORT', 'ຫົວຂໍ້ສັ້ນເກີນໄປ', [
        { field: 'subject', message: `ຫົວຂໍ້ຕ້ອງຍາວຢ່າງໜ້ອຍ ${MIN_SUBJECT_LENGTH} ຕົວອັກສອນ` },
      ]);
    }
    if (trimmed.length > MAX_SUBJECT_LENGTH) {
      throw new ValidationError('TICKET_SUBJECT_TOO_LONG', 'ຫົວຂໍ້ຍາວເກີນໄປ', [
        { field: 'subject', message: `ຫົວຂໍ້ຕ້ອງບໍ່ເກີນ ${MAX_SUBJECT_LENGTH} ຕົວອັກສອນ` },
      ]);
    }
  }

  private static assertDescription(description: string): void {
    if (description.trim().length === 0) {
      throw new ValidationError('TICKET_DESCRIPTION_REQUIRED', 'ກະລຸນາອະທິບາຍບັນຫາ', [
        { field: 'description', message: 'ກະລຸນາອະທິບາຍບັນຫາ' },
      ]);
    }
  }
}

/** ให้ชั้นบนตรวจชนิดได้โดยไม่ต้อง import class */
export function isTicketDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
