# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShopifyAutoLister generates Shopify-ready product descriptions from a barcode number. The user pastes a barcode, the app finds the official product page, scrapes it, and uses Claude to produce SEO-optimised HTML output (description, suggested price, alt text) ready to paste into Shopify.

Shopify API integration is planned but not yet implemented — the current MVP is output-only.

## Tech Stack

- **Next.js 14** — App Router, TypeScript, Tailwind CSS
- **Ollama** (`qwen3:8b`) — local AI for description generation, no paid API key required
- **`axios` + `cheerio`** — HTTP fetch and HTML parsing for web scraping
- **UPC Item DB** — free barcode lookup API (no key, 100 req/day)
- **Open Food Facts** — supplementary barcode source; often returns the official manufacturer URL directly
- **Tavily** — finds the official product page from a product name (free 1,000/month with key from app.tavily.com)

## Running locally

```bash
npm run dev     # http://localhost:3000
npm run build   # production build
```

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `TAVILY_API_KEY` (optional) | From app.tavily.com — enables auto product page search (1,000 free/month) |
| `OLLAMA_HOST` (optional) | Ollama API base URL, defaults to `http://localhost:11434` |
| `OLLAMA_MODEL` (optional) | Model to use, defaults to `qwen3:8b` |

No paid API key is required. Ollama must be running locally (`ollama serve`) with the model pulled (`ollama pull qwen3:8b`).

## Source layout

```
src/
  types/index.ts          — shared TypeScript interfaces
  lib/
    barcode.ts            — UPC Item DB + Open Food Facts parallel lookup
    search.ts             — Tavily search for official product page
    scraper.ts            — axios + cheerio page scraper
    claude.ts             — Ollama (qwen3:8b) description generator
    price.ts              — multi-source price signal gathering
  app/
    layout.tsx            — root layout
    page.tsx              — main UI (client component)
    api/lookup/route.ts   — POST endpoint orchestrating all services
```

## GitHub Sync

This project auto-syncs with GitHub via hooks configured in `.claude/settings.json`:

- **On session start** — `git pull --rebase` runs automatically to pull the latest changes.
- **On session end** — any uncommitted changes are committed as "Auto-save from Claude Code session" and pushed.

This means the same behaviour applies on any device that clones this repo — the hooks are committed and shared.

`.claude/settings.local.json` is gitignored (machine-specific permissions); `.claude/settings.json` is committed (shared hooks).

## Environment

Secrets and credentials live in `.env` (gitignored). Never commit `.env`, `credentials.json`, or any `*.pem`/`*.key` files.
