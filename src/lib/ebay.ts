const TRADING_API_URL = "https://api.ebay.com/ws/api.dll";

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
  listingUrl: string;
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
    <ConditionID>${conditionId(payload.condition)}</ConditionID>
    <Country>AU</Country>
    <Currency>AUD</Currency>
    <ListingType>FixedPriceItem</ListingType>
    <ListingDuration>GTC</ListingDuration>
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
      "X-EBAY-API-SITEID": "15", // eBay Australia
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
    listingUrl: `https://www.ebay.com.au/itm/${itemId}`,
  };
}
