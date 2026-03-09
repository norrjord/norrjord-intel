DROP TABLE "app_settings" CASCADE;--> statement-breakpoint
DROP TABLE "cron_notification" CASCADE;--> statement-breakpoint
DROP TABLE "reko_group" CASCADE;--> statement-breakpoint
ALTER TABLE "region" DROP COLUMN "search_queries";--> statement-breakpoint
ALTER TABLE "region" DROP COLUMN "instagram_hashtags";--> statement-breakpoint
ALTER TABLE "region" DROP COLUMN "cron_active";--> statement-breakpoint
ALTER TABLE "region" DROP COLUMN "cron_channels";