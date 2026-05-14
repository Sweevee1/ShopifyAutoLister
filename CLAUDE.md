# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShopifyAutoLister generates Shopify-ready product listings from a product image, barcode, or URL. The user provides one or more inputs, the app looks up the product, scrapes the official page, and uses AI to produce SEO-optimised HTML output (description, suggested AUD price, alt text) ready to push directly to Shopify as a draft product.

Shopify API integration is implemented — products are always created as **drafts** so the user can review and edit in the Shopify admin before publishing.

## Tech Stack

- **Next.js 14** — App Router, TypeScript, Tailwind CSS
- **Ollama** (`qwen3:8b`) — local AI, text-only (no image support)
- **Claude API** (`claude-haiku-4-5` default) — cloud AI with vision support; model configurable via `CLAUDE_MODEL` env var
- **`axios` + `cheerio`** — HTTP fetch and HTML parsing for web scraping
- **Jina Reader** (`r.jina.ai`) — primary scraper; handles JS-rendered SPAs
- **UPC Item DB + Open Food Facts** — parallel barcode lookup (no key, 100 req/day)
- **Tavily** — finds the official product page from a barcode lookup result; only needed for barcode input

## Running locally

```bash
npm run dev     # http://localhost:3000
npm run build   # production build
```

**Launcher scripts** (double-click to run, opens browser automatically):
- **Windows:** `Start.bat`
- **Mac/Linux:** `./start.sh`

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Default | Description |
|---|---|---|
| `TAVILY_API_KEY` | _(none)_ | From app.tavily.com — only needed for barcode input (1,000 free/month) |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `qwen3:8b` | Ollama model to use |
| `CLAUDE_MODEL` | `claude-haiku-4-5` | Claude API model (used when Claude API key is entered in Settings) |

API keys for Tavily, Claude, and Shopify can also be entered in the app's Settings panel — stored in browser localStorage only, never committed.

## Source layout

```
src/
  types/index.ts              — shared TypeScript interfaces
  lib/
    barcode.ts                — UPC Item DB + Open Food Facts parallel lookup
    search.ts                 — Tavily search for official product page
    scraper.ts                — Jina Reader + cheerio fallback page scraper
    claude.ts                 — Ollama + Claude API streaming description generator
    price.ts                  — multi-source AUD price signal gathering
    shopify.ts                — Shopify Admin API draft product creation
  app/
    layout.tsx                — root layout
    page.tsx                  — main UI (client component)
    api/
      lookup/route.ts         — POST endpoint orchestrating the full pipeline
      ollama-status/route.ts  — Ollama health check (polled every 15s by UI)
      tavily-usage/route.ts   — Tavily usage proxy
      shopify/route.ts        — Shopify draft product push endpoint
```

## Key behaviours

- **Image-only flow** — if only an image is provided (no barcode/URL), skips all lookup/scrape steps; Claude identifies the product from the image alone. Requires Claude API (Ollama has no vision support).
- **Image resize** — images are resized client-side to fit within 800×800px before being sent to the AI.
- **AI provider toggle** — user selects Ollama or Claude API in Settings. Choice persists in localStorage.
- **Shopify push** — always creates products as `status: "draft"`. Never publishes directly.
- **Tavily** — only required when using barcode input to find the official product page. Not needed for image or URL input.

## GitHub Sync

This project auto-syncs with GitHub via hooks configured in `.claude/settings.json`:

- **On session start** — `git pull --rebase` runs automatically to pull the latest changes.
- **On session end** — any uncommitted changes are committed as "Auto-save from Claude Code session" and pushed.

`.claude/settings.local.json` is gitignored (machine-specific permissions); `.claude/settings.json` is committed (shared hooks).

## Environment

Secrets and credentials live in `.env` (gitignored). Never commit `.env`, `credentials.json`, or any `*.pem`/`*.key` files.
