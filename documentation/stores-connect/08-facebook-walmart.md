# 08 — Facebook Shop & Walmart

---

# FACEBOOK SHOP (Meta Commerce)

## Overview

Facebook Shop (via **Meta Commerce Platform**) allows selling directly on Facebook and Instagram. The integration uses the **Meta Business API** with a **System User access token** and a **Catalog ID**. Products are managed through the **Catalog API** and surfaced on Facebook Shop and Instagram Shopping.

**Credential fields:** `accessToken`, `catalogId`

---

## Step 1: Set Up Meta Business Manager

1. Go to **Meta Business Suite**: `business.facebook.com`
2. Create or use an existing **Business Account**
3. Go to **Commerce Manager**: `business.facebook.com/commerce`
4. Create or connect a **Catalog**:
   - Type: `E-commerce`
   - Note the **Catalog ID** (numeric) → `catalogId`

---

## Step 2: Create a Meta App

1. Go to **Meta for Developers**: `developers.facebook.com`
2. Click **My Apps** → **Create App**
3. App Type: **Business**
4. Add product: **Marketing API**
5. Under **Permissions**, request:
   - `catalog_management` — manage catalog products
   - `business_management` — access Business Manager
   - `pages_show_list` — list pages

---

## Step 3: Create a System User Token (Recommended)

For server-to-server integrations, use a **System User** (not a personal user token) for long-lived, stable access:

1. In Meta Business Manager → **Settings** → **Users** → **System Users**
2. Click **Add** → Name: `Labamap API User`, Role: `Admin`
3. Click **Generate New Token** for the App you created
4. Select scopes: `catalog_management`, `business_management`
5. Copy the **Access Token** → `accessToken`

> System User tokens are **long-lived** (default 60 days, can be extended). Unlike user tokens, they don't expire when a person changes their password.

---

## Step 4: Find Your Catalog ID

```
GET https://graph.facebook.com/v19.0/me/businesses
    ?access_token={accessToken}
    &fields=id,name,owned_product_catalogs
```

The `owned_product_catalogs.data[].id` is your `catalogId`.

---

## Step 5: Fill in ConnectStoreModal

| Field | Value |
|-------|-------|
| Channel Type | `Facebook Shop` |
| Store Name | e.g., `My Brand Facebook Shop` |
| Store URL | `facebook.com/mybrandpage` |
| Region | optional |
| Access Token | Long-lived system user token |
| Catalog ID | Numeric catalog ID |

---

## Meta Catalog API — Key Endpoints

Base URL: `https://graph.facebook.com/v19.0`

### Add Product to Catalog

```
POST https://graph.facebook.com/v19.0/{catalogId}/products
Content-Type: application/x-www-form-urlencoded

access_token={accessToken}
&retailer_id=TSH-RED-S
&name=Classic+T-Shirt+Red+Small
&description=High+quality+cotton+t-shirt
&url=https://www.mybrand.com/products/tshirt-red-small
&image_url=https://cdn.example.com/tshirt-red-front.jpg
&price=2999
&currency=USD
&availability=in+stock
&condition=new
&brand=My+Brand
&category=Clothing+%26+Accessories+%3E+Clothing+%3E+Shirts
```

> **Price format:** Integer in cents (USD 29.99 = `2999`).

### Batch Product Upload (Recommended for large catalogs)

Facebook recommends using the **Batch API** for uploading many products at once:

```
POST https://graph.facebook.com/v19.0/{catalogId}/items_batch
Content-Type: application/json
access_token: {accessToken}

{
  "allow_upsert": true,
  "requests": [
    {
      "method": "CREATE",
      "retailer_id": "TSH-RED-S",
      "data": {
        "id": "TSH-RED-S",
        "name": "Classic T-Shirt Red Small",
        "description": "High quality cotton t-shirt",
        "url": "https://www.mybrand.com/products/tshirt",
        "image_url": "https://cdn.example.com/tshirt.jpg",
        "price": "29.99 USD",
        "availability": "in stock",
        "condition": "new",
        "brand": "My Brand",
        "google_product_category": "Apparel & Accessories > Clothing > Shirts"
      }
    }
  ]
}
```

### Update Product Inventory

```
POST https://graph.facebook.com/v19.0/{catalogId}/items_batch

{
  "allow_upsert": true,
  "requests": [
    {
      "method": "UPDATE",
      "retailer_id": "TSH-RED-S",
      "data": {
        "availability": "in stock",
        "price": "24.99 USD"
      }
    }
  ]
}
```

