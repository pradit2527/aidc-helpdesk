import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { ForbiddenError, ValidationError, type FieldIssue } from '../../common/errors/domain-error';
import type { AccessScope } from '../../common/scope';
import { ScopeService } from '../../common/scope.service';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import {
  SupportTeamRepository,
  type TeamRow,
} from '../../db/repositories/support-team.repository';
import { TicketRepository } from '../../db/repositories/ticket.repository';
import { company } from '../../db/schema';
import {
  CreateSupportTeamDto,
  SupportTeamCandidateDto,
  SupportTeamDto,
  UpdateSupportTeamDto,
} from './dto/support-team.dto';

/**
 * ทีมสนับสนุน — ใครอยู่ทีมไหน ใครเป็นหัวหน้า
 *
 * ทีมมีหน้าที่เดียวในระบบนี้: ตอบว่า "หัวหน้าคนนี้มอบหมายงานให้ใครได้บ้าง"
 * ไม่ใช่โครงสร้างองค์กร ไม่ใช่การแบ่งคิวงาน และไม่มีผลกับการมองเห็นข้อมูล
 * (ขอบเขตการมองเห็นยังเป็นเรื่องของ AccessScope เหมือนเดิมทุกประการ)
 *
 * หัวหน้าทีมต้องมีสองอย่างพร้อมกัน: บทบาท support_lead (อำนาจมอบหมาย) และ is_lead ของทีมนั้น
 * (ขอบเขตว่ามอบให้ใครได้) — เซิร์ฟเวอร์ปฏิเสธการตั้ง is_lead ให้คนที่ไม่มีบทบาทหัวหน้า
 *
 * ⚠️ การแก้ทีมคือการแก้โครงสร้างอำนาจ จึงใช้ด่านเดียวกับการมอบบทบาท
 *    (user.assign_role) ไม่ใช่ ticket.assign ที่เจ้าหน้าที่ทุกคนถืออยู่แล้ว —
 *    ถ้าใช้ตัวหลัง เจ้าหน้าที่คนใดก็ตั้งตัวเองเป็นหัวหน้าทีมแล้วสั่งคนอื่นได้
 */
