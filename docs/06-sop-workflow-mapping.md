# การแปลง SOP และนโยบายเป็นความต้องการของระบบ (SOP → Workflow Mapping)

| หัวข้อ | รายละเอียด |
|---|---|
| รหัสเอกสาร | SA-006 |
| เวอร์ชัน | 1.0 |
| ผู้จัดทำ | System Analyst |
| **เอกสารควบคุมที่ยึดถือ** | **AIDC-IT-SOP-001 v1.1** (บังคับใช้ 1 ส.ค. 2569) — หมวด 3 นโยบาย, หมวด 4 SOP-01…SOP-10, ภาคผนวก ก Checklist |
| เอกสารที่เกี่ยวข้อง | `05-sla-policy-alignment.md` (SLA/priority/escalation), `01-srs.md`, `02-data-model.md`, `04-rbac-sla.md` |
| หลักการ | SOP ทุกข้อบังคับว่า "ต้องดำเนินการผ่านระบบ Ticketing เพื่อให้ตรวจสอบย้อนหลังได้" (SOP 4 ย่อหน้านำ) → ทุก SOP ต้องมีที่ทางในระบบ แม้บางส่วนจะเลื่อนไปเฟส 2 |

---

## 1. ตารางแปลง SOP-01 ถึง SOP-10

