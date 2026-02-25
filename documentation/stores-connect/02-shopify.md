# 02 — Shopify Integration

## Overview

Shopify is the most common channel for direct-to-consumer brands. The integration uses the **Admin API** (REST or GraphQL) with a **Custom App** access token. The token is static — it never expires unless you rotate it manually.

**Credential fields required:**
- `accessToken` — the Admin API access token
- `apiKey` — the custom app's API key
- `apiSecret` — the custom app's API secret key

---

## Step 1: Create a Shopify Custom App

A **Custom App** is the correct approach for direct store access (as opposed to a Public App on the Shopify App Store).

### Steps in Shopify Admin

1. Log into your Shopify store admin: `https://{your-store}.myshopify.com/admin`
2. Go to **Settings** → **Apps and sales channels** → **Develop apps**
3. Click **Allow custom app development** (first-time only)
4. Click **Create an app**
   - App name: e.g., `Labamap Omnichannel`
   - App developer: your email
5. Click **Configure Admin API scopes**

### Required API Scopes

Select the following permissions for product management:

```
Products:
  ✓ write_products        — create/update products
  ✓ read_products         — read product data

Inventory:
  ✓ write_inventory       — adjust inventory levels
  ✓ read_inventory        — read stock levels

Orders (optional for omnichannel):
  ✓ read_orders
  ✓ write_orders

Fulfillment (optional):
  ✓ write_assigned_fulfillment_orders
  ✓ read_assigned_fulfillment_orders

Locations:
  ✓ read_locations        — needed for multi-location inventory
```

6. Click **Save** → then **Install app**
7. After installing, go to the **API credentials** tab
8. Copy:
   - **API key** → paste into `apiKey`
   - **API secret key** → paste into `apiSecret`
   - Click **Reveal token once** → copy **Admin API access token** → paste into `accessToken`

> ⚠️ **The access token is shown only once.** If you miss it, you must uninstall and reinstall the app to generate a new one.

---

## Step 2: Get Your Store URL

Your `storeUrl` is your Shopify domain in the format:

```
your-store-name.myshopify.com
```

Do NOT include `https://` — just the domain.

---

## Step 3: Fill in ConnectStoreModal

| Field | Value |
|-------|-------|
| Channel Type | `Shopify` |
| Store Name | e.g., `My Brand US Store` |
| Store URL | `my-brand.myshopify.com` |
| Region | `US` (optional, for labelling) |
| Access Token | `shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| API Key | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| API Secret | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

---

## Step 4: Verifying the Connection (Backend)

After saving, the backend can ping Shopify to validate credentials:

```java
// ChannelValidatorService.java — Shopify validation
public void validateShopify(String storeUrl, String accessToken) throws ChannelConnectionException {
    String url = "https://" + storeUrl + "/admin/api/2024-01/shop.json";

    HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create(url))
        .header("X-Shopify-Access-Token", accessToken)
        .header("Content-Type", "application/json")
        .GET()
        .build();

    HttpResponse<String> response = httpClient.send(request, BodyHandlers.ofString());

    if (response.statusCode() == 401) {
        throw new ChannelConnectionException("Invalid Shopify access token");
    }
    if (response.statusCode() != 200) {
        throw new ChannelConnectionException("Shopify API error: " + response.statusCode());
    }
    // Parse shop name from response for confirmation
}
```

---

## Shopify Admin API — Key Endpoints for Product Sync

Once connected, the backend uses these endpoints:

### Create a Product

```
POST https://{store}.myshopify.com/admin/api/2024-01/products.json
X-Shopify-Access-Token: {accessToken}
Content-Type: application/json

{
  "product": {
    "title": "T-Shirt Classic",
    "body_html": "<p>Product description</p>",
    "vendor": "My Brand",
    "product_type": "Apparel",
    "status": "draft",
    "variants": [
      {
        "option1": "Red / S",
        "price": "29.99",
        "sku": "TSH-RED-S",
        "inventory_management": "shopify",
        "inventory_quantity": 50
      }
    ],
    "options": [
      { "name": "Color / Size" }
    ],
    "images": [
      { "src": "https://cdn.example.com/product.jpg" }
    ]
  }
}
```

### Update a Product

```
PUT https://{store}.myshopify.com/admin/api/2024-01/products/{shopify_product_id}.json
```

### Set Inventory Level

```
POST https://{store}.myshopify.com/admin/api/2024-01/inventory_levels/set.json

{
  "location_id": 123456789,
  "inventory_item_id": 987654321,
  "available": 50
}
```

---

## Mapping: Master Product → Shopify Product

```
MasterProduct                    Shopify Product
─────────────────────────────────────────────────
name                    ──►     title
description             ──►     body_html
sku (base)              ──►     product.handle (auto-generated)
brand                   ──►     vendor
categoryName            ──►     product_type
channelData.tags        ──►     tags (comma-separated)

MasterVariant                    Shopify Variant
─────────────────────────────────────────────────
variantSku              ──►     sku
price                   ──►     price
stockQuantity           ──►     inventory_quantity
variantLabel            ──►     option1 (e.g. "Red / Large")
barcode                 ──►     barcode
weight                  ──►     weight
```

---

## Channel-Specific Fields (Step 2 Form)

These are the fields the backend should include in the Step 2 schema for Shopify:

**Required:**
- `shopify_product_type` — Shopify's product_type taxonomy
- `shopify_vendor` — seller/brand name in Shopify
- `shopify_tags` — comma-separated Shopify tags

**Recommended:**
- `shopify_handle` — URL slug (auto-generated from title but can override)
- `shopify_seo_title` — overrides `<title>` tag
- `shopify_seo_description` — overrides meta description
- `shopify_collections` — comma-separated collection handles

**Optional:**
- `shopify_template_suffix` — alternate product page template
- `shopify_published_scope` — `"web"` or `"global"`

---

## Webhooks (Optional but Recommended)

Register webhooks to receive real-time updates from Shopify:

```
POST https://{store}.myshopify.com/admin/api/2024-01/webhooks.json

{
  "webhook": {
    "topic": "products/update",
    "address": "https://your-backend.com/api/v1/webhooks/shopify/products",
    "format": "json"
  }
}
```

Key topics:
- `products/create` — track products created directly in Shopify admin
- `products/update` — sync price/stock changes
- `inventory_levels/update` — real-time inventory sync
- `orders/create` — new order notification

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Invalid or expired access token | Re-install custom app, get new token |
| `422 Unprocessable Entity` | Invalid variant/option structure | Check variant option format |
| `429 Too Many Requests` | Rate limit exceeded | Add 500ms delay between API calls |
| `404 Not Found` | Wrong store URL format | Ensure URL is `store.myshopify.com` (no `https://`) |
| `ACCESS_DENIED` | Missing API scope | Add the required scope in Partners dashboard |

---

## Rate Limits

Shopify uses a **leaky bucket** algorithm:
- REST API: 40 requests / 2 seconds per token (refills at 2/second)
- GraphQL API: 1000 cost points / second

Always check the `X-Shopify-Shop-Api-Call-Limit` response header.

---

## Multiple Shopify Stores

You can connect multiple Shopify stores (e.g., different countries) by repeating this process for each store. Each will have its own `storeId` in our system with a different `storeUrl`.

Example:
```
Store 1: my-brand-us.myshopify.com   (region: US)
Store 2: my-brand-eu.myshopify.com   (region: EU)
Store 3: my-brand-au.myshopify.com   (region: AU)
```
