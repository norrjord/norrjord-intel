import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  index,
} from "drizzle-orm/pg-core";

import { entity } from "./entity";

export const draft = pgTable(
  "draft",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    createdByAi: boolean("created_by_ai").default(true).notNull(),
    approved: boolean("approved").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("draft_entity_idx").on(table.entityId)],
);
