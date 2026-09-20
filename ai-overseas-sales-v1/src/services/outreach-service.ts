import { db } from "../db.js";
import { canSend, nextDelayMs } from "../policies/outreach-policy.js";
import { enqueueOutreach } from "../queues/outreach.js";
import { generateFirstTouch } from "./message-generator.js";
import type { EnrichedLead } from "../types/lead.js";

export async function prepareFirstTouch(params: {
  leadId: string;
  enrichedLead: EnrichedLead;
  channel?: "EMAIL" | "WHATSAPP" | "TELEGRAM" | "LINKEDIN" | "OTHER";
  campaignId?: string;
  offer?: string;
}) {
  const channel = params.channel ?? "EMAIL";
  const salesLead = await db.lead.findUnique({
    where: { id: params.leadId },
    include: { contact: true }
  });

  if (!salesLead) {
    throw new Error("LEAD_NOT_FOUND");
  }

  if (!["A", "B"].includes(salesLead.grade)) {
    return { queued: false, reason: "LEAD_GRADE_NOT_ELIGIBLE" };
  }

  const identity =
    channel === "EMAIL"
      ? salesLead.contact?.email
      : channel === "WHATSAPP"
        ? salesLead.contact?.whatsapp || salesLead.contact?.phone
        : channel === "TELEGRAM"
          ? salesLead.contact?.telegram
          : channel === "LINKEDIN"
            ? salesLead.contact?.linkedin
            : null;

  if (!identity) {
    return { queued: false, reason: "NO_CHANNEL_IDENTITY" };
  }

  const blacklisted = await db.blacklist.findUnique({
    where: {
      channel_value: {
        channel,
        value: identity
      }
    }
  });

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const sentToday = await db.outreachMessage.count({
    where: {
      channel,
      sentAt: { gte: start }
    }
  });

  const policy = canSend({
    sentToday,
    isBlacklisted: Boolean(blacklisted)
  });

  if (!policy.allowed) {
    return { queued: false, reason: policy.reason };
  }

  const generated = generateFirstTouch({
    lead: params.enrichedLead,
    offer: params.offer
  });

  const message = await db.outreachMessage.create({
    data: {
      leadId: params.leadId,
      campaignId: params.campaignId,
      channel,
      subject: generated.subject,
      body: generated.body,
      status: "QUEUED"
    }
  });

  const delayMs = nextDelayMs();

  await enqueueOutreach(
    {
      messageId: message.id,
      leadId: params.leadId,
      channel
    },
    delayMs
  );

  return {
    queued: true,
    messageId: message.id,
    delayMs,
    channel
  };
}
