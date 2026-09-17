import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';

import { NotFoundError } from '../../common/errors/domain-error';
import type { AccessScope } from '../../common/scope';
import type { Db } from '../client';
import { DB } from '../db.module';
import { auditLog, company, supportChat, supportProject, supportTeam, ticketCategory } from '../schema';
import { OWNER_COMPANY_CODE } from '../seed/data/organization';

/** โครงการหนึ่งโครงการพร้อมชื่อของสิ่งที่มันอ้างถึง */
export interface SupportProjectRow {
  id: number;
  code: string;
  name: string;
  websiteUrl: string | null;
  companyId: number | null;
  companyCode: string | null;
  defaultCategoryId: number | null;
  defaultCategoryName: string | null;
  teamId: number | null;
  teamName: string | null;
  chatwootInboxId: number | null;
  chatwootWebsiteToken: string | null;
  locale: string;
  isActive: boolean;
  createdAt: Date;
}

/** ค่าที่เขียนได้ตอนสร้างหรือแก้โครงการ — undefined = ไม่แตะ */
export interface SupportProjectWrite {
  code?: string;
  name?: string;
  websiteUrl?: string | null;
  companyId?: number | null;
  defaultCategoryId?: number | null;
  teamId?: number | null;
  chatwootInboxId?: number | null;
  chatwootWebsiteToken?: string | null;
  locale?: string;
  isActive?: boolean;
}

/** โครงการที่ตัวค้นพบ (discovery) ต้องไล่ดูในแต่ละรอบ */
export interface SupportProjectSyncTarget {
  id: number;
  code: string;
  companyId: number | null;
  chatwootInboxId: number;
}

const projectColumns = {
  id: supportProject.id,
  code: supportProject.code,
  name: supportProject.name,
  websiteUrl: supportProject.websiteUrl,
  companyId: supportProject.companyId,
  companyCode: company.code,
  defaultCategoryId: supportProject.defaultCategoryId,
  defaultCategoryName: ticketCategory.nameTh,
  teamId: supportProject.teamId,
  teamName: supportTeam.name,
  chatwootInboxId: supportProject.chatwootInboxId,
  chatwootWebsiteToken: supportProject.chatwootWebsiteToken,
  locale: supportProject.locale,
  isActive: supportProject.isActive,
  createdAt: supportProject.createdAt,
};

/**
 * ที่เก็บโครงการสนับสนุน — คิวรีของ support_project อยู่ที่ไฟล์นี้ที่เดียว
 *
 * เหตุผลเดียวกับ SupportTeamRepository: โครงการเป็นตัวตัดสินว่าแชทจาก widget
 * ตัวไหนไปโผล่ในกล่องแชทของบริษัทใด คิวรีที่กระจายอยู่หลายที่แล้วลืมเงื่อนไข
 * ขอบเขตบริษัทข้อเดียว เท่ากับแชทของลูกค้าบริษัทหนึ่งไปอยู่ในมือทีมของอีกบริษัท
 */
@Injectable()
export class SupportProjectRepository {
  /** บริษัทเจ้าของระบบ — ค่าไม่เปลี่ยนตลอดอายุโปรเซส จำไว้ครั้งเดียวพอ */
  private ownerCompanyIdCache: number | null = null;

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * บริษัทที่รับห้องแชทของโครงการส่วนกลาง
   *
   * ห้องจาก widget ต้องมีบริษัทเสมอ เพราะ row-level scoping ตัดสินจากบริษัท
   * โครงการส่วนกลางไม่มีบริษัทของตัวเอง จึงตกมาที่บริษัทเจ้าของระบบ
   */
  async ownerCompanyId(): Promise<number | null> {
    if (this.ownerCompanyIdCache !== null) return this.ownerCompanyIdCache;
    const [row] = await this.db
      .select({ id: company.id })
      .from(company)
      .where(eq(company.code, OWNER_COMPANY_CODE))
      .limit(1);
    this.ownerCompanyIdCache = row?.id ?? null;
    return this.ownerCompanyIdCache;
  }

  private selectProject() {
    return this.db
      .select(projectColumns)
      .from(supportProject)
      .leftJoin(company, eq(company.id, supportProject.companyId))
      .leftJoin(ticketCategory, eq(ticketCategory.id, supportProject.defaultCategoryId))
      .leftJoin(supportTeam, eq(supportTeam.id, supportProject.teamId))
      .$dynamic();
  }

