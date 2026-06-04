# API Reference — Channel Schema & Wrapper Demo

Base path for channel endpoints: `/labamap/api/v1/channels`
Base path for demo endpoints: `/labamap/api/v1/demo`

---

## GET `/channels`

Lists all channel configurations (system defaults + org-specific if `organizationId` is provided).

**Query params:**
```
organizationId=org_123    ← optional; if provided, returns org-specific configs
```

**Response:** `ChannelConfiguration[]`
```json
[
  {
    "channelId":     "shopify",
    "channelName":   "Shopify",
    "isActive":      true,
    "requiredFieldObjects": ["title", "body_html", "vendor"],
    "apiWrapperConfig": {
      "rootKey":        "product",
      "rootIsArray":    false,
      "nestedWrapperPath": null,
      "wrapArrays":     false
    }
  },
  {
    "channelId":     "amazon",
    "channelName":   "Amazon Seller Central",
    "isActive":      true,
    "requiredFieldObjects": ["SKU", "Title", "Brand", "StandardProductID"]
  }
]
```

---

## GET `/channels/{channelId}`

Returns a single channel configuration.

**Query params:**
```
organizationId=org_123    ← optional
```

---

## GET `/channels/{channelId}/schema`

Returns the channel's API schema, optionally merged with a category-specific extension.

**Query params:**
```
organizationId=org_123    ← optional
categoryId=electronics    ← optional; merges channel_category_api_schemas extension for this slug
```

When `categoryId` is provided and an active extension document exists in `channel_category_api_schemas` for `(channelId, categoryId)`, the response includes the merged schema (base + category extension). Without `categoryId`, returns the base schema unchanged — fully backward-compatible.

**Response includes `categorySlug`** when a category was applied:
```json
{
  "channelId":    "amazon",
  "categorySlug": "electronics",
  "targetSchema": {
    "Item.DescriptionData.Title":                       "",
    "Item.ProductType.Electronics.ModelNumber":         "",
    "Item.ProductType.Electronics.Connectivity":        "",
    "Item.ProductType.Electronics.BatteriesRequired":   false
  },
  "fieldCount": 42
}
```

---

## GET `/channels/{channelId}/schema/complex`

Returns the channel's target schema in one of three formats. Used by the Step 3 frontend to build the `AdaptivePatternMatchingRequest.targetSchema`.

**Query params:**
```
format=flat|nested|flattened-paths    ← default: nested
organizationId=org_123                ← optional
```

**Response for `format=flattened-paths`:**
```json
{
  "channelId": "shopify",
  "format":    "flattened-paths",
  "schema": {
    "product.title":                   "",
    "product.body_html":               "",
    "product.vendor":                  "",
    "product.variants[0].price":       "",
    "product.variants[0].sku":         "",
    "product.variants[0].inventory_quantity": 0
  }
}
```

**Response for `format=nested`:**
```json
{
  "channelId": "shopify",
  "format":    "nested",
  "schema": {
    "product": {
      "title":    { "type": "string", "required": true },
      "body_html": { "type": "string" },
      "vendor":   { "type": "string", "required": true },
      "variants": [
        {
          "price": { "type": "string", "required": true },
          "sku":   { "type": "string" }
        }
      ]
    }
  }
}
```

**Three schema formats:**

| Format | Purpose |
|--------|---------|
| `flat` | Simple key-value, no nesting — for basic products |
| `nested` | Real API structure — used for understanding the channel payload shape |
| `flattened-paths` | Dot-notation paths from nested schema — used by `SchemaFlattenerService` and `AdaptivePatternMatchingRequest.targetSchema` |

---

## GET `/channels/{channelId}/schema/database`

Returns the channel's schema derived from the attribute database (master attributes, channel configurations). Different from `schema/complex` which uses channel API specs.

**Query params:**
```
category=clothing         ← optional; filter by product category
format=flat               ← default: flat
```

---

## GET `/channels/{channelId}/schema/database/info`

Returns metadata about the database-derived schema (field counts, categories, last updated).

**Query params:**
```
category=clothing    ← optional
```

---

## GET `/channels/{channelId}/schema/database/attributes`

Returns the list of channel attributes from the database for a given channel.

**Query params:**
```
category=clothing    ← optional
```

---

## GET `/channels/validate/{channelId}`

Validates whether a channel configuration is complete and usable for publishing.

---

## GET `/channels/stats`

Returns aggregated statistics across all channel configurations (total channels, active/inactive, required fields counts, etc.).

---

## POST `/demo/wrap/{channelId}`

Tests the payload wrapping for a channel. Does not publish.

