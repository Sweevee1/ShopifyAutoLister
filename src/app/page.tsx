"use client";

import { useState, useRef, useEffect } from "react";
import type { LookupResponse, LookupError } from "@/types";

const STEPS = [
  "Finding product...",
  "Searching for official page...",
  "Reading product page...",
  "Generating description...",
];

type AppState =
  | { phase: "idle" }
  | { phase: "loading"; stepIndex: number }
  | { phase: "streaming"; liveText: string; sourceUrl: string; productName: string }
  | { phase: "success"; data: LookupResponse }
  | { phase: "error"; data: LookupError; attemptedUrl?: string };

type ShopifyPhase =
  | { phase: "idle" }
  | { phase: "editing"; title: string; price: string }
  | { phase: "confirming"; title: string; price: string }
  | { phase: "pushing" }
  | { phase: "done"; productUrl: string }
  | { phase: "error"; message: string };

function extractPrice(priceStr: string): string {
  const match = priceStr.match(/\$(\d+(?:\.\d+)?)/);
  return match ? match[1] : "";
}

const DEMO_DATA: LookupResponse = {
  productName: "Apple AirPods Pro (2nd Generation)",
  sourceUrl: "https://www.apple.com/au/shop/product/MTJV3ZA/A/airpods-pro",
  html: `<p>Experience next-level audio with the Apple AirPods Pro (2nd Generation), featuring Active Noise Cancellation that adapts to your ear geometry and environment. Adaptive Transparency lets you hear the world around you while your music plays on.</p>
<p>Powered by the Apple H2 chip, these earbuds deliver remarkably low distortion audio and up to 2× more noise cancellation than the previous generation. A new touch control on the stem lets you swipe to adjust volume — a first for AirPods.</p>
<p>Perfect for commuters, gym-goers, and anyone who demands premium wireless audio. The MagSafe Charging Case offers up to 30 hours of total listening time and charges via USB-C, MagSafe, Apple Watch charger, or Qi pad.</p>
<h2>What's Included</h2>
<ul>
<li>AirPods Pro (2nd generation) with MagSafe Charging Case (USB-C)</li>
<li>Four pairs of silicone ear tips (XS, S, M, L)</li>
<li>USB-C to MagSafe Charging Cable</li>
</ul>
<h2>Key Features</h2>
<ul>
<li>Active Noise Cancellation with Adaptive Transparency</li>
<li>Personalised Spatial Audio with dynamic head tracking</li>
<li>Apple H2 chip — powerful, efficient performance</li>
<li>Up to 6 hours listening time (30 hours total with case)</li>
<li>IP54 water and dust resistance (earbuds and case)</li>
<li>Touch control on stem for volume adjustment</li>
<li>MagSafe, Apple Watch, and Qi compatible charging</li>
</ul>`,
  price: "Suggested RRP/guide: AUD $399.00",
  altText: "Apple AirPods Pro 2nd Generation with MagSafe Charging Case USB-C in white, featuring H2 chip and Active Noise Cancellation",
};

const inputCls =
  "w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#008060] focus:border-transparent transition-shadow";

const card = "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs px-2.5 py-1 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium transition-colors"
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}

const LAST_STEP = STEPS.length - 1;

function StepIndicator({ stepIndex, usingCloudAI }: { stepIndex: number; usingCloudAI?: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (stepIndex !== LAST_STEP) { setElapsed(0); return; }
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [stepIndex]);

  const isGenerating = stepIndex === LAST_STEP;

  return (
    <div className="flex flex-col gap-2.5 py-6">
      {STEPS.map((label, i) => {
        const done = i < stepIndex;
        const active = i === stepIndex;
        return (
          <div key={i} className="flex items-center gap-3">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                done
                  ? "bg-[#008060] text-white"
                  : active
                  ? "bg-[#008060] text-white animate-pulse"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={`text-sm ${
                done
                  ? "text-[#008060] dark:text-emerald-400"
                  : active
                  ? "text-[#008060] dark:text-emerald-400 font-medium"
                  : "text-gray-400 dark:text-gray-600"
              }`}
            >
              {label}
              {active && i === LAST_STEP && elapsed > 0 && (
                <span className="ml-2 font-normal tabular-nums opacity-70">
                  {elapsed}s
                </span>
              )}
            </span>
          </div>
        );
      })}

      {isGenerating && (
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-[#008060] rounded-full animate-progress-bar" />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {usingCloudAI
              ? "Powered by Claude API — usually a few seconds."
              : "Running on CPU — typically 2–3 minutes. Hang tight."}
          </p>
        </div>
      )}
    </div>
  );
}

