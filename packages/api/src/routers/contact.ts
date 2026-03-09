import { db, eq } from "@norrjord-intel/db";
import { contact } from "@norrjord-intel/db/schema";
import z from "zod";

import { protectedProcedure } from "../index";

export const contactRouter = {
  getByEntity: protectedProcedure
    .input(z.object({ entityId: z.string().uuid() }))
    .handler(async ({ input }) => {
      return await db
        .select()
        .from(contact)
        .where(eq(contact.entityId, input.entityId));
    }),

  create: protectedProcedure
    .input(
      z.object({
        entityId: z.string().uuid(),
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        roleTitle: z.string().optional(),
        isPrimary: z.boolean().default(false),
      }),
    )
    .handler(async ({ input }) => {
      const [created] = await db.insert(contact).values(input).returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        roleTitle: z.string().optional(),
        isPrimary: z.boolean().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const { id, ...data } = input;
      const [updated] = await db
        .update(contact)
        .set(data)
        .where(eq(contact.id, id))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .handler(async ({ input }) => {
      await db.delete(contact).where(eq(contact.id, input.id));
      return { success: true };
    }),
};
