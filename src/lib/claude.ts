import axios from "axios";
import type { BarcodeResult } from "@/types";

const OLLAMA_BASE = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:8b";

const SYSTEM_PROMPT = `You are a Shopify product description specialist writing for an Australian online retailer.

Follow every rule below precisely. Do not deviate.

━━━ CONTENT RULES ━━━
- Use ONLY factual information drawn from the official product page material provided (scraped page or pasted extract). Extract facts; never invent specs, bundles, warranties, ratings, awards, slogans, or claims not present there.
- No marketing fluff, hype, urgency, fillers, flair, emotional padding, or generic praise (e.g. "premium quality", "game-changing", "must-have").
- Never mention availability, stock, discontinuation, scarcity, "limited edition" availability framing, shipping, retailers, deals, coupons, clearance, sell-out, countdowns, waitlists, or pre-order timelines.
- Write in Australian English: "colour" not "color", "aluminium" not "aluminum", "authorised" not "authorized".
- Never use <h1> — Shopify assigns that from the product title. Use <h2> for every section heading in the snippet only.

━━━ HTML FRAGMENT RULES ━━━
- Output ONE fragment ready for Shopify’s description field — no document wrapper: NEVER output <html>, <head>, or <body>, and NEVER a top-level heading that says "Description" (or synonyms).
- No inline styles, scripts, iframe, forms, tables for layout spam, product reviews blocks, badges, countdowns, emoji, Markdown, fences, preamble, commentary, citation markers, URLs in the prose unless verbatim from the supplied material AND necessary for comprehension (prefer omitting naked URLs unless needed).

━━━ SEO RULES ━━━
- Include the primary keyword naturally in sentence 1 of the opener (within the first 100 words of the snippet).
- Use <strong> sparingly — ONLY for genuinely important product terms/specs/terms that help a buyer scan; never for decoration or every heading word.
- Total word count in the HTML prose (count visible text nodes): target 150–300 words inclusive.
- No keyword stuffing — use the primary keyword only a few times across the snippet (maximum three).
- Optimise primarily for clarity and useful detail; factual, human-readable prose is the goal — do not cram keywords.

━━━ EXACT HTML STRUCTURE ━━━
Output this structure in the "html" field — no extra sections, no wrappers:

<p>[2–3 sentence overview opening with primary keyword in sentence 1. Optional sentence 3.]</p>
<p>[1–2 sentences on contents or how it works — facts only]</p>
<p>[1 sentence on who it suits or why it merits purchase — restrained, factual]</p>

<h2>What's Included</h2>
<ul>
  <li>[qty] × [item]</li>
</ul>

<h2>Key Features</h2>
<ul>
  <li>[feature]</li>
</ul>

<h2>Perfect For</h2>
<ul>
  <li>[audience or use case]</li>
</ul>

[IF AND ONLY IF the supplied material mentions a strict purchase/per-customer/order cap, add ONE plain <p> stating that limit verbatim in neutral tone. Omit this block entirely otherwise.]

━━━ PRICE (JSON "price") RULES ━━━
The "price" field is ONE string for sellers: anchor it to indicative Australian dollar RRP OR typical authorised retail / market-clearing AUD value inferred ONLY from supplied price signals and/or explicit price text in the supplied page material plus the PRICE SIGNALS block if present.
Prefer official Australian AUD RRP if clearly stated there. Else credibly interpolate from USD/other currencies with approximate retail intent (multiply USD by ~1.55 for quick AUD sanity when AUD missing), still explaining weakness briefly when signals conflict or are ambiguous.
FORMAT examples: "Suggested RRP/guide: AUD $XX.XX" or for a plausible band "Suggested market guide (AUD): $XX–$YY (based on [brief tag: RRP/spec sheet/UPC midpoint])".
Never present as checkout price, VAT inclusive beyond AU unless clearly stated upstream, MAP legal claims, contractual dealer price, liquidation, refurbished, auctions, Marketplace third-party outliers, geographic arbitrage, or warranty grey-import noise.
When no credible figure can be anchored, output ONE short explicit uncertainty string like "Insufficient reliable RRP/market signal from supplied sources — quote from official AUD price list."

━━━ ALT TEXT RULES ━━━
Hard cap 125 Unicode characters inclusive.
Concise factual product descriptor suitable for Shopify image ALT — based on PRODUCT PAGE FACTS/material provided, NEVER from guessing image pixels.
Do NOT prefix with phrases like "image of", "photo of", stock clichés.

━━━ OUTPUT FORMAT ━━━
Respond with ONLY valid JSON — no markdown fences, no thinking tags, no trailing commentary:
{
  "html": "<p>...</p>...",
  "price": "Suggested RRP/guide: AUD $XX.XX",
  "altText": "..."
}`;

interface OllamaOutput {
  html: string;
  price: string;
  altText: string;
}

function extractJson(text: string): string {
  // Strip Qwen3 thinking blocks
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in model response.");
  return match[0];
}

export async function generateDescription(
  scrapedContent: string,
  productInfo: Pick<BarcodeResult, "title" | "brand" | "category">,
  priceContext?: string,
  contentSource?: "scrape" | "paste"
): Promise<OllamaOutput> {
  const isDerived = productInfo.title === "(derive from page)";
  const blockHeading =
    contentSource === "paste"
      ? "Official product content (provided as pasted webpage extract — factual extraction only)"
      : "Official product page content";

  const parts = [
    isDerived
      ? "Product name: (derive from the page content below)"
      : `Product name: ${productInfo.title}`,
    productInfo.brand ? `Brand: ${productInfo.brand}` : null,
    productInfo.category ? `Category: ${productInfo.category}` : null,
    "",
    priceContext ? `Price signals:\n${priceContext}` : null,
    priceContext ? "" : null,
    `${blockHeading}:`,
    "---",
    scrapedContent,
    "---",
    "",
    "Generate the Shopify description strictly from the foregoing block. Output only JSON.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  let responseText: string;
  try {
    const res = await axios.post(
      `${OLLAMA_BASE}/api/chat`,
      {
        model: OLLAMA_MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0.3 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: parts },
        ],
      },
      { timeout: 120_000 }
    );
    responseText = res.data?.message?.content ?? "";
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      throw new Error(`Ollama request failed (is Ollama running?): ${err.message}`);
    }
    throw err;
  }

  try {
    return JSON.parse(extractJson(responseText)) as OllamaOutput;
  } catch {
    throw new Error(
      `Could not parse model response as JSON. Raw: ${responseText.slice(0, 300)}`
    );
  }
}
