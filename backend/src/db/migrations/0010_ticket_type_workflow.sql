-- ============================================================================
-- 0010_ticket_type_workflow — แยกเครื่องสถานะของเหตุขัดข้องออกจากคำขอบริการ (เฟส 1)
--
-- เดิมทั้งสองชนิดเดินตารางสถานะเดียวกัน แล้วยัด "รออนุมัติ" กับ "รอผู้ขาย"
-- ลงไปใน pending_user + pending_reason ผลคือคำถามอย่าง "คำขอกี่ใบค้างรออนุมัติ"
-- ตอบด้วย WHERE ธรรมดาไม่ได้ และไม่มีอะไรกันเหตุขัดข้องไม่ให้ถูกตั้งเป็น "รออนุมัติ"
--
-- ⚠️ เขียนเป็น migration แบบเพิ่มอย่างเดียว (additive) ทั้งไฟล์
--    ฐานข้อมูล dev เป็น Neon ที่มีแอปรันอยู่จริง ไม่ใช่ฐานว่าง — ทุกคำสั่งที่นี่
--    ต้องรันซ้ำได้และต้องไม่ทำให้แถวเดิมหายหรือเปลี่ยนความหมาย
--
-- ลำดับสำคัญ: ย้ายข้อมูลให้เข้ารูปใหม่ **ก่อน** ค่อยเพิ่ม CHECK ที่บังคับรูปนั้น
--             ถ้าสลับกัน ALTER TABLE ... ADD CONSTRAINT จะล้มทันทีเพราะแถวเดิมยังผิดรูป
-- ============================================================================

-- ── 1. คอลัมน์ใหม่ ────────────────────────────────────────────────────────

-- หมวดหมู่ใช้แจ้งเรื่องชนิดไหนได้ — ค่าตั้งต้น 'both' ทำให้ไม่กระทบแถวเดิมเลย
ALTER TABLE "ticket_category"
  ADD COLUMN IF NOT EXISTS "ticket_type_scope" varchar(20) DEFAULT 'both' NOT NULL;
--> statement-breakpoint

-- หัวหน้าสายงาน — ใช้หาผู้อนุมัติขั้น line_manager อัตโนมัติ
ALTER TABLE "app_user"
  ADD COLUMN IF NOT EXISTS "manager_id" bigint;
--> statement-breakpoint

-- เรื่องที่เกี่ยวข้องกัน (incident ที่เครื่องพัง ↔ service_request ที่ขอเครื่องทดแทน)
ALTER TABLE "ticket"
  ADD COLUMN IF NOT EXISTS "related_ticket_id" bigint;
--> statement-breakpoint

-- ── 2. FK ของคอลัมน์ใหม่ ──────────────────────────────────────────────────
--
-- ทั้งสองตัวชี้กลับมาที่ตารางตัวเอง จึงต้องเพิ่มหลังสร้างคอลัมน์เสร็จ
-- DO $$ ... $$ เพราะ ADD CONSTRAINT ไม่มี IF NOT EXISTS ใน Postgres 16

DO $$ BEGIN
  ALTER TABLE "app_user"
    ADD CONSTRAINT "app_user_manager_id_app_user_id_fk"
    FOREIGN KEY ("manager_id") REFERENCES "public"."app_user"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- ON DELETE SET NULL ไม่ใช่ CASCADE — ลบเรื่องปลายทางต้องไม่ลากเรื่องต้นทางหายไปด้วย
DO $$ BEGIN
  ALTER TABLE "ticket"
    ADD CONSTRAINT "ticket_related_ticket_id_ticket_id_fk"
    FOREIGN KEY ("related_ticket_id") REFERENCES "public"."ticket"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- ── 3. ย้ายข้อมูลเดิมเข้าสถานะใหม่ ────────────────────────────────────────
--
-- ⚠️ ต้องทำก่อนเพิ่ม CHECK ck_ticket_status_matches_type ด้านล่าง
--
-- แถวที่ต้องย้ายคือแถวที่เคยใช้ pending_reason แทนสถานะ ซึ่งเป็นวิธีเดิมทั้งหมด
-- สามกลุ่ม แยกกันชัดเจนด้วย pending_reason ที่บังคับกรอกมาตลอด (CHECK เดิม G-06)

