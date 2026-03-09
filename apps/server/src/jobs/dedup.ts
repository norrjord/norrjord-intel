/**
 * Norrjord Intel — Entity Deduplication
 *
 * Finds entities that share the same org number and merges them.
 * Keeps the entity with the most data (AI analysis, enrichment, etc.)
 * and transfers all relations from the duplicate to the keeper.
 *
 * Usage:
 *   bun src/jobs/dedup.ts              — find and merge all duplicates
 *   bun src/jobs/dedup.ts --dry-run    — preview without merging
 */

import { db, eq, sql, inArray } from "@norrjord-intel/db";
import {
  entity,
  entitySource,
  contact,
  aiAnalysis,
  relationshipStatus,
  interaction,
  draft,
} from "@norrjord-intel/db/schema";

// ─── Find duplicate groups by org number ─────────────────

async function findDuplicateGroups(): Promise<Map<string, string[]>> {
  // Find org numbers that appear more than once
  const dupes = await db
    .select({
      orgNumber: entity.orgNumber,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(entity)
    .where(sql`${entity.orgNumber} IS NOT NULL`)
    .groupBy(entity.orgNumber)
    .having(sql`count(*) > 1`);

  const groups = new Map<string, string[]>();

  for (const dupe of dupes) {
    if (!dupe.orgNumber) continue;

    const entities = await db
      .select({ id: entity.id })
      .from(entity)
      .where(eq(entity.orgNumber, dupe.orgNumber));

    groups.set(
      dupe.orgNumber,
      entities.map((e) => e.id),
    );
  }

  return groups;
}

// ─── Score an entity to decide which to keep ─────────────

interface EntityForScoring {
  id: string;
  name: string | null;
  domain: string | null;
  orgNumber: string | null;
  enrichedAt: Date | null;
  websiteUrl: string | null;
  revenue: number | null;
  companyName: string | null;
  municipality: string | null;
  rawExtractedText: string | null;
}

function scoreEntity(ent: EntityForScoring, analysisCount: number): number {
  let score = 0;

  // Has enrichment data
  if (ent.enrichedAt) score += 10;
  if (ent.revenue) score += 5;
  if (ent.companyName) score += 3;
  if (ent.municipality) score += 2;

  // Has AI analyses
  score += analysisCount * 8;

  // Has website content
  if (ent.websiteUrl) score += 3;
  if (ent.domain) score += 2;
  if (ent.rawExtractedText) score += 4;

  // Has basic info
  if (ent.name) score += 1;

  return score;
}

// ─── Merge two entities ──────────────────────────────────

async function mergeEntities(keepId: string, removeId: string): Promise<void> {
  // Transfer all child records from removeId to keepId
  await db.update(entitySource).set({ entityId: keepId }).where(eq(entitySource.entityId, removeId));
  await db.update(aiAnalysis).set({ entityId: keepId }).where(eq(aiAnalysis.entityId, removeId));
  await db.update(interaction).set({ entityId: keepId }).where(eq(interaction.entityId, removeId));
  await db.update(draft).set({ entityId: keepId }).where(eq(draft.entityId, removeId));

  // Contacts — skip duplicates (same email)
  const keepContacts = await db.select({ email: contact.email }).from(contact).where(eq(contact.entityId, keepId));
  const keepEmails = new Set(keepContacts.map((c) => c.email).filter(Boolean));

  const removeContacts = await db.select({ id: contact.id, email: contact.email }).from(contact).where(eq(contact.entityId, removeId));
  for (const c of removeContacts) {
    if (c.email && keepEmails.has(c.email)) {
      await db.delete(contact).where(eq(contact.id, c.id));
    } else {
      await db.update(contact).set({ entityId: keepId }).where(eq(contact.id, c.id));
    }
  }

  // Relationship status — skip if keeper already has same pipeline type
  const keepRels = await db.select({ pipelineType: relationshipStatus.pipelineType }).from(relationshipStatus).where(eq(relationshipStatus.entityId, keepId));
  const keepPipelines = new Set(keepRels.map((r) => r.pipelineType));

  const removeRels = await db.select({ id: relationshipStatus.id, pipelineType: relationshipStatus.pipelineType }).from(relationshipStatus).where(eq(relationshipStatus.entityId, removeId));
  for (const r of removeRels) {
    if (keepPipelines.has(r.pipelineType)) {
      await db.delete(relationshipStatus).where(eq(relationshipStatus.id, r.id));
    } else {
      await db.update(relationshipStatus).set({ entityId: keepId }).where(eq(relationshipStatus.id, r.id));
    }
  }

  // Merge fields — fill in blanks on keeper from the removed entity
  const [keeper] = await db.select().from(entity).where(eq(entity.id, keepId));
  const [removed] = await db.select().from(entity).where(eq(entity.id, removeId));

  if (keeper && removed) {
    const updates: Record<string, unknown> = {};

    // Fill in missing fields from removed entity
    const fields = [
      "name", "domain", "websiteUrl", "regionText", "orgNumber",
      "sourceUrl", "rawExtractedText", "companyName", "companyForm",
      "registeredAddress", "registeredCity", "postalCode",
      "municipality", "county", "latitude", "longitude",
      "revenue", "profit", "employeeCount", "sniCode", "sniDescription",
      "enrichedAt", "enrichmentSource", "enrichmentRaw", "stackOrgId",
    ] as const;

    for (const field of fields) {
      if (keeper[field] == null && removed[field] != null) {
        updates[field] = removed[field];
      }
    }

    // Prefer the non-unknown entity type
    if (keeper.entityType === "unknown" && removed.entityType !== "unknown") {
      updates.entityType = removed.entityType;
    }
    if (keeper.productionType === "unknown" && removed.productionType !== "unknown") {
      updates.productionType = removed.productionType;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(entity).set(updates).where(eq(entity.id, keepId));
    }
  }

  // Delete the duplicate
  await db.delete(entity).where(eq(entity.id, removeId));
}

// ─── Main ────────────────────────────────────────────────

export async function deduplicateEntities(dryRun = false): Promise<{ merged: number; groups: number }> {
  const groups = await findDuplicateGroups();

  if (groups.size === 0) {
    console.log("[dedup] No duplicate entities found");
    return { merged: 0, groups: 0 };
  }

  console.log(`[dedup] Found ${groups.size} duplicate groups\n`);

  let merged = 0;

  for (const [orgNr, ids] of groups) {
    // Load full entities
    const entities = await db
      .select()
      .from(entity)
      .where(inArray(entity.id, ids));

    // Count analyses per entity
    const analysisCounts = new Map<string, number>();
    for (const ent of entities) {
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(aiAnalysis)
        .where(eq(aiAnalysis.entityId, ent.id));
      analysisCounts.set(ent.id, result?.count ?? 0);
    }

    // Score each entity, keep the best
    const scored = entities
      .map((ent) => ({
        entity: ent,
        score: scoreEntity(ent as EntityForScoring, analysisCounts.get(ent.id) ?? 0),
      }))
      .sort((a, b) => b.score - a.score);

    const keeper = scored[0]!;
    const duplicates = scored.slice(1);

    console.log(`[dedup] Org ${orgNr}:`);
    console.log(`  Keep: ${keeper.entity.name ?? keeper.entity.domain ?? keeper.entity.id} (score: ${keeper.score})`);
    for (const dup of duplicates) {
      console.log(`  Remove: ${dup.entity.name ?? dup.entity.domain ?? dup.entity.id} (score: ${dup.score})`);
    }

    if (!dryRun) {
      for (const dup of duplicates) {
        await mergeEntities(keeper.entity.id, dup.entity.id);
        merged++;
      }
      console.log(`  Merged ${duplicates.length} duplicate(s)\n`);
    } else {
      console.log(`  (dry run — not merging)\n`);
    }
  }

  return { merged, groups: groups.size };
}

// ─── CLI entry ───────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("═══════════════════════════════════════════════");
  console.log("  Norrjord Intel — Entity Deduplication");
  console.log("═══════════════════════════════════════════════");
  if (dryRun) console.log("  Mode: DRY RUN");
  console.log("═══════════════════════════════════════════════\n");

  const result = await deduplicateEntities(dryRun);

  console.log("═══════════════════════════════════════════════");
  console.log(`  Duplicate groups: ${result.groups}`);
  console.log(`  Entities merged:  ${result.merged}`);
  console.log("═══════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
