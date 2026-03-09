/**
 * Norrjord Intel — Allabolag Company Discovery
 *
 * Discovers meat producers, slaughterhouses, and related businesses
 * by searching allabolag.se with industry-specific terms.
 *
 * Each search returns structured company data (org number, revenue,
 * employees, location, website, email) directly from __NEXT_DATA__.
 *
 * Usage:
 *   bun src/jobs/discover-allabolag.ts
 *   bun src/jobs/discover-allabolag.ts --min-revenue 500   (TSEK, default 0)
 *   bun src/jobs/discover-allabolag.ts --dry-run            (don't write to DB)
 */

import { db, eq } from "@norrjord-intel/db";
import { deduplicateEntities } from "./dedup";
import {
  entity,
  entitySource,
  contact,
  discoveryRun,
} from "@norrjord-intel/db/schema";

// ─── Search terms (meat industry) ───────────────────────

const SEARCH_TERMS = [
  // Core meat
  "slakteri",
  "gårdsslakteri",
  "styckeri",
  "charkuteri",
  "köttproduktion",
  "nötkött",
  "köttlåda",
  "kötthandel",
  "vilthantering",
  "viltkött",
  "lammkött producent",
  "griskött producent",
  "naturbeteskött",
  // Direct sales
  "gårdsbutik kött",
  "gårdsförsäljning kött",
  // Infrastructure
  "mobilt slakteri",
  "köttförädling",
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
};

// ─── Types ──────────────────────────────────────────────

interface AllabolagCompany {
  name: string;
  orgnr: string;
  companyId: string;
  homePage: string | null;
  email: string | null;
  phone: string | null;
  revenue: number | null; // TSEK
  profit: number | null;
  employees: number | null;
  status: string | null;
  industries: Array<{ code: string; name: string }>;
  location: {
    county: string | null;
    municipality: string | null;
    lat: number | null;
    lng: number | null;
  };
  address: {
    line: string | null;
    city: string | null;
    zip: string | null;
  };
  legalName: string | null;
  searchTerm: string; // which query found this
}

// ─── Parse CLI args ─────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let minRevenue = 0; // TSEK
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--min-revenue" && args[i + 1] != null) {
      minRevenue = parseInt(args[i + 1]!, 10);
    }
    if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { minRevenue, dryRun };
}

// ─── Search allabolag ───────────────────────────────────

async function searchAllabolag(term: string): Promise<AllabolagCompany[]> {
  const url = `https://www.allabolag.se/what/${encodeURIComponent(term)}`;
  const res = await fetch(url, { headers: HEADERS });

  if (!res.ok) {
    console.log(`  [allabolag] Search for "${term}" returned ${res.status}`);
    return [];
  }

  const html = await res.text();
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/,
  );
  if (!match) return [];

  let data: any;
  try {
    data = JSON.parse(match[1]!);
  } catch {
    return [];
  }

  const companies =
    data?.props?.pageProps?.hydrationData?.searchStore?.companies?.companies;
  if (!Array.isArray(companies)) return [];

  return companies.map((c: any) => {
    const addr = c.visitorAddress ?? c.postalAddress;
    const coords = c.location?.coordinates?.[0];

    return {
      name: c.name ?? c.legalName ?? "Unknown",
      orgnr: c.orgnr,
      companyId: c.companyId,
      homePage: c.homePage || null,
      email: c.email || null,
      phone: c.phone || c.mobile || null,
      revenue: c.revenue != null ? parseInt(String(c.revenue), 10) || null : null,
      profit: c.profit != null ? parseInt(String(c.profit), 10) || null : null,
      employees: c.employees != null ? parseInt(String(c.employees), 10) || null : null,
      status: c.status ?? null,
      industries: (c.industries ?? []).map((i: any) => ({
        code: i.code,
        name: i.name,
      })),
      location: {
        county: c.location?.county ?? null,
        municipality: c.location?.municipality ?? null,
        lat: coords?.ycoordinate ?? null,
        lng: coords?.xcoordinate ?? null,
      },
      address: {
        line: addr?.addressLine ?? null,
        city: addr?.postPlace ?? null,
        zip: addr?.zipCode ?? null,
      },
      legalName: c.legalName ?? null,
      searchTerm: term,
    };
  });
}

