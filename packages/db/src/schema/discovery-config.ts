import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";

// ─── Regions ────────────────────────────────────────────

export const region = pgTable("region", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(), // e.g. "uppsala"
  label: text("label").notNull(), // e.g. "Uppsala"
  /** Keywords for region matching/scoring */
  regionKeywords: jsonb("region_keywords").default([]).$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
