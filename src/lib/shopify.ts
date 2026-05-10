import type { ShopifyPushPayload, ShopifyPushResult } from "@/types";

export async function createDraftProduct(
  domain: string,
  token: string,
  payload: ShopifyPushPayload
): Promise<ShopifyPushResult> {
  const res = await fetch(`https://${domain}/admin/api/2024-10/products.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      product: {
        title: payload.title,
        body_html: payload.bodyHtml,
        status: "draft",
        variants: [{ price: payload.price }],
        ...(payload.altText ? { images: [{ alt: payload.altText }] } : {}),
      },
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(
      errJson?.errors ? JSON.stringify(errJson.errors) : `Shopify API ${res.status}`
    );
  }

  const json = await res.json();
  const id: number = json.product.id;
  return {
    productId: id,
    productUrl: `https://${domain}/admin/products/${id}`,
  };
}
