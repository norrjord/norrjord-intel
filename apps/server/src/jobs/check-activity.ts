/**
 * Norrjord Intel — Activity Check
 *
 * Checks whether discovered entities are still active businesses.
 * Uses two signals:
 *   1. Company status from allabolag (already in enrichmentRaw)
 *   2. Website liveness (HEAD request to domain)
 *
 * Combines these into an activityStatus:
 *   active          — allabolag says active + website responds
 *   likely_active   — one signal positive, other unknown
 *   likely_inactive — old filings, no website, or zero revenue
 *   inactive        — allabolag says deregistered/liquidated/bankrupt
 *   unknown         — not enough data
 *
 * Usage:
 *   bun run check-activity              — check all unchecked entities
 *   bun run check-activity --recheck    — recheck all entities
 *   bun run check-activity --id <uuid>  — check a single entity
 */

import { db, eq, and, sql } from "@norrjord-intel/db";
import { entity } from "@norrjord-intel/db/schema";

// ─── CLI args ────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let recheck = false;
  let entityId: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--recheck") recheck = true;
    if (args[i] === "--id" && args[i + 1]) entityId = args[i + 1]!;
  }

  return { recheck, entityId };
}

// ─── Website liveness check ──────────────────────────────

async function checkWebsite(
  domain: string,
): Promise<"yes" | "no" | "unknown"> {
  const urls = [`https://${domain}`, `http://${domain}`];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; NorrjordBot/1.0; +https://norrjord.se)",
        },
      });

      clearTimeout(timeout);

      // Any response (even 403/500) means the server is alive
      if (res.status < 600) return "yes";
    } catch {
      // Try next URL
    }
  }

  return "no";
}

// ─── Activity status from allabolag raw data ─────────────

const INACTIVE_STATUSES = [
  "avregistrerat", "avregistrerad",
  "likvidation", "i likvidation",
  "upplöst", "konkurs",
  "avförd", "avfört",
  "fusionerat",
];

function computeStatus(opts: {
  companyStatus: string | null;
  lastAnnualReport: string | null;
  revenue: number | null;
  websiteAlive: "yes" | "no" | "unknown";
  enrichedAt: Date | null;
}): "active" | "likely_active" | "likely_inactive" | "inactive" | "unknown" {
  const status = opts.companyStatus?.toLowerCase() ?? "";

  // Definitively inactive
  if (INACTIVE_STATUSES.some((s) => status.includes(s))) {
    return "inactive";
  }

  const currentYear = new Date().getFullYear();
  const reportYear = opts.lastAnnualReport
    ? parseInt(opts.lastAnnualReport, 10)
    : NaN;
  const yearsSinceReport = !isNaN(reportYear) ? currentYear - reportYear : NaN;

  // No enrichment data at all — rely on website check
  if (!opts.enrichedAt) {
    if (opts.websiteAlive === "yes") return "likely_active";
    if (opts.websiteAlive === "no") return "likely_inactive";
    return "unknown";
  }

  // Count positive signals
  let positiveSignals = 0;
  let negativeSignals = 0;

  // Signal: allabolag says active
  if (status.includes("aktiv") || status === "") positiveSignals++;

  // Signal: has revenue
  if (opts.revenue && opts.revenue > 0) positiveSignals++;
  else if (opts.revenue === 0) negativeSignals++;

  // Signal: recent annual report
  if (!isNaN(yearsSinceReport)) {
    if (yearsSinceReport <= 1) positiveSignals++;
    else if (yearsSinceReport >= 3) negativeSignals++;
  }

  // Signal: website alive
  if (opts.websiteAlive === "yes") positiveSignals++;
  else if (opts.websiteAlive === "no") negativeSignals++;

  // Decide
  if (positiveSignals >= 3) return "active";
  if (positiveSignals >= 2) return "likely_active";
  if (negativeSignals >= 2) return "likely_inactive";
  if (positiveSignals >= 1) return "likely_active";
  return "unknown";
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  const { recheck, entityId } = parseArgs();

  console.log("═══════════════════════════════════════════════");
  console.log("  Norrjord Intel — Activity Check");
  console.log("═══════════════════════════════════════════════");

  let entities: Array<{
    id: string;
    domain: string | null;
    companyStatus: string | null;
    lastAnnualReport: string | null;
    revenue: number | null;
    enrichedAt: Date | null;
  }>;

  if (entityId) {
    const ent = await db.query.entity.findFirst({
      where: eq(entity.id, entityId),
      columns: {
        id: true,
        domain: true,
        companyStatus: true,
        lastAnnualReport: true,
        revenue: true,
        enrichedAt: true,
      },
    });
    if (!ent) {
      console.error(`Entity ${entityId} not found`);
      process.exit(1);
    }
    entities = [ent];
  } else {
    const conditions = [];
    if (!recheck) {
      conditions.push(sql`${entity.activityCheckedAt} IS NULL`);
    }

    entities = await db
      .select({
        id: entity.id,
        domain: entity.domain,
        companyStatus: entity.companyStatus,
        lastAnnualReport: entity.lastAnnualReport,
        revenue: entity.revenue,
        enrichedAt: entity.enrichedAt,
      })
      .from(entity)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(200);
  }

  console.log(`  Found ${entities.length} entities to check`);
  if (recheck) console.log("  Mode: recheck all");
  console.log("═══════════════════════════════════════════════\n");

  let checked = 0;
  let active = 0;
  let inactive = 0;

  for (const ent of entities) {
    const name = ent.domain ?? ent.id.slice(0, 8);
    process.stdout.write(`  [${checked + 1}/${entities.length}] ${name} ... `);

    // Check website
    let websiteAlive: "yes" | "no" | "unknown" = "unknown";
    if (ent.domain) {
      websiteAlive = await checkWebsite(ent.domain);
    }

    // Compute status
    const activityStatus = computeStatus({
      companyStatus: ent.companyStatus,
      lastAnnualReport: ent.lastAnnualReport,
      revenue: ent.revenue,
      websiteAlive,
      enrichedAt: ent.enrichedAt,
    });

    // Update
    await db
      .update(entity)
      .set({
        activityStatus,
        websiteAlive,
        activityCheckedAt: new Date(),
      })
      .where(eq(entity.id, ent.id));

    const icon =
      activityStatus === "active" || activityStatus === "likely_active"
        ? "✓"
        : activityStatus === "inactive" || activityStatus === "likely_inactive"
          ? "✗"
          : "?";

    console.log(
      `${icon} ${activityStatus} (web: ${websiteAlive}, company: ${ent.companyStatus ?? "—"})`,
    );

    checked++;
    if (activityStatus === "active" || activityStatus === "likely_active") active++;
    if (activityStatus === "inactive" || activityStatus === "likely_inactive") inactive++;

    // Polite delay for website checks
    if (ent.domain) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log(`  Checked:  ${checked}`);
  console.log(`  Active:   ${active}`);
  console.log(`  Inactive: ${inactive}`);
  console.log(`  Unknown:  ${checked - active - inactive}`);
  console.log("═══════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