  /**
   * โครงการที่ผู้เรียกเห็นได้ — ของบริษัทในขอบเขตตน บวกโครงการส่วนกลาง
   *
   * กติกาเดียวกับทีมสนับสนุน: company_id IS NULL แปลว่า "ของทั้งกลุ่ม" ไม่ใช่ข้อมูลกำพร้า
   */
  async listVisible(scope: AccessScope): Promise<SupportProjectRow[]> {
    const where = SupportProjectRepository.visibilityWhere(scope);
    return this.selectProject()
      .where(where)
      .orderBy(asc(supportProject.name), asc(supportProject.id));
  }

  async byId(id: number): Promise<SupportProjectRow | null> {
    const [row] = await this.selectProject().where(eq(supportProject.id, id)).limit(1);
    return row ?? null;
  }

  async mustFind(id: number): Promise<SupportProjectRow> {
    const row = await this.byId(id);
    if (!row) throw new NotFoundError('NOT_FOUND', 'ບໍ່ພົບໂຄງການທີ່ຕ້ອງການ', { projectId: id });
    return row;
  }

  async byCode(code: string): Promise<SupportProjectRow | null> {
    const [row] = await this.selectProject().where(eq(supportProject.code, code)).limit(1);
    return row ?? null;
  }

  /** โครงการที่ผูกกับ inbox นี้ — ใช้ตอน webhook บอกเลข inbox มา */
  async byInboxId(inboxId: number): Promise<SupportProjectRow | null> {
    const [row] = await this.selectProject()
      .where(eq(supportProject.chatwootInboxId, inboxId))
      .limit(1);
    return row ?? null;
  }

  /** จำนวนแชทที่ยังเปิดอยู่ของแต่ละโครงการ — คิวรีเดียวสำหรับทั้งรายการ */
  async openChatCounts(projectIds: readonly number[]): Promise<Map<number, number>> {
    if (projectIds.length === 0) return new Map();
    const rows = await this.db
      .select({ projectId: supportChat.projectId, total: sql<number>`count(*)::int` })
      .from(supportChat)
      .where(and(inArray(supportChat.projectId, [...projectIds]), eq(supportChat.status, 'open')))
      .groupBy(supportChat.projectId);
    return new Map(rows.filter((r) => r.projectId !== null).map((r) => [r.projectId!, r.total]));
  }

  /** โครงการที่ยังเปิดใช้งานและผูก inbox แล้ว — ตัวตั้งของรอบค้นหาบทสนทนาใหม่ */
  async activeSyncTargets(): Promise<SupportProjectSyncTarget[]> {
    const rows = await this.db
      .select({
        id: supportProject.id,
        code: supportProject.code,
        companyId: supportProject.companyId,
        chatwootInboxId: supportProject.chatwootInboxId,
      })
      .from(supportProject)
      .where(and(eq(supportProject.isActive, true), isNotNull(supportProject.chatwootInboxId)))
      .orderBy(asc(supportProject.id));
    return rows.map((r) => ({ ...r, chatwootInboxId: r.chatwootInboxId! }));
  }

  async codeTaken(code: string, exceptId?: number): Promise<boolean> {
    const rows = await this.db
      .select({ id: supportProject.id })
      .from(supportProject)
      .where(eq(supportProject.code, code))
      .limit(2);
    return rows.some((r) => r.id !== exceptId);
  }

  async inboxTaken(inboxId: number, exceptId?: number): Promise<boolean> {
    const rows = await this.db
      .select({ id: supportProject.id })
      .from(supportProject)
      .where(eq(supportProject.chatwootInboxId, inboxId))
      .limit(2);
    return rows.some((r) => r.id !== exceptId);
  }

  /**
   * สร้างโครงการพร้อมเขียน audit ในทรานแซกชันเดียว
   *
   * audit อยู่ในทรานแซกชันเดียวกับข้อมูล ไม่ใช่เขียนทีหลัง — เหมือน support_team
   * การผูก inbox ใหม่คือการเปิดทางให้ข้อความจากภายนอกไหลเข้ากล่องแชทของบริษัทหนึ่ง
   * ซึ่งต้องตอบได้ว่าใครเป็นคนเปิด และเปิดเมื่อไร
   */
  async createProject(
    input: Required<Pick<SupportProjectWrite, 'code' | 'name'>> & SupportProjectWrite,
    actorId: number,
  ): Promise<number> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(supportProject)
        .values({
          code: input.code,
          name: input.name,
          websiteUrl: input.websiteUrl ?? null,
          companyId: input.companyId ?? null,
          defaultCategoryId: input.defaultCategoryId ?? null,
          teamId: input.teamId ?? null,
          chatwootInboxId: input.chatwootInboxId ?? null,
          chatwootWebsiteToken: input.chatwootWebsiteToken ?? null,
          locale: input.locale ?? 'lo',
          isActive: input.isActive ?? true,
        })
        .returning({ id: supportProject.id });

