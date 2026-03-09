import { db, eq, and, ilike, desc, asc, sql, count, isNotNull } from "@norrjord-intel/db";
import {
  entity,
  relationshipStatus,
  aiAnalysis,
} from "@norrjord-intel/db/schema";
import z from "zod";

import { protectedProcedure } from "../index";

export const entityRouter = {
  getAll: protectedProcedure
    .input(
      z.object({
        entityType: z
          .enum(["producer", "partner", "investor", "unknown"])
          .optional(),
        productionType: z
          .enum(["beef", "lamb", "pork", "game", "poultry", "mixed", "unknown"])
          .optional(),
        region: z.string().optional(),
        counties: z.array(z.string()).optional(),
        inPipeline: z.enum(["yes", "no", "all"]).default("all"),
        stage: z
          .enum([
            "new",
            "reviewed",
            "contacted",
            "replied",
            "meeting_booked",
            "negotiating",
            "closed_won",
            "closed_lost",
          ])
          .optional(),
        search: z.string().optional(),
        minScore: z.number().min(0).max(10).optional(),
        enriched: z.enum(["yes", "no"]).optional(),
        activityStatus: z
          .enum(["active", "likely_active", "likely_inactive", "inactive", "unknown"])
          .optional(),
        hideInactive: z.boolean().optional(),
        sortBy: z
          .enum(["score", "name", "updated", "revenue"])
          .default("score"),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .handler(async ({ input }) => {
      const filters = input;
      const conditions = [];

      if (filters.entityType) {
        conditions.push(eq(entity.entityType, filters.entityType));
      }
      if (filters.productionType) {
        conditions.push(eq(entity.productionType, filters.productionType));
      }
      if (filters.region) {
        conditions.push(ilike(entity.regionText, `%${filters.region}%`));
      }
      if (filters.counties && filters.counties.length > 0) {
        // Match county OR municipality against any of the selected values
        const countyConditions = filters.counties.map(
          (c) => sql`(${ilike(entity.county, `%${c}%`)} OR ${ilike(entity.municipality, `%${c}%`)})`,
        );
        conditions.push(sql`(${sql.join(countyConditions, sql` OR `)})`);
      }
      if (filters.search) {
        const term = `%${filters.search}%`;
        conditions.push(
          sql`(${ilike(entity.name, term)} OR ${ilike(entity.domain, term)})`,
        );
      }
      if (filters.enriched === "yes") {
        conditions.push(isNotNull(entity.enrichedAt));
      } else if (filters.enriched === "no") {
        conditions.push(sql`${entity.enrichedAt} IS NULL`);
      }

      if (filters.activityStatus) {
        conditions.push(eq(entity.activityStatus, filters.activityStatus));
      }
      if (filters.hideInactive) {
        conditions.push(
          sql`${entity.activityStatus} NOT IN ('inactive', 'likely_inactive')`,
        );
      }

      if (filters.inPipeline === "yes") {
        conditions.push(sql`EXISTS (
          SELECT 1 FROM relationship_status rs WHERE rs.entity_id = ${entity.id}
        )`);
      } else if (filters.inPipeline === "no") {
        conditions.push(sql`NOT EXISTS (
          SELECT 1 FROM relationship_status rs WHERE rs.entity_id = ${entity.id}
        )`);
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      // Scalar subqueries to avoid JOIN row multiplication
      const pilotFitScoreSubquery = sql<number>`(
        SELECT a.pilot_fit_score FROM ai_analysis a
        WHERE a.entity_id = ${entity.id} AND a.analysis_type = 'deep'
        ORDER BY a.created_at DESC LIMIT 1
      )`;

      const sourceTypeSubquery = sql<string>`(
        SELECT s.source_type FROM entity_source s
        WHERE s.entity_id = ${entity.id}
        ORDER BY s.discovered_at ASC LIMIT 1
      )`;

      const sourceUrlSubquery = sql<string>`(
        SELECT s.source_url FROM entity_source s
        WHERE s.entity_id = ${entity.id}
        ORDER BY s.discovered_at ASC LIMIT 1
      )`;

      const scoreCondition = filters.minScore
        ? sql`${pilotFitScoreSubquery} >= ${filters.minScore}`
        : undefined;

      const stageCondition = filters.stage
        ? eq(relationshipStatus.stage, filters.stage)
        : undefined;

      const fullWhere = and(where, scoreCondition, stageCondition);

      // Sort order
      const orderBy = (() => {
        switch (filters.sortBy) {
          case "score":
            return desc(sql`COALESCE(${pilotFitScoreSubquery}, 0)`);
          case "name":
            return asc(entity.name);
          case "revenue":
            return desc(sql`COALESCE(${entity.revenue}, 0)`);
          case "updated":
          default:
            return desc(entity.updatedAt);
        }
      })();

      // Get entities with their pilot pipeline stage and best pilot score.
      // Only JOIN relationship_status (unique per entity+pipeline).
      // Score comes from a scalar subquery to avoid row multiplication.
      const entities = await db
        .select({
          id: entity.id,
          name: entity.name,
          websiteUrl: entity.websiteUrl,
          domain: entity.domain,
          country: entity.country,
          regionText: entity.regionText,
          entityType: entity.entityType,
          productionType: entity.productionType,
          orgNumber: entity.orgNumber,
          stackOrgId: entity.stackOrgId,
          registrationPath: entity.registrationPath,
          // Enrichment data
          companyName: entity.companyName,
          companyForm: entity.companyForm,
          registeredCity: entity.registeredCity,
          postalCode: entity.postalCode,
          municipality: entity.municipality,
          county: entity.county,
          revenue: entity.revenue,
          profit: entity.profit,
          employeeCount: entity.employeeCount,
          sniDescription: entity.sniDescription,
          enrichedAt: entity.enrichedAt,
          activityStatus: entity.activityStatus,
          websiteAlive: entity.websiteAlive,
          companyStatus: entity.companyStatus,
          createdAt: entity.createdAt,
          updatedAt: entity.updatedAt,
          stage: relationshipStatus.stage,
          pipelineType: relationshipStatus.pipelineType,
          pilotFitScore: pilotFitScoreSubquery.as("pilotFitScore"),
          sourceType: sourceTypeSubquery.as("sourceType"),
          sourceUrl: sourceUrlSubquery.as("sourceUrl"),
          lastContactedAt: relationshipStatus.lastContactedAt,
          nextActionDate: relationshipStatus.nextActionDate,
        })
        .from(entity)
        .leftJoin(
          relationshipStatus,
          and(
            eq(entity.id, relationshipStatus.entityId),
            eq(relationshipStatus.pipelineType, "pilot"),
          ),
        )
        .where(fullWhere)
        .orderBy(orderBy)
        .limit(filters.limit ?? 50)
        .offset(filters.offset ?? 0);

      // Get total count for pagination (with same filters)
      const countQuery = db
        .select({ total: count() })
        .from(entity);
      if (filters.stage) {
        countQuery.leftJoin(
          relationshipStatus,
          and(
            eq(entity.id, relationshipStatus.entityId),
            eq(relationshipStatus.pipelineType, "pilot"),
          ),
        );
      }
      const [totalResult] = await countQuery.where(fullWhere);

      return {
        entities,
        total: totalResult?.total ?? 0,
      };
    }),

  /** Get all entity IDs matching filters (for "select all" across pages) */
  getAllIds: protectedProcedure
    .input(
      z.object({
        entityType: z.enum(["producer", "partner", "investor", "unknown"]).optional(),
        productionType: z.enum(["beef", "lamb", "pork", "game", "poultry", "mixed", "unknown"]).optional(),
        counties: z.array(z.string()).optional(),
        inPipeline: z.enum(["yes", "no", "all"]).default("all"),
        search: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const conditions = [];

      if (input.entityType) {
        conditions.push(eq(entity.entityType, input.entityType));
      }
      if (input.productionType) {
        conditions.push(eq(entity.productionType, input.productionType));
      }
      if (input.counties && input.counties.length > 0) {
        const countyConditions = input.counties.map(
          (c) => sql`(${ilike(entity.county, `%${c}%`)} OR ${ilike(entity.municipality, `%${c}%`)})`,
        );
        conditions.push(sql`(${sql.join(countyConditions, sql` OR `)})`);
      }
      if (input.search) {
        const term = `%${input.search}%`;
        conditions.push(
          sql`(${ilike(entity.name, term)} OR ${ilike(entity.domain, term)})`,
        );
      }
      if (input.inPipeline === "yes") {
        conditions.push(sql`EXISTS (SELECT 1 FROM relationship_status rs WHERE rs.entity_id = ${entity.id})`);
      } else if (input.inPipeline === "no") {
        conditions.push(sql`NOT EXISTS (SELECT 1 FROM relationship_status rs WHERE rs.entity_id = ${entity.id})`);
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const rows = await db
        .select({ id: entity.id })
        .from(entity)
        .where(where);

      return rows.map((r) => r.id);
    }),

  /** Get the latest deep analysis for an entity (for expandable score breakdown) */
  getAnalysis: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .handler(async ({ input }) => {
      const result = await db
        .select({
          pilotFitScore: aiAnalysis.pilotFitScore,
          investorFitScore: aiAnalysis.investorFitScore,
          modernizationScore: aiAnalysis.modernizationScore,
          scaleScore: aiAnalysis.scaleScore,
          summary: aiAnalysis.summary,
          suggestedAngle: aiAnalysis.suggestedAngle,
          extractedFacts: aiAnalysis.extractedFacts,
          rawOutputJson: aiAnalysis.rawOutputJson,
          analysisType: aiAnalysis.analysisType,
          createdAt: aiAnalysis.createdAt,
        })
        .from(aiAnalysis)
        .where(eq(aiAnalysis.entityId, input.entityId))
        .orderBy(desc(aiAnalysis.createdAt))
        .limit(1);

      return result[0] ?? null;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .handler(async ({ input }) => {
      const result = await db.query.entity.findFirst({
        where: eq(entity.id, input.id),
        with: {
          contacts: true,
          interactions: {
            orderBy: (interaction, { desc }) => [desc(interaction.occurredAt)],
          },
          analyses: {
            orderBy: (analysis, { desc }) => [desc(analysis.createdAt)],
          },
          relationships: true,
          drafts: {
            orderBy: (draft, { desc }) => [desc(draft.createdAt)],
          },
          sources: true,
        },
      });

      if (!result) {
        throw new Error("Entity not found");
      }

      return result;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        websiteUrl: z.string().optional(),
        domain: z.string().optional(),
        country: z.string().default("SE"),
        regionText: z.string().optional(),
        entityType: z
          .enum(["producer", "partner", "investor", "unknown"])
          .default("producer"),
        productionType: z
          .enum(["beef", "lamb", "pork", "game", "poultry", "mixed", "unknown"])
          .default("unknown"),
        orgNumber: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const [created] = await db
        .insert(entity)
        .values({
          ...input,
          domain: input.domain ?? input.websiteUrl?.replace(/^https?:\/\/(www\.)?/, "").split("/")[0],
        })
        .returning();

      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().optional(),
        websiteUrl: z.string().optional(),
        domain: z.string().optional(),
        regionText: z.string().optional(),
        entityType: z
          .enum(["producer", "partner", "investor", "unknown"])
          .optional(),
        productionType: z
          .enum(["beef", "lamb", "pork", "game", "poultry", "mixed", "unknown"])
          .optional(),
        orgNumber: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const { id, ...data } = input;
      const [updated] = await db
        .update(entity)
        .set(data)
        .where(eq(entity.id, id))
        .returning();

      return updated;
    }),

  /** Get all 21 Swedish counties with entity counts */
  getCounties: protectedProcedure.handler(async () => {
    // Canonical short names + patterns allabolag might store
    const SWEDISH_COUNTIES: { name: string; match: string[] }[] = [
      { name: "Blekinge", match: ["blekinge"] },
      { name: "Dalarna", match: ["dalarna", "dalarnas"] },
      { name: "Gävleborg", match: ["gävleborg", "gävleborgs"] },
      { name: "Gotland", match: ["gotland", "gotlands"] },
      { name: "Halland", match: ["halland", "hallands"] },
      { name: "Jämtland", match: ["jämtland", "jämtlands"] },
      { name: "Jönköping", match: ["jönköping", "jönköpings"] },
      { name: "Kalmar", match: ["kalmar"] },
      { name: "Kronoberg", match: ["kronoberg", "kronobergs"] },
      { name: "Norrbotten", match: ["norrbotten", "norrbottens"] },
      { name: "Skåne", match: ["skåne"] },
      { name: "Stockholm", match: ["stockholm", "stockholms"] },
      { name: "Södermanland", match: ["södermanland", "södermanlands"] },
      { name: "Uppsala", match: ["uppsala"] },
      { name: "Värmland", match: ["värmland", "värmlands"] },
      { name: "Västerbotten", match: ["västerbotten", "västerbottens"] },
      { name: "Västernorrland", match: ["västernorrland", "västernorrlands"] },
      { name: "Västmanland", match: ["västmanland", "västmanlands"] },
      { name: "Västra Götaland", match: ["västra götaland", "västra götalands"] },
      { name: "Örebro", match: ["örebro"] },
      { name: "Östergötland", match: ["östergötland", "östergötlands"] },
    ];

    // Get raw county values + counts from DB
    const rows = await db
      .select({
        county: entity.county,
        count: count(),
      })
      .from(entity)
      .where(isNotNull(entity.county))
      .groupBy(entity.county);

    // Match DB values to canonical counties (normalize: lowercase, strip " län")
    return SWEDISH_COUNTIES.map((c) => {
      let total = 0;
      for (const row of rows) {
        if (!row.county) continue;
        const normalized = row.county.toLowerCase().replace(/\s*län$/, "").trim();
        if (c.match.includes(normalized)) {
          total += row.count;
        }
      }
      return { name: c.name, count: total };
    });
  }),

  /** Send entities to pipeline (bulk) */
  sendToPipeline: protectedProcedure
    .input(
      z.object({
        entityIds: z.array(z.string().uuid()).min(1),
        pipelineType: z.enum(["pilot", "partner", "investor"]).default("pilot"),
      }),
    )
    .handler(async ({ input }) => {
      let created = 0;
      for (const entityId of input.entityIds) {
        // Check if already in this pipeline
        const existing = await db.query.relationshipStatus.findFirst({
          where: and(
            eq(relationshipStatus.entityId, entityId),
            eq(relationshipStatus.pipelineType, input.pipelineType),
          ),
        });
        if (existing) continue;

        await db.insert(relationshipStatus).values({
          entityId,
          pipelineType: input.pipelineType,
          stage: "new",
          priority: 2,
        });
        created++;
      }
      return { created, total: input.entityIds.length };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .handler(async ({ input }) => {
      await db.delete(entity).where(eq(entity.id, input.id));
      return { success: true };
    }),
};
