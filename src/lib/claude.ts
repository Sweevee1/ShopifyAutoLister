import Anthropic from "@anthropic-ai/sdk";
import type { BarcodeResult } from "@/types";

const OLLAMA_BASE = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:8b";
const CLAUDE_API_MODEL = process.env.CLAUDE_MODEL ?? "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are a Shopify product description specialist writing for an Australian online retailer.

Follow every rule below precisely. Do not deviate.

━━━ CONTENT RULES ━━━
- Use ONLY factual information drawn from the official product page material provided (scraped page or pasted extract). Extract facts; never invent specs, bundles, warranties, ratings, awards, slogans, or claims not present there.
- No marketing fluff, hype, urgency, fillers, flair, emotional padding, or generic praise (e.g. "premium quality", "game-changing", "must-have").
- Never mention availability, stock, discontinuation, scarcity, "limited edition" availability framing, shipping, retailers, deals, coupons, clearance, sell-out, countdowns, waitlists, or pre-order timelines.
- Write in Australian English: "colour" not "color", "aluminium" not "aluminum", "authorised" not "authorized".
- Never use <h1> — Shopify assigns that from the product title. Use <h2> for every section heading in the snippet only.

━━━ HTML FRAGMENT RULES ━━━
- Output ONE fragment ready for Shopify's description field — no document wrapper: NEVER output <html>, <head>, or <body>, and NEVER a top-level heading that says "Description" (or synonyms).
- No inline styles, scripts, iframe, forms, tables for layout spam, product reviews blocks, badges, countdowns, emoji, Markdown, fences, preamble, commentary, citation markers, URLs in the prose unless verbatim from the supplied material AND necessary for comprehension (prefer omitting naked URLs unless needed).

━━━ SEO RULES ━━━
- Include the primary keyword naturally in sentence 1 of the opener (within the first 100 words of the snippet).
- Use <strong> sparingly — ONLY for genuinely important product terms/specs/terms that help a buyer scan; never for decoration or every heading word.
- Total word count in the HTML prose (count visible text nodes): target 150–300 words inclusive.
- No keyword stuffing — use the primary keyword only a few times across the snippet (maximum three).
- Optimise primarily for clarity and useful detail; factual, human-readable prose is the goal — do not cram keywords.

━━━ EXACT HTML STRUCTURE — MANDATORY ━━━
The "html" value MUST follow this skeleton exactly — same tags, same order, no additions, no omissions:

<p>OVERVIEW SENTENCE 1 WITH PRIMARY KEYWORD. OVERVIEW SENTENCE 2. OPTIONAL SENTENCE 3.</p>
<p>CONTENTS OR HOW IT WORKS — 1 TO 2 SENTENCES, FACTS ONLY.</p>
<p>WHO IT SUITS OR WHY WORTH BUYING — 1 SENTENCE, RESTRAINED.</p>
<h2>What's Included</h2>
<ul>
<li>QTY × ITEM</li>
</ul>
<h2>Key Features</h2>
<ul>
<li>FEATURE</li>
</ul>
<h2>Perfect For</h2>
<ul>
<li>AUDIENCE OR USE CASE</li>
</ul>

Rules for the lists:
- Each <li> is one item only. Add as many <li> entries as the source material supports.
- Do NOT merge multiple items into one <li>.
- Do NOT wrap list items in <p> tags.
- Do NOT add any section beyond the three <h2> blocks above, except one optional purchase-limit <p> if and only if the supplied material explicitly states a per-customer order cap.

