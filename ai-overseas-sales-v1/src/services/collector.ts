import type { RawLead } from "../types/lead.js";

export type CollectorQuery = {
  country?: string;
  industry?: string;
  businessType?: string;
  keywords?: string[];
  limit?: number;
};

export interface LeadCollectorProvider {
  collect(query: CollectorQuery): Promise<RawLead[]>;
}

/**
 * V1 provider adapter for any external data/search API.
 * Implementations should return normalized RawLead objects only.
 */
export class ApiCollectorProvider implements LeadCollectorProvider {
  constructor(
    private readonly fetcher: (query: CollectorQuery) => Promise<RawLead[]>
  ) {}

  async collect(query: CollectorQuery): Promise<RawLead[]> {
    const rows = await this.fetcher(query);
    const limit = Math.max(1, Math.min(query.limit ?? 100, 500));
    return rows.slice(0, limit);
  }
}
