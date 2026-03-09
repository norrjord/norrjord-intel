import { db, eq, and, desc, sql, count, inArray, ilike } from "@norrjord-intel/db";
import {
  entity,
  emailTemplate,
  outreachCampaign,
  outreachSend,
} from "@norrjord-intel/db/schema";
import z from "zod";

import { protectedProcedure } from "../index";


export const outreachRouter = {
  // ─── Templates ──────────────────────────────────────────

  listTemplates: protectedProcedure.handler(async () => {
    return db
      .select()
      .from(emailTemplate)
      .orderBy(desc(emailTemplate.createdAt));
  }),

  getTemplate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .handler(async ({ input }) => {
      const result = await db
        .select()
        .from(emailTemplate)
        .where(eq(emailTemplate.id, input.id))
        .limit(1);
      return result[0] ?? null;
    }),

  createTemplate: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        subject: z.string().min(1),
        html: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const [created] = await db
        .insert(emailTemplate)
        .values(input)
        .returning();
      return created;
    }),

  updateTemplate: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        subject: z.string().min(1).optional(),
        html: z.string().min(1).optional(),
        description: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const { id, ...data } = input;
      const [updated] = await db
        .update(emailTemplate)
        .set(data)
        .where(eq(emailTemplate.id, id))
        .returning();
      return updated;
    }),

  deleteTemplate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .handler(async ({ input }) => {
      await db.delete(emailTemplate).where(eq(emailTemplate.id, input.id));
      return { success: true };
    }),

  // ─── Campaigns ──────────────────────────────────────────

  listCampaigns: protectedProcedure.handler(async () => {
    return db.query.outreachCampaign.findMany({
      with: { template: true },
      orderBy: (c, { desc }) => [desc(c.createdAt)],
    });
  }),

  getCampaign: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .handler(async ({ input }) => {
      return db.query.outreachCampaign.findFirst({
        where: eq(outreachCampaign.id, input.id),
        with: {
          template: true,
          sends: {
            with: { entity: true },
            orderBy: (s, { desc }) => [desc(s.sentAt)],
          },
        },
      }) ?? null;
    }),

  // ─── History ──────────────────────────────────────────

  listSends: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .handler(async ({ input }) => {
      const sends = await db.query.outreachSend.findMany({
        with: {
          entity: true,
          campaign: { with: { template: true } },
        },
        orderBy: (s, { desc }) => [desc(s.sentAt)],
        limit: input.limit,
        offset: input.offset,
      });

      const [totalResult] = await db
        .select({ total: count() })
        .from(outreachSend);

      return { sends, total: totalResult?.total ?? 0 };
    }),

  // ─── Preview recipients ───────────────────────────────

  preview: protectedProcedure
    .input(
      z.object({
        filters: z.object({
          minScore: z.number().min(0).max(10).optional(),
          entityType: z.enum(["producer", "partner", "investor", "unknown"]).optional(),
          productionType: z.enum(["beef", "lamb", "pork", "game", "poultry", "mixed", "unknown"]).optional(),
          counties: z.array(z.string()).optional(),
          hideInactive: z.boolean().optional(),
        }).default({}),
      }),
    )
    .handler(async ({ input }) => {
      const conditions = [];
      const f = input.filters;

      if (f.entityType) {
        conditions.push(eq(entity.entityType, f.entityType));
      }
      if (f.productionType) {
        conditions.push(eq(entity.productionType, f.productionType));
      }
      if (f.counties && f.counties.length > 0) {
        const cc = f.counties.map(
          (c) => sql`(${ilike(entity.county, `%${c}%`)} OR ${ilike(entity.municipality, `%${c}%`)})`,
        );
        conditions.push(sql`(${sql.join(cc, sql` OR `)})`);
      }
      if (f.hideInactive) {
        conditions.push(
          sql`${entity.activityStatus} NOT IN ('inactive', 'likely_inactive')`,
        );
      }
      if (f.minScore) {
        conditions.push(sql`(
          SELECT a.pilot_fit_score FROM ai_analysis a
          WHERE a.entity_id = entity.id AND a.analysis_type = 'deep'
          ORDER BY a.created_at DESC LIMIT 1
        ) >= ${f.minScore}`);
      }

      const entities = await db
        .select({
          id: entity.id,
          name: entity.name,
          companyName: entity.companyName,
          domain: entity.domain,
          productionType: entity.productionType,
        })
        .from(entity)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      if (entities.length === 0) {
        return { recipients: [], readyCount: 0, totalCount: 0 };
      }

      const entityIds = entities.map((e) => e.id);

      // Already emailed (any campaign, status = sent)
      const alreadyEmailedRows = await db
        .select({ entityId: outreachSend.entityId })
        .from(outreachSend)
        .where(
          and(
            inArray(outreachSend.entityId, entityIds),
            eq(outreachSend.status, "sent"),
          ),
        );
      const alreadyEmailed = new Set(alreadyEmailedRows.map((r) => r.entityId));

      const recipients: Array<{
        entityId: string;
        entityName: string | null;
        domain: string | null;
        email: string | null;
        contactName: string | null;
        status: "ready" | "no_email" | "already_emailed";
      }> = [];

      for (const ent of entities) {
        const primaryContact = await db.query.contact.findFirst({
          where: (c, { eq, and }) =>
            and(eq(c.entityId, ent.id), eq(c.isPrimary, true)),
        });
        const anyContact = primaryContact ?? await db.query.contact.findFirst({
          where: (c, { eq, and, isNotNull }) =>
            and(eq(c.entityId, ent.id), isNotNull(c.email)),
        });

        if (!anyContact?.email) {
          recipients.push({
            entityId: ent.id,
            entityName: ent.companyName ?? ent.name,
            domain: ent.domain,
            email: null,
            contactName: null,
            status: "no_email",
          });
          continue;
        }

        if (alreadyEmailed.has(ent.id)) {
          recipients.push({
            entityId: ent.id,
            entityName: ent.companyName ?? ent.name,
            domain: ent.domain,
            email: anyContact.email,
            contactName: anyContact.name,
            status: "already_emailed",
          });
          continue;
        }

        recipients.push({
          entityId: ent.id,
          entityName: ent.companyName ?? ent.name,
          domain: ent.domain,
          email: anyContact.email,
          contactName: anyContact.name,
          status: "ready",
        });
      }

      const readyCount = recipients.filter(
        (r) => r.status === "ready",
      ).length;

      return { recipients, readyCount, totalCount: recipients.length };
    }),
};