// ─── Determine entity type from industries ──────────────

function guessEntityType(
  industries: Array<{ name: string }>,
): "producer" | "partner" {
  const names = industries.map((i) => i.name.toLowerCase()).join(" ");
  if (
    names.includes("slakt") ||
    names.includes("styck") ||
    names.includes("transport") ||
    names.includes("logistik")
  ) {
    return "partner";
  }
  return "producer";
}

function guessProductionType(
  industries: Array<{ name: string }>,
  name: string,
): string {
  const text = [...industries.map((i) => i.name), name]
    .join(" ")
    .toLowerCase();
  if (text.includes("nöt") || text.includes("angus") || text.includes("hereford")) return "beef";
  if (text.includes("lamm") || text.includes("får")) return "lamb";
  if (text.includes("gris") || text.includes("fläsk")) return "pork";
  if (text.includes("vilt") || text.includes("älg") || text.includes("hjort")) return "game";
  if (text.includes("fjäderfä") || text.includes("kyckling") || text.includes("höns")) return "poultry";
  if (text.includes("kött") || text.includes("slakt") || text.includes("chark")) return "mixed";
  return "unknown";
}

// ─── Format org number ──────────────────────────────────

function formatOrgNr(orgnr: string): string {
  const clean = orgnr.replace(/[-\s]/g, "");
  return clean.length === 10
    ? `${clean.slice(0, 6)}-${clean.slice(6)}`
    : clean;
}

