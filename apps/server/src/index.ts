import { devToolsMiddleware } from "@ai-sdk/devtools";
import { google } from "@ai-sdk/google";
import { createContext } from "@norrjord-intel/api/context";
import { appRouter } from "@norrjord-intel/api/routers/index";
import { auth } from "@norrjord-intel/auth";
import { env } from "@norrjord-intel/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { streamText, convertToModelMessages, wrapLanguageModel } from "ai";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.post("/ai", async (c) => {
  const body = await c.req.json();
  const uiMessages = body.messages || [];
  const model = wrapLanguageModel({
    model: google("gemini-2.5-flash"),
    middleware: devToolsMiddleware(),
  });
  const result = streamText({
    model,
    messages: await convertToModelMessages(uiMessages),
  });

  return result.toUIMessageStreamResponse();
});

// ─── Webhooks (plain HTTP for external services) ──────

app.post("/webhooks/stack/org-created", async (c) => {
  const secret = c.req.header("x-webhook-secret");
  if (!env.STACK_WEBHOOK_SECRET || secret !== env.STACK_WEBHOOK_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const { db, eq } = await import("@norrjord-intel/db");
    const { entity, contact, relationshipStatus, interaction } = await import(
      "@norrjord-intel/db/schema"
    );

    const { stackOrgId, orgNumber, email, domain, name } = body;

    if (!stackOrgId) {
      return c.json({ error: "stackOrgId required" }, 400);
    }

    let matchedEntityId: string | null = null;

    // Cascading match: orgNumber → email → domain
    if (orgNumber) {
      const match = await db.query.entity.findFirst({
        where: eq(entity.orgNumber, orgNumber),
      });
      if (match) matchedEntityId = match.id;
    }

    if (!matchedEntityId && email) {
      const match = await db.query.contact.findFirst({
        where: eq(contact.email, email),
      });
      if (match) matchedEntityId = match.entityId;
    }

    if (!matchedEntityId && domain) {
      const match = await db.query.entity.findFirst({
        where: eq(entity.domain, domain),
      });
      if (match) matchedEntityId = match.id;
    }

    if (matchedEntityId) {
      await db
        .update(entity)
        .set({ stackOrgId, registrationPath: "organic" })
        .where(eq(entity.id, matchedEntityId));

      const existing = await db.query.relationshipStatus.findFirst({
        where: eq(relationshipStatus.entityId, matchedEntityId),
      });

      if (existing) {
        await db
          .update(relationshipStatus)
          .set({ stage: "closed_won" })
          .where(eq(relationshipStatus.id, existing.id));
      } else {
        await db.insert(relationshipStatus).values({
          entityId: matchedEntityId,
          pipelineType: "pilot",
          stage: "closed_won",
        });
      }

      await db.insert(interaction).values({
        entityId: matchedEntityId,
        type: "note",
        content: "Producer registered organically on norrjord-stack",
      });

      return c.json({ matched: true, entityId: matchedEntityId });
    }

    // No match — create new entity
    const [created] = await db
      .insert(entity)
      .values({
        name: name ?? "Unknown Producer",
        domain,
        orgNumber,
        entityType: "producer",
        stackOrgId,
        registrationPath: "organic",
      })
      .returning();

    if (!created) {
      return c.json({ error: "Failed to create entity" }, 500);
    }

    await db.insert(relationshipStatus).values({
      entityId: created.id,
      pipelineType: "pilot",
      stage: "closed_won",
    });

    if (email) {
      await db.insert(contact).values({
        entityId: created.id,
        email,
        isPrimary: true,
      });
    }

    await db.insert(interaction).values({
      entityId: created.id,
      type: "note",
      content:
        "Producer registered organically on norrjord-stack (new entity created)",
    });

    return c.json({ matched: false, entityId: created.id });
  } catch (error) {
    console.error("[webhook] stack/org-created error:", error);
    return c.json({ error: "Internal error" }, 500);
  }
});

// ─── REKO Feed Import (paste-to-pipeline) ───────────────

