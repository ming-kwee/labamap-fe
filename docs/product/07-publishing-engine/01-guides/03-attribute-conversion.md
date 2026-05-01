# Attribute Conversion

## Purpose

`ChannelAttributeConverterService` bridges the gap between the JOLT-transformed `Map<String, Object>` and the strongly-typed `SyncChannelProductRequest` that the sync API expects.

It reads attribute mapping configuration from `ChannelConfiguration.attributeMappings` (stored in MongoDB) to know which fields to emit, under which names, and in which groups.

---

## Conversion Flow

```
convertToSyncRequest(wrappedData, request, channelConfig, publishId)
  1. extractDimensionOrder(request, wrappedData)
  2. buildChannelAttributes(wrappedData, request, channelConfig)
  3. buildVariantGroups(wrappedData, channelConfig, dimensionOrder)
  4. buildOptionGroups(wrappedData, channelConfig)
  5. buildMetadataGroups(channelConfig)
  6. buildChannelCredentials(request, channelConfig)
```

`id` is set to a freshly generated `UUID.randomUUID().toString()`.  
`eventId` is set to `publishId` (format: `pub_{timestamp}_{channelId}_{masterProductId}`).

---

## The @ Separator

MongoDB does not allow `.` (dot) in map keys. Attribute mapping keys therefore use `@` as a path separator:

| MongoDB key | Runtime path | Meaning |
|-------------|--------------|---------|
| `product@title` | `product.title` | product object, title field |
| `product@variants@price` | `product.variants.price` | variant price |
| `product@options@name` | `product.options.name` | option name |
| `product@productOptions@name` | `product.productOptions.name` | WIX option name |

Conversion at runtime: `chnlAttrName.replace("@", ".")`.

The converted path is what appears as `chnlAttrName`/`chnlVrntName`/`chnlOptnName` in the sync request — the sync API receives dot-notation paths, not `@` separators.

---

## Dimension Order (Phase 5)

When the master product belongs to a `ProductType`, variant axis order matters. Channels like Shopify map `option1` to the first variant dimension and `option2` to the second.

`ChannelPublishService.injectProductTypeVariantDimensions()` resolves this before JOLT runs:

```
masterProductData.categoryId
  → ProductCategory.productTypeId
  → ProductType.variantDimensions[]
  → sorted by VariantDimension.order
  → injected as _productTypeVariantDimensions: [{attributeCode, attributeName, order, required}]
     and _productTypeName: String
  → fire-and-forget on error
```

`extractDimensionOrder()` in `ChannelAttributeConverterService` reads `_productTypeVariantDimensions` from `request.masterProductData` first, then from `transformedData` as fallback. It returns the list sorted by `order` ascending (1 = primary axis first).

When `dimensionOrder` is non-empty, `buildVariantGroups()` sorts the pre-registered variant field entries so that axis fields (`option1`, `option2`) appear in the correct order per-variant in the sync request.

---

## buildChannelAttributes

Reads `channelConfig.attributeMappings.commonFields` (List) then `channelConfig.attributeMappings.productFields` (Map).

**Common fields** — system-level identifiers with a `sourceMapping` enum:

| `sourceMapping` | Value source |
|----------------|--------------|
| `"masterProductId"` | `request.masterProductId` |
| `"channelId"` | `request.channelId` |
| `"storeId"` | `request.publishOptions.customOptions["storeId"]` |
| `"organizationId"` | `request.organizationId` |
| `"userId"` | `request.userId` |
| other string | `request.masterProductData[sourceMapping]` |

Falls back to `CommonFieldMapping.defaultValue` when the source produces null.

**Product fields** — reads `attributeMappings.productFields` (Map keyed by `@`-separated path). For each entry:
1. Convert key to dot-notation path: `product@title` → `product.title`
2. Strip `product.` prefix (productData is already extracted from `transformedData["product"]`)
3. Look up value using dot-notation traversal
4. Skip null values

Emits `ChannelAttribute` with: `attrId`, `chnlAttrName` (dot-notation), `chnlAttrValue`, `chnlAttrType`, `isCommonField`, `isSupportField`.

---

## buildVariantGroups

Each variant in `productData["variants"]` produces one `VariantGroup` containing a list of `ChannelVariant`.

**Pass 1 — pre-registered variant field mappings:**

Reads `channelConfig.attributeMappings.variantFields` (Map keyed by `@`-separated path).

