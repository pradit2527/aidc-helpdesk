import { Injectable, Logger } from '@nestjs/common';

import { ServiceCatalogRepository } from '../../db/repositories/service-catalog.repository';
import { NOTIFICATION_EVENT, NotificationProducer } from './notification-producer.service';

/**
 * ผู้ที่ต้องรู้เรื่องเหตุร้ายแรงทันที
 *
 *   head_of_it        หัวหน้าไอที — ตำแหน่งใน escalation_contact
 *   incident_manager  ผู้จัดการเหตุการณ์ — ตำแหน่งที่ SOP-10 กำหนดให้ตั้งไว้
 *
 * สองค่านี้เป็น CONTACT_KEY ไม่ใช่ ROLE_CODE — เป็น "ตำแหน่งในองค์กร"
 * ที่ทะเบียน escalation_contact ชี้ตัวคนไว้ ต่างจากบทบาทของระบบ (05-… §5.1)
 */
const MAJOR_INCIDENT_CONTACT_KEYS = ['head_of_it', 'incident_manager'] as const;

/**
 * สิทธิ์ที่ใช้หา company_admin ของบริษัทนั้น
 *
 * ใช้ permission code ไม่ใช่ชื่อบทบาท เพราะหน้าจัดการสิทธิ์แก้ได้ว่าบทบาทไหน
 * ถืออะไร — ผูกกับชื่อบทบาทแล้ววันหนึ่งจะส่งไปหาคนที่ไม่มีอำนาจทำอะไรได้
 */
const COMPANY_ADMIN_PERMISSION = 'user.assign_role';

export interface MajorIncidentAlert {
  ticketId: number;
  ticketNo: string;
  companyId: number;
  subject: string;
  priority: string;
}

/**
 * แจ้งเตือนเหตุร้ายแรงและการยกระดับ SLA
 *
 * ── ทำไมถึงเป็นแค่การแจ้งในแอป ──
 *
 * ES-01 ระบุว่าเหตุ P1 ต้องแจ้ง "ทันที นอกเวลาทำการก็ส่ง" ซึ่งโดยเจตนาหมายถึง
 * ช่องทางที่ปลุกคนได้จริง (อีเมล / LINE / Teams) แต่โปรเจกต์ยังไม่มี transport
 * ใด ๆ เลย — ไม่มีไลบรารีส่งอีเมลใน package.json และ notification_channel
 * ของผู้ใช้ยังไม่มีใครกรอก
 *
 * สิ่งที่ทำได้ตอนนี้และมีค่าจริงคือ **เขียนแถวลงตาราง notification** ซึ่ง
 *   1. กระดิ่งในแอปเห็นทันที (GET /notifications อ่านได้เลย)
 *   2. เป็นหลักฐานว่า "ระบบแจ้งใครไปแล้วบ้าง เมื่อไร" ซึ่ง SOP-10 ถามหา
 *   3. เป็นคิวตั้งต้นให้ตัวส่งออกช่องทางภายนอกในเฟสถัดไปมาอ่านต่อ
 *      (แถวมี status = 'pending' อยู่แล้ว รอคนมาเปลี่ยนเป็น 'sent')
 *
 * ⚠️ ยังไม่ครบตาม ES-01 — ช่องทางที่ปลุกคนตอนตี 3 ได้ยังไม่มี
 *    ต้องบอก SA ตรง ๆ ไม่ใช่ทำครึ่งเดียวแล้วติ๊กว่าเสร็จ
 */
@Injectable()
export class IncidentAlertService {
  private readonly logger = new Logger('IncidentAlert');

  constructor(
    private readonly notifications: NotificationProducer,
    private readonly catalog: ServiceCatalogRepository,
  ) {}

