import { collectSearchLeads, type SearchCollectorInput } from "./search-providers.js";
import { ingestLeadBatch } from "./bulk-ingestion.js";
import { hasStrongDuplicateSignal } from "./dedupe.js";
import type { RawLead } from "../types/lead.js";

function uniqueLeads(rows: RawLead[]) {
  const output: RawLead[] = [];

  for (const row of rows) {
    const duplicate = output.some(existing =>
      hasStrongDuplicateSignal(
        {
          domain: existing.domain,
          email: existing.contact?.email,
          phone: existing.contact?.phone || existing.contact?.whatsapp,
          companyName: existing.companyName
        },
        {
          domain: row.domain,
          email: row.contact?.email,
          phone: row.contact?.phone || row.contact?.whatsapp,
          companyName: row.companyName
        }
      )
    );

    if (!duplicate) output.push(row);
  }

  return output;
}

export async function previewCollection(
  env: { TAVILY_API_KEY?: string; SERPER_API_KEY?: string; SERPAPI_API_KEY?: string },
  input: SearchCollectorInput
) {
  const collected = await collectSearchLeads(env, input);
  const unique = uniqueLeads(collected);

  return {
    provider: input.provider,
    query: input,
    collected: collected.length,
    unique: unique.length,
    leads: unique
  };
}

export async function collectAndIngest(
  env: { TAVILY_API_KEY?: string; SERPER_API_KEY?: string; SERPAPI_API_KEY?: string },
  input: SearchCollectorInput
) {
  const preview = await previewCollection(env, input);
  const ingestion = await ingestLeadBatch(preview.leads);

  return {
    ...preview,
    ingestion
  };
}
