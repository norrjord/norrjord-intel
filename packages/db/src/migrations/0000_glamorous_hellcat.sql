CREATE TYPE "public"."analysis_type" AS ENUM('classify', 'deep', 'draft');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('producer', 'partner', 'investor', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."interaction_type" AS ENUM('note', 'call', 'email_sent_manual', 'meeting');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage" AS ENUM('new', 'reviewed', 'contacted', 'replied', 'meeting_booked', 'negotiating', 'closed_won', 'closed_lost');--> statement-breakpoint
CREATE TYPE "public"."pipeline_type" AS ENUM('pilot', 'partner', 'investor');--> statement-breakpoint
CREATE TYPE "public"."production_type" AS ENUM('beef', 'lamb', 'pork', 'game', 'poultry', 'mixed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('search_api', 'manual', 'referral');--> statement-breakpoint
CREATE TABLE "ai_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"model_name" text NOT NULL,
	"analysis_type" "analysis_type" NOT NULL,
	"pilot_fit_score" integer,
	"investor_fit_score" integer,
	"modernization_score" integer,
	"scale_score" integer,
	"summary" text,
	"suggested_angle" text,
	"extracted_facts" jsonb,
	"raw_output_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"role_title" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"queries_executed" integer DEFAULT 0 NOT NULL,
	"urls_found" integer DEFAULT 0 NOT NULL,
	"urls_fetched" integer DEFAULT 0 NOT NULL,
	"classified" integer DEFAULT 0 NOT NULL,
	"relevant_found" integer DEFAULT 0 NOT NULL,
	"deep_analyzed" integer DEFAULT 0 NOT NULL,
	"entities_created" integer DEFAULT 0 NOT NULL,
	"entities_updated" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb,
	"config" jsonb
);
--> statement-breakpoint
CREATE TABLE "draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_by_ai" boolean DEFAULT true NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"source_type" "source_type" NOT NULL,
	"source_query" text,
	"source_url" text,
	"discovered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"website_url" text,
	"domain" text,
	"country" text DEFAULT 'SE' NOT NULL,
	"region_text" text,
	"entity_type" "entity_type" DEFAULT 'unknown' NOT NULL,
	"production_type" "production_type" DEFAULT 'unknown' NOT NULL,
	"org_number" text,
	"source_url" text,
	"raw_extracted_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo" (
	"id" serial PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"pipeline_type" "pipeline_type" NOT NULL,
	"stage" "pipeline_stage" DEFAULT 'new' NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"owner" text DEFAULT 'henrik' NOT NULL,
	"last_contacted_at" timestamp,
	"next_action_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rel_status_entity_pipeline_unique" UNIQUE("entity_id","pipeline_type")
);
--> statement-breakpoint
CREATE TABLE "interaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"type" "interaction_type" NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"content" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_analysis" ADD CONSTRAINT "ai_analysis_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft" ADD CONSTRAINT "draft_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_source" ADD CONSTRAINT "entity_source_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_status" ADD CONSTRAINT "relationship_status_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction" ADD CONSTRAINT "interaction_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_analysis_entity_idx" ON "ai_analysis" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "ai_analysis_type_idx" ON "ai_analysis" USING btree ("analysis_type");--> statement-breakpoint
CREATE INDEX "ai_analysis_pilot_score_idx" ON "ai_analysis" USING btree ("pilot_fit_score");--> statement-breakpoint
CREATE INDEX "ai_analysis_investor_score_idx" ON "ai_analysis" USING btree ("investor_fit_score");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "contact_entity_idx" ON "contact" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "contact_email_idx" ON "contact" USING btree ("email");--> statement-breakpoint
CREATE INDEX "draft_entity_idx" ON "draft" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "entity_source_entity_idx" ON "entity_source" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "entity_domain_idx" ON "entity" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "entity_type_idx" ON "entity" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "entity_production_type_idx" ON "entity" USING btree ("production_type");--> statement-breakpoint
CREATE INDEX "entity_region_idx" ON "entity" USING btree ("region_text");--> statement-breakpoint
CREATE INDEX "rel_status_entity_idx" ON "relationship_status" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "rel_status_pipeline_idx" ON "relationship_status" USING btree ("pipeline_type");--> statement-breakpoint
CREATE INDEX "rel_status_stage_idx" ON "relationship_status" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "interaction_entity_idx" ON "interaction" USING btree ("entity_id");