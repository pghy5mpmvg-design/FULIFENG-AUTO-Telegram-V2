import { PrismaClient } from "@prisma/client";
import { db } from "../db.js";

export async function migrateToNeon(targetUrl: string) {
  const target = new PrismaClient({
    datasources: {
      db: { url: targetUrl }
    }
  });

  try {
    const [
      companies,
      contacts,
      leads,
      campaigns,
      messages,
      blacklists,
      activities
    ] = await Promise.all([
      db.company.findMany(),
      db.contact.findMany(),
      db.lead.findMany(),
      db.campaign.findMany(),
      db.outreachMessage.findMany(),
      db.blacklist.findMany(),
      db.activity.findMany()
    ]);

    await target.company.createMany({
      data: companies,
      skipDuplicates: true
    });

    await target.contact.createMany({
      data: contacts,
      skipDuplicates: true
    });

    await target.campaign.createMany({
      data: campaigns,
      skipDuplicates: true
    });

    await target.lead.createMany({
      data: leads,
      skipDuplicates: true
    });

    await target.outreachMessage.createMany({
      data: messages,
      skipDuplicates: true
    });

    await target.blacklist.createMany({
      data: blacklists,
      skipDuplicates: true
    });

    await target.activity.createMany({
      data: activities.map(row => ({
        ...row,
        payload: row.payload ?? undefined
      })),
      skipDuplicates: true
    });

    const sourceCounts = {
      companies: companies.length,
      contacts: contacts.length,
      leads: leads.length,
      campaigns: campaigns.length,
      messages: messages.length,
      blacklists: blacklists.length,
      activities: activities.length
    };

    const targetCounts = {
      companies: await target.company.count(),
      contacts: await target.contact.count(),
      leads: await target.lead.count(),
      campaigns: await target.campaign.count(),
      messages: await target.outreachMessage.count(),
      blacklists: await target.blacklist.count(),
      activities: await target.activity.count()
    };

    const verified = Object.entries(sourceCounts).every(
      ([key, value]) => targetCounts[key as keyof typeof targetCounts] === value
    );

    return { sourceCounts, targetCounts, verified };
  } finally {
    await target.$disconnect();
  }
}
