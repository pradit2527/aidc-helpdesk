import {
  AWAITING_CONFIRMATION_STATUSES,
  computePriority,
  isClockRunningStatus,
  isPausedStatus,
  isTerminalStatus,
  WAITING_STATUSES,
  type Impact,
  type Priority,
  type TicketStatus,
  type TicketType,
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
  /**
   * เหตุขัดข้อง หรือ คำขอบริการ — ตัวเลือกเครื่องสถานะทั้งเครื่อง
   *
   * ⚠️ ไม่ใช่ป้ายกำกับอีกต่อไป ตั้งแต่เฟสนี้เป็นต้นไปค่านี้ตัดสินว่า
   *    เรื่องใบนี้เดินตามตารางสถานะชุดไหน (ดู ALLOWED_TRANSITIONS)
   *    เดิมประกาศรับ 'problem' | 'change' ด้วย ซึ่งเป็นค่าที่ CHECK
   *    ck_ticket_type_valid ในฐานข้อมูลปฏิเสธมาตลอด — ตัดออกแล้ว
   */
  ticketType?: TicketType;
  channel?: string;
  departmentId?: number | null;
  catalogItemId?: number | null;
  serviceId?: number | null;
  sourceDevice?: string | null;
  assetTag?: string | null;
  /**
   * โครงการใน AIDC Support Hub ที่เรื่องนี้มาจาก — null = แจ้งในระบบตามปกติ
   *
   * เป็นข้อมูลอ้างอิงล้วน ๆ ไม่มีกฎธุรกิจข้อไหนขึ้นกับมัน (ผู้รับผิดชอบ ระดับ
   * ความสำคัญ และ SLA ยังตัดสินจากบริษัทกับหมวดหมู่เหมือนเดิมทุกข้อ)
   * ผู้เรียกเป็นผู้ตรวจว่าโครงการนั้นมีอยู่จริงและอยู่ในขอบเขตของเขา
   */
  supportProjectId?: number | null;
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
  /** ผู้รับผิดชอบปัจจุบัน — null = ยังไม่มีใครรับ */
  assigneeId?: number | null;
}

const MIN_SUBJECT_LENGTH = 5;
const MAX_SUBJECT_LENGTH = 200;

/**
 * ── เครื่องสถานะสองเครื่อง ────────────────────────────────────────────────
 *
 * ลอกมาจากแผนภาพสถานะใน docs/02-data-model.md ตรง ๆ ทุกเส้น
 * เขียนเป็นตารางแทน if ซ้อนกัน เพื่อให้เทียบกับเอกสารได้ทีละบรรทัด
 * โดยไม่ต้องไล่ตรรกะ — ถ้าเอกสารเปลี่ยน จุดที่ต้องแก้มีที่เดียว
 *
 * ทำไมต้องแยกสองตาราง ไม่ใช่ตารางเดียวที่กว้างพอสำหรับทั้งคู่
 *   เดิมทั้งสองชนิดใช้ตารางเดียวกัน แล้วยัด "รออนุมัติ" กับ "รอผู้ขาย" ลงไปใน
 *   pending_user + pending_reason ผลคือคำถามอย่าง "คำขอบริการกี่ใบค้างรออนุมัติ"
 *   ตอบไม่ได้ด้วย WHERE ธรรมดา ต้องรู้ด้วยว่าต้องดูคอลัมน์ที่สองประกอบ
 *   และไม่มีอะไรกันเหตุขัดข้องไม่ให้ถูกตั้งเป็น "รออนุมัติ" ซึ่งไม่มีความหมาย
 *
 * ค่าที่ชนิดหนึ่งใช้ไม่ได้ ต้องมีคีย์อยู่ในตารางของมันเสมอ (เป็นอาเรย์ว่าง)
 * ไม่ใช่หายไปเฉย ๆ — Record<TicketStatus, …> บังคับให้ครบทุกคีย์ ถ้าวันหนึ่ง
 * มีคนเพิ่มสถานะใหม่ใน TICKET_STATUS ตัวตรวจชนิดจะฟ้องทั้งสองตารางทันที
 */

