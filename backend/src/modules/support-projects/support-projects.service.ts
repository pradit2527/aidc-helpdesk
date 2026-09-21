import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  DomainError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
  type FieldIssue,
} from '../../common/errors/domain-error';
import type { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import {
  SupportProjectRepository,
  type SupportProjectRow,
  type SupportProjectWrite,
} from '../../db/repositories/support-project.repository';
import { company, supportTeam, ticketCategory } from '../../db/schema';
import {
  chatwootCreateWebsiteInbox,
  chatwootWebsiteInboxes,
} from '../../integrations/chatwoot/chatwoot-api';
import { readChatwootSyncConfig } from '../../integrations/chatwoot/chatwoot-sync.config';
import { readChatwootWidgetConfig } from '../../integrations/chatwoot/chatwoot-widget.config';
import {
  ChatwootInboxDto,
  PublicSupportProjectDto,
  SupportProjectDto,
  type CreateSupportProjectDto,
  type UpdateSupportProjectDto,
} from './dto/support-project.dto';

/**
 * สิทธิ์ที่เปิดกล่องแชทได้ — ต้องตรงกับ SupportChatService.STAFF_PERMISSION
 *
 * คนที่เห็นแชทจาก widget ในกล่องแชทอยู่แล้ว ต้องรู้ว่าแชทนั้นมาจากเว็บไหน
 * ไม่งั้นป้ายโครงการในกล่องแชทเป็นชื่อที่เขาเปิดดูรายละเอียดไม่ได้เลย
 */
const READ_PERMISSION = 'ticket.change_status';
/** การผูก inbox คือการเปิดทางให้ข้อความจากภายนอกไหลเข้าบริษัทหนึ่ง — ด่านเดียวกับการมอบบทบาท */
const WRITE_PERMISSION = 'user.assign_role';

/** ต้องตรงกับเส้นทางจริงของ ChatwootWebhookController (รวม global prefix api/v1) */
const WEBHOOK_PATH_HINT = '/api/v1/integrations/chatwoot/events';

@Injectable()
export class SupportProjectsService {
  private readonly logger = new Logger('SupportProjects');
  private readonly chatwoot = readChatwootSyncConfig();
  private readonly widget = readChatwootWidgetConfig();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly projects: SupportProjectRepository,
  ) {}

  /** GET /support-projects */
  async list(scope: AccessScope): Promise<SupportProjectDto[]> {
    scope.require(READ_PERMISSION, WRITE_PERMISSION);

    const rows = await this.projects.listVisible(scope);
    // คิวรีเดียวสำหรับทุกโครงการ ไม่ใช่โครงการละคิวรี — ฐานข้อมูล dev เสียเวลา ~250 ms ต่อรอบ
    const openChats = await this.projects.openChatCounts(rows.map((r) => r.id));
    return rows.map((row) => toDto(row, openChats.get(row.id) ?? 0, this.webhookHint()));
  }

  /**
   * เส้นทาง webhook ที่หน้าผู้ดูแลเอาไปแสดงให้คนคัดลอกไปวางใน Chatwoot
   *
   * ⚠️ คืนเฉพาะ path — ไม่มีโฮสต์และไม่มี `?token=` เด็ดขาด
   *    token เป็นความลับ ถ้าส่งออกมาทาง API มันจะไปโผล่ในหน้าเว็บ ใน log ของเบราว์เซอร์
   *    และในภาพหน้าจอที่คนส่งต่อกันในแชท
   */
  private webhookHint(): string | null {
    return this.widget.webhookToken ? WEBHOOK_PATH_HINT : null;
  }

  /**
   * GET /support-projects/chatwoot-inboxes
   *
   * ⚠️ อ่านอย่างเดียว และคัดเฉพาะฟิลด์ที่เปิดเผยได้ — hmac_token ของ inbox
   *    อยู่ใน payload ที่ Chatwoot คืนมาด้วย แต่ถูกตัดทิ้งที่ chatwootWebsiteInboxes
   */
  async chatwootInboxes(scope: AccessScope): Promise<ChatwootInboxDto[]> {
    scope.require(WRITE_PERMISSION);

    if (!this.chatwoot.apiReady) {
      throw new ServiceUnavailableError(
        'CHATWOOT_NOT_CONFIGURED',
        'ຍັງບໍ່ໄດ້ຕັ້ງຄ່າການເຊື່ອມຕໍ່ກັບ Chatwoot — ກະລຸນາແຈ້ງຜູ້ດູແລລະບົບ',
      );
    }

    // ยิงไป Chatwoot กับอ่านโครงการพร้อมกัน — ไม่ต้องรอทีละรอบ
    const [inboxes, projects] = await Promise.all([
      chatwootWebsiteInboxes(this.chatwoot).catch((error: unknown) => {
        this.logger.warn(
          `อ่านรายการ inbox จาก Chatwoot ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw new ServiceUnavailableError(
          'CHATWOOT_UNREACHABLE',
          'ຕິດຕໍ່ Chatwoot ບໍ່ໄດ້ໃນຕອນນີ້ — ກະລຸນາລອງໃໝ່ພາຍຫຼັງ',
        );
      }),
      this.projects.listVisible(scope),
    ]);

    const linked = new Map(
      projects
        .filter((p) => p.chatwootInboxId !== null)
        .map((p) => [p.chatwootInboxId!, p.code] as const),
    );

    return inboxes.map((inbox) => ({
      id: inbox.id,
      name: inbox.name ?? '',
      channel_type: inbox.channel_type ?? '',
      website_url: inbox.website_url ?? null,
      website_token: inbox.website_token ?? null,
      linked_project_code: linked.get(inbox.id) ?? null,
    }));
  }

  /**
   * POST /support-projects/{id}/chatwoot-inbox — สร้าง inbox ใหม่ใน Chatwoot ให้โครงการนี้
   *
   * ⚠️ endpoint เดียวในระบบที่ **เขียน** ลง Chatwoot ซึ่งเป็นระบบที่ทีมใช้งานอยู่จริง
   *    inbox ที่สร้างจะโผล่ในแอปของเจ้าหน้าที่ทันที และลบทิ้งจากที่นี่ไม่ได้
   *    ด่านจึงเป็น user.assign_role เท่ากับการแก้โครงการทุกทาง และโครงการต้องอยู่ในขอบเขต
   *
   * **สร้างใหม่อย่างเดียว ไม่ผูกซ้ำ** — โครงการที่มี inbox อยู่แล้วได้ 409
   * การเปลี่ยน inbox ของโครงการที่มีอยู่แล้วยังทำผ่าน PATCH เหมือนเดิม
   * (ที่นั่นเลือกจาก inbox ที่มีอยู่ ไม่ได้สร้างของใหม่ทิ้งไว้ในระบบของคนอื่น)
   */
  async createChatwootInbox(scope: AccessScope, id: number): Promise<SupportProjectDto> {
    scope.require(WRITE_PERMISSION);

    const before = await this.projects.mustFind(id);
    this.assertProjectInScope(scope, before.companyId);

    if (before.chatwootInboxId !== null) {
      throw new DomainError({
        code: 'ALREADY_LINKED',
        message: 'ໂຄງການນີ້ຜູກກັບ inbox ຢູ່ແລ້ວ',
        kind: 'conflict',
        issues: [{ field: 'chatwoot_inbox_id', message: 'ປ່ຽນ inbox ໄດ້ທີ່ໜ້າແກ້ໄຂໂຄງການ' }],
      });
    }

    /*
     * ⚠️ โครงการที่ปิดใช้งานอยู่ (เช่น ระบบที่ลงทะเบียนไว้ล่วงหน้าแต่ยังไม่ถึงคิวเปิดใช้)
     *    ต้องเปิดใช้งานก่อน แล้วค่อยสร้าง inbox — ไม่ใช่กันย้อนกลับ
     *
     *    ก่อนเปิดใช้งานจริง เจ้าของระบบยังไม่ต้องการให้มี inbox ของโครงการนั้นเกิดขึ้น
     *    ใน Chatwoot เลย แม้จะยังไม่ผูกกับหน้าเว็บใดก็ตาม — inbox ที่สร้างไปแล้วลบเองไม่ได้
     *    (ดู log ด้านล่างตอนชนกันของ ALREADY_LINKED) การกันไว้ตรงนี้ที่เดียว
     *    คุ้มครองทุกโครงการที่ยังปิดอยู่พร้อมกัน ไม่ใช่แค่ตัวใดตัวหนึ่ง
     */
    if (!before.isActive) {
      throw new ValidationError('VALIDATION_ERROR', 'ໂຄງການນີ້ຍັງປິດໃຊ້ງານຢູ່', [
        {
          field: 'is_active',
          message: 'ເປີດໃຊ້ງານໂຄງການກ່ອນ ຈຶ່ງສ້າງ inbox ໃນ Chatwoot ໄດ້',
        },
      ]);
    }

    if (!this.chatwoot.apiReady) {
      throw new ServiceUnavailableError(
        'CHATWOOT_NOT_CONFIGURED',
        'ຍັງບໍ່ໄດ້ຕັ້ງຄ່າການເຊື່ອມຕໍ່ກັບ Chatwoot — ກະລຸນາແຈ້ງຜູ້ດູແລລະບົບ',
      );
    }

    /*
     * Chatwoot บังคับ website_url ของช่องทาง web_widget — ตรวจก่อนยิง
     * ไม่งั้นผู้ใช้จะได้ข้อความดิบของ Rails กลับไปแทนคำแนะนำว่าต้องกรอกช่องไหน
     */
    if (!before.websiteUrl) {
      throw new ValidationError('VALIDATION_ERROR', 'ກະລຸນາໃສ່ທີ່ຢູ່ເວັບຂອງໂຄງການກ່ອນ', [
        { field: 'website_url', message: 'Chatwoot ຕ້ອງການທີ່ຢູ່ເວັບທີ່ widget ຈະຖືກຝັງ' },
      ]);
    }

    const created = await chatwootCreateWebsiteInbox(this.chatwoot, {
      name: before.name,
      websiteUrl: before.websiteUrl,
      locale: before.locale,
    }).catch((error: unknown) => {
      this.logger.warn(`สร้าง inbox ใน Chatwoot ไม่สำเร็จ: ${describe(error)}`);
      throw new ServiceUnavailableError(
        'CHATWOOT_UNREACHABLE',
        'ສ້າງ inbox ໃນ Chatwoot ບໍ່ສຳເລັດ — ກະລຸນາລອງໃໝ່ພາຍຫຼັງ',
      );
    });

    /*
     * อ่านซ้ำก่อนเขียน — ระหว่างที่รอ Chatwoot ตอบ อาจมีคนผูก inbox ให้โครงการนี้ไปแล้ว
     * เขียนทับตรงนี้จะทำให้ inbox ที่เขาเพิ่งผูกหลุดออกไปเงียบ ๆ
     * inbox ที่เราเพิ่งสร้างจะค้างอยู่ใน Chatwoot โดยไม่มีโครงการไหนใช้ — ลบเองไม่ได้
     * จึงบันทึกเลขไว้ใน log ให้ผู้ดูแลตามไปเก็บกวาดในแอปของ Chatwoot
     */
    const current = await this.projects.mustFind(id);
    if (current.chatwootInboxId !== null) {
      this.logger.warn(
        `โครงการ ${current.code} ถูกผูก inbox ไปก่อนแล้ว — inbox #${created.id} ที่เพิ่งสร้างใน Chatwoot ไม่มีใครใช้ ต้องลบมือ`,
      );
      throw new DomainError({
        code: 'ALREADY_LINKED',
        message: 'ໂຄງການນີ້ຜູກກັບ inbox ຢູ່ແລ້ວ',
        kind: 'conflict',
        issues: [{ field: 'chatwoot_inbox_id', message: 'ປ່ຽນ inbox ໄດ້ທີ່ໜ້າແກ້ໄຂໂຄງການ' }],
      });
    }

    await this.projects.updateProject(
      id,
      { chatwootInboxId: created.id, chatwootWebsiteToken: created.websiteToken },
      scope.userId,
      current,
    );
    this.logger.log(`สร้าง inbox #${created.id} ใน Chatwoot ให้โครงการ ${current.code} แล้ว`);
    return this.detail(id);
  }

  /** POST /support-projects */
  async create(scope: AccessScope, dto: CreateSupportProjectDto): Promise<SupportProjectDto> {
    scope.require(WRITE_PERMISSION);

    const issues: FieldIssue[] = [];
    const code = (dto.code ?? '').trim().toUpperCase();
    const name = (dto.name ?? '').trim();
    if (name.length < 2) issues.push({ field: 'name', message: 'ຊື່ໂຄງການສັ້ນເກີນໄປ' });

    const write: SupportProjectWrite = {
      code,
      name,
      websiteUrl: normalizeUrl(dto.website_url, issues),
      companyId: await this.resolveCompanyId(scope, dto.company_id ?? null, issues),
      locale: dto.locale ?? 'lo',
      isActive: dto.is_active ?? true,
      chatwootWebsiteToken: normalizeToken(dto.chatwoot_website_token),
    };

    await this.resolveReferences(scope, dto.default_category_id, dto.team_id, write, issues);
    if (issues.length > 0) throw new ValidationError('VALIDATION_ERROR', issues[0]!.message, issues);

    await this.assertUnique(code, dto.chatwoot_inbox_id ?? null);
    write.chatwootInboxId = dto.chatwoot_inbox_id ?? null;

    const projectId = await this.projects.createProject(
      write as Required<Pick<SupportProjectWrite, 'code' | 'name'>> & SupportProjectWrite,
      scope.userId,
    );
    return this.detail(projectId);
  }

  /** PATCH /support-projects/{id} */
  async update(
    scope: AccessScope,
    id: number,
    dto: UpdateSupportProjectDto,
  ): Promise<SupportProjectDto> {
    scope.require(WRITE_PERMISSION);

    const before = await this.projects.mustFind(id);
    this.assertProjectInScope(scope, before.companyId);

    const issues: FieldIssue[] = [];
    const write: SupportProjectWrite = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name.length < 2) issues.push({ field: 'name', message: 'ຊື່ໂຄງການສັ້ນເກີນໄປ' });
      write.name = name;
    }
    if (dto.code !== undefined) write.code = dto.code.trim().toUpperCase();
    if (dto.website_url !== undefined) write.websiteUrl = normalizeUrl(dto.website_url, issues);
    if (dto.locale !== undefined) write.locale = dto.locale;
    if (dto.is_active !== undefined) write.isActive = dto.is_active;
    if (dto.chatwoot_website_token !== undefined) {
      write.chatwootWebsiteToken = normalizeToken(dto.chatwoot_website_token);
    }
    if (dto.company_id !== undefined) {
      write.companyId = await this.resolveCompanyId(scope, dto.company_id, issues);
    }

    await this.resolveReferences(scope, dto.default_category_id, dto.team_id, write, issues);
    if (issues.length > 0) throw new ValidationError('VALIDATION_ERROR', issues[0]!.message, issues);

    await this.assertUnique(
      write.code,
      dto.chatwoot_inbox_id === undefined ? undefined : dto.chatwoot_inbox_id,
      id,
    );
    if (dto.chatwoot_inbox_id !== undefined) write.chatwootInboxId = dto.chatwoot_inbox_id;

    await this.projects.updateProject(id, write, scope.userId, before);
    return this.detail(id);
  }

  /**
   * GET /public/support-projects/{code} — ไม่ต้องล็อกอิน
   *
   * ⚠️ "ไม่มีโครงการนี้" "ปิดอยู่" และ "ยังไม่ได้ผูก inbox" ตอบเหมือนกันทุกประการ
   *    ถ้าตอบต่างกัน ใครก็ไล่ยิงรหัสเพื่อดูว่ากลุ่มบริษัทมีระบบอะไรอยู่บ้าง
   *    และระบบไหนที่ "มีอยู่แต่ยังไม่เปิด" ซึ่งเป็นข้อมูลที่ไม่ควรให้คนนอกรู้
   */
  async publicByCode(code: string): Promise<PublicSupportProjectDto> {
    const notFound = (): never => {
      throw new NotFoundError('NOT_FOUND', 'ບໍ່ພົບໂຄງການນີ້');
    };

    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,40}$/.test(normalized)) return notFound();

    const row = await this.projects.byCode(normalized);
    if (!row || !row.isActive || row.chatwootInboxId === null || !row.chatwootWebsiteToken) {
      return notFound();
    }
    if (!this.widget.publicUrl) return notFound();

    return {
      code: row.code,
      name: row.name,
      locale: asLocale(row.locale),
      chatwoot: { base_url: this.widget.publicUrl, website_token: row.chatwootWebsiteToken },
    };
  }

  // ── ภายใน ─────────────────────────────────────────────────────────────

  private async detail(id: number): Promise<SupportProjectDto> {
    const row = await this.projects.mustFind(id);
    const openChats = await this.projects.openChatCounts([row.id]);
    return toDto(row, openChats.get(row.id) ?? 0, this.webhookHint());
  }

  /** รหัสซ้ำหรือ inbox ถูกผูกไว้แล้ว → 409 พร้อมชี้ฟิลด์ที่ชน */
  private async assertUnique(
    code: string | undefined,
    inboxId: number | null | undefined,
    exceptId?: number,
  ): Promise<void> {
    // ยิงสองคำถามพร้อมกัน — ทุกรอบเพิ่มเวลาราว 250 ms บนฐานข้อมูล dev
    const [codeTaken, inboxTaken] = await Promise.all([
      code === undefined ? Promise.resolve(false) : this.projects.codeTaken(code, exceptId),
      inboxId === undefined || inboxId === null
        ? Promise.resolve(false)
        : this.projects.inboxTaken(inboxId, exceptId),
    ]);

    const issues: FieldIssue[] = [];
    if (codeTaken) issues.push({ field: 'code', message: 'ລະຫັດໂຄງການນີ້ມີຢູ່ແລ້ວ' });
    if (inboxTaken) {
      issues.push({ field: 'chatwoot_inbox_id', message: 'inbox ນີ້ຖືກຜູກກັບໂຄງການອື່ນແລ້ວ' });
    }
    if (issues.length > 0) {
      throw new DomainError({
        code: 'DUPLICATE_SUPPORT_PROJECT',
        message: issues[0]!.message,
        kind: 'conflict',
        issues,
      });
    }
  }

  /**
   * บริษัทของโครงการ
   *
   * ⚠️ โครงการส่วนกลาง (null) สร้างได้เฉพาะ super_admin — กติกาเดียวกับทีมส่วนกลาง
   *    โครงการที่ไม่ผูกบริษัทจะปรากฏในรายการของผู้ดูแลทุกบริษัท
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
          message: 'ກະລຸນາເລືອກບໍລິສັດ — ໂຄງການສ່ວນກາງສ້າງໄດ້ສະເພາະຜູ້ດູແລລະບົບ',
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

  /**
   * หมวดหมู่และทีมที่โครงการอ้างถึงต้องมีอยู่จริงและอยู่ในขอบเขตของผู้เรียก
   *
   * ⚠️ ตรวจฝั่งเซิร์ฟเวอร์เสมอ — id มาจากเบราว์เซอร์ ถ้าไม่ตรวจ ผู้ดูแลบริษัท ก.
   *    จะชี้โครงการของตัวเองไปที่ทีมของบริษัท ข. แล้วแชทจากเว็บถูกส่งเข้ามือทีมที่
   *    มองบริษัทนั้นไม่เห็น — เรื่องค้างอยู่กับคนที่เปิดมันไม่ได้
   *
   * ทั้งสองอย่าง "ของส่วนกลาง" (company_id เป็น null) ใช้ได้กับทุกคน
   * เหมือนที่รายการทีมและหมวดหมู่แสดงของส่วนกลางให้ผู้ดูแลทุกบริษัทเห็นอยู่แล้ว
   */
  private async resolveReferences(
    scope: AccessScope,
    categoryId: number | null | undefined,
    teamId: number | null | undefined,
    write: SupportProjectWrite,
    issues: FieldIssue[],
  ): Promise<void> {
    // อ่านสองตารางพร้อมกัน ไม่ใช่ต่อคิวกัน
    const [categoryRow, teamRow] = await Promise.all([
      categoryId === undefined || categoryId === null
        ? Promise.resolve(null)
        : this.db
            .select({ id: ticketCategory.id, companyId: ticketCategory.companyId })
            .from(ticketCategory)
            .where(eq(ticketCategory.id, categoryId))
            .limit(1)
            .then((rows) => rows[0] ?? null),
      teamId === undefined || teamId === null
        ? Promise.resolve(null)
        : this.db
            .select({ id: supportTeam.id, companyId: supportTeam.companyId })
            .from(supportTeam)
            .where(eq(supportTeam.id, teamId))
            .limit(1)
            .then((rows) => rows[0] ?? null),
    ]);

    if (categoryId !== undefined) {
      if (categoryId === null) write.defaultCategoryId = null;
      else if (!categoryRow || !inReach(scope, categoryRow.companyId)) {
        issues.push({
          field: 'default_category_id',
          message: 'ໝວດໝູ່ນີ້ບໍ່ຢູ່ໃນຂອບເຂດທີ່ທ່ານດູແລ',
        });
      } else write.defaultCategoryId = categoryId;
    }

    if (teamId !== undefined) {
      if (teamId === null) write.teamId = null;
      else if (!teamRow || !inReach(scope, teamRow.companyId)) {
        issues.push({ field: 'team_id', message: 'ທີມນີ້ບໍ່ຢູ່ໃນຂອບເຂດທີ່ທ່ານດູແລ' });
      } else write.teamId = teamId;
    }
  }

  /** โครงการที่อยู่นอกขอบเขตของผู้เรียก ต้องแก้ไม่ได้ แม้จะรู้ id */
  private assertProjectInScope(scope: AccessScope, projectCompanyId: number | null): void {
    if (scope.isSuperAdmin) return;
    if (projectCompanyId === null) {
      throw new ForbiddenError('FORBIDDEN', 'ໂຄງການສ່ວນກາງແກ້ໄຂໄດ້ສະເພາະຜູ້ດູແລລະບົບ');
    }
    if (!scope.inScope(projectCompanyId)) {
      throw new ForbiddenError('FORBIDDEN', 'ໂຄງການນີ້ບໍ່ຢູ່ໃນຂອບເຂດທີ່ທ່ານດູແລ');
    }
  }
}

