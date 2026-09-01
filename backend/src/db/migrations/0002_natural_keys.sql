ALTER TABLE "escalation_contact" DROP CONSTRAINT "uq_escalation_contact";--> statement-breakpoint
ALTER TABLE "business_hours" DROP CONSTRAINT "uq_business_hours_company_dow";--> statement-breakpoint
ALTER TABLE "holiday" DROP CONSTRAINT "uq_holiday_company_date";--> statement-breakpoint
ALTER TABLE "service" DROP CONSTRAINT "uq_service_company_code";--> statement-breakpoint
ALTER TABLE "sla_escalation_rule" DROP CONSTRAINT "uq_escalation_rule_company_code";--> statement-breakpoint
ALTER TABLE "checklist_template" DROP CONSTRAINT "uq_checklist_template_company_code";--> statement-breakpoint
ALTER TABLE "service_catalog_item" DROP CONSTRAINT "uq_catalog_item_company_code";--> statement-breakpoint
ALTER TABLE "escalation_contact" ADD CONSTRAINT "uq_escalation_contact" UNIQUE NULLS NOT DISTINCT("company_id","contact_key","user_id");--> statement-breakpoint
ALTER TABLE "ticket_category" ADD CONSTRAINT "uq_ticket_category_company_code" UNIQUE NULLS NOT DISTINCT("company_id","code");--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "uq_business_hours_company_dow" UNIQUE NULLS NOT DISTINCT("company_id","day_of_week");--> statement-breakpoint
ALTER TABLE "holiday" ADD CONSTRAINT "uq_holiday_company_date" UNIQUE NULLS NOT DISTINCT("company_id","holiday_date");--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "uq_service_company_code" UNIQUE NULLS NOT DISTINCT("company_id","code");--> statement-breakpoint
ALTER TABLE "sla_escalation_rule" ADD CONSTRAINT "uq_escalation_rule_company_code" UNIQUE NULLS NOT DISTINCT("company_id","code");--> statement-breakpoint
ALTER TABLE "sla_policy" ADD CONSTRAINT "uq_sla_policy_company_doc" UNIQUE NULLS NOT DISTINCT("company_id","doc_ref","doc_version");--> statement-breakpoint
ALTER TABLE "approved_software" ADD CONSTRAINT "uq_approved_software" UNIQUE NULLS NOT DISTINCT("company_id","name","version");--> statement-breakpoint
ALTER TABLE "checklist_template" ADD CONSTRAINT "uq_checklist_template_company_code" UNIQUE NULLS NOT DISTINCT("company_id","code");--> statement-breakpoint
ALTER TABLE "service_catalog_item" ADD CONSTRAINT "uq_catalog_item_company_code" UNIQUE NULLS NOT DISTINCT("company_id","code");--> statement-breakpoint
ALTER TABLE "ticket_checklist_item" ADD CONSTRAINT "uq_ticket_checklist_item" UNIQUE("ticket_checklist_id","checklist_item_id");--> statement-breakpoint
ALTER TABLE "kb_category" ADD CONSTRAINT "uq_kb_category_parent_name" UNIQUE NULLS NOT DISTINCT("parent_id","name_th");