-- 3.1 รออนุมัติ → สถานะ pending_approval (เฉพาะคำขอบริการ)
UPDATE "ticket"
   SET "status" = 'pending_approval'
 WHERE "status" = 'pending_user'
   AND "pending_reason" = 'approval'
   AND "ticket_type" = 'service_request';
--> statement-breakpoint

-- 3.2 รอผู้ขาย → สถานะ pending_vendor (ได้ทั้งสองชนิด)
UPDATE "ticket"
   SET "status" = 'pending_vendor'
 WHERE "status" = 'pending_user'
   AND "pending_reason" = 'vendor';
--> statement-breakpoint

/*
 * 3.3 เศษที่เหลือ: เหตุขัดข้องที่ถูกตั้งเป็น "รออนุมัติ"
 *
 * เกิดได้จริงในข้อมูลเดิม เพราะไม่มีอะไรกันไว้ — เครื่องสถานะใหม่ไม่มีเส้นนี้
 * ปล่อยไว้ที่ pending_user ซึ่งเป็นสถานะที่ถูกต้องที่สุดเท่าที่บอกได้
 * (เรื่องค้างรอคนอื่นอยู่ และนาฬิกาหยุดเหมือนกัน) เก็บร่องรอยไว้ใน
 * pending_reason ตามเดิม ไม่ลบทิ้ง — ประวัติต้องอ่านย้อนหลังได้ว่าเคยรออะไร
 */

-- 3.4 คำขอบริการที่แก้เสร็จแล้ว → fulfilled (resolved เป็นของเหตุขัดข้องเท่านั้น)
--     resolved_at ไม่ต้องแตะ ทั้งสองสถานะใช้คอลัมน์เดียวกันเป็นเวลาที่งานเสร็จ
UPDATE "ticket"
   SET "status" = 'fulfilled'
 WHERE "status" = 'resolved'
   AND "ticket_type" = 'service_request';
--> statement-breakpoint

/*
 * 3.5 จุดเริ่มพักของแถวที่กำลังพักอยู่
 *
 * โค้ดใหม่ตั้ง pending_started_at ให้ทุกสถานะพัก รวม resolved / fulfilled
 * ซึ่งเดิมไม่เคยตั้ง — เติมย้อนหลังให้แถวที่ค้างอยู่ ณ ตอนนี้ มิฉะนั้นเรื่องที่
 * แก้เสร็จไปแล้วก่อน migration จะไม่มีจุดตั้งต้น แล้วเวลาที่พักจะคำนวณไม่ได้
 * ตอนผู้แจ้งเปิดคืน (ถอยไปใช้ resolved_at ได้ แต่ตั้งให้ตรงกันไปเลยชัดกว่า)
 */
UPDATE "ticket"
   SET "pending_started_at" = "resolved_at"
 WHERE "status" IN ('resolved', 'fulfilled')
   AND "pending_started_at" IS NULL
   AND "resolved_at" IS NOT NULL;
--> statement-breakpoint

-- ── 4. เลิกใช้ enum ของ pending_reason ────────────────────────────────────
--
-- 'vendor' กับ 'approval' เป็นสถานะจริงแล้ว เหลือความหมายเดียวคือ
-- "รออะไรจากผู้แจ้ง" ซึ่งสถานะ pending_user บอกไปแล้ว
--
-- ⚠️ ไม่ลบคอลัมน์ และไม่ล้างค่าเดิม — แถวเก่ายังต้องอ่านย้อนหลังได้ว่าเคยรออะไร
--    ถอดแค่ CHECK ที่บังคับรูปแบบ กลายเป็นข้อความอิสระตามที่ schema ประกาศไว้

ALTER TABLE "ticket" DROP CONSTRAINT IF EXISTS "ck_ticket_pending_reason_valid";
--> statement-breakpoint

/*
 * G-06 เดิมบังคับ "อยู่ pending_user ต้องระบุ pending_reason เสมอ" — ถอดออก
 *
 * เจตนาของกฎคือ "ต้องรู้ว่าเรื่องนี้ค้างเพราะอะไร" ซึ่งตอนนี้สถานะตอบเองครบ
 * ทั้งสามกรณี ส่วนคำอธิบายที่ผู้ตรวจอ่านได้จริงยังบังคับอยู่ที่
 * ticket_status_history.reason ซึ่ง use case ตรวจความยาวขั้นต่ำก่อนบันทึกทุกครั้ง
 * — ถ้าไม่ถอด สถานะ pending_vendor / pending_approval จะเขียนไม่ได้เลย
 *   เพราะโค้ดใหม่ล้าง pending_reason เป็น NULL สำหรับทุกสถานะที่ไม่ใช่ pending_user
 */
