/**
 * ใส่หมวดหมู่ที่ยังไม่มีลงฐานข้อมูลที่ใช้งานอยู่แล้ว — หมวดหลักใหม่และหมวดย่อย
 *
 *   npx tsx src/db/seed/ticket-categories-cli.ts
 *
 * แยกจาก npm run db:seed โดยตั้งใจ — seed ทั้งชุดเขียนทับบทบาท สิทธิ์ ค่า SLA
 * และหมวดหลักทุกหมวดตามไฟล์ data/ ซึ่งอาจลบสิ่งที่ผู้ดูแลแก้ผ่านหน้าจอไปแล้ว
 *
 * - หมวดหลัก: เพิ่มเฉพาะ code ที่ยังไม่มี ไม่แตะหมวดหลักเดิมเลย
 *   ผู้ดูแลอาจแก้ชื่อ ค่าตั้งต้น หรือปิดใช้ผ่านหน้าจอไปแล้ว
 * - หมวดย่อย: เพิ่มหรืออัปเดตตาม TICKET_SUBCATEGORIES
 */

import 'dotenv/config';

import { and, inArray, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';
import { TICKET_CATEGORIES } from './data/catalog';
import { seedTicketSubcategories } from './ticket-subcategories';

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('ต้องตั้ง DATABASE_URL ก่อน');

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const { ticketCategory } = schema;

  try {
    const result = await db.transaction(async (tx) => {
      const t = tx as unknown as Db;

      const added = await t
        .insert(ticketCategory)
        .values(
          TICKET_CATEGORIES.map((c) => ({
            companyId: null,
            code: c.code,
            nameTh: c.nameTh,
            defaultImpact: c.defaultImpact,
            defaultUrgency: c.defaultUrgency,
            ticketTypeScope: c.ticketTypeScope ?? 'both',
            sortOrder: c.sortOrder,
            isActive: c.isActive ?? true,
          })),
        )
        .onConflictDoNothing({ target: [ticketCategory.companyId, ticketCategory.code] })
        .returning({ code: ticketCategory.code });

      const parents = await t
        .select({ id: ticketCategory.id, code: ticketCategory.code })
        .from(ticketCategory)
        .where(
          and(
            isNull(ticketCategory.companyId),
            inArray(
              ticketCategory.code,
              TICKET_CATEGORIES.map((c) => c.code),
            ),
          ),
        );

      const subcategories = await seedTicketSubcategories(t, new Map(parents.map((p) => [p.code, p.id])));
      return { added: added.map((a) => a.code), subcategories };
    });

    console.log(
      `เพิ่มหมวดหลักใหม่ ${result.added.length} หมวด${result.added.length > 0 ? `: ${result.added.join(', ')}` : ''}`,
    );
    console.log(`ใส่/อัปเดตหมวดย่อย ${result.subcategories} แถว`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('ใส่หมวดหมู่ล้มเหลว:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
