import { db, eq, desc } from "@norrjord-intel/db";
import { interaction } from "@norrjord-intel/db/schema";
import z from "zod";

import { protectedProcedure } from "../index";

export const interactionRouter = {
  getByEntity: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .handler(async ({ input }) => {
      return await db
        .select()
        .from(interaction)
        .where(eq(interaction.entityId, input.entityId))
        .orderBy(desc(interaction.occurredAt));
    }),

  create: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        type: z.enum(["note", "call", "email_sent_manual", "meeting"]),
        content: z.string().optional(),
        occurredAt: z.string().datetime().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const [created] = await db
        .insert(interaction)
        .values({
          ...input,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        })
        .returning();

      return created;
    }),
};
