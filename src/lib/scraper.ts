import axios from "axios";
import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export class PageBlockedError extends Error {
  code = "PAGE_BLOCKED";
}
export class PageEmptyError extends Error {
  code = "PAGE_EMPTY";
}
export class PageNotFoundError extends Error {
  code = "PAGE_NOT_FOUND";
}
export class PageTimeoutError extends Error {
  code = "PAGE_TIMEOUT";
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

  const title = $("title").text();
  if (title.includes("Just a moment") || title.includes("cf-browser-")) {
    throw new PageBlockedError(`Cloudflare protection detected at: ${url}`);
  }

  $("script, style, nav, footer, header, aside").remove();
  $(
    '[class*="cookie"], [class*="popup"], [class*="modal"], [id*="banner"], [class*="banner"]'
  ).remove();

  const selectors = [
    '[class*="product-description"]',
    '[class*="product-detail"]',
    '[id*="description"]',
    "main",
    "article",
    "body",
  ];

  let content = "";
  for (const selector of selectors) {
    const el = $(selector).first();
    if (el.length) {
      content = el.text();
      break;
    }
  }

  content = content.replace(/\s+/g, " ").trim();

  if (content.length < 100) {
    const bodyHtml = $("body").html() ?? "";
    if (
      bodyHtml.includes('<div id="root">') ||
      bodyHtml.includes('<div id="app">')
    ) {
      throw new PageEmptyError(
        "Page appears to be a JavaScript-rendered SPA — no content could be extracted."
      );
    }
    throw new PageEmptyError(
      "Very little text was extracted from the page. It may require JavaScript to render."
    );
  }

  return content.slice(0, 8_000);
}
