/**
 * Pipeline Step 3: Classify
 *
 * First-pass filter using Claude Haiku (cheap).
 * Determines if a website is a relevant meat producer / partner / investor.
 * Discards irrelevant results before expensive deep analysis.
 */

import { completeJsonTracked } from "../../lib/claude";
import { PIPELINE_CONFIG, type ClassificationResult, type RunStats } from "./config";
import type { FetchedCandidate } from "./fetch-site";

// ─── System prompt ──────────────────────────────────────

const CLASSIFY_SYSTEM_PROMPT = `You are a Swedish agricultural business classifier. You ONLY output valid JSON. No prose, no markdown, no explanation outside JSON.

Your task: determine if the following website content belongs to a Swedish primary meat producer, strategic partner (slaughterhouse, logistics, butcher), or potential investor (large-scale farm, agricultural business group).

Scoring context:
- We are building Norrjord, a demand-driven direct sales platform for Swedish meat producers.
- We want producers who already show direct sales activity (REKO, gårdsbutik, köttlåda) or have scale that suggests they'd benefit from our system.
- Partners include slaughterhouses, butchers, and logistics providers who serve producers.
- Investors are large-scale operations, agricultural groups, or individuals with capital + industry knowledge.

Return ONLY this JSON structure:

{
  "is_relevant": boolean,
  "entity_type_guess": "producer" | "partner" | "investor" | "unknown",
  "confidence": 0.0-1.0,
  "reasons": ["reason1", "reason2"],
  "red_flags": ["flag1"],
  "suggested_next": "discard" | "deep_analyze"
}

Red flags that mean discard:
- Pure restaurant (no production)
- News article / blog post
- Marketplace / aggregator / directory
- Government agency page
- Irrelevant industry entirely
- Recipe site or food blog`;

// ─── Classify a single candidate ────────────────────────

export interface ClassifiedCandidate extends FetchedCandidate {
  classification: ClassificationResult;
}

async function classifyOne(candidate: FetchedCandidate): Promise<ClassificationResult> {
  // Truncate text for cheap classification
  const truncatedText = candidate.combinedText.slice(0, PIPELINE_CONFIG.maxTextCharsForClassify);

  const userPrompt = `URL: ${candidate.url}\nContent (truncated to ${truncatedText.length} chars):\n${truncatedText}`;

  const { data } = await completeJsonTracked<ClassificationResult>({
    system: CLASSIFY_SYSTEM_PROMPT,
    user: userPrompt,
    model: PIPELINE_CONFIG.classifyModel,
    maxTokens: 512,
  });

  return data;
}

// ─── Classify all candidates ────────────────────────────

export async function classifyCandidates(
  candidates: FetchedCandidate[],
  stats: RunStats,
): Promise<ClassifiedCandidate[]> {
  const relevant: ClassifiedCandidate[] = [];

  console.log(`[classify] Classifying ${candidates.length} candidates...`);

  for (const candidate of candidates) {
    try {
      const classification = await classifyOne(candidate);

      stats.classified++;

      if (
        classification.is_relevant &&
        classification.confidence >= PIPELINE_CONFIG.classifyConfidenceThreshold &&
        classification.suggested_next === "deep_analyze"
      ) {
        relevant.push({ ...candidate, classification });
        stats.relevantFound++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      stats.errors.push({
        url: candidate.url,
        step: "classify",
        message,
      });
    }
  }

  console.log(`[classify] ${stats.relevantFound} relevant out of ${stats.classified} classified`);

  return relevant;
}
