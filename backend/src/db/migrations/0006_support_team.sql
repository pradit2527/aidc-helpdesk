CREATE TABLE "support_team" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"company_id" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_team_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "support_team_member" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"team_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_support_team_member" UNIQUE("team_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "support_team" ADD CONSTRAINT "support_team_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_team_member" ADD CONSTRAINT "support_team_member_team_id_support_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."support_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_team_member" ADD CONSTRAINT "support_team_member_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_support_team_company" ON "support_team" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ix_support_team_member_user" ON "support_team_member" USING btree ("user_id");