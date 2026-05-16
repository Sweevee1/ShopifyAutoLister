import { NextRequest, NextResponse } from "next/server";
import { getSuggestedCategories } from "@/lib/ebay";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  try {
    const suggestions = await getSuggestedCategories(q);
    return NextResponse.json(suggestions);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
