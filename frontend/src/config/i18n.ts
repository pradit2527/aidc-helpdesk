/**
 * คำแปลลาว–ไทย
 *
 * ลาวเป็นภาษาหลักของระบบ ไทยเป็นภาษารอง สำหรับผู้บริหารและทีมส่วนกลาง
 * ที่อ่านลาวไม่คล่อง
 *
 * ⚠️ ลาวกับไทยเป็นคนละ Unicode block (ລາວ U+0E80–U+0EFF · ไทย U+0E00–U+0E7F)
 *    ฟอนต์เดียวจึงแสดงครบทั้งสองภาษาไม่ได้ — layout โหลดทั้ง Noto Sans Lao
 *    และ Noto Sans Thai แล้วเรียงเป็น fallback ต่อกัน ตัวอักษรที่ฟอนต์แรก
 *    ไม่มีจะตกไปฟอนต์ถัดไปเอง
 *
 * คีย์ตั้งตามที่ใช้จริง ไม่ได้ตั้งตามโครงหน้าจอ เพื่อให้ข้อความเดียวกัน
 * ที่โผล่หลายที่ใช้คีย์เดียวกัน และแปลครั้งเดียวจบ
 */

export const MESSAGES = {
  // ── เมนูและการนำทาง ──
  // ใช้คำว่า Ticket ทั้งสองภาษา — เป็นคำที่ทีมใช้เรียกกันจริงอยู่แล้ว
  // และคำแปลลาวกับไทยของ "เรื่อง" กว้างเกินไปจนไม่รู้ว่าหมายถึงอะไร
  'nav.myTickets': { lo: 'Ticket ຂອງຂ້ອຍ', th: 'Ticket ของฉัน' },
  'nav.queue': { lo: 'ຄິວ Ticket ຂອງຂ້ອຍ', th: 'คิว Ticket ของฉัน' },
  'nav.allTickets': { lo: 'Ticket ທັງໝົດ', th: 'Ticket ทั้งหมด' },
  'nav.approvals': { lo: 'ລໍຖ້າອະນຸມັດ', th: 'รออนุมัติ' },
  'nav.dashboard': { lo: 'ແດຊບອດ', th: 'แดชบอร์ด' },
  'nav.reports': { lo: 'ສູນລາຍງານ', th: 'ศูนย์รายงาน' },
  'nav.kb': { lo: 'ຄັງຄວາມຮູ້', th: 'คลังความรู้' },
  'nav.notifications': { lo: 'ການແຈ້ງເຕືອນ', th: 'การแจ้งเตือน' },
  'nav.adminConsole': { lo: 'ສູນຄວບຄຸມ', th: 'ศูนย์ควบคุม' },
  'nav.users': { lo: 'ຈັດການຜູ້ໃຊ້', th: 'จัดการผู้ใช้' },
  'nav.departments': { lo: 'ຈັດການພະແນກ', th: 'จัดการแผนก' },
  'nav.categories': { lo: 'ໝວດໝູ່ບັນຫາ', th: 'หมวดหมู่ปัญหา' },
  'nav.roles': { lo: 'ບົດບາດ ແລະ ສິດ', th: 'บทบาทและสิทธิ์' },
  'nav.catalog': { lo: 'ແຄັດຕາລັອກບໍລິການ', th: 'แค็ตตาล็อกบริการ' },
  'nav.checklists': { lo: 'ແມ່ແບບລາຍການກວດ', th: 'แม่แบบรายการตรวจ' },
  'nav.services': { lo: 'ທະບຽນລະບົບງານ', th: 'ทะเบียนระบบงาน' },
  'nav.problems': { lo: 'Problem ແລະ RCA', th: 'Problem และ RCA' },
  'nav.auditLogs': { lo: 'ບັນທຶກການໃຊ້ງານ', th: 'บันทึกการใช้งาน' },
  'nav.sla': { lo: 'ຕັ້ງຄ່າ SLA', th: 'ตั้งค่า SLA' },
  'nav.businessHours': { lo: 'ເວລາເຮັດວຽກ ແລະ ວັນພັກ', th: 'เวลาทำการและวันหยุด' },
  'nav.escalation': { lo: 'ກົດຍົກລະດັບ', th: 'กฎยกระดับ' },
  'nav.companies': { lo: 'ຈັດການບໍລິສັດ', th: 'จัดการบริษัท' },
  'nav.software': { lo: 'ຊອບແວທີ່ອະນຸມັດ', th: 'ซอฟต์แวร์ที่อนุมัติ' },
  'nav.system': { lo: 'ຂໍ້ມູນລະບົບ', th: 'ข้อมูลระบบ' },
  'nav.profile': { lo: 'ໂປຣໄຟລ໌ຂອງຂ້ອຍ', th: 'โปรไฟล์ของฉัน' },

  // ── กลุ่มเมนู ──
  'navGroup.overview': { lo: 'ພາບລວມ', th: 'ภาพรวม' },
  'navGroup.knowledge': { lo: 'ຄວາມຮູ້', th: 'ความรู้' },
  'navGroup.admin': { lo: 'ຜູ້ດູແລ', th: 'ผู้ดูแล' },

  // ── ย่อสำหรับเมนูล่างบนมือถือ ──
  'navShort.myTickets': { lo: 'ຂອງຂ້ອຍ', th: 'ของฉัน' },
  'navShort.queue': { lo: 'ຄິວວຽກ', th: 'คิวงาน' },
  'navShort.allTickets': { lo: 'ທັງໝົດ', th: 'ทั้งหมด' },
  'navShort.approvals': { lo: 'ອະນຸມັດ', th: 'อนุมัติ' },
  'navShort.dashboard': { lo: 'ແດຊບອດ', th: 'แดชบอร์ด' },
  'navShort.reports': { lo: 'ລາຍງານ', th: 'รายงาน' },
  'navShort.kb': { lo: 'ຄວາມຮູ້', th: 'ความรู้' },
  'navShort.notifications': { lo: 'ແຈ້ງເຕືອນ', th: 'แจ้งเตือน' },
  'navShort.users': { lo: 'ຜູ້ໃຊ້', th: 'ผู้ใช้' },
  'navShort.profile': { lo: 'ຂ້ອຍ', th: 'ฉัน' },

  // ── บทบาท ──
  'role.end_user': { lo: 'ຜູ້ແຈ້ງ', th: 'ผู้แจ้ง' },
  'role.agent': { lo: 'ເຈົ້າໜ້າທີ່ support', th: 'เจ้าหน้าที่ support' },
  'role.company_admin': { lo: 'ຜູ້ດູແລລະດັບບໍລິສັດ', th: 'ผู้ดูแลระดับบริษัท' },
  'role.manager_viewer': { lo: 'ຜູ້ບໍລິຫານ (ອ່ານຢ່າງດຽວ)', th: 'ผู้บริหาร (อ่านอย่างเดียว)' },
  'role.super_admin': { lo: 'ຜູ້ດູແລລະບົບ', th: 'ผู้ดูแลระบบ' },

  // ── สถานะเรื่อง ──
  'status.new': { lo: 'ໃໝ່', th: 'ใหม่' },
  'status.assigned': { lo: 'ມອບໝາຍແລ້ວ', th: 'มอบหมายแล้ว' },
  'status.in_progress': { lo: 'ກຳລັງດຳເນີນການ', th: 'กำลังดำเนินการ' },
  'status.pending_user': { lo: 'ລໍຖ້າຜູ້ແຈ້ງ', th: 'รอผู้แจ้ง' },
  'status.resolved': { lo: 'ແກ້ໄຂແລ້ວ', th: 'แก้ไขแล้ว' },
  'status.closed': { lo: 'ປິດແລ້ວ', th: 'ปิดแล้ว' },
  'status.cancelled': { lo: 'ຍົກເລີກ', th: 'ยกเลิก' },

  'pending.user': { lo: 'ລໍຖ້າຂໍ້ມູນຈາກຜູ້ແຈ້ງ', th: 'รอข้อมูลจากผู้แจ้ง' },
  'pending.vendor': { lo: 'ລໍຖ້າອາໄຫຼ່ / ຜູ້ໃຫ້ບໍລິການພາຍນອກ', th: 'รออะไหล่ / ผู้ให้บริการภายนอก' },
  'pending.approval': { lo: 'ລໍຖ້າອະນຸມັດ', th: 'รอการอนุมัติ' },

  // ── ระดับความสำคัญ ──
  'priority.P1': { lo: 'P1 – ວິກິດ', th: 'P1 – วิกฤต' },
  'priority.P2': { lo: 'P2 – ສູງ', th: 'P2 – สูง' },
  'priority.P3': { lo: 'P3 – ປານກາງ', th: 'P3 – ปานกลาง' },
  'priority.P4': { lo: 'P4 – ຕ່ຳ', th: 'P4 – ต่ำ' },

  'priorityCriteria.P1': {
    lo: 'ລະບົບສຳຄັນຢຸດໃຫ້ບໍລິການທັງອົງກອນ ບໍ່ມີທາງລ່ຽງ',
    th: 'ระบบสำคัญหยุดให้บริการทั้งองค์กร ไม่มีทางเลี่ยง',
  },
  'priorityCriteria.P2': {
    lo: 'ໃຊ້ບໍ່ໄດ້ທັງພະແນກ ຫຼື ລະບົບສຳຄັນທີ່ຍັງມີທາງລ່ຽງຊົ່ວຄາວ',
    th: 'ใช้ไม่ได้ทั้งแผนก หรือระบบสำคัญที่ยังมีทางเลี่ยงชั่วคราว',
  },
  'priorityCriteria.P3': {
    lo: 'ກະທົບຜູ້ໃຊ້ລາຍບຸກຄົນ ເຮັດວຽກບໍ່ໄດ້ ຫຼື ບໍ່ສະດວກ',
    th: 'กระทบผู้ใช้รายบุคคล ทำงานไม่ได้หรือไม่สะดวก',
  },
  'priorityCriteria.P4': {
    lo: 'ຄຳຂໍບໍລິການທົ່ວໄປ ຫຼື ຄຳປຶກສາທີ່ບໍ່ກະທົບວຽກຮີບດ່ວນ',
    th: 'คำขอบริการทั่วไปหรือคำปรึกษาที่ไม่กระทบงานเร่งด่วน',
  },

  // ── สถานะ SLA ──
  'sla.on_track': { lo: 'ຕົງເວລາ', th: 'ตรงเวลา' },
  'sla.at_risk': { lo: 'ໃກ້ຄົບກຳນົດ', th: 'ใกล้ครบกำหนด' },
  'sla.breached': { lo: 'ເກີນກຳນົດ', th: 'เกินกำหนด' },
  'sla.paused': { lo: 'ຢຸດນັບຊົ່ວຄາວ', th: 'หยุดนับชั่วคราว' },
  'sla.dueAt': { lo: 'ຄົບກຳນົດ', th: 'ครบกำหนด' },
  'sla.remaining': { lo: 'ເຫຼືອ', th: 'เหลือ' },
  'sla.over': { lo: 'ເກີນມາ', th: 'เกินมา' },
  'sla.pausedNow': { lo: 'ຢຸດນັບຢູ່', th: 'หยุดนับอยู่' },

  // ── ประเภทและช่องทาง ──
  'type.incident': { lo: 'ເຫດຂັດຂ້ອງ', th: 'เหตุขัดข้อง' },
  'type.service_request': { lo: 'ຄຳຂໍບໍລິການ', th: 'คำขอบริการ' },
  'channel.portal': { lo: 'ລະບົບອອນລາຍ', th: 'ระบบออนไลน์' },
  'channel.email': { lo: 'ອີເມວ', th: 'อีเมล' },
  'channel.phone': { lo: 'ໂທລະສັບ', th: 'โทรศัพท์' },
  'channel.walk_in': { lo: 'ຕິດຕໍ່ດ້ວຍຕົນເອງ', th: 'ติดต่อด้วยตนเอง' },

  // ── ผลกระทบและความเร่งด่วน ──
  'impact.individual': { lo: 'ສະເພາະຂ້ອຍຄົນດຽວ', th: 'เฉพาะฉันคนเดียว' },
  'impact.department': { lo: 'ທັງພະແນກ ຫຼື ຫຼາຍຄົນ', th: 'ทั้งแผนกหรือหลายคน' },
  'impact.org_wide': {
    lo: 'ທັງບໍລິສັດ ຫຼື ລະບົບສຳຄັນຢຸດເຮັດວຽກ',
    th: 'ทั้งบริษัทหรือระบบสำคัญหยุดทำงาน',
  },
  'urgency.high': { lo: 'ຮີບດ່ວນຫຼາຍ', th: 'เร่งด่วนมาก' },
  'urgency.medium': { lo: 'ຮີບດ່ວນປານກາງ', th: 'เร่งด่วนปานกลาง' },
  'urgency.low': { lo: 'ບໍ່ຮີບດ່ວນ', th: 'ไม่เร่งด่วน' },

  // ── ปุ่มและคำที่ใช้ซ้ำทั่วระบบ ──
  'action.newTicket': { lo: 'ແຈ້ງບັນຫາ', th: 'แจ้งปัญหา' },
  'action.search': { lo: 'ຄົ້ນຫາ', th: 'ค้นหา' },
  'action.save': { lo: 'ບັນທຶກ', th: 'บันทึก' },
  'action.cancel': { lo: 'ຍົກເລີກ', th: 'ยกเลิก' },
  'action.export': { lo: 'ສົ່ງອອກ', th: 'ส่งออก' },
  'action.logout': { lo: 'ອອກຈາກລະບົບ', th: 'ออกจากระบบ' },
  'action.mainMenu': { lo: 'ເມນູຫຼັກ', th: 'เมนูหลัก' },
  'action.openMenu': { lo: 'ເປີດເມນູ', th: 'เปิดเมนู' },
  'action.closeMenu': { lo: 'ປິດເມນູ', th: 'ปิดเมนู' },

  'common.brandSubtitle': { lo: 'ສູນບໍລິການກຸ່ມບໍລິສັດ', th: 'ศูนย์บริการกลุ่มบริษัท' },
  'common.companies': { lo: 'ບໍລິສັດ', th: 'บริษัท' },
  'common.businessHours': {
    lo: 'ເວລາເຮັດວຽກ ຈັນ–ສຸກ 08:30–17:30 ນ.',
    th: 'เวลาทำการ จ.–ศ. 08:30–17:30 น.',
  },
  'common.unreadNotifications': {
    lo: 'ລາຍການທີ່ຍັງບໍ່ໄດ້ອ່ານ',
    th: 'รายการที่ยังไม่ได้อ่าน',
  },

  // ── หัวข้อหน้าและคำอธิบาย ──
  'page.myTickets.desc': {
    lo: 'ຕິດຕາມສະຖານະ Ticket ທີ່ທ່ານແຈ້ງເຂົ້າມາ',
    th: 'ติดตามสถานะ Ticket ที่คุณแจ้งเข้ามา',
  },
  'page.newTicket': { lo: 'ແຈ້ງ Ticket ໃໝ່', th: 'แจ้ง Ticket ใหม่' },
  'page.newTicket.desc': {
    lo: 'ບອກສິ່ງທີ່ເກີດຂຶ້ນ ທີມງານຈະຮັບເລື່ອງພາຍໃນເວລາທີ່ກຳນົດ',
    th: 'บอกสิ่งที่เกิดขึ้น ทีมงานจะรับเรื่องภายในเวลาที่กำหนด',
  },
  'page.ticketDetail': { lo: 'ລາຍລະອຽດ Ticket', th: 'รายละเอียด Ticket' },
  'page.kbArticle': { lo: 'ບົດຄວາມ', th: 'บทความ' },
  'page.kbEdit': { lo: 'ແກ້ໄຂບົດຄວາມ', th: 'แก้ไขบทความ' },
  'page.userDetail': { lo: 'ລາຍລະອຽດຜູ້ໃຊ້', th: 'รายละเอียดผู้ใช้' },
  'page.slaReport': { lo: 'ລາຍງານ SLA ລາຍເດືອນ', th: 'รายงาน SLA รายเดือน' },
  'page.changePassword': { lo: 'ປ່ຽນລະຫັດຜ່ານ', th: 'เปลี่ยนรหัสผ่าน' },
  'page.importUsers': { lo: 'ນຳເຂົ້າຜູ້ໃຊ້ຈາກໄຟລ໌', th: 'นำเข้าผู้ใช้จากไฟล์' },
  'page.newArticle': { lo: 'ຂຽນບົດຄວາມໃໝ່', th: 'เขียนบทความใหม่' },
  'page.adminConsole': { lo: 'ສູນຄວບຄຸມຜູ້ດູແລລະບົບ', th: 'ศูนย์ควบคุมผู้ดูแลระบบ' },
  'page.profile': { lo: 'ໂປຣໄຟລ໌ ແລະ ການຕັ້ງຄ່າ', th: 'โปรไฟล์และการตั้งค่า' },
  'page.fallback': { lo: 'AIDC Service Desk', th: 'AIDC Service Desk' },

  'scope.label': { lo: 'ຂອບເຂດ', th: 'ขอบเขต' },
  'scope.allCompanies': { lo: 'ທຸກບໍລິສັດ', th: 'ทุกบริษัท' },

  // ── ตัวสลับธีมและภาษา ──
  'pref.appearance': { lo: 'ຮູບແບບການສະແດງຜົນ', th: 'รูปแบบการแสดงผล' },
  'pref.themeLight': { lo: 'ໂໝດແຈ້ງ', th: 'โหมดสว่าง' },
  'pref.themeDark': { lo: 'ໂໝດມືດ', th: 'โหมดมืด' },
  'pref.language': { lo: 'ພາສາ', th: 'ภาษา' },
  'pref.langLao': { lo: 'ລາວ', th: 'ลาว' },
  'pref.langThai': { lo: 'ໄທ', th: 'ไทย' },
} as const;

export type MessageKey = keyof typeof MESSAGES;
export type Locale = 'lo' | 'th';

/**
 * แปลข้อความหนึ่งคีย์
 *
 * ถ้าไม่พบคีย์จะคืนตัวคีย์เอง ไม่ใช่สตริงว่าง — ข้อความว่างทำให้ปุ่มหายไป
 * โดยไม่มีใครรู้ ส่วนคีย์ที่โผล่มาบนหน้าจอเห็นแล้วรู้ทันทีว่าลืมแปล
 */
export function translate(key: MessageKey, locale: Locale): string {
  return MESSAGES[key]?.[locale] ?? key;
}
