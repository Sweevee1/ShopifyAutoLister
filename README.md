# Shopify Auto-Lister

Paste a barcode (or SKU, or a product URL) and get a Shopify-ready product listing in about two minutes — SEO-optimised HTML description, a suggested AUD price, and image alt text, all generated locally on your machine for free.

---

## How it works

```
Barcode / SKU / URL
        │
        ▼
1. Barcode lookup ──── UPC Item DB + Open Food Facts (parallel)
        │               → product name, brand, category, price range
        │               → official manufacturer URL (when available)
        │
        ▼
2. Product page search ── Tavily (if no URL yet)
        │               → finds the official manufacturer page
        │               → skips retailers, marketplaces, social media
        │
        ▼
3. Page scrape ────── Jina Reader (handles JS SPAs)  ──► fallback
        │               → clean text extraction                │
        │                                               Cheerio (static HTML)
        │                                               + JSON-LD + meta tags
        │
        ▼
4. Price signals ──── Tavily web search
        │               → Australian RRP mentions, web price context
        │               → combined with UPC price range from step 1
        │
        ▼
5. AI generation ──── Ollama (local, qwen3:8b)
                        → streams JSON: HTML description, price, alt text
                        → strict prompt: factual, Australian English, no fluff
                        → output is a Shopify-ready HTML fragment
```

The entire pipeline runs in a single POST to `/api/lookup`, which streams NDJSON back to the browser so you see the AI output token-by-token as it generates.

After generation, you can **Push to Shopify** directly from the UI — it creates a draft product via the Shopify Admin API.

---

## Input options

| Input | When to use |
|---|---|
| **Barcode** (UPC / EAN / ISBN) | Most products — looks up name and brand automatically |
| **SKU / model number** | When you have a part number but no barcode |
| **Product page URL** | Skip lookup/search; scrape directly from a known URL |
| **Pasted page HTML** | Fallback when the live URL is blocked by Cloudflare or requires JS login |

You can combine inputs — e.g. supply a barcode *and* a URL to skip the Tavily search step.

---

## External services connected

| Service | Purpose | Cost | Key required |
|---|---|---|---|
| **UPC Item DB** | Barcode → product name, brand, price range | Free, 100 req/day | No |
| **Open Food Facts** | Supplementary barcode source; often has official manufacturer URL | Free, unlimited | No |
| **Jina Reader** (`r.jina.ai`) | Renders JavaScript SPAs and returns clean text | Free | No |
| **Tavily** | Finds the official product page from a product name; also gathers AUD price signals | Free 1,000/month | Yes — `tvly-...` key from [app.tavily.com](https://app.tavily.com) |
| **Ollama** | Runs the AI model locally — generates the Shopify description | Free (runs on your PC) | No |
| **Shopify Admin API** | Creates draft products in your store | Free (requires store) | Admin API token |

Tavily and Shopify credentials are optional — the app works without them (you can paste a URL or HTML manually, and copy the output instead of pushing).

---

## PC requirements

### Minimum (CPU-only)

- **RAM:** 8 GB system RAM minimum; 16 GB recommended
- **CPU:** Any modern x64 CPU (Intel or AMD)
- **GPU:** Not required — the app runs on CPU by default
- **Storage:** ~6 GB for the `qwen3:8b` model weights
- **Note:** CPU inference is slow — expect **2–3 minutes** per generation. The UI shows a live timer and progress bar during this step.

### Recommended (GPU-accelerated)

- **GPU:** NVIDIA card with 8 GB+ VRAM (RTX 3070 / RTX 4060 or better)
- **CUDA:** CUDA 12.x drivers installed
- **RAM:** 16 GB system RAM
- **Storage:** ~6 GB for the `qwen3:8b` model weights
- GPU inference is typically **10–30× faster** than CPU — under 10 seconds per generation on a modern card

Ollama automatically detects and uses your GPU if CUDA is available. No extra configuration needed.

### Software

- **Node.js** 18+ (for the Next.js app)
- **Ollama** — download from [ollama.com](https://ollama.com), then pull the model:

```bash
ollama pull qwen3:8b
ollama serve
```

---

## Setup

```bash
# 1. Clone and install
git clone https://github.com/Sweevee1/ShopifyAutoLister.git
cd ShopifyAutoLister
npm install

# 2. Environment
copy .env.example .env
# Edit .env — add TAVILY_API_KEY if you have one (optional)

# 3. Start Ollama in a separate terminal
ollama serve

# 4. Run the app
npm run dev
# → http://localhost:3000
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `TAVILY_API_KEY` | _(none)_ | Enables automatic product page search and AUD price signals. Free key from [app.tavily.com](https://app.tavily.com) (1,000/month). Can also be entered in the app's Settings panel — stored in your browser only. |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API base URL. Change if Ollama is running on a different port or machine. |
| `OLLAMA_MODEL` | `qwen3:8b` | Model to use for generation. Other Ollama models will work but the prompt is tuned for Qwen3. |

---

## API rate limits

| Service | Limit | Tracked |
|---|---|---|
| UPC Item DB | 100 lookups / day (free tier) | Shown in Settings panel |
| Tavily | 1,000 searches / month (free tier) | Shown in Settings panel |
| Open Food Facts | Generous / no hard limit | Not tracked |

The Settings panel shows your current UPC and Tavily usage at a glance.

---

## What the output looks like

For each product the app generates:

- **Shopify HTML** — a structured description fragment ready to paste into the Shopify product description field. Includes overview paragraphs, _What's Included_, _Key Features_, and _Perfect For_ sections.
- **Suggested price** — an AUD RRP estimate anchored to official price signals and web mentions, with a brief confidence note.
- **Alt text** — a factual image alt tag under 125 characters, suitable for Shopify's image alt field.

All output follows strict rules: Australian English, no marketing fluff, no invented specs, no inline styles, no `<h1>` tags, and 150–300 words of visible prose.

---

## Project structure

```
src/
  types/index.ts              — shared TypeScript interfaces
  lib/
    barcode.ts                — UPC Item DB + Open Food Facts parallel lookup
    search.ts                 — Tavily search for official product page
    scraper.ts                — Jina Reader + cheerio fallback page scraper
    claude.ts                 — Ollama streaming description generator
    price.ts                  — multi-source AUD price signal gathering
  app/
    page.tsx                  — main UI (client component)
    api/
      lookup/route.ts         — POST endpoint orchestrating the full pipeline
      ollama-status/route.ts  — Ollama health check (polled every 15s by UI)
      tavily-usage/route.ts   — Tavily usage proxy
      shopify/route.ts        — Shopify Admin API draft product creation
```
