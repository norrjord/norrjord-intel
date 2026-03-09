/**
 * Norrjord Intel — Entity Enrichment Pipeline
 *
 * Enriches discovered entities with Swedish business registry data
 * from allabolag.se (publicly available company info).
 *
 * Parses the __NEXT_DATA__ JSON embedded in allabolag pages for
 * structured data: org number, revenue, employees, address,
 * municipality, county, and GPS coordinates.
 *
 * Usage:
 *   bun run enrich                     — enrich all un-enriched entities
 *   bun run enrich --region uppsala    — only entities in a specific region
 *   bun run enrich --id <entity-id>    — enrich a single entity
 */

import { db, eq, and, sql } from "@norrjord-intel/db";
import { entity } from "@norrjord-intel/db/schema";

// ─── Parse CLI args ─────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let region: string | null = null;
  let entityId: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--region" && args[i + 1] != null) {
      region = args[i + 1]!;
    }
    if (args[i] === "--id" && args[i + 1] != null) {
      entityId = args[i + 1]!;
    }
  }

  return { region, entityId };
}

// ─── Allabolag data extraction ──────────────────────────

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
};

interface EnrichmentData {
  orgNumber: string | null;
  companyName: string | null;
  companyForm: string | null;
  registeredAddress: string | null;
  registeredCity: string | null;
  postalCode: string | null;
  municipality: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  revenue: number | null;
  profit: number | null;
  employeeCount: number | null;
  sniCode: string | null;
  sniDescription: string | null;
  companyStatus: string | null;
  lastAnnualReport: string | null;
  raw: Record<string, unknown>;
}

/**
 * Extract __NEXT_DATA__ JSON from an allabolag page and parse company data.
 */
function parseNextData(html: string): EnrichmentData | null {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/,
  );
  if (!match) return null;

  let data: any;
  try {
    data = JSON.parse(match[1]!);
  } catch {
    return null;
  }

  const c = data?.props?.pageProps?.company;
  if (!c?.orgnr) return null;

  // Format org number with dash (556901-2345)
  const orgClean = c.orgnr.replace(/[-\s]/g, "");
  const orgNumber =
    orgClean.length === 10
      ? `${orgClean.slice(0, 6)}-${orgClean.slice(6)}`
      : orgClean;

  // Address — prefer visitor address, fall back to postal/legal
  const addr =
    c.visitorAddress ?? c.legalVisitorAddress ?? c.postalAddress ?? c.legalPostalAddress;

  // Location
  const loc = c.location;
  const coords = loc?.coordinates?.[0];

  // SNI — first nace industry
  const nace = c.naceIndustries?.[0] as string | undefined;
  const sniMatch = nace?.match(/^(\d+)\s+(.+)/);

  // Revenue is in tkr on allabolag (field can be string or number)
  const revNum = c.revenue != null ? Number(c.revenue) : NaN;
  const revenue = !isNaN(revNum) ? Math.round(revNum * 1000) : null;
  const profNum = c.profit != null ? Number(c.profit) : NaN;
  const profit = !isNaN(profNum) ? Math.round(profNum * 1000) : null;

  return {
    orgNumber,
    companyName: c.legalName ?? c.name ?? null,
    companyForm: c.companyType?.name ?? null,
    registeredAddress: addr?.addressLine ?? null,
    registeredCity: addr?.postPlace ?? null,
    postalCode: addr?.zipCode ?? null,
    municipality: c.domicile?.municipality ?? loc?.municipality ?? null,
    county: c.domicile?.county ?? loc?.county ?? null,
    latitude: coords?.ycoordinate ?? null,
    longitude: coords?.xcoordinate ?? null,
    revenue,
    profit,
    employeeCount:
      typeof c.numberOfEmployees === "number"
        ? c.numberOfEmployees
        : typeof c.numberOfEmployees === "string"
          ? parseInt(c.numberOfEmployees, 10) || null
          : null,
    sniCode: sniMatch?.[1] ?? null,
    sniDescription: sniMatch?.[2] ?? null,
    companyStatus: typeof c.status === "string" ? c.status : c.status?.name ?? null,
    lastAnnualReport: (() => {
      // Allabolag stores annual reports as array or last year field
      const reports = c.annualReports ?? c.financialYears;
      if (Array.isArray(reports) && reports.length > 0) {
        const latest = reports[0];
        const year = latest?.year ?? latest?.financialYear ?? latest;
        return typeof year === "number" ? String(year) : typeof year === "string" ? year.slice(0, 4) : null;
      }
      // Fallback: extract from revenue year if available
      if (c.revenueYear) return String(c.revenueYear);
      return null;
    })(),
    raw: {
      orgnr: c.orgnr,
      name: c.name,
      legalName: c.legalName,
      companyType: c.companyType,
      revenue: c.revenue,
      profit: c.profit,
      employees: c.numberOfEmployees,
      naceIndustries: c.naceIndustries,
      location: c.location,
      domicile: c.domicile,
      visitorAddress: c.visitorAddress,
      postalAddress: c.postalAddress,
      status: c.status,
      purpose: c.purpose,
      foundationDate: c.foundationDate,
      registrationDate: c.registrationDate,
      estimatedTurnover: c.estimatedTurnover,
    },
  };
}

