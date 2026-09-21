import type { RawLead } from "../types/lead.js";

export type SearchProviderName = "tavily" | "serper" | "serpapi";

export type SearchCollectorInput = {
  provider: SearchProviderName;
  country: string;
  industry: string;
  businessType?: string;
  keywords?: string[];
  limit?: number;
};

type SearchResult = {
  title?: string;
  url?: string;
  content?: string;
  snippet?: string;
};

function hostname(url?: string) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

const EXCLUDED_DOMAINS = [
  "vk.com",
  "2gis.ru",
  "2gis.com",
  "avito.ru",
  "auto.ru",
  "drom.ru",
  "yandex.ru",
  "google.com",
  "wikipedia.org",
  "youtube.com",
  "instagram.com",
  "facebook.com",
  "t.me",
  "telegram.me"
];

function isExcludedDomain(domain?: string) {
  if (!domain) return true;
  return EXCLUDED_DOMAINS.some(x => domain === x || domain.endsWith(`.${x}`));
}

function companyNameFromResult(result: SearchResult) {
  const titleName = result.title?.split(/[|–—]/)[0]?.trim();
  if (titleName && titleName.length >= 2 && titleName.length <= 80) {
    return titleName;
  }

  const host = hostname(result.url);
  if (host) {
    const root = host.split(".")[0] || host;
    return root
      .split(/[-_]/g)
      .filter(Boolean)
      .map(x => x.charAt(0).toUpperCase() + x.slice(1))
      .join(" ");
  }

  return "Unknown Company";
}

function toRawLead(
  result: SearchResult,
  input: SearchCollectorInput,
  source: string
): RawLead | null {
  if (!result.url) return null;

  const domain = hostname(result.url);
  if (!domain || isExcludedDomain(domain)) return null;

  return {
    companyName: companyNameFromResult(result),
    website: result.url,
    domain,
    country: input.country,
    industry: input.industry,
    businessType: input.businessType,
    source,
    sourceUrl: result.url
  };
}

function buildQuery(input: SearchCollectorInput) {
  const terms = [
    input.industry,
    input.businessType,
    "importer distributor dealer wholesaler",
    input.country,
    ...(input.keywords || [])
  ].filter(Boolean);

  return terms.join(" ");
}

export async function collectWithTavily(
  apiKey: string,
  input: SearchCollectorInput
): Promise<RawLead[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      api_key: apiKey,
      query: buildQuery(input),
      search_depth: "basic",
      max_results: limit,
      include_answer: false,
      include_images: false
    })
  });

  if (!res.ok) {
    throw new Error(`TAVILY_SEARCH_FAILED_${res.status}`);
  }

  const data = await res.json() as { results?: SearchResult[] };
  return (data.results || [])
    .map(r => toRawLead(r, input, "tavily"))
    .filter((x): x is RawLead => Boolean(x));
}

export async function collectWithSerper(
  apiKey: string,
  input: SearchCollectorInput
): Promise<RawLead[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey
    },
    body: JSON.stringify({
      q: buildQuery(input),
      num: limit
    })
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    throw new Error(`SERPER_SEARCH_FAILED_${res.status}: ${detail}`);
  }

  const data = await res.json() as {
    organic?: Array<{ title?: string; link?: string; snippet?: string }>;
  };

  return (data.organic || [])
    .map(r =>
      toRawLead(
        {
          title: r.title,
          url: r.link,
          snippet: r.snippet
        },
        input,
        "serper"
      )
    )
    .filter((x): x is RawLead => Boolean(x));
}

export async function collectSearchLeads(
  env: {
    TAVILY_API_KEY?: string;
    SERPER_API_KEY?: string;
    SERPAPI_API_KEY?: string;
  },
  input: SearchCollectorInput
) {
  if (input.provider === "tavily") {
    if (!env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY_MISSING");
    return collectWithTavily(env.TAVILY_API_KEY, input);
  }

  if (input.provider === "serper") {
    if (!env.SERPER_API_KEY) throw new Error("SERPER_API_KEY_MISSING");
    return collectWithSerper(env.SERPER_API_KEY, input);
  }

  if (input.provider === "serpapi") {
    if (!env.SERPAPI_API_KEY) throw new Error("SERPAPI_API_KEY_MISSING");
    return collectWithSerpApi(env.SERPAPI_API_KEY, input);
  }

  throw new Error("UNSUPPORTED_SEARCH_PROVIDER");
}


export async function collectWithSerpApi(
  apiKey: string,
  input: SearchCollectorInput
): Promise<RawLead[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
  const params = new URLSearchParams({
    engine: "google",
    q: buildQuery(input),
    api_key: apiKey,
    num: String(limit),
    gl: input.country.toLowerCase() === "russia" ? "ru" : "us",
    hl: input.country.toLowerCase() === "russia" ? "ru" : "en"
  });

  const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`);

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    throw new Error(`SERPAPI_SEARCH_FAILED_${res.status}: ${detail}`);
  }

  const data = await res.json() as {
    organic_results?: Array<{ title?: string; link?: string; snippet?: string }>;
  };

  return (data.organic_results || [])
    .map(r =>
      toRawLead(
        {
          title: r.title,
          url: r.link,
          snippet: r.snippet
        },
        input,
        "serpapi"
      )
    )
    .filter((x): x is RawLead => Boolean(x));
}
