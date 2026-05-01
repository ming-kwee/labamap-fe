# 06 — eBay Integration

## Overview

eBay uses **OAuth 2.0** for authentication. The integration relies on the **eBay Sell APIs** (specifically the Inventory API and the Offer API) to create listings. eBay has multiple regional sites (US, UK, DE, AU, etc.) each with its own `siteId`.

**Credential fields required:**
- `accessToken` — OAuth access token (short-lived, ~2 hours)
- `refreshToken` — OAuth refresh token (long-lived, ~18 months)
- `siteId` — numeric eBay site ID (e.g., `0` for US)

> **Backend note:** Store the `refreshToken` and regenerate `accessToken` on each API call (or before each batch of calls). Also store the LWA `clientId` and `clientSecret` to perform refreshes.

---

## Step 1: Create an eBay Developer Account

1. Go to **eBay Developer Program**: `developer.ebay.com`
2. Sign in with your eBay account (can be a seller account)
3. Go to **My Account** → **Application Keys**
4. Click **Create a keyset**:
   - App Title: `Labamap Omnichannel`
   - Environment: **Production** (or Sandbox for testing)
5. Note:
   - **App ID (Client ID)** → your `clientId`
   - **Dev ID** → your developer ID (rarely needed)
   - **Cert ID (Client Secret)** → your `clientSecret`

---

## Step 2: Configure OAuth Scopes

In the application settings, configure your required **OAuth scopes**:

```
Required for product management:
  https://api.ebay.com/oauth/api_scope/sell.inventory
  https://api.ebay.com/oauth/api_scope/sell.inventory.readonly
  https://api.ebay.com/oauth/api_scope/sell.account
  https://api.ebay.com/oauth/api_scope/sell.account.readonly
  https://api.ebay.com/oauth/api_scope/sell.fulfillment
  https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly

Optional (for marketing):
  https://api.ebay.com/oauth/api_scope/sell.marketing
  https://api.ebay.com/oauth/api_scope/sell.marketing.readonly
```

Set the **RuName** (eBay Redirect URL Name):
- Add redirect URI: `https://your-backend.com/api/v1/oauth/ebay/callback`

---

## Step 3: OAuth Flow — Authorization Code Grant

### Step 3a: Authorization URL

```
GET https://auth.ebay.com/oauth2/authorize
    ?client_id={appId}
    &redirect_uri={ruName}
    &response_type=code
    &scope=https://api.ebay.com/oauth/api_scope/sell.inventory
           https://api.ebay.com/oauth/api_scope/sell.account
    &state={random_state}
```

### Step 3b: Exchange Code for Tokens

```
POST https://api.ebay.com/identity/v1/oauth2/token
Authorization: Basic base64({clientId}:{clientSecret})
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={authorization_code}
&redirect_uri={ruName}
```

Response:
```json
{
  "access_token": "v^1.1#i^1#p^3#I^3#r^1#...",
  "expires_in": 7200,
  "refresh_token": "v^1.1#i^1#p^3#r^1#...",
  "refresh_token_expires_in": 47304000,
  "token_type": "User Access Token"
}
```

### Step 3c: Refresh Token

```java
// eBayTokenRefreshService.java
public String refreshAccessToken(String refreshToken, String clientId, String clientSecret) {
    String credentials = Base64.encode(clientId + ":" + clientSecret);
    String body = "grant_type=refresh_token&refresh_token=" + refreshToken;

    HttpResponse<String> response = httpClient.send(
        HttpRequest.newBuilder()
            .uri(URI.create("https://api.ebay.com/identity/v1/oauth2/token"))
            .header("Authorization", "Basic " + credentials)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(BodyPublishers.ofString(body))
            .build(),
        BodyHandlers.ofString()
    );
    // Parse and return new access_token
}
```

---

## Step 4: eBay Site IDs

Select the correct `siteId` for the marketplace:

| eBay Site | Country | Site ID |
|-----------|---------|---------|
| eBay US | United States | `0` |
| eBay AU | Australia | `15` |
| eBay AT | Austria | `16` |
| eBay BE | Belgium (French) | `23` |
| eBay CA | Canada | `2` |
| eBay FR | France | `71` |
| eBay DE | Germany | `77` |
| eBay IN | India | `203` |
| eBay IE | Ireland | `205` |
| eBay IT | Italy | `101` |
| eBay MY | Malaysia | `207` |
| eBay NL | Netherlands | `146` |
| eBay PH | Philippines | `211` |
| eBay PL | Poland | `212` |
| eBay SG | Singapore | `216` |
| eBay ES | Spain | `186` |
| eBay CH | Switzerland | `193` |
| eBay UK | United Kingdom | `3` |

---

## Step 5: Fill in ConnectStoreModal

| Field | Value |
|-------|-------|
| Channel Type | `eBay` |
| Store Name | e.g., `My Brand eBay US` |
| Store URL | `www.ebay.com/str/mybrandstore` |
| Region | `US` |
| Access Token | OAuth access token |
| Refresh Token | OAuth refresh token |
| Site ID | `0` (for US) |

---

## eBay Sell API — Inventory Approach

eBay's modern API uses the **Inventory API + Offer API** pattern (preferred over the older Trading API):