**Request body:** Any flat JSON object.
```json
{
  "title":  "Test Product",
  "price":  "19.99",
  "vendor": "MyBrand"
}
```

**Response:**
```json
{
  "channel":      "shopify",
  "wrapperInfo":  "Simple wrapper: product",
  "wrappedPayload": {
    "product": {
      "title":  "Test Product",
      "price":  "19.99",
      "vendor": "MyBrand"
    }
  }
}
```

---

## GET `/demo/wrapper-info/{channelId}`

Returns the `ApiWrapperConfig` for a channel — root key, nesting structure, whether arrays are wrapped.

**Response:**
```json
{
  "channelId": "shopify",
  "wrapperConfig": {
    "rootKey":           "product",
    "rootIsArray":       false,
    "nestedWrapperPath": null,
    "wrapArrays":        false
  }
}
```

---

## POST `/demo/compare-wrappers`

Applies the same payload to all channels and shows how each wraps it differently. Useful for understanding per-channel payload structure differences.

**Request body:** Any flat JSON object.
```json
{ "title": "Test", "price": "9.99" }
```

**Response:** A map of `channelId → wrappedPayload` for all configured channels.

---

## POST `/demo/simulate-publish/{channelId}`

Simulates a full publish transformation (JOLT + wrapper apply) without calling the channel API. Returns the transformed, wrapped payload.

**Request body:** Master product data (source product fields).
```json
{
  "name":  "Red T-Shirt",
  "price": 29.99,
  "color": "red",
  "brand": "MyBrand"
}
```

**Response:** The channel-formatted output after JOLT transformation and payload wrapping.

---

## apiSchema — Base Schema + Category Extensions

`ChannelConfiguration.apiSchema` (`Map<String, Object>`) is the base target schema for APM. It covers universal product fields (title, price, images, variants). Channels whose schema varies by category have additional extensions in a **separate collection** `channel_category_api_schemas`.

### Schema coverage by channel

| Channel | Base schema sufficient? | Reason |
|---------|------------------------|--------|
| Shopify | Yes | Uniform `product.*` structure for all categories |
| WIX | Yes | Uniform structure for all physical products |
| Amazon | No — needs extensions | SP-API has category-specific product type definitions (`Electronics`, `Clothing`, `Food`, etc.) |
| eBay | No — needs extensions | Item Specifics are category-driven (`Processor`, `RAM` for Electronics; `Size`, `Material` for Clothing) |
| Walmart | No — needs extensions | Category attribute groups differ per category |
| TikTok Shop | Partially handled | `product_attributes[]` extension point in base schema; category-specific attribute IDs from category API cache |

### `channel_category_api_schemas` collection

One document per `(channelType × categorySlug)`. Each document holds an `apiSchemaExtension` map that is merged on top of the base `apiSchema` at APM time. Only one document is active per pair at a time (`isActive=true`).

**Seeded channels and categories** (`ChannelCategoryApiSchemaDataLoader` @Order 115):

| Channel | Categories seeded |
|---------|-------------------|
| Amazon | electronics, clothing, food, health, sports, home-garden, toys, books |
| eBay | electronics, clothing, home-garden, sports, motors |
| Walmart | electronics, clothing, food |

**Merge happens in `ChannelSchemaService.generateComplexTargetSchema(channelId, categorySlug)`:**
```
base apiSchema (from channel_configurations)
    +
apiSchemaExtension (from channel_category_api_schemas, active doc for that pair)
    ↓
merged target schema passed to APM
```

If no extension exists (e.g. Shopify, WIX, or unknown category), `switchIfEmpty` returns the base schema unchanged.

### Admin API for runtime schema management

No code change or redeploy needed to update category schemas:

| Method | Endpoint | Action |
|--------|----------|--------|
| `GET` | `/api/v1/admin/channel-category-schemas?channelType=amazon` | List all docs (active + inactive) |
| `GET` | `/api/v1/admin/channel-category-schemas/active?channelType=amazon&categorySlug=electronics` | Get active doc |
| `POST` | `/api/v1/admin/channel-category-schemas` | Create new doc (auto-deactivates existing active) |
| `PUT` | `/api/v1/admin/channel-category-schemas/{id}` | Update extension + bump version |
| `PUT` | `/api/v1/admin/channel-category-schemas/{id}/deactivate` | Soft-delete (isActive=false) |
| `PUT` | `/api/v1/admin/channel-category-schemas/{id}/activate` | Re-activate (rollback) |

See full design rationale in `docs/product/02-ecommerce-wizard/01-guides/17-apischema-per-channel-per-category.md`.
