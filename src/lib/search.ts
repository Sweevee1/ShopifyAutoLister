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

export class SearchFailedError extends Error {
  code = "SEARCH_FAILED";
}

export async function searchForOfficialPage(
  productName: string,
  brand: string
): Promise<string> {
  const query = `${brand} ${productName} official site`.trim();

  let html: string;
  try {
    const res = await axios.post(
      "https://html.duckduckgo.com/html/",
      new URLSearchParams({ q: query }),
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "text/html",
        },
        timeout: 10_000,
      }
    );
    html = res.data as string;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      throw new SearchFailedError(`DuckDuckGo search failed: ${err.message}`);
    }
    throw err;
  }

  const $ = cheerio.load(html);

  const urls: string[] = [];

  // DDG HTML results: each result link has href like
  // //duckduckgo.com/l/?uddg=<encoded-url>&...
  $("a.result__a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    try {
      const qs = href.includes("?") ? href.split("?")[1] : "";
      const params = new URLSearchParams(qs);
      const actual = params.get("uddg");
      if (actual) urls.push(decodeURIComponent(actual));
    } catch {
      // skip unparseable hrefs
    }
  });

  if (urls.length === 0) {
    throw new SearchFailedError(
      `No search results found for "${productName}". Paste the official product page URL below.`
    );
  }

  const preferred = urls.find((u) => !isDenied(u));
  return preferred ?? urls[0];
}
