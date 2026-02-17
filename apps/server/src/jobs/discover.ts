/**
 * Norrjord Intel — Overnight Discovery Pipeline
 *
 * Usage: bun run discover
 *
 * This is a deterministic batch job, NOT an autonomous agent.
 * It runs sequentially:
 *   1. Search (Serper API)
 *   2. Fetch (website text extraction)
 *   3. Classify (Claude Haiku — cheap first pass)
 *   4. Analyze (Claude Sonnet — deep scoring)
 *   5. Upsert (store in Neon Postgres)
 *
 * Then prints a summary and exits.
 */

import { eq } from "@norrjord-intel/db";
import { db } from "@norrjord-intel/db";
import { discoveryRun } from "@norrjord-intel/db/schema";
import { getUsageSummary, resetUsageLog } from "../lib/claude";
import { getAllQueries } from "./query-matrix";
import { PIPELINE_CONFIG, createEmptyStats, type RunStats } from "./pipeline/config";
import { runSearch } from "./pipeline/search";
import { fetchCandidates } from "./pipeline/fetch-site";
import { classifyCandidates } from "./pipeline/classify";
import { analyzeCandidates } from "./pipeline/analyze";
import { upsertCandidates, getExistingDomains } from "./pipeline/upsert";

let pipelineStartTime = Date.now();

// ─── Main pipeline ──────────────────────────────────────

async function main() {
  pipelineStartTime = Date.now();
  const stats: RunStats = createEmptyStats();

  console.log("═══════════════════════════════════════════════");
  console.log("  Norrjord Intel — Discovery Pipeline");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Started at: ${new Date().toISOString()}`);
  console.log(`  Max queries: ${PIPELINE_CONFIG.maxQueriesPerRun}`);
  console.log(`  Classify model: ${PIPELINE_CONFIG.classifyModel}`);
  console.log(`  Analyze model: ${PIPELINE_CONFIG.analyzeModel}`);
  console.log("═══════════════════════════════════════════════\n");

  resetUsageLog();

  // ─── Create run record ──────────────────────────────

  const [run] = await db
    .insert(discoveryRun)
    .values({
      config: {
        maxQueries: PIPELINE_CONFIG.maxQueriesPerRun,
        classifyModel: PIPELINE_CONFIG.classifyModel,
        analyzeModel: PIPELINE_CONFIG.analyzeModel,
        thresholds: {
          classifyConfidence: PIPELINE_CONFIG.classifyConfidenceThreshold,
          minPilotScore: PIPELINE_CONFIG.minPilotScoreToStore,
          minInvestorScore: PIPELINE_CONFIG.minInvestorScoreToStore,
        },
      },
    })
    .returning({ id: discoveryRun.id });

  if (!run) {
    console.error("Failed to create discovery run record");
    process.exit(1);
  }

  try {
    // ─── Step 1: Search ─────────────────────────────────

    const queries = getAllQueries();
    const existingDomains = await getExistingDomains();
    console.log(`[init] ${existingDomains.size} domains already in database\n`);

    const candidates = await runSearch(queries, existingDomains, stats);

    if (candidates.length === 0) {
      console.log("\n[done] No new candidates found. Exiting.");
      await finalizeRun(run.id, stats);
      return;
    }

    // ─── Step 2: Fetch ──────────────────────────────────

    const fetched = await fetchCandidates(candidates, stats);

    if (fetched.length === 0) {
      console.log("\n[done] No fetchable content. Exiting.");
      await finalizeRun(run.id, stats);
      return;
    }

    // ─── Step 3: Classify ───────────────────────────────

    const classified = await classifyCandidates(fetched, stats);

    if (classified.length === 0) {
      console.log("\n[done] No relevant candidates after classification. Exiting.");
      await finalizeRun(run.id, stats);
      return;
    }

    // ─── Step 4: Analyze ────────────────────────────────

    const analyzed = await analyzeCandidates(classified, stats);

    if (analyzed.length === 0) {
      console.log("\n[done] No candidates above score threshold. Exiting.");
      await finalizeRun(run.id, stats);
      return;
    }

    // ─── Step 5: Upsert ─────────────────────────────────

    await upsertCandidates(analyzed, stats);

    // ─── Done ───────────────────────────────────────────

    await finalizeRun(run.id, stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("\n[FATAL]", message);
    stats.errors.push({ step: "pipeline", message });
    await finalizeRun(run.id, stats);
    process.exit(1);
  }
}

// ─── Finalize run record + print summary ────────────────

async function finalizeRun(runId: string, stats: RunStats) {
  const durationSec = Math.round((Date.now() - pipelineStartTime) / 1000);
  const usage = getUsageSummary();

  // Update run record
  await db
    .update(discoveryRun)
    .set({
      completedAt: new Date(),
      queriesExecuted: stats.queriesExecuted,
      urlsFound: stats.urlsFound,
      urlsFetched: stats.urlsFetched,
      classified: stats.classified,
      relevantFound: stats.relevantFound,
      deepAnalyzed: stats.deepAnalyzed,
      entitiesCreated: stats.entitiesCreated,
      entitiesUpdated: stats.entitiesUpdated,
      errors: stats.errors as any,
    })
    .where(eq(discoveryRun.id, runId));

  // Print summary
  console.log("\n═══════════════════════════════════════════════");
  console.log("  DISCOVERY RUN COMPLETE");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Queries executed:  ${stats.queriesExecuted}`);
  console.log(`  URLs found:        ${stats.urlsFound}`);
  console.log(`  URLs fetched:      ${stats.urlsFetched}`);
  console.log(`  Classified:        ${stats.classified}`);
  console.log(`  Relevant:          ${stats.relevantFound}`);
  console.log(`  Deep analyzed:     ${stats.deepAnalyzed}`);
  console.log(`  Entities created:  ${stats.entitiesCreated}`);
  console.log(`  Entities updated:  ${stats.entitiesUpdated}`);
  console.log(`  Errors:            ${stats.errors.length}`);
  console.log("───────────────────────────────────────────────");
  console.log(`  AI API calls:      ${JSON.stringify(usage.callsByModel)}`);
  console.log(`  Input tokens:      ${usage.totalInputTokens.toLocaleString()}`);
  console.log(`  Output tokens:     ${usage.totalOutputTokens.toLocaleString()}`);
  console.log(`  Duration:          ${Math.floor(durationSec / 60)}m ${durationSec % 60}s`);
  console.log("═══════════════════════════════════════════════\n");

  if (stats.errors.length > 0) {
    console.log("Errors:");
    for (const e of stats.errors.slice(0, 10)) {
      console.log(`  [${e.step}] ${e.url ?? "n/a"}: ${e.message}`);
    }
    if (stats.errors.length > 10) {
      console.log(`  ... and ${stats.errors.length - 10} more`);
    }
  }

  console.log(`\nCompleted at: ${new Date().toISOString()}`);
}

// ─── Run ────────────────────────────────────────────────

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
