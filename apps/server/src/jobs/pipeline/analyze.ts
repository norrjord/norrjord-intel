/**
 * Pipeline Step 4: Deep Analysis
 *
 * Uses Claude Sonnet (higher quality) to extract structured facts,
 * score pilot/investor fit, and generate suggested outreach angle.
 * Only runs on candidates that passed classification.
 */

import { completeJsonTracked } from "../../lib/claude";
import { PIPELINE_CONFIG, type AnalysisResult, type RunStats } from "./config";
import type { ClassifiedCandidate } from "./classify";

// ─── System prompt ──────────────────────────────────────

const ANALYZE_SYSTEM_PROMPT = `You are a Swedish agricultural market analyst. You ONLY output valid JSON. Never hallucinate facts — if information is not in the text, use null or "unknown". Every claim must be grounded in the provided text.

You are analyzing a potential partner/pilot candidate for Norrjord, a demand-driven direct sales infrastructure platform for Swedish meat producers. Norrjord is a NATIONAL service — it is NOT limited to Norrland or any specific region. The pilot starts in Härnösand but will expand across all of Sweden. Do not apply any geographic bias in scoring.

Relevant entity types:
- Producers: farms that raise and sell meat (beef, lamb, pork, game, poultry)
- Partners: slaughterhouses, butcheries, meat processors, logistics providers that serve producers
- Investors: large-scale operations, agricultural groups, or individuals with capital + industry knowledge

SCORING RUBRICS:

pilot_fit (0–10):
- Direct sales signals (REKO, gårdsbutik, köttlåda, direktförsäljning, boxes): 0–4 points
- Primary meat producer or meat processing focus (not restaurant/marketplace): 0–2 points
- Professional readiness (clear products, ordering info, contact details): 0–2 points
- Existing customer base or delivery capability: 0–2 points

investor_fit (0–10):
- Scale signals (volume, multiple product lines, expansion, facilities): 0–4 points
- Organizational maturity (company structure, team, history): 0–2 points
- Strategic adjacency (slaughter, logistics, processing, wholesale): 0–2 points
- Growth/modernization orientation: 0–2 points

modernization (0–10):
- Website quality and professionalism: 0–3
- Digital ordering/e-commerce presence: 0–3
- Social media activity mentioned: 0–2
- Innovation language: 0–2

scale (0–10):
- Production volume hints: 0–3
- Product range breadth: 0–3
- Infrastructure mentions (own slaughter, facilities): 0–2
- Team/employee signals: 0–2

Return ONLY this JSON:

{
  "extracted": {
    "name": string | null,
    "production_type": "beef" | "lamb" | "pork" | "game" | "poultry" | "mixed" | "unknown",
    "region_text": string | null,
    "direct_sales_signals": [],
    "contact_emails_found": [],
    "scale_signals": [],
    "partner_investor_signals": []
  },
  "scores": {
    "pilot_fit": 0-10,
    "investor_fit": 0-10,
    "modernization": 0-10,
    "scale": 0-10
  },
  "summary": "2-3 sentence summary of who this is and why they matter for Norrjord",
  "suggested_angle": "1-2 sentences: how should the founder approach this entity?",
  "facts_used": ["direct quotes or paraphrases from the text that support scores"],
  "unknowns": ["things we could not determine from available text"]
}`;

// ─── Analyze a single candidate ─────────────────────────

export interface AnalyzedCandidate extends ClassifiedCandidate {
  analysis: AnalysisResult;
}

async function analyzeOne(candidate: ClassifiedCandidate): Promise<AnalysisResult> {
  const truncatedText = candidate.combinedText.slice(0, PIPELINE_CONFIG.maxTextCharsForAnalyze);

  const userPrompt = `URL: ${candidate.url}\nContent (truncated to ${truncatedText.length} chars):\n${truncatedText}`;

  const { data } = await completeJsonTracked<AnalysisResult>({
    system: ANALYZE_SYSTEM_PROMPT,
    user: userPrompt,
    model: PIPELINE_CONFIG.analyzeModel,
    maxTokens: 2048,
  });

  return data;
}

// ─── Analyze all relevant candidates ────────────────────

export async function analyzeCandidates(
  candidates: ClassifiedCandidate[],
  stats: RunStats,
): Promise<AnalyzedCandidate[]> {
  const analyzed: AnalyzedCandidate[] = [];

  console.log(`[analyze] Deep analyzing ${candidates.length} relevant candidates...`);

  for (const candidate of candidates) {
    try {
      const analysis = await analyzeOne(candidate);

      stats.deepAnalyzed++;

      // Only keep if scores meet minimum threshold
      const meetsThreshold =
        analysis.scores.pilot_fit >= PIPELINE_CONFIG.minPilotScoreToStore ||
        analysis.scores.investor_fit >= PIPELINE_CONFIG.minInvestorScoreToStore;

      if (meetsThreshold) {
        analyzed.push({ ...candidate, analysis });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      stats.errors.push({
        url: candidate.url,
        step: "analyze",
        message,
      });
    }
  }

  console.log(
    `[analyze] ${analyzed.length} entities above score threshold out of ${stats.deepAnalyzed} analyzed`,
  );

  return analyzed;
}
