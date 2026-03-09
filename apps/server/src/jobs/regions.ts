/**
 * Region helpers
 *
 * Loads regions from the database.
 */

import { db, eq } from "@norrjord-intel/db";
import { region as regionTable } from "@norrjord-intel/db/schema";

export interface RegionData {
  id: string;
  slug: string;
  label: string;
  regionKeywords: string[];
}

/**
 * Load a region from DB by slug
 */
export async function getRegion(slug: string): Promise<RegionData> {
  const row = await db.query.region.findFirst({
    where: eq(regionTable.slug, slug),
  });

  if (!row) {
    throw new Error(`Region "${slug}" not found in database. Create it via the CRM discovery page.`);
  }

  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    regionKeywords: (row.regionKeywords ?? []) as string[],
  };
}

/**
 * Load all regions from DB
 */
export async function getAllRegions(): Promise<RegionData[]> {
  const rows = await db.query.region.findMany();

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    regionKeywords: (row.regionKeywords ?? []) as string[],
  }));
}
