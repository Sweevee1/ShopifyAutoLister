import { NextRequest, NextResponse } from "next/server";
import {
  lookupBarcode,
  BarcodeInvalidError,
  BarcodeNotFoundError,
  BarcodeRateLimitError,
} from "@/lib/barcode";
import { searchForOfficialPage, SearchFailedError } from "@/lib/search";
import {
  scrapeUrl,
  PageBlockedError,
  PageEmptyError,
  PageNotFoundError,
  PageTimeoutError,
} from "@/lib/scraper";
import { generateDescription } from "@/lib/claude";
import { gatherPriceSignals, formatPriceContext } from "@/lib/price";
import type { BarcodeResult, LookupRequest } from "@/types";

function err(
  error: string,
  errorCode: string,
  status: number,
  hint?: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json({ error, errorCode, hint, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  let body: LookupRequest;
  try {
    body = await request.json();
  } catch {
    return err("Invalid request body.", "BAD_REQUEST", 400);
  }

  const { barcode, manualUrl } = body;

  if (!barcode && !manualUrl) {
    return err("Provide a barcode or a product page URL.", "BAD_REQUEST", 400);
  }

  let url = manualUrl ?? "";
  let barcodeResult: BarcodeResult | undefined;
  let productInfo: Pick<BarcodeResult, "title" | "brand" | "category"> = {
    title: "(derive from page)",
    brand: "",
    category: "",
  };

  if (barcode && !manualUrl) {
    try {
      barcodeResult = await lookupBarcode(barcode);
      productInfo = barcodeResult;
      console.log(`[lookup] barcode ${barcode} → "${productInfo.title}" by ${productInfo.brand}`);
      if (barcodeResult.officialUrl) {
        url = barcodeResult.officialUrl;
        console.log(`[lookup] official URL from barcode DB: ${url}`);
      }
    } catch (e) {
      if (e instanceof BarcodeInvalidError)
        return err(e.message, "BARCODE_INVALID", 422, "Check the barcode and try again.");
      if (e instanceof BarcodeNotFoundError)
        return err(e.message, "BARCODE_NOT_FOUND", 404, "Paste the official product page URL below and try again.");
      if (e instanceof BarcodeRateLimitError)
        return err(e.message, "BARCODE_RATE_LIMIT", 429, "Paste the official product page URL below and try again.");
      return err("Barcode lookup failed.", "BARCODE_ERROR", 500);
    }

    if (!url) {
      try {
        url = await searchForOfficialPage(productInfo.title, productInfo.brand);
        console.log(`[lookup] search → ${url}`);
      } catch (e) {
        if (e instanceof SearchFailedError)
          return err(e.message, "SEARCH_FAILED", 404,
            "Paste the official product page URL below and try again.",
            { productName: e.productName ?? productInfo.title, brand: e.brand ?? productInfo.brand }
          );
        return err("Search failed.", "SEARCH_ERROR", 500);
      }
    }
  }

  // Gather price signals and scrape the page in parallel
  const [priceSignals, scrapeResult] = await Promise.allSettled([
    gatherPriceSignals(productInfo.title, productInfo.brand, barcodeResult),
    scrapeUrl(url),
  ]);

  if (scrapeResult.status === "rejected") {
    const e = scrapeResult.reason;
    if (e instanceof PageBlockedError)
      return err(e.message, "PAGE_BLOCKED", 422, "The page blocked automated access. Try a different URL.");
    if (e instanceof PageEmptyError)
      return err(e.message, "PAGE_EMPTY", 422, "The page requires JavaScript to render. Try a different URL.");
    if (e instanceof PageNotFoundError)
      return err(e.message, "PAGE_NOT_FOUND", 404, "Check the URL and try again.");
    if (e instanceof PageTimeoutError)
      return err(e.message, "PAGE_TIMEOUT", 504, "The page timed out. Try again or use a different URL.");
    return err("Failed to read the product page.", "SCRAPE_ERROR", 500);
  }

  const scrapedContent = scrapeResult.value;
  const priceContext = priceSignals.status === "fulfilled"
    ? formatPriceContext(priceSignals.value)
    : "";
  console.log(`[lookup] scraped ${scrapedContent.length} chars, price context: ${priceContext.length} chars`);

  let generated: { html: string; price: string; altText: string };
  try {
    generated = await generateDescription(scrapedContent, productInfo, priceContext || undefined);
    console.log(`[lookup] generated ${generated.html.length} chars of HTML, price: ${generated.price}`);
  } catch (e) {
    console.error("[lookup] generation error:", e);
    return err("Failed to generate product description.", "GENERATION_FAILED", 500);
  }

  return NextResponse.json({
    html: generated.html,
    price: generated.price,
    altText: generated.altText,
    sourceUrl: url,
    productName: productInfo.title === "(derive from page)" ? "" : productInfo.title,
  });
}
