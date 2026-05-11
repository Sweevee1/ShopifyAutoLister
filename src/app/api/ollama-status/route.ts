import { NextResponse } from "next/server";
import { spawn } from "child_process";

export const dynamic = "force-dynamic";

const base = process.env.OLLAMA_HOST ?? "http://localhost:11434";

async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  if (await isOllamaRunning()) {
    return NextResponse.json({ status: "running" });
  }

  // Not running — try to start it
  try {
    spawn("ollama", ["serve"], { detached: true, stdio: "ignore" }).unref();
    // Give it 3 seconds to come up then re-check
    await new Promise((r) => setTimeout(r, 3000));
    if (await isOllamaRunning()) {
      return NextResponse.json({ status: "running" });
    }
  } catch {
    // ollama not installed or spawn failed
  }

  return NextResponse.json({ status: "offline" });
}
