# การเทียบและปรับระบบให้ตรงเอกสารควบคุมจริง (SLA Policy Alignment)

| หัวข้อ | รายละเอียด |
|---|---|
| รหัสเอกสาร | SA-005 |
| เวอร์ชัน | 1.0 |
| ผู้จัดทำ | System Analyst |
| **เอกสารควบคุมที่ยึดถือ** | **AIDC-IT-SLA-001 v1.1** (บังคับใช้ 1 ส.ค. 2569) และ **AIDC-IT-SOP-001 v1.1** (บังคับใช้ 1 ส.ค. 2569) |
| เอกสารที่ถูกแก้จากเอกสารนี้ | `01-srs.md`, `02-data-model.md`, `03-api-spec.md`, `04-rbac-sla.md`, `11-sla-engine.md`, `21-ui-ux-design.md`, `22-component-spec.md` |
| หลักการ | **เอกสารควบคุมมีอำนาจเหนือสมมติฐานเดิมทุกกรณี** — ตัวเลขทุกตัวในเอกสารนี้คัดจากเอกสารจริง ถ้าเอกสารจริงไม่ระบุ จะทำเครื่องหมาย **[ต้องยืนยันกับ PM]** |

> **หมายเหตุขอบเขตสำคัญ:** AIDC-IT-SLA-001 v1.1 เป็นเอกสารของ **บริษัท เอไอดีซี เทค จำกัด (`company_id = 5`, `AIDC-TECH`)** เท่านั้น ไม่ใช่เอกสารระดับกลุ่ม — ดูการวิเคราะห์ในหัวข้อ 10

---

## 1. Gap Analysis

| # | หัวข้อ | สิ่งที่เราออกแบบไว้เดิม | สิ่งที่เอกสารจริงกำหนด | ผลกระทบต่อระบบ | สิ่งที่ต้องแก้ (ไฟล์ / ตาราง / ฟิลด์) |
|---|---|---|---|---|---|
| G-01 | เวลาทำการ | **จ.–ส. 08:00–17:00** (9 ชม. = 540 นาที/วัน) เสาร์เป็นวันทำการ | **จ.–ศ. 08:30–17:30** ยกเว้นวันหยุดบริษัท (SLA 1.4, 3.1 / SOP 2.4) — ยังได้ 9 ชม. = 540 นาที/วัน แต่ **เสาร์ไม่ใช่วันทำการ** | `add_business_minutes` คำนวณผิดทุกเคสที่คร่อมวันเสาร์ → due date คลาดเคลื่อนสูงสุด 1 วันทำการ; unit test 23 ฟังก์ชันต้องรันใหม่ทั้งชุด | `02-data-model.md` §3.11 default `start_time`→`08:30`, `end_time`→`17:30`; §6.7 seed `business_hours` (`day_of_week=6` → `is_working_day=false`); `11-sla-engine.md` §2 ค่าคงที่ปฏิทินเริ่มต้นและชุดทดสอบ §4; `01-srs.md` FR-31; `04-rbac-sla.md` §3.1 |
| G-02 | ระดับความสำคัญ | `critical` / `high` / `medium` / `low` — ผู้แจ้งเลือกเองตอนสร้าง | **P1 / P2 / P3 / P4** กำหนดจาก **Priority Matrix = ผลกระทบ (Impact) × ความเร่งด่วน (Urgency)** โดย **Service Desk เป็นผู้กำหนดระดับเบื้องต้น** ผู้รับบริการ "ขอทบทวนได้โดยระบุเหตุผลทางธุรกิจ" (SLA 4 / SOP 5.1) | เปลี่ยนค่า enum ทั้งระบบ (DB + API + UI + รายงานย้อนหลัง); เปลี่ยนวิธีได้มาซึ่ง priority จาก "ผู้แจ้งเลือก" เป็น "ระบบคำนวณจาก impact × urgency" | `ticket.priority` `varchar(10)` ค่าใหม่ `P1/P2/P3/P4`; เพิ่ม `ticket.impact` `varchar(20)`, `ticket.urgency` `varchar(20)`; `ticket_category.default_priority`; `sla_target.priority`; `02-data-model.md` §6.3/§6.4/§6.5/§6.6; `03-api-spec.md` (enum + ตัวอย่าง); `21-ui-ux-design.md`/`22-component-spec.md` (ป้ายสี, ตัวกรอง, ฟอร์มสร้าง) |
| G-03 | ตัวเลข response | critical 30 / high 60 / medium 240 / low 480 **นาทีทำการ** | **P1 15 นาที (24×7)** / P2 30 / P3 120 / P4 240 **นาทีทำการ** (SLA 5.1) | P1 เข้มขึ้น 2 เท่าและเป็นเวลาปฏิทิน ไม่ใช่เวลาทำการ → เครื่องคำนวณต้องรองรับ 2 โหมดนาฬิกา | `sla_target.response_minutes` seed ใหม่ (หัวข้อ 3.1); เพิ่ม `sla_target.clock_mode` |
| G-04 | ตัวเลข resolution | critical 240 / high 480 / medium 1,440 / low 2,700 นาทีทำการ | **P1 4 ชม. (นับต่อเนื่อง)** / P2 8 ชม.ทำการ (480) / **P3 2 วันทำการ (1,080)** / P4 5 วันทำการ (2,700) (SLA 5.1) | P3 เดิม 1,440 นาที → จริง **1,080 นาที** (สั้นลง 6 ชม.ทำการ); P1 เปลี่ยนเป็นนาฬิกาปฏิทิน | `sla_target.resolution_minutes` seed ใหม่; `04-rbac-sla.md` §3.2, §3.3 |
| G-05 | กติกาการนับเวลา | นับ**นาทีทำการ**อย่างเดียวทุก priority | **P1 นับต่อเนื่อง 24×7** (มีทีม On-call) ส่วน **P2–P4 นับเฉพาะเวลาทำการ** (SLA 5.4 / SOP 5.2 หมายเหตุ) | `add_business_minutes()` ใช้กับ P1 ไม่ได้ ต้องแยกเส้นทางคำนวณ; งาน `scan_sla` ต้องประเมิน P1 นอกเวลาทำการด้วย | เพิ่ม `sla_target.clock_mode` `varchar(20)` (`calendar_24x7` / `business_hours`); `11-sla-engine.md` §2 เพิ่มสาขา `if clock_mode=='calendar_24x7': due = start + timedelta(minutes=n)`; §5.2 `scan_sla` เลิกกรองนอกเวลาทำการสำหรับ P1 |
| G-06 | กฎ pause | หยุดนับเฉพาะสถานะ `pending_user` | หยุดนับเมื่อ **(ก) รอข้อมูล/การยืนยันจากผู้แจ้ง** หรือ **(ข) รออะไหล่/ผู้ให้บริการภายนอกที่แจ้งผู้รับบริการแล้ว** และข้อยกเว้น 9 ยังรวม **(ค) รอการอนุมัติจากฝั่งผู้รับบริการ** (SLA 5.4, 9) | สถานะเดียวไม่พอ ต้องแยกเหตุผลการหยุดเพื่อรายงานและตรวจสอบว่า "แจ้งผู้รับบริการแล้ว" จริง | เพิ่ม `ticket.pending_reason` `varchar(20)` (`user` / `vendor` / `approval`); เพิ่ม `ticket.pending_notified_at` (เงื่อนไขบังคับสำหรับ `vendor`); `02-data-model.md` §3.6, §4.1 (state machine) |
| G-07 | กฎ workaround | **ไม่มี** — นับ resolution จนถึงสถานะ `resolved` เท่านั้น | **การแก้ด้วย Workaround ที่ทำให้ผู้ใช้ทำงานต่อได้ ถือว่าหยุดนับเวลาแก้ไขของ Incident** งานแก้ถาวรติดตามต่อในรูปแบบ **Problem** (SLA 5.4) | ระบบวัด SLA ต่ำกว่าความจริง (ticket ที่มี workaround แล้วยังนับเวลาต่อ = breach ทั้งที่ไม่ควร); ต้องมีเอนทิตี Problem | เพิ่ม `ticket.workaround_at` `timestamptz`, `ticket.workaround_note` `text`; ตาราง **`problem`** ใหม่ + `ticket.problem_id`; `sla_status()` ต้องหยุดนาฬิกาที่ `workaround_at`; `11-sla-engine.md` §3, `04-rbac-sla.md` §4.1 |
| G-08 | เปลี่ยน priority กลางทาง | คำนวณ due ใหม่**จาก `created_at` เดิม**ด้วย target ใหม่ (`11-sla-engine.md` §3.1) | **"ให้นับเวลาตามระดับใหม่ตั้งแต่เวลาที่ปรับ"** พร้อมบันทึกเหตุผลใน Ticket (SLA 5.4) | **ขัดกันโดยตรง** — สูตรเดิมทำให้ ticket ที่ยกระดับเป็น P1 กลายเป็น breach ทันทีทั้งที่เพิ่งยกระดับ ซึ่งไม่ตรงเจตนาเอกสาร | `11-sla-engine.md` §3.1 `change_priority()` → คำนวณจาก `priority_changed_at` (= now) แทน `ticket.created_at`; เพิ่ม `ticket.priority_changed_at` `timestamptz`; `04-rbac-sla.md` §4.2 หมายเหตุ |
| G-09 | ปิดตั๋วเมื่อผู้แจ้งไม่ตอบ | `pending_user` ครบ **5 วันทำการ** → ระบบตั้งเป็น `resolved` อัตโนมัติ (ไม่มีการติดตาม) | **ไม่ตอบภายใน 3 วันทำการ หลังการติดตาม 2 ครั้ง** จึงปิดได้ พร้อมแจ้งให้ทราบ และเปิดใหม่ได้ (SLA 5.4); SOP-01 ข้อ 9 ปิด Ticket เมื่อผู้แจ้งยืนยัน หรือครบ 3 วันทำการโดยไม่ตอบ | ต้องมีกลไก "ติดตาม 2 ครั้ง" ที่พิสูจน์ได้ ก่อนปิดอัตโนมัติ มิฉะนั้นการปิดขัดเอกสารควบคุม | เพิ่ม `ticket.followup_count` `int`, `ticket.last_followup_at` `timestamptz`; งาน `auto_resolve_pending` → เปลี่ยนเป็น `followup_pending` (ส่งติดตามครั้งที่ 1 และ 2) + `auto_close_unresponsive` (ปิดเมื่อ `followup_count >= 2` และครบ 3 วันทำการ); `11-sla-engine.md` §5.1, §5.4; `02-data-model.md` §4 state machine |
| G-10 | ปิดอัตโนมัติหลัง `resolved` | 3 วันทำการ (D-08) | ตรงกัน — SOP-01 ข้อ 9 + SLA 8.2 "ยืนยันผลการแก้ไขภายใน 3 วันทำการ" | ไม่ต้องแก้ | คงเดิม — เปลี่ยนสถานะ D-08 จาก "สมมติฐาน" เป็น "ยืนยันแล้วโดยเอกสาร" |
| G-11 | Escalation | L1–L5 อิงเปอร์เซ็นต์เวลาและ role ในระบบ (`company_admin` / `super_admin`) | **Functional Tier 1→2→3** (เงื่อนไข: Tier 1 แก้ไม่ได้ใน **2 ชม.ทำการ**) + **Hierarchical: Head of IT / CEO** พร้อมเงื่อนไขเฉพาะ (SLA 6.1, 6.2 / SOP 5.3) | ระบบไม่มีแนวคิด "Tier" และไม่มีบทบาท Head of IT / CEO ที่ผูกกับคน → กฎ escalation จริงบังคับใช้ไม่ได้ | เพิ่ม `ticket.support_tier` `smallint`, `ticket.tier_changed_at`; ตาราง **`escalation_contact`** ใหม่; ตาราง **`sla_escalation_rule`** (กฎแบบตั้งค่าได้); `04-rbac-sla.md` §4.3 |
| G-12 | รายงานสถานะระหว่างทาง | **ไม่มี** | **P1 รายงานทุก 1 ชม.** จนแก้เสร็จ, **P2 ทุก 4 ชม.ทำการ**, P3/P4 เมื่อสถานะเปลี่ยน (SLA 5.1) | เป็นข้อผูกพันตาม SLA ที่ระบบต้องเตือนและบันทึกหลักฐานว่าทำจริง | เพิ่ม `sla_target.status_report_interval_minutes` `int` (null = เมื่อสถานะเปลี่ยน); เพิ่ม `ticket.next_status_report_due_at`; งาน `status_report_reminder` ใน `11-sla-engine.md` §5.1 |
| G-13 | ความพร้อมใช้งาน (Uptime) | **ไม่มีแนวคิดนี้เลย** | **Critical ≥99.9% / High ≥99.5% / Standard ≥99.0%** ต่อเดือน พร้อมสูตรคำนวณ (SLA 5.2, ภาคผนวก ก.1) และ Service Tier ต่อกลุ่มบริการ (SLA 2) | KPI ข้อ 6 ของเอกสารจริงคำนวณไม่ได้ | ตาราง **`service`**, **`service_outage`**, **`maintenance_window`** ใหม่ + `ticket.service_id` — ดูหัวข้อ 6 |
| G-14 | คำขอบริการ (Service Request) | ไม่แยกจาก incident — คำขอทั้งหมดตกเป็น `low` (2,700 นาที) | **มีเป้าหมายรายรายการ** เช่น รีเซ็ตรหัสผ่าน **30 นาทีทำการ**, ขอสิทธิ์ **1 วันทำการ**, ติดตั้งซอฟต์แวร์ **2 วันทำการ**, จัดหาอุปกรณ์ **10 วันทำการ** และมี **เงื่อนไขเริ่มนับเวลา**ต่างกัน (SLA 5.3) | ใช้ `sla_target` ตาม priority อย่างเดียวแทนไม่ได้ — รีเซ็ตรหัสผ่านจะได้ 5 วันทำการแทน 30 นาที (ผิดเอกสาร 90 เท่า) | `ticket.ticket_type` ใหม่ + ตาราง **`service_catalog_item`** — ดูหัวข้อ 7 |
| G-15 | ช่องทางรับแจ้ง | `ticket.source` = `web`/`mobile_web`/`phone`/`email`/`line` | **Portal / อีเมล itsupport@aidctech.com.la / IT Hotline (รับสายภายใน 3 นาที) / Walk-in** — **ไม่มี LINE** (SLA 3.2 / SOP 2.3) | ค่า enum ไม่ตรงเอกสาร และ "รับสายใน 3 นาที" ยังไม่มีที่เก็บ | เปลี่ยน `ticket.source` → `ticket.channel` — ดูหัวข้อ 9 |
| G-16 | เป้าหมาย KPI | เสนอเอง: response met ≥95%, resolution met ≥90%, reopen ≤5%, CSAT ≥4.0 | **SLA Compliance ≥95%, FRT ≤30 นาที, FCR ≥70%, CSAT ≥4.2, Aged Backlog ≤5%, Uptime ≥99.9%, Repeat Incident ≤10%** (SLA 7.1) และ SOP เพิ่ม **Self-Service ≥20%** (SOP 5.4) | ตัวเลขเป้าหมายทุกตัวต้องเปลี่ยน และ 4 ใน 8 ตัวยังคำนวณไม่ได้ด้วยข้อมูลที่เก็บอยู่ | `04-rbac-sla.md` §5; ฟิลด์/ตารางที่ต้องเพิ่มดูหัวข้อ 8 |
| G-17 | Priority ผู้แจ้งเลือกเอง | "ผู้แจ้งระบุได้ตอนสร้างเท่านั้น หลังจากนั้นแก้ไม่ได้" (`04-rbac-sla.md` §6.3) | **Service Desk เป็นผู้กำหนดระดับเบื้องต้น** และ **ผู้รับบริการขอทบทวนระดับได้** โดยระบุเหตุผลทางธุรกิจ (SLA 4) | ขัดกันโดยตรง — ต้องเปิดทางให้ผู้แจ้ง "ขอทบทวน" ได้ | เพิ่ม permission `ticket.request_priority_review`; ฟิลด์ `ticket.priority_review_requested_at`, `priority_review_reason`; `04-rbac-sla.md` §2.1, §6.3 |
| G-18 | RCA หลังเหตุ P1 | ไม่มี | **RCA ภายใน 5 วันทำการหลังเหตุ P1** และ P1 จากสาเหตุเดิมซ้ำภายใน 90 วัน ต้องทบทวน RCA เดิมทันที (SLA 7.2, 7.3 / SOP-02 ข้อ 6) | ข้อผูกพันที่วัดผลได้แต่ระบบไม่ติดตาม | ตาราง `problem` (`rca_due_at`, `rca_submitted_at`, `root_cause_code`) — ดูหัวข้อ 8 (KPI-7) |
| G-19 | หน่วย "1 วันทำการ" | ไม่นิยามชัด (ประเด็น S-02 ของ BE) | เอกสารจริงใช้ "วันทำการ" คู่กับเวลาทำการ 08:30–17:30 → **1 วันทำการ = 540 นาทีทำการ** | ปิดประเด็น S-02 ของ Backend ได้ | ยืนยันใน `11-sla-engine.md` §6 S-02: **1 วันทำการ = 540 นาทีทำการ** (ไม่ใช่ 24 ชม.ปฏิทิน) |
| G-20 | ปิดปรับปรุงตามแผน | ไม่มี | **เสาร์ 20:00–24:00 แจ้งล่วงหน้าอย่างน้อย 3 วันทำการ** และ **ไม่นับเป็น Downtime** (SLA 3.1, 9) | จำเป็นต่อการคำนวณ Uptime ให้ถูก และเป็นข้อยกเว้น SLA | ตาราง `maintenance_window` (หัวข้อ 6) |

