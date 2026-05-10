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
      className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 transition-colors"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

const LAST_STEP = STEPS.length - 1;

function StepIndicator({ stepIndex }: { stepIndex: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (stepIndex !== LAST_STEP) { setElapsed(0); return; }
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [stepIndex]);

  const isGenerating = stepIndex === LAST_STEP;

  return (
    <div className="flex flex-col gap-2 py-6">
      {STEPS.map((label, i) => {
        const done = i < stepIndex;
        const active = i === stepIndex;
        return (
          <div key={i} className="flex items-center gap-3">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                done
                  ? "bg-green-500 text-white"
                  : active
                  ? "bg-blue-500 text-white animate-pulse"
                  : "bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={`text-sm ${
                done
                  ? "text-green-600 dark:text-green-400"
                  : active
                  ? "text-blue-600 dark:text-blue-400 font-medium"
                  : "text-gray-400 dark:text-gray-600"
              }`}
            >
              {label}
              {active && i === LAST_STEP && elapsed > 0 && (
                <span className="ml-2 text-blue-400 font-normal tabular-nums">
                  {elapsed}s
                </span>
              )}
            </span>
          </div>
        );
      })}

      {isGenerating && (
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 rounded-full animate-progress-bar" />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Running on CPU — typically 2–3 minutes. Hang tight.
          </p>
        </div>
      )}
    </div>
  );
}

/** Errors where the user should try official URL or pasted HTML fallback */
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
const DARK_MODE_STORAGE = "dark_mode";
const SHOPIFY_DOMAIN_STORAGE = "shopify_store_domain";
const SHOPIFY_TOKEN_STORAGE = "shopify_admin_token";

export default function Home() {
  const [barcode, setBarcode] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualHtml, setManualHtml] = useState("");
  const [appState, setAppState] = useState<AppState>({ phase: "idle" });
  const [tavilyKey, setTavilyKey] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [shopifyToken, setShopifyToken] = useState("");
  const [shopifyPhase, setShopifyPhase] = useState<ShopifyPhase>({ phase: "idle" });
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const pastedHtmlRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem(TAVILY_KEY_STORAGE) ?? "";
    setTavilyKey(savedKey);
    setSettingsOpen(!savedKey);
    const savedDark = localStorage.getItem(DARK_MODE_STORAGE) === "true";
    setDarkMode(savedDark);
    setShopifyDomain(localStorage.getItem(SHOPIFY_DOMAIN_STORAGE) ?? "");
    setShopifyToken(localStorage.getItem(SHOPIFY_TOKEN_STORAGE) ?? "");
  }, []);

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
    if (!barcode.trim() && !manualUrl.trim() && !manualHtml.trim()) return;

    clearStepTimer();
    setAppState({ phase: "loading", stepIndex: 0 });
    setShopifyPhase({ phase: "idle" });

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
          manualUrl: manualUrl.trim() || undefined,
          manualHtml: manualHtml.trim() || undefined,
          tavilyApiKey: tavilyKey.trim() || undefined,
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

      // Streaming response — read NDJSON line by line
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
    <main className="max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Shopify Auto-Lister</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Paste a barcode to generate a Shopify-ready product description.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleDark}
          className="mt-1 flex-shrink-0 text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {darkMode ? "Light mode" : "Dark mode"}
        </button>
      </div>

      {/* Settings */}
      <div className="mb-6 border border-gray-200 dark:border-gray-700 rounded-md">
        <button
          type="button"
          onClick={() => setSettingsOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors"
        >
          <span>Settings</span>
          <span className="text-gray-400 dark:text-gray-500 text-xs">
            {tavilyKey ? "Tavily key saved" : "No Tavily key"} · {shopifyDomain && shopifyToken ? "Shopify connected" : "Shopify not configured"} {settingsOpen ? "▲" : "▼"}
          </span>
        </button>
        {settingsOpen && (
          <div className="px-4 pb-4 flex flex-col gap-2 border-t border-gray-100 dark:border-gray-700 pt-3">
            <label htmlFor="tavilyKey" className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Tavily API key
              <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">
                — needed for automatic product page search (
                <a href="https://app.tavily.com" target="_blank" rel="noopener noreferrer" className="underline">
                  get a free key
                </a>
                , 1,000/month)
              </span>
            </label>
            <input
              id="tavilyKey"
              type="password"
              value={tavilyKey}
              onChange={(e) => {
                setTavilyKey(e.target.value);
                localStorage.setItem(TAVILY_KEY_STORAGE, e.target.value);
              }}
              placeholder="tvly-..."
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Saved in your browser only — never sent anywhere except Tavily during searches.
            </p>

            <div className="border-t border-gray-100 dark:border-gray-700 mt-2 pt-3 flex flex-col gap-2">
              <label htmlFor="shopifyDomain" className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Shopify store domain
                <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">
                  — (
                  <a href="https://shopify.dev/docs/apps/build/authentication-authorization/access-token/generate-app-access-tokens-admin" target="_blank" rel="noopener noreferrer" className="underline">
                    create an Admin API token
                  </a>
                  )
                </span>
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
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="shopifyToken" className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Shopify Admin API token
              </label>
              <input
                id="shopifyToken"
                type="password"
                value={shopifyToken}
                onChange={(e) => {
                  setShopifyToken(e.target.value);
                  localStorage.setItem(SHOPIFY_TOKEN_STORAGE, e.target.value);
                }}
                placeholder="shpat_..."
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Saved in your browser only — never sent anywhere except your Shopify store.
              </p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="barcode" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Barcode (UPC / EAN / ISBN)
          </label>
          <input
            id="barcode"
            type="text"
            inputMode="numeric"
            pattern="\d{8,14}"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="e.g. 0885909950805"
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="manualUrl"
            className={`block text-sm font-medium mb-1 ${
              needsFallbackHelp ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
            }`}
          >
            Official product page URL
            {!needsFallbackHelp && (
              <span className="text-gray-400 dark:text-gray-500 font-normal"> (optional)</span>
            )}
          </label>
          <input
            id="manualUrl"
            ref={urlInputRef}
            type="url"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://www.brand.com/product-name"
            className={`w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 ${
              needsFallbackHelp
                ? "border-blue-400 ring-1 ring-blue-400 focus:ring-blue-500"
                : "border-gray-300 dark:border-gray-600 focus:ring-blue-500"
            }`}
          />
        </div>

        <div>
          <label
            htmlFor="manualHtml"
            className={`block text-sm font-medium mb-1 ${
              needsFallbackHelp &&
              appState.phase === "error" &&
              ERROR_CODES_FOCUS_PASTED_HTML.has(appState.data.errorCode)
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-700 dark:text-gray-200"
            }`}
          >
            Or paste saved page HTML
            <span className="text-gray-400 dark:text-gray-500 font-normal">
              {" "}— View Source / Save Complete webpage (optional fallback)
            </span>
          </label>
          <textarea
            id="manualHtml"
            ref={pastedHtmlRef}
            value={manualHtml}
            onChange={(e) => setManualHtml(e.target.value)}
            placeholder="Paste the official manufacturer product page HTML here if URL fetch fails or loads empty in this tool."
            rows={5}
            className={`w-full border rounded-md px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 resize-y min-h-[6rem] ${
              needsFallbackHelp &&
              appState.phase === "error" &&
              ERROR_CODES_FOCUS_PASTED_HTML.has(appState.data.errorCode)
                ? "border-blue-400 ring-1 ring-blue-400 focus:ring-blue-500"
                : "border-gray-300 dark:border-gray-600 focus:ring-blue-500"
            }`}
          />
        </div>

        <button
          type="submit"
          disabled={appState.phase === "loading" || appState.phase === "streaming"}
          className="self-start px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {appState.phase === "loading" ? "Working..." : "Look Up"}
        </button>
      </form>

      {appState.phase === "loading" && (
        <StepIndicator stepIndex={appState.stepIndex} />
      )}

      {appState.phase === "streaming" && (
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Generating description...</p>
          </div>
          <pre className="text-xs bg-gray-900 text-green-300 p-4 rounded-md overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed min-h-[6rem]">
            {appState.liveText}
            <span className="inline-block w-1.5 h-3.5 bg-green-400 ml-0.5 animate-pulse align-middle" />
          </pre>
        </div>
      )}

      {appState.phase === "error" && (
        <div className="mt-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md space-y-2">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">{appState.data.error}</p>
          {appState.data.hint && (
            <p className="text-sm text-red-600 dark:text-red-400">{appState.data.hint}</p>
          )}
          {appState.data.errorCode === "SEARCH_FAILED" && appState.data.productName && (
            <div className="pt-1">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                Found product: <strong>{appState.data.productName}</strong>
                {appState.data.brand ? ` by ${appState.data.brand}` : ""}
              </p>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(
                  `${appState.data.brand ?? ""} ${appState.data.productName} official site`.trim()
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Search Google for official page →
              </a>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Then paste the official URL above (or pasted page HTML below) and click Look Up again.
              </p>
            </div>
          )}
        </div>
      )}

      {appState.phase === "success" && (
        <div className="mt-8 flex flex-col gap-6">

          <div className="flex flex-wrap items-baseline gap-2 text-sm">
            <span className="text-gray-400 dark:text-gray-500 shrink-0">Official page:</span>
            {appState.data.sourceUrl ? (
              <a
                href={appState.data.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline truncate"
              >
                {appState.data.sourceUrl}
              </a>
            ) : (
              <span className="text-gray-600 dark:text-gray-400">
                pasted HTML only — add the URL field above when available for attribution
              </span>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Preview</p>
            <div
              className="prose prose-sm dark:prose-invert max-w-none p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md"
              dangerouslySetInnerHTML={{ __html: appState.data.html }}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Shopify HTML</p>
              <CopyButton text={appState.data.html} />
            </div>
            <pre className="text-xs bg-gray-900 text-gray-100 p-4 rounded-md overflow-x-auto whitespace-pre-wrap">
              <code>{appState.data.html}</code>
            </pre>
          </div>

          <div className="border-t border-gray-300 dark:border-gray-700 pt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 m-0">
                Copy pack (Shopify HTML + notes)
              </p>
              <CopyButton text={buildCopyPack(appState.data)} label="Copy pack" />
            </div>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <p className="text-sm text-gray-700 dark:text-gray-200 m-0">
                <span className="font-medium">Suggested price (RRP / market guide):</span>{" "}
                <span className="text-green-700 dark:text-green-400 font-bold">{appState.data.price}</span>
              </p>
            </div>
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm text-gray-700 dark:text-gray-200 m-0">
                <span className="font-medium">Alt text:</span>{" "}
                <span className="text-gray-600 dark:text-gray-400">{appState.data.altText}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">({appState.data.altText.length}/125)</span>
              </p>
              <CopyButton text={appState.data.altText} />
            </div>
          </div>

          {/* Shopify Push Panel */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">Push to Shopify</p>

            {!shopifyDomain || !shopifyToken ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Add Shopify credentials in Settings to enable pushing.
              </p>
            ) : shopifyPhase.phase === "idle" ? (
              <button
                type="button"
                onClick={() => setShopifyPhase({
                  phase: "editing",
                  title: appState.data.productName,
                  price: extractPrice(appState.data.price),
                })}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
              >
                Push to Shopify as Draft
              </button>
            ) : shopifyPhase.phase === "editing" ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Product Title</label>
                  <input
                    type="text"
                    value={shopifyPhase.title}
                    onChange={(e) => setShopifyPhase({ phase: "editing", title: e.target.value, price: (shopifyPhase as { phase: "editing"; title: string; price: string }).price })}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Price (AUD)</label>
                  <input
                    type="text"
                    value={shopifyPhase.price}
                    onChange={(e) => setShopifyPhase({ phase: "editing", title: (shopifyPhase as { phase: "editing"; title: string; price: string }).title, price: e.target.value })}
                    placeholder="49.99"
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShopifyPhase({ phase: "idle" })}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
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
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Review &amp; Confirm →
                  </button>
                </div>
              </div>
            ) : shopifyPhase.phase === "confirming" ? (
              <div className="flex flex-col gap-3">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-sm">
                  <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">Push to Shopify as draft?</p>
                  <p className="text-gray-600 dark:text-gray-400">Title: <span className="font-medium text-gray-900 dark:text-gray-100">&ldquo;{shopifyPhase.title}&rdquo;</span></p>
                  <p className="text-gray-600 dark:text-gray-400">Price: <span className="font-medium text-gray-900 dark:text-gray-100">${shopifyPhase.price} AUD</span></p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (shopifyPhase.phase === "confirming") {
                        setShopifyPhase({ phase: "editing", title: shopifyPhase.title, price: shopifyPhase.price });
                      }
                    }}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    &larr; Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (shopifyPhase.phase === "confirming") {
                        handleShopifyPush(shopifyPhase.title, shopifyPhase.price);
                      }
                    }}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  >
                    ✓ Confirm Push
                  </button>
                </div>
              </div>
            ) : shopifyPhase.phase === "pushing" ? (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                Creating draft product...
              </div>
            ) : shopifyPhase.phase === "done" ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">✓ Draft created!</p>
                <div className="flex gap-2">
                  <a
                    href={shopifyPhase.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  >
                    View in Shopify Admin ↗
                  </a>
                  <button
                    type="button"
                    onClick={() => setShopifyPhase({ phase: "idle" })}
                    className="text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
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
                  className="self-start text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Try again
                </button>
              </div>
            ) : null}
          </div>

          <button
            onClick={() => {
              setAppState({ phase: "idle" });
              setBarcode("");
              setManualUrl("");
              setManualHtml("");
            }}
            className="self-start text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
          >
            Start over
          </button>
        </div>
      )}
    </main>
  );
}
