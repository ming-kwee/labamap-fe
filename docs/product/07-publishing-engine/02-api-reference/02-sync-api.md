# API Reference — Sync API

## Endpoint

```
POST http://localhost:9000/sync_channel_product_impl
Content-Type: application/json
```

This is an internal service boundary — our backend calls the sync API; external clients do not call it directly.

---

## SyncChannelProductRequest

Flat structure. **No** `channelProducts` wrapper.

```json
{
  "id":      "550e8400-e29b-41d4-a716-446655440000",
  "eventId": "pub_1746000000000_shopify_prod_abc123",

  "channelAttributes": [
    {
      "attrId":        "id",
      "chnlAttrName":  "id",
      "chnlAttrValue": "550e8400-e29b-41d4-a716-446655440000",
      "chnlAttrType":  "string",
      "isCommonField": true,
      "isSupportField": true
    },
    {
      "attrId":        "product_name",
      "chnlAttrName":  "product.title",
      "chnlAttrValue": "Wireless Earbuds Pro",
      "chnlAttrType":  "string",
      "isCommonField": false,
      "isSupportField": false
    },
    {
      "attrId":        "product_images",
      "chnlAttrName":  "product.images",
      "chnlAttrValue": "[{\"src\":\"https://cdn.example.com/img.jpg\"}]",
      "chnlAttrType":  "object[]",
      "isCommonField": false,
      "isSupportField": false
    }
  ],

  "variantGroups": [
    {
      "channelVariant": [
        {
          "vrntId":        "channel_variant_price",
          "chnlVrntName":  "product.variants.price",
          "chnlVrntValue": "29.99",
          "chnlVrntType":  "string",
          "isSupportField": false
        },
        {
          "vrntId":        "color",
          "chnlVrntName":  "product.variants.option1",
          "chnlVrntValue": "Black",
          "chnlVrntType":  "string",
          "isSupportField": false
        },
        {
          "vrntId":        "channel_variant_sku",
          "chnlVrntName":  "product.variants.sku",
          "chnlVrntValue": "WE-PRO-001-BLK",
          "chnlVrntType":  "string",
          "isSupportField": false
        },
        {
          "vrntId":        "passthrough_inventory_policy",
          "chnlVrntName":  "product.variants.inventory_policy",
          "chnlVrntValue": "deny",
          "chnlVrntType":  "TEXT",
          "isSupportField": false
        }
      ]
    }
  ],

  "optionGroups": [
    {
      "channelOption": [
        {
          "optnId":       "option_name",
          "chnlOptnName": "product.options.name",
          "chnlOptnType": "string",
          "chnlOptnValue": "Color",
          "isSupportField": false
        },
        {
          "optnId":       "option_values",
          "chnlOptnName": "product.options.values",
          "chnlOptnType": "array",
          "chnlOptnValue": "[\"Black\",\"White\"]",
          "isSupportField": false
        }
      ]
    }
  ],

  "metadataGroups": [
    {
      "channelMetadata": [
        {
          "channelId":   "shopify",
          "key":         "workflow_step",
          "value":       "create_product",
          "grouping":    "workflow",
          "subGrouping": "product",
          "target":      "shopify_api"
        },
        {
          "channelId":   "shopify",
          "key":         "api_version",
          "value":       "2024-01",
          "grouping":    "config",
          "subGrouping": null,
          "target":      "shopify_api"
        }
      ]
    }
  ],

  "channelCredentials": [
    {
      "credId":       "auth_token",
      "chnlCredName": "token",
      "chnlCredValue": "shpat_..."
    }
  ]
}
```

---

## Field Definitions

### Top-level

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (UUID) | Unique sync request ID, generated per-call |
| `eventId` | String | Our `publishId` — `pub_{timestamp}_{channelId}_{masterProductId}` |

### ChannelAttribute

| Field | Type | Description |
|-------|------|-------------|
| `attrId` | String | Semantic identifier from `attributeMappings.productFields[key].attrId` |
| `chnlAttrName` | String | Dot-notation path in the channel's schema (e.g. `product.title`) |
| `chnlAttrValue` | String | Always String. Complex values (arrays, objects) are JSON-serialized |
| `chnlAttrType` | String | Hint: `string`, `number`, `boolean`, `object`, `object[]`, `array` |
| `isCommonField` | Boolean | True for system-level routing fields |
| `isSupportField` | Boolean | True for fields that support sync but are not channel product attributes |

### ChannelVariant

| Field | Type | Description |
|-------|------|-------------|
| `vrntId` | String | `attributeMappings.variantFields[key].vrntId`, or `"passthrough_{fieldName}"` for unmapped fields |
| `chnlVrntName` | String | Dot-notation path (e.g. `product.variants.price`) |
| `chnlVrntValue` | String | Always String |
| `chnlVrntType` | String | `string`, `NUMBER`, `BOOLEAN`, `TEXT`, or custom |
| `isSupportField` | Boolean | |

### ChannelOption