---

## 2. Priority Matrix และเกณฑ์การจัดระดับ

### 2.1 เมทริกซ์ตามเอกสารจริง (SLA 4 / SOP 5.1) — ใช้แทนเมทริกซ์เดิมทั้งหมด

| ผลกระทบ (Impact) ↓ \ ความเร่งด่วน (Urgency) → | เร่งด่วนมาก | เร่งด่วนปานกลาง | ไม่เร่งด่วน |
|---|---|---|---|
| **ทั้งองค์กร / ระบบ Critical** | **P1 – Critical** | **P2 – High** | **P3 – Medium** |
| **ทั้งแผนก / หลายคน** | **P2 – High** | **P3 – Medium** | **P3 – Medium** |
| **รายบุคคล** | **P3 – Medium** | **P3 – Medium** | **P4 – Low** |

> **ข้อแตกต่างจากเมทริกซ์เดิม** (`04-rbac-sla.md` §6.1): เดิม "ทั้งบริษัท × เร่งด่วนปานกลาง" = `critical` แต่จริงคือ **P2**; เดิม "รายบุคคล × สูง" = `high` แต่จริงคือ **P3** — เมทริกซ์จริง **ระมัดระวังกว่า** ในการให้ระดับสูงสุด

### 2.2 ค่า enum ที่ระบบต้องใช้

| ฟิลด์ | ค่าที่อนุญาต | หมายเหตุ |
|---|---|---|
| `ticket.impact` | `org_wide` (ทั้งองค์กร/ระบบ Critical), `department` (ทั้งแผนก/หลายคน), `individual` (รายบุคคล) | บังคับกรอกตอนสร้างโดย agent; ผู้แจ้งเห็นเป็นคำถามภาษาชาวบ้าน |
| `ticket.urgency` | `high` (เร่งด่วนมาก), `medium` (เร่งด่วนปานกลาง), `low` (ไม่เร่งด่วน) | |
| `ticket.priority` | `P1`, `P2`, `P3`, `P4` | **ระบบคำนวณให้อัตโนมัติ**จาก impact × urgency; agent ปรับได้พร้อมเหตุผลบังคับ |

**สีที่ใช้บน UI** (แทนตาราง `02-data-model.md` §6.3): `P1` = แดง, `P2` = ส้ม, `P3` = เหลือง, `P4` = เขียว — ป้ายแสดงเป็น `P1 – วิกฤต` / `P2 – สูง` / `P3 – ปานกลาง` / `P4 – ต่ำ`

### 2.3 นิยามตามเอกสารจริงและตัวอย่างของแต่ละบริษัทในเครือ

> **[ต้องยืนยันกับ PM]** ตัวอย่างของบริษัทอื่นนอกจาก AIDC Tech เป็นการแมปตัวอย่างเดิมของทีม (`04-rbac-sla.md` §6.2) เข้ากับนิยาม P1–P4 ของเอกสารจริง — เอกสาร AIDC-IT-SLA-001 ให้ตัวอย่างไว้เฉพาะบริบทของ AIDC Tech

#### P1 – Critical
> นิยามจริง: ระบบ Critical หยุดให้บริการทั้งองค์กร **ไม่มีทางเลี่ยง** เช่น ERP ล่ม เครือข่ายทั้งสำนักงานใช้ไม่ได้ เหตุโจมตีทางไซเบอร์ หรือข้อมูลรั่วไหล