app.post("/api/import-reko", async (c) => {
  // Auth check
  const context = await createContext({ context: c });
  if (!context.session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { text, regionHint, rekoGroupName } = await c.req.json();

  if (!text || typeof text !== "string" || text.trim().length < 50) {
    return c.json({ error: "Paste at least 50 characters of text" }, 400);
  }

  try {
    const { parseRekoFeed, importRekoProducers } = await import("./jobs/parse-reko");
    const { enrichEntity } = await import("./jobs/enrich");
    const { fetchSitePages } = await import("./lib/helpers/text-extract");
    const { completeJsonTracked } = await import("./lib/claude");
    const { PIPELINE_CONFIG } = await import("./jobs/pipeline/config");
    const { db, eq } = await import("@norrjord-intel/db");
    const { entity, aiAnalysis } = await import("@norrjord-intel/db/schema");

    const region = regionHint || "Sverige";
    const groupName = rekoGroupName || "REKO (manual paste)";

    // Step 1: Parse with AI
    console.log(`[reko-import] Parsing pasted text (${text.length} chars)...`);
    const parsed = await parseRekoFeed(text, region);

    // Step 2: Import to DB
    console.log(`[reko-import] Importing ${parsed.meat_producers_found} meat producers...`);
    const importResult = await importRekoProducers(parsed, region, groupName, "reko_scrape");

    // Step 3: For new entities — fetch website + deep analyze + enrich
    const entityResults: Array<{
      id: string;
      name: string | null;
      enriched: boolean;
      deepAnalyzed: boolean;
      websiteFetched: boolean;
    }> = [];

    for (const ent of importResult.entities) {
      const result = { id: ent.id, name: ent.name, enriched: false, deepAnalyzed: false, websiteFetched: false };

      // Load the full entity to get website/domain
      const fullEntity = await db.query.entity.findFirst({
        where: eq(entity.id, ent.id),
      });

      if (!fullEntity) {
        entityResults.push(result);
        continue;
      }

      // 3a: Fetch website content + deep analyze if they have a URL
      if (fullEntity.websiteUrl) {
        try {
          console.log(`[reko-import] Fetching website for ${ent.name}: ${fullEntity.websiteUrl}`);
          const site = await fetchSitePages(fullEntity.websiteUrl, {
            maxPages: 3,
            maxChars: 15_000,
          });

          if (site.combinedText.length >= 100) {
            result.websiteFetched = true;

            // Deep analyze the website content
            const truncatedText = site.combinedText.slice(0, PIPELINE_CONFIG.maxTextCharsForAnalyze);
            const userPrompt = `URL: ${fullEntity.websiteUrl}\nContent (truncated to ${truncatedText.length} chars):\n${truncatedText}`;

            try {
              const { data: analysis } = await completeJsonTracked<any>({
                system: `You are a Swedish agricultural market analyst. You ONLY output valid JSON. Never hallucinate facts — if information is not in the text, use null or "unknown". Every claim must be grounded in the provided text.

You are analyzing a potential partner/pilot candidate for Norrjord, a demand-driven direct sales infrastructure platform for Swedish meat producers. Norrjord is a NATIONAL service — it is NOT limited to Norrland or any specific region.

Relevant entity types:
- Producers: farms that raise and sell meat (beef, lamb, pork, game, poultry)
- Partners: slaughterhouses, butcheries, meat processors, logistics providers that serve producers
- Investors: large-scale operations, agricultural groups, or individuals with capital + industry knowledge

SCORING RUBRICS:

pilot_fit (0–10):
- Direct sales signals (REKO, gårdsbutik, köttlåda, direktförsäljning, boxes): 0–4 points
- Primary meat producer or meat processing focus (not restaurant/marketplace): 0–2 points
- Professional readiness (clear products, ordering info, contact details): 0–2 points
- Existing customer base or delivery capability: 0–2 points

investor_fit (0–10):
- Scale signals (volume, multiple product lines, expansion, facilities): 0–4 points
- Organizational maturity (company structure, team, history): 0–2 points
- Strategic adjacency (slaughter, logistics, processing, wholesale): 0–2 points
- Growth/modernization orientation: 0–2 points

modernization (0–10):
- Website quality and professionalism: 0–3
- Digital ordering/e-commerce presence: 0–3
- Social media activity mentioned: 0–2
- Innovation language: 0–2

scale (0–10):
- Production volume hints: 0–3
- Product range breadth: 0–3
- Infrastructure mentions (own slaughter, facilities): 0–2
- Team/employee signals: 0–2

Return ONLY this JSON:

{
  "extracted": {
    "name": string | null,
    "production_type": "beef" | "lamb" | "pork" | "game" | "poultry" | "mixed" | "unknown",
    "region_text": string | null,
    "direct_sales_signals": [],
    "contact_emails_found": [],
    "scale_signals": [],
    "partner_investor_signals": []
  },
  "scores": {
    "pilot_fit": 0-10,
    "investor_fit": 0-10,
    "modernization": 0-10,
    "scale": 0-10
  },
  "summary": "2-3 sentence summary of who this is and why they matter for Norrjord",
  "suggested_angle": "1-2 sentences: how should the founder approach this entity?",
  "facts_used": ["direct quotes or paraphrases from the text that support scores"],
  "unknowns": ["things we could not determine from available text"]
}`,
                user: userPrompt,
                model: PIPELINE_CONFIG.analyzeModel,
                maxTokens: 2048,
              });

              // Update the AI analysis record (replace the basic classify one)
              await db.insert(aiAnalysis).values({
                entityId: ent.id,
                modelName: PIPELINE_CONFIG.analyzeModel,
                analysisType: "deep",
                pilotFitScore: analysis.scores?.pilot_fit ?? null,
                investorFitScore: analysis.scores?.investor_fit ?? null,
                modernizationScore: analysis.scores?.modernization ?? null,
                scaleScore: analysis.scores?.scale ?? null,
                summary: analysis.summary ?? null,
                suggestedAngle: analysis.suggested_angle ?? null,
                extractedFacts: analysis.extracted ?? null,
                rawOutputJson: analysis,
              });

              result.deepAnalyzed = true;
              console.log(`[reko-import] Deep analyzed ${ent.name}: pilot=${analysis.scores?.pilot_fit}, investor=${analysis.scores?.investor_fit}`);
            } catch (err) {
              console.error(`[reko-import] Deep analysis failed for ${ent.name}:`, err instanceof Error ? err.message : err);
            }

            // Also store emails found on website
            if (site.allEmails.length > 0) {
              const { contact } = await import("@norrjord-intel/db/schema");
              for (const email of site.allEmails) {
                const existing = await db.query.contact.findFirst({
                  where: (c, { and, eq }) => and(eq(c.entityId, ent.id), eq(c.email, email)),
                });
                if (!existing) {
                  await db.insert(contact).values({
                    entityId: ent.id,
                    email,
                    isPrimary: false,
                    sourceUrl: fullEntity.websiteUrl,
                  });
                }
              }
            }
          }
        } catch (err) {
          console.error(`[reko-import] Website fetch failed for ${ent.name}:`, err instanceof Error ? err.message : err);
        }
      }

      // 3b: Enrich from allabolag
      try {
        const enriched = await enrichEntity({
          id: ent.id,
          name: fullEntity.name,
          orgNumber: fullEntity.orgNumber,
          domain: fullEntity.domain,
        });
        result.enriched = enriched;
      } catch (err) {
        console.error(`[reko-import] Enrichment failed for ${ent.name}:`, err instanceof Error ? err.message : err);
      }

      entityResults.push(result);

      // Be polite with allabolag
      await new Promise((r) => setTimeout(r, 1500));
    }

    return c.json({
      parsed: {
        totalPosts: parsed.total_posts_found,
        meatProducers: parsed.meat_producers_found,
        nonMeatSkipped: parsed.non_meat_skipped,
        allProducers: parsed.producers.map((p) => ({
          name: p.farm_name ?? p.name,
          isMeat: p.is_meat_producer,
          type: p.production_type,
          products: p.products_mentioned,
          website: p.website_url,
          confidence: p.confidence,
        })),
      },
      imported: {
        created: importResult.created,
        skippedExisting: importResult.skippedExisting,
        skippedNonMeat: importResult.skippedNonMeat,
        skippedLowConfidence: importResult.skippedLowConfidence,
      },
      entities: entityResults,
    });
  } catch (error) {
    console.error("[reko-import] Error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      500,
    );
  }
});

// ─── URL Import (single URL → full pipeline) ────────────

app.post("/api/import-url", async (c) => {
  const context = await createContext({ context: c });
  if (!context.session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { url } = await c.req.json();

  if (!url || typeof url !== "string") {
    return c.json({ error: "Provide a URL" }, 400);
  }

  // Normalize URL
  const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;

  try {
    const { fetchSitePages, extractDomain } = await import("./lib/helpers/text-extract");
    const { completeJsonTracked } = await import("./lib/claude");
    const { PIPELINE_CONFIG } = await import("./jobs/pipeline/config");
    const { enrichEntity } = await import("./jobs/enrich");
    const { db, eq, and } = await import("@norrjord-intel/db");
    const {
      entity,
      entitySource,
      contact,
      aiAnalysis,
    } = await import("@norrjord-intel/db/schema");

    const domain = extractDomain(normalizedUrl);
    if (!domain) {
      return c.json({ error: "Could not parse domain from URL" }, 400);
    }

    // Check if entity already exists
    const existing = await db.query.entity.findFirst({
      where: eq(entity.domain, domain),
    });

    if (existing) {
      return c.json({
        error: `Entity already exists: ${existing.name ?? domain}`,
        entityId: existing.id,
        existing: true,
      }, 409);
    }

    // Step 1: Fetch website
    console.log(`[url-import] Fetching ${normalizedUrl}...`);
    const site = await fetchSitePages(normalizedUrl, {
      maxPages: 3,
      maxChars: 15_000,
    });

    if (site.combinedText.length < 50) {
      return c.json({ error: "Could not extract enough text from the website" }, 400);
    }

    // Step 2: Create entity
    const [newEntity] = await db
      .insert(entity)
      .values({
        name: domain, // will be replaced by AI analysis
        websiteUrl: normalizedUrl,
        domain,
        sourceUrl: normalizedUrl,
        rawExtractedText: site.combinedText.slice(0, 50_000),
      })
      .returning({ id: entity.id });

    if (!newEntity) {
      return c.json({ error: "Failed to create entity" }, 500);
    }

    await db.insert(entitySource).values({
      entityId: newEntity.id,
      sourceType: "manual",
      sourceUrl: normalizedUrl,
    });

    // Add emails found on website
    for (const email of site.allEmails) {
      await db.insert(contact).values({
        entityId: newEntity.id,
        email,
        isPrimary: site.allEmails.indexOf(email) === 0,
        sourceUrl: normalizedUrl,
      });
    }

    // Step 3: AI analysis
    let analysisResult: any = null;
    try {
      const truncatedText = site.combinedText.slice(0, PIPELINE_CONFIG.maxTextCharsForAnalyze);
      const userPrompt = `URL: ${normalizedUrl}\nContent (truncated to ${truncatedText.length} chars):\n${truncatedText}`;

      const { data } = await completeJsonTracked<any>({
        system: `You are a Swedish agricultural market analyst. You ONLY output valid JSON. Never hallucinate facts — if information is not in the text, use null or "unknown". Every claim must be grounded in the provided text.

You are analyzing a potential partner/pilot candidate for Norrjord, a demand-driven direct sales infrastructure platform for Swedish meat producers. Norrjord is a NATIONAL service — it is NOT limited to Norrland or any specific region.

Relevant entity types:
- Producers: farms that raise and sell meat (beef, lamb, pork, game, poultry)
- Partners: slaughterhouses, butcheries, meat processors, logistics providers that serve producers
- Investors: large-scale operations, agricultural groups, or individuals with capital + industry knowledge

SCORING RUBRICS:

pilot_fit (0–10):
- Direct sales signals (REKO, gårdsbutik, köttlåda, direktförsäljning, boxes): 0–4 points
- Primary meat producer or meat processing focus (not restaurant/marketplace): 0–2 points
- Professional readiness (clear products, ordering info, contact details): 0–2 points
- Existing customer base or delivery capability: 0–2 points

investor_fit (0–10):
- Scale signals (volume, multiple product lines, expansion, facilities): 0–4 points
- Organizational maturity (company structure, team, history): 0–2 points
- Strategic adjacency (slaughter, logistics, processing, wholesale): 0–2 points
- Growth/modernization orientation: 0–2 points

modernization (0–10):
- Website quality and professionalism: 0–3
- Digital ordering/e-commerce presence: 0–3
- Social media activity mentioned: 0–2
- Innovation language: 0–2

scale (0–10):
- Production volume hints: 0–3
- Product range breadth: 0–3
- Infrastructure mentions (own slaughter, facilities): 0–2
- Team/employee signals: 0–2

Return ONLY this JSON:

{
  "extracted": {
    "name": string | null,
    "production_type": "beef" | "lamb" | "pork" | "game" | "poultry" | "mixed" | "unknown",
    "entity_type": "producer" | "partner" | "investor" | "unknown",
    "region_text": string | null,
    "direct_sales_signals": [],
    "contact_emails_found": [],
    "scale_signals": [],
    "partner_investor_signals": []
  },
  "scores": {
    "pilot_fit": 0-10,
    "investor_fit": 0-10,
    "modernization": 0-10,
    "scale": 0-10
  },
  "summary": "2-3 sentence summary",
  "suggested_angle": "1-2 sentences: how should the founder approach this entity?",
  "facts_used": [],
  "unknowns": []
}`,
        user: userPrompt,
        model: PIPELINE_CONFIG.analyzeModel,
        maxTokens: 2048,
      });

      analysisResult = data;

      // Update entity with AI-extracted info
      const updateFields: Record<string, unknown> = {};
      if (data.extracted?.name) updateFields.name = data.extracted.name;
      if (data.extracted?.entity_type && data.extracted.entity_type !== "unknown") {
        updateFields.entityType = data.extracted.entity_type;
      }
      if (data.extracted?.production_type && data.extracted.production_type !== "unknown") {
        updateFields.productionType = data.extracted.production_type;
      }
      if (data.extracted?.region_text) updateFields.regionText = data.extracted.region_text;

      if (Object.keys(updateFields).length > 0) {
        await db.update(entity).set(updateFields).where(eq(entity.id, newEntity.id));
      }

      // Store analysis
      await db.insert(aiAnalysis).values({
        entityId: newEntity.id,
        modelName: PIPELINE_CONFIG.analyzeModel,
        analysisType: "deep",
        pilotFitScore: data.scores?.pilot_fit ?? null,
        investorFitScore: data.scores?.investor_fit ?? null,
        modernizationScore: data.scores?.modernization ?? null,
        scaleScore: data.scores?.scale ?? null,
        summary: data.summary ?? null,
        suggestedAngle: data.suggested_angle ?? null,
        extractedFacts: data.extracted ?? null,
        rawOutputJson: data,
      });

      // Not auto-adding to pipeline — user selects manually

      console.log(`[url-import] Analyzed: pilot=${data.scores?.pilot_fit}, investor=${data.scores?.investor_fit}`);
    } catch (err) {
      console.error(`[url-import] AI analysis failed:`, err instanceof Error ? err.message : err);
    }

    // Step 4: Enrich from allabolag
    let enriched = false;
    try {
      const updatedEntity = await db.query.entity.findFirst({
        where: eq(entity.id, newEntity.id),
        columns: { id: true, name: true, orgNumber: true, domain: true },
      });
      if (updatedEntity) {
        enriched = await enrichEntity(updatedEntity);
      }
    } catch (err) {
      console.error(`[url-import] Enrichment failed:`, err instanceof Error ? err.message : err);
    }

    // Load final entity state
    const finalEntity = await db.query.entity.findFirst({
      where: eq(entity.id, newEntity.id),
    });

    return c.json({
      entityId: newEntity.id,
      name: finalEntity?.name ?? domain,
      domain,
      scores: analysisResult?.scores ?? null,
      summary: analysisResult?.summary ?? null,
      enriched,
      revenue: finalEntity?.revenue ?? null,
      employeeCount: finalEntity?.employeeCount ?? null,
      municipality: finalEntity?.municipality ?? null,
    });
  } catch (error) {
    console.error("[url-import] Error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      500,
    );
  }
});

// ─── Send Campaign ──────────────────────────────────────

app.post("/api/send-campaign", async (c) => {
  const context = await createContext({ context: c });
  if (!context.session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { campaignName, templateId, entityIds } = await c.req.json();

  if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
    return c.json({ error: "Provide entityIds array" }, 400);
  }
  if (!templateId) {
    return c.json({ error: "Provide templateId" }, 400);
  }

  try {
    const { sendColdEmail } = await import("./lib/email");
    const { db, eq, and, inArray } = await import("@norrjord-intel/db");
    const { entity, contact, outreachCampaign, outreachSend } = await import("@norrjord-intel/db/schema");

    // Create campaign record
    const [campaign] = await db
      .insert(outreachCampaign)
      .values({
        name: campaignName || `Campaign ${new Date().toLocaleDateString("sv-SE")}`,
        templateId,
        status: "sending",
        totalRecipients: entityIds.length,
      })
      .returning();

    const entities = await db
      .select({
        id: entity.id,
        name: entity.name,
        companyName: entity.companyName,
        productionType: entity.productionType,
      })
      .from(entity)
      .where(inArray(entity.id, entityIds));

    // Check already emailed (any previous campaign)
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

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const ent of entities) {
      if (alreadyEmailed.has(ent.id)) {
        await db.insert(outreachSend).values({
          campaignId: campaign!.id,
          entityId: ent.id,
          email: "",
          status: "skipped",
          error: "Already emailed in a previous campaign",
        });
        skipped++;
        continue;
      }

      const primaryContact = await db.query.contact.findFirst({
        where: (ct, { eq, and }) =>
          and(eq(ct.entityId, ent.id), eq(ct.isPrimary, true)),
      });
      const anyContact = primaryContact ?? await db.query.contact.findFirst({
        where: (ct, { eq, and, isNotNull }) =>
          and(eq(ct.entityId, ent.id), isNotNull(ct.email)),
      });

      if (!anyContact?.email) {
        await db.insert(outreachSend).values({
          campaignId: campaign!.id,
          entityId: ent.id,
          email: "",
          status: "skipped",
          error: "No email found",
        });
        skipped++;
        continue;
      }

      const result = await sendColdEmail({
        to: anyContact.email,
        recipientName: anyContact.name,
        companyName: ent.companyName ?? ent.name,
        productionType: ent.productionType,
      });

      await db.insert(outreachSend).values({
        campaignId: campaign!.id,
        entityId: ent.id,
        email: anyContact.email,
        contactName: anyContact.name,
        status: result.success ? "sent" : "failed",
        resendId: result.id ?? null,
        error: result.error ?? null,
      });

      if (result.success) sent++;
      else failed++;

      await new Promise((r) => setTimeout(r, 200));
    }

    // Update campaign totals
    await db
      .update(outreachCampaign)
      .set({
        status: failed > 0 && sent === 0 ? "failed" : "completed",
        sentCount: sent,
        failedCount: failed,
        skippedCount: skipped,
        sentAt: new Date(),
      })
      .where(eq(outreachCampaign.id, campaign!.id));

    return c.json({ campaignId: campaign!.id, sent, skipped, failed, total: entityIds.length });
  } catch (error) {
    console.error("[send-campaign] Error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to send campaign" },
      500,
    );
  }
});

