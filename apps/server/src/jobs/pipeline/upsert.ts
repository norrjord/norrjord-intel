/**
 * Pipeline Step 5: Upsert
 *
 * Stores analyzed entities in the database.
 * - Upserts entity by domain (no duplicates)
 * - Inserts entity_source
 * - Upserts contacts (by email)
 * - Appends ai_analysis (never overwrites)
 * - Ensures relationship_status exists for inferred pipeline
 */

import { eq, and, sql } from "@norrjord-intel/db";
import { db } from "@norrjord-intel/db";
import {
  entity,
  entitySource,
  contact,
  aiAnalysis,
} from "@norrjord-intel/db/schema";
import { PIPELINE_CONFIG, type RunStats } from "./config";
import type { AnalyzedCandidate } from "./analyze";

// ─── Upsert a single analyzed candidate ─────────────────

async function upsertOne(candidate: AnalyzedCandidate, stats: RunStats): Promise<void> {
  const { analysis, classification } = candidate;
  const extracted = analysis.extracted;

  // Determine entity type from classification + analysis
  const entityType =
    classification.entity_type_guess !== "unknown" ? classification.entity_type_guess : "unknown";

  const productionType = extracted.production_type ?? "unknown";

  // ─── 1. Upsert entity by domain ────────────────────

  const existing = await db.query.entity.findFirst({
    where: eq(entity.domain, candidate.domain),
  });

  let entityId: string;

  if (existing) {
    // Update with potentially better data
    await db
      .update(entity)
      .set({
        name: extracted.name ?? existing.name,
        entityType: entityType as any,
        productionType: productionType as any,
        regionText: extracted.region_text ?? existing.regionText,
        rawExtractedText: candidate.combinedText,
        updatedAt: new Date(),
      })
      .where(eq(entity.id, existing.id));

    entityId = existing.id;
    stats.entitiesUpdated++;
  } else {
    const [inserted] = await db
      .insert(entity)
      .values({
        name: extracted.name,
        websiteUrl: candidate.url,
        domain: candidate.domain,
        entityType: entityType as any,
        productionType: productionType as any,
        regionText: extracted.region_text,
        orgNumber: null,
        sourceUrl: candidate.url,
        rawExtractedText: candidate.combinedText,
      })
      .returning({ id: entity.id });

    if (!inserted) throw new Error("Failed to insert entity");
    entityId = inserted.id;
    stats.entitiesCreated++;
  }

  // ─── 2. Insert entity source ────────────────────────

  await db.insert(entitySource).values({
    entityId,
    sourceType: "search_api",
    sourceQuery: candidate.sourceQuery,
    sourceUrl: candidate.url,
  });

  // ─── 3. Upsert contacts (emails found) ─────────────

  const allEmails = [...new Set([...candidate.emails, ...(extracted.contact_emails_found ?? [])])];

  for (const email of allEmails) {
    // Check if this email already exists for this entity
    const existingContact = await db.query.contact.findFirst({
      where: and(eq(contact.entityId, entityId), eq(contact.email, email)),
    });

    if (!existingContact) {
      await db.insert(contact).values({
        entityId,
        email,
        isPrimary: allEmails.indexOf(email) === 0, // first email = primary
        sourceUrl: candidate.url,
      });
    }
  }

  // ─── 4. Append ai_analysis (never overwrite) ───────

  await db.insert(aiAnalysis).values({
    entityId,
    modelName: PIPELINE_CONFIG.analyzeModel,
    analysisType: "deep",
    pilotFitScore: analysis.scores.pilot_fit,
    investorFitScore: analysis.scores.investor_fit,
    modernizationScore: analysis.scores.modernization,
    scaleScore: analysis.scores.scale,
    summary: analysis.summary,
    suggestedAngle: analysis.suggested_angle,
    extractedFacts: analysis.extracted as any,
    rawOutputJson: analysis as any,
  });

  // Note: Entities are NOT auto-added to pipeline.
  // User manually selects entities and sends them to pipeline via UI.
}

// ─── Upsert all analyzed candidates ─────────────────────

export async function upsertCandidates(
  candidates: AnalyzedCandidate[],
  stats: RunStats,
): Promise<void> {
  console.log(`[upsert] Storing ${candidates.length} entities...`);

  let stored = 0;

  for (const candidate of candidates) {
    if (stored >= PIPELINE_CONFIG.maxEntitiesToCreatePerRun) {
      console.log(
        `[upsert] Hit entity creation cap (${PIPELINE_CONFIG.maxEntitiesToCreatePerRun}), stopping`,
      );
      break;
    }

    try {
      await upsertOne(candidate, stats);
      stored++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[upsert] Failed for ${candidate.domain}:`, message);
      stats.errors.push({
        url: candidate.url,
        step: "upsert",
        message,
      });
    }
  }

  console.log(`[upsert] Done: ${stats.entitiesCreated} created, ${stats.entitiesUpdated} updated`);
}

// ─── Helper: get all existing domains for dedup ─────────

export async function getUnenrichedEntities() {
  return db
    .select({
      id: entity.id,
      name: entity.name,
      orgNumber: entity.orgNumber,
      domain: entity.domain,
    })
    .from(entity)
    .where(sql`${entity.enrichedAt} IS NULL`);
}

export async function getExistingDomains(): Promise<Set<string>> {
  const rows = await db.select({ domain: entity.domain }).from(entity);

  return new Set(rows.map((r) => r.domain).filter((d): d is string => d !== null));
}