/**
 * Search allabolag.se and return the first company result's URL path.
 */
async function findCompanyUrl(
  searchTerm: string,
): Promise<string | null> {
  const searchUrl = `https://www.allabolag.se/what/${encodeURIComponent(searchTerm)}`;
  const res = await fetch(searchUrl, { headers: HEADERS });

  if (!res.ok) {
    console.log(`  [allabolag] Search returned ${res.status}`);
    return null;
  }

  const html = await res.text();

  // New URL format: /foretag/<slug>/<city>/<industry>/<hash>
  const linkMatch = html.match(
    /href="(\/foretag\/[^"]+)"/,
  );

  if (!linkMatch) {
    console.log(`  [allabolag] No results for "${searchTerm}"`);
    return null;
  }

  return linkMatch[1]!;
}

/**
 * Fetch a company page and extract data from __NEXT_DATA__.
 */
async function fetchCompanyData(
  urlPath: string,
): Promise<EnrichmentData | null> {
  const url = `https://www.allabolag.se${urlPath}`;
  console.log(`  [allabolag] Fetching: ${url}`);

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    console.log(`  [allabolag] Page returned ${res.status}`);
    return null;
  }

  const html = await res.text();
  return parseNextData(html);
}

/**
 * Search allabolag.se by name and extract structured business data.
 */
async function searchAllabolag(
  searchTerm: string,
): Promise<EnrichmentData | null> {
  const path = await findCompanyUrl(searchTerm);
  if (!path) return null;
  return fetchCompanyData(path);
}

/**
 * Look up a company by org number on allabolag.se.
 */
async function lookupByOrgNumber(
  orgNumber: string,
): Promise<EnrichmentData | null> {
  const cleaned = orgNumber.replace(/[-\s]/g, "");
  const url = `https://www.allabolag.se/${cleaned}`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    console.log(`  [allabolag] Org lookup returned ${res.status}`);
    return null;
  }

  const html = await res.text();

  if (html.includes("Inga träffar")) return null;

  return parseNextData(html);
}

// ─── Activity status computation ─────────────────────────

const INACTIVE_STATUSES = [
  "avregistrerat", "avregistrerad",
  "likvidation", "i likvidation",
  "upplöst", "konkurs",
  "avförd", "avfört",
  "fusionerat",
];

function computeActivityStatus(
  data: EnrichmentData,
): "active" | "likely_active" | "likely_inactive" | "inactive" | "unknown" {
  const status = data.companyStatus?.toLowerCase() ?? "";

  // Definitively inactive: deregistered, liquidated, bankrupt
  if (INACTIVE_STATUSES.some((s) => status.includes(s))) {
    return "inactive";
  }

  // Check last annual report year
  const currentYear = new Date().getFullYear();
  const reportYear = data.lastAnnualReport
    ? parseInt(data.lastAnnualReport, 10)
    : NaN;
  const yearsSinceReport = !isNaN(reportYear) ? currentYear - reportYear : NaN;

  // Active status from allabolag + recent report + has revenue
  if (status.includes("aktiv") || status === "") {
    if (data.revenue && data.revenue > 0) {
      return "active";
    }
    // Has recent report but no/zero revenue
    if (!isNaN(yearsSinceReport) && yearsSinceReport <= 1) {
      return "likely_active";
    }
    // Old report or no revenue data
    if (!isNaN(yearsSinceReport) && yearsSinceReport >= 3) {
      return "likely_inactive";
    }
    return "likely_active";
  }

  return "unknown";
}

