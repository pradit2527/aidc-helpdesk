import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';

import { NotFoundError } from '../../common/errors/domain-error';
import type { AccessScope } from '../../common/scope';
import type { Db } from '../client';
import { DB } from '../db.module';
import { appUser, auditLog, company, supportTeam, supportTeamMember } from '../schema';

/** สมาชิกหนึ่งคนในทีม พร้อมข้อมูลที่หน้าจอต้องแสดง */
export interface TeamMemberRow {
  userId: number;
  fullName: string;
  username: string;
  isLead: boolean;
}

/** ทีมหนึ่งทีมพร้อมสมาชิกทั้งหมด */
export interface TeamRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  companyId: number | null;
  companyCode: string | null;
  members: TeamMemberRow[];
}

/** ค่าที่เขียนได้ตอนสร้างหรือแก้ทีม — undefined = ไม่แตะ */
export interface TeamWrite {
  code?: string;
  name?: string;
  description?: string | null;
  companyId?: number | null;
  isActive?: boolean;
  /** ระบุคู่กันเสมอ — แทนที่รายชื่อทั้งชุด ไม่ใช่เพิ่มทีละคน */
  leadIds?: readonly number[];
  memberIds?: readonly number[];
}

/**
 * ทุกคิวรีของ support_team / support_team_member อยู่ที่ไฟล์นี้ที่เดียว
 *
 * เหตุผลเดียวกับ TicketRepository — ทีมเป็นตัวตัดสินว่าใครสั่งใครได้
 * คิวรีที่กระจายอยู่หลายที่แล้วลืมเงื่อนไข is_active ข้อเดียว เท่ากับหัวหน้าทีม
 * ที่ถูกยุบไปแล้วยังสั่งงานคนเดิมได้ต่อ โดยไม่มีอะไรฟ้อง
 */
