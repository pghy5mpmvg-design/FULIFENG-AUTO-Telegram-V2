import Fastify from "fastify";
import { env } from "./config.js";
import { scoreLead } from "./services/scoring.js";
import { RawLeadSchema } from "./schemas/lead.js";
import { BasicEnrichmentProvider } from "./services/enrichment.js";
import { ingestLead } from "./services/lead-ingestion.js";
import { generateFirstTouch } from "./services/message-generator.js";
import { classifyReply } from "./services/reply-classifier.js";
import { prepareFirstTouch } from "./services/outreach-service.js";
import { handleReply } from "./services/reply-handler.js";
import { getDueFollowups, scheduleNextFollowup } from "./services/followup.js";
import { ingestLeadBatch } from "./services/bulk-ingestion.js";
import { databaseHealth } from "./services/system-health.js";
import { db } from "./db.js";
import { migrateToNeon } from "./services/neon-migration.js";
import { previewCollection, collectAndIngest } from "./services/collector-pipeline.js";
import { collectEnrichAndIngest } from "./services/enriched-collector.js";
import { enrichFromWebsite } from "./services/site-enrichment.js";

const app = Fastify({ logger: true });
const enrichment = new BasicEnrichmentProvider();

app.get("/health", async () => ({
  ok: true,
  service: "ai-overseas-sales-engine-v1",
  version: "0.5.0"
}));

app.get("/health/db", async (_request, reply) => {
  const dbStatus = await databaseHealth();
  return reply.send({
    ok: true,
    service: "ai-overseas-sales-engine-v1",
    ...dbStatus
  });
});

app.post("/v1/collect/preview", async (request, reply) => {
  const body = request.body as {
    provider?: "tavily" | "serper" | "serpapi";
    country?: string;
    industry?: string;
    businessType?: string;
    keywords?: string[];
    limit?: number;
  };

  if (!body.provider || !body.country || !body.industry) {
    return reply.code(400).send({
      error: "PROVIDER_COUNTRY_INDUSTRY_REQUIRED"
    });
  }

  const result = await previewCollection(
    {
      TAVILY_API_KEY: env.TAVILY_API_KEY,
      SERPER_API_KEY: env.SERPER_API_KEY,
      SERPAPI_API_KEY: env.SERPAPI_API_KEY
    },
    {
      provider: body.provider,
      country: body.country,
      industry: body.industry,
      businessType: body.businessType,
      keywords: body.keywords,
      limit: body.limit
    }
  );

  return reply.send(result);
});

app.post("/v1/collect/full", async (request, reply) => {
  const body = request.body as {
    provider?: "tavily" | "serper" | "serpapi";
    country?: string;
    industry?: string;
    businessType?: string;
    keywords?: string[];
    limit?: number;
  };

  if (!body.provider || !body.country || !body.industry) {
    return reply.code(400).send({
      error: "PROVIDER_COUNTRY_INDUSTRY_REQUIRED"
    });
  }

  const result = await collectEnrichAndIngest(
    {
      TAVILY_API_KEY: env.TAVILY_API_KEY,
      SERPER_API_KEY: env.SERPER_API_KEY,
      SERPAPI_API_KEY: env.SERPAPI_API_KEY
    },
    {
      provider: body.provider,
      country: body.country,
      industry: body.industry,
      businessType: body.businessType,
      keywords: body.keywords,
      limit: body.limit
    }
  );

  return reply.code(201).send(result);
});

app.post("/v1/collect/ingest", async (request, reply) => {
  const body = request.body as {
    provider?: "tavily" | "serper" | "serpapi";
    country?: string;
    industry?: string;
    businessType?: string;
    keywords?: string[];
    limit?: number;
  };

  if (!body.provider || !body.country || !body.industry) {
    return reply.code(400).send({
      error: "PROVIDER_COUNTRY_INDUSTRY_REQUIRED"
    });
  }

  const result = await collectAndIngest(
    {
      TAVILY_API_KEY: env.TAVILY_API_KEY,
      SERPER_API_KEY: env.SERPER_API_KEY,
      SERPAPI_API_KEY: env.SERPAPI_API_KEY
    },
    {
      provider: body.provider,
      country: body.country,
      industry: body.industry,
      businessType: body.businessType,
      keywords: body.keywords,
      limit: body.limit
    }
  );

  return reply.code(201).send(result);
});