| บริษัท | ตัวอย่างสถานการณ์ |
|---|---|
| **AIDC Tech** (เอกสารจริง) | ERP ล่ม / เครือข่ายทั้งสำนักงานใช้ไม่ได้ / ถูกโจมตีทางไซเบอร์ / ข้อมูลรั่วไหล / เซิร์ฟเวอร์ระบบหลักดับ |
| AIDC HQ | ไฟล์เซิร์ฟเวอร์กลางล่มทั้งกลุ่ม / อีเมลทั้งองค์กรล่ม / ระบบยืนยันตัวตนกลางล่ม |
| AIDC Construction | ระบบรายงานหน้างานล่มทั้งองค์กรในวันส่งงานตามสัญญา / ไฟล์แบบก่อสร้างโครงการหลักเสียหาย |
| COSI | ไฟล์โครงการที่กำลังส่งลูกค้าเสียหาย ต้องกู้จาก backup ทันที (ไม่มีทางเลี่ยง) |
| Heavy Machine | ระบบใบสั่งงานซ่อมล่ม ศูนย์บริการทุกแห่งรับงาน/เบิกอะไหล่ไม่ได้ |
| AIDC Trading | ระบบ e-Tax ใช้ไม่ได้ในวันปิดยอด / ระบบใบสั่งขายล่มทั้งบริษัท |
| AIDC Logistic | WMS หรือ TMS ล่ม รับ-จ่ายสินค้าและจัดรถไม่ได้ มีรถรอคิวหน้าคลัง |

#### P2 – High
> นิยามจริง: ระบบสำคัญใช้ไม่ได้ทั้งแผนก **หรือระบบ Critical ที่มีทางเลี่ยงชั่วคราว** เช่น โมดูลหลักของ ERP ช้าผิดปกติ อีเมลทั้งแผนกใช้ไม่ได้

| บริษัท | ตัวอย่างสถานการณ์ |
|---|---|
| **AIDC Tech** (เอกสารจริง) | โมดูลหลักของ ERP ช้าผิดปกติ / อีเมลทั้งแผนกใช้ไม่ได้ / ระบบภายในที่พัฒนาเองมีบั๊กกระทบผู้ใช้หลายคน |
| AIDC HQ | อินเทอร์เน็ตทั้งชั้นใช้ไม่ได้ / VPN ทั้งกลุ่มเชื่อมต่อไม่ได้ |
| AIDC Construction | เน็ต 4G ที่ไซต์งานล่มทั้งไซต์ ส่งรายงานประจำวันไม่ได้ / plotter พิมพ์แบบไม่ออกก่อนประชุมหน้างาน |
| COSI | License โปรแกรมออกแบบหมดอายุ ทีมออกแบบทั้งทีมทำงานไม่ได้ |
| Heavy Machine | ระบบสต็อกอะไหล่ค้นไม่ได้ทั้งศูนย์ / แท็บเล็ตช่างบริการทั้งชุดใช้ไม่ได้ |
| AIDC Trading | ระบบเชื่อมต่อคู่ค้า (EDI) ส่งข้อมูลไม่ผ่าน / อีเมลติดต่อลูกค้าตีกลับทั้งแผนกขาย |
| AIDC Logistic | เครื่องยิงบาร์โค้ดทั้งคลังใช้ไม่ได้ / GPS ติดรถขาดการเชื่อมต่อทั้งชุด |

#### P3 – Medium
> นิยามจริง: ผู้ใช้รายบุคคลทำงานไม่ได้หรือไม่สะดวก เช่น เครื่องคอมพิวเตอร์มีปัญหา เครื่องพิมพ์ใช้ไม่ได้ โปรแกรมสำนักงานผิดพลาด

| บริษัท | ตัวอย่างสถานการณ์ |
|---|---|
| **AIDC Tech** (เอกสารจริง) | อีเมลรายบุคคล / เครื่องพิมพ์ / โปรแกรมสำนักงานผิดพลาด |
| ทุกบริษัท | เครื่องพิมพ์ตัวใดตัวหนึ่งเสีย (ยังใช้เครื่องอื่นได้) / Wi-Fi อ่อนบางจุด / คอมพิวเตอร์ทำงานช้า |
| AIDC Construction | กล้อง CCTV หน้าไซต์งาน 1 ตัวภาพไม่ขึ้น |
| Heavy Machine | ระบบติดตามพิกัดเครื่องจักรแสดงข้อมูลล่าช้า |
| AIDC Logistic | เครื่องพิมพ์ฉลากตัวสำรองใช้ไม่ได้ |

#### P4 – Low
> นิยามจริง: **คำขอบริการทั่วไป**หรือคำปรึกษาที่ไม่กระทบงานเร่งด่วน เช่น ขอสิทธิ์เข้าถึง ติดตั้งโปรแกรม ขออุปกรณ์ใหม่

| ตัวอย่าง (ทุกบริษัท) |
|---|
| ขอติดตั้งโปรแกรม / ขอสิทธิ์เข้าถึงระบบ / ขอเปลี่ยนเมาส์-คีย์บอร์ด / สอบถามวิธีใช้งาน / ขออุปกรณ์สำหรับพนักงานใหม่ / ขอรายงานย้อนหลัง |

> **ข้อสังเกตสำคัญ:** P4 ตามเอกสารจริงคือ "คำขอบริการทั่วไป" ทั้งหมด แต่หัวข้อ 5.3 กลับกำหนดเวลาเป้าหมายคำขอบริการไว้ต่างหาก (เช่น รีเซ็ตรหัสผ่าน 30 นาที ≠ P4 resolution 5 วันทำการ) → นี่คือเหตุผลหลักที่ต้องแยก `ticket_type` (ดูหัวข้อ 7)

---

## 3. ตาราง Seed จริง (พร้อมใส่ฐานข้อมูล)

> ชื่อฟิลด์ตรงกับ `02-data-model.md` §3.10 และ §3.11 — ฟิลด์ที่ขีดเส้นใต้ว่า **(ใหม่)** ต้องเพิ่มใน data model ก่อน

### 3.1 `sla_policy`

**ฟิลด์ที่ต้องเพิ่ม (เพื่อให้ตรวจสอบย้อนกลับไปเอกสารควบคุมได้ ตามข้อกำหนด Document Control):**

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `doc_ref` **(ใหม่)** | varchar(40) | Y | null | รหัสเอกสารควบคุมที่เป็นที่มา เช่น `AIDC-IT-SLA-001` |
| `doc_version` **(ใหม่)** | varchar(10) | Y | null | เวอร์ชันเอกสาร เช่น `1.1` |
| `effective_from` **(ใหม่)** | date | Y | null | วันที่บังคับใช้ |
| `effective_to` **(ใหม่)** | date | Y | null | null = ยังบังคับใช้อยู่ |

**ข้อมูล seed:**

| id | company_id | name | is_default | is_active | doc_ref | doc_version | effective_from |
|---|---|---|---|---|---|---|---|
| 1 | `NULL` | มาตรฐานกลางกลุ่ม AIDC (อ้างอิง AIDC-IT-SLA-001 v1.1) | true | true | `AIDC-IT-SLA-001` | `1.1` | `2026-08-01` |
| 2 | `5` (AIDC-TECH) | AIDC Tech — AIDC-IT-SLA-001 v1.1 | true | true | `AIDC-IT-SLA-001` | `1.1` | `2026-08-01` |

> แถว id=2 คือ policy ที่มีอำนาจตามเอกสารจริง; แถว id=1 คัดลอกค่าเดียวกันไว้เป็น fallback ของอีก 6 บริษัท **[ต้องยืนยันกับ PM]** — ดูหัวข้อ 10

### 3.2 `sla_target`

**ฟิลด์ที่ต้องเพิ่ม:**

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `clock_mode` **(ใหม่)** | varchar(20) | N | `'business_hours'` | `business_hours` = นับเฉพาะเวลาทำการ / `calendar_24x7` = นับต่อเนื่อง (SLA 5.4) |
| `status_report_interval_minutes` **(ใหม่)** | int | Y | null | รอบรายงานสถานะ; null = รายงานเมื่อสถานะเปลี่ยน (SLA 5.1) |

**ข้อมูล seed (ใช้กับ `sla_policy_id` = 1 และ 2 เหมือนกันทั้งสองชุด):**

| priority | response_minutes | resolution_minutes | clock_mode | status_report_interval_minutes | escalation_percent | ที่มาในเอกสารจริง |
|---|---|---|---|---|---|---|
| `P1` | **15** | **240** | `calendar_24x7` | **60** | 75 | SLA 5.1 — 15 นาที (24×7) / 4 ชม.นับต่อเนื่อง / รายงานทุก 1 ชม. |
| `P2` | **30** | **480** | `business_hours` | **240** | 75 | SLA 5.1 — 30 นาที / 8 ชม.ทำการ / ทุก 4 ชม.ทำการ |
| `P3` | **120** | **1080** | `business_hours` | `NULL` | 75 | SLA 5.1 — 2 ชม.ทำการ / 2 วันทำการ (2 × 540) / เมื่อสถานะเปลี่ยน |
| `P4` | **240** | **2700** | `business_hours` | `NULL` | 75 | SLA 5.1 — 4 ชม.ทำการ / 5 วันทำการ (5 × 540) / เมื่อสถานะเปลี่ยน |

> `escalation_percent = 75` **ไม่ได้มาจากเอกสารจริง** — เป็นกลไกเตือนล่วงหน้าภายในของระบบที่ทีมออกแบบเพิ่ม ให้คงไว้ได้เพราะไม่ขัดกับเอกสาร **[ต้องยืนยันกับ PM]** ว่ายังต้องการหรือไม่

### 3.3 `business_hours`

**seed สำหรับ `company_id = 5` (AIDC Tech — ตามเอกสารจริง) และ `company_id = NULL` (fallback ชั่วคราว):**

| day_of_week | วัน | is_working_day | start_time | end_time |
|---|---|---|---|---|
| 0 | อาทิตย์ | **false** | — | — |
| 1 | จันทร์ | true | **08:30** | **17:30** |
| 2 | อังคาร | true | **08:30** | **17:30** |
| 3 | พุธ | true | **08:30** | **17:30** |
| 4 | พฤหัสบดี | true | **08:30** | **17:30** |
| 5 | ศุกร์ | true | **08:30** | **17:30** |
| 6 | เสาร์ | **false** | — | — |

> **แก้ default ของคอลัมน์ด้วย:** `02-data-model.md` §3.11 `start_time DEFAULT '08:00'` → `'08:30'`, `end_time DEFAULT '17:00'` → `'17:30'`
> 1 วันทำการ = **540 นาที** (เท่าเดิม) — ตัวเลข `resolution_minutes` ที่เป็นทวีคูณของ 540 จึงยังใช้ได้

