import { NextRequest, NextResponse } from "next/server";
import { createEbayListing } from "@/lib/ebay";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      userToken: string;
      title: string;
      descriptionHtml: string;
      price: string;
      categoryId: string;
      condition: string;
      itemSpecifics?: Record<string, string>;
    };

    const { userToken, title, descriptionHtml, price, categoryId, condition, itemSpecifics } = body;

    if (!userToken || !title || !descriptionHtml || !price || !categoryId) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const result = await createEbayListing({ userToken, title, descriptionHtml, price, categoryId, condition, itemSpecifics });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