// ─── Background job runner ──────────────────────────────

import { spawn } from "child_process";

const runningJobs = new Map<string, { pid: number; startedAt: Date }>();

function runJob(name: string, scriptPath: string, args: string[] = []) {
  if (runningJobs.has(name)) {
    return { started: false, message: `${name} is already running` };
  }

  const child = spawn("bun", [scriptPath, ...args], {
    cwd: import.meta.dir + "/..",
    stdio: "ignore",
    detached: false,
  });

  runningJobs.set(name, { pid: child.pid!, startedAt: new Date() });

  child.on("exit", () => {
    runningJobs.delete(name);
  });

  return { started: true, message: `${name} started`, pid: child.pid };
}

app.post("/api/jobs/check-activity", async (c) => {
  const result = runJob("check-activity", "src/jobs/check-activity.ts");
  return c.json(result, result.started ? 200 : 409);
});

app.post("/api/jobs/find-emails", async (c) => {
  const result = runJob("find-emails", "src/jobs/find-emails.ts");
  return c.json(result, result.started ? 200 : 409);
});

app.post("/api/jobs/enrich", async (c) => {
  const result = runJob("enrich", "src/jobs/enrich.ts");
  return c.json(result, result.started ? 200 : 409);
});

app.get("/api/jobs/status", async (c) => {
  const jobs: Record<string, { running: boolean; startedAt?: string }> = {};
  for (const name of ["check-activity", "find-emails", "enrich"]) {
    const job = runningJobs.get(name);
    jobs[name] = job
      ? { running: true, startedAt: job.startedAt.toISOString() }
      : { running: false };
  }
  return c.json(jobs);
});

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