/**
 * เหตุขัดข้อง (incident) — "ของพัง ทำให้กลับมาใช้ได้"
 *
 * เส้นที่ต้องอธิบายเป็นพิเศษ
 *   in_progress → assigned  โอนทีม / เปลี่ยนผู้รับผิดชอบ สถานะถอยกลับหนึ่งขั้น
 *                           เพราะคนใหม่ยังไม่ได้เริ่มลงมือ (assignTo() เป็นคน
 *                           เปลี่ยนตัวผู้รับผิดชอบ ส่วนเส้นนี้อนุญาต "สถานะ" ให้ถอย)
 *   pending_user → closed   ติดตาม 2 ครั้งแล้วไม่ตอบจนครบ 3 วันทำการ (G-09)
 *                           ⚠️ เส้นนี้ไม่มีในแผนภาพรอบนี้ของ SA แต่คงไว้โดยตั้งใจ
 *                              เพราะมันคือกฎควบคุมที่ SLA 5.4 + SOP-01 ข้อ 9
 *                              บังคับไว้ และมีอยู่ในระบบก่อนการแก้ครั้งนี้
 *                              การลบทิ้งเงียบ ๆ = ปิดกลไกควบคุมโดยไม่มีใครสั่ง
 *                              → รอ SA ยืนยันว่าจะคงไว้หรือตัดออก
 */
const INCIDENT_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  new: ['assigned', 'cancelled'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['assigned', 'pending_user', 'pending_vendor', 'resolved', 'cancelled'],
  pending_user: ['in_progress', 'closed'],
  pending_vendor: ['in_progress'],
  resolved: ['closed', 'in_progress'],
  // เปิดซ้ำได้ภายใน 7 วันเท่านั้น — ดู assertReopenWindow
  closed: ['in_progress'],
  cancelled: [],
  // ── ค่าของสายคำขอบริการ เหตุขัดข้องไม่ใช้ ──
  pending_approval: [],
  rejected: [],
  fulfilled: [],
};

/**
 * คำขอบริการ (service_request) — "ขอให้ไอทีจัดหา/เปลี่ยน/ให้สิทธิ์"
 *
 * เส้นที่ต้องอธิบายเป็นพิเศษ
 *   new → pending_approval  เมื่อรายการใน catalog ตั้ง requires_approval = true
 *   new → assigned          เมื่อไม่ต้องอนุมัติ — มอบทีมตาม catalog ได้เลย
 *   pending_approval → assigned  อนุมัติครบทุกขั้น **และนาฬิกา fulfillment เริ่มนับที่นี่**
 *   pending_approval → rejected  ขั้นใดขั้นหนึ่งถูกปฏิเสธ (comment บังคับที่ระดับ DB)
 *
 * assigned → cancelled และ in_progress → cancelled มีเส้นเหมือนสายเหตุขัดข้อง
 * (SA ยืนยันแล้วว่าที่แผนภาพเดิมไม่มีเส้นนี้เป็นจุดตกหล่น ไม่ใช่ตั้งใจ) — สิทธิ์
 * ยกเลิกยังเป็นของเจ้าหน้าที่เท่านั้นที่จุดนี้ ผู้แจ้งเองยกเลิกได้แค่ก่อนมีคนรับ
 * (ดู ownerMayWithdraw ใน actorMayTransition) เหมือนเดิมทุกประการ
 */
const SERVICE_REQUEST_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  new: ['pending_approval', 'assigned', 'cancelled'],
  pending_approval: ['assigned', 'rejected', 'cancelled'],
  rejected: [],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['pending_user', 'pending_vendor', 'fulfilled', 'cancelled'],
  pending_user: ['in_progress'],
  pending_vendor: ['in_progress'],
  fulfilled: ['closed', 'in_progress'],
  closed: ['in_progress'],
  cancelled: [],
  // ── ค่าของสายเหตุขัดข้อง คำขอบริการไม่ใช้ ──
  resolved: [],
};

