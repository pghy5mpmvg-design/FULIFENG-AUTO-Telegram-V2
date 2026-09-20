import type { EnrichedLead, RawLead } from "../types/lead.js";

export interface LeadEnrichmentProvider {
  enrich(input: RawLead): Promise<EnrichedLead>;
}

export class BasicEnrichmentProvider implements LeadEnrichmentProvider {
  async enrich(input: RawLead): Promise<EnrichedLead> {
    const notes: string[] = [];

    const language =
      input.contact?.language ||
      inferLanguageFromCountry(input.country);

    if (!input.contact?.language && language) {
      notes.push(`language inferred from country: ${language}`);
    }

    return {
      ...input,
      contact: input.contact
        ? {
            ...input.contact,
            language
          }
        : undefined,
      enrichmentNotes: notes
    };
  }
}

function inferLanguageFromCountry(country?: string) {
  const value = country?.trim().toLowerCase();
  if (!value) return "en";

  if (["russia", "russian federation", "belarus", "kazakhstan"].includes(value)) return "ru";
  if (["spain", "mexico", "argentina", "chile", "peru", "colombia"].includes(value)) return "es";
  if (["france", "belgium", "senegal", "côte d'ivoire", "ivory coast"].includes(value)) return "fr";
  if (["saudi arabia", "united arab emirates", "uae", "qatar", "kuwait", "oman"].includes(value)) return "ar";
  return "en";
}