const ERROR_CODES_NEEDING_FALLBACK = new Set([
  "BARCODE_NOT_FOUND",
  "BARCODE_RATE_LIMIT",
  "PAGE_BLOCKED",
  "PAGE_EMPTY",
  "SEARCH_FAILED",
  "NO_PRODUCT_URL",
  "SCRAPE_ERROR",
]);

const ERROR_CODES_FOCUS_PASTED_HTML = new Set(["PAGE_BLOCKED", "PAGE_EMPTY"]);

function buildCopyPack(data: LookupResponse): string {
  return `${data.html}\n---\nSuggested price: ${data.price}\nAlt text: ${data.altText}`;
}

const TAVILY_KEY_STORAGE = "tavily_api_key";
const CLAUDE_KEY_STORAGE = "claude_api_key";
const AI_PROVIDER_STORAGE = "ai_provider";
const DARK_MODE_STORAGE = "dark_mode";
const SHOPIFY_DOMAIN_STORAGE = "shopify_store_domain";
const SHOPIFY_TOKEN_STORAGE = "shopify_admin_token";
const UPC_USAGE_STORAGE = "upc_usage";
const UPC_DAILY_LIMIT = 100;

function loadUpcUsage(): number {
  try {
    const raw = localStorage.getItem(UPC_USAGE_STORAGE);
    if (!raw) return 0;
    const { count, date } = JSON.parse(raw) as { count: number; date: string };
    return date === new Date().toISOString().slice(0, 10) ? count : 0;
  } catch { return 0; }
}

