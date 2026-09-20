import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config.js";

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

export const outreachQueue = new Queue("outreach", { connection });

export type OutreachJob = {
  messageId: string;
  leadId: string;
  channel: "EMAIL" | "WHATSAPP" | "TELEGRAM" | "LINKEDIN" | "OTHER";
};

export async function enqueueOutreach(job: OutreachJob, delayMs = 0) {
  return outreachQueue.add("send", job, {
    delay: Math.max(0, delayMs),
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: 1000,
    removeOnFail: 1000
  });
}