@Injectable()
export class SupportTeamRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * ทีม (ที่ยังเปิดใช้งาน) ที่ผู้ใช้คนหนึ่งสังกัด
   *
   * ใช้ตอนตัดสินคำสั่งมอบหมายของหัวหน้าทีม — เป็นคิวรีเดียวที่เพิ่มเข้ามา
   * ในเส้นทางนั้น และถูกยิงขนานไปกับ assignableUsers จึงไม่เพิ่มรอบเครือข่าย
   */
  async activeTeamIdsOf(userId: number): Promise<number[]> {
    const rows = await this.db
      .select({ teamId: supportTeamMember.teamId })
      .from(supportTeamMember)
      .innerJoin(supportTeam, eq(supportTeam.id, supportTeamMember.teamId))
      .where(and(eq(supportTeamMember.userId, userId), eq(supportTeam.isActive, true)));
    return rows.map((r) => r.teamId);
  }

  /**
   * ทีมของผู้ใช้หลายคนพร้อมกัน — คิวรีเดียวสำหรับทั้งรายการ
   *
   * ⚠️ ห้ามวนเรียก activeTeamIdsOf ทีละคน รายชื่อผู้รับมอบหมายมีได้หลายสิบคน
   *    บนฐานข้อมูลที่อยู่ไกลนั่นคือหลายสิบรอบ ๆ ละ ~250 ms
   */
  async activeTeamsOfUsers(
    userIds: readonly number[],
  ): Promise<Map<number, { teamId: number; teamName: string; isLead: boolean }[]>> {
    const result = new Map<number, { teamId: number; teamName: string; isLead: boolean }[]>();
    if (userIds.length === 0) return result;

    const rows = await this.db
      .select({
        userId: supportTeamMember.userId,
        teamId: supportTeam.id,
        teamName: supportTeam.name,
        isLead: supportTeamMember.isLead,
      })
      .from(supportTeamMember)
      .innerJoin(supportTeam, eq(supportTeam.id, supportTeamMember.teamId))
      .where(and(inArray(supportTeamMember.userId, [...userIds]), eq(supportTeam.isActive, true)))
      .orderBy(asc(supportTeam.name));

    for (const row of rows) {
      const entry = { teamId: row.teamId, teamName: row.teamName, isLead: row.isLead };
      const list = result.get(row.userId);
      if (list) list.push(entry);
      else result.set(row.userId, [entry]);
    }
    return result;
  }

  /**
   * รายการทีมที่ผู้เรียกเห็นได้
   *
   *   - ระดับผู้ดูแล เห็นทีมของบริษัทในขอบเขตตน บวกทีมส่วนกลาง (company_id IS NULL)
   *   - คนอื่น เห็นเฉพาะทีมที่ตนสังกัด — รายชื่อเพื่อนร่วมทีมไม่ใช่ข้อมูลลับ
   *     แต่โครงสร้างทีมของทั้งกลุ่มบริษัทไม่ใช่สิ่งที่เจ้าหน้าที่ทั่วไปต้องเห็น
   *
   * ทีมกับสมาชิกอ่านมาด้วยคิวรีเดียวแล้วจัดกลุ่มในหน่วยความจำ
   * (อ่านทีมก่อนแล้วค่อยอ่านสมาชิกคือสองรอบเครือข่ายโดยไม่จำเป็น)
   */
  async listVisibleTeams(scope: AccessScope): Promise<TeamRow[]> {
    const where = this.visibilityWhere(scope);
    // null = ผู้เรียกไม่สังกัดทีมใดเลย → ตอบรายการว่าง ไม่ใช่ยิงคิวรีที่คืนทุกแถว
    if (where === null) return [];
    return this.loadTeams(where);
  }

  /** ทีมหนึ่งทีมพร้อมสมาชิก — ใช้หลังสร้าง/แก้ไข เพื่อคืนรูปร่างเดียวกับรายการ */
  async teamById(id: number): Promise<TeamRow> {
    const [row] = await this.db
      .select({ id: supportTeam.id })
      .from(supportTeam)
      .where(eq(supportTeam.id, id))
      .limit(1);
    if (!row) throw new NotFoundError('NOT_FOUND', 'ບໍ່ພົບທີມທີ່ຕ້ອງການ', { teamId: id });

    const teams = await this.loadTeams(eq(supportTeam.id, id));
    return teams[0]!;
  }

  /** ทีมหนึ่งทีมแบบไม่รวมสมาชิก — ใช้ตรวจขอบเขตก่อนแก้ไข */
  async teamHeader(
    id: number,
  ): Promise<{ id: number; code: string; name: string; companyId: number | null; isActive: boolean }> {
    const [row] = await this.db
      .select({
        id: supportTeam.id,
        code: supportTeam.code,
        name: supportTeam.name,
        companyId: supportTeam.companyId,
        isActive: supportTeam.isActive,
      })
      .from(supportTeam)
      .where(eq(supportTeam.id, id))
      .limit(1);
    if (!row) throw new NotFoundError('NOT_FOUND', 'ບໍ່ພົບທີມທີ່ຕ້ອງການ', { teamId: id });
    return row;
  }

  /** id ของสมาชิกทั้งหมดในทีม — ใช้หาว่าต้องล้างสิทธิ์ที่จำไว้ของใครบ้าง */
  async memberIdsOf(teamId: number): Promise<number[]> {
    const rows = await this.db
      .select({ userId: supportTeamMember.userId })
      .from(supportTeamMember)
      .where(eq(supportTeamMember.teamId, teamId));
    return rows.map((r) => r.userId);
  }

  /** มีทีมที่ใช้ code นี้อยู่แล้วหรือไม่ (ไม่นับทีมที่กำลังแก้อยู่) */
  async codeTaken(code: string, exceptTeamId?: number): Promise<boolean> {
    const rows = await this.db
      .select({ id: supportTeam.id })
      .from(supportTeam)
      .where(eq(supportTeam.code, code))
      .limit(2);
    return rows.some((r) => r.id !== exceptTeamId);
  }

  /**
   * สร้างทีมพร้อมสมาชิก และเขียน audit ในทรานแซกชันเดียว
   *
   * audit อยู่ในทรานแซกชันเดียวกับข้อมูล ไม่ใช่เขียนทีหลัง — เหตุผลเดียวกับ
   * ที่ TicketRepository ทำ: การเปลี่ยนโครงสร้างอำนาจที่สำเร็จแต่ไม่มีร่องรอย
   * คือสิ่งแรกที่การตรวจ ISO 20000 ข้อ 7.5 ถามหา
   */
  async createTeam(input: Required<Pick<TeamWrite, 'code' | 'name'>> & TeamWrite, actorId: number): Promise<number> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(supportTeam)
        .values({
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          companyId: input.companyId ?? null,
          isActive: input.isActive ?? true,
        })
        .returning({ id: supportTeam.id });

      const teamId = created!.id;
      const members = SupportTeamRepository.membershipRows(
        teamId,
        input.leadIds ?? [],
        input.memberIds ?? [],
      );
      if (members.length > 0) await tx.insert(supportTeamMember).values(members);

      await tx.insert(auditLog).values({
        actorId,
        companyId: input.companyId ?? null,
        action: 'support_team.created',
        entityType: 'support_team',
        entityId: teamId,
        oldValue: null,
        newValue: {
          code: input.code,
          name: input.name,
          company_id: input.companyId ?? null,
          lead_ids: [...(input.leadIds ?? [])],
          member_ids: members.map((m) => m.userId),
        },
      });

      return teamId;
    });
  }

  /**
   * แก้ทีม — รายชื่อสมาชิกถูกแทนที่ทั้งชุด ไม่ใช่เพิ่มทับของเดิม
   *
   * ⚠️ ลบแล้วใส่ใหม่ในทรานแซกชันเดียว ถ้าแยกสองคำสั่งแล้วล้มกลางทาง
   *    ทีมจะเหลือศูนย์คน — และทีมที่ไม่มีหัวหน้าคือทีมที่ไม่มีใครมอบหมายงานได้
   */
  async updateTeam(
    teamId: number,
    input: TeamWrite,
    actorId: number,
    before: { code: string; name: string; companyId: number | null; memberIds: readonly number[] },
  ): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (input.code !== undefined) patch.code = input.code;
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.companyId !== undefined) patch.companyId = input.companyId;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    const replacing = input.leadIds !== undefined || input.memberIds !== undefined;

    await this.db.transaction(async (tx) => {
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = new Date();
        await tx.update(supportTeam).set(patch).where(eq(supportTeam.id, teamId));
      }

      let memberIds: number[] = [...before.memberIds];
      if (replacing) {
        await tx.delete(supportTeamMember).where(eq(supportTeamMember.teamId, teamId));
        const rows = SupportTeamRepository.membershipRows(
          teamId,
          input.leadIds ?? [],
          input.memberIds ?? [],
        );
        if (rows.length > 0) await tx.insert(supportTeamMember).values(rows);
        memberIds = rows.map((r) => r.userId);
      }

      await tx.insert(auditLog).values({
        actorId,
        companyId: input.companyId !== undefined ? input.companyId : before.companyId,
        action: 'support_team.updated',
        entityType: 'support_team',
        entityId: teamId,
        oldValue: {
          code: before.code,
          name: before.name,
          company_id: before.companyId,
          member_ids: [...before.memberIds],
        },
        newValue: {
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.companyId !== undefined ? { company_id: input.companyId } : {}),
          ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
          ...(replacing ? { lead_ids: [...(input.leadIds ?? [])], member_ids: memberIds } : {}),
        },
      });
    });
  }

  // ── ภายใน ─────────────────────────────────────────────────────────────

  /**
   * หัวหน้านับเป็นสมาชิกเสมอ — รวมสองรายการแล้วตัดซ้ำก่อนเขียน
   *
   * ถ้าไม่รวม หัวหน้าที่ไม่ได้ถูกใส่ใน member_ids ด้วยจะไม่มีแถวสมาชิก
   * แล้ว "ทีมของฉัน" ของเขาจะว่าง ทั้งที่เขาเป็นหัวหน้าทีมนั้นอยู่
   */
  private static membershipRows(
    teamId: number,
    leadIds: readonly number[],
    memberIds: readonly number[],
  ): { teamId: number; userId: number; isLead: boolean }[] {
    const leads = new Set(leadIds);
    const everyone = new Set<number>([...leadIds, ...memberIds]);
    return [...everyone].map((userId) => ({ teamId, userId, isLead: leads.has(userId) }));
  }

  /** undefined = ไม่มีเงื่อนไข (super_admin) · null = ไม่เห็นอะไรเลย */
  private visibilityWhere(scope: AccessScope): SQL | undefined | null {
    if (scope.isSuperAdmin) return undefined;

    if (scope.isAdminLevel) {
      const ids = [...scope.companyIds];
      // ทีมส่วนกลางเห็นได้เสมอ — company_id IS NULL แปลว่า "ของทั้งกลุ่ม" ไม่ใช่ข้อมูลกำพร้า
      return ids.length === 0
        ? (isNull(supportTeam.companyId) as SQL)
        : (or(isNull(supportTeam.companyId), inArray(supportTeam.companyId, ids)) as SQL);
    }

    const myTeams = [...scope.teamIds];
    if (myTeams.length === 0) return null;
    return inArray(supportTeam.id, myTeams) as SQL;
  }

  private async loadTeams(where: SQL | undefined): Promise<TeamRow[]> {
    const rows = await this.db
      .select({
        id: supportTeam.id,
        code: supportTeam.code,
        name: supportTeam.name,
        description: supportTeam.description,
        isActive: supportTeam.isActive,
        companyId: supportTeam.companyId,
        companyCode: company.code,
        memberUserId: supportTeamMember.userId,
        memberIsLead: supportTeamMember.isLead,
        memberFullName: appUser.fullName,
        memberUsername: appUser.username,
        memberDeletedAt: appUser.deletedAt,
      })
      .from(supportTeam)
      .leftJoin(company, eq(company.id, supportTeam.companyId))
      .leftJoin(supportTeamMember, eq(supportTeamMember.teamId, supportTeam.id))
      .leftJoin(appUser, eq(appUser.id, supportTeamMember.userId))
      .where(where)
      .orderBy(asc(supportTeam.name), asc(supportTeam.id));

    const teams = new Map<number, TeamRow>();
    for (const row of rows) {
      let team = teams.get(row.id);
      if (!team) {
        team = {
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description,
          isActive: row.isActive,
          companyId: row.companyId,
          companyCode: row.companyCode,
          members: [],
        };
        teams.set(row.id, team);
      }
      if (row.memberUserId !== null && row.memberDeletedAt === null) {
        team.members.push({
          userId: row.memberUserId,
          fullName: row.memberFullName ?? '',
          username: row.memberUsername ?? '',
          isLead: row.memberIsLead ?? false,
        });
      }
    }
    // หัวหน้าขึ้นก่อนเสมอ แล้วเรียงตามชื่อ — หน้าจอแสดงตามลำดับที่ได้รับตรง ๆ
    for (const team of teams.values()) {
      team.members.sort(
        (a, b) => Number(b.isLead) - Number(a.isLead) || a.fullName.localeCompare(b.fullName),
      );
    }
    return [...teams.values()];
  }
}
