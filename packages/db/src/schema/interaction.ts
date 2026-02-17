import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";

import { interactionTypeEnum } from "./enums";
import { entity } from "./entity";

export const interaction = pgTable(
  "interaction",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id, { onDelete: "cascade" }),
    type: interactionTypeEnum("type").notNull(),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
    content: text("content"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("interaction_entity_idx").on(table.entityId)],
);