| รหัส | ชื่อ | ขั้นตอนหลัก (ตามเอกสารจริง) | ระบบต้องรองรับอะไร | เฟส |
|---|---|---|---|---|
| **SOP-01** | การรับแจ้งและบริหาร Ticket | 1) รับแจ้งและบันทึกเป็น Ticket ทันที (โทร/Walk-in เจ้าหน้าที่สร้างให้) 2) จำแนก Incident/Service Request + เลือกหมวดหมู่ 3) ประเมิน P1–P4 ตาม Priority Matrix 4) แก้เบื้องต้นจาก KB 5) เกินขีดความสามารถ → Escalate Tier 2/3 พร้อมสรุปสิ่งที่ตรวจแล้ว 6) อัปเดตสถานะตามรอบ SLA 7) บันทึกสาเหตุ+วิธีแก้ → `Resolved` + อีเมลให้ยืนยัน 8) ปิดเมื่อยืนยัน หรือครบ 3 วันทำการ + ส่ง CSAT | **Workflow:** state machine เดิม + `pending_reason`. **ฟิลด์:** `ticket_type`, `impact`, `urgency`, `priority` (คำนวณจากเมทริกซ์), `channel`, `support_tier`, `resolution_note` (บังคับก่อน `resolved`), `next_status_report_due_at`. **UI:** ปุ่ม "สร้างแทนผู้อื่น" (`created_by ≠ requester_id`), แผงแนะนำบทความ KB ตอนพิมพ์หัวข้อ, กล่องสรุปสิ่งที่ตรวจแล้ว (บังคับกรอกตอนยกระดับ Tier). **อัตโนมัติ:** email→ticket ingestion, อีเมลขอยืนยันตอน `resolved`, auto-close 3 วันทำการ + ส่ง CSAT | **MVP** |
| **SOP-02** | การจัดการเหตุขัดข้องร้ายแรง (P1) | 1) ประกาศ Major Incident + แจ้ง Head of IT **ภายใน 15 นาที** 2) แต่งตั้ง Incident Commander + ตั้งทีมจาก Tier 2/3/Vendor 3) ประกาศสถานะระบบทั้งองค์กร + แจ้ง Workaround 4) กู้คืนบริการก่อน + รายงานผู้บริหาร **ทุก 1 ชม.** 5) ประกาศปิดเหตุการณ์ + ยืนยันกับหน่วยงานที่กระทบ 6) RCA **ภายใน 5 วันทำการ** 7) ติดตามมาตรการ + บันทึก Lessons Learned เข้า KB | **สถานะ/ฟิลด์:** `is_major_incident`, `incident_commander_id`, `workaround_at`, `workaround_note`, `service_id`, `problem_id`. **Workflow:** ES-01/ES-02/ES-09 (`05-…` §5.2), บังคับสร้าง `problem` พร้อม `rca_due_at = +5 วันทำการ`. **Checklist:** ไม่บังคับ แต่แนะนำ template "Major Incident" **[ต้องยืนยันกับ PM]** (เอกสารไม่ได้ให้รายการ checklist สำหรับ SOP-02). **KB:** ปุ่ม "สร้างบทความจาก ticket นี้" (มีอยู่แล้ว US-14) | **MVP** ยกเว้น **ประกาศสถานะระบบทั้งองค์กร (status page/broadcast)** = **เฟส 2** |
| **SOP-03** | การขอสิทธิ์เข้าถึงระบบ | 1) ยื่นคำขอระบุระบบ/ระดับสิทธิ์/เหตุผล/ระยะเวลา 2) **หัวหน้าหน่วยงานอนุมัติ** 3) **System Owner อนุมัติ** (Least Privilege) 4) ให้สิทธิ์ **ภายใน 1 วันทำการ** + แนบหลักฐานการอนุมัติ 5) ให้ผู้ขอทดสอบแล้วปิด 6) สิทธิ์ชั่วคราวเพิกถอนอัตโนมัติเมื่อครบกำหนด + Access Review ทุก 6 เดือน | **Approval:** `approval_request` 2 ขั้นแบบเรียงลำดับ (§3). **Catalog:** `SR-ACCESS` (540 นาทีทำการ, `clock_start_event='after_approval'`). **ฟิลด์:** `access_expires_at` บนคำขอ (สิทธิ์ชั่วคราว), บังคับแนบหลักฐาน (`attachment`) ก่อน `resolved`. **สถานะ:** `pending_user` + `pending_reason='approval'` ระหว่างรออนุมัติ | **MVP:** ขั้นอนุมัติ + เก็บ `access_expires_at` + `after_approval` clock.<br>**เฟส 2:** งานเพิกถอนอัตโนมัติเมื่อครบกำหนด และรอบ Access Review 6 เดือน (ต้องมีทะเบียนสิทธิ์จริง ไม่ใช่แค่ ticket) |
| **SOP-04** | การเตรียมระบบพนักงานใหม่ (Onboarding) | HR ยื่นล่วงหน้า **≥ 7 วันปฏิทิน (แนะนำ 14)** → 1) HR เปิด Ticket แจ้งข้อมูลพนักงานใหม่ 2) สร้างบัญชี/อีเมล/สิทธิ์ตามตำแหน่ง 3) เตรียมอุปกรณ์ + ติดตั้งซอฟต์แวร์ + ลงทะเบียน Asset 4) ทดสอบให้พร้อม **ก่อนวันเริ่มงาน 1 วัน** 5) วันเริ่มงาน: ส่งมอบ + ลงนามรับทราบ + แนะนำนโยบาย 6) ปิดพร้อมแนบเอกสารลงนาม | **Checklist บังคับ 5 ข้อ** (ภาคผนวก ก.1 — §2.2). **Catalog:** `SR-ONBOARD` (`target_mode='before_date'`, `lead_time_days=7 calendar`). **ฟิลด์:** `target_date` = วันเริ่มงาน, ระบบเตือนถ้าแจ้งล่วงหน้า < 7 วันปฏิทิน; `due` ภายใน = `target_date − 1 วัน`. **บังคับ:** แนบเอกสารลงนามรับอุปกรณ์ก่อนปิด | **MVP:** ticket type + checklist + เตือน lead time.<br>**เฟส 2:** การลงทะเบียน Asset อัตโนมัติ (Asset module อยู่นอกขอบเขต `01-srs.md` §1.3) |
| **SOP-05** | การเพิกถอนระบบเมื่อพ้นสภาพ (Offboarding) | HR แจ้งล่วงหน้า **≥ 3 วันทำการ** (หรือทันทีกรณีเลิกจ้างฉับพลัน) → 1) HR เปิด Ticket + ระบุข้อกำหนดพิเศษ 2) ระงับบัญชี/อีเมล/VPN/สิทธิ์ **ภายในสิ้นวันสุดท้าย** (ความเสี่ยงสูง = ทันที) 3) รับคืนอุปกรณ์ตามทะเบียน + ตรวจสภาพ 4) โอนย้ายข้อมูล/อีเมลให้หัวหน้า **ก่อนปิดบัญชีถาวรภายใน 30 วัน** 5) เพิกถอนสิทธิ์ SaaS/Cloud + ปรับทะเบียน License 6) ลบข้อมูลจากอุปกรณ์ BYOD + ปิดพร้อมแนบ Checklist | **Checklist บังคับ 5 ข้อ** (ภาคผนวก ก.2 — §2.2). **Catalog:** `SR-OFFBOARD` (`target_mode='by_date'`, `lead_time 3 business days`). **ฟิลด์:** `target_date` = วันสุดท้ายของการทำงาน; `is_immediate_suspend` **(ใหม่)** boolean → ยกระดับเป็น P1/P2 อัตโนมัติ **[ต้องยืนยันกับ PM]** ว่าระดับใด. **งานติดตาม:** สร้าง follow-up task "ปิดบัญชีถาวร" ครบ 30 วัน | **MVP:** ticket type + checklist + ธงระงับทันที.<br>**เฟส 2:** ทะเบียน SaaS/License, งานติดตาม 30 วันอัตโนมัติ |
| **SOP-06** | การขอติดตั้งซอฟต์แวร์ | 1) ยื่น Ticket ระบุซอฟต์แวร์/วัตถุประสงค์/เครื่อง 2) ตรวจว่าอยู่ใน **Approved Software List** หรือไม่ — ถ้าอยู่ → ติดตั้งภายใน **2 วันทำการ** 3) ถ้าไม่อยู่ → Tier 2 ประเมินความปลอดภัย/ลิขสิทธิ์/ค่าใช้จ่าย → **Head of IT อนุมัติ** 4) มีค่าใช้จ่าย → จัดซื้อ License ก่อนติดตั้ง 5) ติดตั้ง + บันทึก License/Asset + ให้ผู้ใช้ทดสอบ 6) ปิด + ปรับปรุงบัญชีซอฟต์แวร์อนุมัติ | **Catalog:** `SR-SW-INSTALL` (1,080 นาทีทำการ) และ `SR-SW-NONSTD` (ต้องอนุมัติ). **Approval:** `approval_request` 1 ขั้น (`approver_type='head_of_it'`) เมื่อเลือกซอฟต์แวร์นอกบัญชี. **ตารางใหม่ (เบา):** `approved_software` (`id`, `company_id`, `name`, `version`, `license_type`, `is_active`) เพื่อให้ระบบเช็คได้อัตโนมัติว่าอยู่ในบัญชีหรือไม่ | **MVP:** catalog + เงื่อนไขอนุมัติ + `approved_software` เป็น master data อ่านอย่างเดียว.<br>**เฟส 2:** ทะเบียน License/Asset, เชื่อมกระบวนการจัดซื้อ |
| **SOP-07** | การสำรองข้อมูลและการกู้คืน | 1) สำรองอัตโนมัติ: Incremental รายวัน 22:00, Full คืนวันเสาร์ 2) ตรวจผลการสำรองทุกเช้าวันทำการ + สั่งซ้ำถ้าล้มเหลว 3) ผู้ใช้ขอกู้คืน → ยื่น Ticket ระบุไฟล์/วันที่/เหตุผล + **หัวหน้าหน่วยงานอนุมัติ**กรณีข้อมูลส่วนกลาง 4) กู้คืนไปตำแหน่งชั่วคราวก่อนให้ตรวจ 5) บันทึกผล/เวลาที่ใช้ใน Ticket 6) Restore Test ไตรมาสละครั้ง + รายงาน Head of IT | **ส่วนที่เข้าระบบได้จริง:** คำขอกู้คืนเป็น Service Request. **Catalog:** `SR-RESTORE` (`requires_approval=true`, target **[ต้องยืนยันกับ PM]**). **ฟิลด์:** `restore_point_date` **(ใหม่)** บนคำขอ. **ส่วนที่ไม่ควรเข้าระบบเฟส 1:** การเฝ้าระวัง backup job และ Restore Test เป็นงานปฏิบัติการของ System Admin ไม่ใช่ helpdesk | **MVP:** `SR-RESTORE` + approval.<br>**เฟส 2 / นอกขอบเขต:** การตรวจผล backup รายวัน, Restore Test แบบมีตารางงาน |
| **SOP-08** | การจัดการการเปลี่ยนแปลง (Change Management) | 1) ยื่น RFC ระบุรายละเอียด/เหตุผล/ระบบที่กระทบ/แผนดำเนินการ/**Rollback Plan** 2) จำแนก Standard/Normal/Emergency 3) ประเมินความเสี่ยง — ความเสี่ยงสูงต้องผ่าน **CAB** 4) กำหนดช่วงใน Maintenance Window + แจ้งล่วงหน้า **≥ 3 วันทำการ** 5) ดำเนินการ + ทดสอบ — ล้มเหลวให้ Rollback ทันที 6) Post-Implementation Review | ต้องมีเอนทิตี `change_request` แยกจาก `ticket` (มีวงจรชีวิต ผู้อนุมัติ และฟิลด์คนละชุด), คณะกรรมการ CAB, การผูกกับ `maintenance_window` | **เฟส 2** — `01-srs.md` §1.3 ระบุ Change Management เป็น out of scope เฟส 1 อยู่แล้ว และเอกสาร SOP ไม่ได้บังคับว่าต้องอยู่ในระบบเดียวกัน **ข้อเสนอ MVP:** ผูก `maintenance_window` (มีในหัวข้อ 6 ของ `05-…`) เพื่อรองรับข้อ 4 ไปก่อน |
| **SOP-09** | การบำรุงรักษาเชิงป้องกัน | 1) ปฏิทินบำรุงรักษาประจำปี 2) แพตช์: **วิกฤติภายใน 14 วัน**, ทั่วไปตามรอบรายเดือน 3) ตรวจสุขภาพระบบรายเดือน 4) ทำความสะอาด/ตรวจสภาพเครื่องผู้ใช้ปีละครั้ง 5) บันทึกผลในระบบ Asset + เปิด Ticket เมื่อพบผิดปกติ 6) รายงาน + แผนเปลี่ยนทดแทนรายไตรมาส | ต้องมี "งานตามกำหนดการ" (recurring/scheduled ticket) + ทะเบียน Asset + ปฏิทินบำรุงรักษา | **เฟส 2** — ต้องพึ่ง Asset module ซึ่งอยู่นอกขอบเขตเฟส 1. **ข้อเสนอ MVP:** ข้อ 5 ส่วน "เปิด Ticket เมื่อพบความผิดปกติ" ทำได้ทันทีด้วย ticket ปกติ (agent สร้างเอง) — ไม่ต้องพัฒนาอะไรเพิ่ม |
| **SOP-10** | การรับมือเหตุการณ์ความปลอดภัยไซเบอร์ | 1) ผู้พบแจ้ง Service Desk ทันที + **ห้ามปิดเครื่อง/ลบไฟล์** (รักษาหลักฐาน) 2) ยกระดับเป็น Security Incident + แจ้ง Head of IT **ภายใน 30 นาที** 3) Containment: ตัดเครือข่าย/ระงับบัญชี/เปลี่ยนรหัสผ่าน 4) ประเมินขอบเขต — กระทบข้อมูลส่วนบุคคล → แจ้ง **DPO ทันที** เพื่อแจ้งหน่วยงานกำกับ **ภายใน 72 ชม.** 5) Eradication + Recovery จาก backup ที่สะอาด 6) รายงาน + RCA **ภายใน 5 วันทำการ** 7) ปรับปรุงนโยบาย/ระบบป้องกัน/การอบรม | **ฟิลด์:** `is_security_incident` **(ใหม่)**, `dpo_notified_at` **(ใหม่)**, `regulator_notify_due_at` **(ใหม่)** (= เวลาที่ประเมินว่ากระทบข้อมูลส่วนบุคคล + 72 ชม.), `personal_data_affected` **(ใหม่)** boolean. **Workflow:** ES-03 (แจ้ง Head of IT/CEO/DPO ภายใน 30 นาที) + นาฬิกา 72 ชม. + บังคับสร้าง `problem` พร้อม `rca_due_at`. **การมองเห็น:** ticket ที่ตั้งธงนี้ต้องจำกัดให้เห็นเฉพาะผู้เกี่ยวข้อง (ไม่ใช้ scoping ปกติ). **UI:** แสดงคำเตือน "ห้ามปิดเครื่องหรือลบไฟล์" ทันทีที่ตั้งธง | **MVP:** ธง + escalation + นาฬิกา 72 ชม. + การจำกัดการมองเห็น.<br>**เฟส 2:** Containment checklist แบบบังคับ, การเชื่อมระบบ EDR/SIEM |

---

## 2. Checklist Template ที่ต้องมีในระบบ

### 2.1 SOP ที่ต้องมี checklist

| SOP | Checklist | จำนวนข้อ | ที่มา | บังคับหรือไม่ |
|---|---|---|---|---|
| **SOP-04** Onboarding | `CHK-ONBOARD` | **5** | ภาคผนวก ก.1 | **บังคับ** — ห้ามเปลี่ยนสถานะเป็น `resolved` จนกว่าข้อที่ `is_required` ครบ |
| **SOP-05** Offboarding | `CHK-OFFBOARD` | **5** | ภาคผนวก ก.2 | **บังคับ** — SOP-05 ข้อ 6 ระบุ "ปิด Ticket พร้อมแนบ Checklist ที่ดำเนินการครบถ้วน" |
| SOP-02 Major Incident | — | — | เอกสารไม่ได้ให้ checklist | **[ต้องยืนยันกับ PM]** ว่าต้องการหรือไม่ |
| SOP-10 Security Incident | — | — | เอกสารไม่ได้ให้ checklist | **[ต้องยืนยันกับ PM]** — เสนอทำในเฟส 2 |

### 2.2 เนื้อหา checklist ตามเอกสารจริง (seed ได้ทันที)

**`CHK-ONBOARD` — Checklist การรับพนักงานใหม่ (ภาคผนวก ก.1)**

| sort_order | title_th | is_required | evidence_required |
|---|---|---|---|
| 1 | สร้างบัญชีผู้ใช้และอีเมล พร้อมกำหนดสิทธิ์ตามตำแหน่ง | true | false |
| 2 | เตรียมเครื่องคอมพิวเตอร์และติดตั้งซอฟต์แวร์มาตรฐาน | true | false |
| 3 | ลงทะเบียนทรัพย์สินและจัดทำใบส่งมอบอุปกรณ์ | true | **true** |
| 4 | เปิดใช้ MFA และทดสอบการเข้าระบบทั้งหมด | true | false |
| 5 | แนะนำนโยบายไอทีและช่องทางติดต่อ Service Desk พร้อมลงนามรับทราบ | true | **true** (SOP-04 ข้อ 6 บังคับแนบเอกสารลงนาม) |

**`CHK-OFFBOARD` — Checklist การพ้นสภาพพนักงาน (ภาคผนวก ก.2)**

| sort_order | title_th | is_required | evidence_required |
|---|---|---|---|
| 1 | ระงับบัญชีผู้ใช้ อีเมล VPN และสิทธิ์ทุกระบบภายในวันสุดท้าย | true | false |
| 2 | รับคืนอุปกรณ์ครบถ้วนตามทะเบียนทรัพย์สิน และตรวจสภาพ | true | **true** |
| 3 | โอนย้ายข้อมูลงานให้หัวหน้าหน่วยงานตามที่อนุมัติ | true | false |
| 4 | เพิกถอนสิทธิ์ระบบภายนอก (SaaS/Cloud) และปรับทะเบียน License | true | false |
| 5 | ลบข้อมูลบริษัทจากอุปกรณ์ BYOD และปิดบัญชีถาวรภายใน 30 วัน | true | false |

### 2.3 โครงสร้างตารางที่เสนอ

**`checklist_template`**

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `id` | bigserial | N | auto | PK |
| `company_id` | bigint | Y | null | null = ใช้ร่วมทั้งกลุ่ม |
| `code` | varchar(40) | N | — | `CHK-ONBOARD` / `CHK-OFFBOARD` (UNIQUE ต่อบริษัท) |
| `name_th` | varchar(150) | N | — | |
| `doc_ref` | varchar(40) | Y | null | เอกสารต้นทาง เช่น `AIDC-IT-SOP-001 ก.1` |
| `version` | int | N | 1 | เพิ่มทีละ 1 เมื่อแก้รายการ — ใช้ทำสแนปช็อต |
| `is_active` | boolean | N | true | |
| `created_at` / `updated_at` | timestamptz | N | now() | |

**`checklist_item`**

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `id` | bigserial | N | auto | PK |
| `template_id` | bigint | N | — | FK → `checklist_template` (ON DELETE CASCADE) |
| `sort_order` | int | N | 0 | |
| `title_th` | varchar(255) | N | — | |
| `description` | varchar(500) | Y | null | |
| `is_required` | boolean | N | true | true = บล็อกการปิดงาน |
| `evidence_required` | boolean | N | false | true = ต้องแนบไฟล์หลักฐาน |
| `default_role_code` | varchar(30) | Y | null | ผู้รับผิดชอบเริ่มต้น เช่น `agent` |
| `is_active` | boolean | N | true | |

UNIQUE (`template_id`, `sort_order`)

**`ticket_checklist`** — อินสแตนซ์ที่ผูกกับ ticket

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `id` | bigserial | N | auto | PK |
| `ticket_id` | bigint | N | — | FK → `ticket` |
| `template_id` | bigint | N | — | FK → `checklist_template` |
| `template_version` | int | N | — | **สแนปช็อตเวอร์ชัน** — แก้ template ภายหลังไม่กระทบ ticket เก่า (หลักเดียวกับ `ticket.sla_policy_id`) |
| `completed_at` | timestamptz | Y | null | ตั้งอัตโนมัติเมื่อข้อ required ครบทุกข้อ |
| `created_at` | timestamptz | N | now() | |

UNIQUE (`ticket_id`, `template_id`)

**`ticket_checklist_item`**

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `id` | bigserial | N | auto | PK |
| `ticket_checklist_id` | bigint | N | — | FK (ON DELETE CASCADE) |
| `checklist_item_id` | bigint | Y | null | FK → `checklist_item` (null ได้ถ้าต้นทางถูกลบ) |
| `title_snapshot` | varchar(255) | N | — | ข้อความ ณ เวลาที่สร้าง (กันข้อความเปลี่ยนย้อนหลัง) |
| `is_required` | boolean | N | true | สแนปช็อต |
| `is_done` | boolean | N | false | |
| `done_by` | bigint | Y | null | FK → `app_user` |
| `done_at` | timestamptz | Y | null | |
| `note` | varchar(500) | Y | null | |
| `attachment_id` | bigint | Y | null | FK → `attachment` (บังคับเมื่อ `evidence_required`) |

**กฎที่ backend ต้องบังคับ:**
1. เมื่อสร้าง ticket ที่ `catalog_item_id` มี `checklist_template_id` → สร้าง `ticket_checklist` + item ทั้งชุดอัตโนมัติ
2. `in_progress → resolved` ถูกปฏิเสธด้วย `409` ถ้ายังมี item ที่ `is_required AND NOT is_done` (ข้อความ: ระบุข้อที่ยังไม่ครบ)
3. item ที่ `evidence_required` ต้องมี `attachment_id` ก่อนติ๊กเสร็จ
4. การติ๊ก/ยกเลิกติ๊กทุกครั้งบันทึกลง `audit_log` (`entity_type='ticket_checklist_item'`)

---

## 3. SOP ที่ต้องมีขั้นตอนอนุมัติ (Approval)

### 3.1 สรุปจุดที่ต้องอนุมัติ

| SOP / Catalog | ขั้นอนุมัติ (เรียงลำดับ) | เงื่อนไข | ผลต่อ SLA |
|---|---|---|---|
| **SOP-03** `SR-ACCESS` | 1) หัวหน้าหน่วยงานของผู้ขอ → 2) **System Owner** (`service.owner_user_id`) | ทุกคำขอสิทธิ์ทุกระบบ (นโยบาย 3.3 บังคับ) | นาฬิกา 540 นาทีทำการ **เริ่มนับหลังอนุมัติครบ** (`clock_start_event='after_approval'`) |
| **SOP-06** `SR-SW-NONSTD` | 1) Tier 2 ประเมิน (ความปลอดภัย/ลิขสิทธิ์/ค่าใช้จ่าย) → 2) **Head of IT** → 3) จัดซื้อ (เฉพาะกรณีมีค่าใช้จ่าย) | ซอฟต์แวร์ไม่อยู่ใน `approved_software` | เวลาระหว่างรออนุมัติ = `pending_reason='approval'` (หยุดนับ ตาม SLA ข้อ 9) |
| **SLA 5.3** `SR-EQUIP` | อนุมัติงบประมาณ | ทุกคำขอจัดหาอุปกรณ์ | 10 วันทำการ (5,400 นาที) **เริ่มนับหลังอนุมัติงบประมาณ** |
| **SOP-07** `SR-RESTORE` | หัวหน้าหน่วยงาน | เฉพาะกรณีเป็นข้อมูลส่วนกลาง | — |
| **SOP-05** Offboarding ข้อ 4 | หัวหน้าหน่วยงาน (อนุมัติการโอนย้ายข้อมูล/อีเมล) | เมื่อมีการร้องขอโอนข้อมูล | — |
| **SOP 3.10** `SR-POLICY-EXC` | **Head of IT** | ทุกคำขอยกเว้นนโยบาย + ทบทวนทุก 6 เดือน | — |
| **SOP-08** Change (เฟส 2) | CAB | Change ความเสี่ยงสูง/กระทบหลายหน่วยงาน | — |

### 3.2 โครงสร้าง `approval_request`

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `id` | bigserial | N | auto | PK |
| `ticket_id` | bigint | N | — | FK → `ticket` |
| `seq` | smallint | N | 1 | ลำดับขั้น — ขั้น `n+1` เปิดใช้ได้เมื่อขั้น `n` เป็น `approved` |
| `approver_type` | varchar(30) | N | — | `line_manager` / `system_owner` / `head_of_it` / `budget_owner` / `cab` |
| `approver_id` | bigint | Y | null | FK → `app_user`; null = ยังหาผู้อนุมัติไม่ได้ (ต้องแจ้ง `company_admin`) |
| `status` | varchar(20) | N | `'pending'` | `pending` / `approved` / `rejected` / `cancelled` / `skipped` |
| `decided_by` | bigint | Y | null | FK → `app_user` |
| `decided_at` | timestamptz | Y | null | |
| `comment` | varchar(500) | Y | null | **บังคับเมื่อ `rejected`** |
| `requested_at` | timestamptz | N | now() | |
| `due_at` | timestamptz | Y | null | ใช้เตือนผู้อนุมัติที่ค้าง |
| `attachment_id` | bigint | Y | null | หลักฐานการอนุมัติที่แนบเพิ่ม (SOP-03 ข้อ 4) |

UNIQUE (`ticket_id`, `seq`) · INDEX (`approver_id`, `status`)

**กฎที่ backend ต้องบังคับ:**
1. เมื่อสร้าง ticket ที่ `service_catalog_item.requires_approval = true` → สร้างแถว `approval_request` ตามลำดับที่กำหนดของ catalog item นั้น
2. ขณะมีแถว `pending` → ticket อยู่สถานะ `pending_user` + `pending_reason='approval'` → **หยุดนับ SLA** (SLA ข้อ 9)
3. เมื่ออนุมัติครบทุกขั้น → ตั้ง `ticket.sla_clock_started_at = now()` และคำนวณ `resolution_due_at` จากจุดนั้น (สำหรับ `clock_start_event='after_approval'` / `after_budget_approval`)
4. เมื่อขั้นใดเป็น `rejected` → ticket ไปสถานะ `cancelled` พร้อมเหตุผลจาก `comment` (บันทึกใน `ticket_status_history`)
5. **ห้ามผู้ขออนุมัติคำขอของตนเอง** (`approver_id ≠ ticket.requester_id`) — หลัก Least Privilege / segregation of duty
6. permission ใหม่: `approval.decide` (มอบให้ผู้ที่เป็น approver ของแถวนั้นเท่านั้น ไม่ผูกกับ role), `approval.read`

> **หมายเหตุขอบเขต:** `01-srs.md` §1.3 ระบุ "ระบบอนุมัติหลายชั้น (approval workflow)" เป็น out of scope เฟส 1 — แต่ **SOP-03 บังคับให้ทุกคำขอสิทธิ์ต้องผ่านการอนุมัติ 2 ขั้นก่อนดำเนินการ** และ SLA 5.3 กำหนดให้นาฬิกาเริ่มนับ "หลังการอนุมัติครบถ้วน" → **การอนุมัติแบบเรียงลำดับอย่างง่าย (`approval_request` ตารางเดียว) ต้องอยู่ใน MVP** มิฉะนั้นระบบไม่รองรับ SOP-03/SOP-06 ได้เลย สิ่งที่ยังคงเลื่อนไปเฟส 2 คือ **rule engine เลือกผู้อนุมัติอัตโนมัติ** และ **CAB แบบหลายคนโหวต** — **[ต้องยืนยันกับ PM]** ว่ายอมรับการขยายขอบเขตส่วนนี้

---

## 4. นโยบายที่กระทบระบบโดยตรง

| นโยบาย | ข้อกำหนดตามเอกสารจริง | สิ่งที่ backend ต้องบังคับใช้ | ช่องว่างปัจจุบัน |
|---|---|---|---|
| **3.2 รหัสผ่าน** | ยาว **≥ 12 ตัวอักษร** ประกอบด้วยพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข อักขระพิเศษ | Validator ตอนตั้ง/เปลี่ยนรหัสผ่านทั้ง API และ UI; ห้ามรหัสซ้ำกับที่เคยใช้ **[ต้องยืนยันกับ PM]** ว่าต้องเก็บประวัติกี่ชุด (เอกสารไม่ระบุ) | `01-srs.md` §5.2 ต้องตรวจว่าตรงกับ 12 ตัวอักษรหรือไม่ — ถ้าต่ำกว่าให้ยึด 12 |
| **3.2 ล็อกบัญชี** | ล็อกอัตโนมัติเมื่อใส่รหัสผิด **เกิน 5 ครั้งติดต่อกัน** — **การปลดล็อกต้องยืนยันตัวตนกับ Service Desk** | `app_user.failed_login_count` threshold = **5**; เมื่อถึงเกณฑ์ตั้ง `locked_until = NULL` แต่เพิ่มฟิลด์ `is_locked` **(ใหม่)** boolean = true → **ปลดล็อกด้วยเวลาไม่ได้ ต้องให้ agent ปลดเท่านั้น** | ปัจจุบันออกแบบเป็น `locked_until` (ปลดเองตามเวลา) ซึ่ง**ขัดนโยบาย** — ต้องแก้ |
| **3.2 บัญชี Admin** | แยกจากบัญชีใช้งานประจำวัน + **เปลี่ยนรหัสผ่านทุก 90 วัน** | เพิ่ม `app_user.is_admin_account` **(ใหม่)** boolean และ `password_changed_at` **(ใหม่)**; บังคับเปลี่ยนรหัสเมื่อเกิน 90 วันสำหรับบัญชีที่มี role `super_admin`/`company_admin` | ยังไม่มีทั้งสองฟิลด์ |
| **3.2 MFA** | เปิด MFA กับ "ระบบสำคัญทุกระบบ ได้แก่ อีเมล VPN **ระบบงานหลัก** และบัญชีผู้ดูแลระบบ" | ถ้า AIDC Helpdesk ถือเป็นระบบงานหลัก → ต้องมี TOTP อย่างน้อยสำหรับ `super_admin`/`company_admin` | **[ต้องยืนยันกับ PM] Q-09 ใน `05-…`** — SRS เฟส 1 ไม่มี MFA (ประเมินเพิ่ม 3–5 วัน) |
| **3.2 รหัสผ่านรั่วไหล** | เปลี่ยนทันทีและแจ้งฝ่ายไอที **ภายใน 24 ชม.** | หมวดหมู่ ticket "สงสัยรหัสผ่านรั่วไหล" ที่ตั้ง `is_security_incident = true` อัตโนมัติ | เพิ่ม seed `ticket_category` |
| **3.3 Access Control** | Least Privilege / Need-to-Know; ขอสิทธิ์ต้องผ่าน Ticketing + อนุมัติ 2 ขั้น; **สิทธิ์ชั่วคราวมีกำหนดสิ้นสุด**; ทบทวนสิทธิ์ทุก 6 เดือน | RBAC + row-level scoping เดิมสอดคล้องแล้ว; เพิ่ม `approval_request` (§3) และ `user_role.expires_at` **(ใหม่)** สำหรับ role ชั่วคราว | `user_role` ยังไม่มีวันหมดอายุ |
| **3.3 การเก็บ Log** | บันทึกการเข้าถึงระบบสำคัญ **เก็บไม่น้อยกว่า 90 วัน** | `audit_log` เป็น append-only อยู่แล้ว — เพิ่มข้อกำหนด **ห้าม purge ก่อน 90 วัน** และบันทึก login/logout/failed login เข้า `audit_log` ด้วย | ปัจจุบันบันทึกเฉพาะการกระทำกับข้อมูล ไม่ได้บันทึกการเข้าสู่ระบบ |
| **3.3 เข้าถึงจากภายนอก** | ต้องผ่าน **VPN + MFA** เท่านั้น | เป็นเรื่องโครงสร้างพื้นฐาน ไม่ใช่โค้ด — แต่ `13-deployment.md` ต้องระบุว่าระบบเผยแพร่เฉพาะภายในเครือข่าย/VPN | **[ต้องยืนยันกับ PM]** ถ้าผู้ใช้หน้างาน (Construction/Logistic) ต้องเข้าจากภายนอกโดยไม่มี VPN จะขัดนโยบายข้อนี้ |
| **3.8 PDPA** | เก็บเท่าที่จำเป็น; เข้ารหัสเมื่อส่งออกนอกองค์กร; **จำกัดสิทธิ์เข้าถึงข้อมูลส่วนบุคคลและบันทึกการเข้าถึง**; รั่วไหล → แจ้ง DPO ทันที + หน่วยงานกำกับ **ภายใน 72 ชม.**; **ลบเมื่อพ้นระยะเวลาเก็บรักษา** | 1) บันทึก `audit_log` ทุกครั้งที่มีการอ่านข้อมูลส่วนบุคคลของผู้อื่น (`action='read'`, `entity_type='app_user'`) 2) ฟิลด์ `dpo_notified_at` / `regulator_notify_due_at` (SOP-10) 3) **ต้องมีนโยบายเก็บข้อมูล (retention)** | **ขัดกับ A-09 ใน `01-srs.md`** ที่บอก "เก็บ ticket ตลอดอายุระบบ ไม่มี archive policy" → **[ต้องยืนยันกับ PM]** ต้องกำหนดระยะเวลาเก็บรักษา ticket/attachment ที่มีข้อมูลส่วนบุคคล |
| **3.8 โอนข้อมูลให้บุคคลภายนอก** | ต้องมี **DPA** รองรับ | กระทบการเลือกผู้ให้บริการ SMTP/LINE ภายนอก (A-05, A-06) — ถ้าใช้บริการภายนอกต้องมี DPA ก่อน go-live | เพิ่มเป็นเงื่อนไข go-live ใน `13-deployment.md` |
| **3.9 Asset Management** | ทรัพย์สินไอทีทุกรายการต้องขึ้นทะเบียนพร้อมผู้ถือครอง/สถานที่/สถานะ; ลงนามรับมอบ; Secure Wipe ตอนปลดระวาง | Asset module อยู่นอกขอบเขตเฟส 1 → **สะพานชั่วคราวใน MVP:** เพิ่ม `ticket.asset_tag` **(ใหม่)** `varchar(50)` เป็นข้อความอิสระ เพื่อให้อ้างอิงหมายเลขทรัพย์สินได้ และย้ายเข้าตารางจริงในเฟส 2 โดยไม่เสียข้อมูล | ยังไม่มีฟิลด์ใด ๆ ที่อ้างถึงอุปกรณ์ |
| **3.5 ซอฟต์แวร์และลิขสิทธิ์** | ติดตั้งได้เฉพาะที่อยู่ใน **Approved Software List**; ขอนอกบัญชีต้องผ่านการประเมิน | ตาราง `approved_software` (§1 SOP-06) เป็น master data + การตรวจอัตโนมัติในฟอร์มคำขอ | ยังไม่มี |
| **3.10 การบังคับใช้** | ขอยกเว้นนโยบายผ่าน Ticketing + **Head of IT อนุมัติ** + ทบทวนทุก 6 เดือน | catalog `SR-POLICY-EXC` + `approval_request` + `exception_expires_at` **(ใหม่)** | ยังไม่มี |

---

## 5. สิ่งที่ **ไม่ควร** ใส่ในเฟส 1

| # | รายการ | เหตุผล |
|---|---|---|
| N-01 | **Change Management เต็มรูปแบบ (SOP-08) + CAB** | เป็นเอนทิตีคนละชนิดกับ ticket (มี RFC, risk assessment, rollback plan, การโหวตของคณะกรรมการ) ประเมินเพิ่มอย่างน้อย 10–15 วัน และ `01-srs.md` §1.3 ล็อกไว้เป็น out of scope แล้ว — **ทางออกเฟส 1:** ใช้ `maintenance_window` รองรับข้อ 4 ของ SOP-08 (แจ้งล่วงหน้า 3 วันทำการ) ก็เพียงพอต่อการคำนวณ Uptime |
| N-02 | **Asset / Inventory Management (SOP-09, นโยบาย 3.9)** | ต้องมีวงจรชีวิตทรัพย์สิน การตรวจนับประจำปี และการเชื่อมกับฝ่ายบัญชี — เป็นระบบของตัวเอง ไม่ใช่ฟีเจอร์ของ helpdesk **ทางออกเฟส 1:** `ticket.asset_tag` เป็นข้อความอิสระ |
| N-03 | **ทะเบียน License และการจัดซื้อ (SOP-06 ข้อ 4–5)** | ผูกกับกระบวนการจัดซื้อและงบประมาณขององค์กร ซึ่งอยู่คนละระบบ — เฟส 1 บันทึกเป็นคอมเมนต์/ไฟล์แนบใน ticket ก็ตรวจสอบย้อนหลังได้ตามเจตนา SOP |
| N-04 | **การเฝ้าระวัง Backup Job และ Restore Test (SOP-07 ข้อ 1, 2, 6)** | เป็นงานปฏิบัติการของ System Admin บนเครื่องมือ backup โดยตรง การให้ helpdesk ทำซ้ำจะเป็นการบันทึกซ้ำซ้อนโดยไม่เพิ่มคุณค่า — เฟส 1 รองรับเฉพาะ **คำขอกู้คืนของผู้ใช้** (`SR-RESTORE`) ซึ่งเป็นส่วนที่เกี่ยวกับผู้ใช้จริง |
| N-05 | **ปฏิทินบำรุงรักษาและงานตามกำหนดการซ้ำ (SOP-09)** | ต้องมีแนวคิด "recurring ticket / scheduled task" ที่ยังไม่มีใน data model และต้องพึ่ง Asset — **ทางออกเฟส 1:** เปิด ticket ปกติเมื่อพบความผิดปกติ (SOP-09 ข้อ 5) |
| N-06 | **การเชื่อมระบบ Monitoring อัตโนมัติ (KPI Uptime)** | อยู่นอกขอบเขต `01-srs.md` §1.3 และต้องรู้ว่าองค์กรใช้เครื่องมือใด (**[ต้องยืนยันกับ PM]**) — **ทางออกเฟส 1:** บันทึก `service_outage` ด้วยมือ ซึ่งได้ KPI-6 ครบตามสูตรของเอกสาร |
| N-07 | **KPI Self-Service Deflection ≥20% (SOP 5.4)** | ต้องติดตาม session ผู้ใช้และความสัมพันธ์ "ดู KB แล้วไม่เปิด ticket" ซึ่งต้องมี event tracking — คุณค่าต่ำในปีแรกที่ KB ยังมีบทความน้อย |
| N-08 | **Access Review รอบ 6 เดือน และการเพิกถอนสิทธิ์อัตโนมัติ (SOP-03 ข้อ 6)** | ต้องมีทะเบียนสิทธิ์จริงในระบบปลายทาง ไม่ใช่แค่บันทึกใน ticket — เฟส 1 เก็บ `access_expires_at` ไว้เพื่อ**รายงานเตือน** ให้ทำด้วยมือได้ |
| N-09 | **Status Page / ประกาศสถานะระบบทั้งองค์กร (SOP-02 ข้อ 3)** | ต้องเข้าถึงได้แม้ระบบหลักล่ม (โฮสต์แยก) จึงขัดกับสถาปัตยกรรมเซิร์ฟเวอร์เดียวใน `13-deployment.md` — **ทางออกเฟส 1:** ใช้ broadcast notification ไปยังผู้ใช้ทุกคน + อีเมล |
| N-10 | **rule engine เลือกผู้อนุมัติอัตโนมัติ / CAB หลายคนโหวต** | `approval_request` แบบเรียงลำดับตายตัวเพียงพอต่อ SOP-03 และ SOP-06 แล้ว — ความซับซ้อนที่เพิ่มไม่คุ้มในเฟส 1 |

---

## 6. สรุปรายการที่ต้องเพิ่มเข้า MVP เพราะ SOP บังคับ

| รายการ | SOP ที่บังคับ | ผลถ้าไม่ทำ |
|---|---|---|
| `ticket_type` = incident / service_request | SOP-01 ข้อ 2 | ปฏิบัติตาม SOP-01 ไม่ได้ และ KPI FCR/Repeat Incident ไม่มีความหมาย |
| `approval_request` (เรียงลำดับ 2 ขั้น) | SOP-03, SOP-06 | คำขอสิทธิ์และซอฟต์แวร์นอกบัญชีทำในระบบไม่ได้เลย |
| `checklist_template` / `checklist_item` / `ticket_checklist` / `ticket_checklist_item` | SOP-04, SOP-05 | ปิดงาน onboarding/offboarding โดยไม่มีหลักฐานว่าทำครบ — ขัดข้อบังคับโดยตรง |
| `service_catalog_item` | SLA 5.3, SOP-03/04/05/06 | เป้าหมายเวลาของคำขอบริการผิดทั้งหมด |
| `is_security_incident` + `dpo_notified_at` + `regulator_notify_due_at` | SOP-10, นโยบาย 3.8 | ไม่มีหลักฐานการปฏิบัติตาม PDPA 72 ชม. |
| `is_locked` (ปลดล็อกโดย Service Desk เท่านั้น) | นโยบาย 3.2 | การปลดล็อกอัตโนมัติตามเวลาขัดนโยบาย |
| `escalation_contact` + `support_tier` | SLA 6.1/6.2, SOP 5.3 | กฎ escalation ตามเอกสารบังคับใช้ไม่ได้ |
| บันทึก login / failed login ลง `audit_log` และห้าม purge ก่อน 90 วัน | นโยบาย 3.3 | ตรวจสอบย้อนหลังไม่ได้ตามนโยบาย |
| `approved_software` (master data อ่านอย่างเดียว) | SOP-06 ข้อ 2, นโยบาย 3.5 | Tier 1 ตัดสินใจไม่ได้ว่าติดตั้งได้ทันทีหรือต้องอนุมัติ |
