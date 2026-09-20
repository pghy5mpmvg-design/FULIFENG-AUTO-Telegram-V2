import Fastify from "fastify";
import { env } from "./config.js";
import { scoreLead } from "./services/scoring.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  ok: true,
  service: "ai-overseas-sales-engine-v1",
  version: "0.1.0"
}));

app.post("/v1/score-preview", async (request, reply) => {
  const body = request.body as Record<string, unknown>;
  const result = scoreLead(body);
  return reply.send(result);
});

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
