# 04 — TikTok Shop Integration

## Overview

TikTok Shop is a **social commerce** platform where products are sold directly through TikTok videos, LIVE streams, and a dedicated Shop tab. It's especially powerful in the US, UK, and Southeast Asia.

The TikTok Shop API uses OAuth 2.0 with an **App Key** and **App Secret**. Each connected seller store has a unique **Shop Cipher** that must be included in every API request.

**Credential fields required:**
- `appKey` — from TikTok Developer Portal
- `appSecret` — from TikTok Developer Portal
- `accessToken` — OAuth access token for the seller
- `shopCipher` — unique identifier for the specific shop instance

---

## Step 1: Create a TikTok Developer App

1. Go to **TikTok Developer Portal**: `developer.tiktokshop.com`
2. Sign in with a TikTok Business account
3. Click **My Apps** → **Create App**
4. Fill in:
   - App Name: `Labamap Omnichannel`
   - App Category: `E-commerce/Retail tools`
   - Use Case: Product listing management
5. Under **App Type**, select **Web App**
6. Set **Redirect URI**: `https://your-backend.com/api/v1/oauth/tiktok/callback`
7. Submit for review (sandbox access is immediate; production requires review)

After creation:
- Copy **App Key** → `appKey`
- Copy **App Secret** → `appSecret`

---

## Step 2: Configure Required Permissions (Scopes)

In the app's **Auth Scope** settings, enable:

```
Products:
  ✓ product.read        — read product listings
  ✓ product.create      — create new listings
  ✓ product.update      — update existing listings
  ✓ product.delete      — remove listings

Inventory:
  ✓ inventory.read
  ✓ inventory.update

Orders (optional):
  ✓ order.read
```

---

## Step 3: OAuth Flow — Get Access Token

### Step 3a: Generate Authorization URL

```
GET https://auth.tiktok-shops.com/oauth/authorize
    ?app_key={appKey}
    &redirect_uri=https://your-backend.com/api/v1/oauth/tiktok/callback
    &response_type=code
    &scope=product.read,product.create,product.update,inventory.read,inventory.update
    &state={random_state_string}
```

The seller clicks this link, logs into their TikTok Shop seller account, and approves permissions.

### Step 3b: Exchange Code for Tokens

```
POST https://auth.tiktok-shops.com/api/v2/token/get
Content-Type: application/json

{
  "app_key": "{appKey}",
  "app_secret": "{appSecret}",
  "code": "{authorization_code}",
  "grant_type": "authorized_code"
}
```

Response:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "access_token": "TKT_xxxxxxxxxxxxxx",
    "access_token_expire_in": 1735689600,
    "refresh_token": "TKR_xxxxxxxxxxxxxx",
    "refresh_token_expire_in": 1767225600,
    "open_id": "user_open_id",
    "seller_name": "My Brand",
    "seller_base_region": "US",
    "authorized_shop_list": [
      {
        "cipher": "ROW_ShopCipher_xxxx",
        "id": "7123456789012345678",
        "name": "My Brand US Shop",
        "region": "US",
        "seller_type": "LOCAL"
      }
    ]
  }
}
```

### Step 3c: Extract Shop Cipher

The `authorized_shop_list` contains all shops the seller has authorized. For each shop:
- `cipher` → this is your `shopCipher` credential
- `id` → TikTok's internal shop ID

If the seller has multiple shops (e.g., US + UK), create a separate store connection for each, using that shop's `cipher`.

---

## Step 4: Fill in ConnectStoreModal

| Field | Value |
|-------|-------|
| Channel Type | `TikTok Shop` |
| Store Name | e.g., `My Brand US TikTok Shop` |
| Store URL | `shop.tiktok.com/@mybrand` |
| Region | `US` |
| App Key | `{appKey from Developer Portal}` |
| App Secret | `{appSecret from Developer Portal}` |
| Access Token | `TKT_xxxxxxxxxxxxxx` |
| Shop Cipher | `ROW_ShopCipher_xxxx` |

---

## Step 5: Token Refresh (Backend)

TikTok access tokens expire. Refresh them using:

```java
// TikTokTokenRefreshService.java
public TikTokTokenResponse refreshToken(String refreshToken, String appKey, String appSecret) {
    String url = "https://auth.tiktok-shops.com/api/v2/token/refresh";

    String body = """
        {
          "app_key": "%s",
          "app_secret": "%s",
          "refresh_token": "%s",
          "grant_type": "refresh_token"
        }
        """.formatted(appKey, appSecret, refreshToken);

    HttpResponse<String> response = httpClient.send(
        HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Content-Type", "application/json")
            .POST(BodyPublishers.ofString(body))
            .build(),
        BodyHandlers.ofString()
    );

    return parseTokenResponse(response.body());
}
```

---

## TikTok Shop API — Key Endpoints

Every TikTok Shop API request requires a **signature** computed from your App Secret. The signing algorithm:

```
sign = MD5(appSecret + concat(sorted_params_as_string) + appSecret)
     (uppercased hex)
