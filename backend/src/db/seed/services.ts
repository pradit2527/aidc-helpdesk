import type { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from '../schema';
import { SERVICES } from './data/services';

type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * เพิ่มบริการที่ยังไม่มีในทะเบียน — ใช้ทั้งใน seed ทั้งชุดและ services-cli
 *
 * ชนกันที่ (company_id, code) แล้วข้าม ไม่อัปเดตทับ เพราะระดับบริการ เจ้าของระบบ
 * และสถานะ 24×7 เป็นค่าที่ผู้ดูแลตัดสินเองหลังจากนั้น การรัน seed ซ้ำต้องไม่ย้อนค่าเหล่านั้น
 *
 * @returns code ของบริการที่เพิ่มใหม่
 */
export async function seedServices(db: Db): Promise<string[]> {
  if (SERVICES.length === 0) return [];

  const added = await db
    .insert(schema.service)
    .values(
      SERVICES.map((s) => ({
        companyId: null,
        code: s.code,
        nameTh: s.nameTh,
        serviceGroup: s.serviceGroup,
        serviceTier: s.serviceTier,
        is24x7: s.is24x7 ?? false,
        isActive: true,
      })),
    )
    .onConflictDoNothing({ target: [schema.service.companyId, schema.service.code] })
    .returning({ code: schema.service.code });
  return added.map((row) => row.code);
}