ALTER TABLE "ticket" DROP CONSTRAINT IF EXISTS "ck_ticket_pending_needs_reason";
--> statement-breakpoint

-- ── 5. CHECK ชุดใหม่ ──────────────────────────────────────────────────────

-- 5.1 รายการสถานะที่ใช้ได้ — เพิ่ม 4 ค่า ของเดิมอยู่ครบทุกค่า
ALTER TABLE "ticket" DROP CONSTRAINT IF EXISTS "ck_ticket_status_valid";
--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ck_ticket_status_valid" CHECK (
  status IN (
    'new', 'pending_approval', 'rejected', 'assigned', 'in_progress',
    'pending_user', 'pending_vendor', 'resolved', 'fulfilled', 'closed', 'cancelled'
  )
);
--> statement-breakpoint

/*
 * 5.2 สถานะเฉพาะสาย ต้องไม่ไปโผล่ผิดสาย
 *
 * ตารางใน ticket.entity.ts กันไว้แล้วสำหรับคำสั่งที่ผ่าน use case แต่สคริปต์
 * นำเข้าข้อมูล งานซ่อมข้อมูลด้วยมือ และ UPDATE ตรงจากคอนโซลไม่ผ่านชั้นนั้นเลย
 * — CHECK คือด่านที่ไม่มีใครข้ามได้
 *
 * ขั้นที่ 3 ด้านบนย้ายแถวเดิมให้เข้ารูปนี้เรียบร้อยแล้ว
 */
ALTER TABLE "ticket" ADD CONSTRAINT "ck_ticket_status_matches_type" CHECK (
  (ticket_type = 'service_request' OR status NOT IN ('pending_approval','rejected','fulfilled'))
  AND (ticket_type = 'incident' OR status <> 'resolved')
);
--> statement-breakpoint

-- 5.3 เรื่องผูกกับตัวเองไม่ได้ — ชิป "เรื่องที่เกี่ยวข้อง" จะวนกลับมาหน้าเดิม
ALTER TABLE "ticket" ADD CONSTRAINT "ck_ticket_related_not_self" CHECK (
  related_ticket_id IS NULL OR related_ticket_id <> id
);
--> statement-breakpoint

-- 5.4 ค่าที่รับได้ของขอบเขตหมวดหมู่
ALTER TABLE "ticket_category" ADD CONSTRAINT "ck_ticket_category_type_scope_valid" CHECK (
  ticket_type_scope IN ('incident', 'service_request', 'both')
);
--> statement-breakpoint

-- ── 6. เติมขอบเขตให้หมวดหมู่ที่มีอยู่แล้ว ─────────────────────────────────
--
-- ทุกแถวได้ 'both' จาก DEFAULT ไปแล้ว ตรงนี้คือการเติมค่าที่ถูกต้อง "รายแถว"
-- ตามกฎของ SA:
--   incident        = พัง / error / ต่อไม่ติด / ช้า / ล่ม / ไวรัส / เหตุความปลอดภัย
--   service_request = ขอให้ไอทีทำ จัดหา หรือเปลี่ยนอะไรบางอย่าง โดยไม่มีอะไรเสีย
--   both            = กำกวมจริง (ดูรายการที่ตกค้างท้ายหัวข้อนี้)
--
-- ⚠️ อ้างด้วย code ไม่ใช่ id — id ต่างกันทุกฐานข้อมูล ส่วน code เป็นคีย์ตามสัญญา
--    (uq_ticket_category_company_code) และเป็นสิ่งที่ seed ใช้อ้างเช่นกัน
-- ⚠️ ไม่ระบุ company_id ในเงื่อนไข — บริษัทที่ทำสำเนาหมวดของตัวเองต้องได้ค่าเดียวกัน

