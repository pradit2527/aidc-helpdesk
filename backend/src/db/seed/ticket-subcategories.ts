import { sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from '../schema';
import { TICKET_SUBCATEGORIES } from './data/catalog';

type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * ใส่หมวดย่อยใต้หมวดหลัก — ใช้ทั้งใน seed ทั้งชุดและสคริปต์ที่ใส่เฉพาะหมวดย่อย
 *
 * รันซ้ำได้ ชนกันที่ (company_id, code) แล้วอัปเดตทับ รวมถึง parent_id
 * เพื่อให้การย้ายหมวดย่อยในไฟล์ data/ มีผลกับฐานข้อมูลที่มีอยู่แล้วด้วย
 *
 * @param parentIdByCode code ของหมวดหลัก → id ในฐานข้อมูล
 * @returns จำนวนแถวที่แตะ
 */
export async function seedTicketSubcategories(
  db: Db,
  parentIdByCode: ReadonlyMap<string, number>,
): Promise<number> {
  const rows = TICKET_SUBCATEGORIES.map((c) => {
    const parentId = parentIdByCode.get(c.parentCode);
    // ตรวจก่อนเขียน — ถ้าปล่อยผ่าน หมวดย่อยจะกลายเป็นหมวดหลักลอย ๆ โดยไม่มีอะไรฟ้อง
    if (parentId === undefined) {
      throw new Error(`หมวดย่อย ${c.code} อ้างหมวดหลักที่ไม่มี: ${c.parentCode}`);
    }
    return {
      companyId: null,
      parentId,
      code: c.code,
      nameTh: c.nameTh,
      defaultImpact: c.defaultImpact,
      defaultUrgency: c.defaultUrgency,
      sortOrder: c.sortOrder,
      isActive: c.isActive ?? true,
    };
  });
  if (rows.length === 0) return 0;

  const written = await db
    .insert(schema.ticketCategory)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.ticketCategory.companyId, schema.ticketCategory.code],
      set: {
        parentId: sql`excluded.parent_id`,
        nameTh: sql`excluded.name_th`,
        defaultImpact: sql`excluded.default_impact`,
        defaultUrgency: sql`excluded.default_urgency`,
        sortOrder: sql`excluded.sort_order`,
        isActive: sql`excluded.is_active`,
      },
    })
    .returning({ id: schema.ticketCategory.id });
  return written.length;
}
