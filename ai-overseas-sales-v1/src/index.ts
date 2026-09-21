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
import { getDueFollowups } from "./services/followup.js";
import { ingestLeadBatch } from "./services/bulk-ingestion.js";
import { databaseHealth } from "./services/system-health.js";
import { previewCollection, collectAndIngest } from "./services/collector-pipeline.js";
import { collectEnrichAndIngest } from "./services/enriched-collector.js";
import { enrichFromWebsite } from "./services/site-enrichment.js";

const app = Fastify({ logger: true });
const enrichment = new BasicEnrichmentProvider();

app.get("/health", async () => ({
  ok: true,
  service: "ai-overseas-sales-engine-v1",
  version: "0.4.0"
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
    provider?: "tavily" | "serper";
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
      SERPER_API_KEY: env.SERPER_API_KEY
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
    provider?: "tavily" | "serper";
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
      SERPER_API_KEY: env.SERPER_API_KEY
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
    provider?: "tavily" | "serper";
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
      SERPER_API_KEY: env.SERPER_API_KEY
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
    if (env.BOOTSTRAP_COLLECTION_JSON) {
      try {
        const parsed = JSON.parse(env.BOOTSTRAP_COLLECTION_JSON) as {
          disabled?: boolean;
          provider?: "tavily" | "serper";
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
              SERPER_API_KEY: env.SERPER_API_KEY
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
