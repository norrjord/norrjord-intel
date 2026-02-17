import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";

import { entityTypeEnum, productionTypeEnum } from "./enums";

export const entity = pgTable(
  "entity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name"),
    websiteUrl: text("website_url"),
    domain: text("domain"), // normalized for dedup (e.g. "gardsnara.se")
    country: text("country").default("SE").notNull(),
    regionText: text("region_text"),
    entityType: entityTypeEnum("entity_type").default("unknown").notNull(),
    productionType: productionTypeEnum("production_type")
      .default("unknown")
      .notNull(),
    orgNumber: text("org_number"),
    sourceUrl: text("source_url"),
    rawExtractedText: text("raw_extracted_text"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("entity_domain_idx").on(table.domain),
    index("entity_type_idx").on(table.entityType),
    index("entity_production_type_idx").on(table.productionType),
    index("entity_region_idx").on(table.regionText),
  ],
);
