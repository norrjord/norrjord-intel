import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

import { analysisTypeEnum } from "./enums";
import { entity } from "./entity";

export const aiAnalysis = pgTable(
  "ai_analysis",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id, { onDelete: "cascade" }),
    modelName: text("model_name").notNull(),
    analysisType: analysisTypeEnum("analysis_type").notNull(),
    pilotFitScore: integer("pilot_fit_score"),
    investorFitScore: integer("investor_fit_score"),
    modernizationScore: integer("modernization_score"),
    scaleScore: integer("scale_score"),
    summary: text("summary"),
    suggestedAngle: text("suggested_angle"),
    extractedFacts: jsonb("extracted_facts"),
    rawOutputJson: jsonb("raw_output_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_analysis_entity_idx").on(table.entityId),
    index("ai_analysis_type_idx").on(table.analysisType),
    index("ai_analysis_pilot_score_idx").on(table.pilotFitScore),
    index("ai_analysis_investor_score_idx").on(table.investorFitScore),
  ],
);