const TRANSITIONS_BY_TYPE: Record<TicketType, Record<TicketStatus, readonly TicketStatus[]>> = {
  incident: INCIDENT_TRANSITIONS,
  service_request: SERVICE_REQUEST_TRANSITIONS,
};

/**
 * สถานะ "จบแล้ว" ของแต่ละสาย — ใช้บอกว่างานของเจ้าหน้าที่เสร็จแล้วหรือยัง
 * resolved เป็นของเหตุขัดข้อง · fulfilled เป็นของคำขอบริการ
 */
export const COMPLETION_STATUS: Record<TicketType, TicketStatus> = {
  incident: 'resolved',
  service_request: 'fulfilled',
};

/**
 * สถานะที่มอบหมายผู้รับผิดชอบใหม่ไม่ได้
 *
 * resolved / fulfilled รวมอยู่ด้วยทั้งที่ยังไม่จบ เพราะงานของเจ้าหน้าที่เสร็จแล้ว
 * เหลือแค่รอผู้แจ้งยืนยัน — การย้ายเรื่องช่วงนี้ทำให้ KPI-3 (FCR) นับว่า
 * เปลี่ยนมือทั้งที่ไม่มีใครทำงานต่อจริง ถ้าต้องทำต่อให้เปิดคืนก่อน
 *
 * rejected อยู่ด้วยเพราะเป็นปลายทาง เหมือน closed / cancelled
 */
const UNASSIGNABLE_STATUSES: readonly TicketStatus[] = [
  'resolved',
  'fulfilled',
  'closed',
  'cancelled',
  'rejected',
];

/**
 * เปิดซ้ำได้ภายในกี่วันหลังปิด
 *
 * เกินจากนี้ต้องแจ้งเรื่องใหม่ เพราะการเปิดเรื่องเก่าที่ปิดไปนานแล้ว
 * จะทำให้ตัวเลข "เวลาเฉลี่ยในการแก้" ของเดือนที่ปิดไปแล้วเปลี่ยนย้อนหลัง
 * และรายงานที่ส่งผู้บริหารไปแล้วจะไม่ตรงกับที่ระบบแสดงในภายหลัง
 */
const REOPEN_WINDOW_DAYS = 7;

/**
 * ตารางสถานะของเรื่องชนิดนี้
 *
 * ชนิดที่ไม่รู้จัก (ข้อมูลเก่าหรือค่าที่หลุด CHECK มาได้) ถอยไปใช้ตารางของ
 * เหตุขัดข้อง ซึ่งเป็นค่า default ของคอลัมน์ ticket_type มาตั้งแต่ต้น
 */
export function transitionTableFor(
  ticketType: TicketType | string | undefined,
): Record<TicketStatus, readonly TicketStatus[]> {
  return TRANSITIONS_BY_TYPE[ticketType as TicketType] ?? INCIDENT_TRANSITIONS;
}

/** สถานะที่ไปต่อได้จากสถานะนี้ตามตาราง — ยังไม่ดูว่าใครเป็นคนสั่ง */
export function allowedTransitionsFrom(
  status: TicketStatus,
  ticketType: TicketType | string | undefined = 'incident',
): readonly TicketStatus[] {
  return transitionTableFor(ticketType)[status] ?? [];
}

/** สถานะนี้ใช้กับเรื่องชนิดนี้ได้ไหม — ใช้ค่านี้ตอนทำตัวกรองบนหน้าจอ */
export function statusAppliesTo(status: TicketStatus, ticketType: TicketType): boolean {
  const table = transitionTableFor(ticketType);
  if ((table[status] ?? []).length > 0) return true;
  // ปลายทางมีอาเรย์ว่างเหมือนกับสถานะที่ชนิดนี้ไม่ใช้ จึงต้องดูขาเข้าประกอบ
  return Object.values(table).some((targets) => targets.includes(status));
}

