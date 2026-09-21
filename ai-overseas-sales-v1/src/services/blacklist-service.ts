import { db } from "../db.js";

export async function addToBlacklist(params: {
  channel: "EMAIL" | "WHATSAPP" | "TELEGRAM" | "LINKEDIN" | "OTHER";
  value: string;
  reason?: string;
}) {
  return db.blacklist.upsert({
    where: {
      channel_value: {
        channel: params.channel,
        value: params.value
      }
    },
    create: params,
    update: {
      reason: params.reason
    }
  });
}
