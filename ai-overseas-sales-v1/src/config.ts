import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  TAVILY_API_KEY: z.string().optional(),
  SERPER_API_KEY: z.string().optional(),
  SERPAPI_API_KEY: z.string().optional(),
  BOOTSTRAP_COLLECTION_JSON: z.string().optional(),
  BOOTSTRAP_RAW_LEADS_JSON: z.string().optional(),
  LOG_LEADS_COUNTRY: z.string().optional(),
  OUTREACH_DAILY_LIMIT: z.coerce.number().int().positive().default(40),
  OUTREACH_MIN_DELAY_SECONDS: z.coerce.number().int().nonnegative().default(90),
  OUTREACH_MAX_DELAY_SECONDS: z.coerce.number().int().positive().default(240)
});

export const env = EnvSchema.parse(process.env);