      const projectId = created!.id;
      await tx.insert(auditLog).values({
        actorId,
        companyId: input.companyId ?? null,
        action: 'support_project.created',
        entityType: 'support_project',
        entityId: projectId,
        oldValue: null,
        newValue: SupportProjectRepository.auditValue(input),
      });
      return projectId;
    });
  }

  async updateProject(
    projectId: number,
    input: SupportProjectWrite,
    actorId: number,
    before: SupportProjectRow,
  ): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (input.code !== undefined) patch.code = input.code;
    if (input.name !== undefined) patch.name = input.name;
    if (input.websiteUrl !== undefined) patch.websiteUrl = input.websiteUrl;
    if (input.companyId !== undefined) patch.companyId = input.companyId;
    if (input.defaultCategoryId !== undefined) patch.defaultCategoryId = input.defaultCategoryId;
    if (input.teamId !== undefined) patch.teamId = input.teamId;
    if (input.chatwootInboxId !== undefined) patch.chatwootInboxId = input.chatwootInboxId;
    if (input.chatwootWebsiteToken !== undefined) {
      patch.chatwootWebsiteToken = input.chatwootWebsiteToken;
    }
    if (input.locale !== undefined) patch.locale = input.locale;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    await this.db.transaction(async (tx) => {
      if (Object.keys(patch).length > 0) {
        // 0001 ผูก trigger set_updated_at ไว้เฉพาะตารางที่มีอยู่ ณ ตอนนั้น จึงเซ็ตเองเหมือน support_team
        patch.updatedAt = new Date();
        await tx.update(supportProject).set(patch).where(eq(supportProject.id, projectId));
      }

      await tx.insert(auditLog).values({
        actorId,
        companyId: input.companyId !== undefined ? input.companyId : before.companyId,
        action: 'support_project.updated',
        entityType: 'support_project',
        entityId: projectId,
        oldValue: SupportProjectRepository.auditValue({
          code: before.code,
          name: before.name,
          companyId: before.companyId,
          defaultCategoryId: before.defaultCategoryId,
          teamId: before.teamId,
          chatwootInboxId: before.chatwootInboxId,
          locale: before.locale,
          isActive: before.isActive,
        }),
        newValue: SupportProjectRepository.auditValue(input),
      });
    });
  }

  // ── ภายใน ─────────────────────────────────────────────────────────────

  /**
   * ค่าที่เขียนลง audit
   *
   * ⚠️ ไม่เก็บ chatwoot_website_token — ไม่ใช่ความลับก็จริง แต่ไม่มีประโยชน์
   *    ในการตรวจสอบ และ audit_log เป็น append-only ลบทีหลังไม่ได้
   */
  private static auditValue(input: SupportProjectWrite): Record<string, unknown> {
    return {
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.companyId !== undefined ? { company_id: input.companyId } : {}),
      ...(input.defaultCategoryId !== undefined
        ? { default_category_id: input.defaultCategoryId }
        : {}),
      ...(input.teamId !== undefined ? { team_id: input.teamId } : {}),
      ...(input.chatwootInboxId !== undefined ? { chatwoot_inbox_id: input.chatwootInboxId } : {}),
      ...(input.chatwootWebsiteToken !== undefined
        ? { chatwoot_website_token_set: input.chatwootWebsiteToken !== null }
        : {}),
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    };
  }

  /** undefined = ไม่มีเงื่อนไข (super_admin) */
  private static visibilityWhere(scope: AccessScope): SQL | undefined {
    if (scope.isSuperAdmin) return undefined;
    const ids = [...scope.companyIds];
    return ids.length === 0
      ? (isNull(supportProject.companyId) as SQL)
      : (or(isNull(supportProject.companyId), inArray(supportProject.companyId, ids)) as SQL);
  }
}
