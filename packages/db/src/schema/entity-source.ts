import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";

import { sourceTypeEnum } from "./enums";
import { entity } from "./entity";

export const entitySource = pgTable(
  "entity_source",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id, { onDelete: "cascade" }),
    sourceType: sourceTypeEnum("source_type").notNull(),
    sourceQuery: text("source_query"),
    sourceUrl: text("source_url"),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
  },
  (table) => [index("entity_source_entity_idx").on(table.entityId)],
);
