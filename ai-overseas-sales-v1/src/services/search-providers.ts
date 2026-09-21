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

const GENERIC_TITLE_RE = /(forum|форум|новост|стать|поиск|тег|каталог|купить авто|автомобили с пробегом|подержанные автомобили|used cars)/i;

function brandFromDomain(domain?: string) {
  if (!domain) return "Unknown Company";
  const root = domain.split(".")[0] || domain;
  return root
    .split(/[-_]/g)
    .filter(Boolean)
    .map(x => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");
}

function companyNameFromResult(result: SearchResult) {
  const domain = hostname(result.url);
  const titleName = result.title?.split(/[|–—]/)[0]?.trim();

  if (
    titleName &&
    titleName.length >= 2 &&
    titleName.length <= 60 &&
    !GENERIC_TITLE_RE.test(titleName)
  ) {
    return titleName;
  }

  return brandFromDomain(domain);
}

function toRawLead(
  result: SearchResult,
  input: SearchCollectorInput,
  source: string
): RawLead | null {
  if (!result.url) return null;

  const domain = hostname(result.url);
  if (!domain || isExcludedDomain(domain)) return null;

  const text = `${result.title || ""} ${result.snippet || result.content || ""}`;
  if (/(forum|форум|новост|стать|поиск по тегам|блог|обзор|википед)/i.test(text)) {
    return null;
  }

  let website = result.url;
  try {
    website = new URL(result.url).origin + "/";
  } catch {}

  return {
    companyName: companyNameFromResult(result),
    website,
    domain,
    country: input.country,
    industry: input.industry,
    businessType: input.businessType,
    source,
    sourceUrl: result.url
  };
}

function buildQuery(input: SearchCollectorInput) {
  const keywordBlock = (input.keywords || [])
    .filter(Boolean)
    .map(k => `"${k}"`)
    .join(" OR ");

  const market = [input.country, input.industry].filter(Boolean).join(" ");

  if (keywordBlock) {
    return `${market} (${keywordBlock})`;
  }

  return [
    input.country,
    input.industry,
    input.businessType,
    "importer dealer distributor wholesaler"
  ].filter(Boolean).join(" ");
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
  const baseKeywords = (input.keywords || []).filter(Boolean);

  const queries = baseKeywords.length
    ? baseKeywords.slice(0, Math.min(6, Math.ceil(limit / 5))).map(k =>
        `${input.country} ${input.industry} "${k}"`
      )
    : [buildQuery(input)];

  const queryTasks = queries.map(async (q) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);

    try {
      const params = new URLSearchParams({
        engine: "google",
        q,
        api_key: apiKey,
        num: String(Math.min(10, limit)),
        gl: input.country.toLowerCase() === "russia" ? "ru" : "us",
        hl: input.country.toLowerCase() === "russia" ? "ru" : "en"
      });

      const res = await fetch(
        `https://serpapi.com/search.json?${params.toString()}`,
        { signal: controller.signal }
      );

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
            { title: r.title, url: r.link, snippet: r.snippet },
            input,
            "serpapi"
          )
        )
        .filter((x): x is RawLead => Boolean(x));
    } finally {
      clearTimeout(timer);
    }
  });

  const settled = await Promise.allSettled(queryTasks);
  const collected: RawLead[] = [];

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;

    for (const lead of result.value) {
      if (!collected.some(x => x.domain === lead.domain)) {
        collected.push(lead);
      }
      if (collected.length >= limit) break;
    }

    if (collected.length >= limit) break;
  }

  return collected.slice(0, limit);
}
