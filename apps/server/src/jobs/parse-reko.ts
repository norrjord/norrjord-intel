/**
 * REKO Feed Parser
 *
 * You copy-paste a chunk of a REKO Facebook group feed into the dashboard.
 * Claude parses it and extracts every identifiable producer.
 * Each one enters the standard entity → analysis → pipeline flow.
 *
 * Usage: called from a dashboard API route, not from the overnight pipeline.
 */

import { eq } from "@norrjord-intel/db";
import { db } from "@norrjord-intel/db";
import {
  entity,
  entitySource,
  contact,
  aiAnalysis,
  relationshipStatus,
} from "@norrjord-intel/db/schema";
import { completeJsonTracked, MODELS } from "../lib/claude";

// ─── Types ──────────────────────────────────────────────

export interface RekoProducer {
  name: string | null;
  farm_name: string | null;
  production_type: "beef" | "lamb" | "pork" | "game" | "poultry" | "mixed" | "unknown";
  products_mentioned: string[];
  region_text: string | null;
  direct_sales_signals: string[];
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  is_meat_producer: boolean;
  raw_post_snippet: string;
  confidence: number;
}

export interface RekoParseResult {
  producers: RekoProducer[];
  total_posts_found: number;
  meat_producers_found: number;
  non_meat_skipped: number;
}

// ─── System prompt ──────────────────────────────────────

const REKO_PARSE_SYSTEM_PROMPT = `You are parsing copy-pasted text from a Swedish REKO ring Facebook group. The text contains multiple producer posts mixed together.

Your task: identify every distinct producer and extract structured data about them.

IMPORTANT RULES:
- Each producer typically posts once per delivery listing
- Posts usually contain: producer/farm name, what they sell, price hints, pickup info
- Some producers are meat producers (your PRIMARY target), others sell eggs, vegetables, bread, etc.
- Mark is_meat_producer: true for anyone selling beef, pork, lamb, game meat, poultry, charcuterie, sausages, or similar
- Mark is_meat_producer: false for vegetable growers, bakers, egg producers, etc.
- Extract contact info ONLY if explicitly posted (email, phone, website)
- Never fabricate information — if unclear, use null
- The same producer may appear multiple times in the feed — deduplicate by name
- confidence: 0.0-1.0 on how certain you are this is a real distinct producer

Return ONLY this JSON:

{
  "producers": [
    {
      "name": "Person name if visible" | null,
      "farm_name": "Farm or business name" | null,
      "production_type": "beef" | "lamb" | "pork" | "game" | "poultry" | "mixed" | "unknown",
      "products_mentioned": ["köttlåda 10kg", "nötfärs", "korv"],
      "region_text": "inferred from REKO group name or post content" | null,
      "direct_sales_signals": ["REKO", "köttlåda", etc.],
      "contact_email": "email if found" | null,
      "contact_phone": "phone if found" | null,
      "website_url": "url if found" | null,
      "is_meat_producer": boolean,
      "raw_post_snippet": "first 200 chars of their post for reference",
      "confidence": 0.0-1.0
    }
  ],
  "total_posts_found": number,
  "meat_producers_found": number,
  "non_meat_skipped": number
}`;

// ─── Parse REKO feed text ───────────────────────────────

export async function parseRekoFeed(
  feedText: string,
  regionHint: string,
): Promise<RekoParseResult> {
  // Cap input text (REKO feeds can be very long)
  const cappedText = feedText.length > 30_000 ? feedText.slice(0, 30_000) : feedText;

  const userPrompt = `REKO group region: ${regionHint}

Pasted feed text (${cappedText.length} chars):

${cappedText}`;

  const { data } = await completeJsonTracked<RekoParseResult>({
    system: REKO_PARSE_SYSTEM_PROMPT,
    user: userPrompt,
    model: MODELS.analyze, // Sonnet for quality extraction
    maxTokens: 4096,
  });

  return data;
}

// ─── Store parsed REKO producers ────────────────────────

export interface RekoImportResult {
  created: number;
  skippedExisting: number;
  skippedNonMeat: number;
  skippedLowConfidence: number;
  entities: Array<{ id: string; name: string | null }>;
}

