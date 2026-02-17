import { pgTable, index, text, timestamp, uuid, integer, jsonb, serial, boolean, foreignKey, unique, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const analysisType = pgEnum("analysis_type", ['classify', 'deep', 'draft'])
export const entityType = pgEnum("entity_type", ['producer', 'partner', 'investor', 'unknown'])
export const interactionType = pgEnum("interaction_type", ['note', 'call', 'email_sent_manual', 'meeting'])
export const pipelineStage = pgEnum("pipeline_stage", ['new', 'reviewed', 'contacted', 'replied', 'meeting_booked', 'negotiating', 'closed_won', 'closed_lost'])
export const pipelineType = pgEnum("pipeline_type", ['pilot', 'partner', 'investor'])
export const productionType = pgEnum("production_type", ['beef', 'lamb', 'pork', 'game', 'poultry', 'mixed', 'unknown'])
export const sourceType = pgEnum("source_type", ['search_api', 'manual', 'referral'])


export const verification = pgTable("verification", {
	id: text().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("verification_identifier_idx").using("btree", table.identifier.asc().nullsLast().op("text_ops")),
]);

export const discoveryRun = pgTable("discovery_run", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	queriesExecuted: integer("queries_executed").default(0).notNull(),
	urlsFound: integer("urls_found").default(0).notNull(),
	urlsFetched: integer("urls_fetched").default(0).notNull(),
	classified: integer().default(0).notNull(),
	relevantFound: integer("relevant_found").default(0).notNull(),
	deepAnalyzed: integer("deep_analyzed").default(0).notNull(),
	entitiesCreated: integer("entities_created").default(0).notNull(),
	entitiesUpdated: integer("entities_updated").default(0).notNull(),
	errors: jsonb().default([]),
	config: jsonb(),
});

export const todo = pgTable("todo", {
	id: serial().primaryKey().notNull(),
	text: text().notNull(),
	completed: boolean().default(false).notNull(),
});

export const entity = pgTable("entity", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text(),
	websiteUrl: text("website_url"),
	domain: text(),
	country: text().default('SE').notNull(),
	regionText: text("region_text"),
	entityType: entityType("entity_type").default('unknown').notNull(),
	productionType: productionType("production_type").default('unknown').notNull(),
	orgNumber: text("org_number"),
	sourceUrl: text("source_url"),
	rawExtractedText: text("raw_extracted_text"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("entity_domain_idx").using("btree", table.domain.asc().nullsLast().op("text_ops")),
	index("entity_production_type_idx").using("btree", table.productionType.asc().nullsLast().op("enum_ops")),
	index("entity_region_idx").using("btree", table.regionText.asc().nullsLast().op("text_ops")),
	index("entity_type_idx").using("btree", table.entityType.asc().nullsLast().op("enum_ops")),
]);

export const aiAnalysis = pgTable("ai_analysis", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	entityId: uuid("entity_id").notNull(),
	modelName: text("model_name").notNull(),
	analysisType: analysisType("analysis_type").notNull(),
	pilotFitScore: integer("pilot_fit_score"),
	investorFitScore: integer("investor_fit_score"),
	modernizationScore: integer("modernization_score"),
	scaleScore: integer("scale_score"),
	summary: text(),
	suggestedAngle: text("suggested_angle"),
	extractedFacts: jsonb("extracted_facts"),
	rawOutputJson: jsonb("raw_output_json"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_analysis_entity_idx").using("btree", table.entityId.asc().nullsLast().op("uuid_ops")),
	index("ai_analysis_investor_score_idx").using("btree", table.investorFitScore.asc().nullsLast().op("int4_ops")),
	index("ai_analysis_pilot_score_idx").using("btree", table.pilotFitScore.asc().nullsLast().op("int4_ops")),
	index("ai_analysis_type_idx").using("btree", table.analysisType.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.entityId],
			foreignColumns: [entity.id],
			name: "ai_analysis_entity_id_entity_id_fk"
		}).onDelete("cascade"),
]);

export const user = pgTable("user", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("user_email_unique").on(table.email),
]);

export const account = pgTable("account", {
	id: text().primaryKey().notNull(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: 'string' }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: 'string' }),
	scope: text(),
	password: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
}, (table) => [
	index("account_userId_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "account_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const session = pgTable("session", {
	id: text().primaryKey().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	token: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull(),
}, (table) => [
	index("session_userId_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "session_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("session_token_unique").on(table.token),
]);

export const contact = pgTable("contact", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	entityId: uuid("entity_id").notNull(),
	name: text(),
	email: text(),
	phone: text(),
	roleTitle: text("role_title"),
	isPrimary: boolean("is_primary").default(false).notNull(),
	sourceUrl: text("source_url"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("contact_email_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("contact_entity_idx").using("btree", table.entityId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.entityId],
			foreignColumns: [entity.id],
			name: "contact_entity_id_entity_id_fk"
		}).onDelete("cascade"),
]);

export const draft = pgTable("draft", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	entityId: uuid("entity_id").notNull(),
	subject: text().notNull(),
	body: text().notNull(),
	createdByAi: boolean("created_by_ai").default(true).notNull(),
	approved: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("draft_entity_idx").using("btree", table.entityId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.entityId],
			foreignColumns: [entity.id],
			name: "draft_entity_id_entity_id_fk"
		}).onDelete("cascade"),
]);

export const entitySource = pgTable("entity_source", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	entityId: uuid("entity_id").notNull(),
	sourceType: sourceType("source_type").notNull(),
	sourceQuery: text("source_query"),
	sourceUrl: text("source_url"),
	discoveredAt: timestamp("discovered_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("entity_source_entity_idx").using("btree", table.entityId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.entityId],
			foreignColumns: [entity.id],
			name: "entity_source_entity_id_entity_id_fk"
		}).onDelete("cascade"),
]);

export const relationshipStatus = pgTable("relationship_status", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	entityId: uuid("entity_id").notNull(),
	pipelineType: pipelineType("pipeline_type").notNull(),
	stage: pipelineStage().default('new').notNull(),
	priority: integer().default(3).notNull(),
	owner: text().default('henrik').notNull(),
	lastContactedAt: timestamp("last_contacted_at", { mode: 'string' }),
	nextActionDate: timestamp("next_action_date", { mode: 'string' }),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("rel_status_entity_idx").using("btree", table.entityId.asc().nullsLast().op("uuid_ops")),
	index("rel_status_pipeline_idx").using("btree", table.pipelineType.asc().nullsLast().op("enum_ops")),
	index("rel_status_stage_idx").using("btree", table.stage.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.entityId],
			foreignColumns: [entity.id],
			name: "relationship_status_entity_id_entity_id_fk"
		}).onDelete("cascade"),
	unique("rel_status_entity_pipeline_unique").on(table.entityId, table.pipelineType),
]);

export const interaction = pgTable("interaction", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	entityId: uuid("entity_id").notNull(),
	type: interactionType().notNull(),
	occurredAt: timestamp("occurred_at", { mode: 'string' }).defaultNow().notNull(),
	content: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("interaction_entity_idx").using("btree", table.entityId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.entityId],
			foreignColumns: [entity.id],
			name: "interaction_entity_id_entity_id_fk"
		}).onDelete("cascade"),
]);
