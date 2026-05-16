const TRADING_API_URL = "https://api.ebay.com/ws/api.dll";
// eBay Australia: site ID 15, Taxonomy category tree ID 15
const EBAY_AU_CATEGORY_TREE_ID = "15";

const CONDITION_ID_MAP: Record<string, number> = {
  "New": 1000,
  "New with box": 1000,
  "New without box": 1500,
  "New with defects": 1750,
  "Used": 3000,
  "Used - Good": 5000,
  "Used - Acceptable": 6000,
};

function conditionId(condition: string): number {
  return CONDITION_ID_MAP[condition] ?? 1000;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildItemSpecifics(specifics: Record<string, string>): string {
  return Object.entries(specifics)
    .map(
      ([name, value]) =>
        `<NameValueList><Name>${escapeXml(name)}</Name><Value>${escapeXml(value)}</Value></NameValueList>`
    )
    .join("");
}

// ── App-level OAuth token (Client Credentials grant) ────────────────────────
// Used for Taxonomy API calls — does NOT need a user token.
let cachedAppToken: { token: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string> {
  const now = Date.now();
  if (cachedAppToken && cachedAppToken.expiresAt > now + 60_000) {
    return cachedAppToken.token;
  }

  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) {
    throw new Error("EBAY_APP_ID and EBAY_CERT_ID must be set in .env");
  }

  const credentials = Buffer.from(`${appId}:${certId}`).toString("base64");
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });

  if (!res.ok) throw new Error(`eBay OAuth failed: ${res.status}`);
  const json = await res.json() as { access_token: string; expires_in: number };

  cachedAppToken = {
    token: json.access_token,
    expiresAt: now + (json.expires_in - 60) * 1000,
  };
  return cachedAppToken.token;
}

// ── Category suggestions ─────────────────────────────────────────────────────

export interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
}

export async function getSuggestedCategories(query: string): Promise<CategorySuggestion[]> {
  const token = await getAppToken();

  const res = await fetch(
    `https://api.ebay.com/commerce/taxonomy/v1/category_tree/${EBAY_AU_CATEGORY_TREE_ID}/get_category_suggestions?q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );

  if (!res.ok) throw new Error(`eBay Taxonomy API error: ${res.status}`);

  const json = await res.json() as {
    categorySuggestions?: Array<{
      category: { categoryId: string; categoryName: string };
    }>;
  };

  return (json.categorySuggestions ?? []).slice(0, 5).map((s) => ({
    categoryId: s.category.categoryId,
    categoryName: s.category.categoryName,
  }));
}

// ── Create listing ───────────────────────────────────────────────────────────

export interface EbayListingPayload {
  title: string;
  descriptionHtml: string;
  price: string;
  categoryId: string;
  condition: string;
  itemSpecifics?: Record<string, string>;
  userToken: string;
}

export interface EbayListingResult {
  itemId: string;
  sellerHubUrl: string;
}

export async function createEbayListing(payload: EbayListingPayload): Promise<EbayListingResult> {
  const appId = process.env.EBAY_APP_ID;
  const devId = process.env.EBAY_DEV_ID;
  const certId = process.env.EBAY_CERT_ID;

  if (!appId || !devId || !certId) {
    throw new Error(
      "eBay app credentials not configured — set EBAY_APP_ID, EBAY_DEV_ID, EBAY_CERT_ID in .env"
    );
  }

  const itemSpecificsXml = payload.itemSpecifics
    ? `<ItemSpecifics>${buildItemSpecifics(payload.itemSpecifics)}</ItemSpecifics>`
    : "";

  // Schedule 30 days out so it sits as a "Scheduled" (draft-like) listing in
  // Seller Hub. The user activates it when ready by changing the start date.
  const scheduleTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${payload.userToken}</eBayAuthToken>
  </RequesterCredentials>
  <Item>
    <Title>${escapeXml(payload.title.slice(0, 80))}</Title>
    <Description><![CDATA[${payload.descriptionHtml}]]></Description>
    <PrimaryCategory>
      <CategoryID>${escapeXml(payload.categoryId)}</CategoryID>
    </PrimaryCategory>
    <StartPrice>${payload.price}</StartPrice>
    <ScheduleTime>${scheduleTime}</ScheduleTime>
    <ConditionID>${conditionId(payload.condition)}</ConditionID>
    <Country>AU</Country>
    <Currency>AUD</Currency>
    <ListingType>FixedPriceItem</ListingType>
    <ListingDuration>Days_30</ListingDuration>
    <Quantity>1</Quantity>
    <ShippingDetails>
      <ShippingType>Flat</ShippingType>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>AU_Regular</ShippingService>
        <FreeShipping>true</FreeShipping>
      </ShippingServiceOptions>
    </ShippingDetails>
    <ReturnPolicy>
      <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
      <RefundOption>MoneyBack</RefundOption>
      <ReturnsWithinOption>Days_14</ReturnsWithinOption>
      <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
    </ReturnPolicy>
    <DispatchTimeMax>3</DispatchTimeMax>
    ${itemSpecificsXml}
  </Item>
</AddFixedPriceItemRequest>`;

  const response = await fetch(TRADING_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
      "X-EBAY-API-CALL-NAME": "AddFixedPriceItem",
      "X-EBAY-API-APP-NAME": appId,
      "X-EBAY-API-CERT-NAME": certId,
      "X-EBAY-API-DEV-NAME": devId,
      "X-EBAY-API-SITEID": "15",
    },
    body: xml,
  });

  const text = await response.text();

  const ack = text.match(/<Ack>(.*?)<\/Ack>/)?.[1];
  if (ack !== "Success" && ack !== "Warning") {
    const short = text.match(/<ShortMessage>(.*?)<\/ShortMessage>/)?.[1];
    const long = text.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1];
    throw new Error(short ?? long ?? `eBay API error (Ack: ${ack})`);
  }

  const itemId = text.match(/<ItemID>(.*?)<\/ItemID>/)?.[1];
  if (!itemId) throw new Error("eBay did not return an Item ID");

  return {
    itemId,
    sellerHubUrl: `https://www.ebay.com.au/sh/lst/scheduled`,
  };
}