export async function importRekoProducers(
  parsed: RekoParseResult,
  regionHint: string,
  rekoGroupName: string,
): Promise<RekoImportResult> {
  const result: RekoImportResult = {
    created: 0,
    skippedExisting: 0,
    skippedNonMeat: 0,
    skippedLowConfidence: 0,
    entities: [],
  };

  for (const producer of parsed.producers) {
    // Skip non-meat producers
    if (!producer.is_meat_producer) {
      result.skippedNonMeat++;
      continue;
    }

    // Skip low confidence
    if (producer.confidence < 0.5) {
      result.skippedLowConfidence++;
      continue;
    }

    // Determine a display name
    const displayName = producer.farm_name ?? producer.name ?? "Okänd producent";

    // Check for duplicates by name (since REKO producers often don't have domains)
    const existingByName = await db.query.entity.findFirst({
      where: eq(entity.name, displayName),
    });

    // Also check by domain if website exists
    let existingByDomain = null;
    if (producer.website_url) {
      const domain = extractDomainSimple(producer.website_url);
      if (domain) {
        existingByDomain = await db.query.entity.findFirst({
          where: eq(entity.domain, domain),
        });
      }
    }

    if (existingByName || existingByDomain) {
      result.skippedExisting++;
      continue;
    }

    // ── Insert entity ─────────────────────────────────

    const domain = producer.website_url ? extractDomainSimple(producer.website_url) : null;

    const [inserted] = await db
      .insert(entity)
      .values({
        name: displayName,
        websiteUrl: producer.website_url,
        domain,
        entityType: "producer",
        productionType: producer.production_type as any,
        regionText: producer.region_text ?? regionHint,
        sourceUrl: null, // no URL for REKO — it's from Facebook
      })
      .returning({ id: entity.id });

    if (!inserted) continue;
    const entityId = inserted.id;

    // ── Insert source ─────────────────────────────────

    await db.insert(entitySource).values({
      entityId,
      sourceType: "manual",
      sourceQuery: `REKO: ${rekoGroupName}`,
      sourceUrl: null,
    });

    // ── Insert contact if available ───────────────────

    if (producer.contact_email || producer.contact_phone || producer.name) {
      await db.insert(contact).values({
        entityId,
        name: producer.name,
        email: producer.contact_email,
        phone: producer.contact_phone,
        isPrimary: true,
        sourceUrl: null,
      });
    }

    // ── Insert AI analysis from REKO extraction ───────

    await db.insert(aiAnalysis).values({
      entityId,
      modelName: MODELS.analyze,
      analysisType: "classify",
      pilotFitScore: estimatePilotScore(producer),
      investorFitScore: 0, // can't determine from REKO posts
      modernizationScore: null,
      scaleScore: estimateScaleScore(producer),
      summary: buildSummary(producer, rekoGroupName),
      suggestedAngle: `Active in ${rekoGroupName}. Already direct-selling via REKO — Norrjord removes the admin overhead.`,
      extractedFacts: producer as any,
      rawOutputJson: producer as any,
    });

    // ── Create relationship ───────────────────────────

    const pilotScore = estimatePilotScore(producer);

    await db.insert(relationshipStatus).values({
      entityId,
      pipelineType: "pilot",
      stage: "new",
      priority: pilotScore >= 7 ? 1 : pilotScore >= 5 ? 2 : 3,
    });

    result.created++;
    result.entities.push({ id: entityId, name: displayName });
  }

  return result;
}

// ─── Scoring helpers ────────────────────────────────────

function estimatePilotScore(producer: RekoProducer): number {
  let score = 0;

  // Already direct selling via REKO = strong signal
  score += 3;

  // Meat producer confirmed
  if (producer.is_meat_producer) score += 2;

  // Product variety suggests scale
  if (producer.products_mentioned.length >= 3) score += 1;

  // Has contact info (reachable)
  if (producer.contact_email || producer.contact_phone) score += 1;

  // Has a website (more professional)
  if (producer.website_url) score += 1;

  // Has a farm name (established identity)
  if (producer.farm_name) score += 1;

  // High confidence extraction
  if (producer.confidence >= 0.8) score += 1;

  return Math.min(score, 10);
}

function estimateScaleScore(producer: RekoProducer): number {
  let score = 0;

  if (producer.products_mentioned.length >= 5) score += 2;
  else if (producer.products_mentioned.length >= 3) score += 1;

  if (producer.website_url) score += 1;

  // Mentions of bulk products suggest scale
  const bulkKeywords = ["köttlåda", "halvt", "kvart", "hel", "10kg", "20kg"];
  const hasBulk = producer.products_mentioned.some((p) =>
    bulkKeywords.some((kw) => p.toLowerCase().includes(kw)),
  );
  if (hasBulk) score += 2;

  return Math.min(score, 10);
}

function buildSummary(producer: RekoProducer, groupName: string): string {
  const name = producer.farm_name ?? producer.name ?? "Okänd";
  const type = producer.production_type !== "unknown" ? producer.production_type : "kött";
  const products =
    producer.products_mentioned.length > 0
      ? producer.products_mentioned.slice(0, 3).join(", ")
      : "okända produkter";

  return `${name} — aktiv i ${groupName}. Säljer ${type} direkt via REKO (${products}). Redan van vid direktförsäljning mot konsument.`;
}

// ─── Utility ────────────────────────────────────────────

function extractDomainSimple(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
