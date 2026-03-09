import { pgTable, text, timestamp, uuid, index, integer, jsonb, doublePrecision } from "drizzle-orm/pg-core";

import { entityTypeEnum, productionTypeEnum, registrationPathEnum } from "./enums";

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
    stackOrgId: text("stack_org_id"),
    registrationPath: registrationPathEnum("registration_path")
      .default("unknown")
      .notNull(),

    // ─── Business registry enrichment ─────────────────────
    companyName: text("company_name"), // registered legal name
    companyForm: text("company_form"), // AB, HB, EF, etc.
    registeredAddress: text("registered_address"),
    registeredCity: text("registered_city"),
    postalCode: text("postal_code"),
    municipality: text("municipality"), // kommun
    county: text("county"), // län
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    revenue: integer("revenue"), // annual revenue in SEK (latest)
    profit: integer("profit"), // annual profit in SEK (latest)
    employeeCount: integer("employee_count"),
    sniCode: text("sni_code"), // Swedish industry classification
    sniDescription: text("sni_description"),
    enrichedAt: timestamp("enriched_at"),
    enrichmentSource: text("enrichment_source"), // e.g. "allabolag"
    enrichmentRaw: jsonb("enrichment_raw"), // raw scraped data for debugging

    // ─── Activity check ─────────────────────────────────────
    activityStatus: text("activity_status", {
      enum: ["active", "likely_active", "likely_inactive", "inactive", "unknown"],
    })
      .default("unknown")
      .notNull(),
    activityCheckedAt: timestamp("activity_checked_at"),
    companyStatus: text("company_status"), // from allabolag: "Aktivt", "Avregistrerat", etc.
    websiteAlive: text("website_alive", {
      enum: ["yes", "no", "unknown"],
    }).default("unknown").notNull(),
    lastAnnualReport: text("last_annual_report"), // e.g. "2024" from allabolag

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
    index("entity_stack_org_idx").on(table.stackOrgId),
    index("entity_org_number_idx").on(table.orgNumber),
    index("entity_activity_status_idx").on(table.activityStatus),
  ],
);
