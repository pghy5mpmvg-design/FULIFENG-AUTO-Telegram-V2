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

const app = Fastify({ logger: true });
const enrichment = new BasicEnrichmentProvider();

app.get("/health", async () => ({
  ok: true,
  service: "ai-overseas-sales-engine-v1",
  version: "0.3.0"
}));

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

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