// ─── Enrich a single entity ─────────────────────────────

export async function enrichEntity(
  ent: {
    id: string;
    name: string | null;
    orgNumber: string | null;
    domain: string | null;
  },
): Promise<boolean> {
  console.log(`\n[enrich] ${ent.name ?? ent.domain ?? ent.id}`);

  let data: EnrichmentData | null = null;

  // Strategy 1: Direct org number lookup
  if (ent.orgNumber) {
    console.log(`  Trying org number: ${ent.orgNumber}`);
    data = await lookupByOrgNumber(ent.orgNumber);
  }

  // Strategy 2: Search by company name
  if (!data && ent.name) {
    console.log(`  Searching by name: ${ent.name}`);
    data = await searchAllabolag(ent.name);
  }

  // Strategy 3: Search by domain (without TLD)
  if (!data && ent.domain) {
    const domainName = ent.domain.replace(/\.\w+$/, "");
    console.log(`  Searching by domain: ${domainName}`);
    data = await searchAllabolag(domainName);
  }

  if (!data) {
    console.log(`  No match found`);
    return false;
  }

  // Determine activity status from allabolag data
  const activityStatus = computeActivityStatus(data);

  // Update entity with enrichment data
  await db
    .update(entity)
    .set({
      orgNumber: data.orgNumber ?? ent.orgNumber,
      companyName: data.companyName,
      companyForm: data.companyForm,
      registeredAddress: data.registeredAddress,
      registeredCity: data.registeredCity,
      postalCode: data.postalCode,
      municipality: data.municipality,
      county: data.county,
      latitude: data.latitude,
      longitude: data.longitude,
      revenue: data.revenue,
      profit: data.profit,
      employeeCount: data.employeeCount,
      sniCode: data.sniCode,
      sniDescription: data.sniDescription,
      companyStatus: data.companyStatus,
      lastAnnualReport: data.lastAnnualReport,
      activityStatus,
      enrichedAt: new Date(),
      enrichmentSource: "allabolag",
      enrichmentRaw: data.raw,
    })
    .where(eq(entity.id, ent.id));

  const revStr = data.revenue
    ? `${(data.revenue / 1_000).toFixed(0)} TSEK`
    : "no revenue";
  console.log(
    `  Enriched: ${data.companyName ?? "?"} | ${data.orgNumber ?? "no org"} | ${revStr} | ${data.employeeCount ?? "?"} employees | ${data.municipality ?? "?"}, ${data.county ?? "?"}`,
  );

  return true;
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  const { region, entityId } = parseArgs();

  console.log("═══════════════════════════════════════════════");
  console.log("  Norrjord Intel — Entity Enrichment");
  console.log("═══════════════════════════════════════════════");

  let entities: Array<{
    id: string;
    name: string | null;
    orgNumber: string | null;
    domain: string | null;
  }>;

  if (entityId) {
    const ent = await db.query.entity.findFirst({
      where: eq(entity.id, entityId),
      columns: { id: true, name: true, orgNumber: true, domain: true },
    });
    if (!ent) {
      console.error(`Entity ${entityId} not found`);
      process.exit(1);
    }
    entities = [ent];
  } else {
    const conditions = [sql`${entity.enrichedAt} IS NULL`];
    if (region) {
      conditions.push(sql`${entity.regionText} ILIKE ${"%" + region + "%"}`);
    }

    entities = await db
      .select({
        id: entity.id,
        name: entity.name,
        orgNumber: entity.orgNumber,
        domain: entity.domain,
      })
      .from(entity)
      .where(and(...conditions))
      .limit(50);
  }

  console.log(`  Found ${entities.length} entities to enrich`);
  if (region) console.log(`  Region filter: ${region}`);
  console.log("═══════════════════════════════════════════════\n");

  let enriched = 0;
  let failed = 0;

  for (const ent of entities) {
    try {
      const success = await enrichEntity(ent);
      if (success) enriched++;
      else failed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`  Error: ${msg}`);
      failed++;
    }

    // Be polite — wait between requests
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log(`  Enriched: ${enriched} / ${entities.length}`);
  console.log(`  Failed:   ${failed}`);
  console.log("═══════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
