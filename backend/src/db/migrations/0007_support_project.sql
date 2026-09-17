-- ============================================================================
-- 0007_support_project — AIDC Support Hub เฟส 1
--
-- หนึ่งเว็บแอปของกลุ่ม = หนึ่ง inbox ชนิด Website ใน Chatwoot = หนึ่ง support_project
-- และเปิดทางให้ support_chat มีห้องที่ "ไม่มีเจ้าของเป็นพนักงาน" ได้ (origin = widget)
--
-- ⚠️ ข้อเดียวที่ย้อนกลับไม่ได้อัตโนมัติคือ requester_id ที่ถูกปลด NOT NULL
--    ก่อน ALTER กลับ ต้องลบห้องจาก widget ทิ้งก่อน (ดูบล็อก down ท้ายไฟล์)
--    ส่วน updated_at ของตารางนี้ชั้น repository เป็นผู้เซ็ต เหมือน support_team
--    (0001 ผูก trigger set_updated_at ไว้เฉพาะตารางที่มีอยู่ ณ ตอนนั้น)
-- ============================================================================

CREATE TABLE "support_project" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"website_url" varchar(255),
	"company_id" bigint,
	"default_category_id" bigint,
	"team_id" bigint,
	"chatwoot_inbox_id" bigint,
	"chatwoot_website_token" varchar(120),
	"locale" varchar(5) DEFAULT 'lo' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_project_code_unique" UNIQUE("code"),
	CONSTRAINT "ck_support_project_locale_valid" CHECK (locale IN ('lo', 'th', 'en')),
	CONSTRAINT "ck_support_project_code_format" CHECK (code ~ '^[A-Z0-9_]{2,40}$')
);
--> statement-breakpoint
ALTER TABLE "support_chat" ALTER COLUMN "requester_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "support_chat" ADD COLUMN "project_id" bigint;--> statement-breakpoint
ALTER TABLE "support_chat" ADD COLUMN "origin" varchar(20) DEFAULT 'helpdesk' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_chat" ADD COLUMN "contact_name" varchar(150);--> statement-breakpoint
ALTER TABLE "support_chat" ADD COLUMN "contact_email" varchar(255);--> statement-breakpoint
ALTER TABLE "support_chat" ADD COLUMN "contact_phone" varchar(40);--> statement-breakpoint
ALTER TABLE "support_chat" ADD COLUMN "contact_identifier" varchar(255);--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD COLUMN "from_contact" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "support_project" ADD CONSTRAINT "support_project_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_project" ADD CONSTRAINT "support_project_default_category_id_ticket_category_id_fk" FOREIGN KEY ("default_category_id") REFERENCES "public"."ticket_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_project" ADD CONSTRAINT "support_project_team_id_support_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."support_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_support_project_chatwoot_inbox" ON "support_project" USING btree ("chatwoot_inbox_id") WHERE chatwoot_inbox_id is not null;--> statement-breakpoint
CREATE INDEX "ix_support_project_company" ON "support_project" USING btree ("company_id");--> statement-breakpoint
ALTER TABLE "support_chat" ADD CONSTRAINT "support_chat_project_id_support_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."support_project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_support_chat_chatwoot_conversation" ON "support_chat" USING btree ("chatwoot_conversation_id") WHERE chatwoot_conversation_id is not null;--> statement-breakpoint
CREATE INDEX "ix_support_chat_project" ON "support_chat" USING btree ("project_id","status","last_message_at");--> statement-breakpoint
ALTER TABLE "support_chat" ADD CONSTRAINT "ck_support_chat_origin_valid" CHECK (origin IN ('helpdesk', 'widget'));

-- ============================================================================
-- down — รันมือเมื่อต้องถอย (NFR-24) ลำดับนี้สำคัญ
-- ============================================================================
-- DELETE FROM support_chat_message WHERE chat_id IN (SELECT id FROM support_chat WHERE origin = 'widget');
-- DELETE FROM support_chat WHERE origin = 'widget';
-- ALTER TABLE support_chat DROP CONSTRAINT ck_support_chat_origin_valid;
-- DROP INDEX ix_support_chat_project;
-- DROP INDEX uq_support_chat_chatwoot_conversation;
-- ALTER TABLE support_chat DROP CONSTRAINT support_chat_project_id_support_project_id_fk;
-- ALTER TABLE support_chat_message DROP COLUMN from_contact;
-- ALTER TABLE support_chat DROP COLUMN contact_identifier, DROP COLUMN contact_phone,
--   DROP COLUMN contact_email, DROP COLUMN contact_name, DROP COLUMN origin, DROP COLUMN project_id;
-- ALTER TABLE support_chat ALTER COLUMN requester_id SET NOT NULL;
-- DROP TABLE support_project;