app.get("/v1/leads", async (request, reply) => {
  const query = request.query as {
    country?: string;
    grade?: "A" | "B" | "C" | "D";
    limit?: string;
  };

  const limit = Math.max(1, Math.min(Number(query.limit || 50), 200));

  const rows = await db.lead.findMany({
    where: {
      ...(query.grade ? { grade: query.grade } : {}),
      ...(query.country
        ? {
            company: {
              country: {
                equals: query.country,
                mode: "insensitive"
              }
            }
          }
        : {})
    },
    include: {
      company: true,
      contact: true
    },
    orderBy: [
      { score: "desc" },
      { updatedAt: "desc" }
    ],
    take: limit
  });

  return reply.send({
    count: rows.length,
    rows: rows.map(row => ({
      leadId: row.id,
      score: row.score,
      grade: row.grade,
      status: row.status,
      company: {
        name: row.company.name,
        website: row.company.website,
        domain: row.company.domain,
        country: row.company.country,
        city: row.company.city,
        industry: row.company.industry,
        businessType: row.company.businessType,
        source: row.company.source,
        sourceUrl: row.company.sourceUrl
      },
      contact: row.contact
        ? {
            fullName: row.contact.fullName,
            position: row.contact.position,
            email: row.contact.email,
            phone: row.contact.phone,
            whatsapp: row.contact.whatsapp,
            telegram: row.contact.telegram,
            linkedin: row.contact.linkedin,
            language: row.contact.language,
            verified: row.contact.verified
          }
        : null
    }))
  });
});

app.get("/v1/leads/clean", async (request, reply) => {
  const query = request.query as {
    country?: string;
    limit?: string;
  };

  const limit = Math.max(1, Math.min(Number(query.limit || 50), 200));
  const excludedDomains = [
    "vk.com","vk.ru","2gis.ru","2gis.com","avito.ru","auto.ru","drom.ru",
    "yandex.ru","google.com","wikipedia.org","youtube.com","instagram.com",
    "facebook.com","t.me","telegram.me","lenta.ru","gazeta.ru",
    "ispravochnik.com","partnersearch.ru","abreview.ru","cto-expo.ru",
    "econbull-icsras.ru"
  ];

  const rows = await db.lead.findMany({
    where: query.country
      ? {
          company: {
            country: {
              equals: query.country,
              mode: "insensitive"
            }
          }
        }
      : undefined,
    include: {
      company: true,
      contact: true
    },
    orderBy: [
      { score: "desc" },
      { updatedAt: "desc" }
    ],
    take: 500
  });

  const seen = new Set<string>();
  const clean = [];

  for (const row of rows) {
    const domain = (row.company.domain || "").toLowerCase();
    if (!domain) continue;
    if (excludedDomains.some(x => domain === x || domain.endsWith(`.${x}`))) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);

    const contact = row.contact;
    const channels = [
      contact?.email,
      contact?.phone,
      contact?.whatsapp,
      contact?.telegram,
      contact?.linkedin
    ].filter(Boolean).length;

    clean.push({
      leadId: row.id,
      companyName: row.company.name,
      website: row.company.website,
      domain,
      score: row.score,
      grade: row.grade,
      status: row.status,
      contactCompleteness: channels,
      contact: contact
        ? {
            email: contact.email,
            phone: contact.phone,
            whatsapp: contact.whatsapp,
            telegram: contact.telegram,
            linkedin: contact.linkedin,
            fullName: contact.fullName,
            position: contact.position
          }
        : null
    });

    if (clean.length >= limit) break;
  }

  return reply.send({
    count: clean.length,
    rows: clean
  });
});

app.post("/v1/score-preview", async (request, reply) => {
  const body = request.body as Record<string, unknown>;
  return reply.send(scoreLead(body));
});

app.post("/v1/leads/preview", async (request, reply) => {
  const parsed = RawLeadSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "INVALID_LEAD",
      details: parsed.error.flatten()
    });
  }

  const enriched = await enrichment.enrich(parsed.data);
  const message = generateFirstTouch({ lead: enriched });

  return reply.send({ enriched, message });
});

