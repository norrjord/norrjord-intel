/**
 * Swedish search query matrix for meat producer discovery
 *
 * Organized by category. Run subsets per night to avoid repetition.
 * Track which queries have been run in discoveryRun.config.
 */

export interface QueryGroup {
  name: string;
  queries: string[];
}

export const QUERY_MATRIX: QueryGroup[] = [
  // ─── A. Direct sales — Generic ──────────────────────
  {
    name: "direct_sales_generic",
    queries: [
      "köttlåda beställ gård",
      "köttlåda direkt från bonden",
      "nötkött direktförsäljning gård",
      "gårdsbutik kött",
      "REKO ring kött producent",
      "köp kött direkt gård Sverige",
      "naturbeteskött beställ",
      "gräsbetat nötkött köpa",
      "hel halv kvart nöt beställ",
      "lokal köttproducent direktförsäljning",
    ],
  },

  // ─── B. By animal type ──────────────────────────────
  {
    name: "by_animal_type",
    queries: [
      "nötkött gård direktförsäljning",
      "lammkött gård köpa direkt",
      "griskött gård köpa",
      "viltkött jägare sälja",
      "vilt kött direkt jakt",
      "wagyu gård Sverige",
      "highland cattle kött Sverige",
      "angus nötkött gård",
    ],
  },

  // ─── C. Norrland / High Coast (pilot area) ─────────
  {
    name: "region_norrland",
    queries: [
      "köttproducent Västernorrland",
      "nötkött gård Ångermanland",
      "gårdsbutik kött Jämtland",
      "köttlåda Norrland",
      "REKO ring Sundsvall",
      "REKO ring Härnösand kött",
      "lantbruk kött Hälsingland",
      "nötkött producent Norrbotten",
    ],
  },

  // ─── D. Expansion regions ───────────────────────────
  {
    name: "region_expansion",
    queries: [
      "köttproducent Dalarna",
      "nötkött gård Gävleborg",
      "gårdsbutik kött Värmland",
      "köttlåda Västerbotten",
      "nötkött gård Östergötland",
      "köttproducent Gotland",
      "lammkött gård Gotland",
      "köttlåda Skåne gård",
    ],
  },

  // ─── E. Partners & infrastructure ───────────────────
  {
    name: "partners_infrastructure",
    queries: [
      "legoslakteri Sverige",
      "slakteri småskaligt Sverige",
      "mobilt slakteri Sverige",
      "styckeri lokal producent",
      "köttförädling småskalig",
      "gårdsslakteri Sverige",
    ],
  },
];

/**
 * Get all queries flat
 */
export function getAllQueries(): string[] {
  return QUERY_MATRIX.flatMap((group) => group.queries);
}

/**
 * Get queries for specific groups
 */
export function getQueriesByGroups(groupNames: string[]): string[] {
  return QUERY_MATRIX.filter((g) => groupNames.includes(g.name)).flatMap((g) => g.queries);
}

/**
 * Get total query count
 */
export function getQueryCount(): number {
  return QUERY_MATRIX.reduce((sum, g) => sum + g.queries.length, 0);
}