UPDATE "ticket_category" SET "ticket_type_scope" = 'incident' WHERE "code" IN (
  -- หมวดหลักที่ลูกเป็นเหตุขัดข้องทั้งหมด
  'NETWORK', 'SECURITY',
  -- เครือข่าย
  'NETWORK_OUTAGE', 'NETWORK_WIFI', 'NETWORK_SLOW', 'NETWORK_LAN', 'NETWORK_VPN',
  -- อุปกรณ์
  'HARDWARE_NO_POWER', 'HARDWARE_SLOW', 'HARDWARE_MONITOR', 'HARDWARE_PERIPHERAL',
  -- ซอฟต์แวร์
  'SOFTWARE_ERROR',
  -- อีเมล
  'EMAIL_SEND_RECEIVE', 'EMAIL_MAILBOX_FULL', 'EMAIL_ACCOUNT_LOCKED',
  -- เครื่องพิมพ์
  'PRINTER_NOT_PRINTING', 'PRINTER_QUALITY', 'PRINTER_SCAN',
  -- ความปลอดภัย
  'SECURITY_PHISHING', 'SECURITY_MALWARE', 'SECURITY_ACCOUNT', 'SECURITY_DATA_LEAK',
  -- กล้องวงจรปิด · มือถือ · AI
  'CCTV_NO_SIGNAL', 'MOBILE_BROKEN', 'AI_TOOLS_PROBLEM',
  -- ระบบผู้ขาย
  'SUPER_WORK_LOGIN', 'SUPER_WORK_ERROR'
);
--> statement-breakpoint

UPDATE "ticket_category" SET "ticket_type_scope" = 'service_request' WHERE "code" IN (
  -- หมวดหลักที่ลูกเป็นคำขอทั้งหมด
  'ACCESS',
  -- อุปกรณ์ · ซอฟต์แวร์
  'HARDWARE_REQUEST', 'SOFTWARE_INSTALL',
  -- อีเมล (EMAIL_PASSWORD ถูกแยกเป็นครึ่ง "ลืมรหัสผ่าน" ในขั้นที่ 7)
  'EMAIL_PASSWORD', 'EMAIL_NEW_ACCOUNT',
  -- เครื่องพิมพ์ — หมึกหมดคือของสิ้นเปลืองที่ถึงรอบเติม ไม่ใช่เครื่องเสีย
  'PRINTER_TONER', 'PRINTER_SETUP',
  -- สิทธิ์เข้าถึง
  'ACCESS_NEW', 'ACCESS_CHANGE', 'ACCESS_REVOKE', 'ACCESS_SHARED_FOLDER',
  -- กล้องวงจรปิด · มือถือ
  'CCTV_PLAYBACK', 'CCTV_INSTALL', 'MOBILE_SETUP', 'MOBILE_SIM',
  -- เครื่องมือ AI (หมวดหลักชื่อ "ขอสิทธิ์ใช้เครื่องมือ AI")
  'AI_TOOLS_CHAT', 'AI_TOOLS_COPILOT', 'AI_TOOLS_OTHER',
  -- ระบบผู้ขาย
  'SUPER_WORK_ACCOUNT', 'SUPER_WORK_HOWTO'
);
--> statement-breakpoint

/*
 * แถวที่ตั้งใจปล่อยไว้ที่ 'both' — ไม่ต้องสั่งอะไร เพราะ DEFAULT ให้มาแล้ว
 *
 *   หมวดหลักที่มีลูกทั้งสองชนิด  HARDWARE · SOFTWARE · EMAIL · PRINTER ·
 *                              CCTV · MOBILE · AI_TOOLS · SUPER_WORK · MAGIC
 *                              (หน้าจอกรองที่ลูก ไม่ซ่อนพ่อ มิฉะนั้นผู้แจ้ง
 *                               จะหาลูกที่มีอยู่จริงไม่เจอเพราะพ่อหายไป)
 *   ระบบผู้ขายที่ไม่มีลูกเลย     ILP · I_OFFICE_PLUS · APS · CMS · CMS_PLUS
 *   ปลายทาง "อื่น ๆ" ทั้งสองสาย  OTHER
 *   ปิดใช้งานไปแล้ว              ERP
 *
 *   🟡 กำกวมจริง — รอ SA ตัดสิน
 *     SOFTWARE_OFFICE   ชื่อผลิตภัณฑ์เปล่า ๆ ไม่มีคำกริยา ใช้ทั้ง "เปิดไฟล์ไม่ขึ้น"
 *                       และ "ขอติดตั้ง"
 *     SOFTWARE_LICENSE  "License หมดอายุ" — ฝั่งผู้ใช้คือใช้งานต่อไม่ได้ (incident)
 *                       ฝั่งไอทีคืองานจัดซื้อ/ต่ออายุ (service_request)
 *     MAGIC_AUDIT · MAGIC_ACCOUNT · MAGIC_FINANCE · MAGIC_ASSET
 *                       ชื่อหมวดย่อยเป็น "ชื่อโมดูล" ไม่ใช่ "อาการ" ต่างจาก
 *                       Super Work ที่แยก LOGIN/ERROR/ACCOUNT/HOWTO ไว้แล้ว
 */

