/**
 * Website fetcher + text extractor
 *
 * Fetches homepage, discovers internal links, follows relevant ones.
 * Handles timeouts, errors, and text length caps.
 */

import * as cheerio from "cheerio";

// ─── Config ─────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_SIZE = 500_000;
const USER_AGENT = "Mozilla/5.0 (compatible; NorrjordIntel/1.0; +https://norrjord.se)";

// Keywords that suggest a page is worth fetching (Swedish + English)
const RELEVANT_LINK_KEYWORDS = [
  // About
  "om",
  "om-oss",
  "om oss",
  "about",
  "historia",
  "vår gård",
  "garden",
  // Contact
  "kontakt",
  "kontakta",
  "contact",
  // Products / shop
  "produkter",
  "produkt",
  "vara-produkter",
  "våra produkter",
  "sortiment",
  "kött",
  "nötkött",
  "lamm",
  "gris",
  "vilt",
  // Ordering
  "beställ",
  "bestall",
  "köp",
  "handla",
  "shop",
  "order",
  "köttlåda",
  "kottlada",
  // Farm shop
  "gårdsbutik",
  "gardsbutik",
  "butik",
  // REKO
  "reko",
];

// ─── Types ──────────────────────────────────────────────

export interface FetchedPage {
  url: string;
  text: string;
  title: string | null;
  emails: string[];
  success: boolean;
  error?: string;
}

// ─── Fetch a single page ────────────────────────────────

