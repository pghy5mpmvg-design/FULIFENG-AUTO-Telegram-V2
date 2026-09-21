import { z } from "zod";

export const RawLeadSchema = z.object({
  companyName: z.string().min(2),
  website: z.string().optional(),
  domain: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  industry: z.string().optional(),
  businessType: z.string().optional(),
  source: z.string().optional(),
  sourceUrl: z.string().optional(),
  contact: z.object({
    fullName: z.string().optional(),
    position: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    whatsapp: z.string().optional(),
    telegram: z.string().optional(),
    linkedin: z.string().optional(),
    language: z.string().optional()
  }).optional()
});
