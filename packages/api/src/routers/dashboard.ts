import { db, eq, desc, sql, count, and } from "@norrjord-intel/db";
import {
  entity,
  relationshipStatus,
  interaction,
  discoveryRun,
} from "@norrjord-intel/db/schema";

import { protectedProcedure } from "../index";

export const dashboardRouter = {
  getStats: protectedProcedure.handler(async () => {
    // Pipeline stage counts
    const stageCounts = await db
      .select({
        stage: relationshipStatus.stage,
        count: count(),
      })
      .from(relationshipStatus)
      .groupBy(relationshipStatus.stage);

    // Upcoming follow-ups (next 7 days)
    const upcomingFollowUps = await db
      .select({
        relationshipId: relationshipStatus.id,
        stage: relationshipStatus.stage,
        pipelineType: relationshipStatus.pipelineType,
        nextActionDate: relationshipStatus.nextActionDate,
        owner: relationshipStatus.owner,
        entityId: entity.id,
        entityName: entity.name,
        entityDomain: entity.domain,
        productionType: entity.productionType,
      })
      .from(relationshipStatus)
      .innerJoin(entity, eq(relationshipStatus.entityId, entity.id))
      .where(
        and(
          sql`${relationshipStatus.nextActionDate} IS NOT NULL`,
          sql`${relationshipStatus.nextActionDate} <= NOW() + INTERVAL '7 days'`,
        ),
      )
      .orderBy(relationshipStatus.nextActionDate)
      .limit(10);

    // Recent interactions
    const recentInteractions = await db
      .select({
        id: interaction.id,
        type: interaction.type,
        content: interaction.content,
        occurredAt: interaction.occurredAt,
        entityId: entity.id,
        entityName: entity.name,
      })
      .from(interaction)
      .innerJoin(entity, eq(interaction.entityId, entity.id))
      .orderBy(desc(interaction.occurredAt))
      .limit(10);

    // Latest discovery run
    const [latestRun] = await db
      .select()
      .from(discoveryRun)
      .orderBy(desc(discoveryRun.startedAt))
      .limit(1);

    // Total entities count
    const [totalEntities] = await db
      .select({ total: count() })
      .from(entity);

    // Conversion rate
    const totalRelationships = stageCounts.reduce(
      (sum, s) => sum + Number(s.count),
      0,
    );
    const closedWon =
      Number(stageCounts.find((s) => s.stage === "closed_won")?.count) || 0;
    const conversionRate =
      totalRelationships > 0
        ? Math.round((closedWon / totalRelationships) * 100)
        : 0;

    return {
      stageCounts,
      upcomingFollowUps,
      recentInteractions,
      latestRun,
      totalEntities: totalEntities?.total ?? 0,
      conversionRate,
    };
  }),
};
