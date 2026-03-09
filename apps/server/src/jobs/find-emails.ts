/**
 * Norrjord Intel — Email Discovery
 *
 * Scrapes entity websites for contact email addresses.
 * Checks homepage + common contact pages (/kontakt, /contact, /om-oss, /about).
 * Creates contact records for found emails.
 *
 * Usage:
 *   bun run find-emails                  — all entities with a domain but no email
 *   bun run find-emails --id <uuid>      — single entity
 *   bun run find-emails --rescan         — rescan entities that already have contacts
 */

import { db, eq, sql } from "@norrjord-intel/db";
import { entity, contact } from "@norrjord-intel/db/schema";

// ─── Parse CLI args ─────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let entityId: string | null = null;
  let rescan = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--id" && args[i + 1] != null) {
      entityId = args[i + 1]!;
    }
    if (args[i] === "--rescan") {
      rescan = true;
    }
  }

  return { entityId, rescan };
}

// ─── Email extraction ───────────────────────────────────

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
};

// Common free email providers — skip these
const FREE_PROVIDERS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com",
  "yahoo.com", "yahoo.se", "icloud.com", "me.com", "msn.com",
  "telia.com", "bredband.net", "spray.se", "comhem.se",
  "facebook.com", "instagram.com", "twitter.com",
]);

// Pages to check for emails (in order of priority)
const CONTACT_PATHS = [
  "/", "/kontakt", "/contact", "/om-oss", "/about",
  "/kontakta-oss", "/contact-us", "/om", "/about-us",
];

/**
 * Extract email addresses from HTML text.
 * Looks for both mailto: links and bare email patterns.
 */
function extractEmails(html: string): string[] {
  const emails = new Set<string>();

  // mailto: links
  const mailtoMatches = html.matchAll(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi);
  for (const m of mailtoMatches) {
    emails.add(m[1]!.toLowerCase());
  }

  // Bare email patterns in text (avoid matching inside URLs/attributes)
  const bareMatches = html.matchAll(/\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/g);
  for (const m of bareMatches) {
    const email = m[1]!.toLowerCase();
    // Skip image filenames and common false positives
    if (email.endsWith(".png") || email.endsWith(".jpg") || email.endsWith(".svg")) continue;
    if (email.includes("example.com") || email.includes("sentry.io")) continue;
    if (email.includes("wixpress.com") || email.includes("squarespace.com")) continue;
    emails.add(email);
  }

  // Filter out free providers
  return [...emails].filter((e) => {
    const domain = e.split("@")[1];
    return domain && !FREE_PROVIDERS.has(domain);
  });
}

/**
 * Fetch a page with timeout and extract emails.
 */
async function fetchAndExtractEmails(url: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      headers: HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return [];

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return [];

    const html = await res.text();
    return extractEmails(html);
  } catch {
    return [];
  }
}

/**
 * Score an email to rank which is "best" for outreach.
 * Lower score = better.
 */
function emailScore(email: string, entityDomain: string | null): number {
  const prefix = email.split("@")[0]!;
  const domain = email.split("@")[1]!;

  let score = 50; // base

  // Matches entity domain — much better
  if (entityDomain && (domain.includes(entityDomain) || entityDomain.includes(domain))) {
    score -= 30;
  }

  // Personal-looking prefixes are best for outreach
  if (/^[a-z]+\.[a-z]+$/.test(prefix)) score -= 10; // firstname.lastname
  if (/^[a-z]{2,}$/.test(prefix) && !["info", "kontakt", "contact", "admin", "support", "order", "post", "webmaster", "bestallning"].includes(prefix)) {
    score -= 5; // single name
  }

  // Generic but still useful
  if (["info", "kontakt", "contact"].includes(prefix)) score -= 2;

  // Less useful
  if (["admin", "webmaster", "support"].includes(prefix)) score += 10;

  return score;
}

/**
 * Discover emails for a single entity by scraping its website.
 */
