import { tavily } from "tavily";
import type { BarcodeResult } from "@/types";

export interface PriceSignals {
  upcMin?: number;
  upcMax?: number;
  webSnippets: string[];
}

export async function gatherPriceSignals(
  productName: string,
  brand: string,
  barcodeResult?: Pick<BarcodeResult, "lowestPrice" | "highestPrice">,
  apiKeyOverride?: string
): Promise<PriceSignals> {
  const signals: PriceSignals = {
    upcMin: barcodeResult?.lowestPrice,
    upcMax: barcodeResult?.highestPrice,
    webSnippets: [],
  };

  const apiKey = apiKeyOverride || process.env.TAVILY_API_KEY;
  if (!apiKey) return signals;

  try {
    const client = tavily({ apiKey });
    const res = await client.search(
      `${brand} ${productName} price RRP australia`,
      { searchDepth: "basic", maxResults: 5 }
    );

    signals.webSnippets = (res.results ?? [])
      .map((r) => r.content ?? "")
      .filter((c) => /\$|aud|price|rrp/i.test(c))
      .slice(0, 4);
  } catch (e) {
    console.warn("[price] Tavily price search failed:", e instanceof Error ? e.message : e);
  }

  return signals;
}

export function formatPriceContext(signals: PriceSignals): string {
  const lines: string[] = [];

  if (signals.upcMin != null || signals.upcMax != null) {
    const min = signals.upcMin != null ? `$${signals.upcMin.toFixed(2)}` : null;
    const max = signals.upcMax != null ? `$${signals.upcMax.toFixed(2)}` : null;
    const range = [min, max].filter(Boolean).join(" – ");
    lines.push(`UPC database recorded price range: ${range} USD`);
  }

  if (signals.webSnippets.length > 0) {
    lines.push("Web price mentions:");
    signals.webSnippets.forEach((s) => lines.push(`- ${s.slice(0, 300)}`));
  }

  return lines.join("\n");
}
