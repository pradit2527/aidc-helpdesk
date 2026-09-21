import { Global, Module } from '@nestjs/common';

import { db } from './client';
import { DB } from './db.token';
import { ServiceCatalogRepository } from './repositories/service-catalog.repository';
import { SlaConfigRepository } from './repositories/sla-config.repository';
import { SupportChatRepository } from './repositories/support-chat.repository';
import { SupportProjectRepository } from './repositories/support-project.repository';
import { SupportTeamRepository } from './repositories/support-team.repository';
import { TicketDetailRepository } from './repositories/ticket-detail.repository';
import { TicketWriteRepository } from './repositories/ticket-write.repository';
import { TicketRepository } from './repositories/ticket.repository';

/**
 * โทเคนย้ายไปอยู่ db.token.ts แล้ว — export ซ้ำไว้ที่นี่เพื่อไม่ต้องแก้
 * ทุกจุดที่เคย `import { DB } from '../db.module'` (โค้ดนอกชั้น repository
 * เช่น service ต่าง ๆ ไม่ได้อยู่ในวงจรนี้ จึง import จากที่นี่ต่อไปได้ปกติ)
 *
 * ⚠️ ไฟล์ repository ทั้ง 8 ตัวด้านล่างต้อง import DB จาก './db.token'
 *    โดยตรงเท่านั้น ห้ามกลับไป import จากไฟล์นี้ — ดูเหตุผลเต็มใน db.token.ts
 */
export { DB };

/**
 * @Global เพราะทุกโมดูลที่แตะข้อมูลต้องใช้ตัวเดียวกันหมด
 * ถ้าไม่ประกาศเป็น global แต่ละโมดูลต้อง import ซ้ำ ซึ่งไม่ได้เพิ่มความปลอดภัยอะไร
 * มีแต่จะลืมแล้วเจอ error ตอน runtime
 */
/**
 * ทุก repository อยู่ที่นี่ ไม่ใช่กระจายใน AppModule
 *
 * เหตุผลที่ย้ายมา: JobsModule (งานกวาด SLA) ต้องใช้ SlaConfigRepository และ
 * TicketRepository ด้วย แต่มันเป็นโมดูลแยกที่ AppModule เป็นคน import
 * จะไปหยิบ provider ของ AppModule ไม่ได้ ทางออกเดิมคือประกาศซ้ำในทั้งสองที่
 * ซึ่งทำให้ได้ **คนละอินสแตนซ์**
 *
 * ⚠️ SlaConfigRepository แคชนโยบายและปฏิทินไว้ในหน่วยความจำ และล้างแคชด้วย
 *    invalidate() ตอนผู้ดูแลแก้ค่าจากหน้าจอ ถ้ามีสองอินสแตนซ์ การล้างแคช
 *    จะมีผลกับตัวที่ API ใช้เท่านั้น ส่วนงานเบื้องหลังจะคำนวณกำหนดเวลาด้วย
 *    ค่าเก่าต่อไปเรื่อย ๆ จนกว่าจะรีสตาร์ต — เป็นบั๊กที่หาต้นตอยากมาก
 *    เพราะหน้าจอแสดงค่าใหม่ถูกต้องทุกอย่าง มีแต่ธงเกินกำหนดที่ผิด
 */
const REPOSITORIES = [
  ServiceCatalogRepository,
  SlaConfigRepository,
  SupportChatRepository,
  SupportProjectRepository,
  SupportTeamRepository,
  TicketDetailRepository,
  TicketRepository,
  TicketWriteRepository,
];

@Global()
@Module({
  providers: [{ provide: DB, useValue: db }, ...REPOSITORIES],
  exports: [DB, ...REPOSITORIES],
})
export class DbModule {}
