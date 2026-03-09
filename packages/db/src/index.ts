import { neon } from "@neondatabase/serverless";
import { env } from "@norrjord-intel/env/server";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

const neonClient = neon(env.DATABASE_URL);
export const db = drizzle(neonClient, { schema });

export { eq, and, or, desc, asc, ilike, sql, count, isNotNull, inArray } from "drizzle-orm";
export { SWEDISH_COUNTIES } from "./swedish-regions";
export type { SwedishCountySlug } from "./swedish-regions";
