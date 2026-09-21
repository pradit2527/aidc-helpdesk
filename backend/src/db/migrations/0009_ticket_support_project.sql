-- ============================================================================
-- 0009_ticket_support_project — AIDC Support Hub เฟส 2
--
-- เรื่องแจ้งรู้ว่าตัวเองมาจากเว็บไหนของกลุ่ม
--
-- ตั้งค่าเมื่อยกระดับแชทจาก widget เป็น ticket (POST /support-chat/{id}/ticket)
-- และเมื่อผู้เรียกส่ง project_id มากับ POST /tickets เอง
--
-- ⚠️ ไม่ใช้ support_chat.ticket_id แทน เพราะรายงานต้องกรอง "เรื่องของเว็บนี้"
--    ได้แม้ห้องแชทจะไม่มีอยู่แล้ว และการ join ผ่านตารางแชททุกครั้งที่ออกรายงาน
--    คือค่าใช้จ่ายที่ไม่จำเป็น — ดัชนีด้านล่างคือตัวที่ทำให้ตัวกรองนั้นไม่กวาดทั้งตาราง
--
-- แถวเดิมได้ NULL ทั้งหมด ซึ่งถูกต้อง: ยังไม่มีเรื่องไหนมาจากโครงการใด
-- ============================================================================

ALTER TABLE "ticket" ADD COLUMN "support_project_id" bigint;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_support_project_id_support_project_id_fk" FOREIGN KEY ("support_project_id") REFERENCES "public"."support_project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_ticket_support_project" ON "ticket" USING btree ("support_project_id","created_at");

-- ============================================================================
-- down — รันมือเมื่อต้องถอย (NFR-24) · ย้อนได้ทั้งหมด ไม่มีข้อมูลสูญหาย
--        นอกจากความรู้ว่าเรื่องไหนมาจากโครงการไหน
-- ============================================================================
-- DROP INDEX ix_ticket_support_project;
-- ALTER TABLE ticket DROP CONSTRAINT ticket_support_project_id_support_project_id_fk;
-- ALTER TABLE ticket DROP COLUMN support_project_id;
