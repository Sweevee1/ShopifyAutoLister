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
  | { phase: "success"; data: LookupResponse }
  | { phase: "error"; data: LookupError; attemptedUrl?: string };

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
      className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

function StepIndicator({ stepIndex }: { stepIndex: number }) {
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
                  : "bg-gray-200 text-gray-400"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={`text-sm ${
                done
                  ? "text-green-600"
                  : active
                  ? "text-blue-600 font-medium"
                  : "text-gray-400"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
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

export default function Home() {
  const [barcode, setBarcode] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualHtml, setManualHtml] = useState("");
  const [appState, setAppState] = useState<AppState>({ phase: "idle" });
  const [tavilyKey, setTavilyKey] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const pastedHtmlRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(TAVILY_KEY_STORAGE) ?? "";
    setTavilyKey(saved);
    setSettingsOpen(!saved);
  }, []);

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
      const json = await res.json();

      if (!res.ok) {
        setAppState({
          phase: "error",
          data: json as LookupError,
        });
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
      } else {
        setAppState({ phase: "success", data: json as LookupResponse });
      }
    } catch {
      clearStepTimer();
      setAppState({
        phase: "error",
        data: {
          error: "Network error — could not reach the server.",
          errorCode: "NETWORK_ERROR",
        },
      });
    }
  }

  const needsFallbackHelp =
    appState.phase === "error" &&
    ERROR_CODES_NEEDING_FALLBACK.has(appState.data.errorCode);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Shopify Auto-Lister</h1>
        <p className="text-gray-500 text-sm mt-1">
          Paste a barcode to generate a Shopify-ready product description.
        </p>
      </div>

      {/* Settings */}
      <div className="mb-6 border border-gray-200 rounded-md">
        <button
          type="button"
          onClick={() => setSettingsOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
        >
          <span>Settings</span>
          <span className="text-gray-400 text-xs">
            {tavilyKey ? "Tavily key saved" : "No Tavily key"} {settingsOpen ? "▲" : "▼"}
          </span>
        </button>
        {settingsOpen && (
          <div className="px-4 pb-4 flex flex-col gap-2 border-t border-gray-100 pt-3">
            <label htmlFor="tavilyKey" className="text-sm font-medium text-gray-700">
              Tavily API key
              <span className="text-gray-400 font-normal ml-1">
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
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400">
              Saved in your browser only — never sent anywhere except Tavily during searches.
            </p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="barcode"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
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
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="manualUrl"
            className={`block text-sm font-medium mb-1 ${
              needsFallbackHelp ? "text-blue-600" : "text-gray-700"
            }`}
          >
            Official product page URL
            {!needsFallbackHelp && (
              <span className="text-gray-400 font-normal"> (optional)</span>
            )}
          </label>
          <input
            id="manualUrl"
            ref={urlInputRef}
            type="url"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://www.brand.com/product-name"
            className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
              needsFallbackHelp
                ? "border-blue-400 ring-1 ring-blue-400 focus:ring-blue-500"
                : "border-gray-300 focus:ring-blue-500"
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
                ? "text-blue-600"
                : "text-gray-700"
            }`}
          >
            Or paste saved page HTML
            <span className="text-gray-400 font-normal">
              {" "}
              — View Source / Save Complete webpage (optional fallback)
            </span>
          </label>
          <textarea
            id="manualHtml"
            ref={pastedHtmlRef}
            value={manualHtml}
            onChange={(e) => setManualHtml(e.target.value)}
            placeholder="Paste the official manufacturer product page HTML here if URL fetch fails or loads empty in this tool."
            rows={5}
            className={`w-full border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 resize-y min-h-[6rem] ${
              needsFallbackHelp &&
              appState.phase === "error" &&
              ERROR_CODES_FOCUS_PASTED_HTML.has(appState.data.errorCode)
                ? "border-blue-400 ring-1 ring-blue-400 focus:ring-blue-500"
                : "border-gray-300 focus:ring-blue-500"
            }`}
          />
        </div>

        <button
          type="submit"
          disabled={appState.phase === "loading"}
          className="self-start px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {appState.phase === "loading" ? "Working..." : "Look Up"}
        </button>
      </form>

      {appState.phase === "loading" && (
        <StepIndicator stepIndex={appState.stepIndex} />
      )}

      {appState.phase === "error" && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md space-y-2">
          <p className="text-sm font-medium text-red-800">{appState.data.error}</p>
          {appState.data.hint && (
            <p className="text-sm text-red-600">{appState.data.hint}</p>
          )}
          {appState.data.errorCode === "SEARCH_FAILED" && appState.data.productName && (
            <div className="pt-1">
              <p className="text-xs text-gray-500 mb-1">
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
              <p className="text-xs text-gray-400 mt-1">
                Then paste the official URL above (or pasted page HTML below) and click Look Up again.
              </p>
            </div>
          )}
        </div>
      )}

      {appState.phase === "success" && (
        <div className="mt-8 flex flex-col gap-6">

          {/* Source link — URL when known; pasted-only flow has no clickable href */}
          <div className="flex flex-wrap items-baseline gap-2 text-sm">
            <span className="text-gray-400 shrink-0">Official page:</span>
            {appState.data.sourceUrl ? (
              <a
                href={appState.data.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline truncate"
              >
                {appState.data.sourceUrl}
              </a>
            ) : (
              <span className="text-gray-600">
                pasted HTML only — add the URL field above when available for attribution
              </span>
            )}
          </div>

          {/* Preview */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Preview</p>
            <div
              className="prose prose-sm max-w-none p-5 bg-white border border-gray-200 rounded-md"
              dangerouslySetInnerHTML={{ __html: appState.data.html }}
            />
          </div>

          {/* Raw HTML */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Shopify HTML</p>
              <CopyButton text={appState.data.html} />
            </div>
            <pre className="text-xs bg-gray-900 text-gray-100 p-4 rounded-md overflow-x-auto whitespace-pre-wrap">
              <code>{appState.data.html}</code>
            </pre>
          </div>

          {/* Divider — HTML + --- + price + alt (copy-pack matches listing guidelines) */}
          <div className="border-t border-gray-300 pt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 m-0">
                Copy pack (Shopify HTML + notes)
              </p>
              <CopyButton text={buildCopyPack(appState.data)} label="Copy pack" />
            </div>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <p className="text-sm text-gray-700 m-0">
                <span className="font-medium">Suggested price (RRP / market guide):</span>{" "}
                <span className="text-green-700 font-bold">{appState.data.price}</span>
              </p>
            </div>
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm text-gray-700 m-0">
                <span className="font-medium">Alt text:</span>{" "}
                <span className="text-gray-600">{appState.data.altText}</span>
                <span className="text-xs text-gray-400 ml-2">({appState.data.altText.length}/125)</span>
              </p>
              <CopyButton text={appState.data.altText} />
            </div>
          </div>

          <button
            onClick={() => {
              setAppState({ phase: "idle" });
              setBarcode("");
              setManualUrl("");
              setManualHtml("");
            }}
            className="self-start text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Start over
          </button>
        </div>
      )}
    </main>
  );
}
