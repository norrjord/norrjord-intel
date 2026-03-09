ALTER TYPE "public"."source_type" ADD VALUE 'instagram_scrape' BEFORE 'manual';--> statement-breakpoint
ALTER TABLE "region" ADD COLUMN "instagram_hashtags" jsonb DEFAULT '[]'::jsonb;