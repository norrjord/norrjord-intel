import { relations } from "drizzle-orm";

import { entity } from "./entity";
import { entitySource } from "./entity-source";
import { contact } from "./contact";
import { aiAnalysis } from "./ai-analysis";
import { relationshipStatus } from "./relationship-status";
import { interaction } from "./interaction";
import { draft } from "./draft";
import { outreachCampaign, outreachSend, emailTemplate } from "./outreach";
// ─── Entity relations ───────────────────────────────────

export const entityRelations = relations(entity, ({ many }) => ({
  sources: many(entitySource),
  contacts: many(contact),
  analyses: many(aiAnalysis),
  relationships: many(relationshipStatus),
  interactions: many(interaction),
  drafts: many(draft),
  outreachSends: many(outreachSend),
}));

// ─── Entity source relations ────────────────────────────

export const entitySourceRelations = relations(entitySource, ({ one }) => ({
  entity: one(entity, {
    fields: [entitySource.entityId],
    references: [entity.id],
  }),
}));

// ─── Contact relations ──────────────────────────────────

export const contactRelations = relations(contact, ({ one }) => ({
  entity: one(entity, {
    fields: [contact.entityId],
    references: [entity.id],
  }),
}));

// ─── AI analysis relations ──────────────────────────────

export const aiAnalysisRelations = relations(aiAnalysis, ({ one }) => ({
  entity: one(entity, {
    fields: [aiAnalysis.entityId],
    references: [entity.id],
  }),
}));

// ─── Relationship status relations ──────────────────────

export const relationshipStatusRelations = relations(
  relationshipStatus,
  ({ one }) => ({
    entity: one(entity, {
      fields: [relationshipStatus.entityId],
      references: [entity.id],
    }),
  }),
);

// ─── Interaction relations ──────────────────────────────

export const interactionRelations = relations(interaction, ({ one }) => ({
  entity: one(entity, {
    fields: [interaction.entityId],
    references: [entity.id],
  }),
}));

// ─── Draft relations ────────────────────────────────────

export const draftRelations = relations(draft, ({ one }) => ({
  entity: one(entity, {
    fields: [draft.entityId],
    references: [entity.id],
  }),
}));

// ─── Outreach relations ─────────────────────────────────

export const emailTemplateRelations = relations(emailTemplate, ({ many }) => ({
  campaigns: many(outreachCampaign),
}));

export const outreachCampaignRelations = relations(outreachCampaign, ({ one, many }) => ({
  template: one(emailTemplate, {
    fields: [outreachCampaign.templateId],
    references: [emailTemplate.id],
  }),
  sends: many(outreachSend),
}));

export const outreachSendRelations = relations(outreachSend, ({ one }) => ({
  campaign: one(outreachCampaign, {
    fields: [outreachSend.campaignId],
    references: [outreachCampaign.id],
  }),
  entity: one(entity, {
    fields: [outreachSend.entityId],
    references: [entity.id],
  }),
}));
