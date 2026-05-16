# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Auto-Lister generates platform-ready product listings from a product image, barcode, or URL. The user picks a platform tab (Shopify or eBay), provides one or more inputs, the app looks up the product, scrapes the official page, and uses AI to produce SEO-optimised output ready to push directly to the platform.

- **Shopify tab** — outputs HTML description, suggested AUD price, alt text. Pushes to Shopify as a `status: "draft"` product via the Admin API.
- **eBay tab** — outputs an 80-char eBay title, HTML description, condition, item specifics, and suggested AUD price. Auto-suggests categories via eBay Taxonomy API. Pushes to eBay as a scheduled (draft-like) listing via the Trading API.

## Tech Stack

- **Next.js 16** — App Router, TypeScript, Tailwind CSS
- **Ollama** (`qwen3:8b`) — local AI, text-only (no image support)
- **Claude API** (`claude-sonnet-4-6` default) — cloud AI with vision support; model configurable via `CLAUDE_MODEL` env var
- **`axios` + `cheerio`** — HTTP fetch and HTML parsing for web scraping
- **Jina Reader** (`r.jina.ai`) — primary scraper; handles JS-rendered SPAs
- **UPC Item DB + Open Food Facts** — parallel barcode lookup (no key, 100 req/day)
- **Tavily** — finds the official product page from a barcode lookup result; also gathers AUD price signals
- **Shopify Admin API** — creates draft products
- **eBay Trading API** — creates scheduled (draft) listings; site ID 15 (eBay AU)
- **eBay Taxonomy API** — category suggestions via Client Credentials OAuth (app token, no user token needed)

## Running locally

```bash
npm run dev     # http://localhost:3000
npm run build   # production build
```

**Launcher scripts** (double-click to run, opens browser automatically):
- **Windows:** `Start.bat` — start the app; `Stop.bat` — stop it
- **Mac/Linux:** `./start.sh`

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Default | Description |
|---|---|---|
| `TAVILY_API_KEY` | _(none)_ | From app.tavily.com — only needed for barcode input (1,000 free/month) |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `qwen3:8b` | Ollama model to use |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Claude API model (used when Claude API key is entered in Settings) |
| `EBAY_APP_ID` | _(none)_ | eBay Developer Programme — App ID (Client ID) |
| `EBAY_DEV_ID` | _(none)_ | eBay Developer Programme — Dev ID |
| `EBAY_CERT_ID` | _(none)_ | eBay Developer Programme — Cert ID (Client Secret) |

`EBAY_APP_ID` + `EBAY_CERT_ID` are also used to obtain an Application Token for the Taxonomy API (category suggestions). All three eBay server-side credentials are required for the Trading API push.

API keys for Tavily, Claude, Shopify, and eBay User Token can also be entered in the app's Settings panel — stored in browser localStorage only, never committed.

## Source layout

```
src/
  types/index.ts                 — shared TypeScript interfaces
  lib/
    barcode.ts                   — UPC Item DB + Open Food Facts parallel lookup
    search.ts                    — Tavily search for official product page
    scraper.ts                   — Jina Reader + cheerio fallback page scraper
    claude.ts                    — Ollama + Claude API streaming description generator
                                   (contains both SYSTEM_PROMPT for Shopify and EBAY_SYSTEM_PROMPT)
    price.ts                     — multi-source AUD price signal gathering
    shopify.ts                   — Shopify Admin API draft product creation
    ebay.ts                      — eBay Trading API listing creation + Taxonomy API category suggestions
  app/
    layout.tsx                   — root layout
    page.tsx                     — main UI (client component, both tabs)
    api/
      lookup/route.ts            — POST endpoint orchestrating the full pipeline; accepts platform param
      ollama-status/route.ts     — Ollama health check (polled every 15s by UI)
      tavily-usage/route.ts      — Tavily usage proxy
      shopify/route.ts           — Shopify draft product push endpoint
      ebay/route.ts              — eBay scheduled listing push endpoint
      ebay-categories/route.ts   — GET endpoint for eBay category suggestions (uses Taxonomy API)
```

## Key behaviours

- **Platform tabs** — Shopify and eBay tabs share the same input form and lookup pipeline. Switching tabs resets results. The active tab is passed as `platform` to the lookup API, which selects the correct AI system prompt.
- **Image-only flow** — if only an image is provided (no barcode/URL), skips all lookup/scrape steps; Claude identifies the product from the image alone. Requires Claude API (Ollama has no vision support).
- **Image resize** — images are resized client-side to fit within 800×800px before being sent to the AI.
- **AI provider toggle** — user selects Ollama or Claude API in Settings. Choice persists in localStorage.
- **Shopify push** — always creates products as `status: "draft"`. Never publishes directly.
- **eBay push** — creates a `FixedPriceItem` with `ScheduleTime` 30 days in the future and `ListingDuration: Days_30`. This makes it appear as a "Scheduled" listing in eBay Seller Hub (not live). The user activates it from Seller Hub when ready.
- **eBay category suggestions** — auto-fetched when eBay results appear by calling `/api/ebay-categories`, which uses the Taxonomy API with an app-level OAuth token (Client Credentials grant). Top suggestion is pre-filled; user can pick from chips or type an ID manually.
- **eBay credentials** — `EBAY_APP_ID`, `EBAY_DEV_ID`, `EBAY_CERT_ID` are server-side env vars. The user's eBay User Token is stored in browser localStorage and sent with push requests.
- **Tavily** — only required when using barcode input to find the official product page. Not needed for image or URL input.

## GitHub Sync

This project auto-syncs with GitHub via hooks configured in `.claude/settings.json`:

- **On session start** — `git pull --rebase` runs automatically to pull the latest changes.
- **On session end** — any uncommitted changes are committed as "Auto-save from Claude Code session" and pushed.

`.claude/settings.local.json` is gitignored (machine-specific permissions); `.claude/settings.json` is committed (shared hooks).

## Environment

Secrets and credentials live in `.env` (gitignored). Never commit `.env`, `credentials.json`, or any `*.pem`/`*.key` files.
