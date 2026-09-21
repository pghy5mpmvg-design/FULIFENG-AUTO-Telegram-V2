import { previewCollection } from "./collector-pipeline.js";
import { enrichFromWebsite } from "./site-enrichment.js";
import { ingestLeadBatch } from "./bulk-ingestion.js";
import type { SearchCollectorInput } from "./search-providers.js";

export async function collectEnrichAndIngest(
  env: { TAVILY_API_KEY?: string; SERPER_API_KEY?: string },
  input: SearchCollectorInput
) {
  const preview = await previewCollection(env, input);
  const enrichedRows = [];

  for (const lead of preview.leads) {
    const enriched = await enrichFromWebsite(lead);
    enrichedRows.push(enriched);
  }

  const normalized = enrichedRows.map(x => x.lead);
  const ingestion = await ingestLeadBatch(normalized);

  return {
    provider: input.provider,
    collected: preview.collected,
    unique: preview.unique,
    enriched: enrichedRows.filter(x => x.enrichment.ok).length,
    failedEnrichment: enrichedRows.filter(x => !x.enrichment.ok).length,
    ingestion,
    enrichmentDetails: enrichedRows.map(x => ({
      companyName: x.lead.companyName,
      website: x.lead.website,
      enrichment: x.enrichment
    }))
  };
}
