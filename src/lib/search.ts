import { tavily } from "tavily";

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

export async function searchBySku(
  sku: string,
  apiKeyOverride?: string
): Promise<string> {
  const apiKey = apiKeyOverride || process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new SearchFailedError(
      "No search API configured. Could not find an official product page automatically.",
      sku
    );
  }

  const query = `"${sku}" official product page`;

  let results: Array<{ url: string }> = [];
  try {
    const client = tavily({ apiKey });
    const res = await client.search(query, { searchDepth: "basic", maxResults: 5 });
    results = res.results ?? [];
  } catch (err: unknown) {
    throw new SearchFailedError(
      `Search failed: ${err instanceof Error ? err.message : String(err)}. Could not find a product page for SKU.`,
      sku
    );
  }

  if (results.length === 0) {
    throw new SearchFailedError(
      `No results found for SKU "${sku}". Could not find an official product page automatically.`,
      sku
    );
  }

  const preferred = results.find((r) => !isDenied(r.url));
  const chosen = (preferred ?? results[0]).url;
  console.log(`[search] SKU → ${chosen}`);
  return chosen;
}

export async function searchForOfficialPage(
  productName: string,
  brand: string,
  apiKeyOverride?: string
): Promise<string> {
  const apiKey = apiKeyOverride || process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new SearchFailedError(
      "No search API configured. Could not find an official product page automatically.",
      productName,
      brand
    );
  }

  const query = `${brand} ${productName} official product page`.trim();

  let results: Array<{ url: string }> = [];
  try {
    const client = tavily({ apiKey });
    const res = await client.search(query, {
      searchDepth: "basic",
      maxResults: 5,
    });
    results = res.results ?? [];
  } catch (err: unknown) {
    throw new SearchFailedError(
      `Search failed: ${err instanceof Error ? err.message : String(err)}. Could not find an official product page automatically.`,
      productName,
      brand
    );
  }

  if (results.length === 0) {
    throw new SearchFailedError(
      `No results found for "${query}". Could not find an official product page automatically.`,
      productName,
      brand
    );
  }

  const preferred = results.find((r) => !isDenied(r.url));
  const chosen = (preferred ?? results[0]).url;
  console.log(`[search] → ${chosen}`);
  return chosen;
}