```

### List Product Categories

```
GET https://open-api.tiktokglobalshop.com/product/202309/categories
    ?app_key={appKey}
    &shop_cipher={shopCipher}
    &timestamp={unix_timestamp}
    &sign={computed_sign}
    &access_token={accessToken}
    &version=202309
```

### Create a Product

```
POST https://open-api.tiktokglobalshop.com/product/202309/products
Headers:
  x-tts-access-token: {accessToken}
  content-type: application/json

Query params: app_key, shop_cipher, timestamp, sign

Body:
{
  "description": "<p>Product description</p>",
  "category_id": "601317",
  "brand_id": "7000000001",
  "main_images": [
    { "uri": "tos-maliva-i-xxxx/image.jpg" }
  ],
  "skus": [
    {
      "outer_sku_id": "TSH-RED-S",
      "sales_attributes": [
        { "attribute_id": "100000", "custom_value": "Red" },
        { "attribute_id": "100007", "custom_value": "Small" }
      ],
      "price": {
        "currency": "USD",
        "original_price": "29.99"
      },
      "inventory": [
        { "quantity": 50 }
      ]
    }
  ],
  "title": "T-Shirt Classic",
  "is_cod_open": false,
  "delivery_service_ids": ["1234567890"]
}
```

---

## Mapping: Master Product → TikTok Product

```
MasterProduct               TikTok Product
─────────────────────────────────────────────────
name             ──►        title
description      ──►        description (HTML allowed)
images[]         ──►        main_images[].uri (must upload first)
categoryId       ──►        category_id (TikTok category tree)

MasterVariant               TikTok SKU
─────────────────────────────────────────────────
variantSku       ──►        outer_sku_id
price            ──►        price.original_price
stockQuantity    ──►        inventory[].quantity
color            ──►        sales_attributes (attribute_id: "100000")
size             ──►        sales_attributes (attribute_id: "100007")
```

---

## Image Upload (Required before product creation)

TikTok does not accept external image URLs. You must upload images first:

```
POST https://open-api.tiktokglobalshop.com/product/202309/images/upload
x-tts-access-token: {accessToken}
Content-Type: multipart/form-data

file: {binary image data}
```

Response:
```json
{
  "data": {
    "uri": "tos-maliva-i-xxxx/image_hash.jpg",
    "use_case_tags": ["MAIN_IMAGE"]
  }
}
```

Use the returned `uri` in your product creation request.

---

## Channel-Specific Fields (Step 2 Form)

**Required:**
- `tiktok_category_id` — TikTok's category ID (from category tree API)
- `tiktok_brand_id` — brand ID (can be "no-brand" ID if unbranded)
- `tiktok_delivery_service_id` — delivery option ID

**Recommended:**
- `tiktok_package_weight` — package weight in grams
- `tiktok_package_length/width/height` — package dimensions in mm
- `tiktok_is_cod_open` — Cash on Delivery availability

**Optional:**
- `tiktok_video_uri` — product video (boosted in TikTok's algorithm)
- `tiktok_size_chart_id` — size chart for apparel categories

---

## TikTok-Specific Considerations

### 1. Category ID is mandatory and hierarchical
TikTok's category tree is 3 levels deep (e.g., Fashion → Women → Tops). You must select a **leaf-level** category.

### 2. Compliance and moderation
TikTok reviews products before they go live. Products may be in `PENDING_REVIEW` status for up to 24 hours.

### 3. Multiple warehouse/fulfillment centers
TikTok requires you to specify which warehouse fulfills each SKU. Get warehouse IDs with:
```
GET /api/logistics/202309/warehouses
```

### 4. Regional differences
- **US**: Uses USD, imperial units, different category IDs
- **UK**: Uses GBP, HMRC-compliant VAT settings
- **SEA** (ID, MY, TH, VN, PH): Local currency, local category trees

---

## Troubleshooting

| Error Code | Meaning | Fix |
|------------|---------|-----|
| `4000000` | Invalid access token | Refresh token |
| `4000001` | App key doesn't match | Check `appKey` param |
| `4000200` | Shop not found | Verify `shopCipher` |
| `4000201` | Shop is inactive | Contact TikTok seller support |
| `4100000` | Product validation failed | Check required fields for category |
| `4200000` | Category ID not found | Re-fetch category tree |
| `5000000` | Internal server error | Retry with exponential backoff |

---

## Sandbox vs Production

TikTok provides a **sandbox environment** for testing:

```
Sandbox base URL: https://sandbox-open-api.tiktokglobalshop.com
Production URL:   https://open-api.tiktokglobalshop.com
```

Use sandbox for development. Switch to production only after TikTok approves your app for production access.
