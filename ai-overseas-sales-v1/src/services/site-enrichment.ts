import type { RawLead } from "../types/lead.js";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TEL_HREF_RE = /href=["']tel:([^"'?#]+)["']/gi;
const PHONE_RE = /\+\d[\d\s().-]{8,}\d/g;
const TG_RE = /https?:\/\/(?:t\.me|telegram\.me)\/[A-Za-z0-9_+-]+/gi;
const LI_RE = /https?:\/\/(?:[a-z]+\.)?linkedin\.com\/[^"'\s<>]+/gi;
const WA_RE = /https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^"'\s<>]+/gi;

function safeHttpUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function validEmail(value: string) {
  const lower = value.toLowerCase();
  if (/@(?:2x|3x)\./i.test(lower)) return false;
  if (/\.(?:png|jpg|jpeg|gif|svg|webp)$/i.test(lower)) return false;
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value);
}

function normalizePhone(value: string) {
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;

  if (/^(19|20)\d{6,}$/.test(digits)) return null;

  return raw;
}

function extractTelHrefs(html: string) {
  const values: string[] = [];
  for (const match of html.matchAll(TEL_HREF_RE)) {
    if (match[1]) values.push(match[1]);
  }
  return values;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export async function enrichFromWebsite(lead: RawLead) {
  const url = safeHttpUrl(lead.website);
  if (!url) {
    return {
      lead,
      enrichment: {
        ok: false,
        reason: "INVALID_WEBSITE"
      }
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AIOverseasSalesBot/1.0)"
      },
      redirect: "follow",
      signal: controller.signal
    });

    if (!res.ok) {
      return {
        lead,
        enrichment: {
          ok: false,
          reason: `HTTP_${res.status}`
        }
      };
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return {
        lead,
        enrichment: {
          ok: false,
          reason: "NON_HTML"
        }
      };
    }

    const html = (await res.text()).slice(0, 500_000);
    const text = stripHtml(html).slice(0, 6000);
    const emails = unique(html.match(EMAIL_RE) || [])
      .filter(validEmail)
      .slice(0, 5);

    const telPhones = extractTelHrefs(html);
    const fallbackPhones = html.match(PHONE_RE) || [];
    const phones = unique([...telPhones, ...fallbackPhones])
      .map(normalizePhone)
      .filter((x): x is string => Boolean(x))
      .slice(0, 5);
    const telegram = unique(html.match(TG_RE) || []).slice(0, 3);
    const linkedin = unique(html.match(LI_RE) || []).slice(0, 3);
    const whatsapp = unique(html.match(WA_RE) || []).slice(0, 3);

    const enriched: RawLead = {
      ...lead,
      contact: {
        ...(lead.contact || {}),
        email: lead.contact?.email || emails[0],
        phone: lead.contact?.phone || phones[0],
        telegram: lead.contact?.telegram || telegram[0],
        linkedin: lead.contact?.linkedin || linkedin[0],
        whatsapp: lead.contact?.whatsapp || whatsapp[0]
      }
    };

    return {
      lead: enriched,
      enrichment: {
        ok: true,
        descriptionPreview: text.slice(0, 1200),
        emails,
        phones,
        telegram,
        linkedin,
        whatsapp
      }
    };
  } catch (error) {
    return {
      lead,
      enrichment: {
        ok: false,
        reason: error instanceof Error ? error.message : "FETCH_FAILED"
      }
    };
  } finally {
    clearTimeout(timer);
  }
}
