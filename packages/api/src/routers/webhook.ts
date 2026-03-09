import { db, eq } from "@norrjord-intel/db";
import {
  entity,
  contact,
  relationshipStatus,
  interaction,
} from "@norrjord-intel/db/schema";
import z from "zod";

import { publicProcedure } from "../index";

export const webhookRouter = {
  stackOrgCreated: publicProcedure
    .input(
      z.object({
        stackOrgId: z.string(),
        orgNumber: z.string().optional(),
        email: z.string().optional(),
        domain: z.string().optional(),
        name: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      let matchedEntityId: string | null = null;

      // 1. Try match by orgNumber
      if (input.orgNumber) {
        const match = await db.query.entity.findFirst({
          where: eq(entity.orgNumber, input.orgNumber),
        });
        if (match) matchedEntityId = match.id;
      }

      // 2. Try match by contact email
      if (!matchedEntityId && input.email) {
        const contactMatch = await db.query.contact.findFirst({
          where: eq(contact.email, input.email),
        });
        if (contactMatch) matchedEntityId = contactMatch.entityId;
      }

      // 3. Try match by domain
      if (!matchedEntityId && input.domain) {
        const domainMatch = await db.query.entity.findFirst({
          where: eq(entity.domain, input.domain),
        });
        if (domainMatch) matchedEntityId = domainMatch.id;
      }

      if (matchedEntityId) {
        // Update existing entity
        await db
          .update(entity)
          .set({
            stackOrgId: input.stackOrgId,
            registrationPath: "organic",
          })
          .where(eq(entity.id, matchedEntityId));

        // Update or create pipeline status to closed_won
        const existingRelationship = await db.query.relationshipStatus.findFirst(
          {
            where: eq(relationshipStatus.entityId, matchedEntityId),
          },
        );

        if (existingRelationship) {
          await db
            .update(relationshipStatus)
            .set({ stage: "closed_won" })
            .where(eq(relationshipStatus.id, existingRelationship.id));
        } else {
          await db.insert(relationshipStatus).values({
            entityId: matchedEntityId,
            pipelineType: "pilot",
            stage: "closed_won",
          });
        }

        // Log interaction
        await db.insert(interaction).values({
          entityId: matchedEntityId,
          type: "note",
          content: "Producer registered organically on norrjord-stack",
        });

        return { matched: true, entityId: matchedEntityId };
      }

      // 4. No match — create new entity
      const [created] = await db
        .insert(entity)
        .values({
          name: input.name ?? "Unknown Producer",
          domain: input.domain,
          orgNumber: input.orgNumber,
          entityType: "producer",
          stackOrgId: input.stackOrgId,
          registrationPath: "organic",
        })
        .returning();

      if (!created) {
        throw new Error("Failed to create entity");
      }

      // Create pipeline status
      await db.insert(relationshipStatus).values({
        entityId: created.id,
        pipelineType: "pilot",
        stage: "closed_won",
      });

      // Add contact if email provided
      if (input.email) {
        await db.insert(contact).values({
          entityId: created.id,
          email: input.email,
          isPrimary: true,
        });
      }

      // Log interaction
      await db.insert(interaction).values({
        entityId: created.id,
        type: "note",
        content: "Producer registered organically on norrjord-stack (new entity created)",
      });

      return { matched: false, entityId: created.id };
    }),
};
