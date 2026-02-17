/**
 * Pipeline configuration and shared types
 *
 * Central place for all limits, thresholds, and type definitions.
 */

// ─── Pipeline limits (cost control) ─────────────────────

export const PIPELINE_CONFIG = {
  // Search
  maxQueriesPerRun: 40,
  maxResultsPerQuery: 10,
  searchDelayMs: 500,

  // Fetching
  maxPagesToFetchPerDomain: 3,
  maxTotalFetchesPerRun: 300,
  fetchDelayMs: 2_000,
  fetchTimeoutMs: 10_000,

  // Text limits (token cost control)
  maxTextCharsForClassify: 5_000,
  maxTextCharsForAnalyze: 15_000,

  // AI models
  classifyModel: "claude-haiku-4-5-20251001",
  analyzeModel: "claude-sonnet-4-5-20250929",
  draftModel: "claude-sonnet-4-5-20250929",

  // Thresholds
  classifyConfidenceThreshold: 0.5, // minimum to proceed to deep analysis
  minPilotScoreToStore: 4, // store entities with at least this pilot score
  minInvestorScoreToStore: 4, // or this investor score

  // Stop conditions
  maxEntitiesToCreatePerRun: 50,
} as const;

// ─── Domain blocklist ───────────────────────────────────

export const DOMAIN_BLOCKLIST = new Set([
  // News / media
  "svt.se",
  "dn.se",
  "gp.se",
  "aftonbladet.se",
  "expressen.se",
  "atl.nu",
  "landsbygdsnytt.se",
  "landlantbruk.se",
  "ja.se",
  "nyteknik.se",

  // Marketplaces / aggregators
  "reko.se",
  "lokalmat.se",
  "mathem.se",
  "ica.se",
  "coop.se",
  "hemkop.se",
  "willys.se",
  "matse.se",

  // Government
  "jordbruksverket.se",
  "livsmedelsverket.se",
  "regeringen.se",
  "riksdagen.se",

  // Social
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "tiktok.com",

  // Generic
  "wikipedia.org",
  "youtube.com",
  "pinterest.com",
  "reddit.com",

  // Directories
  "allabolag.se",
  "hitta.se",
  "eniro.se",
  "merinfo.se",
  "ratsit.se",

  // Platform providers
  "squarespace.com",
  "wix.com",
  "wordpress.com",
  "shopify.com",

  // Our own
  "norrjord.se",
]);

// ─── Classification types ───────────────────────────────

export interface ClassificationResult {
  is_relevant: boolean;
  entity_type_guess: "producer" | "partner" | "investor" | "unknown";
  confidence: number;
  reasons: string[];
  red_flags: string[];
  suggested_next: "discard" | "deep_analyze";
}

// ─── Analysis types ─────────────────────────────────────

export interface AnalysisResult {
  extracted: {
    name: string | null;
    production_type: "beef" | "lamb" | "pork" | "game" | "poultry" | "mixed" | "unknown";
    region_text: string | null;
    direct_sales_signals: string[];
    contact_emails_found: string[];
    scale_signals: string[];
    partner_investor_signals: string[];
  };
  scores: {
    pilot_fit: number;
    investor_fit: number;
    modernization: number;
    scale: number;
  };
  summary: string;
  suggested_angle: string;
  facts_used: string[];
  unknowns: string[];
}

// ─── Draft types ────────────────────────────────────────

export interface DraftResult {
  subject: string;
  body: string;
}

// ─── Pipeline run stats ─────────────────────────────────

export interface RunStats {
  queriesExecuted: number;
  urlsFound: number;
  urlsFetched: number;
  classified: number;
  relevantFound: number;
  deepAnalyzed: number;
  entitiesCreated: number;
  entitiesUpdated: number;
  errors: Array<{ url?: string; step: string; message: string }>;
}

export function createEmptyStats(): RunStats {
  return {
    queriesExecuted: 0,
    urlsFound: 0,
    urlsFetched: 0,
    classified: 0,
    relevantFound: 0,
    deepAnalyzed: 0,
    entitiesCreated: 0,
    entitiesUpdated: 0,
    errors: [],
  };
}
