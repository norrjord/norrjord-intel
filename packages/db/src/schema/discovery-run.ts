import { pgTable, timestamp, integer, uuid, jsonb, text } from "drizzle-orm/pg-core";

export const discoveryRun = pgTable("discovery_run", {
  id: uuid("id").defaultRandom().primaryKey(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  /** Which region this run targeted (null = all regions) */
  region: text("region"),
  /** Discovery channel: "search", "reko_scrape", or "all" */
  sourceChannel: text("source_channel").default("search"),
  queriesExecuted: integer("queries_executed").default(0).notNull(),
  urlsFound: integer("urls_found").default(0).notNull(),
  urlsFetched: integer("urls_fetched").default(0).notNull(),
  classified: integer("classified").default(0).notNull(),
  relevantFound: integer("relevant_found").default(0).notNull(),
  deepAnalyzed: integer("deep_analyzed").default(0).notNull(),
  entitiesCreated: integer("entities_created").default(0).notNull(),
  entitiesUpdated: integer("entities_updated").default(0).notNull(),
  /** OS process ID of the running job (for cancellation) */
  pid: integer("pid"),
  errors: jsonb("errors").default([]),
  config: jsonb("config"),
});
