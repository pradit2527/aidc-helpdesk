ALTER TABLE "support_chat_message" DROP CONSTRAINT "ck_support_chat_message_body_length";--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD COLUMN "attachment_key" varchar(255);--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD COLUMN "attachment_name" varchar(255);--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD COLUMN "attachment_mime" varchar(100);--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD COLUMN "attachment_size" bigint;--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD COLUMN "attachment_kind" varchar(10);--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD CONSTRAINT "support_chat_message_attachment_key_unique" UNIQUE("attachment_key");--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD CONSTRAINT "ck_support_chat_message_content" CHECK (char_length(body) <= 4000 and (char_length(body) >= 1 or attachment_key is not null));--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD CONSTRAINT "ck_support_chat_message_attachment_kind_valid" CHECK (attachment_kind is null or attachment_kind in ('image', 'audio', 'file'));--> statement-breakpoint
ALTER TABLE "support_chat_message" ADD CONSTRAINT "ck_support_chat_message_attachment_max_20mb" CHECK (attachment_size is null or attachment_size <= 20971520);