### 3.4 `holiday`

เอกสารจริงระบุเพียง "ยกเว้น**วันหยุดบริษัท**" โดย**ไม่ได้แนบปฏิทิน** → **[ต้องยืนยันกับ PM] ต้องขอปฏิทินวันหยุดบริษัทฉบับทางการก่อน go-live** เพราะกระทบ `resolution_due_at` ของทุก ticket

| field | ค่าที่ต้องใส่ | หมายเหตุ |
|---|---|---|
| `company_id` | `5` (ถ้าเป็นวันหยุดเฉพาะ AIDC Tech) หรือ `NULL` (ถ้าใช้ร่วมทั้งกลุ่ม) | |
| `holiday_date` | **[ต้องยืนยันกับ PM]** | ต้องนำเข้าอย่างน้อยปีปัจจุบัน + ปีถัดไป |
| `name` | ชื่อวันหยุดตามประกาศบริษัท | |

> **ประเด็นที่ต้องถาม PM ก่อนนำเข้าปฏิทิน:** อีเมลกลางในเอกสารจริงคือ `itsupport@aidctech.com.la` ซึ่งเป็นโดเมน **`.la` (สปป.ลาว)** และนโยบาย PDPA ในเอกสาร SOP ข้อ 3.8 เขียนว่า "ตามกฎหมาย...**ในประเทศที่บริษัทดำเนินธุรกิจ**" → **[ต้องยืนยันกับ PM] ปฏิทินวันหยุดที่ต้องใช้เป็นวันหยุดราชการไทยหรือ สปป.ลาว** สมมติฐานเดิมของทีม (`02-data-model.md` §6.9 "วันหยุดนักขัตฤกษ์ไทย") อาจผิด

### 3.5 `maintenance_window` (ตารางใหม่ — ดูโครงสร้างในหัวข้อ 6)

| company_id | ประเภท | recurrence | start_time | end_time | notice_lead_business_days |
|---|---|---|---|---|---|
| 5 | ปิดปรับปรุงตามแผน | ทุกวันเสาร์ | `20:00` | `24:00` | **3** |

---

## 4. กฎการนับเวลา SLA ที่ระบบต้องบังคับใช้ (แทน `04-rbac-sla.md` §4.1 เดิม)

| # | กฎตามเอกสารจริง | การบังคับใช้ในระบบ | ฟิลด์/ตารางที่เกี่ยวข้อง |
|---|---|---|---|
| C-01 | P1 นับต่อเนื่อง 24×7 | ถ้า `sla_target.clock_mode = 'calendar_24x7'` → `due = start + timedelta(minutes=n)` ไม่เรียก `add_business_minutes()` | `sla_target.clock_mode` |
| C-02 | P2–P4 นับเฉพาะเวลาทำการ | ใช้ `add_business_minutes()` ตามปฏิทินของ `ticket.company_id` | `business_hours`, `holiday` |
| C-03 | หยุดนับเมื่อรอผู้แจ้ง | สถานะ `pending_user` + `pending_reason='user'` — บังคับมีคอมเมนต์สาธารณะระบุสิ่งที่รอ | `ticket.pending_reason`, `pending_started_at` |
| C-04 | หยุดนับเมื่อรออะไหล่/ผู้ให้บริการภายนอก **ที่แจ้งผู้รับบริการแล้ว** | `pending_reason='vendor'` — ระบบ**ไม่ยอมให้เข้าสถานะนี้**จนกว่าจะมีคอมเมนต์สาธารณะแจ้งผู้แจ้ง (ตั้ง `pending_notified_at`) | `ticket.pending_notified_at` **(ใหม่)** |
| C-05 | หยุดนับระหว่างรออนุมัติ | `pending_reason='approval'` — ตั้งอัตโนมัติเมื่อมี `approval_request` สถานะ `pending` | `approval_request` (ดู `06-sop-workflow-mapping.md`) |
| C-06 | **Workaround หยุดนับ resolution ของ Incident** | เมื่อ agent กด "ให้ทางเลี่ยงชั่วคราวแล้ว" → ตั้ง `workaround_at`; `sla_status()` ใช้ `min(now, workaround_at)` ในการวัด resolution; ระบบบังคับให้เปิด `problem` ผูกกับ ticket | `ticket.workaround_at`, `ticket.workaround_note`, `ticket.problem_id` |
| C-07 | เปลี่ยน priority → **นับตามระดับใหม่ตั้งแต่เวลาที่ปรับ** | `response_due_at`/`resolution_due_at` = `add_business_minutes(priority_changed_at, target_ใหม่)` — **ไม่ใช่จาก `created_at`**; ต้องบันทึกเหตุผลลง `ticket_status_history.reason` (บังคับ) | `ticket.priority_changed_at` **(ใหม่)** |
| C-08 | ผู้แจ้งไม่ตอบ 3 วันทำการ หลังติดตาม 2 ครั้ง → ปิดได้ | งาน `followup_pending` ส่งติดตามครั้งที่ 1 และ 2 (ห่างกัน 1 วันทำการ) แล้วจึงเริ่มนับ 3 วันทำการ; `auto_close_unresponsive` ปิดพร้อมคอมเมนต์ระบบและอีเมลแจ้ง | `ticket.followup_count`, `ticket.last_followup_at` **(ใหม่)** |
| C-09 | ผู้แจ้งยืนยันผลภายใน 3 วันทำการ | `resolved` ครบ 3 วันทำการ → `closed` อัตโนมัติ + ส่งแบบสำรวจ CSAT (คงเดิม) | `ticket.closed_at`, `closed_by = NULL` |
| C-10 | ข้อยกเว้น SLA (ปิดปรับปรุงตามแผน, force majeure, ผู้ให้บริการภายนอก, ผู้ใช้ติดตั้งเอง, รอผู้แจ้ง/อนุมัติ, เร่งด่วนพิเศษที่ตกลงเวลาใหม่) | เพิ่ม `ticket.sla_exclusion_code` **(ใหม่)** `varchar(30)` + `sla_exclusion_note` — ticket ที่มีค่านี้ถูกตัดออกจากตัวหารของ KPI SLA Compliance และไม่ตั้งธง breach | `ticket.sla_exclusion_code` **(ใหม่)** |
| C-11 | รายงานสถานะตามรอบ | ตั้ง `next_status_report_due_at` เมื่อสร้าง/เปลี่ยน priority; ทุกครั้งที่ agent คอมเมนต์สาธารณะ → เลื่อนรอบถัดไป; งาน `status_report_reminder` เตือนเมื่อเลยกำหนด | `ticket.next_status_report_due_at` **(ใหม่)**, `sla_target.status_report_interval_minutes` **(ใหม่)** |

---

## 5. Escalation — แปลงเป็นกฎที่ระบบบังคับใช้

### 5.1 บทบาทที่เอกสารจริงอ้างถึงแต่ระบบยังไม่มี

RBAC ปัจจุบันมี `end_user` / `agent` / `company_admin` / `manager_viewer` / `super_admin` แต่เอกสารจริงอ้าง **Head of IT**, **CEO**, **Incident Commander**, **DPO**, **System Owner**, **Tier 1/2/3** ซึ่งเป็น**ตำแหน่งในองค์กร ไม่ใช่ role ของระบบ** → **ไม่ควรเพิ่มเป็น role ใหม่** (จะทำให้ permission matrix บวมโดยไม่จำเป็น) แต่ให้เพิ่มตารางผูกคนกับตำแหน่ง:

**ตารางใหม่ `escalation_contact`**

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `id` | bigserial | N | auto | PK |
| `company_id` | bigint | Y | null | null = ระดับกลุ่ม |
| `contact_key` | varchar(30) | N | — | `head_of_it` / `ceo` / `dpo` / `incident_manager` / `tier2_group` / `tier3_group` |
| `user_id` | bigint | N | — | FK → `app_user` |
| `is_primary` | boolean | N | true | รองรับผู้รับสำรอง |
| `is_active` | boolean | N | true | |

UNIQUE (`company_id`, `contact_key`, `user_id`)

**ฟิลด์ใหม่บน `ticket`:** `support_tier` `smallint` (1/2/3, default 1), `tier_changed_at` `timestamptz`, `is_major_incident` `boolean` (default false), `incident_commander_id` `bigint`

### 5.2 กฎ Escalation ที่ระบบต้องบังคับใช้

