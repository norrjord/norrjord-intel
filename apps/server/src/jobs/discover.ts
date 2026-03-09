/**
 * Norrjord Intel — Discovery Pipeline
 *
 * Usage:
 *   bun run discover   — search all of Sweden for meat producers
 *
 * Runs sequentially:
 *   1. Search (Serper API) — Sweden-wide queries
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
import { PIPELINE_CONFIG, createEmptyStats, type RunStats } from "./pipeline/config";
import { runSearch } from "./pipeline/search";
import { fetchCandidates } from "./pipeline/fetch-site";
import { classifyCandidates } from "./pipeline/classify";
import { analyzeCandidates } from "./pipeline/analyze";
import { upsertCandidates, getExistingDomains, getUnenrichedEntities } from "./pipeline/upsert";
import { enrichEntity } from "./enrich";
import { deduplicateEntities } from "./dedup";

let pipelineStartTime = Date.now();

// ─── Global Sweden-wide search queries ──────────────────

const DISCOVERY_QUERIES = [
  // Direct sales — generic
  "köttproducent Sverige",
  "köttlåda beställa",
  "köttlåda hemleverans",
  "gårdsförsäljning kött",
  "köp kött direkt från gård",
  "gårdsbutik kött",
  "direktförsäljning kött",
  "köttlåda prenumeration",

  // By animal type
  "nötkött gård köpa",
  "lammkött gård köpa",
  "griskött gård köpa",
  "viltkött köpa",
  "naturbeteskött köpa",
  "gräsbetat nötkött",
  "ekologiskt kött gård",

  // Breeds / specialty
  "highland cattle kött Sverige",
  "angus nötkött gård",
  "hereford kött gård",

  // REKO
  "REKO ring kött producent",
  "REKO köttlåda",
  "REKO gårdsförsäljning kött",

  // Infrastructure / partners
  "slakteri Sverige",
  "gårdsslakteri",
  "styckeri kött",
  "mobilt slakteri",

  // Regional sweep (major regions)
  "köttproducent Skåne",
  "köttproducent Västra Götaland",
  "köttproducent Uppsala",
  "köttproducent Östergötland",
  "köttproducent Dalarna",
  "köttproducent Jämtland",
  "köttproducent Norrbotten",
  "köttproducent Småland",
  "köttproducent Gotland",
  "köttproducent Halland",
];

/** Flush current stats to the DB so the UI can show live progress */
async function flushStats(runId: string, stats: RunStats) {
  await db
    .update(discoveryRun)
    .set({
      queriesExecuted: stats.queriesExecuted,
      urlsFound: stats.urlsFound,
      urlsFetched: stats.urlsFetched,
      classified: stats.classified,
      relevantFound: stats.relevantFound,
      deepAnalyzed: stats.deepAnalyzed,
      entitiesCreated: stats.entitiesCreated,
      entitiesUpdated: stats.entitiesUpdated,
    })
    .where(eq(discoveryRun.id, runId));
}

// ─── Main pipeline ──────────────────────────────────────

async function main() {
  pipelineStartTime = Date.now();
  const stats: RunStats = createEmptyStats();

  console.log("═══════════════════════════════════════════════");
  console.log("  Norrjord Intel — Discovery Pipeline");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Started at: ${new Date().toISOString()}`);
  console.log(`  Scope:      All of Sweden`);
  console.log(`  Queries:    ${DISCOVERY_QUERIES.length}`);
  console.log(`  Max queries: ${PIPELINE_CONFIG.maxQueriesPerRun}`);
  console.log(`  Classify model: ${PIPELINE_CONFIG.classifyModel}`);
  console.log(`  Analyze model: ${PIPELINE_CONFIG.analyzeModel}`);
  console.log("═══════════════════════════════════════════════\n");

  resetUsageLog();

  // ─── Create run record ──────────────────────────────

  const [run] = await db
    .insert(discoveryRun)
    .values({
      region: null,
      sourceChannel: "search",
      pid: process.pid,
      config: {
        scope: "sweden",
        queryCount: DISCOVERY_QUERIES.length,
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

    const queries = DISCOVERY_QUERIES.slice(0, PIPELINE_CONFIG.maxQueriesPerRun);
    console.log(`[init] ${queries.length} queries (Sweden-wide)`);

    const existingDomains = await getExistingDomains();
    console.log(`[init] ${existingDomains.size} domains already in database\n`);

    const candidates = await runSearch(queries, existingDomains, stats);
    await flushStats(run.id, stats);

    if (candidates.length === 0) {
      console.log("\n[done] No new candidates found. Exiting.");
      await finalizeRun(run.id, stats);
      return;
    }

    // ─── Step 2: Fetch ──────────────────────────────────

    const fetched = await fetchCandidates(candidates, stats);
    await flushStats(run.id, stats);

    if (fetched.length === 0) {
      console.log("\n[done] No fetchable content. Exiting.");
      await finalizeRun(run.id, stats);
      return;
    }

    // ─── Step 3: Classify ───────────────────────────────

    const classified = await classifyCandidates(fetched, stats);
    await flushStats(run.id, stats);

    if (classified.length === 0) {
      console.log("\n[done] No relevant candidates after classification. Exiting.");
      await finalizeRun(run.id, stats);
      return;
    }

    // ─── Step 4: Analyze ────────────────────────────────

    const analyzed = await analyzeCandidates(classified, stats);
    await flushStats(run.id, stats);

    if (analyzed.length === 0) {
      console.log("\n[done] No candidates above score threshold. Exiting.");
      await finalizeRun(run.id, stats);
      return;
    }

    // ─── Step 5: Upsert ─────────────────────────────────

    await upsertCandidates(analyzed, stats);
    await flushStats(run.id, stats);

    // ─── Step 6: Enrich (allabolag business data) ───────

    console.log("\n[enrich] Auto-enriching new entities with allabolag data...");
    const toEnrich = await getUnenrichedEntities();
    let enriched = 0;

    for (const ent of toEnrich) {
      try {
        const ok = await enrichEntity(ent);
        if (ok) enriched++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`  [enrich] Failed for ${ent.name ?? ent.domain}: ${message}`);
        stats.errors.push({ step: "enrich", message });
      }
      // Be polite to allabolag
      await new Promise((r) => setTimeout(r, 1500));
    }

    console.log(`[enrich] Done: ${enriched}/${toEnrich.length} enriched`);

    // ─── Step 7: Deduplicate ─────────────────────────────

    console.log("\n[dedup] Checking for duplicates...");
    const dedupResult = await deduplicateEntities();
    if (dedupResult.merged > 0) {
      console.log(`[dedup] Merged ${dedupResult.merged} duplicate(s)`);
    }

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

  console.log("\n═══════════════════════════════════════════════");
  console.log("  DISCOVERY RUN COMPLETE");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Scope:             All of Sweden`);
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
