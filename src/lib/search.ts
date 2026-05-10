import axios from "axios";
import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DENYLIST = [
  "amazon.",
  "ebay.",
  "walmart.",
  "target.",
  "bestbuy.",
  "etsy.",
  "aliexpress.",
  "wish.",
  "bunnings.",
  "officeworks.",
  "jbhifi.",
  "bigw.",
  "kmart.",
  "woolworths.",
  "coles.",
  "chemistwarehouse.",
  "priceme.",
  "staticice.",
  "pricespy.",
  "getpricelist.",
  "google.",
  "youtube.",
  "reddit.",
  "facebook.",
  "instagram.",
  "pinterest.",
  "twitter.",
  "tiktok.",
  "bing.",
  "duckduckgo.",
  "wikipedia.",
];

function isDenied(url: string): boolean {
  return DENYLIST.some((domain) => url.includes(domain));
}

function extractDdgUrl(href: string): string | null {
  try {
    // DDG redirect: //duckduckgo.com/l/?uddg=<encoded>&rut=...
    const qs = href.includes("?") ? href.split("?")[1] : href;
    const params = new URLSearchParams(qs);
    const uddg = params.get("uddg");
    if (uddg) return decodeURIComponent(uddg);

    // Fallback: if href is already an absolute URL
    if (href.startsWith("http")) return href;
  } catch {
    // ignore
  }
  return null;
}

export class SearchFailedError extends Error {
  code = "SEARCH_FAILED";
}

export async function searchForOfficialPage(
  productName: string,
  brand: string
): Promise<string> {
  const query = encodeURIComponent(`${brand} ${productName} official site`.trim());

  let html: string;
  try {
    const res = await axios.get(
      `https://html.duckduckgo.com/html/?q=${query}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-AU,en;q=0.9",
        },
        timeout: 12_000,
      }
    );
    html = res.data as string;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      throw new SearchFailedError(`Search request failed: ${err.message}`);
    }
    throw err;
  }

  const $ = cheerio.load(html);
  const urls: string[] = [];

  // Primary selector: result links
  $("a.result__a, a[href*='uddg=']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const url = extractDdgUrl(href);
    if (url && url.startsWith("http")) urls.push(url);
  });

  // Fallback: scan every <a> for uddg param
  if (urls.length === 0) {
    $("a").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!href.includes("uddg=")) return;
      const url = extractDdgUrl(href);
      if (url && url.startsWith("http")) urls.push(url);
    });
  }

  if (urls.length === 0) {
    throw new SearchFailedError(
      `No search results found for "${productName}". Paste the official product page URL below.`
    );
  }

  const preferred = urls.find((u) => !isDenied(u));
  return preferred ?? urls[0];
}
