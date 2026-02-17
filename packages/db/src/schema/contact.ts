import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  index,
} from "drizzle-orm/pg-core";

import { entity } from "./entity";

export const contact = pgTable(
  "contact",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id, { onDelete: "cascade" }),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    roleTitle: text("role_title"),
    isPrimary: boolean("is_primary").default(false).notNull(),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("contact_entity_idx").on(table.entityId),
    index("contact_email_idx").on(table.email),
  ],
);