```
1. Create/Update Inventory Item (the product data)
   PUT /sell/inventory/v1/inventory_item/{SKU}

2. Create an Offer (links the item to a listing)
   POST /sell/inventory/v1/offer

3. Publish the Offer (creates the live eBay listing)
   POST /sell/inventory/v1/offer/{offerId}/publish
```

### Create Inventory Item

```
PUT https://api.ebay.com/sell/inventory/v1/inventory_item/TSH-RED-S
Authorization: Bearer {accessToken}
Content-Language: en-US
Content-Type: application/json

{
  "product": {
    "title": "Classic T-Shirt Red Small",
    "description": "High quality cotton t-shirt",
    "imageUrls": [
      "https://cdn.example.com/tshirt-red-front.jpg"
    ],
    "ean": ["1234567890123"],
    "aspects": {
      "Brand": ["My Brand"],
      "Size": ["Small"],
      "Color": ["Red"],
      "Material": ["100% Cotton"]
    }
  },
  "condition": "NEW",
  "availability": {
    "shipToLocationAvailability": {
      "quantity": 50
    }
  }
}
```

### Create an Offer

```
POST https://api.ebay.com/sell/inventory/v1/offer
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "sku": "TSH-RED-S",
  "marketplaceId": "EBAY_US",
  "format": "FIXED_PRICE",
  "availableQuantity": 50,
  "categoryId": "15687",
  "listingDescription": "<p>Full product description</p>",
  "listingPolicies": {
    "fulfillmentPolicyId": "12345678901234",
    "paymentPolicyId": "12345678901234",
    "returnPolicyId": "12345678901234"
  },
  "pricingSummary": {
    "price": { "currency": "USD", "value": "29.99" }
  },
  "merchantLocationKey": "default"
}
```

### Publish the Offer

```
POST https://api.ebay.com/sell/inventory/v1/offer/{offerId}/publish
Authorization: Bearer {accessToken}
```

Response:
```json
{
  "listingId": "123456789012"
}
```

---

## Mapping: Master Product → eBay Inventory Item

```
MasterProduct               eBay Inventory Item
──────────────────────────────────────────────────────
name             ──►        product.title
description      ──►        listingDescription (in offer)
images[]         ──►        product.imageUrls
barcode          ──►        product.ean or product.upc

MasterVariant               eBay Inventory Item (per SKU)
──────────────────────────────────────────────────────
variantSku       ──►        sku (unique per API call)
price            ──►        pricingSummary.price.value
stockQuantity    ──►        availability.shipToLocationAvailability.quantity
condition        ──►        condition ("NEW", "USED_EXCELLENT", etc.)
color            ──►        product.aspects.Color
size             ──►        product.aspects.Size
```

---

## Channel-Specific Fields (Step 2 Form)

**Required:**
- `ebay_category_id` — eBay leaf category ID
- `ebay_condition` — `NEW`, `USED_EXCELLENT`, `USED_GOOD`, etc.
- `ebay_fulfillment_policy_id` — pre-configured shipping policy
- `ebay_payment_policy_id` — pre-configured payment policy
- `ebay_return_policy_id` — pre-configured return policy

**Recommended:**
- `ebay_listing_duration` — `GTC` (Good Till Cancelled, recommended) or timed
- `ebay_best_offer_enabled` — allow buyers to make offers
- `ebay_quantity_limit_per_buyer` — max units per buyer

**Optional:**
- `ebay_secondary_category_id` — optional second category
- `ebay_store_category_name` — eBay Store category

---

## eBay-Specific Considerations

### 1. Listing Policies are Required
Before creating offers, you must have configured **Fulfillment Policy**, **Payment Policy**, and **Return Policy** in eBay Seller Hub. The API requires their IDs.

```
GET /sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US
GET /sell/account/v1/payment_policy?marketplace_id=EBAY_US
GET /sell/account/v1/return_policy?marketplace_id=EBAY_US
```

### 2. eBay Aspects (Attributes)
eBay requires specific aspects (attributes) per category. Fetch required aspects with:
```
GET /commerce/taxonomy/v1/category_tree/{categoryTreeId}/get_item_aspects_for_category?category_id={id}
```

### 3. Variation Listings (Parent-Child)
Multi-variant products (like shirts with color/size variants) use the **Inventory Item Group** API to create a variation listing:
```
PUT /sell/inventory/v1/inventory_item_group/{groupKey}
```

### 4. eBay Sandbox
Test endpoint: `https://api.sandbox.ebay.com`
Auth endpoint: `https://auth.sandbox.ebay.com`

---

## Troubleshooting

| Error Code | Meaning | Fix |
|------------|---------|-----|
| `215004` | Token expired | Refresh access token |
| `25001` | Invalid category ID | Use taxonomy API to find correct ID |
| `25002` | Required aspects missing | Fetch and fill required aspects |
| `25006` | Duplicate SKU | Use unique SKU per inventory item |
| `25040` | Missing listing policy | Create policies in eBay Seller Hub |
| `25044` | Price below minimum | Check eBay's minimum price by category |
| `215099` | Marketplace not supported | Check `marketplaceId` format |