---

## Mapping: Master Product → Facebook Catalog Item

```
MasterProduct               Facebook Catalog Item
──────────────────────────────────────────────────────
name             ──►        name
description      ──►        description
productUrl       ──►        url (deeplink to your site)
images[0]        ──►        image_url (main image)
images[1..n]     ──►        additional_image_urls
brand            ──►        brand
barcode          ──►        gtin (UPC/EAN/ISBN)
condition        ──►        condition

MasterVariant               Facebook Product Variant
──────────────────────────────────────────────────────
variantSku       ──►        retailer_id
price            ──►        price ("29.99 USD" format)
stockQuantity    ──►        availability ("in stock"/"out of stock"/"preorder")
color            ──►        color
size             ──►        size
```

---

## Channel-Specific Fields (Step 2 Form)

**Required:**
- `facebook_product_url` — URL to your product page (for Facebook Shopping)
- `facebook_google_product_category` — Google Product Taxonomy category

**Recommended:**
- `facebook_condition` — `new`, `refurbished`, `used`
- `facebook_age_group` — `newborn`, `infant`, `toddler`, `kids`, `adult`
- `facebook_gender` — `male`, `female`, `unisex`
- `facebook_material` — primary material

**Optional:**
- `facebook_sale_price` — discounted price
- `facebook_sale_price_effective_date` — sale period
- `facebook_custom_label_0..4` — custom segmentation labels

---

---

# WALMART MARKETPLACE

## Overview

Walmart Marketplace is one of the largest US ecommerce platforms. The API uses **OAuth 2.0 client credentials** flow — no user authorization needed. The `clientId` and `clientSecret` are your permanent seller credentials.

**Credential fields:** `clientId`, `clientSecret`

---

## Step 1: Apply to Sell on Walmart Marketplace

1. Go to `marketplace.walmart.com`
2. Click **Apply Now** → complete the seller application
3. After approval, go to **Seller Center** → **Settings** → **APIs**
4. Click **Production Keys**:
   - **Client ID** → `clientId`
   - **Client Secret** → `clientSecret`

> Walmart reviews sellers carefully. Approval can take 2-4 weeks.

---

## Step 2: Get Access Token (Client Credentials)

Walmart uses a simple client credentials OAuth flow:

```java
// WalmartAuthService.java
public String getAccessToken(String clientId, String clientSecret) throws Exception {
    String credentials = Base64.encode(clientId + ":" + clientSecret);

    HttpResponse<String> response = httpClient.send(
        HttpRequest.newBuilder()
            .uri(URI.create("https://marketplace.walmartapis.com/v3/token"))
            .header("Authorization", "Basic " + credentials)
            .header("WM_SVC.NAME", "Walmart Marketplace")
            .header("WM_QOS.CORRELATION_ID", UUID.randomUUID().toString())
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Accept", "application/json")
            .POST(BodyPublishers.ofString("grant_type=client_credentials"))
            .build(),
        BodyHandlers.ofString()
    );

    // Parse access_token from response
    // Token expires in 900 seconds (15 minutes)
    return parseAccessToken(response.body());
}
```

Response:
```json
{
  "access_token": "eyJraWQiOiJ...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

Token expires every **15 minutes** — the backend must re-generate before every batch of API calls.

---

## Step 3: Fill in ConnectStoreModal

| Field | Value |
|-------|-------|
| Channel Type | `Walmart` |
| Store Name | e.g., `My Brand Walmart US` |
| Store URL | `walmart.com/seller/mybrand` |
| Region | `US` |
| Client ID | from Seller Center |
| Client Secret | from Seller Center |

---

## Walmart API — Required Headers

Every Walmart API call requires specific headers:

```java
// WalmartApiClient.java
private Map<String, String> buildHeaders(String accessToken) {
    return Map.of(
        "Authorization",         "Bearer " + accessToken,
        "WM_SEC.ACCESS_TOKEN",   accessToken,
        "WM_SVC.NAME",           "Walmart Marketplace",
        "WM_QOS.CORRELATION_ID", UUID.randomUUID().toString(),
        "WM_SVC.VERSION",        "1.0.0",
        "Accept",                "application/json",
        "Content-Type",          "application/json"
    );
}
```

---

## Walmart API — Key Endpoints

Base URL: `https://marketplace.walmartapis.com/v3`

### Create/Update Item

