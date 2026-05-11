import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return NextResponse.json({ status: "running" });
    return NextResponse.json({ status: "error" });
  } catch {
    return NextResponse.json({ status: "offline" });
  }
}
