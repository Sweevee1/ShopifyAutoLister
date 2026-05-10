import axios from "axios";
import type { BarcodeResult } from "@/types";

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export class BarcodeInvalidError extends Error {
  code = "BARCODE_INVALID";
}
export class BarcodeNotFoundError extends Error {
  code = "BARCODE_NOT_FOUND";
}
export class BarcodeRateLimitError extends Error {
  code = "BARCODE_RATE_LIMIT";
}

export async function lookupBarcode(barcode: string): Promise<BarcodeResult> {
  if (!/^\d{8,14}$/.test(barcode)) {
    throw new BarcodeInvalidError("Barcode must be 8–14 digits.");
  }

  let data: Record<string, unknown>;
  try {
    const res = await axios.get(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`,
      { timeout: 10_000 }
    );
    data = res.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 429) {
      throw new BarcodeRateLimitError(
        "UPC Item DB rate limit reached (100/day). Provide a URL instead."
      );
    }
    throw err;
  }

  const code = data.code as string;
  if (code === "INVALID_UPC") {
    throw new BarcodeInvalidError("Not a valid UPC code.");
  }

  const total = data.total as number;
  if (!total || total === 0) {
    throw new BarcodeNotFoundError(
      `No product found for barcode ${barcode}.`
    );
  }

  const items = data.items as Array<Record<string, unknown>>;
  const item = items[0];

  return {
    title: toTitleCase((item.title as string) || "Unknown Product"),
    brand: (item.brand as string) || "",
    category: (item.category as string) || "",
    lowestPrice: item.lowest_recorded_price as number | undefined,
    highestPrice: item.highest_recorded_price as number | undefined,
  };
}
