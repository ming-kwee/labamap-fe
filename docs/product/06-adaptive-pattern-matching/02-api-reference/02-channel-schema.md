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

Returns the channel's API schema.

**Query params:**
```
organizationId=org_123    ← optional
format=flat|nested        ← default: nested
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

## apiSchema — Current State and Category Gap

`ChannelConfiguration.apiSchema` (`Map<String, Object>`) is the target schema used by APM when building `AdaptivePatternMatchingRequest.targetSchema`. It is seeded by `ChannelConfigurationDataLoader` and returned by `GET /channels/{channelId}/schema/complex`.

### Channels where a single schema is correct

| Channel | Reason |
|---------|--------|
| Shopify | Product structure is uniform — `product.title`, `product.variants[]`, `product.options[]` apply to all categories |
| WIX | Same uniform structure — `name`, `priceData`, `productOptions[]` apply to all categories |

### Channels where a single schema is an oversimplification

| Channel | Problem |
|---------|---------|
| Amazon | Seeded schema covers `Item.DescriptionData.*` and `Item.StandardProductID` only. Category-specific attributes (`ClothingSize`, `Color`, `ModelNumber`, `BatteryType`, etc.) are missing entirely. APM cannot suggest mappings for these fields because they are absent from the target schema. |
| eBay | Similar — category determines which item specifics are required (`Brand`, `Type`, `Compatible With`). None are in the current schema. |
| Walmart | Category determines required feed fields (`color`, `size`, `material`). Not present in current schema. |
| TikTok Shop | Partially handled — schema includes `product_attributes[]` with a comment noting category-specificity. The stub is correct in shape but values are static placeholders. |

### Planned fix: `categoryApiSchemas`

Add `categoryApiSchemas: Map<String, Map<String, Object>>` to `ChannelConfiguration`. At APM request time, merge the category-specific schema on top of the base `apiSchema` before passing to `AdaptivePatternMatchingRequest.targetSchema`:

```
targetSchema = merge(channelConfig.apiSchema, channelConfig.categoryApiSchemas[categoryId])
```

Seeding: extend `ChannelConfigurationDataLoader` with per-category schema maps for Amazon, eBay, Walmart. TikTok's `product_attributes[]` stub should be replaced with category-keyed entries.

**Files to change:**
- `ChannelConfiguration.java` — add `categoryApiSchemas` field
- `ChannelConfigurationDataLoader.java` — seed category schemas for Amazon/eBay/Walmart/TikTok
- `ChannelSchemaService.java` (or wherever `schema/complex` is built) — merge category schema when `categoryId` query param is present
- APM request builder — pass `categoryId` through to schema fetch

**Query param extension:**

`GET /channels/{channelId}/schema/complex?format=nested&categoryId=clothing` returns the base schema merged with `categoryApiSchemas["clothing"]`. No `categoryId` → returns base schema unchanged (backward-compatible).

See full planning context in `docs/product/02-ecommerce-wizard/01-guides/11-step2-category-required-fields.md` → `apiSchema` section.