/** ยังอยู่ในช่วงที่เปิดซ้ำได้ไหม — เรื่องที่ยังไม่เคยปิดถือว่าอยู่ในช่วงเสมอ */
export function isWithinReopenWindow(closedAt: Date | null | undefined, at: Date): boolean {
  if (!closedAt) return true;
  return (at.getTime() - closedAt.getTime()) / 86_400_000 <= REOPEN_WINDOW_DAYS;
}

/** สิ่งที่ต้องรู้เกี่ยวกับผู้สั่ง เพื่อตัดสินว่าเปลี่ยนสถานะได้ไหม */
export interface TransitionActor {
  /** เป็นผู้แจ้งของเรื่องนี้ */
  isOwner: boolean;
  /** ticket.change_status — เจ้าหน้าที่ที่ทำงานกับเรื่อง */
  canChangeStatus: boolean;
  /** ticket.cancel */
  canCancel: boolean;
  /** ticket.reopen */
  canReopen: boolean;
}

/**
 * รอบนี้คือการ "เปิดคืน" หรือไม่
 *
 * เปิดคืนได้จากสามสถานะ: resolved (เหตุขัดข้องที่แก้แล้ว) · fulfilled (คำขอที่ส่งมอบแล้ว)
 * · closed (ปิดไปแล้วแต่ยังอยู่ในช่วง 7 วัน) — ทั้งสามใช้สูตรคืนเวลาเดียวกัน (S-03)
 */
export function isReopening(from: TicketStatus, to: TicketStatus): boolean {
  return (
    to === 'in_progress' &&
    (from === 'closed' || (AWAITING_CONFIRMATION_STATUSES as readonly string[]).includes(from))
  );
}

/**
 * ผู้สั่งคนนี้เปลี่ยนจาก from ไป to ได้ไหม
 *
 * ใช้ตัวเดียวกันทั้งตอนตัดสินคำสั่งจริง และตอนบอกหน้าจอว่าจะแสดงปุ่มอะไร
 * ถ้าเขียนแยกสองชุด วันหนึ่งจะมีปุ่มที่กดแล้วถูกปฏิเสธ หรือทางที่ทำได้แต่ไม่มีปุ่มให้กด
 *
 * ผู้แจ้งที่ไม่ใช่เจ้าหน้าที่ทำได้สามอย่างเท่านั้น
 *   - ยืนยันปิดเรื่องที่แก้แล้ว (resolved) หรือที่ส่งมอบแล้ว (fulfilled)
 *   - เปิดเรื่องคืนเมื่อยังพบปัญหาเดิม หรือของที่ได้ไม่ครบ
 *   - ถอนเรื่องที่ยังไม่มีใครรับ (new) หรือที่ยังค้างรออนุมัติอยู่ (pending_approval)
 *     — มีคนรับแล้วต้องคุยกับเจ้าหน้าที่ ไม่ใช่ยกเลิกทิ้งเอง
 * การเปลี่ยนอื่นทั้งหมดเป็นงานของเจ้าหน้าที่
 *
 * ⚠️ `rejected` ไม่มีทางมาจากผู้แจ้ง — มันเป็นผลของการที่ "คนอื่น" พิจารณาแล้วไม่อนุมัติ
 *    ผู้แจ้งที่อยากถอนเรื่องของตัวเองต้องใช้ cancelled ซึ่งอ่านย้อนหลังแล้วต่างกันชัดเจน
 */