| # | ทริกเกอร์ | เงื่อนไข (ตามเอกสารจริง) | การกระทำของระบบ | ผู้รับแจ้ง |
|---|---|---|---|---|
| **ES-01** | สร้าง/ยกระดับเป็น P1 | เหตุ P1 ทุกกรณี **ทันที** (SLA 6.2) | ตั้ง `is_major_incident=true`, สร้าง notification ทันที **นอกเวลาทำการก็ส่ง**, บันทึกใน `ticket_status_history` | `head_of_it` + agent ทุกคนในขอบเขตบริษัท + ทีม On-call |
| **ES-02** | P1 เกินกำหนด | P1 **เกิน 4 ชั่วโมง (ปฏิทิน)** ยังไม่คืนบริการ (SLA 6.2) | ยกระดับสู่ผู้บริหาร + ตั้งธง `is_resolution_breached` | `ceo` + `head_of_it` |
| **ES-03** | เหตุการณ์ความปลอดภัย / ข้อมูลรั่วไหล | `ticket.is_security_incident = true` (SLA 6.2 / SOP-10 ข้อ 2) | แจ้ง **ภายใน 30 นาที** ตาม SOP-10; จำกัดการมองเห็น ticket; เริ่มนับนาฬิกา 72 ชม.เพื่อแจ้งหน่วยงานกำกับ | `head_of_it` + `ceo` + `dpo` |
| **ES-04** | Tier 1 แก้ไม่ได้ | ticket อยู่ที่ `support_tier = 1` เกิน **2 ชั่วโมงทำการ** นับจาก `created_at` และยังไม่ `resolved` (SLA 6.1 / SOP 5.3) | ตั้งธง "ต้องยกระดับ Tier 2" บนหน้ารายการ + แจ้งเตือน (ไม่เปลี่ยน tier อัตโนมัติ — agent ต้องยืนยันพร้อมสรุปสิ่งที่ตรวจสอบแล้ว ตาม SOP-01 ข้อ 5) | `tier2_group` + ผู้รับผิดชอบปัจจุบัน + `company_admin` |
| **ES-05** | ยกระดับสู่ Tier 3 | Tier 2 แก้ไม่ได้ หรืออยู่ในความรับผิดชอบของ Vendor (SLA 6.1) | ตั้ง `support_tier=3`, บังคับกรอก `vendor_ref` **(ใหม่)**; เปิดทางให้ตั้ง `pending_reason='vendor'` | `tier3_group` + `head_of_it` |
| **ES-06** | เกิน SLA (ทุกระดับ) | "Ticket ใดใช้เวลาเกิน SLA แล้ว" (SLA 6.2) | แจ้งเตือนทันทีเมื่อ `scan_sla` ตั้ง `is_response_breached` หรือ `is_resolution_breached` | `head_of_it` + ผู้รับผิดชอบ + `company_admin` |
| **ES-07** | ผู้รับบริการขอทบทวนการจัดการ | ผู้แจ้งกดปุ่ม "ขอทบทวนการจัดการ" พร้อมเหตุผล (SLA 6.2, 6 ย่อหน้าท้าย) | สร้าง flag บน ticket + แจ้งเตือน; **ห้ามระบบตีความว่าเป็นการร้องเรียน** — แสดงข้อความตามเอกสาร "เป็นกลไกปกติของการบริหารงานบริการ" | `head_of_it` |
| **ES-08** | ผู้แจ้งขอทบทวน priority | ผู้แจ้งขอเปลี่ยนระดับพร้อม "เหตุผลทางธุรกิจ" (SLA 4) | สร้างคำขอทบทวน ไม่เปลี่ยน priority ทันที; agent อนุมัติ/ปฏิเสธพร้อมเหตุผล | ผู้รับผิดชอบ + `company_admin` |
| **ES-09** | ถึงรอบรายงานสถานะ | P1 ครบ 1 ชม. / P2 ครบ 4 ชม.ทำการ โดยยังไม่มีคอมเมนต์สาธารณะใหม่ (SLA 5.1) | เตือนผู้รับผิดชอบให้รายงานความคืบหน้า; P1 เตือนซ้ำทุกชั่วโมงจนปิด | ผู้รับผิดชอบ (+ `incident_manager` สำหรับ P1) |
| **ES-10** | RCA ค้าง | ticket P1 ปิดแล้วเกิน **5 วันทำการ** โดยยังไม่มี `problem.rca_submitted_at` (SLA 7.2 / SOP-02 ข้อ 6) | เตือนเจ้าของ Problem และรายงานในสรุปรายเดือน | เจ้าของ Problem + `head_of_it` |
| **ES-11** | P1 ซ้ำสาเหตุเดิม | มี P1 ที่ `problem_id` เดียวกันเกิดซ้ำ **ภายใน 90 วัน** (SLA 7.3) | ตั้งธง "ต้องทบทวน RCA เดิมทันที" บน Problem + นับเข้า KPI Repeat Incident | `head_of_it` + `ceo` |
| **ES-12** | เตือนล่วงหน้า 75% *(ส่วนขยายของทีม ไม่มีในเอกสารจริง)* | ใช้เวลาไป ≥ `escalation_percent` ของ resolution target | แจ้งเตือนครั้งเดียวต่อ ticket (คงกลไกเดิม) | ผู้รับผิดชอบ |

**กติกากันการรบกวนเกินจำเป็น (ปรับจากของเดิม):**
- แจ้งครั้งเดียวต่อ ticket ต่อกฎ ยกเว้น **ES-02, ES-09 (P1)** ที่แจ้งซ้ำทุกชั่วโมง และ ES-06 ที่แจ้งซ้ำได้วันละครั้ง
- **ไม่ส่ง escalation นอกเวลาทำการ ยกเว้น P1 และ ES-03 (เหตุความปลอดภัย)** — สอดคล้องกับ SLA 3.1 ที่ On-call ครอบคลุมเฉพาะ P1
- ระงับการแจ้งเตือนขณะอยู่สถานะ `pending_user` ทุก `pending_reason`

**ตารางใหม่ `sla_escalation_rule`** (ทำให้ตั้งค่าได้แทน hard-code — จำเป็นเพราะเอกสาร SLA ทบทวนทุก 12 เดือน)

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `id` | bigserial | N | auto | PK |
| `company_id` | bigint | Y | null | null = ใช้ทั้งกลุ่ม |
| `code` | varchar(20) | N | — | `ES-01` … `ES-12` |
| `trigger_type` | varchar(30) | N | — | `on_priority`, `time_in_tier`, `after_due`, `interval_report`, `manual_request` |
| `priority` | varchar(10) | Y | null | จำกัดเฉพาะระดับ |
| `threshold_minutes` | int | Y | null | เกณฑ์เวลา |
| `threshold_clock_mode` | varchar(20) | N | `'business_hours'` | ตีความ `threshold_minutes` |
| `notify_contact_keys` | varchar(200) | N | — | รายการ `contact_key` คั่นด้วย `,` |
| `notify_roles` | varchar(200) | Y | null | role ในระบบที่ต้องแจ้งเพิ่ม |
| `repeat_interval_minutes` | int | Y | null | null = แจ้งครั้งเดียว |
| `is_active` | boolean | N | true | |

---

## 6. Availability Target และ Service Tier

### 6.1 เป้าหมายตามเอกสารจริง (SLA 5.2)

| service_tier | เป้าหมาย Uptime | Downtime สูงสุด/เดือน | ตัวอย่างระบบ |
|---|---|---|---|
| `critical` | **≥ 99.9%** | ประมาณ **43 นาที** | ERP, เครือข่ายหลัก, ระบบยืนยันตัวตน |
| `high` | **≥ 99.5%** | ประมาณ **3.6 ชั่วโมง** | อีเมล, ระบบประชุมออนไลน์, File Server, Wi-Fi, VPN |
| `standard` | **≥ 99.0%** | ประมาณ **7.2 ชั่วโมง** | ระบบสนับสนุนภายในอื่น ๆ |

### 6.2 Service Tier ของแต่ละกลุ่มบริการ (SLA 2 — seed ตาราง `service`)

| service_group | ตัวอย่างบริการ/ระบบ | service_tier | is_24x7 |
|---|---|---|---|
| `core_business` — ระบบงานหลักทางธุรกิจ | ระบบ ERP, ระบบงานขายและบริการลูกค้า, ฐานข้อมูลหลัก | `critical` | true |
| `infrastructure` — โครงสร้างพื้นฐานกลาง | เครือข่ายสำนักงาน (LAN), อินเทอร์เน็ตองค์กร, ระบบยืนยันตัวตน | `critical` | true |
| `communication` — ระบบสื่อสารองค์กร | อีเมล, ระบบประชุมออนไลน์, แชทองค์กร, Wi-Fi สำนักงาน, VPN | `high` | false |
| `file_storage` — พื้นที่จัดเก็บไฟล์ส่วนกลาง | File Server / Cloud Storage | `high` | false |
| `endpoint` — อุปกรณ์ผู้ใช้ปลายทาง | คอมพิวเตอร์, โน้ตบุ๊ก, เครื่องพิมพ์, อุปกรณ์ต่อพ่วง | `standard` | false |
| `service_request` — คำขอบริการทั่วไป | ขอสิทธิ์, ติดตั้งซอฟต์แวร์, ขอ/ยืมอุปกรณ์, ขอคำปรึกษา | `standard` | false |

> **[ต้องยืนยันกับ PM]** เอกสารจริงบอกว่า "รายการระบบโดยละเอียดและเจ้าของระบบ (System Owner) ให้อ้างอิง**ทะเบียนระบบงาน**ที่ฝ่ายไอทีดูแล" — ต้องขอทะเบียนนั้นมานำเข้าตาราง `service` (ชื่อระบบจริง + เจ้าของระบบ)

### 6.3 ตารางที่ต้องเพิ่มใน data model

**`service` — ทะเบียนระบบงาน/บริการ**

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `id` | bigserial | N | auto | PK |
| `company_id` | bigint | Y | null | null = บริการร่วมทั้งกลุ่ม |
| `code` | varchar(40) | N | — | UNIQUE ต่อบริษัท |
| `name_th` | varchar(150) | N | — | ชื่อระบบ |
| `service_group` | varchar(30) | N | — | ตามตาราง 6.2 |
| `service_tier` | varchar(20) | N | `'standard'` | `critical` / `high` / `standard` |
| `owner_user_id` | bigint | Y | null | System Owner (ใช้ในขั้นอนุมัติ SOP-03) |
| `is_24x7` | boolean | N | false | true = เวลาที่ตกลงให้บริการ 24×7 (ใช้เป็นตัวหารของ Uptime) |
| `is_active` | boolean | N | true | |

**`service_tier_target` — เป้าหมายต่อระดับ (ตั้งค่าได้ ไม่ hard-code)**

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `tier_code` | varchar(20) | N | — | PK: `critical` / `high` / `standard` |
| `uptime_percent` | numeric(5,3) | N | — | `99.900` / `99.500` / `99.000` |
| `max_downtime_minutes_month` | int | N | — | `43` / `216` / `432` |

**`service_outage` — บันทึกเหตุขัดข้อง (ตัวตั้งของสูตร Uptime)**

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `id` | bigserial | N | auto | PK |
| `service_id` | bigint | N | — | FK → `service` |
| `ticket_id` | bigint | Y | null | ticket ที่เกี่ยวข้อง (ปกติคือ P1/P2) |
| `started_at` / `ended_at` | timestamptz | N / Y | — | `ended_at` null = ยังขัดข้องอยู่ |
| `is_planned` | boolean | N | false | true = อยู่ใน `maintenance_window` → **ไม่นับเป็น Downtime** (SLA 5.2, 9) |
| `maintenance_window_id` | bigint | Y | null | FK |
| `cause` | varchar(500) | Y | null | |
| `recorded_by` | bigint | Y | null | null = ระบบ Monitoring |

**`maintenance_window` — ช่วงปิดปรับปรุงตามแผน**

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `id` | bigserial | N | auto | PK |
| `company_id` | bigint | Y | null | |
| `service_id` | bigint | Y | null | null = กระทบหลายระบบ |
| `planned_start` / `planned_end` | timestamptz | N | — | มาตรฐาน: เสาร์ 20:00–24:00 |
| `notified_at` | timestamptz | Y | null | ระบบบล็อกการยืนยันหน้าต่างถ้าแจ้งล่วงหน้า < **3 วันทำการ** |
| `description` | varchar(500) | Y | null | |
| `created_by` | bigint | N | — | |

**ฟิลด์ใหม่บน `ticket`:** `service_id` `bigint` (FK → `service`, nullable) — จำเป็นต่อ KPI Uptime และ Repeat Incident