```
POST https://marketplace.walmartapis.com/v3/items
Authorization: Bearer {accessToken}
WM_SVC.NAME: Walmart Marketplace
WM_QOS.CORRELATION_ID: {uuid}
Content-Type: application/json

{
  "MPItem": {
    "sku": "TSH-RED-S",
    "productIdentifiers": {
      "productIdentifier": [
        { "productIdType": "UPC", "productId": "012345678901" }
      ]
    },
    "productName": "Classic T-Shirt Red Small",
    "brand": "My Brand",
    "price": {
      "currency": "USD",
      "amount": 29.99
    },
    "ShippingWeight": { "value": 0.5, "unit": "LB" },
    "productCategory": "Clothing",
    "productSubCategory": "Shirts",
    "shortDescription": "High quality cotton t-shirt",
    "longDescription": "Full product description",
    "mainImageUrl": "https://cdn.example.com/tshirt-red-front.jpg",
    "additionalImageUrl": [
      "https://cdn.example.com/tshirt-red-back.jpg"
    ],
    "variantGroupId": "TSH-001-GROUP",
    "variantAttributeNames": ["color", "size"],
    "isPrimaryVariant": false,
    "color": "Red",
    "size": "Small"
  }
}
```

### Update Price

```
PUT https://marketplace.walmartapis.com/v3/price

{
  "sku": "TSH-RED-S",
  "pricing": [
    {
      "currentPriceType": "BASE",
      "currentPrice": {
        "currency": "USD",
        "amount": 24.99
      }
    }
  ]
}
```

### Update Inventory

```
PUT https://marketplace.walmartapis.com/v3/inventory?sku=TSH-RED-S

{
  "sku": "TSH-RED-S",
  "quantity": {
    "unit": "EACH",
    "amount": 50
  }
}
```

---

## Mapping: Master Product → Walmart Item

```
MasterProduct               Walmart MPItem
──────────────────────────────────────────────────────
name             ──►        productName
description      ──►        longDescription
brand            ──►        brand
barcode (UPC)    ──►        productIdentifiers.productId

MasterVariant               Walmart Item (per SKU)
──────────────────────────────────────────────────────
variantSku       ──►        sku
price            ──►        price.amount
stockQuantity    ──►        quantity.amount
color            ──►        color (variant attribute)
size             ──►        size (variant attribute)
weight           ──►        ShippingWeight.value
```

---

## Channel-Specific Fields (Step 2 Form)

**Required:**
- `walmart_product_category` — Walmart category (Clothing, Electronics, etc.)
- `walmart_short_description` — max 300 characters
- `walmart_upc` — UPC barcode (required for most categories)

**Recommended:**
- `walmart_shipping_weight_lb` — shipping weight in pounds
- `walmart_variant_group_id` — groups variants together
- `walmart_key_features` — bullet points (up to 5)

**Optional:**
- `walmart_prop65_warning` — California Prop 65 warning
- `walmart_fulfillment_lag_time` — days to ship (1-7)
- `walmart_site_description` — SEO-optimized long description

---

## Walmart-Specific Considerations

### 1. UPC is Required
Most Walmart categories require a valid UPC. If you don't have one, apply for exemption through Seller Center.

### 2. Variant Groups
Group related variants (same base product, different color/size) under a `variantGroupId`. The first variant submitted with `isPrimaryVariant: true` becomes the display listing.

### 3. Item Setup (Content Review)
Walmart reviews new items before they go live. The review process takes 24-48 hours. Items are in `PUBLISHED` status only after review passes.

### 4. 2-Day / Pro Seller Program
To qualify for Walmart's "2-Day Delivery" badge (which significantly boosts conversion), maintain high fulfillment SLAs.

---

## Troubleshooting

### Facebook Shop

| Error | Cause | Fix |
|-------|-------|-----|
| `OAuthException #190` | Expired token | Refresh or regenerate system user token |
| `OAuthException #200` | Missing permission | Re-authorize with `catalog_management` scope |
| `Invalid URL` | Product URL not crawlable | Ensure URL is publicly accessible |
| `Duplicate retailer_id` | SKU already exists | Use UPDATE instead of CREATE |

### Walmart

| Error | Cause | Fix |
|-------|-------|-----|
| `ERR-0041` | Invalid UPC | Verify barcode format |
| `ERR-0051` | Price below minimum | Walmart enforces price floors |
| `ERR-0014` | Token expired | Regenerate access token (15 min lifetime) |
| `DATA_ERROR` | Missing required attribute | Check required fields for product category |
| `ERR-0002` | Duplicate SKU | SKU already exists — use update endpoint |
