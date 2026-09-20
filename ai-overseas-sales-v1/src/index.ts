import Fastify from "fastify";
import { env } from "./config.js";
import { scoreLead } from "./services/scoring.js";
import { RawLeadSchema } from "./schemas/lead.js";
import { BasicEnrichmentProvider } from "./services/enrichment.js";
import { ingestLead } from "./services/lead-ingestion.js";
import { generateFirstTouch } from "./services/message-generator.js";

const app = Fastify({ logger: true });
const enrichment = new BasicEnrichmentProvider();

app.get("/health", async () => ({
  ok: true,
  service: "ai-overseas-sales-engine-v1",
  version: "0.2.0"
}));

app.post("/v1/score-preview", async (request, reply) => {
  const body = request.body as Record<string, unknown>;
  const result = scoreLead(body);
  return reply.send(result);
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

  return reply.send({
    enriched,
    message
  });
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
  const message = generateFirstTouch({
    lead: enriched,
    offer: saved.lead.recommendedOffer || undefined
  });

  return reply.code(201).send({
    saved,
    generatedFirstTouch: message
  });
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.code(500).send({
    error: "INTERNAL_ERROR",
    message: error.message
  });
});

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
