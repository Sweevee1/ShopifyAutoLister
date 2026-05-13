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
  sku?: string;
  manualUrl?: string;
  /** Saved / View Source HTML from the official product page — bypasses HTTP scrape when non-empty */
  manualHtml?: string;
  /** User-supplied Tavily API key — used when TAVILY_API_KEY env var is not set */
  tavilyApiKey?: string;
  /** User-supplied Anthropic API key — when set, uses Claude API instead of local Ollama */
  claudeApiKey?: string;
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

export interface ShopifyPushPayload {
  title: string;
  bodyHtml: string;
  price: string;
  altText: string;
}

export interface ShopifyPushResult {
  productId: number;
  productUrl: string;
}

export type StepStatus = "idle" | "loading" | "done" | "error";

export interface PipelineStep {
  label: string;
  status: StepStatus;
}