| Field | Type | Description |
|-------|------|-------------|
| `optnId` | String | From `attributeMappings.optionFields[key].optnId` |
| `chnlOptnName` | String | Dot-notation path (e.g. `product.options.name`) |
| `chnlOptnType` | String | `string`, `array` |
| `chnlOptnValue` | String | Always String; arrays are JSON-serialized |
| `isSupportField` | Boolean | |

### ChannelMetadata

| Field | Type | Description |
|-------|------|-------------|
| `channelId` | String | Channel this metadata belongs to |
| `key` | String | Workflow instruction key |
| `value` | String | Can be a JSON string for complex workflow data |
| `grouping` | String | Routing category (e.g. `"workflow"`, `"config"`) |
| `subGrouping` | String | Optional sub-category (nullable) |
| `target` | String | Target service (e.g. `"shopify_api"`) |

### ChannelCredential

| Field | Type | Description |
|-------|------|-------------|
| `credId` | String | `"auth_token"`, `"auth_site_id"`, or `"auth_{keyName}"` |
| `chnlCredName` | String | Credential name expected by the sync API (`"token"`, `"wix-site-id"`) |
| `chnlCredValue` | String | Decrypted credential value |

---

## SyncApiResponse

```json
{
  "success":          true,
  "message":          "Product published successfully",
  "channelProductId": "8234567890123",
  "eventId":          "pub_1746000000000_shopify_prod_abc123",
  "status":           "COMPLETED",
  "data":             { ... },
  "warnings":         [],
  "errors":           [],
  "metadata":         { ... }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | Boolean | Overall result |
| `message` | String | Human-readable summary |
| `channelProductId` | String | Product ID assigned by the channel (e.g. Shopify product ID) |
| `eventId` | String | Echoed `eventId` from the request |
| `status` | String | `"COMPLETED"`, `"PENDING"`, `"FAILED"` |
| `data` | Map | Channel-specific response details |
| `warnings` | String[] | Non-critical issues |
| `errors` | SyncError[] | Critical errors |
| `metadata` | Map | Sync service metadata |

**SyncError:**

```json
{
  "code":    "FIELD_TOO_LONG",
  "message": "Product title exceeds 255 characters",
  "field":   "title",
  "details": "Reduce to 255 characters or fewer"
}
```

`errors[].details` maps to `PublishError.suggestion` in `PublishProductResponse`.

---

## attributeMappings Collection Schema

Stored in `channel_configurations.attributeMappings`. Populated by `ChannelAttributeMappingsMigration` (@Order 101).

```json
{
  "commonFields": [
    {
      "attrId":        "id",
      "chnlAttrName":  "id",
      "sourceMapping": "uuid",
      "chnlAttrType":  "string",
      "isCommonField": true,
      "isSupportField": true,
      "defaultValue":  null
    },
    {
      "attrId":        "product_id",
      "chnlAttrName":  "product.id",
      "sourceMapping": "masterProductId",
      "chnlAttrType":  "string",
      "isCommonField": true,
      "isSupportField": false,
      "defaultValue":  null
    }
  ],

  "productFields": {
    "product@title": {
      "attrId":        "product_name",
      "chnlAttrType":  "string",
      "isCommonField": false,
      "isSupportField": false
    },
    "product@body_html": {
      "attrId":        "description",
      "chnlAttrType":  "string",
      "isCommonField": false,
      "isSupportField": true
    },
    "product@vendor":       { "attrId": "product_vendor",   "chnlAttrType": "string" },
    "product@product_type": { "attrId": "product_type",     "chnlAttrType": "string" },
    "product@status":       { "attrId": "product_status",   "chnlAttrType": "string" },
    "product@images":       { "attrId": "product_images",   "chnlAttrType": "object[]" }
  },

  "variantFields": {
    "product@variants@price":   { "vrntId": "channel_variant_price",   "chnlVrntType": "string", "isSupportField": false },
    "product@variants@option1": { "vrntId": "color",                   "chnlVrntType": "string", "isSupportField": false },
    "product@variants@option2": { "vrntId": "size",                    "chnlVrntType": "string", "isSupportField": false },
    "product@variants@sku":     { "vrntId": "channel_variant_sku",     "chnlVrntType": "string", "isSupportField": false },
    "product@variants@variantImages": { "vrntId": "channel_variant_images", "chnlVrntType": "object[]", "isSupportField": true }
  },

  "optionFields": {
    "product@options@name":   { "optnId": "option_name",   "chnlOptnType": "string", "isSupportField": false },
    "product@options@values": { "optnId": "option_values", "chnlOptnType": "array",  "isSupportField": false }
  }
}
```

**Key:** `product@variants@variantImages` — note `variantImages` not `images`. This matches the JOLT output field name. The old `product@variants@images` key from an early migration would cause a lookup miss; it was corrected in the bug fix tracked in memory (`VariantImageAttributeMappingMigration` @Order 102).

**CommonFieldMapping.sourceMapping** special values: `"uuid"` generates a new UUID; all other values are treated as a key into `masterProductData` (or a named field on the request object — see `buildChannelAttributes` in the attribute-conversion guide).
