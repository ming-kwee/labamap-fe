# 03 — Wix Integration

## Overview

Wix is a website builder with a powerful ecommerce backend called **Wix Stores**. The integration uses **Wix Headless** (OAuth 2.0) to access the **Wix REST API**. Unlike Shopify's static token, Wix uses short-lived access tokens that must be refreshed.

**Credential fields required:**
- `accessToken` — OAuth access token (short-lived, ~1 hour)
- `wixSiteId` — the unique ID of the Wix site

> **Backend note:** You must also store the `refreshToken` (not shown in the UI) to keep the connection alive. Store it in the encrypted credentials map under key `refreshToken`.

---

## Step 1: Create a Wix App (Headless Project)

### Option A: Wix Headless (Recommended for server-to-server)

1. Go to **Wix Developer Center**: `dev.wix.com`
2. Click **Create New App**
3. Select **Headless** project type
4. Give it a name: e.g., `Labamap Omnichannel`
5. In the app dashboard, go to **OAuth** → **Add OAuth App**
6. Configure:
   - **Allowed redirect URI**: `https://your-backend.com/api/v1/oauth/wix/callback`
   - **Permissions** (scroll through and enable):
     - `Wix Stores — Read Products`
     - `Wix Stores — Write Products`
     - `Wix Catalog — Manage Products`
     - `Wix Inventory — Manage`
7. Note your **Client ID** and **Client Secret**

### Option B: API Key (simpler, for trusted server environments)

1. In your Wix site dashboard: **Settings** → **Advanced** → **API Keys**
2. Click **Generate API Key**
3. Set permissions:
   - `All site permissions` or specific Wix Stores permissions
4. Copy the API key (shown only once)
5. Get your Site ID from **Settings** → **Business Info** → **Site ID**

---

## Step 2: Obtain the Access Token

### OAuth 2.0 Flow (Headless)

```
1. Redirect merchant to Wix consent screen:
   GET https://www.wix.com/installer/install
       ?token={your-oauth-init-token}
       &appId={your-client-id}
       &redirectUrl=https://your-backend.com/api/v1/oauth/wix/callback

2. Merchant approves permissions

3. Wix redirects to your callback with authorization code:
   GET /api/v1/oauth/wix/callback?code={auth_code}&instanceId={site_id}

4. Exchange code for tokens:
   POST https://www.wix.com/oauth/access
   Content-Type: application/json
   {
     "grant_type": "authorization_code",
     "client_id": "{your-client-id}",
     "client_secret": "{your-client-secret}",
     "code": "{auth_code}"
   }

   Response:
   {
     "access_token": "...",     // valid ~1 hour
     "refresh_token": "...",    // valid indefinitely
     "token_type": "Bearer"
   }
```

### Token Refresh (Backend Job)

```java
// WixTokenRefreshService.java
public String refreshAccessToken(String refreshToken) {
    String body = """
        {
          "grant_type": "refresh_token",
          "client_id": "%s",
          "client_secret": "%s",
          "refresh_token": "%s"
        }
        """.formatted(clientId, clientSecret, refreshToken);

    HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create("https://www.wix.com/oauth/access"))
        .header("Content-Type", "application/json")
        .POST(BodyPublishers.ofString(body))
        .build();

    HttpResponse<String> response = httpClient.send(request, BodyHandlers.ofString());
    // Parse and return new access_token
    // Also save new refresh_token if rotated
}
```

---

## Step 3: Find Your Wix Site ID

The `wixSiteId` is the unique identifier for a Wix site:

- In Wix Admin: **Settings** → **Business & SEO** → **Business Info** → look for **Site ID**
- Or from the URL when managing your site: `manage.wix.com/dashboard/{SITE_ID}/home`
- Format: UUID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

---

## Step 4: Fill in ConnectStoreModal

| Field | Value |
|-------|-------|
| Channel Type | `WIX` |
| Store Name | e.g., `My Wix Store` |
| Store URL | `www.mybrand.com` (your Wix domain) |
| Region | optional |
| Access Token | `Bearer token from OAuth` |
| Wix Site ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

---

## Step 5: Verifying the Connection (Backend)