  /**
   * เหตุร้ายแรง (P1) เกิดขึ้น — แจ้งหัวหน้าไอทีและผู้ดูแลบริษัททันที
   *
   * เรียกได้ทั้งตอนสร้างเรื่องที่คำนวณออกมาเป็น P1 และตอนยกระดับเป็น P1 ภายหลัง
   * ดัชนีกันซ้ำในตาราง notification ทำให้เรื่องเดียวกันแจ้งครั้งเดียวต่อคนต่อวัน
   * ต่อให้ถูกเรียกซ้ำจากทั้งสองทาง
   */
  async majorIncidentDeclared(alert: MajorIncidentAlert): Promise<void> {
    try {
      const [contacts, admins] = await Promise.all([
        this.catalog.contactsFor(alert.companyId, MAJOR_INCIDENT_CONTACT_KEYS),
        this.notifications.usersWithPermission(alert.companyId, COMPANY_ADMIN_PERMISSION),
      ]);

      const recipients = [...new Set([...contacts, ...admins])];
      if (recipients.length === 0) {
        /*
         * ไม่มีใครให้แจ้ง = ข้อมูลตั้งค่าไม่ครบ ไม่ใช่เรื่องปกติ
         *
         * เขียนเป็น warn เพราะมันคือกรณีที่ "ระบบทำงานถูกต้องทุกอย่าง
         * แต่ไม่มีใครรู้ว่ามีเหตุร้ายแรงเกิดขึ้น" ซึ่งเป็นความล้มเหลวแบบเงียบ
         * ที่อันตรายที่สุดในระบบแจ้งเตือน
         */
        this.logger.warn(
          `เหตุร้ายแรง ${alert.ticketNo} ไม่มีผู้รับแจ้ง — ` +
            `บริษัท ${alert.companyId} ยังไม่ได้ตั้ง escalation_contact (head_of_it / incident_manager) ` +
            'และไม่มีผู้ดูแลบริษัทที่ขอบเขตครอบคลุมบริษัทนี้',
        );
        return;
      }

      const written = await this.notifications.notify({
        userIds: recipients,
        ticketId: alert.ticketId,
        eventType: NOTIFICATION_EVENT.majorIncident,
        title: `[${alert.priority}] ເຫດຮ້າຍແຮງ ${alert.ticketNo}`,
        body: alert.subject,
      });

      this.logger.log(
        `แจ้งเหตุร้ายแรง ${alert.ticketNo} ให้ผู้รับ ${written}/${recipients.length} คน`,
      );
    } catch (error) {
      // การแจ้งเตือนที่ล้มต้องไม่ทำให้การแจ้งเรื่องที่สำเร็จแล้วดูเหมือนล้ม
      this.logger.error(
        `แจ้งเหตุร้ายแรง ${alert.ticketNo} ไม่สำเร็จ: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * ยกระดับเมื่อเวลาที่ใช้ไปถึงเกณฑ์ — 80% (ใกล้เกิน) และ 100% (เกินแล้ว)
   *
   * ผู้รับชุดเดียวกับเหตุร้ายแรง บวกผู้รับผิดชอบปัจจุบัน ซึ่งเป็นคนที่ทำอะไรได้จริง
   * ที่สุด ณ จุดนั้น — การยกระดับที่ไปถึงแต่หัวหน้าโดยที่คนทำงานไม่รู้ตัว
   * ทำให้เกิดการทวงถามที่ไม่มีใครตอบได้
   */
  async slaThresholdReached(input: {
    ticketId: number;
    ticketNo: string;
    companyId: number;
    subject: string;
    assigneeId: number | null;
    /** 'at_risk' = ใช้ไปแล้ว ≥80% · 'breached' = เลยกำหนดแล้ว */
    level: 'at_risk' | 'breached';
    usedPercent: number;
  }): Promise<number> {
    const [contacts, admins] = await Promise.all([
      this.catalog.contactsFor(input.companyId, MAJOR_INCIDENT_CONTACT_KEYS),
      this.notifications.usersWithPermission(input.companyId, COMPANY_ADMIN_PERMISSION),
    ]);

    const recipients = [
      ...new Set([...contacts, ...admins, ...(input.assigneeId ? [input.assigneeId] : [])]),
    ];
    if (recipients.length === 0) return 0;

    const breached = input.level === 'breached';
    return this.notifications.notify({
      userIds: recipients,
      ticketId: input.ticketId,
      eventType: breached ? NOTIFICATION_EVENT.slaBreached : NOTIFICATION_EVENT.slaAtRisk,
      title: breached
        ? `ເກີນກຳນົດແກ້ໄຂແລ້ວ ${input.ticketNo}`
        : `ໃກ້ເກີນກຳນົດ (${input.usedPercent}%) ${input.ticketNo}`,
      body: input.subject,
    });
  }

  /** ผู้อนุมัติมีคำขอใหม่รอพิจารณา — ใบที่ยังหาคนไม่ได้ถูกข้ามไปเอง (userIds ว่าง) */
  async approvalPending(input: {
    ticketId: number;
    ticketNo: string;
    subject: string;
    approverId: number | null;
  }): Promise<void> {
    if (input.approverId === null) return;
    await this.notifications.notify({
      userIds: [input.approverId],
      ticketId: input.ticketId,
      eventType: NOTIFICATION_EVENT.approvalPending,
      title: `ລໍຖ້າການອະນຸມັດຂອງທ່ານ ${input.ticketNo}`,
      body: input.subject,
    });
  }
}
