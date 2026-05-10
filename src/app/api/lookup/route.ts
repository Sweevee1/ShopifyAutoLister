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
import { streamDescription, parseOutput } from "@/lib/claude";
import { gatherPriceSignals, formatPriceContext } from "@/lib/price";
import type { BarcodeResult, LookupRequest } from "@/types";

/** Shown whenever automatic official-page resolution or fetch fails — URL or pasted HTML fallback */
const FALLBACK_HINT =
  "We could not confirm or read an official product page automatically. Paste the manufacturer's official URL, or paste saved page HTML (View Source / Save Complete page) into the pasted HTML field, then try again.";

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

  const barcode = body.barcode?.trim();
  const manualUrl = body.manualUrl?.trim() ?? "";
  const manualHtml = body.manualHtml?.trim() ?? "";
  const tavilyApiKey = body.tavilyApiKey?.trim() || undefined;

  if (!barcode && !manualUrl && !manualHtml) {
    return err(
      "Provide a barcode, an official product page URL, or pasted page HTML.",
      "BAD_REQUEST",
      400
    );
  }

  let url = manualUrl;
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
        return err(
          `No product found for barcode ${barcode}.`,
          "BARCODE_NOT_FOUND",
          404,
          FALLBACK_HINT
        );
      if (e instanceof BarcodeRateLimitError)
        return err(e.message, "BARCODE_RATE_LIMIT", 429, FALLBACK_HINT);
      return err("Barcode lookup failed.", "BARCODE_ERROR", 500);
    }

    if (!url) {
      try {
        url = await searchForOfficialPage(productInfo.title, productInfo.brand, tavilyApiKey);
        console.log(`[lookup] search → ${url}`);
      } catch (e) {
        if (e instanceof SearchFailedError)
          return err(e.message, "SEARCH_FAILED", 404, FALLBACK_HINT, {
            productName: e.productName ?? productInfo.title,
            brand: e.brand ?? productInfo.brand,
          });
        return err("Search failed.", "SEARCH_ERROR", 500);
      }
    }
  }

  const usePastedHtml = manualHtml.length > 0;

  if (!usePastedHtml && !url) {
    return err(
      "Could not resolve an official product page URL.",
      "NO_PRODUCT_URL",
      422,
      FALLBACK_HINT,
      {
        productName: productInfo.title === "(derive from page)" ? "" : productInfo.title,
        brand: productInfo.brand,
      }
    );
  }

  const sourceUrl = usePastedHtml ? manualUrl || url || "" : url;

  const [priceSignals, scrapeOutcome] = await Promise.allSettled([
    gatherPriceSignals(productInfo.title, productInfo.brand, barcodeResult, tavilyApiKey),
    usePastedHtml ? Promise.resolve(manualHtml) : scrapeUrl(url),
  ]);

  if (!usePastedHtml && scrapeOutcome.status === "rejected") {
    const e = scrapeOutcome.reason;
    if (e instanceof PageBlockedError)
      return err(e.message, "PAGE_BLOCKED", 422, FALLBACK_HINT);
    if (e instanceof PageEmptyError)
      return err(e.message, "PAGE_EMPTY", 422, FALLBACK_HINT);
    if (e instanceof PageNotFoundError)
      return err(
        e.message,
        "PAGE_NOT_FOUND",
        404,
        "Check the URL and try again, or paste saved page HTML if the live page renders with JavaScript only."
      );
    if (e instanceof PageTimeoutError)
      return err(
        e.message,
        "PAGE_TIMEOUT",
        504,
        "Retry with the same URL, try a simpler manufacturer URL path, or paste saved page HTML."
      );
    return err("Failed to read the product page.", "SCRAPE_ERROR", 500, FALLBACK_HINT);
  }

  const scrapedContent =
    scrapeOutcome.status === "fulfilled" ? scrapeOutcome.value : "";

  if (!scrapedContent) {
    return err("Failed to read the product page.", "SCRAPE_ERROR", 500, FALLBACK_HINT);
  }

  const priceContext =
    priceSignals.status === "fulfilled" ? formatPriceContext(priceSignals.value) : "";
  console.log(
    `[lookup] content ${usePastedHtml ? "pasted" : "scraped"} ${scrapedContent.length} chars, price context: ${priceContext.length} chars`
  );

  const encoder = new TextEncoder();
  const productName = productInfo.title === "(derive from page)" ? "" : productInfo.title;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      send({ type: "meta", sourceUrl, productName });

      let fullText = "";
      try {
        for await (const token of streamDescription(
          scrapedContent,
          productInfo,
          priceContext || undefined,
          usePastedHtml ? "paste" : "scrape"
        )) {
          fullText += token;
          send({ type: "chunk", text: token });
        }

        const parsed = parseOutput(fullText);
        console.log(`[lookup] generated ${parsed.html.length} chars of HTML, price: ${parsed.price}`);
        send({ type: "done", html: parsed.html, price: parsed.price, altText: parsed.altText });
      } catch (e) {
        console.error("[lookup] generation error:", e);
        send({ type: "error", error: "Failed to generate product description.", errorCode: "GENERATION_FAILED" });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