WORKED EXAMPLE (fictional product — illustrates format only):
<p>The Acme Pro Wireless Keyboard is a full-size Bluetooth keyboard designed for multi-device productivity. It pairs with up to three devices simultaneously and switches between them with a single keystroke. Compact yet full-featured, it suits both office and home setups.</p>
<p>The keyboard uses <strong>rechargeable AAA batteries</strong> with up to 12 months of battery life per charge. It connects via Bluetooth 5.0 or the included 2.4 GHz USB receiver.</p>
<p>A practical choice for anyone who regularly switches between a laptop, tablet, and desktop.</p>
<h2>What's Included</h2>
<ul>
<li>1 × Acme Pro Wireless Keyboard</li>
<li>1 × 2.4 GHz USB receiver</li>
<li>1 × USB-C charging cable</li>
</ul>
<h2>Key Features</h2>
<ul>
<li>Bluetooth 5.0 — connects up to 3 devices</li>
<li>12-month rechargeable battery life</li>
<li>Full-size layout with numpad</li>
</ul>
<h2>Perfect For</h2>
<ul>
<li>Multi-device home and office users</li>
<li>Remote workers and students</li>
</ul>

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

export interface OllamaOutput {
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

function buildPromptParts(
  scrapedContent: string,
  productInfo: Pick<BarcodeResult, "title" | "brand" | "category">,
  priceContext?: string,
  contentSource?: "scrape" | "paste" | "image"
): string {
  const isDerived = productInfo.title === "(derive from page)";
  const isImageOnly = contentSource === "image";

  const blockHeading = isImageOnly
    ? "Note (no product page available — identify product from the attached image)"
    : contentSource === "paste"
    ? "Official product content (provided as pasted webpage extract — factual extraction only)"
    : "Official product page content";

  const finalInstruction = isImageOnly
    ? "Identify the product from the attached image and generate the Shopify description based on what you can see. Output only JSON."
    : "Generate the Shopify description strictly from the foregoing block. Output only JSON.";

  return [
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
    finalInstruction,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export async function* streamDescription(
  scrapedContent: string,
  productInfo: Pick<BarcodeResult, "title" | "brand" | "category">,
  priceContext?: string,
  contentSource?: "scrape" | "paste" | "image",
  claudeApiKey?: string,
  imageBase64?: string
): AsyncGenerator<string> {
  const parts = buildPromptParts(scrapedContent, productInfo, priceContext, contentSource);

  if (claudeApiKey) {
    yield* streamWithClaudeApi(parts, claudeApiKey, imageBase64);
  } else {
    yield* streamWithOllama(parts);
  }
}

async function* streamWithClaudeApi(parts: string, apiKey: string, imageBase64?: string): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey });

  const userContent: Anthropic.MessageParam["content"] = imageBase64
    ? [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
        { type: "text", text: `A product image is attached — use it to supplement the page content where it helps identify features, colours, or included items.\n\n${parts}` },
      ]
    : parts;

  try {
    const stream = client.messages.stream({
      model: CLAUDE_API_MODEL,
      max_tokens: 2048,
      temperature: 0.1,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
  } catch (err: unknown) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new Error("Invalid Claude API key — check your key in Settings.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new Error("Claude API rate limit reached — please try again later.");
    }
    throw new Error(`Claude API request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function* streamWithOllama(parts: string): AsyncGenerator<string> {
  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: true,
        format: "json",
        options: { temperature: 0.1 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: parts },
        ],
      }),
      signal: AbortSignal.timeout(300_000),
    });
  } catch (err: unknown) {
    throw new Error(`Ollama request failed (is Ollama running?): ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    throw new Error(`Ollama request failed with status ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line) as { message?: { content?: string } };
        const token = obj.message?.content ?? "";
        if (token) yield token;
      } catch {
        // skip malformed lines
      }
    }
  }
  if (buffer.trim()) {
    try {
      const obj = JSON.parse(buffer) as { message?: { content?: string } };
      const token = obj.message?.content ?? "";
      if (token) yield token;
    } catch {
      // skip
    }
  }
}

export function parseOutput(fullText: string): OllamaOutput {
  try {
    return JSON.parse(extractJson(fullText)) as OllamaOutput;
  } catch {
    throw new Error(
      `Could not parse model response as JSON. Raw: ${fullText.slice(0, 300)}`
    );
  }
}