```java
public void validateWix(String accessToken, String siteId) throws ChannelConnectionException {
    // Fetch site info to verify credentials
    String url = "https://www.wixapis.com/site-properties/v4/properties";

    HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create(url))
        .header("Authorization", accessToken)
        .header("wix-site-id", siteId)
        .GET()
        .build();

    HttpResponse<String> response = httpClient.send(request, BodyHandlers.ofString());

    if (response.statusCode() == 401) {
        throw new ChannelConnectionException("Invalid Wix access token");
    }
    if (response.statusCode() == 403) {
        throw new ChannelConnectionException("Wix token missing required permissions");
    }
}
```

---

## Wix Catalog API — Key Endpoints

### Create a Product

```
POST https://www.wixapis.com/stores/v1/products
Authorization: {accessToken}
wix-site-id: {wixSiteId}
Content-Type: application/json

{
  "product": {
    "name": "T-Shirt Classic",
    "productType": "physical",
    "description": "<p>Product description</p>",
    "price": { "amount": "29.99", "currency": "USD" },
    "sku": "TSH-001",
    "visible": true,
    "variants": [
      {
        "choices": { "Color": "Red", "Size": "Small" },
        "variant": {
          "priceData": { "price": "29.99" },
          "sku": "TSH-RED-S",
          "stock": { "quantity": 50, "trackQuantity": true }
        }
      }
    ],
    "productOptions": [
      {
        "optionType": "drop_down",
        "name": "Color",
        "choices": [
          { "description": "Red", "value": "Red" },
          { "description": "Blue", "value": "Blue" }
        ]
      },
      {
        "optionType": "drop_down",
        "name": "Size",
        "choices": [
          { "description": "Small", "value": "Small" },
          { "description": "Large", "value": "Large" }
        ]
      }
    ]
  }
}
```

### Update Inventory

```
POST https://www.wixapis.com/stores/v1/inventoryItems/variantsByIds/adjustQuantity
Authorization: {accessToken}
wix-site-id: {wixSiteId}

{
  "inventoryItems": [
    {
      "externalId": "TSH-RED-S",
      "incrementBy": 10
    }
  ]
}
```

---

## Mapping: Master Product → Wix Product

```
MasterProduct               Wix Catalog
────────────────────────────────────────────
name             ──►        name
description      ──►        description
price            ──►        price.amount
currencyCode     ──►        price.currency
images[]         ──►        media.items[].image

MasterVariant               Wix Variant
────────────────────────────────────────────
variantSku       ──►        variant.sku
stockQuantity    ──►        variant.stock.quantity
price            ──►        variant.priceData.price
variantOptions   ──►        choices (Color, Size, etc.)
```

---

## Channel-Specific Fields (Step 2 Form)

**Required:**
- `wix_product_name` — override name for Wix (if different from master)
- `wix_collection_ids` — comma-separated Wix collection IDs

**Recommended:**
- `wix_seo_title` — page `<title>` for Wix store
- `wix_seo_description` — meta description
- `wix_ribbon` — product label (e.g., "NEW", "SALE")

**Optional:**
- `wix_brand` — brand name in Wix product info
- `wix_cost_and_profit_enabled` — track cost of goods

---

## Wix Ecommerce vs Wix Stores API

Wix has **two product APIs** — know which one to use:

| API | Version | When to use |
|-----|---------|-------------|
| Stores Catalog v1 | `/stores/v1/products` | Mature, production-ready |
| Ecommerce Catalog v1 | `/ecom/v1/catalogs/...` | Newer, supports B2B |

For new integrations, prefer **Ecommerce Catalog v1**.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `401` | Token expired | Refresh using `refreshToken` |
| `403` | Missing scope/permission | Re-authorize with correct permissions |
| `404` | Wrong site ID | Check `wix-site-id` header |
| `409` | Duplicate SKU | Wix requires unique SKUs per site |
| `INVALID_ARGUMENT` | Invalid product structure | Check required fields in product object |

---

## Important Wix Quirks

1. **Wix uses UUIDs for everything** — product IDs, variant IDs, collection IDs are all UUIDs, not sequential numbers.
2. **Media must be uploaded first** — images must be uploaded to Wix Media before being attached to products (unlike Shopify which accepts external URLs).
3. **Variants are auto-generated from options** — you define options (Color, Size), and Wix generates the variant matrix automatically.
4. **SEO slugs auto-generated** — product URL slugs are generated from the product name and cannot contain special characters.
