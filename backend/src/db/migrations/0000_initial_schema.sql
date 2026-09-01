CREATE TABLE "app_user" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint NOT NULL,
	"department_id" bigint,
	"username" varchar(50) NOT NULL,
	"email" varchar(150),
	"full_name" varchar(150) NOT NULL,
	"employee_code" varchar(50),
	"phone" varchar(30),
	"job_title" varchar(100),
	"password_hash" varchar(255),
	"auth_provider" varchar(20) DEFAULT 'local' NOT NULL,
	"external_subject" varchar(255),
	"must_change_password" boolean DEFAULT true NOT NULL,
	"password_changed_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp with time zone,
	"unlocked_by" bigint,
	"token_version" integer DEFAULT 0 NOT NULL,
	"is_admin_account" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"line_user_id" varchar(100),
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_username_unique" UNIQUE("username"),
	CONSTRAINT "uq_app_user_provider_subject" UNIQUE("auth_provider","external_subject"),
	CONSTRAINT "ck_app_user_auth_provider_valid" CHECK (auth_provider IN ('local', 'ldap', 'oidc')),
	CONSTRAINT "ck_app_user_local_needs_password" CHECK (auth_provider <> 'local' OR password_hash IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"name_th" varchar(150) NOT NULL,
	"name_en" varchar(150),
	"logo_path" varchar(255),
	"contact_email" varchar(150),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "department" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint NOT NULL,
	"name" varchar(150) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_department_company_name" UNIQUE("company_id","name")
);
--> statement-breakpoint
CREATE TABLE "escalation_contact" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint,
	"contact_key" varchar(30) NOT NULL,
	"user_id" bigint NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_escalation_contact" UNIQUE("company_id","contact_key","user_id"),
	CONSTRAINT "ck_escalation_contact_key_valid" CHECK (contact_key IN ('head_of_it', 'ceo', 'dpo', 'incident_manager', 'tier2_group', 'tier3_group'))
);
--> statement-breakpoint
CREATE TABLE "password_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" varchar(60) NOT NULL,
	"group_name" varchar(40) NOT NULL,
	"description" varchar(255),
	CONSTRAINT "permission_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name_th" varchar(100) NOT NULL,
	"description" varchar(255),
	"is_system" boolean DEFAULT true NOT NULL,
	CONSTRAINT "role_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"role_id" bigint NOT NULL,
	"permission_id" bigint NOT NULL,
	CONSTRAINT "pk_role_permission" UNIQUE("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"role_id" bigint NOT NULL,
	"granted_by" bigint,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "uq_user_role" UNIQUE("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "user_role_scope" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_role_id" bigint NOT NULL,
	"company_id" bigint NOT NULL,
	CONSTRAINT "uq_user_role_scope" UNIQUE("user_role_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "ticket" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticket_no" varchar(30) NOT NULL,
	"ticket_type" varchar(20) DEFAULT 'incident' NOT NULL,
	"company_id" bigint NOT NULL,
	"department_id" bigint,
	"category_id" bigint NOT NULL,
	"catalog_item_id" bigint,
	"service_id" bigint,
	"problem_id" bigint,
	"requester_id" bigint NOT NULL,
	"created_by" bigint NOT NULL,
	"assignee_id" bigint,
	"subject" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"channel" varchar(20) DEFAULT 'portal' NOT NULL,
	"source_device" varchar(20),
	"call_answered_at" timestamp with time zone,
	"asset_tag" varchar(50),
	"impact" varchar(20) DEFAULT 'individual' NOT NULL,
	"urgency" varchar(20) DEFAULT 'medium' NOT NULL,
	"priority" varchar(10) DEFAULT 'P3' NOT NULL,
	"priority_changed_at" timestamp with time zone,
	"priority_review_requested_at" timestamp with time zone,
	"priority_review_reason" varchar(500),
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"pending_reason" varchar(20),
	"pending_started_at" timestamp with time zone,
	"pending_notified_at" timestamp with time zone,
	"pending_duration_minutes" integer DEFAULT 0 NOT NULL,
	"followup_count" integer DEFAULT 0 NOT NULL,
	"last_followup_at" timestamp with time zone,
	"support_tier" smallint DEFAULT 1 NOT NULL,
	"tier_changed_at" timestamp with time zone,
	"vendor_ref" varchar(100),
	"assignee_change_count" integer DEFAULT 0 NOT NULL,
	"sla_policy_id" bigint,
	"sla_clock_started_at" timestamp with time zone,
	"response_due_at" timestamp with time zone,
	"resolution_due_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"target_date" date,
	"next_status_report_due_at" timestamp with time zone,
	"workaround_at" timestamp with time zone,
	"workaround_note" text,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"closed_at" timestamp with time zone,
	"closed_by" bigint,
	"is_response_breached" boolean DEFAULT false NOT NULL,
	"is_resolution_breached" boolean DEFAULT false NOT NULL,
	"escalation_notified_at" timestamp with time zone,
	"sla_exclusion_code" varchar(30),
	"sla_exclusion_note" varchar(500),
	"reopen_count" integer DEFAULT 0 NOT NULL,
	"resolved_by_kb_id" bigint,
	"is_major_incident" boolean DEFAULT false NOT NULL,
	"incident_commander_id" bigint,
	"is_security_incident" boolean DEFAULT false NOT NULL,
	"personal_data_affected" boolean DEFAULT false NOT NULL,
	"dpo_notified_at" timestamp with time zone,
	"regulator_notify_due_at" timestamp with time zone,
	"is_immediate_suspend" boolean DEFAULT false NOT NULL,
	"restore_point_date" date,
	"satisfaction_score" smallint,
	"csat_sent_at" timestamp with time zone,
	"csat_responded_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_ticket_no_unique" UNIQUE("ticket_no"),
	CONSTRAINT "ck_ticket_type_valid" CHECK (ticket_type IN ('incident', 'service_request')),
	CONSTRAINT "ck_ticket_status_valid" CHECK (status IN ('new', 'assigned', 'in_progress', 'pending_user', 'resolved', 'closed', 'cancelled')),
	CONSTRAINT "ck_ticket_priority_valid" CHECK (priority IN ('P1', 'P2', 'P3', 'P4')),
	CONSTRAINT "ck_ticket_impact_valid" CHECK (impact IN ('org_wide', 'department', 'individual')),
	CONSTRAINT "ck_ticket_urgency_valid" CHECK (urgency IN ('high', 'medium', 'low')),
	CONSTRAINT "ck_ticket_channel_valid" CHECK (channel IN ('portal', 'email', 'phone', 'walk_in')),
	CONSTRAINT "ck_ticket_source_device_valid" CHECK (source_device IS NULL OR source_device IN ('web', 'mobile_web')),
	CONSTRAINT "ck_ticket_pending_reason_valid" CHECK (pending_reason IS NULL OR pending_reason IN ('user', 'vendor', 'approval')),
	CONSTRAINT "ck_ticket_sla_exclusion_valid" CHECK (sla_exclusion_code IS NULL OR sla_exclusion_code IN ('planned_maintenance', 'force_majeure', 'vendor_delay', 'user_installed', 'waiting_requester', 'agreed_special_terms')),
	CONSTRAINT "ck_ticket_support_tier_range" CHECK (support_tier BETWEEN 1 AND 3),
	CONSTRAINT "ck_ticket_satisfaction_range" CHECK (satisfaction_score IS NULL OR satisfaction_score BETWEEN 1 AND 5),
	CONSTRAINT "ck_ticket_pending_needs_reason" CHECK (status <> 'pending_user' OR pending_reason IS NOT NULL),
	CONSTRAINT "ck_ticket_service_request_needs_catalog" CHECK (ticket_type <> 'service_request' OR catalog_item_id IS NOT NULL),
	CONSTRAINT "ck_ticket_tier3_needs_vendor_ref" CHECK (support_tier <> 3 OR vendor_ref IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "ticket_category" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint,
	"parent_id" bigint,
	"code" varchar(40) NOT NULL,
	"name_th" varchar(150) NOT NULL,
	"default_impact" varchar(20) DEFAULT 'individual' NOT NULL,
	"default_urgency" varchar(20) DEFAULT 'medium' NOT NULL,
	"default_assignee_id" bigint,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_ticket_category_impact_valid" CHECK (default_impact IN ('org_wide', 'department', 'individual')),
	CONSTRAINT "ck_ticket_category_urgency_valid" CHECK (default_urgency IN ('high', 'medium', 'low'))
);
--> statement-breakpoint
CREATE TABLE "ticket_comment" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticket_id" bigint NOT NULL,
	"author_id" bigint,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_sequence" (
	"company_id" bigint NOT NULL,
	"period" char(6) NOT NULL,
	"last_no" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ticket_sequence_company_id_period_pk" PRIMARY KEY("company_id","period")
);
--> statement-breakpoint
CREATE TABLE "ticket_status_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticket_id" bigint NOT NULL,
	"from_status" varchar(20),
	"to_status" varchar(20) NOT NULL,
	"from_assignee_id" bigint,
	"to_assignee_id" bigint,
	"from_priority" varchar(10),
	"to_priority" varchar(10),
	"from_tier" smallint,
	"to_tier" smallint,
	"reason" varchar(500),
	"changed_by" bigint,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_hours" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint,
	"day_of_week" smallint NOT NULL,
	"start_time" time DEFAULT '08:30:00' NOT NULL,
	"end_time" time DEFAULT '17:30:00' NOT NULL,
	"is_working_day" boolean DEFAULT true NOT NULL,
	CONSTRAINT "uq_business_hours_company_dow" UNIQUE("company_id","day_of_week"),
	CONSTRAINT "ck_business_hours_dow_range" CHECK (day_of_week BETWEEN 0 AND 6),
	CONSTRAINT "ck_business_hours_order" CHECK (start_time < end_time)
);
--> statement-breakpoint
CREATE TABLE "holiday" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint,
	"holiday_date" date NOT NULL,
	"name" varchar(150) NOT NULL,
	CONSTRAINT "uq_holiday_company_date" UNIQUE("company_id","holiday_date")
);
--> statement-breakpoint
CREATE TABLE "maintenance_window" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint,
	"service_id" bigint,
	"planned_start" timestamp with time zone NOT NULL,
	"planned_end" timestamp with time zone NOT NULL,
	"notified_at" timestamp with time zone,
	"notice_lead_business_days" integer DEFAULT 3 NOT NULL,
	"description" varchar(500),
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_maintenance_window_order" CHECK (planned_end > planned_start)
);
--> statement-breakpoint
CREATE TABLE "problem" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint NOT NULL,
	"code" varchar(30) NOT NULL,
	"title" varchar(255) NOT NULL,
	"service_id" bigint,
	"root_cause_code" varchar(40),
	"root_cause_note" text,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rca_due_at" timestamp with time zone,
	"rca_submitted_at" timestamp with time zone,
	"owner_id" bigint,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problem_code_unique" UNIQUE("code"),
	CONSTRAINT "ck_problem_status_valid" CHECK (status IN ('open', 'rca_pending', 'fixed', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "service" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint,
	"code" varchar(40) NOT NULL,
	"name_th" varchar(150) NOT NULL,
	"service_group" varchar(30) NOT NULL,
	"service_tier" varchar(20) DEFAULT 'standard' NOT NULL,
	"owner_user_id" bigint,
	"is_24x7" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_service_company_code" UNIQUE("company_id","code"),
	CONSTRAINT "ck_service_tier_valid" CHECK (service_tier IN ('critical', 'high', 'standard')),
	CONSTRAINT "ck_service_group_valid" CHECK (service_group IN ('core_business', 'infrastructure', 'communication', 'file_storage', 'endpoint', 'service_request'))
);
--> statement-breakpoint
CREATE TABLE "service_outage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"service_id" bigint NOT NULL,
	"ticket_id" bigint,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"is_planned" boolean DEFAULT false NOT NULL,
	"maintenance_window_id" bigint,
	"cause" varchar(500),
	"recorded_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_service_outage_order" CHECK (ended_at IS NULL OR ended_at > started_at)
);
--> statement-breakpoint
CREATE TABLE "service_tier_target" (
	"tier_code" varchar(20) PRIMARY KEY NOT NULL,
	"uptime_percent" numeric(5, 3) NOT NULL,
	"max_downtime_minutes_month" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_escalation_rule" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint,
	"code" varchar(20) NOT NULL,
	"trigger_type" varchar(30) NOT NULL,
	"priority" varchar(10),
	"threshold_minutes" integer,
	"threshold_clock_mode" varchar(20) DEFAULT 'business_hours' NOT NULL,
	"notify_contact_keys" varchar(200) NOT NULL,
	"notify_roles" varchar(200),
	"repeat_interval_minutes" integer,
	"notify_outside_business_hours" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_escalation_rule_company_code" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "sla_policy" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint,
	"name" varchar(100) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"doc_ref" varchar(40),
	"doc_version" varchar(10),
	"effective_from" date,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_target" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sla_policy_id" bigint NOT NULL,
	"priority" varchar(10) NOT NULL,
	"response_minutes" integer NOT NULL,
	"resolution_minutes" integer NOT NULL,
	"clock_mode" varchar(20) DEFAULT 'business_hours' NOT NULL,
	"status_report_interval_minutes" integer,
	"escalation_percent" integer DEFAULT 75 NOT NULL,
	CONSTRAINT "uq_sla_target_policy_priority" UNIQUE("sla_policy_id","priority"),
	CONSTRAINT "ck_sla_target_priority_valid" CHECK (priority IN ('P1', 'P2', 'P3', 'P4')),
	CONSTRAINT "ck_sla_target_clock_mode_valid" CHECK (clock_mode IN ('business_hours', 'calendar_24x7')),
	CONSTRAINT "ck_sla_target_minutes_positive" CHECK (response_minutes > 0 AND resolution_minutes > 0)
);
--> statement-breakpoint
CREATE TABLE "approval_request" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticket_id" bigint NOT NULL,
	"seq" smallint DEFAULT 1 NOT NULL,
	"approver_type" varchar(30) NOT NULL,
	"approver_id" bigint,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"decided_by" bigint,
	"decided_at" timestamp with time zone,
	"comment" varchar(500),
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"attachment_id" bigint,
	"access_expires_at" timestamp with time zone,
	CONSTRAINT "uq_approval_ticket_seq" UNIQUE("ticket_id","seq"),
	CONSTRAINT "ck_approval_status_valid" CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'skipped')),
	CONSTRAINT "ck_approval_approver_type_valid" CHECK (approver_type IN ('line_manager', 'system_owner', 'head_of_it', 'budget_owner', 'tier2_review', 'cab')),
	CONSTRAINT "ck_approval_reject_needs_comment" CHECK (status <> 'rejected' OR comment IS NOT NULL),
	CONSTRAINT "ck_approval_decided_complete" CHECK (status NOT IN ('approved','rejected') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "approved_software" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint,
	"name" varchar(150) NOT NULL,
	"version" varchar(50),
	"license_type" varchar(50),
	"note" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_item" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"template_id" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"title_th" varchar(255) NOT NULL,
	"description" varchar(500),
	"is_required" boolean DEFAULT true NOT NULL,
	"evidence_required" boolean DEFAULT false NOT NULL,
	"default_role_code" varchar(30),
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "uq_checklist_item_template_order" UNIQUE("template_id","sort_order")
);
--> statement-breakpoint
CREATE TABLE "checklist_template" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint,
	"code" varchar(40) NOT NULL,
	"name_th" varchar(150) NOT NULL,
	"doc_ref" varchar(40),
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_checklist_template_company_code" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "service_catalog_item" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" bigint,
	"code" varchar(40) NOT NULL,
	"name_th" varchar(150) NOT NULL,
	"category_id" bigint,
	"default_impact" varchar(20) DEFAULT 'individual' NOT NULL,
	"default_urgency" varchar(20) DEFAULT 'low' NOT NULL,
	"default_priority" varchar(10) DEFAULT 'P4' NOT NULL,
	"target_mode" varchar(30) DEFAULT 'duration' NOT NULL,
	"target_minutes" integer,
	"clock_start_event" varchar(30) DEFAULT 'on_create' NOT NULL,
	"lead_time_days" integer,
	"lead_time_unit" varchar(10),
	"requires_approval" boolean DEFAULT false NOT NULL,
	"approval_chain" varchar(200),
	"checklist_template_id" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_catalog_item_company_code" UNIQUE("company_id","code"),
	CONSTRAINT "ck_catalog_target_mode_valid" CHECK (target_mode IN ('duration', 'before_date', 'by_date')),
	CONSTRAINT "ck_catalog_clock_start_valid" CHECK (clock_start_event IN ('on_create', 'after_identity_verified', 'after_approval', 'after_budget_approval')),
	CONSTRAINT "ck_catalog_priority_valid" CHECK (default_priority IN ('P1', 'P2', 'P3', 'P4')),
	CONSTRAINT "ck_catalog_duration_needs_minutes" CHECK (target_mode <> 'duration' OR target_minutes IS NOT NULL),
	CONSTRAINT "ck_catalog_approval_needs_chain" CHECK (requires_approval = false OR approval_chain IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "ticket_checklist" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticket_id" bigint NOT NULL,
	"template_id" bigint NOT NULL,
	"template_version" integer NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_ticket_checklist" UNIQUE("ticket_id","template_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_checklist_item" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticket_checklist_id" bigint NOT NULL,
	"checklist_item_id" bigint,
	"title_snapshot" varchar(255) NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"evidence_required" boolean DEFAULT false NOT NULL,
	"is_done" boolean DEFAULT false NOT NULL,
	"done_by" bigint,
	"done_at" timestamp with time zone,
	"note" varchar(500),
	"attachment_id" bigint,
	CONSTRAINT "ck_checklist_item_evidence_when_done" CHECK (NOT (is_done AND evidence_required AND attachment_id IS NULL)),
	CONSTRAINT "ck_checklist_item_done_complete" CHECK (NOT is_done OR (done_by IS NOT NULL AND done_at IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "attachment" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticket_id" bigint,
	"comment_id" bigint,
	"kb_article_id" bigint,
	"storage_key" varchar(255) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" bigint NOT NULL,
	"uploaded_by" bigint NOT NULL,
	"scan_status" varchar(20) DEFAULT 'skipped' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "ck_attachment_scan_status_valid" CHECK (scan_status IN ('pending', 'clean', 'infected', 'skipped')),
	CONSTRAINT "ck_attachment_size_max_20mb" CHECK (file_size <= 20971520)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" bigint,
	"company_id" bigint,
	"action" varchar(40) NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" bigint,
	"old_value" jsonb,
	"new_value" jsonb,
	"ip_address" varchar(45),
	"user_agent" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_article" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kb_category_id" bigint NOT NULL,
	"company_id" bigint,
	"title" varchar(255) NOT NULL,
	"summary" varchar(500),
	"body_markdown" text NOT NULL,
	"visibility" varchar(20) DEFAULT 'public' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"tags" varchar(255),
	"author_id" bigint NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"not_helpful_count" integer DEFAULT 0 NOT NULL,
	"source_ticket_id" bigint,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_kb_visibility_valid" CHECK (visibility IN ('public', 'company', 'agent_only')),
	CONSTRAINT "ck_kb_status_valid" CHECK (status IN ('draft', 'published', 'archived')),
	CONSTRAINT "ck_kb_published_needs_date" CHECK (status <> 'published' OR published_at IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "kb_category" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"parent_id" bigint,
	"name_th" varchar(150) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_feedback" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kb_article_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"is_helpful" boolean NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_kb_feedback_article_user" UNIQUE("kb_article_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"ticket_id" bigint,
	"event_type" varchar(40) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"error_message" varchar(500),
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_notification_channel_valid" CHECK (channel IN ('in_app', 'email', 'teams', 'line', 'webpush')),
	CONSTRAINT "ck_notification_status_valid" CHECK (status IN ('pending', 'sent', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "notification_channel" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"channel" varchar(20) NOT NULL,
	"destination" varchar(255),
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_notification_channel_user" UNIQUE("user_id","channel"),
	CONSTRAINT "ck_notification_channel_code_valid" CHECK (channel IN ('in_app', 'email', 'teams', 'line', 'webpush'))
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_contact" ADD CONSTRAINT "escalation_contact_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_contact" ADD CONSTRAINT "escalation_contact_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_scope" ADD CONSTRAINT "user_role_scope_user_role_id_user_role_id_fk" FOREIGN KEY ("user_role_id") REFERENCES "public"."user_role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_scope" ADD CONSTRAINT "user_role_scope_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_category_id_ticket_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ticket_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_requester_id_app_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_assignee_id_app_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_closed_by_app_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_incident_commander_id_app_user_id_fk" FOREIGN KEY ("incident_commander_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_category" ADD CONSTRAINT "ticket_category_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_category" ADD CONSTRAINT "ticket_category_default_assignee_id_app_user_id_fk" FOREIGN KEY ("default_assignee_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_sequence" ADD CONSTRAINT "ticket_sequence_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_changed_by_app_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday" ADD CONSTRAINT "holiday_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_window" ADD CONSTRAINT "maintenance_window_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_window" ADD CONSTRAINT "maintenance_window_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_window" ADD CONSTRAINT "maintenance_window_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem" ADD CONSTRAINT "problem_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem" ADD CONSTRAINT "problem_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem" ADD CONSTRAINT "problem_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_owner_user_id_app_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_outage" ADD CONSTRAINT "service_outage_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_outage" ADD CONSTRAINT "service_outage_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_outage" ADD CONSTRAINT "service_outage_recorded_by_app_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_escalation_rule" ADD CONSTRAINT "sla_escalation_rule_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_policy" ADD CONSTRAINT "sla_policy_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_target" ADD CONSTRAINT "sla_target_sla_policy_id_sla_policy_id_fk" FOREIGN KEY ("sla_policy_id") REFERENCES "public"."sla_policy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_approver_id_app_user_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approved_software" ADD CONSTRAINT "approved_software_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_template_id_checklist_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_template" ADD CONSTRAINT "checklist_template_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_catalog_item" ADD CONSTRAINT "service_catalog_item_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_catalog_item" ADD CONSTRAINT "service_catalog_item_category_id_ticket_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ticket_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_catalog_item" ADD CONSTRAINT "service_catalog_item_checklist_template_id_checklist_template_id_fk" FOREIGN KEY ("checklist_template_id") REFERENCES "public"."checklist_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_checklist" ADD CONSTRAINT "ticket_checklist_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_checklist" ADD CONSTRAINT "ticket_checklist_template_id_checklist_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_checklist_item" ADD CONSTRAINT "ticket_checklist_item_ticket_checklist_id_ticket_checklist_id_fk" FOREIGN KEY ("ticket_checklist_id") REFERENCES "public"."ticket_checklist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_checklist_item" ADD CONSTRAINT "ticket_checklist_item_checklist_item_id_checklist_item_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."checklist_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_checklist_item" ADD CONSTRAINT "ticket_checklist_item_done_by_app_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_comment_id_ticket_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."ticket_comment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_kb_article_id_kb_article_id_fk" FOREIGN KEY ("kb_article_id") REFERENCES "public"."kb_article"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploaded_by_app_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_article" ADD CONSTRAINT "kb_article_kb_category_id_kb_category_id_fk" FOREIGN KEY ("kb_category_id") REFERENCES "public"."kb_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_article" ADD CONSTRAINT "kb_article_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_article" ADD CONSTRAINT "kb_article_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_article" ADD CONSTRAINT "kb_article_source_ticket_id_ticket_id_fk" FOREIGN KEY ("source_ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_feedback" ADD CONSTRAINT "kb_feedback_kb_article_id_kb_article_id_fk" FOREIGN KEY ("kb_article_id") REFERENCES "public"."kb_article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_feedback" ADD CONSTRAINT "kb_feedback_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_channel" ADD CONSTRAINT "notification_channel_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_app_user_company_active" ON "app_user" USING btree ("company_id","is_active");--> statement-breakpoint
CREATE INDEX "ix_department_company" ON "department" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ix_escalation_contact_key" ON "escalation_contact" USING btree ("contact_key");--> statement-breakpoint
CREATE INDEX "ix_password_history_user" ON "password_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_user_role_user" ON "user_role" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_user_role_expires" ON "user_role" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ix_user_role_scope_role" ON "user_role_scope" USING btree ("user_role_id");--> statement-breakpoint
CREATE INDEX "ix_ticket_company_status" ON "ticket" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "ix_ticket_assignee_status" ON "ticket" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "ix_ticket_requester" ON "ticket" USING btree ("requester_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_ticket_due" ON "ticket" USING btree ("resolution_due_at");--> statement-breakpoint
CREATE INDEX "ix_ticket_status_report" ON "ticket" USING btree ("next_status_report_due_at");--> statement-breakpoint
CREATE INDEX "ix_ticket_tier" ON "ticket" USING btree ("support_tier","created_at");--> statement-breakpoint
CREATE INDEX "ix_ticket_problem" ON "ticket" USING btree ("problem_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_ticket_category_company" ON "ticket_category" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ix_comment_ticket_created" ON "ticket_comment" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_ticket_history_ticket" ON "ticket_status_history" USING btree ("ticket_id","changed_at");--> statement-breakpoint
CREATE INDEX "ix_business_hours_company" ON "business_hours" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ix_holiday_date" ON "holiday" USING btree ("holiday_date");--> statement-breakpoint
CREATE INDEX "ix_maintenance_window_start" ON "maintenance_window" USING btree ("planned_start");--> statement-breakpoint
CREATE INDEX "ix_problem_company" ON "problem" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ix_problem_root_cause" ON "problem" USING btree ("root_cause_code");--> statement-breakpoint
CREATE INDEX "ix_problem_rca_due" ON "problem" USING btree ("rca_due_at");--> statement-breakpoint
CREATE INDEX "ix_service_company" ON "service" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ix_service_outage_service" ON "service_outage" USING btree ("service_id","started_at");--> statement-breakpoint
CREATE INDEX "ix_sla_policy_company" ON "sla_policy" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ix_approval_ticket" ON "approval_request" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ix_approval_approver_status" ON "approval_request" USING btree ("approver_id","status");--> statement-breakpoint
CREATE INDEX "ix_approved_software_name" ON "approved_software" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ix_approved_software_company" ON "approved_software" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ix_catalog_item_company" ON "service_catalog_item" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ix_ticket_checklist_ticket" ON "ticket_checklist" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ix_ticket_checklist_item_parent" ON "ticket_checklist_item" USING btree ("ticket_checklist_id");--> statement-breakpoint
CREATE INDEX "ix_attachment_ticket" ON "attachment" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ix_audit_created" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ix_audit_actor" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_audit_entity" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ix_audit_company" ON "audit_log" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_kb_article_company" ON "kb_article" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ix_kb_article_status" ON "kb_article" USING btree ("status","visibility");--> statement-breakpoint
CREATE INDEX "ix_notification_unread" ON "notification" USING btree ("user_id","channel","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notification_dedup" ON "notification" USING btree ("user_id","ticket_id","event_type","channel",((created_at AT TIME ZONE 'Asia/Vientiane')::date));