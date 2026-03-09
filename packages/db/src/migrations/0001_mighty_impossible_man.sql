CREATE TYPE "public"."registration_path" AS ENUM('intel_outreach', 'organic', 'unknown');--> statement-breakpoint
ALTER TYPE "public"."source_type" ADD VALUE 'reko_scrape' BEFORE 'manual';--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "region" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"search_queries" jsonb DEFAULT '[]'::jsonb,
	"region_keywords" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "region_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "reko_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"region_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discovery_run" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "discovery_run" ADD COLUMN "source_channel" text DEFAULT 'search';--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "stack_org_id" text;--> statement-breakpoint
ALTER TABLE "entity" ADD COLUMN "registration_path" "registration_path" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "reko_group" ADD CONSTRAINT "reko_group_region_id_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_stack_org_idx" ON "entity" USING btree ("stack_org_id");--> statement-breakpoint
CREATE INDEX "entity_org_number_idx" ON "entity" USING btree ("org_number");