> **เฟส:** ตาราง `service` / `service_tier_target` / `maintenance_window` และการบันทึก outage **ด้วยมือ** = MVP (ใช้แรงงานน้อย ได้ KPI ครบ); การเชื่อมระบบ Monitoring อัตโนมัติ = **เฟส 2** (SLA 5.2 ระบุว่าใช้ข้อมูลจาก "ระบบ Monitoring กลาง" ซึ่งอยู่นอกขอบเขต `01-srs.md` §1.3)

---

## 7. Service Request Catalog และข้อเสนอ `ticket_type`

### 7.1 ข้อเสนอ: **แยก `ticket_type` = `incident` / `service_request` — เห็นควรทำตั้งแต่ MVP**

| เหตุผล | รายละเอียด |
|---|---|
| 1. เอกสารควบคุมแยกไว้ชัดเจน | SOP-01 ข้อ 2 บังคับ "จำแนกประเภทงาน: **เหตุขัดข้อง (Incident) หรือคำขอบริการ (Service Request)**" — ถ้าระบบไม่มีฟิลด์นี้ ก็ปฏิบัติตาม SOP ไม่ได้ |
| 2. เป้าหมายเวลาคนละระบบกัน | Incident ใช้ตาราง SLA ตาม priority (SLA 5.1) ส่วน Service Request ใช้เป้าหมายรายรายการ (SLA 5.3) — **รีเซ็ตรหัสผ่าน 30 นาทีทำการ vs P4 5 วันทำการ ต่างกัน 90 เท่า** ใช้ `sla_target` ชุดเดียวแทนไม่ได้ |
| 3. เงื่อนไขเริ่มนับเวลาต่างกัน | SLA 5.3 กำหนดจุดเริ่มนับต่างกัน 4 แบบ (หลังยืนยันตัวตน / หลังได้รับคำขอ / **หลังอนุมัติครบถ้วน** / หลังอนุมัติงบประมาณ) ขณะที่ Incident เริ่มนับที่ `created_at` เสมอ |
| 4. บางคำขอเป็น "เป้าหมายเชิงวันที่" ไม่ใช่ระยะเวลา | Onboarding = "พร้อมก่อนวันเริ่มงาน", Offboarding = "ภายในวันสุดท้ายของการทำงาน" — คำนวณจาก `resolution_minutes` ไม่ได้เลย |
| 5. KPI แยกกัน | FCR และ Repeat Incident เป็นตัวชี้วัดของ **Incident เท่านั้น**; ถ้าไม่แยกประเภท ตัวหารจะปนคำขอบริการ ทำให้ FCR ≥70% ไม่มีความหมาย |
| 6. Workaround/Problem ใช้กับ Incident เท่านั้น | กฎ C-06 และ Problem Management ไม่มีความหมายกับคำขอบริการ |
| 7. ต้นทุนต่ำ | เพิ่ม 1 คอลัมน์ + 1 ตาราง catalog — ไม่กระทบ state machine, RBAC หรือ scoping เดิม |

**ฟิลด์ใหม่บน `ticket`:**

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `ticket_type` | varchar(20) | N | `'incident'` | `incident` / `service_request` (บังคับเลือกโดย Tier 1 ตาม SOP-01 ข้อ 2) |
| `catalog_item_id` | bigint | Y | null | FK → `service_catalog_item` (บังคับเมื่อ `ticket_type='service_request'`) |
| `sla_clock_started_at` | timestamptz | Y | null | จุดเริ่มนับจริงตาม `clock_start_event` (ต่างจาก `created_at`) |
| `target_date` | date | Y | null | ใช้กับคำขอแบบเชิงวันที่ (onboarding/offboarding) |

**ตารางใหม่ `service_catalog_item`**

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `id` | bigserial | N | auto | PK |
| `company_id` | bigint | Y | null | null = ใช้ร่วมทั้งกลุ่ม |
| `code` | varchar(40) | N | — | UNIQUE |
| `name_th` | varchar(150) | N | — | |
| `category_id` | bigint | Y | null | FK → `ticket_category` |
| `default_priority` | varchar(10) | N | `'P4'` | |
| `target_mode` | varchar(30) | N | `'duration'` | `duration` = ใช้ `target_minutes`; `before_date` / `by_date` = ใช้ `ticket.target_date` |
| `target_minutes` | int | Y | null | **นาทีทำการ** |
| `clock_start_event` | varchar(30) | N | `'on_create'` | `on_create` / `after_identity_verified` / `after_approval` / `after_budget_approval` |
| `lead_time_days` | int | Y | null | เวลาแจ้งล่วงหน้าขั้นต่ำที่ผู้ขอต้องให้ |
| `lead_time_unit` | varchar(10) | Y | null | `calendar` / `business` |
| `requires_approval` | boolean | N | false | |
| `checklist_template_id` | bigint | Y | null | FK → `checklist_template` |
| `is_active` | boolean | N | true | |

### 7.2 Seed `service_catalog_item` ตาม SLA 5.3

| code | name_th | target_mode | target_minutes | เทียบเป็น | clock_start_event | lead_time | requires_approval | ที่มา |
|---|---|---|---|---|---|---|---|---|
| `SR-PWD-RESET` | รีเซ็ตรหัสผ่าน / ปลดล็อกบัญชี | `duration` | **30** | 30 นาทีทำการ | `after_identity_verified` | — | false | SLA 5.3 |
| `SR-SW-INSTALL` | ติดตั้งซอฟต์แวร์ในบัญชีมาตรฐาน | `duration` | **1080** | 2 วันทำการ | `on_create` | — | false (จริงเมื่ออยู่ใน Approved Software List) | SLA 5.3 / SOP-06 |
| `SR-SW-NONSTD` | ขอซอฟต์แวร์นอกบัญชีมาตรฐาน | `duration` | **[ต้องยืนยันกับ PM]** | ไม่ระบุในเอกสาร | `after_approval` | — | **true** (Tier 2 ประเมิน → Head of IT อนุมัติ) | SOP-06 ข้อ 3 |
| `SR-ACCESS` | ขอสิทธิ์เข้าถึงระบบ | `duration` | **540** | 1 วันทำการ | **`after_approval`** ("หลังการอนุมัติครบถ้วน") | — | **true** (หัวหน้าหน่วยงาน → System Owner) | SLA 5.3 / SOP-03 |
| `SR-ONBOARD` | เตรียมระบบพนักงานใหม่ (Onboarding) | `before_date` | — | **พร้อมก่อนวันเริ่มงาน** (ทดสอบเสร็จก่อน 1 วัน) | `on_create` | **≥ 7 วันปฏิทิน** (แนะนำ 14) | **[ต้องยืนยันกับ PM]** (AIDC-IT-WF-001 มีตารางอำนาจอนุมัติ ซึ่งเรายังไม่ได้รับ) | SLA 5.3 / SOP-04 |
| `SR-OFFBOARD` | เพิกถอนระบบพนักงานพ้นสภาพ | `by_date` | — | **ภายในวันสุดท้ายของการทำงาน** | `on_create` | **≥ 3 วันทำการ** | false | SLA 5.3 / SOP-05 |
| `SR-EQUIP` | จัดหาอุปกรณ์ใหม่ตามมาตรฐาน | `duration` | **5400** | 10 วันทำการ | **`after_budget_approval`** | — | **true** (อนุมัติงบประมาณ) | SLA 5.3 |
| `SR-RESTORE` | ขอกู้คืนข้อมูลจาก Backup | `duration` | **[ต้องยืนยันกับ PM]** | ไม่ระบุในเอกสาร | `after_approval` | — | true (หัวหน้าหน่วยงาน กรณีข้อมูลส่วนกลาง) | SOP-07 ข้อ 3 |
| `SR-POLICY-EXC` | ขอยกเว้นนโยบาย (Policy Exception) | `duration` | **[ต้องยืนยันกับ PM]** | ไม่ระบุในเอกสาร | `after_approval` | — | **true** (Head of IT) + ทบทวนทุก 6 เดือน | SOP 3.10 |
| `SR-ADVISORY` | ขอคำปรึกษา / สอบถามการใช้งาน | `duration` | ใช้ค่า P4 = 2700 | 5 วันทำการ | `on_create` | — | false | SLA 2.1, 4 (P4) |

> **กติกาการเลือกเป้าหมาย:** ถ้า `ticket_type='service_request'` และมี `catalog_item_id` → ใช้ `service_catalog_item.target_minutes`; ถ้าไม่มีรายการที่ตรง → fallback ไป `sla_target` ของ priority (P4) — และ **`response_due_at` ยังคงใช้ `sla_target` ตาม priority เสมอ** เพราะ SLA 5.3 กำหนดเฉพาะเวลาดำเนินการ ไม่ได้ยกเว้นเวลาตอบรับ

---

## 8. KPI ที่ระบบต้องคำนวณได้

