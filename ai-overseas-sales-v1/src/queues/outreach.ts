export type OutreachJob = {
  messageId: string;
  leadId: string;
  channel: "EMAIL" | "WHATSAPP" | "TELEGRAM" | "LINKEDIN" | "OTHER";
};

/**
 * V1 lightweight queue adapter.
 * Jobs are persisted in PostgreSQL through OutreachMessage(status=QUEUED).
 * This function returns the calculated delay for auditability.
 * A dedicated worker can be added later without changing the public API.
 */
export async function enqueueOutreach(job: OutreachJob, delayMs = 0) {
  return {
    id: job.messageId,
    name: "send",
    data: job,
    delay: Math.max(0, delayMs)
  };
}
