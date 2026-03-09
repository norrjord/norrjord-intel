import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { entity } from "./entity";

// ─── Email Templates ────────────────────────────────────

export const emailTemplate = pgTable("email_template", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ─── Outreach Campaigns ─────────────────────────────────

export const outreachCampaign = pgTable(
  "outreach_campaign",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => emailTemplate.id),
    status: text("status", { enum: ["draft", "sending", "completed", "failed"] })
      .default("draft")
      .notNull(),
    /** Filters used to select recipients */
    filters: jsonb("filters").$type<{
      minScore?: number;
      entityType?: string;
      productionType?: string;
      counties?: string[];
    }>(),
    totalRecipients: integer("total_recipients").default(0).notNull(),
    sentCount: integer("sent_count").default(0).notNull(),
    failedCount: integer("failed_count").default(0).notNull(),
    skippedCount: integer("skipped_count").default(0).notNull(),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("campaign_status_idx").on(table.status)],
);

// ─── Individual Email Sends ─────────────────────────────

export const outreachSend = pgTable(
  "outreach_send",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => outreachCampaign.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    contactName: text("contact_name"),
    status: text("status", { enum: ["sent", "failed", "skipped"] }).notNull(),
    resendId: text("resend_id"),
    error: text("error"),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (table) => [
    index("send_campaign_idx").on(table.campaignId),
    index("send_entity_idx").on(table.entityId),
    uniqueIndex("send_campaign_entity_idx").on(table.campaignId, table.entityId),
  ],
);