| # | KPI | เป้าหมาย | ความถี่ | สูตรคำนวณ | ข้อมูลที่ต้องเก็บเพิ่ม |
|---|---|---|---|---|---|
| KPI-1 | **SLA Compliance** | **≥ 95%** | รายเดือน | `(จำนวน ticket ที่ปิดในเดือนและ resolved_at ≤ resolution_due_at) ÷ (จำนวน ticket ที่ปิดทั้งหมดในเดือน) × 100` — ตัดออกจากตัวหารเมื่อ `sla_exclusion_code IS NOT NULL` (SLA ภาคผนวก ก.2 + ข้อ 9) | `ticket.sla_exclusion_code` **(ใหม่)** |
| KPI-2 | **First Response Time (FRT)** | **≤ 30 นาที** (ค่าเฉลี่ย) | รายเดือน | `AVG(elapsed(created_at → first_response_at))` โดยคำนวณเป็น**นาทีทำการ**สำหรับ P2–P4 และ**นาทีปฏิทิน**สำหรับ P1 | ไม่มี — มี `first_response_at` แล้ว ต้องเพิ่มฟังก์ชัน `business_minutes_between()` ใน `11-sla-engine.md` **[ต้องยืนยันกับ PM]** ว่ารายงานค่าเฉลี่ยรวมทุก priority หรือแยกราย priority (การรวม P1 ที่นับปฏิทินกับ P2–P4 ที่นับเวลาทำการเข้าด้วยกันทำให้ตัวเลขไม่มีความหมายเชิงสถิติ) |
| KPI-3 | **First Contact Resolution (FCR)** | **≥ 70%** | รายเดือน | `(ticket ที่ ticket_type='incident' และ resolved โดย support_tier=1 และไม่เคยเปลี่ยน assignee และไม่เคยเข้า pending_user และ reopen_count=0) ÷ (incident ที่ปิดทั้งหมด) × 100` | `ticket.support_tier` **(ใหม่)**, `ticket.assignee_change_count` **(ใหม่)** `int` (นับจาก `ticket_status_history` ได้แต่ช้า — เก็บเป็น counter ดีกว่า), `ticket.ticket_type` **(ใหม่)** |
| KPI-4 | **CSAT** | **≥ 4.2 / 5.0** | รายไตรมาส | `AVG(satisfaction_score)` เฉพาะที่ตอบกลับ + **รายงาน Response Rate = (จำนวนที่ตอบ ÷ จำนวนที่ส่ง) × 100** (SLA ภาคผนวก ก.3 บังคับให้รายงานคู่กัน) | `ticket.csat_sent_at` **(ใหม่)**, `ticket.csat_responded_at` **(ใหม่)** — ปัจจุบันมีแต่ `satisfaction_score` จึงคำนวณ Response Rate ไม่ได้ |
| KPI-5 | **Aged Backlog** | **≤ 5% ของทั้งหมด** | **รายสัปดาห์** | `(ticket ที่ยังเปิดอยู่และ now() > resolution_due_at) ÷ (ticket ที่ยังเปิดอยู่ทั้งหมด) × 100` | ไม่มี — ใช้ index `idx_ticket_due` ที่มีอยู่; ต้องเพิ่ม**รอบรายงานรายสัปดาห์**ใน `04-rbac-sla.md` §5 |
| KPI-6 | **Uptime ระบบ Critical** | **≥ 99.9%/เดือน** | รายเดือน | `[(เวลาที่ตกลงให้บริการ − Σ downtime ที่ไม่ได้วางแผน) ÷ เวลาที่ตกลงให้บริการ] × 100` โดย "เวลาที่ตกลงให้บริการ" = 43,200 นาที/เดือน สำหรับ `service.is_24x7=true` (SLA ภาคผนวก ก.1) | ตาราง `service`, `service_outage`, `maintenance_window` **(ใหม่ทั้งหมด)** |
| KPI-7 | **Repeat Incident** | **≤ 10%** | รายไตรมาส | `(incident ที่ปิดแล้วและมี problem_id ซ้ำกับ incident ก่อนหน้าภายใน 90 วัน) ÷ (incident ที่ปิดทั้งหมดในไตรมาส) × 100` | ตาราง `problem` **(ใหม่)** + `ticket.problem_id` **(ใหม่)**; `problem.root_cause_code`, `rca_due_at`, `rca_submitted_at` |
| KPI-8 | **Self-Service Deflection** *(SOP 5.4)* | **≥ 20% ภายใน 12 เดือน** | รายไตรมาส | `(จำนวนครั้งที่ผู้ใช้เปิดบทความ KB แล้วไม่สร้าง ticket ภายใน session) ÷ (KB view + ticket ที่สร้าง) × 100` | ตาราง `kb_view_log` **(ใหม่)** — **เสนอเลื่อนไปเฟส 2** เพราะต้องติดตาม session ผู้ใช้ ซึ่งเกินขอบเขต MVP |

**ตารางใหม่ `problem`** (จำเป็นต่อ KPI-7, กฎ workaround C-06 และ RCA)

| field | type | null | default | คำอธิบาย |
|---|---|---|---|---|
| `id` | bigserial | N | auto | PK |
| `company_id` | bigint | N | — | |
| `code` | varchar(30) | N | — | UNIQUE เช่น `PRB-202608-0007` |
| `title` | varchar(255) | N | — | |
| `service_id` | bigint | Y | null | FK → `service` |
| `root_cause_code` | varchar(40) | Y | null | ใช้จับ "สาเหตุเดิมซ้ำภายใน 90 วัน" |
| `root_cause_note` | text | Y | null | |
| `status` | varchar(20) | N | `'open'` | `open` / `rca_pending` / `fixed` / `closed` |
| `opened_at` | timestamptz | N | now() | |
| `rca_due_at` | timestamptz | Y | null | = `opened_at` + 5 วันทำการ สำหรับเหตุ P1 (SLA 7.2) |
| `rca_submitted_at` | timestamptz | Y | null | |
| `owner_id` | bigint | Y | null | |
| `closed_at` | timestamptz | Y | null | |

**รายงานที่ต้องเพิ่มตามเอกสารจริง (SLA 7.2):**

| รายงาน | เนื้อหา | ความถี่ / ผู้รับ |
|---|---|---|
| Service Performance Report | KPI-1…KPI-7 เทียบเป้าหมาย + จำนวน ticket + เหตุ P1/P2 และการแก้ไข | รายเดือน / ผู้บริหาร |
| Aged Backlog | รายการเกิน SLA + จำนวนวันค้าง | **รายสัปดาห์** |
| Service Review Meeting Pack | ปัญหาซ้ำ (จาก `problem`), แผนปรับปรุง | รายไตรมาส / หัวหน้าหน่วยงาน |
| รายงาน RCA | สาเหตุราก ผลกระทบ มาตรการป้องกัน | ภายใน 5 วันทำการหลังเหตุ P1 |
| Service Improvement Plan (SIP) | บังคับสร้างเมื่อ KPI เดือนใดต่ำกว่าเป้า; **ต่ำกว่าเป้า 2 เดือนติด → เสนอ CEO** (SLA 7.3) | ตามเหตุการณ์ |

---

## 9. ช่องทางรับแจ้ง (`channel`)

**เปลี่ยน `ticket.source` เดิม (`web`/`mobile_web`/`phone`/`email`/`line`) เป็น 2 ฟิลด์:**

| field | type | null | default | ค่าที่อนุญาต | ที่มา |
|---|---|---|---|---|---|
| `channel` **(ใหม่ — แทน `source`)** | varchar(20) | N | `'portal'` | `portal` / `email` / `phone` / `walk_in` | SLA 3.2 / SOP 2.3 (4 ช่องทางเท่านั้น) |
| `source_device` **(ใหม่)** | varchar(20) | Y | null | `web` / `mobile_web` | เก็บข้อมูลเชิงเทคนิคที่ทีมเคยใช้ ไม่ปนกับช่องทางตามเอกสาร |

| ค่า `channel` | ความหมาย | กติกาที่ระบบต้องบังคับ |
|---|---|---|
| `portal` | ระบบ Ticketing / Portal — **ช่องทางหลัก (แนะนำ)** | ค่าเริ่มต้นเมื่อผู้ใช้สร้างเอง |
| `email` | อีเมล **itsupport@aidctech.com.la** | ต้องมี email-to-ticket ingestion → สร้าง ticket อัตโนมัติ (SLA 3.2 "สร้าง Ticket อัตโนมัติ") **[ต้องยืนยันกับ PM]** ว่าใช้ mailbox เดียวสำหรับทั้ง 7 บริษัทหรือแยกกล่องต่อบริษัท |
| `phone` | IT Hotline — **เฉพาะเหตุเร่งด่วน P1/P2** | agent เป็นผู้สร้าง ticket ให้ (`created_by ≠ requester_id`); ระบบเตือนเมื่อเลือก `phone` แต่ priority เป็น P3/P4 |
| `walk_in` | Walk-in ที่ฝ่ายไอที | SOP-01 ข้อ 1 บังคับ "ลงทะเบียนเป็น Ticket ทุกครั้ง" — agent สร้างแทน |

**เป้าหมาย "รับสายภายใน 3 นาที":** เป็นตัวชี้วัดของระบบโทรศัพท์ ไม่ใช่ของ ticket → เสนอเก็บ `ticket.call_answered_at` **(ใหม่, nullable)** ให้ agent กรอกเมื่อสร้าง ticket จากสาย เพื่อรายงานได้แบบประมาณการ **[ต้องยืนยันกับ PM]** ว่าต้องการวัดจริงหรือไม่ (ถ้าต้องการวัดแม่นยำต้องเชื่อมระบบ PBX = เฟส 2)

> **LINE:** เอกสารควบคุมทั้งสองฉบับ **ไม่ระบุ LINE เป็นช่องทางรับแจ้ง** ขณะที่ `01-srs.md` (FR-41, R-01) และ `02-data-model.md` ออกแบบ LINE ไว้ → **[ต้องยืนยันกับ PM]**: LINE ยังคงใช้ได้ในฐานะ **ช่องทางแจ้งเตือนขาออก** (`notification_channel.channel = 'line'` — ไม่ขัดเอกสาร) แต่**ต้องไม่เป็นช่องทางรับแจ้ง** เพราะขัดหลัก "Single Point of Contact" และ "Everything is a Ticket" (SOP 2.1) — ถ้า PM ยืนยันให้รับแจ้งทาง LINE ได้ ต้องเสนอแก้เอกสาร SLA/SOP ผ่านกระบวนการหัวข้อ 10 ของ AIDC-IT-SLA-001 ก่อน

---

## 10. หมายเหตุขอบเขต — SLA ต่อบริษัท (per-company)

### 10.1 ข้อเท็จจริง

AIDC-IT-SLA-001 v1.1 ระบุคู่สัญญาไว้ชัดเจนว่าเป็นข้อตกลงระหว่าง "ฝ่ายเทคโนโลยีสารสนเทศ (ผู้ให้บริการ)" กับ "หน่วยงานภายใน**ของบริษัท เอไอดีซี เทค จำกัด** (ผู้รับบริการ)" และหมายเหตุท้ายเอกสารย้ำว่า "ค่าเป้าหมายทั้งหมดในเอกสารฉบับนี้เป็น**มาตรฐานเริ่มต้นของบริษัท เอไอดีซี เทค จำกัด**" — **ไม่มีข้อความใดที่ผูกพันอีก 6 บริษัทในเครือ**

### 10.2 ระบบควรออกแบบอย่างไร

โครงสร้างที่มีอยู่ (`sla_policy.company_id`, `business_hours.company_id`, `holiday.company_id` เป็น nullable) **รองรับ per-company อยู่แล้ว** สิ่งที่ต้องเปลี่ยนคือ**วิธี seed และวิธีอธิบายบน UI**:

