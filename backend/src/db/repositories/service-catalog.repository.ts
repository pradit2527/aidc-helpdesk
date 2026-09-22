import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';

import { APPROVER_TYPE, type ApproverType } from '../../common/constants';
import type { Db } from '../client';
import { DB } from '../db.token';
import { appUser, escalationContact, serviceCatalogItem } from '../schema';

/** ค่าจากรายการใน catalog ที่กระบวนการสร้างเรื่องต้องใช้ */
export interface CatalogItemForTicket {
  id: number;
  companyId: number | null;
  code: string;
  targetMode: string;
  /** นาทีทำการ — null เมื่อ target_mode ไม่ใช่ duration */
  targetMinutes: number | null;
  clockStartEvent: string;
  requiresApproval: boolean;
  /** ลำดับ approver_type คั่นด้วย , เช่น "line_manager,system_owner" */
  approvalChain: string | null;
  checklistTemplateId: number | null;
}

/** หนึ่งขั้นในสายอนุมัติที่พร้อมเขียนลง approval_request */
export interface PlannedApprovalStep {
  seq: number;
  approverType: ApproverType;
  /** null = ยังหาคนไม่ได้ — company_admin ต้องมากำหนดเอง */
  approverId: number | null;
}

/**
 * อ่านรายการใน service catalog และแปลง "สายอนุมัติ" เป็นรายชื่อคนจริง
 *
 * แยกเป็น repository ของตัวเองเพราะ CreateTicketUseCase ต้องใช้ทั้งสองอย่างนี้
 * ก่อนจะรู้ด้วยซ้ำว่าเรื่องจะถูกบันทึกด้วยสถานะอะไร — ไปฝากไว้กับ TicketRepository
 * ไม่ได้ เพราะที่นั่นเป็นชั้นที่บังคับขอบเขตของ "ตาราง ticket" โดยเฉพาะ
 */
@Injectable()
export class ServiceCatalogRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async byId(id: number): Promise<CatalogItemForTicket | null> {
    const [row] = await this.db
      .select({
        id: serviceCatalogItem.id,
        companyId: serviceCatalogItem.companyId,
        code: serviceCatalogItem.code,
        targetMode: serviceCatalogItem.targetMode,
        targetMinutes: serviceCatalogItem.targetMinutes,
        clockStartEvent: serviceCatalogItem.clockStartEvent,
        requiresApproval: serviceCatalogItem.requiresApproval,
        approvalChain: serviceCatalogItem.approvalChain,
        checklistTemplateId: serviceCatalogItem.checklistTemplateId,
      })
      .from(serviceCatalogItem)
      .where(and(eq(serviceCatalogItem.id, id), eq(serviceCatalogItem.isActive, true)))
      .limit(1);

