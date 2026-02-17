import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  index,
  unique,
} from "drizzle-orm/pg-core";

import { pipelineTypeEnum, pipelineStageEnum } from "./enums";
import { entity } from "./entity";

export const relationshipStatus = pgTable(
  "relationship_status",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id, { onDelete: "cascade" }),
    pipelineType: pipelineTypeEnum("pipeline_type").notNull(),
    stage: pipelineStageEnum("stage").default("new").notNull(),
    priority: integer("priority").default(3).notNull(), // 1=highest, 5=lowest
    owner: text("owner").default("henrik").notNull(),
    lastContactedAt: timestamp("last_contacted_at"),
    nextActionDate: timestamp("next_action_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("rel_status_entity_idx").on(table.entityId),
    index("rel_status_pipeline_idx").on(table.pipelineType),
    index("rel_status_stage_idx").on(table.stage),
    unique("rel_status_entity_pipeline_unique").on(
      table.entityId,
      table.pipelineType,
    ),
  ],
);
