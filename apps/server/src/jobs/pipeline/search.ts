/**
 * Pipeline Step 1: Search
 *
 * Runs the query matrix via Serper, deduplicates by domain,
 * and filters out blocklisted domains.
 */

import { searchBatch, type SerperResult } from "../../lib/serper";
import { extractDomain } from "@/lib/helpers/text-extract";
import { PIPELINE_CONFIG, DOMAIN_BLOCKLIST, type RunStats } from "./config";

export interface SearchCandidate {
  url: string;
  domain: string;
  title: string;
  snippet: string;
  sourceQuery: string;
}

/**
 * Run search queries, deduplicate, and filter blocklist.
 * Also filters out domains already in our database.
 */
export async function runSearch(
  queries: string[],
  existingDomains: Set<string>,
  stats: RunStats,
): Promise<SearchCandidate[]> {
  const cappedQueries = queries.slice(0, PIPELINE_CONFIG.maxQueriesPerRun);

  console.log(`[search] Running ${cappedQueries.length} queries...`);

  const resultsByQuery = await searchBatch(cappedQueries, {
    num: PIPELINE_CONFIG.maxResultsPerQuery,
    delayMs: PIPELINE_CONFIG.searchDelayMs,
  });

  stats.queriesExecuted = cappedQueries.length;

  // Flatten and track source query
  const allResults: Array<SerperResult & { sourceQuery: string }> = [];
  for (const [query, results] of resultsByQuery) {
    for (const r of results) {
      allResults.push({ ...r, sourceQuery: query });
    }
  }

  stats.urlsFound = allResults.length;
  console.log(`[search] Found ${allResults.length} raw URLs`);

  // Deduplicate by domain (keep first occurrence)
  const seenDomains = new Set<string>();
  const candidates: SearchCandidate[] = [];

  for (const result of allResults) {
    const domain = extractDomain(result.link);

    // Skip blocklisted
    if (DOMAIN_BLOCKLIST.has(domain)) continue;

    // Skip already in DB
    if (existingDomains.has(domain)) continue;

    // Skip duplicates within this run
    if (seenDomains.has(domain)) continue;

    seenDomains.add(domain);
    candidates.push({
      url: result.link,
      domain,
      title: result.title,
      snippet: result.snippet,
      sourceQuery: result.sourceQuery,
    });
  }

  console.log(`[search] After dedup + filter: ${candidates.length} unique candidates`);

  return candidates;
}
