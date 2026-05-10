# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShopifyAutoLister generates Shopify-ready product descriptions from a barcode number. The user pastes a barcode, the app finds the official product page, scrapes it, and uses Claude to produce SEO-optimised HTML output (description, suggested price, alt text) ready to paste into Shopify.

Shopify API integration is planned but not yet implemented — the current MVP is output-only.

## Tech Stack

- **Next.js 14** — App Router, TypeScript, Tailwind CSS
- **`@anthropic-ai/sdk`** — Claude `claude-sonnet-4-6` for description generation (system prompt cached)
- **`axios` + `cheerio`** — HTTP fetch and HTML parsing for web scraping
- **UPC Item DB** — free barcode lookup API (no key, 100 req/day)
- **DuckDuckGo HTML** — finds the official product page from a product name (free, no key)

## Running locally

```bash
npm run dev     # http://localhost:3000
npm run build   # production build
```

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | From console.anthropic.com |

## Source layout

```
src/
  types/index.ts          — shared TypeScript interfaces
  lib/
    barcode.ts            — UPC Item DB lookup
    search.ts             — Brave Search API
    scraper.ts            — axios + cheerio page scraper
    claude.ts             — Claude API description generator
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
