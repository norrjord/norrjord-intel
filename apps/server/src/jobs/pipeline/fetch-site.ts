/**
 * Pipeline Step 2: Fetch Site
 *
 * Downloads website pages, extracts clean text and emails.
 * Rate-limited and capped per run.
 */

import { fetchSitePages } from "@/lib/helpers/text-extract";
import { PIPELINE_CONFIG, type RunStats } from "./config";
import type { SearchCandidate } from "./search";

export interface FetchedCandidate extends SearchCandidate {
  combinedText: string;
  pagesFetched: number;
  emails: string[];
  fetchError?: string;
}

/**
 * Fetch website content for each candidate.
 * Respects rate limits and caps.
 */
export async function fetchCandidates(
  candidates: SearchCandidate[],
  stats: RunStats,
): Promise<FetchedCandidate[]> {
  const results: FetchedCandidate[] = [];
  let totalFetches = 0;

  console.log(`[fetch] Fetching content for ${candidates.length} candidates...`);

  for (const candidate of candidates) {
    if (totalFetches >= PIPELINE_CONFIG.maxTotalFetchesPerRun) {
      console.log(
        `[fetch] Hit total fetch cap (${PIPELINE_CONFIG.maxTotalFetchesPerRun}), stopping`,
      );
      break;
    }

    try {
      const site = await fetchSitePages(candidate.url, {
        maxPages: PIPELINE_CONFIG.maxPagesToFetchPerDomain,
        maxChars: PIPELINE_CONFIG.maxTextCharsForAnalyze,
        delayMs: PIPELINE_CONFIG.fetchDelayMs,
      });

      totalFetches += site.pages.length;

      if (site.combinedText.length < 100) {
        // Too little content — skip
        continue;
      }

      results.push({
        ...candidate,
        combinedText: site.combinedText,
        pagesFetched: site.pages.length,
        emails: site.allEmails,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      stats.errors.push({
        url: candidate.url,
        step: "fetch",
        message,
      });
    }
  }

  stats.urlsFetched = totalFetches;
  console.log(`[fetch] Fetched ${results.length} candidates (${totalFetches} total pages)`);

  return results;
}
