CREATE TABLE "support_chat" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint NOT NULL,
	"requester_id" bigint NOT NULL,
	"assignee_id" bigint,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"ticket_id" bigint,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_by" bigint,
	"requester_read_at" timestamp with time zone,
	"staff_read_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_support_chat_status_valid" CHECK (status IN ('open', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "support_chat_message" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"sender_id" bigint,
	"body" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_support_chat_message_body_length" CHECK (char_length(body) between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "support_chat" ADD CONSTRAINT "support_chat_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_chat" ADD CONSTRAINT "support_chat_requester_id_app_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_chat" ADD CONSTRAINT "support_chat_assignee_id_app_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_chat" ADD CONSTRAINT "support_chat_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_chat" ADD CONSTRAINT "support_chat_last_message_by_app_user_id_fk" FOREIGN KEY ("last_message_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_chat" ADD CONSTRAINT "support_chat_closed_by_app_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD CONSTRAINT "support_chat_message_chat_id_support_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."support_chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD CONSTRAINT "support_chat_message_sender_id_app_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_support_chat_open_requester" ON "support_chat" USING btree ("requester_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "ix_support_chat_company_status" ON "support_chat" USING btree ("company_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "ix_support_chat_message_chat" ON "support_chat_message" USING btree ("chat_id","id");