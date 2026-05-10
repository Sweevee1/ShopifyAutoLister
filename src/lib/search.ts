import axios from "axios";

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
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    throw new SearchFailedError("BRAVE_SEARCH_API_KEY is not configured.");
  }

  const query = `${brand} ${productName} official site`.trim();

  let results: Array<{ url: string }> = [];
  try {
    const res = await axios.get(
      "https://api.search.brave.com/res/v1/web/search",
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
        params: {
          q: query,
          count: 5,
          search_lang: "en",
          country: "AU",
        },
        timeout: 10_000,
      }
    );
    results = res.data?.web?.results ?? [];
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      throw new SearchFailedError(
        `Brave Search error: ${err.response?.status} ${err.message}`
      );
    }
    throw err;
  }

  if (results.length === 0) {
    throw new SearchFailedError(
      `No search results found for "${productName}".`
    );
  }

  const preferred = results.find((r) => !isDenied(r.url));
  return preferred ? preferred.url : results[0].url;
}
