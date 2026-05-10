import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { key } = await req.json();
    if (!key) return NextResponse.json({ error: "No API key" }, { status: 400 });

    const res = await fetch("https://api.tavily.com/usage", {
      headers: { Authorization: `Bearer ${key}` },
    });

    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: json.message ?? "Tavily error" }, { status: res.status });
    }
    return NextResponse.json(json);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