@Injectable()
export class SupportTeamsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly teams: SupportTeamRepository,
    private readonly tickets: TicketRepository,
    private readonly scopes: ScopeService,
  ) {}

  /** GET /support-teams */
  async list(scope: AccessScope): Promise<SupportTeamDto[]> {
    scope.require('ticket.assign', 'user.assign_role');

    const rows = await this.teams.listVisibleTeams(scope);
    const memberIds = [...new Set(rows.flatMap((t) => t.members.map((m) => m.userId)))];
    // คิวรีเดียวสำหรับทุกคนในทุกทีม ไม่ใช่ทีมละคิวรีหรือคนละคิวรี
    const openCounts = await this.tickets.openTicketCounts(memberIds);

    return rows.map((row) => SupportTeamsService.toDto(row, openCounts));
  }

  /** GET /support-teams/candidates */
  async candidates(scope: AccessScope): Promise<SupportTeamCandidateDto[]> {
    scope.require('user.assign_role');

    const rows = await this.tickets.ticketWorkerCandidates(scope);
    // ป้ายว่าใครตั้งเป็นหัวหน้าได้ — คิวรีเดียวสำหรับทุกคน หน้าจอจะได้ไม่ให้เลือกคนที่ถูกปฏิเสธแน่
    const capable = await this.teams.assignCapableIds(rows.map((r) => r.id));
    return rows.map((r) => ({
      id: r.id,
      full_name: r.fullName,
      username: r.username,
      company: { id: r.companyId, code: r.companyCode },
      can_lead: capable.has(r.id),
    }));
  }

  /** POST /support-teams */
  async create(scope: AccessScope, dto: CreateSupportTeamDto): Promise<SupportTeamDto> {
    scope.require('user.assign_role');

    const issues: FieldIssue[] = [];
    const name = (dto.name ?? '').trim();
    if (name.length < 2) issues.push({ field: 'name', message: 'ຊື່ທີມສັ້ນເກີນໄປ' });

    const code = (dto.code ?? '').trim() || slugify(name);
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(code)) {
      issues.push({
        field: 'code',
        message: 'ສ້າງລະຫັດຈາກຊື່ບໍ່ໄດ້ ກະລຸນາລະບຸລະຫັດເອງ (a-z 0-9 ແລະ -)',
      });
    }

    const companyId = await this.resolveCompanyId(scope, dto.company_id ?? null, issues);
    const membership = await this.resolveMembership(scope, dto.lead_ids, dto.member_ids, issues);

    if (issues.length === 0 && (await this.teams.codeTaken(code))) {
      issues.push({ field: 'code', message: 'ລະຫັດທີມນີ້ມີຢູ່ແລ້ວ' });
    }
    if (issues.length > 0) throw new ValidationError('VALIDATION_ERROR', issues[0]!.message, issues);

    const teamId = await this.teams.createTeam(
      {
        code,
        name,
        description: normalizeDescription(dto.description),
        companyId,
        isActive: true,
        leadIds: membership.leadIds,
        memberIds: membership.memberIds,
      },
      scope.userId,
    );

    // สมาชิกใหม่ต้องได้อำนาจ/สังกัดทันที ไม่ใช่รอแคชสิทธิ์หมดอายุเอง
    this.invalidate(membership.allIds);
    return this.detail(teamId);
  }

  /** PATCH /support-teams/{id} */
  async update(scope: AccessScope, id: number, dto: UpdateSupportTeamDto): Promise<SupportTeamDto> {
    scope.require('user.assign_role');

    const before = await this.teams.teamHeader(id);
    this.assertTeamInScope(scope, before.companyId);

    const issues: FieldIssue[] = [];
    const patch: Parameters<SupportTeamRepository['updateTeam']>[1] = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name.length < 2) issues.push({ field: 'name', message: 'ຊື່ທີມສັ້ນເກີນໄປ' });
      patch.name = name;
    }

    if (dto.code !== undefined) {
      const code = dto.code.trim();
      if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(code)) {
        issues.push({ field: 'code', message: 'ໃຊ້ a-z 0-9 ແລະ - ຍາວ 2–40 ຕົວອັກສອນ' });
      } else if (await this.teams.codeTaken(code, id)) {
        issues.push({ field: 'code', message: 'ລະຫັດທີມນີ້ມີຢູ່ແລ້ວ' });
      }
      patch.code = code;
    }

    if (dto.description !== undefined) patch.description = normalizeDescription(dto.description);
    if (dto.is_active !== undefined) patch.isActive = dto.is_active;

    if (dto.company_id !== undefined) {
      patch.companyId = await this.resolveCompanyId(scope, dto.company_id, issues);
    }

    /*
     * รายชื่อถูกแทนที่ทั้งชุด จึงต้องส่งหัวหน้ามาด้วยเสมอเมื่อแตะรายชื่อ
     *
     * ถ้ายอมให้ส่งแต่ member_ids ทีมจะเหลือศูนย์หัวหน้าโดยที่ผู้แก้ไม่ได้ตั้งใจ
     * แล้วไม่มีใครมอบหมายงานในทีมนั้นได้อีก จนกว่าจะมีคนสังเกตเห็น
     */
    const touchesMembers = dto.lead_ids !== undefined || dto.member_ids !== undefined;
    let affected: number[] = [];
    if (touchesMembers) {
      const membership = await this.resolveMembership(
        scope,
        dto.lead_ids ?? [],
        dto.member_ids ?? [],
        issues,
      );
      patch.leadIds = membership.leadIds;
      patch.memberIds = membership.memberIds;
      affected = membership.allIds;
    }

    if (issues.length > 0) throw new ValidationError('VALIDATION_ERROR', issues[0]!.message, issues);

    const previousMembers = await this.teams.memberIdsOf(id);
    await this.teams.updateTeam(id, patch, scope.userId, {
      code: before.code,
      name: before.name,
      companyId: before.companyId,
      memberIds: previousMembers,
    });

    /*
     * ล้างสิทธิ์ที่จำไว้ของทุกคนที่เกี่ยวข้อง — ทั้งคนที่ออกและคนที่เข้า
     *
     * คนที่ถูกถอดออกจากทีมสำคัญกว่าคนที่เพิ่งเข้า เพราะเขาคือคนที่ต้อง
     * "หมดอำนาจ" และอำนาจที่ค้างอยู่อีก 30 วินาทีคือสิ่งที่ต้องตัดให้สั้นที่สุด
     * การปิดทีม (is_active = false) กระทบทุกคนในทีมเช่นกัน
     */
    this.invalidate([...previousMembers, ...affected]);
    return this.detail(id);
  }

  // ── ภายใน ─────────────────────────────────────────────────────────────

  private async detail(teamId: number): Promise<SupportTeamDto> {
    const row = await this.teams.teamById(teamId);
    const openCounts = await this.tickets.openTicketCounts(row.members.map((m) => m.userId));
    return SupportTeamsService.toDto(row, openCounts);
  }

  private static toDto(row: TeamRow, openCounts: Map<number, number>): SupportTeamDto {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      is_active: row.isActive,
      company: row.companyId === null ? null : { id: row.companyId, code: row.companyCode ?? '' },
      members: row.members.map((m) => ({
        id: m.userId,
        full_name: m.fullName,
        username: m.username,
        is_lead: m.isLead,
        open_tickets: openCounts.get(m.userId) ?? 0,
      })),
    };
  }

  /**
   * บริษัทของทีม
   *
   * ⚠️ ทีมส่วนกลาง (null) สร้างได้เฉพาะ super_admin — ทีมที่ไม่ผูกบริษัทจะปรากฏ
   *    ในรายการของผู้ดูแลทุกบริษัท การให้ผู้ดูแลบริษัทเดียวสร้างได้ เท่ากับให้เขา
   *    ใส่ข้อมูลเข้าไปในหน้าจอของบริษัทอื่นที่เขาไม่ได้ดูแล
   */
  private async resolveCompanyId(
    scope: AccessScope,
    requested: number | null,
    issues: FieldIssue[],
  ): Promise<number | null> {
    if (requested === null) {
      if (!scope.isSuperAdmin) {
        issues.push({
          field: 'company_id',
          message: 'ກະລຸນາເລືອກບໍລິສັດ — ທີມສ່ວນກາງສ້າງໄດ້ສະເພາະຜູ້ດູແລລະບົບ',
        });
      }
      return null;
    }

    // ไม่มีอยู่จริงกับอยู่นอกขอบเขต ตอบข้อความเดียวกัน กันการไล่เดาว่ามีบริษัทไหนบ้าง
    const unavailable: FieldIssue = {
      field: 'company_id',
      message: 'ບໍລິສັດນີ້ບໍ່ຢູ່ໃນຂອບເຂດທີ່ທ່ານດູແລ',
    };
    if (!Number.isInteger(requested) || requested <= 0 || !scope.inScope(requested)) {
      issues.push(unavailable);
      return null;
    }

    const [row] = await this.db
      .select({ id: company.id, isActive: company.isActive })
      .from(company)
      .where(eq(company.id, requested))
      .limit(1);
    if (!row) {
      issues.push(unavailable);
      return null;
    }
    if (!row.isActive) {
      issues.push({ field: 'company_id', message: 'ບໍລິສັດນີ້ຖືກປິດການໃຊ້ງານແລ້ວ' });
      return null;
    }
    return requested;
  }

  /** ทีมที่อยู่นอกขอบเขตของผู้เรียก ต้องแก้ไม่ได้ แม้จะรู้ id */
  private assertTeamInScope(scope: AccessScope, teamCompanyId: number | null): void {
    if (scope.isSuperAdmin) return;
    if (teamCompanyId === null) {
      throw new ForbiddenError('FORBIDDEN', 'ທີມສ່ວນກາງແກ້ໄຂໄດ້ສະເພາະຜູ້ດູແລລະບົບ');
    }
    if (!scope.inScope(teamCompanyId)) {
      throw new ForbiddenError('FORBIDDEN', 'ທີມນີ້ບໍ່ຢູ່ໃນຂອບເຂດທີ່ທ່ານດູແລ');
    }
  }

  /**
   * ตรวจว่าทุก id ที่ส่งมาเป็นคนที่ทำงานกับเรื่องได้จริง และอยู่ในขอบเขตของผู้เรียก
   *
   * ⚠️ ตรวจที่ฝั่งเซิร์ฟเวอร์เสมอ — id มาจากเบราว์เซอร์ ถ้าไม่ตรวจ ผู้ดูแลบริษัท ก.
   *    จะใส่พนักงานบริษัท ข. เข้าทีมได้ แล้วหัวหน้าทีมจะมอบหมายเรื่องข้ามบริษัท
   *    ให้คนที่เปิดเรื่องนั้นไม่ได้ (เรื่องค้างอยู่ในมือคนที่มองไม่เห็นมัน)
   */
  private async resolveMembership(
    scope: AccessScope,
    leadIds: readonly number[],
    memberIds: readonly number[],
    issues: FieldIssue[],
  ): Promise<{ leadIds: number[]; memberIds: number[]; allIds: number[] }> {
    const leads = [...new Set(leadIds)];
    const members = [...new Set(memberIds)];
    const all = [...new Set([...leads, ...members])];

    if (leads.length === 0) {
      issues.push({ field: 'lead_ids', message: 'ຕ້ອງມີຫົວໜ້າທີມຢ່າງໜ້ອຍໜຶ່ງຄົນ' });
    }

    if (all.length > 0) {
      const allowed = new Set((await this.tickets.ticketWorkerCandidates(scope)).map((c) => c.id));
      const unknownLeads = leads.filter((id) => !allowed.has(id));
      const unknownMembers = members.filter((id) => !allowed.has(id) && !unknownLeads.includes(id));

      if (unknownLeads.length > 0) {
        issues.push({
          field: 'lead_ids',
          message: `ເລືອກໄດ້ສະເພາະຜູ້ທີ່ຮັບເລື່ອງໄດ້ ແລະ ຢູ່ໃນຂອບເຂດຂອງທ່ານ (${unknownLeads.join(', ')})`,
        });
      }
      if (unknownMembers.length > 0) {
        issues.push({
          field: 'member_ids',
          message: `ເລືອກໄດ້ສະເພາະຜູ້ທີ່ຮັບເລື່ອງໄດ້ ແລະ ຢູ່ໃນຂອບເຂດຂອງທ່ານ (${unknownMembers.join(', ')})`,
        });
      }

      /*
       * หัวหน้าต้องถือบทบาทที่มอบหมายงานได้ (support_lead ขึ้นไป)
       *
       * ตรวจเฉพาะคนที่ผ่านข้อข้างบนแล้ว — id ที่ไม่รู้จักตอบข้อความเดียวพอ ไม่ต้องซ้ำอีกข้อความ
       */
      const checkable = leads.filter((id) => allowed.has(id));
      if (checkable.length > 0) {
        const capable = await this.teams.assignCapableIds(checkable);
        const notLeadRole = checkable.filter((id) => !capable.has(id));
        if (notLeadRole.length > 0) {
          issues.push({
            field: 'lead_ids',
            message:
              'ຫົວໜ້າທີມຕ້ອງມີບົດບາດ "ຫົວໜ້າທີມ Helpdesk" (support_lead) ກ່ອນ — ' +
              `ໄປມອບບົດບາດທີ່ໜ້າຜູ້ໃຊ້ (${notLeadRole.join(', ')})`,
          });
        }
      }
    }

    return { leadIds: leads, memberIds: members, allIds: all };
  }

  /** ล้างสิทธิ์ที่จำไว้ของผู้ใช้ที่ได้รับผลกระทบ — ทีมเป็นส่วนหนึ่งของ AccessScope */
  private invalidate(userIds: readonly number[]): void {
    for (const id of new Set(userIds)) this.scopes.invalidate(id);
  }
}

/** คำอธิบายว่างถือเป็นไม่มี ไม่ใช่สตริงว่าง — null อ่านง่ายกว่าทั้งใน API และในฐานข้อมูล */
function normalizeDescription(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

/**
 * รหัสทีมจากชื่อ
 *
 * ชื่อทีมส่วนใหญ่เป็นภาษาลาว ซึ่งแปลงเป็น a-z ไม่ได้ ผลลัพธ์จะว่างหรือสั้นเกินไป
 * กรณีนั้นต้องให้ผู้ใช้ระบุรหัสเอง ดีกว่าสร้างรหัสสุ่มที่ไม่มีใครอ่านออก
 * แล้วไปโผล่ใน URL และในรายงานตลอดอายุของทีมนั้น
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}
