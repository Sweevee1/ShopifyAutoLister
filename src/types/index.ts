export interface BarcodeResult {
  title: string;
  brand: string;
  category: string;
  lowestPrice?: number;
  highestPrice?: number;
}

export interface LookupRequest {
  barcode?: string;
  manualUrl?: string;
}

export interface LookupResponse {
  html: string;
  price: string;
  altText: string;
  sourceUrl: string;
  productName: string;
}

export interface LookupError {
  error: string;
  errorCode: string;
  hint?: string;
}

export type StepStatus = "idle" | "loading" | "done" | "error";

export interface PipelineStep {
  label: string;
  status: StepStatus;
}