-- ── 7. แยก "ลืมรหัสผ่าน" ออกจาก "บัญชีถูกล็อกเพราะระบบผิดพลาด" ────────────
--
-- กฎเฉพาะจาก SA: "ลืมรหัสผ่าน = ขอ service, แต่บัญชีถูกล็อกเพราะระบบ error = incident"
-- แถวเดิมชื่อ "ລືມລະຫັດຜ່ານ / ບັນຊີຖືກລັອກ" รวมสองเรื่องคนละชนิดไว้ด้วยกัน
--
-- ⚠️ EMAIL_PASSWORD ยังใช้ code เดิม และกลายเป็นครึ่ง "ลืมรหัสผ่าน"
--    ticket เก่าทุกใบชี้มาที่ code นี้อยู่ ถ้าย้าย code ไปให้ครึ่ง incident
--    ประวัติทั้งหมดจะเปลี่ยนความหมายย้อนหลังโดยไม่มีใครสั่ง

UPDATE "ticket_category"
   SET "name_th" = 'ລືມລະຫັດຜ່ານ'
 WHERE "code" = 'EMAIL_PASSWORD';
--> statement-breakpoint

/*
 * เพิ่มครึ่งที่เป็นเหตุขัดข้อง — หนึ่งแถวต่อทุกขอบเขตที่ EMAIL_PASSWORD มีอยู่
 *
 * INSERT ... SELECT จากแถวพี่น้องของมันเอง เพื่อให้ได้ company_id และ parent_id
 * ที่ถูกต้องโดยไม่ต้องเดา — บริษัทที่ทำสำเนาหมวดของตัวเองไว้ก็ได้แถวใหม่ครบ
 * ON CONFLICT DO NOTHING ทำให้รันซ้ำได้ (uq_ticket_category_company_code)
 */
INSERT INTO "ticket_category" (
  "company_id", "parent_id", "code", "name_th",
  "default_impact", "default_urgency", "ticket_type_scope", "sort_order", "is_active"
)
SELECT
  src."company_id",
  src."parent_id",
  'EMAIL_ACCOUNT_LOCKED',
  'ບັນຊີຖືກລັອກຍ້ອນລະບົບຜິດພາດ',
  src."default_impact",
  src."default_urgency",
  'incident',
  src."sort_order" + 5,
  src."is_active"
FROM "ticket_category" src
WHERE src."code" = 'EMAIL_PASSWORD'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- ── 8. ดัชนี ──────────────────────────────────────────────────────────────

/*
 * คิวอนุมัติของหน้าแดชบอร์ดและรายงาน: "คำขอกี่ใบค้างรออนุมัติอยู่ตอนนี้"
 *
 * ดัชนีบางส่วน (partial) เพราะแถวที่สนใจคือส่วนน้อยมากของตาราง และเป็นส่วน
 * ที่ถูกถามบ่อยที่สุด — ดัชนีเต็มตารางจะใหญ่กว่าหลายเท่าโดยไม่ได้เร็วขึ้นเลย
 */
CREATE INDEX IF NOT EXISTS "ix_ticket_pending_approval"
  ON "ticket" ("company_id", "created_at")
  WHERE "status" = 'pending_approval';
--> statement-breakpoint

-- ตัวกรอง ticket_type ของรายงาน + การแยกตัวชี้วัดสองสาย
CREATE INDEX IF NOT EXISTS "ix_ticket_type_company"
  ON "ticket" ("ticket_type", "company_id", "created_at");
--> statement-breakpoint

-- หน้าจอฟอร์มแจ้งเรื่องกรองหมวดหมู่ด้วยสองคอลัมน์นี้ทุกครั้งที่เปิด
CREATE INDEX IF NOT EXISTS "ix_ticket_category_scope"
  ON "ticket_category" ("ticket_type_scope", "is_active");
