import axios from "axios";
import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export class PageBlockedError extends Error { code = "PAGE_BLOCKED"; }
export class PageEmptyError extends Error { code = "PAGE_EMPTY"; }
export class PageNotFoundError extends Error { code = "PAGE_NOT_FOUND"; }
export class PageTimeoutError extends Error { code = "PAGE_TIMEOUT"; }

function extractJsonLd($: cheerio.CheerioAPI): string {
  const chunks: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html() ?? "";
      const data = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const type = (item["@type"] as string | undefined) ?? "";
        // Prefer Product, but also capture BreadcrumbList for category context
        if (type === "Product" || type.includes("Product")) {
          const parts: string[] = [];
          if (item.name) parts.push(`Product: ${item.name}`);
          if (item.brand?.name) parts.push(`Brand: ${item.brand.name}`);
          if (item.description) parts.push(`Description: ${item.description}`);
          if (item.sku) parts.push(`SKU: ${item.sku}`);
          if (item.gtin || item.gtin13 || item.gtin12) {
            parts.push(`Barcode: ${item.gtin ?? item.gtin13 ?? item.gtin12}`);
          }
          if (item.offers) {
            const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            if (offer?.price) parts.push(`Price: ${offer.priceCurrency ?? ""} ${offer.price}`);
          }
          if (Array.isArray(item.additionalProperty)) {
            for (const prop of item.additionalProperty) {
              if (prop.name && prop.value) parts.push(`${prop.name}: ${prop.value}`);
            }
          }
          if (parts.length) chunks.push(parts.join("\n"));
        }
      }
    } catch {
      // skip malformed JSON-LD
    }
  });
  return chunks.join("\n\n");
}

function extractMeta($: cheerio.CheerioAPI): string {
  const parts: string[] = [];
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogDesc = $('meta[property="og:description"]').attr("content");
  const metaDesc = $('meta[name="description"]').attr("content");
  const title = $("title").text().trim();

  if (ogTitle) parts.push(`Title: ${ogTitle}`);
  else if (title) parts.push(`Title: ${title}`);
  if (ogDesc) parts.push(`Description: ${ogDesc}`);
  else if (metaDesc) parts.push(`Description: ${metaDesc}`);
  return parts.join("\n");
}

function extractBodyText($: cheerio.CheerioAPI): string {
  $("script, style, nav, footer, header, aside, iframe, noscript").remove();
  $(
    '[class*="cookie"], [class*="popup"], [class*="modal"], [id*="banner"], [class*="banner"], [class*="newsletter"], [class*="chat"]'
  ).remove();

  const selectors = [
    '[class*="product-description"]',
    '[class*="product-detail"]',
    '[class*="pdp"]',
    '[id*="description"]',
    '[id*="product"]',
    '[class*="product-info"]',
    '[class*="product-content"]',
    "main",
    "article",
    '[role="main"]',
    "body",
  ];

  for (const selector of selectors) {
    const el = $(selector).first();
    if (el.length) {
      const text = el.text().replace(/\s+/g, " ").trim();
      if (text.length >= 200) return text;
    }
  }
  return $("body").text().replace(/\s+/g, " ").trim();
}

function isSpa($: cheerio.CheerioAPI): boolean {
  const bodyHtml = $("body").html() ?? "";
  return (
    bodyHtml.includes('<div id="root">') ||
    bodyHtml.includes('<div id="app">') ||
    bodyHtml.includes('<div id="__next">') ||
    bodyHtml.includes('data-reactroot') ||
    // Very little text but lots of HTML = likely SPA
    ($("body").text().replace(/\s+/g, " ").trim().length < 150 && bodyHtml.length > 2000)
  );
}

export async function scrapeUrl(url: string): Promise<string> {
  let html: string;
  try {
    const res = await axios.get(url, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 15_000,
      maxRedirects: 5,
    });

    const contentType = (res.headers["content-type"] as string) ?? "";
    if (contentType.includes("application/pdf")) {
      throw new PageBlockedError("URL points to a PDF — cannot extract text.");
    }

    html = res.data as string;
  } catch (err: unknown) {
    if (err instanceof PageBlockedError) throw err;
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 404) throw new PageNotFoundError(`Page not found: ${url}`);
      if (status === 403 || status === 401 || status === 429) {
        throw new PageBlockedError(`Access denied (${status}): ${url}`);
      }
      if (err.code === "ECONNABORTED") {
        throw new PageTimeoutError(`Timed out fetching: ${url}`);
      }
    }
    throw err;
  }

  const $ = cheerio.load(html);

  const pageTitle = $("title").text();
  if (pageTitle.includes("Just a moment") || pageTitle.includes("cf-browser-")) {
    throw new PageBlockedError(`Cloudflare protection detected at: ${url}`);
  }

  // Always extract structured data and meta — these survive JS rendering
  const jsonLd = extractJsonLd($);
  const meta = extractMeta($);
  const bodyText = extractBodyText($);

  // Assemble: JSON-LD first (most structured), then meta, then body text
  const sections: string[] = [];
  if (jsonLd) sections.push(`[Structured product data]\n${jsonLd}`);
  if (meta) sections.push(`[Page metadata]\n${meta}`);

  const combined = sections.join("\n\n");

  if (combined.length < 100 && bodyText.length < 100) {
    if (isSpa($)) {
      throw new PageEmptyError(
        "Page appears to be a JavaScript-rendered SPA — no content could be extracted."
      );
    }
    throw new PageEmptyError(
      "Very little text was extracted from the page. It may require JavaScript to render."
    );
  }

  // Include body text only if it adds meaningful content beyond what JSON-LD/meta already cover
  const bodyNeeded = combined.length < 500 || bodyText.length > 300;
  if (bodyNeeded && bodyText.length > 100) {
    sections.push(`[Page content]\n${bodyText.slice(0, 6_000)}`);
  }

  return sections.join("\n\n").slice(0, 10_000);
}
