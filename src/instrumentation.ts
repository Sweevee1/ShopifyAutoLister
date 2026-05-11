export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const base = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) return;
  } catch {
    // not running — start it
  }

  const { spawn } = await import("child_process");
  spawn("ollama", ["serve"], { detached: true, stdio: "ignore" }).unref();
  await new Promise((r) => setTimeout(r, 2000));
}
