import { db, eq, and, desc } from "@norrjord-intel/db";
import {
  entity,
  relationshipStatus,
  aiAnalysis,
  interaction,
} from "@norrjord-intel/db/schema";
import z from "zod";

import { protectedProcedure } from "../index";

const stageEnum = z.enum([
  "new",
  "reviewed",
  "contacted",
  "replied",
  "meeting_booked",
  "negotiating",
  "closed_won",
  "closed_lost",
]);

const pipelineTypeEnum = z.enum(["pilot", "partner", "investor"]);

export const pipelineRouter = {
  getBoard: protectedProcedure
    .input(
      z
        .object({
          pipelineType: pipelineTypeEnum.optional(),
        })
        .optional(),
    )
    .handler(async ({ input }) => {
      const conditions = [];
      if (input?.pipelineType) {
        conditions.push(
          eq(relationshipStatus.pipelineType, input.pipelineType),
        );
      }

      const rows = await db
        .select({
          relationshipId: relationshipStatus.id,
          stage: relationshipStatus.stage,
          priority: relationshipStatus.priority,
          owner: relationshipStatus.owner,
          nextActionDate: relationshipStatus.nextActionDate,
          lastContactedAt: relationshipStatus.lastContactedAt,
          pipelineType: relationshipStatus.pipelineType,
          notes: relationshipStatus.notes,
          entityId: entity.id,
          entityName: entity.name,
          entityDomain: entity.domain,
          entityType: entity.entityType,
          productionType: entity.productionType,
          regionText: entity.regionText,
          stackOrgId: entity.stackOrgId,
          pilotFitScore: aiAnalysis.pilotFitScore,
          investorFitScore: aiAnalysis.investorFitScore,
        })
        .from(relationshipStatus)
        .innerJoin(entity, eq(relationshipStatus.entityId, entity.id))
        .leftJoin(
          aiAnalysis,
          and(
            eq(entity.id, aiAnalysis.entityId),
            eq(aiAnalysis.analysisType, "deep"),
          ),
        )
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(relationshipStatus.priority, desc(entity.updatedAt));

      // Group by stage
      const stages = [
        "new",
        "reviewed",
        "contacted",
        "replied",
        "meeting_booked",
        "negotiating",
        "closed_won",
        "closed_lost",
      ] as const;

      const board: Record<string, typeof rows> = {};
      for (const stage of stages) {
        board[stage] = rows.filter((r) => r.stage === stage);
      }

      return board;
    }),

  getByEntity: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .handler(async ({ input }) => {
      return await db
        .select()
        .from(relationshipStatus)
        .where(eq(relationshipStatus.entityId, input.entityId));
    }),

  create: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        pipelineType: pipelineTypeEnum,
        stage: stageEnum.default("new"),
        priority: z.number().min(1).max(5).default(3),
        owner: z.string().default("henrik"),
        nextActionDate: z.string().datetime().optional(),
        notes: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const [created] = await db
        .insert(relationshipStatus)
        .values({
          ...input,
          nextActionDate: input.nextActionDate
            ? new Date(input.nextActionDate)
            : undefined,
        })
        .returning();

      return created;
    }),

  updateStage: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        stage: stageEnum,
      }),
    )
    .handler(async ({ input }) => {
      const updateData: Record<string, unknown> = {
        stage: input.stage,
      };

      if (
        input.stage === "contacted" ||
        input.stage === "replied" ||
        input.stage === "meeting_booked"
      ) {
        updateData.lastContactedAt = new Date();
      }

      const [updated] = await db
        .update(relationshipStatus)
        .set(updateData)
        .where(eq(relationshipStatus.id, input.id))
        .returning();

      if (updated) {
        // Auto-log interaction for stage change
        await db.insert(interaction).values({
          entityId: updated.entityId,
          type: "note",
          content: `Pipeline stage changed to "${input.stage}"`,
        });
      }

      return updated;
    }),

  /** Quick stage update by entity ID (for the entity list) */
  updateStageByEntity: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        stage: stageEnum,
        pipelineType: pipelineTypeEnum.default("pilot"),
      }),
    )
    .handler(async ({ input }) => {
      // Find or create the relationship
      let rel = await db.query.relationshipStatus.findFirst({
        where: and(
          eq(relationshipStatus.entityId, input.entityId),
          eq(relationshipStatus.pipelineType, input.pipelineType),
        ),
      });

      if (!rel) {
        const [created] = await db
          .insert(relationshipStatus)
          .values({
            entityId: input.entityId,
            pipelineType: input.pipelineType,
            stage: input.stage,
            priority: 2,
          })
          .returning();
        rel = created!;
      } else {
        const updateData: Record<string, unknown> = { stage: input.stage };
        if (["contacted", "replied", "meeting_booked"].includes(input.stage)) {
          updateData.lastContactedAt = new Date();
        }
        const [updated] = await db
          .update(relationshipStatus)
          .set(updateData)
          .where(eq(relationshipStatus.id, rel.id))
          .returning();
        rel = updated!;
      }

      // Auto-log interaction
      await db.insert(interaction).values({
        entityId: input.entityId,
        type: "note",
        content: `Pipeline stage changed to "${input.stage}"`,
      });

      return rel;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        priority: z.number().min(1).max(5).optional(),
        owner: z.string().optional(),
        nextActionDate: z.string().datetime().nullable().optional(),
        notes: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const { id, ...data } = input;
      const [updated] = await db
        .update(relationshipStatus)
        .set({
          ...data,
          nextActionDate:
            data.nextActionDate === null
              ? null
              : data.nextActionDate
                ? new Date(data.nextActionDate)
                : undefined,
        })
        .where(eq(relationshipStatus.id, id))
        .returning();

      return updated;
    }),
};
