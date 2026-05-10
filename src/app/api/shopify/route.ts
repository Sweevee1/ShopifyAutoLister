import { NextRequest, NextResponse } from "next/server";
import { createDraftProduct } from "@/lib/shopify";
import type { ShopifyPushPayload } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { domain, token, ...payload } = body as { domain: string; token: string } & ShopifyPushPayload;
    if (!domain || !token || !payload.title || !payload.bodyHtml || !payload.price) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const result = await createDraftProduct(domain, token, payload);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
