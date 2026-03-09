import { db, eq, desc } from "@norrjord-intel/db";
import { region, discoveryRun } from "@norrjord-intel/db/schema";
import { resolve } from "node:path";
import z from "zod";

import { protectedProcedure } from "../index";

/** Resolve the apps/server directory from this file's location */
function serverCwd() {
  if (import.meta.dirname) {
    return resolve(import.meta.dirname, "../../../../apps/server");
  }
  return process.cwd();
}

export const discoveryRouter = {
  // ─── Regions ────────────────────────────────────────────

  listRegions: protectedProcedure.handler(async () => {
    const regions = await db.query.region.findMany({
      orderBy: region.label,
    });
    return regions;
  }),

  createRegion: protectedProcedure
    .input(
      z.object({
        slug: z.string().min(1).max(50),
        label: z.string().min(1).max(100),
        regionKeywords: z.array(z.string()).default([]),
      }),
    )
    .handler(async ({ input }) => {
      const [created] = await db
        .insert(region)
        .values({
          slug: input.slug,
          label: input.label,
          regionKeywords: input.regionKeywords,
        })
        .returning();
      return created;
    }),

  updateRegion: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        label: z.string().min(1).max(100).optional(),
        regionKeywords: z.array(z.string()).optional(),
      }),
    )
    .handler(async ({ input }) => {
      const updates: Record<string, unknown> = {};
      if (input.label !== undefined) updates.label = input.label;
      if (input.regionKeywords !== undefined) updates.regionKeywords = input.regionKeywords;

      const [updated] = await db
        .update(region)
        .set(updates)
        .where(eq(region.id, input.id))
        .returning();
      return updated;
    }),

  deleteRegion: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .handler(async ({ input }) => {
      await db.delete(region).where(eq(region.id, input.id));
      return { ok: true };
    }),

  // ─── Run History ──────────────────────────────────────

  getRunHistory: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(50).default(20),
        })
        .optional(),
    )
    .handler(async ({ input }) => {
      const limit = input?.limit ?? 20;
      const runs = await db
        .select()
        .from(discoveryRun)
        .orderBy(desc(discoveryRun.startedAt))
        .limit(limit);
      return runs;
    }),

  // ─── Cancel a Run ────────────────────────────────────

  cancelRun: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .handler(async ({ input }) => {
      const [run] = await db
        .select()
        .from(discoveryRun)
        .where(eq(discoveryRun.id, input.runId))
        .limit(1);

      if (!run) return { ok: false, message: "Run not found" };
      if (run.completedAt) return { ok: false, message: "Run already completed" };

      if (run.pid) {
        try {
          process.kill(run.pid, "SIGTERM");
        } catch {
          // Process may already be dead
        }
      }

      await db
        .update(discoveryRun)
        .set({
          completedAt: new Date(),
          errors: [...((run.errors as any[]) ?? []), "Cancelled by user"],
        })
        .where(eq(discoveryRun.id, input.runId));

      return { ok: true, message: "Run cancelled" };
    }),

  // ─── Trigger Discovery (search pipeline) ──────────────

  triggerSearch: protectedProcedure
    .handler(async () => {
      const proc = Bun.spawn(["bun", "src/jobs/discover.ts"], {
        cwd: serverCwd(),
        stdout: "inherit",
        stderr: "inherit",
        detached: true,
      });

      proc.unref?.();

      return {
        started: true,
        message: "Discovery pipeline started (all of Sweden)",
      };
    }),

  // ─── Trigger Allabolag Discovery ────────────────────

  triggerAllabolag: protectedProcedure
    .input(
      z.object({
        minRevenue: z.number().min(0).default(0),
      }).optional(),
    )
    .handler(async ({ input }) => {
      const args = ["src/jobs/discover-allabolag.ts"];
      if (input?.minRevenue && input.minRevenue > 0) {
        args.push("--min-revenue", String(input.minRevenue));
      }

      const proc = Bun.spawn(["bun", ...args], {
        cwd: serverCwd(),
        stdout: "inherit",
        stderr: "inherit",
        detached: true,
      });

      proc.unref?.();

      return {
        started: true,
        message: `Allabolag discovery started${input?.minRevenue ? ` (min revenue: ${input.minRevenue} TSEK)` : ""}`,
      };
    }),

  // ─── Trigger Enrichment ─────────────────────────────

  triggerEnrich: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const args = ["src/jobs/enrich.ts"];
      if (input.entityId) {
        args.push("--id", input.entityId);
      }

      const proc = Bun.spawn(["bun", ...args], {
        cwd: serverCwd(),
        stdout: "inherit",
        stderr: "inherit",
        detached: true,
      });

      proc.unref?.();

      return {
        started: true,
        message: input.entityId
          ? "Enriching single entity..."
          : "Enrichment started for all un-enriched entities",
      };
    }),
};
