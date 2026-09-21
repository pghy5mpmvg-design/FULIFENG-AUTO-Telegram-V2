import { db } from "../db.js";
import { addToBlacklist } from "./blacklist-service.js";
import { classifyReply } from "./reply-classifier.js";

export async function handleReply(params: {
  leadId: string;
  messageId?: string;
  text: string;
  channel: "EMAIL" | "WHATSAPP" | "TELEGRAM" | "LINKEDIN" | "OTHER";
  senderIdentity?: string;
}) {
  const classified = classifyReply(params.text);
  const now = new Date();

  let status:
    | "REPLIED"
    | "INTERESTED"
    | "DO_NOT_CONTACT" = "REPLIED";

  if (classified.intent === "UNSUBSCRIBE" || classified.intent === "REJECT") {
    status = "DO_NOT_CONTACT";
  } else if (classified.humanHandoff) {
    status = "INTERESTED";
  }

  await db.lead.update({
    where: { id: params.leadId },
    data: {
      status,
      lastContactAt: now,
      nextFollowupAt: status === "DO_NOT_CONTACT" ? null : undefined
    }
  });

  if (params.messageId) {
    await db.outreachMessage.update({
      where: { id: params.messageId },
      data: { repliedAt: now }
    });
  }

  if (status === "DO_NOT_CONTACT" && params.senderIdentity) {
    await addToBlacklist({
      channel: params.channel,
      value: params.senderIdentity,
      reason: classified.intent
    });
  }

  await db.activity.create({
    data: {
      leadId: params.leadId,
      type: "REPLY_RECEIVED",
      payload: {
        text: params.text,
        classification: classified
      }
    }
  });

  return { ...classified, leadStatus: status };
}
