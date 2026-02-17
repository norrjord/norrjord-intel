/**
 * Draft Generator
 *
 * Called on-demand from the dashboard (not part of overnight pipeline).
 * Generates a personalized outreach email based on entity + analysis data.
 * Draft is stored in the drafts table for manual review and copy.
 *
 * NEVER sends email. Manual outreach only.
 */

import { eq, desc } from "@norrjord-intel/db";
import { db } from "@norrjord-intel/db";
import { entity, aiAnalysis, draft } from "@norrjord-intel/db/schema";
import { completeJsonTracked } from "../lib/claude";
import { PIPELINE_CONFIG, type DraftResult } from "./pipeline/config";

// ─── System prompt ──────────────────────────────────────

const DRAFT_SYSTEM_PROMPT = `You are writing a short, high-trust outreach email from Henrik at Norrjord to a Swedish meat producer or agricultural business. Write in Swedish. You ONLY output valid JSON.

Rules:
- Short (max 150 words in body)
- High trust, no hype, no tech buzzwords
- Reference ONLY verified facts from the analysis (provided below)
- Never fabricate details about their farm
- Position Norrjord as: infrastructure for demand-driven direct sales, reducing risk and admin for producers
- Goal: get a short introductory call or meeting
- Include opt-out line: "Svara 'nej' om du inte vill bli kontaktad igen."
- Tone: respectful, solidarisk, founder-to-founder
- NEVER mention AI, scraping, or automated discovery
- Write naturally — not templated or corporate

Return ONLY this JSON:

{
  "subject": "string (short, specific, not salesy)",
  "body": "string (the full email text)"
}`;

// ─── Generate draft for an entity ───────────────────────

export async function generateDraft(entityId: string): Promise<{
  draftId: string;
  subject: string;
  body: string;
}> {
  // Fetch entity
  const ent = await db.query.entity.findFirst({
    where: eq(entity.id, entityId),
  });

  if (!ent) throw new Error(`Entity not found: ${entityId}`);

  // Fetch latest analysis
  const latestAnalysis = await db.query.aiAnalysis.findFirst({
    where: eq(aiAnalysis.entityId, entityId),
    orderBy: [desc(aiAnalysis.createdAt)],
  });

  if (!latestAnalysis) throw new Error(`No analysis found for entity: ${entityId}`);

  const extractedFacts = latestAnalysis.extractedFacts as any;

  // Build user prompt with verified data only
  const userPrompt = `Entity name: ${ent.name ?? "Okänt"}
Production type: ${ent.productionType}
Region: ${ent.regionText ?? "Okänt"}
Summary: ${latestAnalysis.summary ?? "Ingen sammanfattning"}
Suggested angle: ${latestAnalysis.suggestedAngle ?? "Ingen vinkel"}
Key facts: ${JSON.stringify(extractedFacts?.facts_used ?? extractedFacts?.direct_sales_signals ?? [])}`;

  const { data } = await completeJsonTracked<DraftResult>({
    system: DRAFT_SYSTEM_PROMPT,
    user: userPrompt,
    model: PIPELINE_CONFIG.draftModel,
    maxTokens: 1024,
  });

  // Store draft
  const [inserted] = await db
    .insert(draft)
    .values({
      entityId,
      subject: data.subject,
      body: data.body,
      createdByAi: true,
      approved: false,
    })
    .returning({ id: draft.id });

  if (!inserted) throw new Error("Failed to insert draft");

  return {
    draftId: inserted.id,
    subject: data.subject,
    body: data.body,
  };
}
