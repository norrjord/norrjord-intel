import { relations } from "drizzle-orm/relations";
import { entity, aiAnalysis, user, account, session, contact, draft, entitySource, relationshipStatus, interaction } from "./schema";

export const aiAnalysisRelations = relations(aiAnalysis, ({one}) => ({
	entity: one(entity, {
		fields: [aiAnalysis.entityId],
		references: [entity.id]
	}),
}));

export const entityRelations = relations(entity, ({many}) => ({
	aiAnalyses: many(aiAnalysis),
	contacts: many(contact),
	drafts: many(draft),
	entitySources: many(entitySource),
	relationshipStatuses: many(relationshipStatus),
	interactions: many(interaction),
}));

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	accounts: many(account),
	sessions: many(session),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const contactRelations = relations(contact, ({one}) => ({
	entity: one(entity, {
		fields: [contact.entityId],
		references: [entity.id]
	}),
}));

export const draftRelations = relations(draft, ({one}) => ({
	entity: one(entity, {
		fields: [draft.entityId],
		references: [entity.id]
	}),
}));

export const entitySourceRelations = relations(entitySource, ({one}) => ({
	entity: one(entity, {
		fields: [entitySource.entityId],
		references: [entity.id]
	}),
}));

export const relationshipStatusRelations = relations(relationshipStatus, ({one}) => ({
	entity: one(entity, {
		fields: [relationshipStatus.entityId],
		references: [entity.id]
	}),
}));

export const interactionRelations = relations(interaction, ({one}) => ({
	entity: one(entity, {
		fields: [interaction.entityId],
		references: [entity.id]
	}),
}));