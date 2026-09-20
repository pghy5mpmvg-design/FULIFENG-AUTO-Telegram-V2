export type RawLead = {
  companyName: string;
  website?: string;
  domain?: string;
  country?: string;
  city?: string;
  industry?: string;
  businessType?: string;
  source?: string;
  sourceUrl?: string;
  contact?: {
    fullName?: string;
    position?: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    telegram?: string;
    linkedin?: string;
    language?: string;
  };
};

export type EnrichedLead = RawLead & {
  companySize?: string;
  products?: string[];
  marketActivity?: number;
  enrichmentNotes?: string[];
};