export async function fetchPage(url: string): Promise<FetchedPage> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        url,
        text: "",
        title: null,
        emails: [],
        success: false,
        error: `HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return {
        url,
        text: "",
        title: null,
        emails: [],
        success: false,
        error: `Not HTML: ${contentType}`,
      };
    }

    let html = await response.text();
    if (html.length > MAX_HTML_SIZE) {
      html = html.slice(0, MAX_HTML_SIZE);
    }

    const extracted = extractFromHtml(html, url);

    return {
      url,
      text: extracted.text,
      title: extracted.title,
      emails: extracted.emails,
      success: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown fetch error";
    return {
      url,
      text: "",
      title: null,
      emails: [],
      success: false,
      error: message,
    };
  }
}

// ─── Extract text, emails, and internal links from HTML ─

interface ExtractResult {
  text: string;
  title: string | null;
  emails: string[];
  internalLinks: string[];
}

function extractFromHtml(html: string, pageUrl: string): ExtractResult {
  const $ = cheerio.load(html);

  // ── Discover internal links BEFORE removing elements ──
  const internalLinks = discoverRelevantLinks($, pageUrl);

  // ── Remove noisy elements ─────────────────────────────
  $(
    "script, style, noscript, nav, footer, header, iframe, svg, form, " +
      "[role='navigation'], [role='banner'], .cookie-banner, .popup, #cookie-consent",
  ).remove();

  const title = $("title").first().text().trim() || null;

  // ── Get main content ──────────────────────────────────
  let textContent = "";
  const mainSelectors = ["main", "article", '[role="main"]', ".content", "#content"];

  for (const selector of mainSelectors) {
    const el = $(selector);
    if (el.length > 0) {
      textContent = el.text();
      break;
    }
  }

  if (!textContent) {
    textContent = $("body").text();
  }

  const text = textContent
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();

  // ── Extract emails from full HTML ─────────────────────
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const allEmails = html.match(emailRegex) ?? [];

  const emails = [...new Set(allEmails)].filter(
    (e) =>
      !e.includes("example.com") &&
      !e.includes("sentry.io") &&
      !e.includes("wixpress") &&
      !e.includes("wordpress") &&
      !e.endsWith(".png") &&
      !e.endsWith(".jpg"),
  );

  return { text, title, emails, internalLinks };
}

// ─── Discover relevant internal links from a page ───────

function discoverRelevantLinks($: cheerio.CheerioAPI, pageUrl: string): string[] {
  let baseDomain: string;
  try {
    baseDomain = new URL(pageUrl).hostname;
  } catch {
    return [];
  }

  const found = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    // Resolve relative URLs
    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(href, pageUrl).href;
    } catch {
      return;
    }

    // Must be same domain
    try {
      if (new URL(absoluteUrl).hostname !== baseDomain) return;
    } catch {
      return;
    }

    // Skip anchors, files, and the homepage itself
    if (absoluteUrl.includes("#")) return;
    if (/\.(pdf|jpg|jpeg|png|gif|svg|doc|zip)$/i.test(absoluteUrl)) return;
    const path = new URL(absoluteUrl).pathname;
    if (path === "/" || path === "") return;

    // Check if link text or href path matches relevant keywords
    const linkText = $(el).text().toLowerCase().trim();
    const pathLower = path.toLowerCase();

    const isRelevant = RELEVANT_LINK_KEYWORDS.some(
      (kw) => linkText.includes(kw) || pathLower.includes(kw),
    );

    if (isRelevant) {
      found.add(absoluteUrl);
    }
  });

  return [...found];
}

// ─── Fetch site: homepage + discovered relevant pages ───

/**
 * Fetches homepage, discovers actual internal links,
 * follows the most relevant ones. No more path guessing.
 */
export async function fetchSitePages(
  baseUrl: string,
  options?: { maxPages?: number; maxChars?: number; delayMs?: number },
): Promise<{
  pages: FetchedPage[];
  combinedText: string;
  allEmails: string[];
}> {
  const maxPages = options?.maxPages ?? 3;
  const maxChars = options?.maxChars ?? 15_000;
  const delayMs = options?.delayMs ?? 1_000;

  // Normalize base URL
  let base = baseUrl;
  if (!base.startsWith("http")) base = `https://${base}`;
  if (base.endsWith("/")) base = base.slice(0, -1);

  const pages: FetchedPage[] = [];
  const allEmails: string[] = [];
  let totalChars = 0;

  // ── Step 1: Fetch homepage ────────────────────────────

  const homepage = await fetchPage(base);

  if (!homepage.success || homepage.text.length < 50) {
    // Try with www prefix if bare domain failed
    const wwwUrl = base.replace("://", "://www.");
    const wwwPage = await fetchPage(wwwUrl);

    if (!wwwPage.success || wwwPage.text.length < 50) {
      return { pages: [], combinedText: "", allEmails: [] };
    }

    pages.push(wwwPage);
    totalChars += wwwPage.text.length;
    allEmails.push(...wwwPage.emails);
  } else {
    pages.push(homepage);
    totalChars += homepage.text.length;
    allEmails.push(...homepage.emails);
  }

  // ── Step 2: Discover links from homepage HTML ─────────

  // Re-fetch homepage HTML to extract links (we need the raw HTML)
  const homepageHtml = await fetchRawHtml(base);
  const relevantLinks = homepageHtml ? extractFromHtml(homepageHtml, base).internalLinks : [];

  // ── Step 3: Follow discovered links ───────────────────

  const visitedUrls = new Set([base, base + "/"]);

  for (const link of relevantLinks) {
    if (pages.length >= maxPages) break;
    if (totalChars >= maxChars) break;
    if (visitedUrls.has(link)) continue;

    visitedUrls.add(link);

    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    try {
      const page = await fetchPage(link);

      if (page.success && page.text.length > 100) {
        pages.push(page);
        totalChars += page.text.length;
        allEmails.push(...page.emails);
      }
    } catch {
      // skip failed pages
    }
  }

  // ── Combine and cap ───────────────────────────────────

  let combinedText = pages.map((p) => p.text).join("\n\n---\n\n");
  if (combinedText.length > maxChars) {
    combinedText = combinedText.slice(0, maxChars);
  }

  return {
    pages,
    combinedText,
    allEmails: [...new Set(allEmails)],
  };
}

// ─── Helper: fetch raw HTML (for link discovery) ────────

async function fetchRawHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const html = await response.text();
    return html.length > MAX_HTML_SIZE ? html.slice(0, MAX_HTML_SIZE) : html;
  } catch {
    return null;
  }
}

// ─── Domain extraction utility ──────────────────────────

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