export function actorMayTransition(
  from: TicketStatus,
  to: TicketStatus,
  actor: TransitionActor,
  ticketType: TicketType | string | undefined = 'incident',
): boolean {
  if (!allowedTransitionsFrom(from, ticketType).includes(to)) return false;

  if (isReopening(from, to)) return actor.canChangeStatus || (actor.isOwner && actor.canReopen);

  if (to === 'cancelled') {
    const ownerMayWithdraw = from === 'new' || from === 'pending_approval';
    return (actor.canChangeStatus && actor.canCancel) || (actor.isOwner && ownerMayWithdraw);
  }

  // ยืนยันปิดเรื่องที่งานเสร็จแล้ว — ผู้แจ้งทำได้เอง (พร้อมให้คะแนน CSAT)
  if ((AWAITING_CONFIRMATION_STATUSES as readonly string[]).includes(from) && to === 'closed') {
    return actor.canChangeStatus || actor.isOwner;
  }

  return actor.canChangeStatus;
}

/**
 * ── อำนาจมอบหมายงาน ─────────────────────────────────────────────────────
 *
 * โจทย์: "หัวหน้าทีมไอทีกดมอบหมายงานให้คนในทีมตัวเองได้"
 *
 * สิทธิ์ ticket.assign ตอบได้แค่ "มอบหมายเป็นไหม" ไม่ได้ตอบ "มอบให้ใครได้"
 * และในชุดสิทธิ์ตั้งต้น เจ้าหน้าที่ทุกคนถือ ticket.assign อยู่แล้ว ถ้าใช้ตัวนั้น
 * เป็นด่านเดียว ใครก็โยนงานให้ใครก็ได้ ซึ่งเป็นพฤติกรรมที่โจทย์ต้องการเลิก
 *
 * ความเป็นหัวหน้าจึงเก็บเป็นข้อมูล (support_team_member.is_lead) แล้วตัดสินที่นี่
 * — ไม่มี role ใหม่ ไม่มี permission code ใหม่
 */

/** ผู้สั่งมอบหมาย — ทุกค่ามาจาก AccessScope ที่จำไว้แล้ว ไม่ต้องถามฐานข้อมูล */
export interface AssignmentActor {
  userId: number;
  /** ถือ ticket.assign */
  canAssign: boolean;
  /** ถือ user.assign_role — company_admin / super_admin */
  isAdminLevel: boolean;
  /** ทีมที่ผู้สั่งเป็นหัวหน้า เฉพาะทีมที่ยังเปิดใช้งาน */
  ledTeamIds: readonly number[];
}

/** ผู้รับมอบหมาย */
export interface AssignmentTarget {
  userId: number;
  /** ทีมที่ผู้รับสังกัด (เป็นสมาชิกหรือหัวหน้าร่วมก็นับ) เฉพาะทีมที่ยังเปิดใช้งาน */
  teamIds: readonly number[];
}

export type AssignmentDecision =
  | { allowed: true; via: 'self' | 'admin' | 'team_lead' }
  /** ไม่ใช่หัวหน้าทีมและไม่ใช่ผู้ดูแล → 403 */
  | { allowed: false; code: 'NOT_TEAM_LEAD' }
  /** เป็นหัวหน้าจริง แต่คนที่เลือกไม่ได้อยู่ในทีมของตน → 422 */
  | { allowed: false; code: 'ASSIGNEE_NOT_IN_TEAM' };

/**
 * ผู้สั่งคนนี้ "มีอำนาจมอบหมายให้คนอื่น" หรือไม่ (ยังไม่ดูว่าคนที่เลือกเป็นใคร)
 *
 * ใช้ตอนประกอบบล็อก can ของหน้ารายละเอียด — ปุ่ม "มอบหมาย" ต้องขึ้นก็ต่อเมื่อ
 * มีคนให้มอบหมายได้จริง มิฉะนั้นจะเป็นปุ่มที่กดแล้วได้ 403 ทุกครั้ง
 */
export function mayAssignToOthers(actor: Omit<AssignmentActor, 'userId'>): boolean {
  return actor.canAssign && (actor.isAdminLevel || actor.ledTeamIds.length > 0);
}