// ─── Extract domain from URL ────────────────────────────

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  const { minRevenue, dryRun } = parseArgs();

  console.log("═══════════════════════════════════════════════");
  console.log("  Norrjord Intel — Allabolag Discovery");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Search terms:   ${SEARCH_TERMS.length}`);
  console.log(`  Min revenue:    ${minRevenue} TSEK`);
  console.log(`  Dry run:        ${dryRun}`);
  console.log("═══════════════════════════════════════════════\n");

  // Create run record
  const [run] = await db
    .insert(discoveryRun)
    .values({
      region: null,
      sourceChannel: "allabolag",
      pid: process.pid,
      config: {
        source: "allabolag",
        searchTerms: SEARCH_TERMS,
        minRevenue,
        dryRun,
      },
    })
    .returning({ id: discoveryRun.id });

  // Step 1: Search all terms
  const allCompanies: AllabolagCompany[] = [];
  const seenOrgs = new Set<string>();

  for (const term of SEARCH_TERMS) {
    console.log(`[search] "${term}"...`);
    const results = await searchAllabolag(term);
    let added = 0;

    for (const c of results) {
      if (!c.orgnr || seenOrgs.has(c.orgnr)) continue;
      seenOrgs.add(c.orgnr);

      // Filter inactive
      if (c.status && c.status !== "Aktivt") continue;

      // Filter by revenue
      if (minRevenue > 0 && (c.revenue === null || c.revenue < minRevenue)) continue;

      allCompanies.push(c);
      added++;
    }

    console.log(`  Found ${results.length} results, ${added} new after dedup/filter`);

    // Be polite
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n[total] ${allCompanies.length} unique companies after filtering\n`);

  if (dryRun) {
    console.log("DRY RUN — not writing to database\n");
    for (const c of allCompanies) {
      const revStr = c.revenue ? `${c.revenue} TSEK` : "no revenue";
      console.log(
        `  ${c.name} | ${formatOrgNr(c.orgnr)} | ${revStr} | ${c.location.municipality ?? "?"}, ${c.location.county ?? "?"} | ${c.homePage ?? "no website"}`,
      );
    }
    await db
      .update(discoveryRun)
      .set({ completedAt: new Date(), urlsFound: allCompanies.length })
      .where(eq(discoveryRun.id, run!.id));
    return;
  }

  // Step 2: Check which org numbers already exist
  const existingOrgs = new Set<string>();
  const existingDomains = new Set<string>();

  const existingEntities = await db
    .select({ orgNumber: entity.orgNumber, domain: entity.domain })
    .from(entity);

  for (const e of existingEntities) {
    if (e.orgNumber) existingOrgs.add(e.orgNumber.replace(/[-\s]/g, ""));
    if (e.domain) existingDomains.add(e.domain);
  }

  // Step 3: Create entities
  let created = 0;
  let skippedExisting = 0;

  for (const c of allCompanies) {
    const orgClean = c.orgnr.replace(/[-\s]/g, "");
    const domain = extractDomain(c.homePage);

    // Skip if org number or domain already exists
    if (existingOrgs.has(orgClean)) {
      skippedExisting++;
      continue;
    }
    if (domain && existingDomains.has(domain)) {
      skippedExisting++;
      continue;
    }

    const orgNumber = formatOrgNr(c.orgnr);
    const entityType: "producer" | "partner" = guessEntityType(c.industries);
    const productionType: "beef" | "lamb" | "pork" | "game" | "poultry" | "mixed" | "unknown" =
      guessProductionType(c.industries, c.name) as any;

    const [newEntity] = await db
      .insert(entity)
      .values({
        name: c.name,
        domain,
        websiteUrl: c.homePage,
        entityType,
        productionType,
        orgNumber,
        companyName: c.legalName ?? c.name,
        registeredAddress: c.address.line,
        registeredCity: c.address.city,
        postalCode: c.address.zip,
        municipality: c.location.municipality,
        county: c.location.county,
        latitude: c.location.lat,
        longitude: c.location.lng,
        revenue: c.revenue ? Math.round(c.revenue * 1000) : null, // Convert TSEK to SEK
        profit: c.profit ? Math.round(c.profit * 1000) : null,
        employeeCount: c.employees,
        enrichedAt: new Date(),
        enrichmentSource: "allabolag",
        enrichmentRaw: {
          orgnr: c.orgnr,
          industries: c.industries,
          searchTerm: c.searchTerm,
          companyId: c.companyId,
          status: c.status,
        },
      })
      .returning({ id: entity.id });

    if (!newEntity) continue;

    // Add source record
    await db.insert(entitySource).values({
      entityId: newEntity.id,
      sourceType: "search_api",
      sourceQuery: `allabolag: ${c.searchTerm}`,
      sourceUrl: `https://www.allabolag.se/${orgClean}`,
    });

    // Add contact if email exists
    if (c.email) {
      await db.insert(contact).values({
        entityId: newEntity.id,
        email: c.email,
        isPrimary: true,
        sourceUrl: `https://www.allabolag.se/${orgClean}`,
      });
    }

    // Note: Not auto-adding to pipeline. User selects entities manually.

    // Track for dedup
    existingOrgs.add(orgClean);
    if (domain) existingDomains.add(domain);

    created++;
    const revStr = c.revenue ? `${c.revenue} TSEK` : "no rev";
    console.log(
      `  [+] ${c.name} | ${orgNumber} | ${revStr} | ${c.location.municipality ?? "?"}`,
    );
  }

  // Finalize
  await db
    .update(discoveryRun)
    .set({
      completedAt: new Date(),
      queriesExecuted: SEARCH_TERMS.length,
      urlsFound: allCompanies.length,
      entitiesCreated: created,
      entitiesUpdated: skippedExisting,
    })
    .where(eq(discoveryRun.id, run!.id));

  // Deduplicate
  console.log("\n[dedup] Checking for duplicates...");
  const dedupResult = await deduplicateEntities();
  if (dedupResult.merged > 0) {
    console.log(`[dedup] Merged ${dedupResult.merged} duplicate(s)`);
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log("  ALLABOLAG DISCOVERY COMPLETE");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Companies found:    ${allCompanies.length}`);
  console.log(`  Created:            ${created}`);
  console.log(`  Skipped (existing): ${skippedExisting}`);
  console.log("═══════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