When `dimensionOrder` is non-empty, entries are sorted so that axis fields (whose `vrntId` appears in `dimensionOrder`) come first in the correct order. Support fields (price, sku, barcode) are unaffected and follow after.

Field name is extracted from the path's last segment (`product.variants.price` → `price`). The key is tracked in `processedFieldNames` regardless of whether a value was found.

Complex field values (`List` or `Map`) are JSON-serialized to String.

**Pass 2 — passthrough for unmapped fields:**

Any variant field NOT in `processedFieldNames` is emitted as a passthrough entry:
- `vrntId` = `"passthrough_{fieldName}"`
- `chnlVrntName` = `"product.variants.{fieldName}"`
- `chnlVrntType` derived from Java type: `NUMBER`, `BOOLEAN`, or `TEXT`

This ensures channel-specific fields injected by the post-JOLT variant override step (`barcode`, `inventory_policy`, etc.) always reach the sync API even when absent from the database attribute mapping.

---

## buildOptionGroups

Reads `channelConfig.attributeMappings.optionFields` (Map keyed by `@`-separated path).

The **options key** (the array name inside `productData`) is derived from the first option field's path:
- `product@options@name` → segments[1] = `"options"` (Shopify default)
- `product@productOptions@name` → segments[1] = `"productOptions"` (WIX)

Each element in `productData[optionsKey]` produces one `OptionGroup` containing `ChannelOption` entries. Array-valued option fields (like `values`) are JSON-serialized.

---

## buildMetadataGroups

Reads `channelConfig.channelMetadataList` directly — metadata is entirely static, loaded from the channel configuration document.

A single `MetadataGroup` is created containing all items as `ChannelMetadata`:
- `channelId` — the channel's ID
- `key` — workflow instruction key
- `value` — can be a complex JSON string
- `grouping`, `subGrouping`, `target` — routing hints for the sync API

The `ChannelConfigurationDataLoader` (@Order 5) seeds these on startup. Shopify has 5 metadata items describing its multi-step API workflow (create product, add variants, upload images, link choices, etc.).

---

## buildChannelCredentials

Reads from `request.publishOptions.customOptions` (set by `injectDecryptedCredentials` in the store-aware flow):

```
customOptions["credentials"]  → Map<String, Object>: emit all as ChannelCredential
customOptions["token"]        → emit as credId="auth_token", chnlCredName="token"
customOptions["wix-site-id"]  → emit as credId="auth_site_id", chnlCredName="wix-site-id"
customOptions["site-id"]      → same as wix-site-id (alias)
```

If no credentials are found in `customOptions`, a hardcoded fallback fires (logged as a warning). **This fallback is for development only and must be removed before production.**

---

## attributeMappings Collection Schema

Stored in `channel_configurations.attributeMappings`:

```json
{
  "commonFields": [
    {
      "attrId": "id",
      "chnlAttrName": "id",
      "sourceMapping": "uuid",
      "chnlAttrType": "string",
      "isCommonField": true,
      "isSupportField": true,
      "defaultValue": null
    }
  ],
  "productFields": {
    "product@title": {
      "attrId": "product_name",
      "chnlAttrType": "string",
      "isCommonField": false,
      "isSupportField": false
    },
    "product@body_html": {
      "attrId": "description",
      "chnlAttrType": "string",
      "isCommonField": false,
      "isSupportField": true
    }
  },
  "variantFields": {
    "product@variants@price": {
      "vrntId": "channel_variant_price",
      "chnlVrntType": "string",
      "isSupportField": false
    },
    "product@variants@option1": {
      "vrntId": "color",
      "chnlVrntType": "string",
      "isSupportField": false
    },
    "product@variants@sku": {
      "vrntId": "channel_variant_sku",
      "chnlVrntType": "string",
      "isSupportField": false
    }
  },
  "optionFields": {
    "product@options@name": {
      "optnId": "option_name",
      "chnlOptnType": "string",
      "isSupportField": false
    },
    "product@options@values": {
      "optnId": "option_values",
      "chnlOptnType": "array",
      "isSupportField": false
    }
  }
}
```

**Migration:** `ChannelAttributeMappingsMigration` (@Order 101) seeds attributeMappings for all channels using a MERGE approach — it adds missing fields without overwriting existing ones. Uses `.block()` (required in `CommandLineRunner`).

**Key historical fix:** Bug where @Order 9 created partial attributeMappings before Order 101 ran, causing Order 101 to skip → missing price/sku/option1/option2 → "invalid variant" errors. Fixed by changing Order 9 → 102 and making Order 101 MERGE instead of skip.
