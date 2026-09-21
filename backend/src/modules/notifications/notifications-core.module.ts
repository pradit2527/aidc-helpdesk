import { Global, Module } from '@nestjs/common';

import { IncidentAlertService } from './incident-alert.service';
import { NotificationProducer } from './notification-producer.service';

/**
 * ฝั่ง "เขียน" ของการแจ้งเตือน — ประกาศเป็น @Global ด้วยเหตุผลเดียวกับ DbModule
 *
 * ผู้เรียกอยู่คนละโมดูลกันโดยธรรมชาติ
 *   TicketsService (AppModule)      เหตุร้ายแรง P1 ตอนแจ้งเรื่องและตอนยกระดับ
 *   SlaScanProcessor (JobsModule)   การยกระดับเมื่อใช้เวลาไป 80% และ 100%
 *
 * ถ้าประกาศซ้ำในทั้งสองโมดูลจะได้คนละอินสแตนซ์ ซึ่งวันนี้ยังไม่พังอะไร
 * (ทั้งสองคลาสไม่มีสถานะ) แต่เป็นกับดักที่รอวันที่มีใครเพิ่มตัวจำกัดอัตรา
 * หรือตัวรวมข้อความลงไป แล้วมันจะทำงานแยกกันเงียบ ๆ
 *
 * ⚠️ ไม่รวม NotificationsService (ฝั่งอ่าน) ไว้ที่นี่
 *    ตัวนั้นถูกเรียกจาก controller เดียวและไม่มีใครอื่นต้องใช้ การดึงเข้ามา
 *    เป็น global จะเป็นการเปิดให้โค้ดส่วนอื่นอ่านกล่องข้อความของผู้ใช้ได้
 *    โดยไม่ต้องผ่าน controller ที่ตรวจสิทธิ์ไว้
 */
@Global()
@Module({
  providers: [NotificationProducer, IncidentAlertService],
  exports: [NotificationProducer, IncidentAlertService],
})
export class NotificationsCoreModule {}
