CREATE TABLE "cron_notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"region_slug" text NOT NULL,
	"channel" text NOT NULL,
	"entities_found" jsonb DEFAULT '[]'::jsonb,
	"run_id" uuid,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "region" ADD COLUMN "cron_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "region" ADD COLUMN "cron_channels" jsonb DEFAULT '["reko","instagram"]'::jsonb;