--> statement-breakpoint

-- "ใครรายงานตรงกับคนนี้บ้าง" — หน้าจัดการผู้ใช้ของ company_admin
CREATE INDEX IF NOT EXISTS "ix_app_user_manager"
  ON "app_user" ("manager_id")
  WHERE "manager_id" IS NOT NULL;

-- ============================================================================
-- down — รันมือเมื่อต้องถอย (NFR-24)
--
-- ⚠️ ถอยได้ "เกือบ" ทั้งหมด สิ่งที่กู้คืนไม่ได้คือความรู้ว่าเรื่องไหนเคยอยู่
--    สถานะใหม่ — ขั้นที่ 3 ย้ายข้อมูลไปแล้ว การย้อนกลับจะยุบสามสถานะ
--    (pending_approval / pending_vendor / pending_user) เหลือสถานะเดียว
--    ซึ่งข้อมูลเดิมแยกด้วย pending_reason ที่ยังอยู่ครบ จึงกู้กลับได้ถูกต้อง
--    ส่วน fulfilled → resolved กู้ได้ตรงตัวเพราะแยกด้วย ticket_type
-- ============================================================================
-- -- 1. ย้ายสถานะกลับ (ต้องทำก่อนถอด CHECK ใหม่ เพื่อไม่ให้มีแถวผิดรูปค้าง)
-- UPDATE ticket SET status = 'resolved'     WHERE status = 'fulfilled';
-- UPDATE ticket SET status = 'pending_user' WHERE status IN ('pending_approval','pending_vendor');
-- UPDATE ticket SET status = 'cancelled'    WHERE status = 'rejected';
-- UPDATE ticket SET pending_reason = 'user' WHERE status = 'pending_user' AND pending_reason IS NULL;
--
-- -- 2. ถอด CHECK และดัชนีใหม่
-- ALTER TABLE ticket DROP CONSTRAINT IF EXISTS ck_ticket_status_matches_type;
-- ALTER TABLE ticket DROP CONSTRAINT IF EXISTS ck_ticket_related_not_self;
-- ALTER TABLE ticket_category DROP CONSTRAINT IF EXISTS ck_ticket_category_type_scope_valid;
-- DROP INDEX IF EXISTS ix_ticket_pending_approval;
-- DROP INDEX IF EXISTS ix_ticket_type_company;
-- DROP INDEX IF EXISTS ix_ticket_category_scope;
-- DROP INDEX IF EXISTS ix_app_user_manager;
--
-- -- 3. คืน CHECK ชุดเดิม
-- ALTER TABLE ticket DROP CONSTRAINT IF EXISTS ck_ticket_status_valid;
-- ALTER TABLE ticket ADD CONSTRAINT ck_ticket_status_valid CHECK (
--   status IN ('new','assigned','in_progress','pending_user','resolved','closed','cancelled'));
-- ALTER TABLE ticket ADD CONSTRAINT ck_ticket_pending_reason_valid CHECK (
--   pending_reason IS NULL OR pending_reason IN ('user','vendor','approval'));
-- ALTER TABLE ticket ADD CONSTRAINT ck_ticket_pending_needs_reason CHECK (
--   status <> 'pending_user' OR pending_reason IS NOT NULL);
--
-- -- 4. ถอดคอลัมน์ใหม่ (ทำท้ายสุด — ขั้นบนไม่ได้ใช้คอลัมน์เหล่านี้)
-- ALTER TABLE ticket DROP CONSTRAINT IF EXISTS ticket_related_ticket_id_ticket_id_fk;
-- ALTER TABLE ticket DROP COLUMN IF EXISTS related_ticket_id;
-- ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_manager_id_app_user_id_fk;
-- ALTER TABLE app_user DROP COLUMN IF EXISTS manager_id;
-- ALTER TABLE ticket_category DROP COLUMN IF EXISTS ticket_type_scope;
-- DELETE FROM ticket_category WHERE code = 'EMAIL_ACCOUNT_LOCKED';
-- UPDATE ticket_category SET name_th = 'ລືມລະຫັດຜ່ານ / ບັນຊີຖືກລັອກ' WHERE code = 'EMAIL_PASSWORD';
