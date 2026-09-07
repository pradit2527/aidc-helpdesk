import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import { NotFoundError } from '../../common/errors/domain-error';
import { paged, type PagedResult } from '../../common/http/pagination';
import type { AccessScope } from '../../common/scope';
import type { Db } from '../../db/client';
import { DB } from '../../db/db.module';
import { appUser, kbArticle, kbCategory } from '../../db/schema';

/**
 * แปลงแท็กจากข้อความคั่นจุลภาคเป็นอาร์เรย์
 *
 * เก็บเป็น varchar ในฐานข้อมูลเพราะจำนวนแท็กต่อบทความน้อยมาก
 * และไม่มีการค้นด้วยแท็กแบบตรงตัว (ค้นด้วย ILIKE บนข้อความรวมอยู่แล้ว)
 * แต่หน้าจอต้องการอาร์เรย์เพื่อแสดงเป็นชิ้น ๆ จึงแยกที่ชั้นนี้ชั้นเดียว
 *
 * ตัดค่าว่างทิ้ง — "a,,b" ต้องได้ 2 แท็ก ไม่ใช่ 3 โดยตัวกลางเป็นช่องว่าง
 */
function splitTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export interface KbListParams {
  q?: string | undefined;
  category_id?: string | undefined;
  status?: string | undefined;
  tag?: string | undefined;
  page: number;
  page_size: number;
}

/**
 * คลังความรู้
 *
 * การมองเห็นซ้อนกันสองชั้น และทั้งสองชั้นต้องผ่านพร้อมกัน
 *
 *   ชั้นที่ 1 · บริษัท — company_id = NULL คือบทความของทั้งกลุ่ม ทุกคนเห็น
 *   ชั้นที่ 2 · ระดับการเปิดเผย
 *       public      ผู้ใช้ทั่วไปเห็นได้
 *       company     เห็นเฉพาะคนในบริษัทนั้น (ชั้นที่ 1 คุมอยู่แล้ว)
 *       agent_only  ต้องมีสิทธิ์แก้ไขบทความจึงจะเห็น — เป็นคู่มือปฏิบัติงานภายใน
 *                   ที่มักมีขั้นตอนเข้าถึงระบบหลังบ้าน จึงห้ามหลุดถึงผู้ใช้ทั่วไป
 *
 * ⚠️ ผู้ใช้ทั่วไปต้องเห็นเฉพาะสถานะ published เท่านั้น
 *    ฉบับร่างคือบทความที่ยังไม่ผ่านการตรวจ การให้ผู้ใช้ทำตามฉบับร่าง
 *    อันตรายกว่าการไม่มีบทความเลย
 */