app.post("/v1/leads/bulk-ingest", async (request, reply) => {
  const body = request.body as unknown;
  if (!Array.isArray(body)) {
    return reply.code(400).send({ error: "ARRAY_REQUIRED" });
  }

  const rows = [];
  for (const item of body) {
    const parsed = RawLeadSchema.safeParse(item);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "INVALID_LEAD_IN_BATCH",
        details: parsed.error.flatten()
      });
    }
    rows.push(parsed.data);
  }

  const result = await ingestLeadBatch(rows);
  return reply.code(201).send(result);
});

app.post("/v1/leads/ingest", async (request, reply) => {
  const parsed = RawLeadSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "INVALID_LEAD",
      details: parsed.error.flatten()
    });
  }

  const enriched = await enrichment.enrich(parsed.data);
  const saved = await ingestLead(enriched);
  const generatedFirstTouch = generateFirstTouch({
    lead: enriched,
    offer: saved.lead.recommendedOffer || undefined
  });

  return reply.code(201).send({
    saved,
    generatedFirstTouch
  });
});

app.post("/v1/outreach/prepare", async (request, reply) => {
  const body = request.body as {
    leadId?: string;
    lead?: unknown;
    channel?: "EMAIL" | "WHATSAPP" | "TELEGRAM" | "LINKEDIN" | "OTHER";
    campaignId?: string;
    offer?: string;
  };

  if (!body.leadId) {
    return reply.code(400).send({ error: "LEAD_ID_REQUIRED" });
  }

  const parsed = RawLeadSchema.safeParse(body.lead);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "INVALID_LEAD",
      details: parsed.error.flatten()
    });
  }

  const enriched = await enrichment.enrich(parsed.data);

  const result = await prepareFirstTouch({
    leadId: body.leadId,
    enrichedLead: enriched,
    channel: body.channel,
    campaignId: body.campaignId,
    offer: body.offer
  });

  return reply.send(result);
});

app.get("/v1/outreach/pending-approval", async (request, reply) => {
  const query = request.query as { limit?: string };
  const limit = Math.max(1, Math.min(Number(query.limit || 50), 200));

  const rows = await db.outreachMessage.findMany({
    where: { status: "PENDING_APPROVAL" },
    include: {
      lead: {
        include: {
          company: true,
          contact: true
        }
      },
      campaign: true
    },
    orderBy: [
      { lead: { score: "desc" } },
      { createdAt: "asc" }
    ],
    take: limit
  });

  return reply.send({
    count: rows.length,
    rows: rows.map(row => ({
      messageId: row.id,
      channel: row.channel,
      subject: row.subject,
      body: row.body,
      campaign: row.campaign ? {
        id: row.campaign.id,
        name: row.campaign.name,
        active: row.campaign.active
      } : null,
      lead: {
        id: row.lead.id,
        score: row.lead.score,
        grade: row.lead.grade,
        status: row.lead.status
      },
      company: {
        name: row.lead.company.name,
        domain: row.lead.company.domain
      },
      contact: row.lead.contact ? {
        fullName: row.lead.contact.fullName,
        position: row.lead.contact.position,
        email: row.lead.contact.email,
        phone: row.lead.contact.phone,
        whatsapp: row.lead.contact.whatsapp,
        telegram: row.lead.contact.telegram,
        verified: row.lead.contact.verified
      } : null
    }))
  });
});

app.post("/v1/outreach/approve", async (request, reply) => {
  const body = request.body as { messageIds?: string[] };
  const messageIds = Array.from(new Set(body.messageIds || [])).filter(Boolean);

  if (!messageIds.length) {
    return reply.code(400).send({ error: "MESSAGE_IDS_REQUIRED" });
  }

  const rows = await db.outreachMessage.findMany({
    where: { id: { in: messageIds } },
    include: {
      lead: true,
      campaign: true
    }
  });

  const invalid = rows.filter(row =>
    row.status !== "PENDING_APPROVAL" ||
    ["LOST", "DO_NOT_CONTACT", "WON"].includes(row.lead.status)
  );

  if (rows.length !== messageIds.length || invalid.length) {
    return reply.code(409).send({
      error: "MESSAGE_NOT_APPROVABLE",
      found: rows.length,
      requested: messageIds.length,
      invalid: invalid.map(row => ({
        messageId: row.id,
        messageStatus: row.status,
        leadStatus: row.lead.status
      }))
    });
  }

  await db.$transaction(async tx => {
    await tx.outreachMessage.updateMany({
      where: { id: { in: messageIds }, status: "PENDING_APPROVAL" },
      data: { status: "QUEUED" }
    });

    for (const row of rows) {
      await tx.activity.create({
        data: {
          leadId: row.leadId,
          type: "OUTREACH_APPROVED",
          payload: {
            messageId: row.id,
            channel: row.channel,
            campaignId: row.campaignId,
            campaignActive: row.campaign?.active ?? null
          }
        }
      });
    }
  });

  return reply.send({
    approved: rows.length,
    status: "QUEUED",
    note: "Approval does not itself send the message."
  });
});

