export interface BarcodeResult {
  title: string;
  brand: string;
  category: string;
  lowestPrice?: number;
  highestPrice?: number;
  officialUrl?: string; // returned directly from a barcode DB (skips web search)
}

export interface LookupRequest {
  barcode?: string;
  manualUrl?: string;
  /** Saved / View Source HTML from the official product page — bypasses HTTP scrape when non-empty */
  manualHtml?: string;
}

export interface LookupResponse {
  html: string;
  price: string;
  altText: string;
  /** Empty when generation used pasted HTML only without a URL */
  sourceUrl: string;
  productName: string;
}

export interface LookupError {
  error: string;
  errorCode: string;
  hint?: string;
  productName?: string;
  brand?: string;
}

export type StepStatus = "idle" | "loading" | "done" | "error";

export interface PipelineStep {
  label: string;
  status: StepStatus;
}
