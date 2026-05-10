import axios from "axios";
import type { BarcodeResult } from "@/types";

const OLLAMA_BASE = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:8b";

const SYSTEM_PROMPT = `You are a Shopify product description specialist writing for an Australian online retailer.

Follow every rule below precisely. Do not deviate.

━━━ CONTENT RULES ━━━
- Use ONLY information from the product page content provided. Never invent or pad.
- Never mention availability, stock, discontinuation, or scarcity.
- Write in Australian English: "colour" not "color", "aluminium" not "aluminum", "authorised" not "authorized".
- Never use <h1> — Shopify reserves that for the product title. Use <h2> for all section headings.

━━━ SEO RULES ━━━
- Place the primary keyword naturally in the first sentence (within the first 100 words).
- Use <strong> only for genuinely critical specs or terms — never for decoration.
- Total word count in the HTML: 150–300 words.
- No keyword stuffing. Primary keyword appears 2–3 times max.

━━━ EXACT HTML STRUCTURE ━━━
Output this structure in the "html" field — no extra sections, no extra wrappers:

<p>[Sentence 1 with primary keyword. Sentence 2. Sentence 3 optional.]</p>
<p>[1–2 sentences on what's in the box or how it works.]</p>
<p>[1 sentence on who it suits or why it's worth buying.]</p>

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

[If and only if the page mentions a purchase limit, add one <p> for it. Otherwise omit entirely.]

━━━ PRICE RULES ━━━
- Use the price signals provided (official page, UPC database prices, web mentions) to determine the Australian RRP.
- Prefer the official Australian RRP. If unavailable, convert the USD UPC price to AUD (multiply by ~1.55) as a guide.
- If you can find a credible AUD price, output "AUD $XX.XX". For a range, "AUD $XX.XX – $XX.XX".
- If no reliable price exists, output "Price not found — check official site".

━━━ ALT TEXT RULES ━━━
- Under 125 characters.
- Descriptive of the product itself — not "image of" or "photo of".
- Based on the product page content, not the image alone.

━━━ OUTPUT FORMAT ━━━
Respond with ONLY valid JSON — no markdown fences, no thinking tags, no extra text:
{
  "html": "<p>...</p>...",
  "price": "AUD $XX.XX",
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
  priceContext?: string
): Promise<OllamaOutput> {
  const isDerived = productInfo.title === "(derive from page)";

  const parts = [
    isDerived
      ? "Product name: (derive from the page content below)"
      : `Product name: ${productInfo.title}`,
    productInfo.brand ? `Brand: ${productInfo.brand}` : null,
    productInfo.category ? `Category: ${productInfo.category}` : null,
    "",
    priceContext ? `Price signals:\n${priceContext}` : null,
    priceContext ? "" : null,
    "Official product page content:",
    "---",
    scrapedContent,
    "---",
    "",
    "Generate the Shopify description. Output only JSON.",
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