async function discoverEmails(
  ent: { id: string; name: string | null; domain: string | null },
): Promise<string[]> {
  if (!ent.domain) return [];

  const allEmails = new Set<string>();
  const baseUrl = `https://${ent.domain}`;

  for (const path of CONTACT_PATHS) {
    const url = path === "/" ? baseUrl : `${baseUrl}${path}`;
    const found = await fetchAndExtractEmails(url);
    for (const e of found) allEmails.add(e);

    // If we already found emails on the contact page, don't need more pages
    if (allEmails.size > 0 && path !== "/") break;

    // Small delay between page fetches
    await new Promise((r) => setTimeout(r, 300));
  }

  if (allEmails.size === 0) return [];

  // Sort by score (best first)
  const sorted = [...allEmails].sort(
    (a, b) => emailScore(a, ent.domain) - emailScore(b, ent.domain),
  );

  return sorted;
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  const { entityId, rescan } = parseArgs();

  console.log("═══════════════════════════════════════════════");
  console.log("  Norrjord Intel — Email Discovery");
  console.log("═══════════════════════════════════════════════");

  let entities: Array<{ id: string; name: string | null; domain: string | null }>;

  if (entityId) {
    const ent = await db.query.entity.findFirst({
      where: eq(entity.id, entityId),
      columns: { id: true, name: true, domain: true },
    });
    if (!ent) {
      console.error(`Entity ${entityId} not found`);
      process.exit(1);
    }
    entities = [ent];
  } else {
    // Find entities with a domain but no contact email
    const conditions = [
      sql`${entity.domain} IS NOT NULL`,
      sql`${entity.domain} != ''`,
    ];

    if (!rescan) {
      // Only entities without any contact that has an email
      conditions.push(
        sql`NOT EXISTS (
          SELECT 1 FROM contact c
          WHERE c.entity_id = ${entity.id}
          AND c.email IS NOT NULL
        )`,
      );
    }

    entities = await db
      .select({
        id: entity.id,
        name: entity.name,
        domain: entity.domain,
      })
      .from(entity)
      .where(sql`${sql.join(conditions, sql` AND `)}`)
      .limit(200);
  }

  console.log(`  Found ${entities.length} entities to scan`);
  if (rescan) console.log(`  Mode: rescan (including entities with existing contacts)`);
  console.log("═══════════════════════════════════════════════\n");

  let found = 0;
  let noEmail = 0;

  for (const ent of entities) {
    console.log(`[scan] ${ent.name ?? ent.domain ?? ent.id}`);

    const emails = await discoverEmails(ent);

    if (emails.length === 0) {
      console.log(`  No emails found`);
      noEmail++;
      continue;
    }

    console.log(`  Found ${emails.length} email(s): ${emails.join(", ")}`);

    // Check which emails already exist as contacts
    const existingContacts = await db
      .select({ email: contact.email })
      .from(contact)
      .where(eq(contact.entityId, ent.id));
    const existingEmails = new Set(
      existingContacts.map((c) => c.email?.toLowerCase()).filter(Boolean),
    );

    // Check if entity already has a primary contact
    const hasPrimary = existingContacts.some(
      (c) => c.email != null,
    );

    let added = 0;
    for (const email of emails) {
      if (existingEmails.has(email)) {
        console.log(`  [skip] ${email} (already exists)`);
        continue;
      }

      await db.insert(contact).values({
        entityId: ent.id,
        email,
        isPrimary: !hasPrimary && added === 0, // First new email becomes primary if none exists
        sourceUrl: `https://${ent.domain}`,
      });
      added++;
      console.log(`  [+] ${email}${!hasPrimary && added === 1 ? " (primary)" : ""}`);
    }

    if (added > 0) found++;

    // Delay between entities
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log(`  Emails found for: ${found} / ${entities.length} entities`);
  console.log(`  No emails:        ${noEmail}`);
  console.log("═══════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
