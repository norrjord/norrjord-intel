ALTER TABLE "entity" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "company_form" text;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "registered_address" text;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "registered_city" text;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "revenue" integer;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "employee_count" integer;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "sni_code" text;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "sni_description" text;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "enriched_at" timestamp;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "enrichment_source" text;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "enrichment_raw" jsonb;