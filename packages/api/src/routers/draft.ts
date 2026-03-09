import { db, eq, desc } from "@norrjord-intel/db";
import { draft } from "@norrjord-intel/db/schema";
import z from "zod";

import { protectedProcedure } from "../index";

export const draftRouter = {
  getByEntity: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .handler(async ({ input }) => {
      return await db
        .select()
        .from(draft)
        .where(eq(draft.entityId, input.entityId))
        .orderBy(desc(draft.createdAt));
    }),

  create: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        subject: z.string().min(1),
        body: z.string().min(1),
        createdByAi: z.boolean().default(false),
      }),
    )
    .handler(async ({ input }) => {
      const [created] = await db.insert(draft).values(input).returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        subject: z.string().optional(),
        body: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const { id, ...data } = input;
      const [updated] = await db
        .update(draft)
        .set(data)
        .where(eq(draft.id, id))
        .returning();
      return updated;
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .handler(async ({ input }) => {
      const [updated] = await db
        .update(draft)
        .set({ approved: true })
        .where(eq(draft.id, input.id))
        .returning();
      return updated;
    }),
};
