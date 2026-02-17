/**
 * Serper.dev Google Search API wrapper
 *
 * Docs: https://serper.dev/playground
 * Returns structured search results (title, link, snippet, position)
 */

export interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

export interface SerperResponse {
  organic: SerperResult[];
  searchParameters: {
    q: string;
    gl: string;
    hl: string;
    num: number;
  };
}

interface SerperSearchOptions {
  query: string;
  num?: number; // max results per query (default 10)
  gl?: string; // country (default "se")
  hl?: string; // language (default "sv")
}

const SERPER_API_URL = "https://google.serper.dev/search";

export async function searchSerper(options: SerperSearchOptions): Promise<SerperResult[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("SERPER_API_KEY not set");

  const response = await fetch(SERPER_API_URL, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: options.query,
      gl: options.gl ?? "se",
      hl: options.hl ?? "sv",
      num: options.num ?? 10,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Serper API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as SerperResponse;
  return data.organic ?? [];
}

/**
 * Run multiple search queries with delay between them
 */
export async function searchBatch(
  queries: string[],
  options?: { num?: number; delayMs?: number },
): Promise<Map<string, SerperResult[]>> {
  const results = new Map<string, SerperResult[]>();
  const delayMs = options?.delayMs ?? 500;

  for (const query of queries) {
    try {
      const hits = await searchSerper({
        query,
        num: options?.num ?? 10,
      });
      results.set(query, hits);
    } catch (err) {
      console.error(`[serper] Failed query "${query}":`, err);
      results.set(query, []);
    }

    // rate limit between queries
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return results;
}
