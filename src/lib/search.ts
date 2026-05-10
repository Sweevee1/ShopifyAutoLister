import axios from "axios";

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
  productName?: string;
  brand?: string;

  constructor(message: string, productName?: string, brand?: string) {
    super(message);
    this.productName = productName;
    this.brand = brand;
  }
}

export async function searchForOfficialPage(
  productName: string,
  brand: string
): Promise<string> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;

  if (!apiKey) {
    throw new SearchFailedError(
      `No search API configured. Paste the official product page URL below.`,
      productName,
      brand
    );
  }

  const query = `${brand} ${productName}`.trim();

  let results: Array<{ url: string }> = [];
  try {
    const res = await axios.get(
      "https://api.search.brave.com/res/v1/web/search",
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
          "User-Agent": USER_AGENT,
        },
        params: { q: query, count: 5, country: "AU" },
        timeout: 10_000,
      }
    );
    results = res.data?.web?.results ?? [];
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      throw new SearchFailedError(
        `Search failed: ${err.response?.status ?? err.message}. Paste the official product page URL below.`,
        productName,
        brand
      );
    }
    throw err;
  }

  if (results.length === 0) {
    throw new SearchFailedError(
      `No results found for "${query}". Paste the official product page URL below.`,
      productName,
      brand
    );
  }

  const preferred = results.find((r) => !isDenied(r.url));
  const chosen = (preferred ?? results[0]).url;
  console.log(`[search] → ${chosen}`);
  return chosen;
}