/**
 * ตัดสินการมอบหมายหนึ่งครั้ง
 *
 * ลำดับการตัดสินสำคัญ
 *   1. รับงานเอง ผ่านเสมอ — สิทธิ์ ticket.assign_self ถูกตรวจไปแล้วที่ use case
 *      และการรับงานเองไม่ใช่การใช้อำนาจเหนือคนอื่น
 *   2. ผู้ดูแล (user.assign_role) มอบให้ใครก็ได้ที่รับเรื่องของบริษัทนั้นได้
 *   3. หัวหน้าทีม มอบให้คนในทีมที่ตนเป็นหัวหน้าเท่านั้น
 *
 * ⚠️ ข้อ 3 ตรวจ "ทีมร่วมกัน" ไม่ใช่ "ผู้รับอยู่ในทีมใดทีมหนึ่ง" — หัวหน้าทีม ก.
 *    ต้องมอบงานให้สมาชิกทีม ข. ไม่ได้ แม้ทั้งสองทีมจะอยู่บริษัทเดียวกัน
 */
export function decideAssignment(
  actor: AssignmentActor,
  target: AssignmentTarget,
): AssignmentDecision {
  if (actor.userId === target.userId) return { allowed: true, via: 'self' };
  if (!actor.canAssign) return { allowed: false, code: 'NOT_TEAM_LEAD' };
  if (actor.isAdminLevel) return { allowed: true, via: 'admin' };
  if (actor.ledTeamIds.length === 0) return { allowed: false, code: 'NOT_TEAM_LEAD' };

  const shared = actor.ledTeamIds.some((id) => target.teamIds.includes(id));
  return shared ? { allowed: true, via: 'team_lead' } : { allowed: false, code: 'ASSIGNEE_NOT_IN_TEAM' };
}

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
  get assigneeId(): number | null {
    return this.props.assigneeId ?? null;
  }
  get isSecurityIncident(): boolean {
    return this.props.isSecurityIncident ?? false;
  }

  /** นาฬิกา SLA ของ P1 นับต่อเนื่อง 24×7 ที่เหลือนับเฉพาะนาทีทำการ */
  get usesCalendarClock(): boolean {
    return this.props.priority === 'P1';
  }

  get ticketType(): TicketType {
    return this.props.ticketType ?? 'incident';
  }

  get isTerminal(): boolean {
    return isTerminalStatus(this.props.status);
  }

  /** นาฬิกา SLA หยุดเดินอยู่ตอนนี้ไหม — ครอบคลุมทุกสถานะใน PAUSED_STATUSES */
  get isPaused(): boolean {
    return isPausedStatus(this.props.status);
  }

  get pendingStartedAt(): Date | null {
    return this.props.pendingStartedAt ?? null;
  }

  get pendingDurationMinutes(): number {
    return this.props.pendingDurationMinutes;
  }

  /**
   * การเปลี่ยนไปสถานะนี้ต้อง "คืนเวลาที่หยุดนับ" เข้ากำหนดแก้เสร็จหรือไม่
   *
   * ผู้เรียกต้องถามก่อนเปลี่ยนสถานะ เพราะการคำนวณว่าหยุดนาฬิกาไปกี่นาที
   * ต้องใช้ปฏิทินวันทำการซึ่งอยู่นอกชั้นโดเมน entity จึงบอกได้แค่ว่า
   * "ต้องคำนวณไหม" ส่วน "กี่นาที" เป็นหน้าที่ของ use case
   *
   * ⚠️ พักสองแบบคืนเวลาไม่เหมือนกัน — นี่คือจุดที่เคยเป็นบั๊กเงียบ
   *
   *   รอคนอื่น (pending_approval / pending_user)
   *     คืนเสมอไม่ว่าจะออกทางไหน เพราะเวลาช่วงนั้นไม่ใช่ของทีมไอทีเลย
   *     แม้จะออกไป closed ก็ยังต้องนับ — เพราะ KPI-3 (FCR) ใช้
   *     pending_duration_minutes = 0 แทนความหมาย "ไม่เคยต้องรอใคร"
   *     ถ้าไม่บวกตรงนี้ เรื่องที่ปิดเพราะผู้แจ้งเงียบจะถูกนับเป็นแก้จบในครั้งเดียว
   *
   *   งานเสร็จรอยืนยัน (resolved / fulfilled)
   *     คืนเฉพาะตอนถูกเปิดคืนเท่านั้น ถ้าเรื่องปิดไปตามปกติ เวลาช่วงนี้
   *     ไม่เคยมีความหมาย เพราะตัววัด SLA คือ resolved_at ไม่ใช่ closed_at
   *     และถ้าบวกตอนปิด ทุกใบที่ปิดจะมี pending_duration_minutes > 0
   *     แล้ว KPI-3 จะร่วงเป็นศูนย์ทั้งกระดาน
   */
  willResumeClock(next: TicketStatus): boolean {
    if (!this.isPaused) return false;
    if ((WAITING_STATUSES as readonly string[]).includes(this.props.status)) {
      // ออกจากการรอคนอื่น — ยกเว้นย้ายไปรอคนอื่นต่อ ซึ่งยังไม่ได้เลิกรอ
      return !isPausedStatus(next);
    }
    // resolved / fulfilled — คืนเวลาเฉพาะตอนที่นาฬิกากลับมาเดินจริง
    return isClockRunningStatus(next);
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

    const allowed = allowedTransitionsFrom(this.props.status, this.ticketType);
    if (!allowed.includes(next)) {
      throw new ConflictError(
        'TICKET_INVALID_TRANSITION',
        `ປ່ຽນສະຖານະຈາກ "${this.props.status}" ໄປ "${next}" ບໍ່ໄດ້`,
        { from: this.props.status, to: next, allowed, ticketType: this.ticketType },
      );
    }

    if (this.props.status === 'closed') this.assertReopenWindow(at);

    /*
     * สะสมนาทีที่หยุดนาฬิกาก่อนเปลี่ยนสถานะ มิฉะนั้น isPaused
     * จะเป็นเท็จไปแล้วตอนที่ต้องใช้ค่านี้
     *
     * การเปิดคืนจาก closed ใช้สูตรเดียวกับการเลิกพัก (S-03) — ช่วงที่เรื่อง
     * ปิดไปแล้วไม่ใช่เวลาที่เจ้าหน้าที่ถือเรื่องไว้ ถ้านับรวม เรื่องที่ผู้แจ้ง
     * ตีกลับหลังผ่านไปสองวันจะเกินกำหนดทันทีที่เปิดคืน
     * (resolved / fulfilled → in_progress ถูก willResumeClock ครอบไว้แล้ว
     *  เพราะทั้งคู่เป็นสถานะพัก closed ไม่ใช่ จึงต้องมีเงื่อนไขนี้เพิ่ม)
     */
    const reopeningFromClosed = this.props.status === 'closed' && next === 'in_progress';
    if ((this.willResumeClock(next) || reopeningFromClosed) && options.pausedMinutesToAdd) {
      this.props.pendingDurationMinutes += options.pausedMinutesToAdd;
    }

    this.props.status = next;

    /*
     * เวลาที่เริ่มพักต้องตั้งให้ "ทุก" สถานะที่หยุดนาฬิกา ไม่ใช่แค่ pending_user
     *
     * เดิมโค้ดตั้งให้เฉพาะ pending_user แล้วล้างทิ้งในทุกสถานะอื่น พอมี
     * pending_approval เข้ามา นาฬิกาจะไม่มีวันหยุดเลยเพราะไม่มีจุดตั้งต้นให้หัก
     * — เป็นบั๊กที่เห็นยากมาก เพราะทุกอย่างยังทำงานได้ ตัวเลขแค่ผิด
     */
    if (isPausedStatus(next)) {
      this.props.pendingStartedAt = at;
    } else {
      this.props.pendingStartedAt = null;
    }

    /*
     * เหตุผลย่อยของการพัก ใช้ได้กับ pending_user อย่างเดียว
     * สถานะอื่นบอกความหมายของตัวเองครบอยู่แล้ว (รออนุมัติ / รอผู้ขาย)
     */
    this.props.pendingReason = next === 'pending_user' ? (options.pendingReason ?? null) : null;

    /*
     * งานของเจ้าหน้าที่เสร็จเมื่อไร — เก็บลง resolved_at ทั้งสองสาย
     *
     * ⚠️ fulfilled ต้องเขียนคอลัมน์นี้ด้วย ห้ามปล่อยว่าง
     *    KPI-1 วัดจาก `resolved_at <= resolution_due_at` ของใบที่ปิดในเดือนนั้น
     *    ถ้าคำขอบริการที่ส่งมอบแล้วมี resolved_at เป็น null ทุกใบจะถูกนับว่า
     *    "ไม่ทัน SLA" ตลอดกาล และตัวเลขที่รายงานผู้บริหารจะผิดทั้งคอลัมน์
     *    ชื่อคอลัมน์อ่านแล้วชวนเข้าใจผิด แต่การเพิ่ม fulfilled_at อีกคอลัมน์
     *    แปลว่าทุกคิวรีที่วัด SLA ต้องเขียน COALESCE ของสองคอลัมน์ตลอดไป
     */
    if ((AWAITING_CONFIRMATION_STATUSES as readonly string[]).includes(next)) {
      this.props.resolvedAt = at;
    }

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
   * มอบหมายผู้รับผิดชอบ
   *
   * เรื่องใหม่ขยับเป็น "มอบหมายแล้ว" ในตัว เพราะความหมายของสถานะนั้นคือ "มีคนรับแล้ว"
   * ถ้าแยกเป็นสองคำสั่ง จะมีช่วงที่มีผู้รับผิดชอบแต่สถานะยังบอกว่าไม่มีใครรับ
   * เรื่องนั้นจะค้างอยู่ในแท็บ "ยังไม่มีคนรับ" ของคิว ทั้งที่มีคนถืออยู่แล้ว
   *
   * สถานะอื่นคงเดิม — ย้ายเรื่องที่กำลังทำหรือพักอยู่ให้คนอื่น ไม่ได้แปลว่าเริ่มใหม่
   */
  assignTo(assigneeId: number): {
    fromAssigneeId: number | null;
    fromStatus: TicketStatus;
    toStatus: TicketStatus;
  } {
    if (UNASSIGNABLE_STATUSES.includes(this.props.status)) {
      throw new ConflictError(
        'TICKET_NOT_ASSIGNABLE',
        'ເລື່ອງທີ່ແກ້ໄຂແລ້ວ ຫຼື ປິດແລ້ວ ມອບໝາຍໃໝ່ບໍ່ໄດ້',
        { status: this.props.status },
      );
    }

    const fromAssigneeId = this.props.assigneeId ?? null;
    if (fromAssigneeId === assigneeId) {
      throw new ConflictError('TICKET_ASSIGNEE_UNCHANGED', 'ຜູ້ນີ້ຮັບຜິດຊອບເລື່ອງນີ້ຢູ່ແລ້ວ', {
        assigneeId,
      });
    }

    const fromStatus = this.props.status;
    this.props.assigneeId = assigneeId;
    if (fromStatus === 'new') this.props.status = 'assigned';

    return { fromAssigneeId, fromStatus, toStatus: this.props.status };
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
    if (!closedAt || isWithinReopenWindow(closedAt, at)) return;

    const days = (at.getTime() - closedAt.getTime()) / 86_400_000;
    throw new ConflictError(
      'TICKET_REOPEN_WINDOW_EXPIRED',
      `ເລື່ອງນີ້ປິດເກີນ ${REOPEN_WINDOW_DAYS} ວັນແລ້ວ ກະລຸນາແຈ້ງເລື່ອງໃໝ່`,
      { closedAt: closedAt.toISOString(), daysSinceClosed: Math.floor(days) },
    );
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
