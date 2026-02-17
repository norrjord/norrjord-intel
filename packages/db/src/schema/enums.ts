import { pgEnum } from "drizzle-orm/pg-core";

// ─── Entity classification ─────────────────────────────

export const entityTypeEnum = pgEnum("entity_type", [
  "producer",
  "partner",
  "investor",
  "unknown",
]);

export const productionTypeEnum = pgEnum("production_type", [
  "beef",
  "lamb",
  "pork",
  "game",
  "poultry",
  "mixed",
  "unknown",
]);

// ─── Discovery / source tracking ────────────────────────

export const sourceTypeEnum = pgEnum("source_type", [
  "search_api",
  "manual",
  "referral",
]);

// ─── AI analysis ────────────────────────────────────────

export const analysisTypeEnum = pgEnum("analysis_type", [
  "classify",
  "deep",
  "draft",
]);

// ─── CRM pipeline ──────────────────────────────────────

export const pipelineTypeEnum = pgEnum("pipeline_type", [
  "pilot",
  "partner",
  "investor",
]);

export const pipelineStageEnum = pgEnum("pipeline_stage", [
  "new",
  "reviewed",
  "contacted",
  "replied",
  "meeting_booked",
  "negotiating",
  "closed_won",
  "closed_lost",
]);

// ─── Interactions ───────────────────────────────────────

export const interactionTypeEnum = pgEnum("interaction_type", [
  "note",
  "call",
  "email_sent_manual",
  "meeting",
]);
