import { previewCollection } from "./collector-pipeline.js";
import { enrichFromWebsite } from "./site-enrichment.js";
import { ingestLeadBatch } from "./bulk-ingestion.js";
import type { SearchCollectorInput } from "./search-providers.js";

export async function collectEnrichAndIngest(
  env: { TAVILY_API_KEY?: string; SERPER_API_KEY?: string; SERPAPI_API_KEY?: string },
  input: SearchCollectorInput
) {
  const preview = await previewCollection(env, input);

  const concurrency = 3;
  const enrichedRows: Array<Awaited<ReturnType<typeof enrichFromWebsite>>> = [];

  for (let i = 0; i < preview.leads.length; i += concurrency) {
    const chunk = preview.leads.slice(i, i + concurrency);

    const settled = await Promise.allSettled(
      chunk.map(async (lead) => {
        const enriched = await enrichFromWebsite(lead);
        return enriched;
      })
    );

    for (let j = 0; j < settled.length; j++) {
      const result = settled[j];
      const fallbackLead = chunk[j];

      if (result.status === "fulfilled") {
        enrichedRows.push(result.value);
      } else {
        enrichedRows.push({
          lead: fallbackLead,
          enrichment: {
            ok: false,
            reason: result.reason instanceof Error ? result.reason.message : "ENRICHMENT_FAILED"
          }
        });
      }
    }
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