    return row ?? null;
  }

  /**
   * ชื่อรายการสำหรับแสดงผล — ไม่กรอง is_active
   *
   * ต่างจาก byId ที่ใช้ตอนเปิดเรื่องใหม่ (รายการที่ปิดแล้วต้องเลือกไม่ได้) เรื่องที่เปิดไปแล้ว
   * ยังต้องเห็นชื่อรายการเดิมแม้ผู้ดูแลปิดรายการนั้นทีหลัง
   */
  async summaryById(id: number): Promise<{ id: number; code: string; nameTh: string } | null> {
    const [row] = await this.db
      .select({
        id: serviceCatalogItem.id,
        code: serviceCatalogItem.code,
        nameTh: serviceCatalogItem.nameTh,
      })
      .from(serviceCatalogItem)
      .where(eq(serviceCatalogItem.id, id))
      .limit(1);

    return row ?? null;
  }

  /**
   * รหัสของรายการ "อื่น ๆ (ລະບຸເອງ)" — ปลายทางของคำขอที่ไม่มีรายการรองรับ
   *
   * ค่านี้ผูกกับข้อมูล seed (db/seed/data/catalog.ts) โดยตรง — เป็นรหัสตามสัญญา
   * ไม่ใช่ id ที่เปลี่ยนไปตามฐานข้อมูล จึงอ้างจากโค้ดได้อย่างปลอดภัย
   */
  static readonly UNLISTED_REQUEST_CODE = 'SR-OTHER';

  /**
   * รายการปลายทางของคำขอที่ยังไม่รู้ว่าคืออะไร — ของบริษัทก่อน ถ้าไม่มีใช้ของส่วนกลาง
   *
   * จำเป็นเพราะ CHECK `ck_ticket_service_request_needs_catalog` (G-14) บังคับว่า
   * คำขอบริการทุกใบต้องผูกกับรายการใน catalog ถ้าไม่มีรายการนี้ เรื่องที่ถูกดัด
   * ชนิดเป็นคำขอบริการโดยอัตโนมัติ (ผู้แจ้งภายนอกจาก Support Hub) จะบันทึกไม่ได้เลย
   */
  async unlistedRequestItem(companyId: number): Promise<CatalogItemForTicket | null> {
    const rows = await this.db
      .select({
        id: serviceCatalogItem.id,
        companyId: serviceCatalogItem.companyId,
        code: serviceCatalogItem.code,
        targetMode: serviceCatalogItem.targetMode,
        targetMinutes: serviceCatalogItem.targetMinutes,
        clockStartEvent: serviceCatalogItem.clockStartEvent,
        requiresApproval: serviceCatalogItem.requiresApproval,
        approvalChain: serviceCatalogItem.approvalChain,
        checklistTemplateId: serviceCatalogItem.checklistTemplateId,
      })
      .from(serviceCatalogItem)
      .where(
        and(
          eq(serviceCatalogItem.code, ServiceCatalogRepository.UNLISTED_REQUEST_CODE),
          eq(serviceCatalogItem.isActive, true),
          or(
            isNull(serviceCatalogItem.companyId),
            eq(serviceCatalogItem.companyId, companyId),
          ),
        ),
      );

    return rows.find((r) => r.companyId === companyId) ?? rows[0] ?? null;
  }

  /**
   * แปลงสายอนุมัติเป็นขั้น ๆ พร้อมผู้อนุมัติ
   *
   * ⚠️ ค่าที่ไม่รู้จักใน approval_chain ถูก "ตัดทิ้ง" ไม่ใช่ทำให้ทั้งคำขอล้ม
   *    ck_approval_approver_type_valid จะปฏิเสธแถวที่ approver_type ผิดอยู่แล้ว
   *    ถ้าปล่อยให้หลุดไป ทั้งทรานแซกชันการสร้างเรื่องจะล้มด้วย error ของฐานข้อมูล
   *    ที่ผู้ใช้อ่านไม่รู้เรื่อง ทั้งที่ความผิดอยู่ที่ข้อมูลตั้งค่า ไม่ใช่ที่เขา
   *    (ข้อมูล seed ชุดเดิมเคยมีค่า 'department_head' ซึ่งไม่เคยเป็นค่าที่ถูกต้องเลย)
   *
   * @returns อาเรย์ว่างเมื่อสายอนุมัติว่างหรือไม่มีค่าที่ใช้ได้เลย —
   *          ผู้เรียกต้องถือว่า "ไม่ต้องอนุมัติ" ไม่ใช่ค้างรอตลอดกาล
   */
  async planApprovals(input: {
    chain: string | null;
    companyId: number;
    requesterId: number;
  }): Promise<PlannedApprovalStep[]> {
    const wanted = (input.chain ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is ApproverType => (APPROVER_TYPE as readonly string[]).includes(s));

    if (wanted.length === 0) return [];

    /*
     * หาคนของแต่ละชนิดเท่าที่หาได้
     *
     * สามชนิดที่ระบบหาเองได้ตอนนี้
     *   line_manager  หัวหน้าสายงานของผู้แจ้ง (app_user.manager_id)
     *   head_of_it    ผู้ที่ตั้งไว้ในทะเบียน escalation_contact ตำแหน่ง head_of_it
     *   tier2_review  ผู้ที่ตั้งไว้ในทะเบียนเดียวกัน ตำแหน่ง tier2_group
     *                 (เดิมคืน null เสมอ — คำขอซอฟต์แวร์นอกบัญชีจึงค้างที่ขั้นแรกตลอดไป)
     *
     * ที่เหลือ (system_owner / budget_owner / cab) คืน null
     * ตามที่ตารางออกแบบไว้ — "ยังหาผู้อนุมัติไม่ได้ ต้องแจ้ง company_admin ให้กำหนดคน"
     * การเดาคนให้ชนิดเหล่านี้อันตรายกว่าการปล่อยว่าง เพราะมันคือการมอบอำนาจ
     * อนุมัติงบหรืออนุมัติสิทธิ์ให้คนที่องค์กรไม่ได้แต่งตั้ง — ทะเบียน escalation_contact
     * คือการแต่งตั้งที่ผู้ดูแลตั้งเอง จึงไม่ใช่การเดา
     */
    const [lineManagerId, headOfItId, tier2Id] = await Promise.all([
      wanted.includes('line_manager') ? this.managerOf(input.requesterId) : Promise.resolve(null),
      wanted.includes('head_of_it')
        ? this.escalationContactFor(input.companyId, 'head_of_it')
        : Promise.resolve(null),
      wanted.includes('tier2_review')
        ? this.escalationContactFor(input.companyId, 'tier2_group')
        : Promise.resolve(null),
    ]);

    return wanted.map((approverType, index) => ({
      seq: index + 1,
      approverType,
      approverId:
        approverType === 'line_manager'
          ? lineManagerId
          : approverType === 'head_of_it'
            ? headOfItId
            : approverType === 'tier2_review'
              ? tier2Id
              : null,
    }));
  }

  /**
   * หัวหน้าสายงานของผู้ใช้คนนี้ — null เมื่อยังไม่ได้ตั้งค่า หรือหัวหน้าถูกปิดบัญชีไปแล้ว
   *
   * ⚠️ ต้องเช็ค is_active / deleted_at ของ "หัวหน้า" ด้วย ไม่ใช่แค่ว่า manager_id มีค่า
   *    หัวหน้าที่ลาออกไปแล้วยังถูกอ้างอยู่ในคอลัมน์นั้น ถ้าส่งคำขอไปให้เขา
   *    ใบอนุมัติจะเข้าคิวของบัญชีที่ไม่มีใครเข้าใช้อีกแล้ว แล้วค้างอยู่อย่างนั้น
   *    โดยไม่มีอะไรฟ้อง — คืน null ดีกว่า เพราะ company_admin จะเห็นว่าต้องกำหนดคน
   */
  private async managerOf(userId: number): Promise<number | null> {
    /*
     * สองคิวรีต่อกัน ไม่ใช่ self-join
     *
     * self-join ต้องตั้งชื่อแทนตาราง แล้วคิวรีนี้จะอ่านยากกว่าที่มันเป็นจริง
     * เส้นทางนี้วิ่งเฉพาะตอนสร้างคำขอที่ต้องอนุมัติ ซึ่งไม่ใช่เส้นทางที่ร้อน
     * และทั้งสองคิวรีวิ่งบน primary key — ค่าใช้จ่ายคือรอบเครือข่ายหนึ่งรอบ
     */
    const [row] = await this.db
      .select({ managerId: appUser.managerId })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1);

    const managerId = row?.managerId ?? null;
    if (managerId === null) return null;

    const [active] = await this.db
      .select({ id: appUser.id })
      .from(appUser)
      .where(
        and(eq(appUser.id, managerId), eq(appUser.isActive, true), isNull(appUser.deletedAt)),
      )
      .limit(1);

    return active?.id ?? null;
  }

  /**
   * ผู้รับการยกระดับตามตำแหน่ง — ของบริษัทก่อน ถ้าไม่มีใช้ของส่วนกลาง
   *
   * กติกาเดียวกับนโยบาย SLA และปฏิทินเวลาทำการ: แถวที่ company_id เป็น null
   * คือค่าตั้งต้นของทั้งเครือ บริษัทที่ตั้งคนของตัวเองไว้ใช้คนนั้นแทน
   */
  private async escalationContactFor(
    companyId: number,
    contactKey: string,
  ): Promise<number | null> {
    const rows = await this.db
      .select({ companyId: escalationContact.companyId, userId: escalationContact.userId })
      .from(escalationContact)
      .innerJoin(appUser, eq(appUser.id, escalationContact.userId))
      .where(
        and(
          eq(escalationContact.contactKey, contactKey),
          eq(escalationContact.isActive, true),
          eq(appUser.isActive, true),
          isNull(appUser.deletedAt),
          or(isNull(escalationContact.companyId), eq(escalationContact.companyId, companyId)),
        ),
      )
      // ของบริษัทมาก่อนของส่วนกลาง (NULL เรียงท้ายสุดใน ASC) · ผู้รับหลักมาก่อนผู้รับสำรอง
      .orderBy(asc(escalationContact.companyId), desc(escalationContact.isPrimary));

    const own = rows.find((r) => r.companyId === companyId);
    return (own ?? rows[0])?.userId ?? null;
  }

  /**
   * ผู้ที่ถือตำแหน่งนี้ทั้งหมดในบริษัท — ใช้ส่งการแจ้งเตือน ไม่ใช่หาผู้อนุมัติ
   *
   * ต่างจาก escalationContactFor ตรงที่คืน "ทุกคน" ไม่ใช่คนเดียว เพราะการแจ้ง
   * เหตุร้ายแรงต้องถึงทุกคนที่รับผิดชอบ ไม่ใช่คนแรกที่เจอในตาราง
   */
  async contactsFor(companyId: number, contactKeys: readonly string[]): Promise<number[]> {
    if (contactKeys.length === 0) return [];

    const rows = await this.db
      .select({ userId: escalationContact.userId })
      .from(escalationContact)
      .innerJoin(appUser, eq(appUser.id, escalationContact.userId))
      .where(
        and(
          inArray(escalationContact.contactKey, [...contactKeys]),
          eq(escalationContact.isActive, true),
          eq(appUser.isActive, true),
          isNull(appUser.deletedAt),
          or(isNull(escalationContact.companyId), eq(escalationContact.companyId, companyId)),
        ),
      );

    return [...new Set(rows.map((r) => r.userId))];
  }
}