@Injectable()
export class KbService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** true = ผู้เรียกเป็นคนทำงานหลังบ้าน ไม่ใช่ผู้ใช้ทั่วไป */
  private isEditor(scope: AccessScope): boolean {
    return scope.has('kb.create', 'kb.update', 'kb.publish', 'kb.delete');
  }

  private visibilityWhere(scope: AccessScope): SQL {
    const parts: SQL[] = [isNull(kbArticle.deletedAt) as SQL];

    // ชั้นที่ 1 — บริษัท (NULL = ทั้งกลุ่ม จึงต้อง or ไม่ใช่ตัดทิ้ง)
    if (!scope.isSuperAdmin) {
      const ids = [...scope.companyIds];
      parts.push(
        ids.length === 0
          ? (isNull(kbArticle.companyId) as SQL)
          : (or(isNull(kbArticle.companyId), inArray(kbArticle.companyId, ids)) as SQL),
      );
    }

    // ชั้นที่ 2 — ระดับการเปิดเผย + สถานะ
    if (!this.isEditor(scope)) {
      parts.push(eq(kbArticle.status, 'published') as SQL);
      parts.push(sql`${kbArticle.visibility} <> 'agent_only'` as SQL);
    }

    return and(...parts) as SQL;
  }

  async list(scope: AccessScope, params: KbListParams): Promise<PagedResult<unknown>> {
    const parts: SQL[] = [this.visibilityWhere(scope)];

    if (params.q) {
      /*
       * ใช้ trigram ไม่ใช่ full-text search
       *
       * ภาษาลาวไม่เว้นวรรคระหว่างคำ ตัวตัดคำของ Postgres จึงมองทั้งประโยค
       * เป็นคำเดียว ทำให้ to_tsvector หาอะไรไม่เจอเลย — pg_trgm ทำงานที่ระดับ
       * ตัวอักษรสามตัว จึงไม่ต้องพึ่งการตัดคำ (ดู migration ที่เปิด extension)
       */
      const needle = `%${params.q}%`;
      parts.push(
        or(
          sql`${kbArticle.title} ILIKE ${needle}`,
          sql`${kbArticle.summary} ILIKE ${needle}`,
          sql`${kbArticle.tags} ILIKE ${needle}`,
        ) as SQL,
      );
    }
    if (params.category_id) {
      parts.push(eq(kbArticle.kbCategoryId, Number(params.category_id)) as SQL);
    }
    if (params.tag) {
      parts.push(sql`${kbArticle.tags} ILIKE ${`%${params.tag}%`}` as SQL);
    }
    /*
     * ตัวกรองสถานะใช้ได้เฉพาะคนแก้ไขบทความ
     * ผู้ใช้ทั่วไปที่ส่ง ?status=draft มาต้องไม่ได้ฉบับร่าง —
     * เงื่อนไข published ด้านบนยังอยู่ ตัวกรองนี้จึงแค่ทำให้แคบลงเท่านั้น
     */
    if (params.status && this.isEditor(scope)) {
      parts.push(eq(kbArticle.status, params.status) as SQL);
    }

    const where = and(...parts) as SQL;
    const offset = (params.page - 1) * params.page_size;

    const [rows, totalRow] = await Promise.all([
      this.db
        .select({
          id: kbArticle.id,
          title: kbArticle.title,
          summary: kbArticle.summary,
          category_id: kbArticle.kbCategoryId,
          category_name: kbCategory.nameTh,
          company_id: kbArticle.companyId,
          visibility: kbArticle.visibility,
          status: kbArticle.status,
          tags: kbArticle.tags,
          author_id: kbArticle.authorId,
          author_name: appUser.fullName,
          view_count: kbArticle.viewCount,
          helpful_count: kbArticle.helpfulCount,
          not_helpful_count: kbArticle.notHelpfulCount,
          published_at: kbArticle.publishedAt,
          updated_at: kbArticle.updatedAt,
        })
        .from(kbArticle)
        .innerJoin(kbCategory, eq(kbCategory.id, kbArticle.kbCategoryId))
        .leftJoin(appUser, eq(appUser.id, kbArticle.authorId))
        .where(where)
        // บทความที่คนอ่านมากอยู่บนสุด — ส่วนใหญ่คนที่เข้าคลังความรู้
        // มาด้วยปัญหาที่พบบ่อย ไม่ใช่ปัญหาที่เพิ่งเขียนถึงล่าสุด
        .orderBy(desc(kbArticle.viewCount), desc(kbArticle.updatedAt))
        .limit(params.page_size)
        .offset(offset),
      this.db.select({ n: count() }).from(kbArticle).where(where),
    ]);

    return paged(
      rows.map(({ category_id, category_name, author_id, author_name, ...r }) => ({
        ...r,
        category: { id: category_id, name_th: category_name },
        author: { id: author_id, full_name: author_name ?? '' },
        tags: splitTags(r.tags),
        published_at: r.published_at?.toISOString() ?? null,
        updated_at: r.updated_at.toISOString(),
      })),
      params.page,
      params.page_size,
      totalRow[0]?.n ?? 0,
    );
  }

  async detail(scope: AccessScope, id: number) {
    const [row] = await this.db
      .select({
        id: kbArticle.id,
        title: kbArticle.title,
        summary: kbArticle.summary,
        body_markdown: kbArticle.bodyMarkdown,
        category_id: kbArticle.kbCategoryId,
        category_name: kbCategory.nameTh,
        company_id: kbArticle.companyId,
        visibility: kbArticle.visibility,
        status: kbArticle.status,
        tags: kbArticle.tags,
        author_id: kbArticle.authorId,
        author_name: appUser.fullName,
        view_count: kbArticle.viewCount,
        helpful_count: kbArticle.helpfulCount,
        not_helpful_count: kbArticle.notHelpfulCount,
        source_ticket_id: kbArticle.sourceTicketId,
        published_at: kbArticle.publishedAt,
        created_at: kbArticle.createdAt,
        updated_at: kbArticle.updatedAt,
      })
      .from(kbArticle)
      .innerJoin(kbCategory, eq(kbCategory.id, kbArticle.kbCategoryId))
      .leftJoin(appUser, eq(appUser.id, kbArticle.authorId))
      .where(and(this.visibilityWhere(scope), eq(kbArticle.id, id)))
      .limit(1);

    if (!row) {
      // 404 ไม่ใช่ 403 — กฎเดียวกับ ticket และ user
      throw new NotFoundError('KB_ARTICLE_NOT_FOUND', 'ບໍ່ພົບບົດຄວາມທີ່ລະບຸ', { id });
    }

    const { category_id, category_name, author_id, author_name, ...rest } = row;
    return {
      ...rest,
      category: { id: category_id, name_th: category_name },
      author: { id: author_id, full_name: author_name ?? '' },
      tags: splitTags(row.tags),
      published_at: row.published_at?.toISOString() ?? null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  /** หมวดหมู่แบนราบพร้อม parent_id ให้หน้าจอประกอบเป็นต้นไม้เอง */
  async categories() {
    return this.db
      .select({
        id: kbCategory.id,
        parent_id: kbCategory.parentId,
        name_th: kbCategory.nameTh,
        sort_order: kbCategory.sortOrder,
        is_active: kbCategory.isActive,
      })
      .from(kbCategory)
      .where(eq(kbCategory.isActive, true))
      .orderBy(asc(kbCategory.sortOrder), asc(kbCategory.nameTh));
  }
}