function incrementUpcUsage(): number {
  const next = loadUpcUsage() + 1;
  localStorage.setItem(UPC_USAGE_STORAGE, JSON.stringify({
    count: next,
    date: new Date().toISOString().slice(0, 10),
  }));
  return next;
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function ShopifyBagIcon({ size = 18, stroke = "currentColor" }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 6h18M16 10a4 4 0 01-8 0" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  const [barcode, setBarcode] = useState("");
  const [sku, setSku] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualHtml, setManualHtml] = useState("");
  const [appState, setAppState] = useState<AppState>({ phase: "idle" });
  const [tavilyKey, setTavilyKey] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [shopifyToken, setShopifyToken] = useState("");
  const [shopifyPhase, setShopifyPhase] = useState<ShopifyPhase>({ phase: "idle" });
  const [tavilyUsage, setTavilyUsage] = useState<{ used: number; limit: number } | null>(null);
  const [tavilyUsageLoading, setTavilyUsageLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [upcUsage, setUpcUsage] = useState(0);
  const [showTavilyKey, setShowTavilyKey] = useState(false);
  const [showShopifyToken, setShowShopifyToken] = useState(false);
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [aiProvider, setAiProvider] = useState<"claude" | "ollama">("ollama");
  const [ollamaStatus, setOllamaStatus] = useState<"unknown" | "running" | "offline">("unknown");
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const pastedHtmlRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem(TAVILY_KEY_STORAGE) ?? "";
    setTavilyKey(savedKey);
    setClaudeApiKey(localStorage.getItem(CLAUDE_KEY_STORAGE) ?? "");
    setAiProvider((localStorage.getItem(AI_PROVIDER_STORAGE) as "claude" | "ollama") ?? "ollama");
    setSettingsOpen(!savedKey);
    const savedDark = localStorage.getItem(DARK_MODE_STORAGE) === "true";
    setDarkMode(savedDark);
    setShopifyDomain(localStorage.getItem(SHOPIFY_DOMAIN_STORAGE) ?? "");
    setShopifyToken(localStorage.getItem(SHOPIFY_TOKEN_STORAGE) ?? "");
    setUpcUsage(loadUpcUsage());

    async function checkOllama() {
      try {
        const res = await fetch("/api/ollama-status");
        const json = await res.json();
        setOllamaStatus(json.status === "running" ? "running" : "offline");
      } catch {
        setOllamaStatus("offline");
      }
    }
    checkOllama();
    const ollamaInterval = setInterval(checkOllama, 15_000);
    return () => clearInterval(ollamaInterval);
  }, []);

  async function fetchTavilyUsage(key: string) {
    if (!key) return;
    setTavilyUsageLoading(true);
    setTavilyUsage(null);
    try {
      const res = await fetch("/api/tavily-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const json = await res.json();
      if (res.ok) {
        const used = json.account?.plan_usage ?? 0;
        const limit = json.account?.plan_limit ?? 1000;
        setTavilyUsage({ used, limit });
      }
    } finally {
      setTavilyUsageLoading(false);
    }
  }

  function toggleDark() {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem(DARK_MODE_STORAGE, String(next));
    document.documentElement.classList.toggle("dark", next);
  }

  function clearStepTimer() {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }

  useEffect(() => () => clearStepTimer(), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!barcode.trim() && !sku.trim() && !manualUrl.trim() && !manualHtml.trim()) return;

    clearStepTimer();
    setAppState({ phase: "loading", stepIndex: 0 });
    setShopifyPhase({ phase: "idle" });
    setDemoMode(false);
    if (barcode.trim()) setUpcUsage(incrementUpcUsage());

    let currentStep = 0;
    stepTimerRef.current = setInterval(() => {
      currentStep = Math.min(currentStep + 1, STEPS.length - 1);
      setAppState((prev) =>
        prev.phase === "loading"
          ? { phase: "loading", stepIndex: currentStep }
          : prev
      );
    }, 1500);

    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: barcode.trim() || undefined,
          sku: sku.trim() || undefined,
          manualUrl: manualUrl.trim() || undefined,
          manualHtml: manualHtml.trim() || undefined,
          tavilyApiKey: tavilyKey.trim() || undefined,
          claudeApiKey: aiProvider === "claude" ? claudeApiKey.trim() || undefined : undefined,
        }),
      });

      clearStepTimer();

      if (!res.ok) {
        const json = await res.json();
        setAppState({ phase: "error", data: json as LookupError });
        const code = (json as LookupError).errorCode;
        if (ERROR_CODES_NEEDING_FALLBACK.has(code)) {
          setTimeout(() => {
            if (ERROR_CODES_FOCUS_PASTED_HTML.has(code)) {
              pastedHtmlRef.current?.focus();
            } else {
              urlInputRef.current?.focus();
            }
          }, 100);
        }
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let sourceUrl = "";
      let productName = "";
      let liveText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line) as Record<string, string>;
          if (msg.type === "meta") {
            sourceUrl = msg.sourceUrl;
            productName = msg.productName;
            setAppState({ phase: "streaming", liveText: "", sourceUrl, productName });
          } else if (msg.type === "chunk") {
            liveText += msg.text;
            setAppState({ phase: "streaming", liveText, sourceUrl, productName });
          } else if (msg.type === "done") {
            setAppState({
              phase: "success",
              data: { html: msg.html, price: msg.price, altText: msg.altText, sourceUrl, productName },
            });
            setShopifyPhase({ phase: "editing", title: productName, price: extractPrice(msg.price) });
          } else if (msg.type === "error") {
            setAppState({ phase: "error", data: { error: msg.error, errorCode: msg.errorCode } });
          }
        }
      }
    } catch {
      clearStepTimer();
      setAppState({
        phase: "error",
        data: { error: "Network error — could not reach the server.", errorCode: "NETWORK_ERROR" },
      });
    }
  }

  async function handleShopifyPush(title: string, price: string) {
    if (appState.phase !== "success") return;
    if (demoMode) {
      setShopifyPhase({ phase: "error", message: "Demo mode — add your Shopify credentials in Settings to push real products." });
      return;
    }
    setShopifyPhase({ phase: "pushing" });
    try {
      const res = await fetch("/api/shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: shopifyDomain,
          token: shopifyToken,
          title,
          bodyHtml: appState.data.html,
          price,
          altText: appState.data.altText,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setShopifyPhase({ phase: "error", message: json.error ?? "Unknown error" });
      } else {
        setShopifyPhase({ phase: "done", productUrl: json.productUrl });
      }
    } catch {
      setShopifyPhase({ phase: "error", message: "Network error — could not reach the server." });
    }
  }

  const needsFallbackHelp =
    appState.phase === "error" &&
    ERROR_CODES_NEEDING_FALLBACK.has(appState.data.errorCode);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#008060] flex items-center justify-center flex-shrink-0 shadow-sm">
              <ShopifyBagIcon size={18} stroke="white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900 dark:text-white leading-tight">Shopify Auto-Lister</h1>
              <p className="text-xs text-gray-400 dark:text-gray-500">Barcode → Shopify-ready listing</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleDark}
            className="flex items-center gap-0.5 p-0.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            aria-label="Toggle dark mode"
          >
            <span className={`p-1.5 rounded-full transition-all ${!darkMode ? "bg-white shadow-sm text-amber-500" : "text-gray-400 dark:text-gray-600"}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="4"/>
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
              </svg>
            </span>
            <span className={`p-1.5 rounded-full transition-all ${darkMode ? "bg-gray-700 shadow-sm text-blue-300" : "text-gray-400"}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
              </svg>
            </span>
          </button>
        </header>

        {/* Settings */}
        <div className={`${card} mb-4 overflow-hidden`}>
          <button
            type="button"
            onClick={() => {
              const next = !settingsOpen;
              setSettingsOpen(next);
              if (next && tavilyKey) fetchTavilyUsage(tavilyKey);
            }}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Settings</span>
            <div className="flex items-center gap-2">
              {aiProvider === "claude" ? (
                <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                  claudeApiKey
                    ? "bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                    : "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                }`}>
                  {claudeApiKey ? "Claude ✓" : "Claude (no key)"}
                </span>
              ) : (
                <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                  ollamaStatus === "running"
                    ? "bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                    : ollamaStatus === "offline"
                    ? "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    ollamaStatus === "running" ? "bg-emerald-500 animate-pulse" : ollamaStatus === "offline" ? "bg-red-500" : "bg-gray-400"
                  }`} />
                  Ollama
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                tavilyKey
                  ? "bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-400"
              }`}>
                {tavilyKey ? "Tavily ✓" : "Tavily"}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                shopifyDomain && shopifyToken
                  ? "bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-400"
              }`}>
                {shopifyDomain && shopifyToken ? "Shopify ✓" : "Shopify"}
              </span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                className={`text-gray-400 transition-transform duration-200 ${settingsOpen ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </button>

          {settingsOpen && (
            <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tavilyKey" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Tavily API key
                  <span className="text-gray-400 dark:text-gray-500 font-normal ml-1 text-xs">
                    — auto product search (
                    <a href="https://app.tavily.com" target="_blank" rel="noopener noreferrer" className="text-[#008060] hover:underline">
                      free key
                    </a>
                    , 1,000/mo)
                  </span>
                </label>
                <div className="relative">
                  <input
                    id="tavilyKey"
                    type={showTavilyKey ? "text" : "password"}
                    value={tavilyKey}
                    onChange={(e) => {
                      setTavilyKey(e.target.value);
                      localStorage.setItem(TAVILY_KEY_STORAGE, e.target.value);
                    }}
                    placeholder="tvly-..."
                    className={`${inputCls} font-mono pr-9`}
                  />
                  <button type="button" onClick={() => setShowTavilyKey((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <EyeIcon open={showTavilyKey} />
                  </button>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Saved in your browser only — never sent anywhere except Tavily.
                </p>

                {tavilyKey && (
                  <div className="mt-1">
                    {tavilyUsageLoading ? (
                      <p className="text-xs text-gray-400 dark:text-gray-500">Checking usage…</p>
                    ) : tavilyUsage ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            <span className="font-medium text-gray-700 dark:text-gray-200">{tavilyUsage.used.toLocaleString()}</span>
                            {" / "}{tavilyUsage.limit.toLocaleString()} searches this month
                          </span>
                          <button
                            type="button"
                            onClick={() => fetchTavilyUsage(tavilyKey)}
                            className="text-xs text-[#008060] hover:underline"
                          >
                            Refresh
                          </button>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#008060] rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, (tavilyUsage.used / tavilyUsage.limit) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Provider</p>
                  <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => {
                        setAiProvider("ollama");
                        localStorage.setItem(AI_PROVIDER_STORAGE, "ollama");
                      }}
                      className={`px-3 py-1.5 transition-colors ${
                        aiProvider === "ollama"
                          ? "bg-[#008060] text-white"
                          : "bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      Ollama
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAiProvider("claude");
                        localStorage.setItem(AI_PROVIDER_STORAGE, "claude");
                      }}
                      className={`px-3 py-1.5 border-l border-gray-200 dark:border-gray-700 transition-colors ${
                        aiProvider === "claude"
                          ? "bg-[#008060] text-white"
                          : "bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      Claude API
                    </button>
                  </div>
                </div>

                {aiProvider === "claude" && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="claudeKey" className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Anthropic API key
                      <span className="font-normal ml-1">
                        (
                        <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-[#008060] hover:underline">
                          get key
                        </a>
                        )
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        id="claudeKey"
                        type={showClaudeKey ? "text" : "password"}
                        value={claudeApiKey}
                        onChange={(e) => {
                          setClaudeApiKey(e.target.value);
                          localStorage.setItem(CLAUDE_KEY_STORAGE, e.target.value);
                        }}
                        placeholder="sk-ant-..."
                        className={`${inputCls} font-mono pr-9`}
                      />
                      <button type="button" onClick={() => setShowClaudeKey((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <EyeIcon open={showClaudeKey} />
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Saved in your browser only — never sent anywhere except Anthropic.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5 pt-3 border-t border-gray-100 dark:border-gray-800">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Shopify credentials</p>
                <label htmlFor="shopifyDomain" className="text-xs text-gray-500 dark:text-gray-400">
                  Store domain
                </label>
                <input
                  id="shopifyDomain"
                  type="text"
                  value={shopifyDomain}
                  onChange={(e) => {
                    setShopifyDomain(e.target.value);
                    localStorage.setItem(SHOPIFY_DOMAIN_STORAGE, e.target.value);
                  }}
                  placeholder="my-store.myshopify.com"
                  className={`${inputCls} font-mono`}
                />
                <label htmlFor="shopifyToken" className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Admin API token (
                  <a
                    href="https://shopify.dev/docs/apps/build/authentication-authorization/access-token/generate-app-access-tokens-admin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#008060] hover:underline"
                  >
                    how to get one
                  </a>
                  )
                </label>
                <div className="relative">
                  <input
                    id="shopifyToken"
                    type={showShopifyToken ? "text" : "password"}
                    value={shopifyToken}
                    onChange={(e) => {
                      setShopifyToken(e.target.value);
                      localStorage.setItem(SHOPIFY_TOKEN_STORAGE, e.target.value);
                    }}
                    placeholder="shpat_..."
                    className={`${inputCls} font-mono pr-9`}
                  />
                  <button type="button" onClick={() => setShowShopifyToken((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <EyeIcon open={showShopifyToken} />
                  </button>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Saved in your browser only — never sent anywhere except your Shopify store.
                </p>
              </div>

              {/* Barcode API usage */}
              <div className="flex flex-col gap-1.5 pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Barcode lookup</p>
                  <span className="text-xs text-gray-400 dark:text-gray-500">UPC Item DB · resets daily</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-200">{upcUsage}</span>
                    {" / "}{UPC_DAILY_LIMIT} requests today
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${upcUsage >= UPC_DAILY_LIMIT ? "bg-red-500" : upcUsage >= UPC_DAILY_LIMIT * 0.8 ? "bg-amber-500" : "bg-[#008060]"}`}
                    style={{ width: `${Math.min(100, (upcUsage / UPC_DAILY_LIMIT) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Form */}
        <div className={`${card} p-5 mb-4`}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="barcode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Barcode{" "}
                  <span className="text-gray-400 dark:text-gray-500 font-normal text-xs">UPC / EAN / ISBN</span>
                </label>
                <input
                  id="barcode"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{8,14}"
                  value={barcode}
                  onChange={(e) => { setBarcode(e.target.value); if (e.target.value) setSku(""); }}
                  placeholder="e.g. 0885909950805"
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="sku" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  SKU{" "}
                  <span className="text-gray-400 dark:text-gray-500 font-normal text-xs">model / part number</span>
                </label>
                <input
                  id="sku"
                  type="text"
                  value={sku}
                  onChange={(e) => { setSku(e.target.value); if (e.target.value) setBarcode(""); }}
                  placeholder="e.g. MQD83LL/A"
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="manualUrl"
                className={`block text-sm font-medium mb-1.5 ${
                  needsFallbackHelp ? "text-[#008060]" : "text-gray-700 dark:text-gray-300"
                }`}
              >
                Official product page URL
                {!needsFallbackHelp && (
                  <span className="text-gray-400 dark:text-gray-500 font-normal text-xs"> (optional)</span>
                )}
              </label>
              <input
                id="manualUrl"
                ref={urlInputRef}
                type="url"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://www.brand.com/product-name"
                className={`${inputCls} ${needsFallbackHelp ? "border-[#008060] ring-1 ring-[#008060]" : ""}`}
              />
            </div>

            <div>
              <label
                htmlFor="manualHtml"
                className={`block text-sm font-medium mb-1.5 ${
                  needsFallbackHelp &&
                  appState.phase === "error" &&
                  ERROR_CODES_FOCUS_PASTED_HTML.has(appState.data.errorCode)
                    ? "text-[#008060]"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                Or paste saved page HTML
                <span className="text-gray-400 dark:text-gray-500 font-normal text-xs">
                  {" "}— optional fallback
                </span>
              </label>
              <textarea
                id="manualHtml"
                ref={pastedHtmlRef}
                value={manualHtml}
                onChange={(e) => setManualHtml(e.target.value)}
                placeholder="Paste the official manufacturer product page HTML here if URL fetch fails."
                rows={4}
                className={`${inputCls} font-mono resize-y min-h-[5rem] ${
                  needsFallbackHelp &&
                  appState.phase === "error" &&
                  ERROR_CODES_FOCUS_PASTED_HTML.has(appState.data.errorCode)
                    ? "border-[#008060] ring-1 ring-[#008060]"
                    : ""
                }`}
              />
            </div>

            <button
              type="submit"
              disabled={appState.phase === "loading" || appState.phase === "streaming"}
              className="w-full py-2.5 bg-[#008060] hover:bg-[#006e52] text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {appState.phase === "loading" ? "Working…" : "Look Up Product"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => {
              if (demoMode) {
                setDemoMode(false);
                setAppState({ phase: "idle" });
                setShopifyPhase({ phase: "idle" });
              } else {
                setDemoMode(true);
                setShopifyPhase({ phase: "editing", title: DEMO_DATA.productName, price: extractPrice(DEMO_DATA.price) });
                setAppState({ phase: "success", data: DEMO_DATA });
              }
            }}
            className="mt-3 w-full py-2 text-sm text-gray-400 dark:text-gray-500 hover:text-[#008060] dark:hover:text-[#008060] border border-dashed border-gray-200 dark:border-gray-700 hover:border-[#008060] rounded-lg transition-colors"
          >
            {demoMode ? "Unload demo output" : "Load demo output"}
          </button>
        </div>

        {/* Loading */}
        {appState.phase === "loading" && (
          <div className={`${card} px-5`}>
            <StepIndicator stepIndex={appState.stepIndex} usingCloudAI={aiProvider === "claude" && !!claudeApiKey} />
          </div>
        )}

        {/* Streaming */}
        {appState.phase === "streaming" && (
          <div className={`${card} p-5 flex flex-col gap-3`}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#008060] animate-pulse flex-shrink-0" />
              <p className="text-sm font-medium text-[#008060]">Generating description…</p>
            </div>
            <pre className="text-xs bg-gray-950 text-emerald-300 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed min-h-[6rem]">
              {appState.liveText}
              <span className="inline-block w-1.5 h-3.5 bg-emerald-400 ml-0.5 animate-pulse align-middle" />
            </pre>
          </div>
        )}

        {/* Error */}
        {appState.phase === "error" && (
          <div className="p-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl space-y-2">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">{appState.data.error}</p>
            {appState.data.hint && (
              <p className="text-sm text-red-600 dark:text-red-400">{appState.data.hint}</p>
            )}
            {appState.data.errorCode === "SEARCH_FAILED" && appState.data.productName && (
              <div className="pt-1">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Found: <strong>{appState.data.productName}</strong>
                  {appState.data.brand ? ` by ${appState.data.brand}` : ""}
                </p>
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(
                    `${appState.data.brand ?? ""} ${appState.data.productName} official site`.trim()
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs px-3 py-1.5 bg-[#008060] hover:bg-[#006e52] text-white rounded-lg transition-colors"
                >
                  Search Google for official page →
                </a>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  Then paste the official URL above and click Look Up again.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Success */}
        {appState.phase === "success" && (
          <div className="flex flex-col gap-4">

            {demoMode && (
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium border border-amber-200 dark:border-amber-800">
                  Demo output — not a real lookup
                </span>
              </div>
            )}

            {appState.data.sourceUrl && (
              <div className="flex items-center gap-2 text-sm px-1">
                <span className="text-gray-400 dark:text-gray-500 shrink-0 text-xs">Source</span>
                <a
                  href={appState.data.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#008060] hover:underline truncate text-xs"
                >
                  {appState.data.sourceUrl}
                </a>
              </div>
            )}

            {/* Preview */}
            <div className={card}>
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Preview</p>
              </div>
              <div
                className="prose prose-sm dark:prose-invert max-w-none p-5"
                dangerouslySetInnerHTML={{ __html: appState.data.html }}
              />
            </div>

            {/* Shopify HTML */}
            <div className={card}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Shopify HTML</p>
                <CopyButton text={appState.data.html} />
              </div>
              <pre className="text-xs bg-gray-950 text-gray-300 p-5 rounded-b-xl overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                <code>{appState.data.html}</code>
              </pre>
            </div>

            {/* Details */}
            <div className={`${card} px-5 py-4 flex flex-col gap-3`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Details</p>
                <CopyButton text={buildCopyPack(appState.data)} label="Copy all" />
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Suggested price</p>
                <p className="text-sm font-semibold text-[#008060]">{appState.data.price}</p>
              </div>
              <div className="flex items-start justify-between gap-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">
                    Alt text{" "}
                    <span className="tabular-nums">({appState.data.altText.length}/125)</span>
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 break-words">{appState.data.altText}</p>
                </div>
                <CopyButton text={appState.data.altText} />
              </div>
            </div>

            {/* Shopify Push Panel */}
            <div className={card}>
              <div className="flex items-center gap-2.5 px-5 py-3 border-b border-gray-100 dark:border-gray-800">
                <div className="w-4 h-4 rounded-md bg-[#008060] flex items-center justify-center flex-shrink-0">
                  <ShopifyBagIcon size={9} stroke="white" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Push to Shopify</p>
              </div>
              <div className="p-5">
                {!demoMode && (!shopifyDomain || !shopifyToken) ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    Add Shopify credentials in{" "}
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      className="text-[#008060] hover:underline font-medium"
                    >
                      Settings
                    </button>{" "}
                    to enable pushing.
                  </p>
                ) : shopifyPhase.phase === "editing" ? (
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Product Title</label>
                      <input
                        type="text"
                        value={shopifyPhase.title}
                        onChange={(e) => setShopifyPhase({ phase: "editing", title: e.target.value, price: (shopifyPhase as { phase: "editing"; title: string; price: string }).price })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Price (AUD)</label>
                      <input
                        type="text"
                        value={shopifyPhase.price}
                        onChange={(e) => setShopifyPhase({ phase: "editing", title: (shopifyPhase as { phase: "editing"; title: string; price: string }).title, price: e.target.value })}
                        placeholder="49.99"
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShopifyPhase({ phase: "idle" })}
                        className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (shopifyPhase.phase === "editing") {
                            setShopifyPhase({ phase: "confirming", title: shopifyPhase.title, price: shopifyPhase.price });
                          }
                        }}
                        disabled={!shopifyPhase.title.trim() || !shopifyPhase.price.trim()}
                        className="px-4 py-2 text-sm bg-[#008060] hover:bg-[#006e52] text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Review →
                      </button>
                    </div>
                  </div>
                ) : shopifyPhase.phase === "confirming" ? (
                  <div className="flex flex-col gap-3">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 flex flex-col gap-1.5">
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Confirm push</p>
                      <p className="text-sm text-gray-700 dark:text-gray-200">
                        <span className="text-gray-400 dark:text-gray-500 text-xs">Title</span>{" "}
                        <span className="font-medium">{shopifyPhase.title}</span>
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-200">
                        <span className="text-gray-400 dark:text-gray-500 text-xs">Price</span>{" "}
                        <span className="font-semibold text-[#008060]">${shopifyPhase.price} AUD</span>
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-200">
                        <span className="text-gray-400 dark:text-gray-500 text-xs">Status</span>{" "}
                        <span className="font-medium">Draft</span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (shopifyPhase.phase === "confirming") {
                            setShopifyPhase({ phase: "editing", title: shopifyPhase.title, price: shopifyPhase.price });
                          }
                        }}
                        className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        ← Back
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (shopifyPhase.phase === "confirming") {
                            handleShopifyPush(shopifyPhase.title, shopifyPhase.price);
                          }
                        }}
                        className="px-4 py-2 text-sm bg-[#008060] hover:bg-[#006e52] text-white rounded-lg font-medium transition-colors"
                      >
                        ✓ Confirm Push
                      </button>
                    </div>
                  </div>
                ) : shopifyPhase.phase === "pushing" ? (
                  <div className="flex items-center gap-2.5 text-sm text-gray-500 dark:text-gray-400">
                    <span className="w-4 h-4 border-2 border-[#008060] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    Creating draft product…
                  </div>
                ) : shopifyPhase.phase === "done" ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#008060] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">✓</span>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Draft product created!</p>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={shopifyPhase.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm px-4 py-2 bg-[#008060] hover:bg-[#006e52] text-white rounded-lg font-medium transition-colors"
                      >
                        View in Shopify Admin ↗
                      </a>
                      <button
                        type="button"
                        onClick={() => setShopifyPhase({ phase: "editing", title: appState.data.productName, price: extractPrice(appState.data.price) })}
                        className="text-sm px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        Push again
                      </button>
                    </div>
                  </div>
                ) : shopifyPhase.phase === "error" ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-red-600 dark:text-red-400">{shopifyPhase.message}</p>
                    <button
                      type="button"
                      onClick={() => setShopifyPhase({ phase: "idle" })}
                      className="self-start text-sm px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Try again
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setAppState({ phase: "idle" });
                setBarcode("");
                setSku("");
                setManualUrl("");
                setManualHtml("");
                setDemoMode(false);
              }}
              className="self-center text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-1"
            >
              ← Start over
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
