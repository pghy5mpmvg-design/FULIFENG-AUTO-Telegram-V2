import { db } from "../db.js";
import { buildDedupeKeys } from "./dedupe.js";
import { scoreLead } from "./scoring.js";
import type { EnrichedLead } from "../types/lead.js";

function domainFromWebsite(website?: string) {
  if (!website) return undefined;
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function estimateScore(lead: EnrichedLead) {
  const contact = lead.contact;
  const hasDecisionRole = /owner|founder|director|purchas|procurement|buyer|general manager|ceo/i.test(contact?.position || "");

  return scoreLead({
    companyMatch: lead.industry || lead.businessType ? 24 : 14,
    buyingPotential: /import|distributor|dealer|wholesale|trading/i.test(lead.businessType || "") ? 22 : 12,
    contactQuality: hasDecisionRole ? 18 : contact?.fullName ? 12 : 5,
    contactability:
      (contact?.email ? 6 : 0) +
      (contact?.phone || contact?.whatsapp ? 5 : 0) +
      (contact?.linkedin || contact?.telegram ? 4 : 0),
    marketActivity: Math.max(0, Math.min(10, Number(lead.marketActivity ?? 5)))
  });
}

export async function ingestLead(lead: EnrichedLead) {
  const inferredDomain = lead.domain || domainFromWebsite(lead.website);
  const keys = buildDedupeKeys({
    domain: inferredDomain,
    email: lead.contact?.email,
    phone: lead.contact?.phone || lead.contact?.whatsapp,
    companyName: lead.companyName
  });

  let company = inferredDomain
    ? await db.company.findUnique({ where: { domain: inferredDomain.toLowerCase() } })
    : null;

  if (!company) {
    company = await db.company.create({
      data: {
        name: lead.companyName,
        domain: inferredDomain?.toLowerCase(),
        website: lead.website,
        country: lead.country,
        city: lead.city,
        industry: lead.industry,
        businessType: lead.businessType,
        companySize: lead.companySize,
        source: lead.source,
        sourceUrl: lead.sourceUrl
      }
    });
  }

  let contact = null;
  if (lead.contact) {
    if (lead.contact.email) {
      contact = await db.contact.findUnique({
        where: { email: lead.contact.email.toLowerCase() }
      });
    }

    if (!contact) {
      contact = await db.contact.create({
        data: {
          companyId: company.id,
          fullName: lead.contact.fullName,
          position: lead.contact.position,
          email: lead.contact.email?.toLowerCase(),
          phone: lead.contact.phone,
          whatsapp: lead.contact.whatsapp,
          telegram: lead.contact.telegram,
          linkedin: lead.contact.linkedin,
          language: lead.contact.language
        }
      });
    }
  }

  const scored = estimateScore(lead);

  const salesLead = await db.lead.create({
    data: {
      companyId: company.id,
      contactId: contact?.id,
      score: scored.score,
      grade: scored.grade,
      status: scored.score >= 60 ? "QUALIFIED" : "NEW",
      reason: JSON.stringify({
        scoreBreakdown: scored.breakdown,
        dedupeKeys: keys,
        enrichmentNotes: lead.enrichmentNotes || []
      })
    }
  });

  return { company, contact, lead: salesLead, score: scored };
}