app.post("/v1/outreach/mark-sent", async (request, reply) => {
  const body = request.body as {
    messageId?: string;
    providerId?: string;
    sentAt?: string;
  };

  if (!body.messageId) {
    return reply.code(400).send({ error: "MESSAGE_ID_REQUIRED" });
  }

  const message = await db.outreachMessage.findUnique({
    where: { id: body.messageId },
    include: { lead: true }
  });

  if (!message) {
    return reply.code(404).send({ error: "MESSAGE_NOT_FOUND" });
  }

  if (!["QUEUED", "SENT"].includes(message.status)) {
    return reply.code(409).send({
      error: "MESSAGE_NOT_READY_TO_MARK_SENT",
      status: message.status
    });
  }

  const sentAt = body.sentAt ? new Date(body.sentAt) : new Date();
  if (Number.isNaN(sentAt.getTime())) {
    return reply.code(400).send({ error: "INVALID_SENT_AT" });
  }

  await db.$transaction(async tx => {
    await tx.outreachMessage.update({
      where: { id: message.id },
      data: {
        status: "SENT",
        providerId: body.providerId,
        sentAt,
        error: null
      }
    });

    await tx.lead.update({
      where: { id: message.leadId },
      data: {
        status: message.lead.status === "QUALIFIED" ? "CONTACTED" : message.lead.status,
        firstContactAt: message.lead.firstContactAt || sentAt,
        lastContactAt: sentAt
      }
    });

    await tx.activity.create({
      data: {
        leadId: message.leadId,
        type: "OUTREACH_SENT",
        payload: {
          messageId: message.id,
          channel: message.channel,
          providerId: body.providerId || null,
          sentAt: sentAt.toISOString()
        }
      }
    });
  });

  const followup = await scheduleNextFollowup(message.leadId);

  return reply.send({
    messageId: message.id,
    status: "SENT",
    sentAt,
    followup
  });
});

app.get("/v1/followups/due", async (request, reply) => {
  const query = request.query as { limit?: string };
  const limit = Number(query.limit || 100);
  const rows = await getDueFollowups(limit);
  return reply.send({ count: rows.length, rows });
});

app.post("/v1/replies/handle", async (request, reply) => {
  const body = request.body as {
    leadId?: string;
    messageId?: string;
    text?: string;
    channel?: "EMAIL" | "WHATSAPP" | "TELEGRAM" | "LINKEDIN" | "OTHER";
    senderIdentity?: string;
  };

  if (!body.leadId || !body.text?.trim() || !body.channel) {
    return reply.code(400).send({
      error: "LEAD_ID_TEXT_AND_CHANNEL_REQUIRED"
    });
  }

  const result = await handleReply({
    leadId: body.leadId,
    messageId: body.messageId,
    text: body.text,
    channel: body.channel,
    senderIdentity: body.senderIdentity
  });

  return reply.send(result);
});

app.post("/v1/replies/classify", async (request, reply) => {
  const body = request.body as { text?: string };
  if (!body.text?.trim()) {
    return reply.code(400).send({ error: "TEXT_REQUIRED" });
  }

  return reply.send(classifyReply(body.text));
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  const message = error instanceof Error ? error.message : "Unknown error";
  reply.code(500).send({
    error: "INTERNAL_ERROR",
    message
  });
});

