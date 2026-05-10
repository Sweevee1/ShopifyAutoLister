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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
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

const ERROR_CODES_NEEDING_URL = new Set([
  "BARCODE_NOT_FOUND",
  "BARCODE_RATE_LIMIT",
  "PAGE_BLOCKED",
  "PAGE_EMPTY",
  "SEARCH_FAILED",
]);

export default function Home() {
  const [barcode, setBarcode] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [appState, setAppState] = useState<AppState>({ phase: "idle" });
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  function clearStepTimer() {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }

  useEffect(() => () => clearStepTimer(), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!barcode.trim() && !manualUrl.trim()) return;

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
        }),
      });

      clearStepTimer();
      const json = await res.json();

      if (!res.ok) {
        setAppState({
          phase: "error",
          data: json as LookupError,
        });
        if (ERROR_CODES_NEEDING_URL.has((json as LookupError).errorCode)) {
          setTimeout(() => urlInputRef.current?.focus(), 100);
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

  const needsUrl =
    appState.phase === "error" &&
    ERROR_CODES_NEEDING_URL.has(appState.data.errorCode);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Shopify Auto-Lister</h1>
        <p className="text-gray-500 text-sm mt-1">
          Paste a barcode to generate a Shopify-ready product description.
        </p>
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
              needsUrl ? "text-blue-600" : "text-gray-700"
            }`}
          >
            Or paste the official product page URL
            {!needsUrl && (
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
              needsUrl
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
                Then paste the URL above and click Look Up again.
              </p>
            </div>
          )}
        </div>
      )}

      {appState.phase === "success" && (
        <div className="mt-8 flex flex-col gap-6">

          {/* Source link */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">Source:</span>
            <a
              href={appState.data.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline truncate"
            >
              {appState.data.sourceUrl}
            </a>
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

          {/* Divider + metadata — matches user's spec exactly */}
          <div className="border-t border-gray-300 pt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Suggested price:</span>{" "}
                <span className="text-green-700 font-bold">{appState.data.price}</span>
              </p>
            </div>
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm text-gray-700">
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