/** ข้อความผิดพลาดที่ปลอดภัยพอจะเขียนลง log — ไม่พ่น object ทั้งก้อนออกมา */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** ของส่วนกลาง (null) ทุกคนใช้ได้ · ของบริษัทต้องอยู่ในขอบเขต */
function inReach(scope: AccessScope, companyId: number | null): boolean {
  return companyId === null || scope.inScope(companyId);
}

function asLocale(value: string): 'lo' | 'th' | 'en' {
  return value === 'th' || value === 'en' ? value : 'lo';
}

function toDto(
  row: SupportProjectRow,
  openChats: number,
  webhookUrlHint: string | null,
): SupportProjectDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    website_url: row.websiteUrl,
    locale: asLocale(row.locale),
    is_active: row.isActive,
    company: row.companyId === null ? null : { id: row.companyId, code: row.companyCode ?? '' },
    default_category:
      row.defaultCategoryId === null
        ? null
        : { id: row.defaultCategoryId, name: row.defaultCategoryName ?? '' },
    team: row.teamId === null ? null : { id: row.teamId, name: row.teamName ?? '' },
    chatwoot: { inbox_id: row.chatwootInboxId, website_token: row.chatwootWebsiteToken },
    open_chats: openChats,
    webhook_url_hint: webhookUrlHint,
    created_at: row.createdAt.toISOString(),
  };
}

/** ที่อยู่เว็บว่างถือเป็นไม่มี — และต้องเป็น http/https เท่านั้น */
function normalizeUrl(value: string | null | undefined, issues: FieldIssue[]): string | null {
  if (value === undefined || value === null) return null;
  const text = value.trim();
  if (text.length === 0) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
  } catch {
    issues.push({ field: 'website_url', message: 'ຕ້ອງເປັນທີ່ຢູ່ເວັບທີ່ຂຶ້ນຕົ້ນດ້ວຍ http:// ຫຼື https://' });
    return null;
  }
  return text.slice(0, 255);
}

function normalizeToken(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}
