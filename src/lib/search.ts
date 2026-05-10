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
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;

  if (!apiKey || !cx) {
    throw new SearchFailedError(
      "No search API configured. Paste the official product page URL below.",
      productName,
      brand
    );
  }

  const query = `${brand} ${productName}`.trim();

  let items: Array<{ link: string }> = [];
  try {
    const res = await axios.get("https://www.googleapis.com/customsearch/v1", {
      params: { key: apiKey, cx, q: query, num: 5, gl: "au", hl: "en" },
      timeout: 10_000,
    });
    items = res.data?.items ?? [];
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const msg = (err.response?.data as { error?: { message?: string } })?.error?.message ?? err.message;
      throw new SearchFailedError(
        `Search failed (${status}): ${msg}. Paste the official product page URL below.`,
        productName,
        brand
      );
    }
    throw err;
  }

  if (items.length === 0) {
    throw new SearchFailedError(
      `No results found for "${query}". Paste the official product page URL below.`,
      productName,
      brand
    );
  }

  const preferred = items.find((i) => !isDenied(i.link));
  const chosen = (preferred ?? items[0]).link;
  console.log(`[search] → ${chosen}`);
  return chosen;
}
