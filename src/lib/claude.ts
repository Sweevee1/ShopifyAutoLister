import axios from "axios";
import type { BarcodeResult } from "@/types";

const OLLAMA_BASE = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3-vl:30b";

const SYSTEM_PROMPT = `You are a Shopify product description specialist writing for an Australian online retailer.

RULES — follow every rule precisely:

CONTENT RULES
- Extract information ONLY from the official product page content provided. Do not add, invent, or pad anything.
- Never mention availability, stock levels, discontinuation, or scarcity. The seller determines that.
- Write in Australian English (e.g., "colour" not "color", "aluminium" not "aluminum", "authorised" not "authorized").
- Identify the product's RRP or typical market value from the content and note it as the suggested price.
- Output clean HTML for Shopify's description field — no <html>, <head>, or <body> wrappers. No "Description" heading.
- Also provide a short alt text suggestion for the main product image (under 125 characters, descriptive, no "image of").

SEO RULES
- Use <h2> for ALL section headings. NEVER use <h1> — Shopify assigns h1 to the product title.
- Place the primary keyword naturally in the first sentence (within the first 100 words).
- Use <strong> sparingly — only for genuinely critical terms or specs, not decorative emphasis.
- Total word count: 150–300 words.
- No keyword stuffing. Use the primary keyword a maximum of 3 times.
- Write for humans first; clarity is what search engines reward.

REQUIRED HTML STRUCTURE:
[2–3 sentence overview — primary keyword in sentence 1]
[1–2 sentences on contents or how it works]
[1 sentence on who it suits or why it's worth buying]

<h2>What's Included</h2>
<ul><li>[qty] × [item]</li></ul>

<h2>Key Features</h2>
<ul><li>[feature]</li></ul>

<h2>Perfect For</h2>
<ul><li>[audience or use case]</li></ul>

[Purchase limit paragraph ONLY if official page mentions one. Otherwise omit entirely.]

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences, no extra text, no thinking tags:
{ "html": "...", "price": "AUD $XX.XX", "altText": "..." }

If price cannot be determined: "price": "Price not found — check official site"
If a section has no applicable content, omit that section entirely.`;

interface ClaudeOutput {
  html: string;
  price: string;
  altText: string;
}

function extractJson(text: string): string {
  // Strip Qwen3 thinking blocks: <think>...</think>
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  // Extract first JSON object
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in model response.");
  return match[0];
}

export async function generateDescription(
  scrapedContent: string,
  productInfo: Pick<BarcodeResult, "title" | "brand" | "category">
): Promise<ClaudeOutput> {
  const isDerived = productInfo.title === "(derive from page)";
  const productLine = isDerived
    ? "Product name: (derive from the page content below)"
    : `Product name: ${productInfo.title}`;

  const userMessage = [
    productLine,
    productInfo.brand ? `Brand: ${productInfo.brand}` : null,
    productInfo.category ? `Category: ${productInfo.category}` : null,
    "",
    "Official product page content:",
    "---",
    scrapedContent,
    "---",
    "",
    "Generate the Shopify description following your system rules exactly. Output only JSON.",
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
          { role: "user", content: userMessage },
        ],
      },
      { timeout: 120_000 }
    );
    responseText = res.data?.message?.content ?? "";
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      throw new Error(
        `Ollama request failed (is Ollama running?): ${err.message}`
      );
    }
    throw err;
  }

  try {
    return JSON.parse(extractJson(responseText)) as ClaudeOutput;
  } catch {
    throw new Error(
      `Could not parse model response as JSON. Raw output: ${responseText.slice(0, 200)}`
    );
  }
}
