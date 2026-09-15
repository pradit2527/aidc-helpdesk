ALTER TABLE "support_chat" ADD COLUMN "chatwoot_conversation_id" bigint;--> statement-breakpoint
ALTER TABLE "support_chat" ADD COLUMN "chatwoot_contact_id" bigint;--> statement-breakpoint
ALTER TABLE "support_chat" ADD COLUMN "chatwoot_cursor" bigint;--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD COLUMN "chatwoot_message_id" bigint;--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD COLUMN "external_sender_name" varchar(150);--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD CONSTRAINT "support_chat_message_chatwoot_message_id_unique" UNIQUE("chatwoot_message_id");