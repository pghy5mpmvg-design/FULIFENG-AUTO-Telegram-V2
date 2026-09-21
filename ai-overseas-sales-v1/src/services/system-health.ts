import { db } from "../db.js";

export async function databaseHealth() {
  const [companies, contacts, leads, messages] = await Promise.all([
    db.company.count(),
    db.contact.count(),
    db.lead.count(),
    db.outreachMessage.count()
  ]);

  return {
    database: "ok",
    counts: {
      companies,
      contacts,
      leads,
      messages
    }
  };
}
