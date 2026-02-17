import { pgTable, timestamp, integer, uuid, jsonb } from "drizzle-orm/pg-core";

export const discoveryRun = pgTable("discovery_run", {
  id: uuid("id").defaultRandom().primaryKey(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  queriesExecuted: integer("queries_executed").default(0).notNull(),
  urlsFound: integer("urls_found").default(0).notNull(),
  urlsFetched: integer("urls_fetched").default(0).notNull(),
  classified: integer("classified").default(0).notNull(),
  relevantFound: integer("relevant_found").default(0).notNull(),
  deepAnalyzed: integer("deep_analyzed").default(0).notNull(),
  entitiesCreated: integer("entities_created").default(0).notNull(),
  entitiesUpdated: integer("entities_updated").default(0).notNull(),
  errors: jsonb("errors").default([]),
  config: jsonb("config"),
});