| ประเด็น | แนวทางที่เสนอ |
|---|---|
| ผูก policy กับเอกสารควบคุม | เพิ่ม `doc_ref` / `doc_version` / `effective_from` (หัวข้อ 3.1) เพื่อให้หน้าตั้งค่า SLA แสดงได้ว่าค่าชุดนี้มาจากเอกสารฉบับใด — สำคัญมากเพราะ SLA ทบทวนทุก 12 เดือนและต้องเปลี่ยนเลขเวอร์ชันทุกครั้ง |
| ลำดับการค้นหา policy | `sla_policy` ของ `ticket.company_id` ที่ `is_default AND is_active` → ถ้าไม่มี ใช้แถว `company_id IS NULL` (คงตรรกะเดิม ไม่ต้องแก้โค้ด) |
| เก็บประวัติเมื่อ SLA เปลี่ยนเวอร์ชัน | **ห้าม UPDATE แถวเดิม** — ให้ตั้ง `effective_to` ของแถวเดิมแล้ว INSERT แถวใหม่ (`ticket.sla_policy_id` เป็นสแนปช็อตอยู่แล้ว จึงไม่กระทบ ticket เก่า — สอดคล้อง US-11 AC-1) |
| ปฏิทินต่างบริษัท | `business_hours` และ `holiday` ต้อง seed **ต่อบริษัท** ไม่ใช่แถว `NULL` แถวเดียว เพราะบริษัทก่อสร้าง/โลจิสติกส์มีแนวโน้มทำงานเสาร์หรือกะ |
| UI | หน้าตั้งค่า SLA ต้องมีตัวเลือกบริษัท และแสดงป้าย "สืบทอดจากมาตรฐานกลาง" เมื่อบริษัทนั้นไม่มี policy ของตน (`21-ui-ux-design.md`, `22-component-spec.md`) |

### 10.3 คำถามที่ต้องให้ PM ยืนยัน

| # | คำถาม | ค่าที่เอกสารนี้ใช้ไปก่อน | ผลกระทบถ้าคำตอบต่างออกไป |
|---|---|---|---|
| **Q-01** | **[ต้องยืนยันกับ PM]** อีก 6 บริษัท (AIDC HQ, Construction, COSI, Heavy Machine, Trading, Logistic) ใช้ SLA ชุดเดียวกับ AIDC Tech หรือไม่ | คัดลอกค่าของ AIDC Tech ไปเป็น policy กลาง (`company_id = NULL`) | ถ้าต่างกัน ต้อง seed `sla_target` เพิ่มอีก 6 ชุด + ทดสอบ SLA engine ต่อบริษัท (~2–3 วัน) |
| **Q-02** | **[ต้องยืนยันกับ PM]** อีก 6 บริษัทมีเวลาทำการเหมือน จ.–ศ. 08:30–17:30 หรือไม่ (โดยเฉพาะไซต์ก่อสร้างและคลังสินค้าที่อาจทำเสาร์/เข้ากะ) | เหมือนกันทั้งหมด | ถ้าต่างกันต้อง seed `business_hours` รายบริษัท และ due date ของ ticket ข้ามบริษัทจะคำนวณต่างกัน |
| **Q-03** | **[ต้องยืนยันกับ PM]** ปฏิทินวันหยุดบริษัทฉบับทางการ (และเป็นวันหยุดไทยหรือ สปป.ลาว — ดูข้อสังเกตโดเมน `.com.la` ในหัวข้อ 3.4) | ยังไม่มีข้อมูล | **บล็อกการ go-live** — ไม่มีปฏิทินวันหยุด = `resolution_due_at` ผิดทุก ticket ที่คร่อมวันหยุด |
| **Q-04** | **[ต้องยืนยันกับ PM]** มีทีม **On-call 24×7** จริงหรือไม่ในทุกบริษัท (P1 นับต่อเนื่อง 24 ชม. จะ breach แน่นอนถ้าไม่มีคนรับนอกเวลา) | มีตามเอกสาร | ถ้าไม่มี ต้องเสนอแก้ SLA (P1 นับเวลาทำการ) ผ่านกระบวนการทบทวนเอกสาร ไม่ใช่แก้ที่ระบบ |
| **Q-05** | **[ต้องยืนยันกับ PM]** ทะเบียนระบบงาน (System Registry) และรายชื่อ System Owner สำหรับ seed ตาราง `service` | ยังไม่มีข้อมูล | ไม่มี = คำนวณ KPI-6 (Uptime) ไม่ได้ และขั้นอนุมัติของ SOP-03 ไม่มีผู้อนุมัติ |
| **Q-06** | **[ต้องยืนยันกับ PM]** ขอเอกสาร **AIDC-IT-WF-001** (ขั้นตอนและตารางอำนาจอนุมัติ onboarding) ที่ SOP-04 อ้างถึง | ยังไม่มีข้อมูล | โครงสร้าง `approval_request` ออกแบบไว้รองรับแล้ว แต่ยัง seed ผู้อนุมัติไม่ได้ |
| **Q-07** | **[ต้องยืนยันกับ PM]** ใครเป็น `head_of_it` / `ceo` / `dpo` ในระบบ (ต้องมีบัญชีผู้ใช้จริงเพื่อรับ escalation) | ยังไม่มีข้อมูล | กฎ ES-01…ES-03, ES-06, ES-07, ES-10, ES-11 ส่งแจ้งเตือนไม่ได้ |
| **Q-08** | **[ต้องยืนยันกับ PM]** ค่าเป้าหมายเวลาที่เอกสารไม่ระบุ: `SR-SW-NONSTD`, `SR-RESTORE`, `SR-POLICY-EXC` | ยังไม่กำหนด | ใช้ค่า P4 (5 วันทำการ) ไปก่อน แต่ต้องบันทึกเป็นการตัดสินใจของ PM ไม่ใช่ของทีมพัฒนา |
| **Q-09** | **[ต้องยืนยันกับ PM]** MFA — SOP 3.2 บังคับ MFA กับ "ระบบงานหลักทุกระบบ" AIDC Helpdesk นับเป็นระบบงานหลักหรือไม่ | เอกสาร `01-srs.md` ไม่มี MFA | ถ้าใช่ ต้องเพิ่ม TOTP/MFA เข้า MVP (ประเมิน 3–5 วัน) — ดู `06-sop-workflow-mapping.md` §4 |

---

## 11. สรุปรายการแก้ไขที่ส่งต่อ Backend และ Frontend

### 11.1 Backend — ฟิลด์/ตารางที่ต้องเพิ่มหรือแก้

| ตาราง | การเปลี่ยนแปลง |
|---|---|
| `ticket` | **แก้ค่า** `priority` → `P1/P2/P3/P4`; **เปลี่ยนชื่อ** `source` → `channel` (`portal`/`email`/`phone`/`walk_in`); **เพิ่ม** `source_device`, `ticket_type`, `catalog_item_id`, `impact`, `urgency`, `service_id`, `problem_id`, `support_tier`, `tier_changed_at`, `is_major_incident`, `incident_commander_id`, `is_security_incident`, `vendor_ref`, `workaround_at`, `workaround_note`, `pending_reason`, `pending_notified_at`, `priority_changed_at`, `followup_count`, `last_followup_at`, `next_status_report_due_at`, `sla_clock_started_at`, `target_date`, `sla_exclusion_code`, `sla_exclusion_note`, `assignee_change_count`, `csat_sent_at`, `csat_responded_at`, `call_answered_at`, `priority_review_requested_at`, `priority_review_reason` |
| `sla_policy` | เพิ่ม `doc_ref`, `doc_version`, `effective_from`, `effective_to` |
| `sla_target` | แก้ค่า `priority`; เพิ่ม `clock_mode`, `status_report_interval_minutes` |
| `business_hours` | แก้ default เป็น `08:30` / `17:30`; seed เสาร์ = `is_working_day=false` |
| `ticket_category` | แก้ `default_priority` ทุกแถว seed (§6.4, §6.5) เป็น P1–P4 |
| **ตารางใหม่** | `service`, `service_tier_target`, `service_outage`, `maintenance_window`, `problem`, `service_catalog_item`, `escalation_contact`, `sla_escalation_rule` (+ `checklist_template`, `checklist_item`, `ticket_checklist`, `ticket_checklist_item`, `approval_request` — ดู `06-sop-workflow-mapping.md`) |
| `permission` | เพิ่ม `ticket.request_priority_review`, `ticket.declare_major_incident`, `ticket.set_workaround`, `service.manage`, `problem.manage`, `escalation.manage` |

### 11.2 ตรรกะที่ต้องแก้ใน `11-sla-engine.md`

| ส่วน | การเปลี่ยนแปลง |
|---|---|
| ปฏิทินเริ่มต้นใน `business_time.py` (§2) | จ.–ศ. 08:30–17:30, เสาร์–อาทิตย์ไม่ทำการ |
| `compute_due_at()` | รับ `clock_mode`; `calendar_24x7` ข้าม `add_business_minutes()` |
| `change_priority()` (§3.1) | คำนวณจาก `priority_changed_at` (= now) **ไม่ใช่** `created_at` |
| `sla_status()` | หยุดนาฬิกาที่ `workaround_at` สำหรับ incident |
| `scan_sla` (§5.2) | ประเมิน P1 นอกเวลาทำการด้วย; ข้าม ticket ที่มี `sla_exclusion_code` |
| งานใหม่ | `status_report_reminder` (ทุก 15 นาที), `followup_pending` (ทุกวัน 09:00), `auto_close_unresponsive` (ทุกวัน 06:00), `rca_due_reminder` (ทุกวัน 09:00) |
| งานที่ต้องเลิกใช้ | `auto_resolve_pending` แบบ 5 วันทำการ (ขัดกฎ C-08) |
| ชุดทดสอบ §4 | รันใหม่ทั้ง 23 ฟังก์ชัน — ค่าคาดหวังทุกตัวเปลี่ยนเพราะเสาร์ไม่ใช่วันทำการแล้ว |
| ประเด็น S-02 | **ปิดได้:** 1 วันทำการ = 540 นาทีทำการ (ยืนยันโดยเอกสารจริง) |

### 11.3 Frontend

| ส่วน | การเปลี่ยนแปลง |
|---|---|
| ฟอร์มสร้าง ticket | เพิ่มตัวเลือก **ผลกระทบ × ความเร่งด่วน** และแสดง priority ที่ระบบคำนวณให้ (อ่านอย่างเดียวสำหรับ end_user); เพิ่มตัวเลือก **ประเภทงาน** (incident / service request) สำหรับ agent |
| ป้าย priority | `P1 – วิกฤต` (แดง), `P2 – สูง` (ส้ม), `P3 – ปานกลาง` (เหลือง), `P4 – ต่ำ` (เขียว) |
| หน้ารายละเอียด ticket | ปุ่ม "ให้ทางเลี่ยงชั่วคราวแล้ว", "ยกระดับ Tier", "ประกาศเหตุขัดข้องร้ายแรง", "ขอทบทวนการจัดการ" (ฝั่งผู้แจ้ง), ตัวนับรอบรายงานสถานะ |
| หน้าตั้งค่า SLA | แสดง `doc_ref` + `doc_version` + `effective_from`; ตัวเลือกบริษัท; ป้าย "สืบทอดจากมาตรฐานกลาง" |
| Dashboard | เพิ่มการ์ด KPI-1…KPI-7 ตามเป้าหมายจริง; รายงาน Aged Backlog **รายสัปดาห์** |
