import { db } from "../db.js";

const DAY = 24 * 60 * 60 * 1000;
const FOLLOWUP_DAYS = [3, 7, 14, 30];

export function nextFollowupDate(firstContactAt: Date, completedFollowups: number) {
  const day = FOLLOWUP_DAYS[Math.min(completedFollowups, FOLLOWUP_DAYS.length - 1)];
  return new Date(firstContactAt.getTime() + day * DAY);
}

export async function scheduleNextFollowup(leadId: string) {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: { messages: true }
  });

  if (!lead) throw new Error("LEAD_NOT_FOUND");
  if (["WON", "LOST", "DO_NOT_CONTACT"].includes(lead.status)) {
    return { scheduled: false, reason: "LEAD_CLOSED" };
  }

  const firstContactAt = lead.firstContactAt || lead.messages.find(m => m.sentAt)?.sentAt;
  if (!firstContactAt) {
    return { scheduled: false, reason: "NO_FIRST_CONTACT" };
  }

  const sentFollowups = lead.messages.filter(m =>
    m.status === "SENT" && m.createdAt.getTime() > firstContactAt.getTime()
  ).length;

  const next = nextFollowupDate(firstContactAt, sentFollowups);

  await db.lead.update({
    where: { id: leadId },
    data: { nextFollowupAt: next }
  });

  return { scheduled: true, nextFollowupAt: next };
}

export async function getDueFollowups(limit = 100) {
  return db.lead.findMany({
    where: {
      nextFollowupAt: { lte: new Date() },
      status: { notIn: ["WON", "LOST", "DO_NOT_CONTACT"] }
    },
    include: {
      company: true,
      contact: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 3
      }
    },
    orderBy: { nextFollowupAt: "asc" },
    take: Math.max(1, Math.min(limit, 500))
  });
}
