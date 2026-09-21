import { BasicEnrichmentProvider } from "./enrichment.js";
import { ingestLead } from "./lead-ingestion.js";
import type { RawLead } from "../types/lead.js";

const enrichment = new BasicEnrichmentProvider();

export async function ingestLeadBatch(rows: RawLead[]) {
  const results: Array<{
    ok: boolean;
    companyName: string;
    leadId?: string;
    score?: number;
    grade?: string;
    error?: string;
  }> = [];

  for (const row of rows) {
    try {
      const enriched = await enrichment.enrich(row);
      const saved = await ingestLead(enriched);
      results.push({
        ok: true,
        companyName: row.companyName,
        leadId: saved.lead.id,
        score: saved.score.score,
        grade: saved.score.grade
      });
    } catch (error) {
      results.push({
        ok: false,
        companyName: row.companyName,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  return {
    total: rows.length,
    success: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results
  };
}