app.listen({ port: env.PORT, host: "0.0.0.0" })
  .then(async () => {
    app.log.info({ hasBootstrapCollection: Boolean(env.BOOTSTRAP_COLLECTION_JSON), hasBootstrapRaw: Boolean(env.BOOTSTRAP_RAW_LEADS_JSON) }, "bootstrap env status");

    if (env.MIGRATE_TO_NEON === "true" && env.NEON_DATABASE_URL) {
      try {
        app.log.info("Neon migration started");
        const migration = await migrateToNeon(env.NEON_DATABASE_URL);
        app.log.info(migration, "Neon migration completed");
      } catch (error) {
        app.log.error(
          error instanceof Error ? error : new Error("Neon migration failed"),
          "Neon migration failed"
        );
      }
    }

    if (env.LOG_LEADS_COUNTRY) {
      try {
        const rows = await db.lead.findMany({
          where: {
            company: {
              country: {
                equals: env.LOG_LEADS_COUNTRY,
                mode: "insensitive"
              }
            }
          },
          include: {
            company: true,
            contact: true
          },
          orderBy: [
            { score: "desc" },
            { updatedAt: "desc" }
          ],
          take: 100
        });

        app.log.info({
          country: env.LOG_LEADS_COUNTRY,
          count: rows.length,
          rows: rows.map(row => ({
            leadId: row.id,
            companyName: row.company.name,
            website: row.company.website,
            domain: row.company.domain,
            score: row.score,
            grade: row.grade,
            status: row.status,
            contact: row.contact ? {
              email: row.contact.email,
              phone: row.contact.phone,
              whatsapp: row.contact.whatsapp,
              telegram: row.contact.telegram,
              linkedin: row.contact.linkedin,
              fullName: row.contact.fullName,
              position: row.contact.position
            } : null
          }))
        }, "crm lead snapshot");
      } catch (error) {
        app.log.error(
          error instanceof Error ? error : new Error("crm snapshot failed"),
          "crm snapshot failed"
        );
      }
    }

    if (env.BOOTSTRAP_COLLECTION_JSON) {
      try {
        const parsed = JSON.parse(env.BOOTSTRAP_COLLECTION_JSON) as {
          disabled?: boolean;
          provider?: "tavily" | "serper" | "serpapi";
          country?: string;
          industry?: string;
          businessType?: string;
          keywords?: string[];
          limit?: number;
        };

        if (!parsed.disabled && parsed.provider && parsed.country && parsed.industry) {
          app.log.info({ input: parsed }, "bootstrap collection started");

          const result = await collectEnrichAndIngest(
            {
              TAVILY_API_KEY: env.TAVILY_API_KEY,
              SERPER_API_KEY: env.SERPER_API_KEY,
      SERPAPI_API_KEY: env.SERPAPI_API_KEY
            },
            {
              provider: parsed.provider,
              country: parsed.country,
              industry: parsed.industry,
              businessType: parsed.businessType,
              keywords: parsed.keywords,
              limit: parsed.limit
            }
          );

          app.log.info(
            {
              provider: result.provider,
              collected: result.collected,
              unique: result.unique,
              enriched: result.enriched,
              failedEnrichment: result.failedEnrichment,
              ingestion: result.ingestion
            },
            "bootstrap collection completed"
          );
        }
      } catch (error) {
        app.log.error(
          error instanceof Error ? error : new Error("bootstrap collection failed"),
          "bootstrap collection failed"
        );
      }
    }

    if (env.BOOTSTRAP_RAW_LEADS_JSON) {
      try {
        const rows = JSON.parse(env.BOOTSTRAP_RAW_LEADS_JSON) as Array<{
          companyName: string;
          website?: string;
          country?: string;
          city?: string;
          industry?: string;
          businessType?: string;
          source?: string;
          sourceUrl?: string;
        }>;

        const enrichedRows = [];
        for (const row of rows) {
          const enriched = await enrichFromWebsite(row);
          enrichedRows.push(enriched.lead);
        }

        const ingestion = await ingestLeadBatch(enrichedRows);
        app.log.info({ ingestion }, "bootstrap raw leads completed");
      } catch (error) {
        app.log.error(
          error instanceof Error ? error : new Error("bootstrap raw leads failed"),
          "bootstrap raw leads failed"
        );
      }
    }
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
